import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/admin/finanzas/conciliacion/auto
 * Auto-conciliación masiva de facturas recibidas con movimientos bancarios.
 * 
 * Reglas de matching (por prioridad):
 * 1. Nº factura en concepto bancario + fecha posterior
 * 2. Importe exacto + mismo tercero (extraído de concepto) + fecha posterior
 * 3. Importe exacto + fecha posterior + fecha_vencimiento cercana al pago
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const resultados = {
      porNumFactura: 0,
      porImporteTercero: 0,
      porImporteFechaVencimiento: 0,
      totalConciliados: 0,
      detalles: [] as any[],
      entidadesAsignadas: 0,
    };

    // === PASO 0: Asignar entidad_fiscal_id a movimientos usando destinatario de transferencias ===
    await asignarEntidadesPorConcepto(resultados);

    // === PASO 1: Match por nº factura en concepto ===
    await matchPorNumFactura(resultados, dryRun);

    // === PASO 2: Match por importe exacto + tercero + fecha posterior ===
    await matchPorImporteTercero(resultados, dryRun);

    // === PASO 3: Match por importe exacto + fecha_vencimiento cercana ===
    await matchPorImporteFechaVencimiento(resultados, dryRun);

    resultados.totalConciliados = resultados.porNumFactura + resultados.porImporteTercero + resultados.porImporteFechaVencimiento;

    return NextResponse.json({
      success: true,
      dryRun,
      ...resultados,
    });
  } catch (error: any) {
    console.error('Error auto-conciliación:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Asignar entidad_fiscal_id a movimientos sin entidad usando el destinatario del concepto.
 * Patrones: "A Favor De XXX Concepto", "Recibo XXX Nº Recibo", etc.
 */
async function asignarEntidadesPorConcepto(resultados: any) {
  // Movimientos sin entidad fiscal
  const movsSinEntidad: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, concepto FROM movimientos_bancarios
    WHERE entidad_fiscal_id IS NULL AND importe < 0 AND concepto IS NOT NULL
  `);

  // Todas las entidades fiscales
  const entidades: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, razon_social, nif_cif FROM entidades_fiscales WHERE activo = true
  `);

  let asignadas = 0;

  for (const mov of movsSinEntidad) {
    const tercero = extraerTerceroDeConcepto(mov.concepto);
    if (!tercero) continue;

    const terceroNorm = normalizarTexto(tercero);
    
    // Buscar entidad que matchee
    let mejorMatch: any = null;
    let mejorScore = 0;

    for (const ent of entidades) {
      const entNorm = normalizarTexto(ent.razon_social);
      const score = calcularSimilitud(terceroNorm, entNorm);
      if (score > mejorScore && score >= 0.6) {
        mejorScore = score;
        mejorMatch = ent;
      }
    }

    if (mejorMatch) {
      await prisma.$executeRawUnsafe(
        `UPDATE movimientos_bancarios SET entidad_fiscal_id = $1, tercero = $2 WHERE id = $3`,
        mejorMatch.id, tercero, mov.id
      );
      asignadas++;
    }
  }

  resultados.entidadesAsignadas = asignadas;
}

/**
 * Match por nº factura encontrado en el concepto bancario
 */
async function matchPorNumFactura(resultados: any, dryRun: boolean) {
  // Facturas sin vincular con num_factura largo (>5 chars para evitar falsos positivos)
  const facturas: any[] = await prisma.$queryRawUnsafe(`
    SELECT id, num_factura, total, fecha, proveedor
    FROM facturas_recibidas
    WHERE id NOT IN (SELECT factura_id FROM movimientos_bancarios WHERE factura_id IS NOT NULL)
    AND num_factura IS NOT NULL AND LENGTH(num_factura) > 5
    AND total > 0
  `);

  for (const fr of facturas) {
    // Normalizar nº factura (quitar barras, espacios)
    const numNorm = fr.num_factura.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (numNorm.length < 6) continue;

    // Buscar movimiento que contenga este nº en su concepto
    const movs: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, importe, fecha_operacion, concepto
      FROM movimientos_bancarios
      WHERE factura_id IS NULL AND importe < 0
      AND fecha_operacion >= $1
      AND REPLACE(REPLACE(REPLACE(LOWER(concepto), '/', ''), '-', ''), ' ', '') LIKE $2
      ORDER BY fecha_operacion ASC
      LIMIT 1
    `, fr.fecha, `%${numNorm}%`);

    if (movs.length > 0) {
      const mov = movs[0];
      if (!dryRun) {
        await prisma.$executeRawUnsafe(
          `UPDATE movimientos_bancarios SET factura_id = $1, conciliado = true, nota_conciliacion = 'Auto: nº factura en concepto' WHERE id = $2`,
          fr.id, mov.id
        );
      }
      resultados.porNumFactura++;
      resultados.detalles.push({
        tipo: 'numFactura',
        factura: fr.num_factura,
        proveedor: fr.proveedor,
        importeFactura: fr.total,
        importeMovimiento: mov.importe,
        fechaMovimiento: mov.fecha_operacion,
      });
    }
  }
}

/**
 * Match por importe exacto + mismo tercero/proveedor + fecha posterior
 */
async function matchPorImporteTercero(resultados: any, dryRun: boolean) {
  // Facturas sin vincular
  const facturas: any[] = await prisma.$queryRawUnsafe(`
    SELECT fr.id, fr.num_factura, fr.total, fr.fecha, fr.proveedor, fr.cif
    FROM facturas_recibidas fr
    WHERE fr.id NOT IN (SELECT factura_id FROM movimientos_bancarios WHERE factura_id IS NOT NULL)
    AND fr.total > 0
    AND (fr.carpeta_origen NOT LIKE '%Confirming%' OR fr.carpeta_origen IS NULL)
    ORDER BY fr.fecha ASC
  `);

  for (const fr of facturas) {
    // Buscar movimiento con importe exacto, fecha posterior, y que tenga la misma entidad fiscal
    // o cuyo concepto contenga el nombre del proveedor
    const provNorm = normalizarTexto(fr.proveedor || '');
    const palabrasClave = (fr.proveedor || '').split(/\s+/).filter((p: string) => p.length > 3).map((p: string) => p.toLowerCase());
    
    // Primero intentar por entidad fiscal (CIF)
    let movs: any[] = [];
    if (fr.cif) {
      movs = await prisma.$queryRawUnsafe(`
        SELECT m.id, m.importe, m.fecha_operacion, m.concepto
        FROM movimientos_bancarios m
        JOIN entidades_fiscales ef ON ef.id = m.entidad_fiscal_id
        WHERE m.factura_id IS NULL AND m.importe < 0
        AND ABS(m.importe) = $1
        AND m.fecha_operacion >= $2
        AND UPPER(REPLACE(ef.nif_cif, '-', '')) = UPPER(REPLACE($3, '-', ''))
        ORDER BY m.fecha_operacion ASC
        LIMIT 1
      `, fr.total, fr.fecha, fr.cif);
    }

    // Si no matchea por CIF, intentar por nombre en concepto
    if (movs.length === 0 && palabrasClave.length > 0) {
      // Buscar movimiento con importe exacto cuyo concepto contenga alguna palabra clave del proveedor
      const allMovs: any[] = await prisma.$queryRawUnsafe(`
        SELECT id, importe, fecha_operacion, concepto
        FROM movimientos_bancarios
        WHERE factura_id IS NULL AND importe < 0
        AND ABS(importe) = $1
        AND fecha_operacion >= $2
        ORDER BY fecha_operacion ASC
      `, fr.total, fr.fecha);

      for (const mov of allMovs) {
        const conceptoLower = mov.concepto.toLowerCase();
        const matchCount = palabrasClave.filter((p: string) => conceptoLower.includes(p)).length;
        if (matchCount >= 1 && matchCount >= Math.min(2, palabrasClave.length)) {
          movs = [mov];
          break;
        }
      }
    }

    if (movs.length > 0) {
      const mov = movs[0];
      if (!dryRun) {
        await prisma.$executeRawUnsafe(
          `UPDATE movimientos_bancarios SET factura_id = $1, conciliado = true, nota_conciliacion = 'Auto: importe exacto + tercero' WHERE id = $2`,
          fr.id, mov.id
        );
      }
      resultados.porImporteTercero++;
      resultados.detalles.push({
        tipo: 'importeTercero',
        factura: fr.num_factura,
        proveedor: fr.proveedor,
        importeFactura: fr.total,
        importeMovimiento: mov.importe,
        fechaMovimiento: mov.fecha_operacion,
      });
    }
  }
}

/**
 * Match por importe exacto + fecha_vencimiento cercana al pago (±15 días)
 */
async function matchPorImporteFechaVencimiento(resultados: any, dryRun: boolean) {
  const facturas: any[] = await prisma.$queryRawUnsafe(`
    SELECT fr.id, fr.num_factura, fr.total, fr.fecha, fr.proveedor, fr.fecha_vencimiento
    FROM facturas_recibidas fr
    WHERE fr.id NOT IN (SELECT factura_id FROM movimientos_bancarios WHERE factura_id IS NOT NULL)
    AND fr.total > 0
    AND fr.fecha_vencimiento IS NOT NULL
    AND (fr.carpeta_origen NOT LIKE '%Confirming%' OR fr.carpeta_origen IS NULL)
    ORDER BY fr.fecha ASC
  `);

  for (const fr of facturas) {
    // Buscar movimiento con importe exacto cerca de la fecha de vencimiento (±15 días)
    const movs: any[] = await prisma.$queryRawUnsafe(`
      SELECT id, importe, fecha_operacion, concepto
      FROM movimientos_bancarios
      WHERE factura_id IS NULL AND importe < 0
      AND ABS(importe) = $1
      AND fecha_operacion BETWEEN ($2::timestamp - interval '5 days') AND ($2::timestamp + interval '15 days')
      ORDER BY ABS(EXTRACT(EPOCH FROM (fecha_operacion - $2::timestamp))) ASC
      LIMIT 1
    `, fr.total, fr.fecha_vencimiento);

    if (movs.length > 0) {
      const mov = movs[0];
      if (!dryRun) {
        await prisma.$executeRawUnsafe(
          `UPDATE movimientos_bancarios SET factura_id = $1, conciliado = true, nota_conciliacion = 'Auto: importe + fecha vencimiento' WHERE id = $2`,
          fr.id, mov.id
        );
      }
      resultados.porImporteFechaVencimiento++;
      resultados.detalles.push({
        tipo: 'importeFechaVencimiento',
        factura: fr.num_factura,
        proveedor: fr.proveedor,
        importeFactura: fr.total,
        importeMovimiento: mov.importe,
        fechaMovimiento: mov.fecha_operacion,
        fechaVencimiento: fr.fecha_vencimiento,
      });
    }
  }
}

// === UTILIDADES ===

function extraerTerceroDeConcepto(concepto: string): string | null {
  if (!concepto) return null;
  
  // "Transferencia A Favor De XXX Concepto:"
  let match = concepto.match(/[Aa]\s*[Ff]avor\s*[Dd]e\s+(.+?)(?:\s+[Cc]oncepto|\s+[Rr]ef|\s*$)/i);
  if (match) return match[1].trim();
  
  // "Transferencia Inmediata A Favor De XXX Concepto"
  match = concepto.match(/[Ii]nmediata\s+[Aa]\s*[Ff]avor\s*[Dd]e\s+(.+?)(?:\s+[Cc]oncepto|\s*$)/i);
  if (match) return match[1].trim();
  
  // "Recibo XXX Nº Recibo"
  match = concepto.match(/^[Rr]ecibo\s+(.+?)\s+(?:Nº|N\xba|,\s*[Cc]oncepto)/);
  if (match) return match[1].trim();
  
  // "R.XXX FAC/" (pago recibo con referencia factura)
  match = concepto.match(/^R\.(.+?)\s+FAC\//);
  if (match) return match[1].trim();
  
  // "Pago Movil En XXX,"
  match = concepto.match(/[Pp]ago\s+[Mm]ovil\s+[Ee]n\s+(.+?),/);
  if (match) return match[1].trim();
  
  // "Compra XXX,"
  match = concepto.match(/^[Cc]ompra\s+(.+?),/);
  if (match) return match[1].trim();
  
  return null;
}

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcularSimilitud(a: string, b: string): number {
  if (!a || !b) return 0;
  
  const palabrasA = a.split(' ').filter(p => p.length > 2);
  const palabrasB = b.split(' ').filter(p => p.length > 2);
  
  if (palabrasA.length === 0 || palabrasB.length === 0) return 0;
  
  let matches = 0;
  for (const pa of palabrasA) {
    for (const pb of palabrasB) {
      if (pa === pb || pb.includes(pa) || pa.includes(pb)) {
        matches++;
        break;
      }
    }
  }
  
  return matches / Math.max(palabrasA.length, palabrasB.length);
}
