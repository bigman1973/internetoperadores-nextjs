import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH - Actualizar categoría/imputación de un movimiento
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { categoria, tipoPago, metodoPago, conciliado, facturaId, gastoId, crearRegla, pendienteFactura, pagoACuentaVola, facturaEmitidaId, notaConciliacion, tipoDocumento, documentoRecibido, entregaACuentaEmpleadoId, tipoEntrega, entidadFiscalId, asignarProveedorASimilares } = body;

    const data: any = {};
    if (categoria !== undefined) data.categoria = categoria;
    if (tipoPago !== undefined) data.tipoPago = tipoPago;
    if (metodoPago !== undefined) data.metodoPago = metodoPago;
    if (conciliado !== undefined) data.conciliado = conciliado;
    if (facturaId !== undefined) data.facturaId = facturaId;
    if (gastoId !== undefined) data.gastoId = gastoId;
    if (pendienteFactura !== undefined) data.pendienteFactura = pendienteFactura;
    if (pagoACuentaVola !== undefined) {
      data.pagoACuentaVola = pagoACuentaVola;
      // Si se marca como pago a cuenta Vola, se concilia automáticamente
      if (pagoACuentaVola) {
        data.conciliado = true;
        data.categoria = 'Vola';
        data.tipoPago = 'Pago a cuenta';
        data.tipoDocumento = 'justificante';
        data.documentoRecibido = true;
      }
    }
    if (facturaEmitidaId !== undefined) {
      data.facturaEmitidaId = facturaEmitidaId;
      // Si se vincula con factura emitida, se concilia y se marca la factura como cobrada
      if (facturaEmitidaId) {
        data.conciliado = true;
      }
    }
    if (notaConciliacion !== undefined) data.notaConciliacion = notaConciliacion;
    if (tipoDocumento !== undefined) data.tipoDocumento = tipoDocumento;
    if (documentoRecibido !== undefined) data.documentoRecibido = documentoRecibido;
    if (tipoEntrega !== undefined && entregaACuentaEmpleadoId === undefined) data.tipoEntrega = tipoEntrega;
    if (entregaACuentaEmpleadoId !== undefined) {
      data.entregaACuentaEmpleadoId = entregaACuentaEmpleadoId;
      if (tipoEntrega !== undefined) data.tipoEntrega = tipoEntrega;
      // Si se marca como entrega a cuenta, se concilia automáticamente
      if (entregaACuentaEmpleadoId) {
        data.conciliado = true;
        data.tipoDocumento = 'justificante';
        data.documentoRecibido = true;
        if (tipoEntrega === 'coste_empresa') {
          data.categoria = 'Sueldos y Salarios';
          data.tipoPago = 'Coste empresa';
        } else {
          data.categoria = 'Entrega a cuenta';
          data.tipoPago = 'Anticipo';
        }
      }
    }
    // Vinculación con entidad fiscal (proveedor/AAPP)
    if (entidadFiscalId !== undefined) {
      data.entidadFiscalId = entidadFiscalId;
      // Si se vincula un tercero, auto-conciliar si ya tiene justificante o si se está marcando justificante
      if (entidadFiscalId) {
        // Verificar si el movimiento ya tiene tipoDocumento=justificante
        const movActual = await prisma.movimientoBancario.findUnique({ where: { id }, select: { tipoDocumento: true } });
        if (movActual?.tipoDocumento === 'justificante' || data.tipoDocumento === 'justificante') {
          data.conciliado = true;
        }
      }
    }
    // Si se marca tipoDocumento=justificante y ya tiene tercero vinculado, auto-conciliar
    if (tipoDocumento === 'justificante' && !data.conciliado) {
      const movActual2 = await prisma.movimientoBancario.findUnique({ where: { id }, select: { entidadFiscalId: true } });
      if (movActual2?.entidadFiscalId || data.entidadFiscalId) {
        data.conciliado = true;
      }
    }

    // Si se pide asignar proveedor a movimientos similares
    if (asignarProveedorASimilares) {
      const movActual = await prisma.movimientoBancario.findUnique({ where: { id }, include: { cuenta: true } });
      if (movActual && movActual.entidadFiscalId) {
        const patron = extraerPatron(movActual.concepto);
        if (patron) {
          await prisma.movimientoBancario.updateMany({
            where: {
              id: { not: id },
              concepto: { contains: patron, mode: 'insensitive' },
              entidadFiscalId: null,
            },
            data: { entidadFiscalId: movActual.entidadFiscalId },
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Auto-vincular proveedor al vincular factura recibida
    let autoEntidadFiscalId: string | null = null;
    if (facturaId && facturaId !== null && !data.entidadFiscalId) {
      const factura = await prisma.facturaRecibida.findUnique({ where: { id: facturaId }, select: { proveedor: true, cif: true } });
      if (factura) {
        // Buscar entidad fiscal por CIF o nombre
        const entidad = await prisma.entidadFiscal.findFirst({
          where: {
            OR: [
              ...(factura.cif ? [{ nifCif: factura.cif }] : []),
              { razonSocial: { equals: factura.proveedor, mode: 'insensitive' as const } },
              { nombreComercial: { equals: factura.proveedor, mode: 'insensitive' as const } },
            ],
          },
        });
        if (entidad) {
          data.entidadFiscalId = entidad.id;
          autoEntidadFiscalId = entidad.id;
        }
      }
    }

    const movimiento = await prisma.movimientoBancario.update({
      where: { id },
      data,
      include: { cuenta: true, entidadFiscal: true },
    });

    // Si se vincula con factura emitida, marcarla como cobrada
    if (facturaEmitidaId && facturaEmitidaId !== null) {
      await prisma.facturaEmitida.update({
        where: { id: facturaEmitidaId },
        data: {
          estado: 'COBRADA',
          importeCobrado: movimiento.importe,
          fechaCobro: movimiento.fechaOperacion,
        },
      });
    }

    // Si se pide crear regla de imputación automática
    if (crearRegla && categoria) {
      const patron = extraerPatron(movimiento.concepto);
      if (patron) {
        await prisma.reglaImputacion.upsert({
          where: { id: `${patron}-${categoria}` },
          update: {
            confianza: { increment: 0.1 },
            vecesUsada: { increment: 1 },
          },
          create: {
            patron,
            banco: movimiento.cuenta.banco,
            imputacion: categoria,
            tipoPago: tipoPago || null,
            confianza: 0.7,
            vecesUsada: 1,
          },
        });
      }
    }

    // Contar movimientos similares sin proveedor para sugerir asignación masiva
    let similares = 0;
    let proveedorNombre = '';
    const entidadVinculada = autoEntidadFiscalId || (entidadFiscalId && entidadFiscalId !== null ? entidadFiscalId : null);
    if (entidadVinculada) {
      const patron = extraerPatron(movimiento.concepto);
      if (patron) {
        similares = await prisma.movimientoBancario.count({
          where: {
            id: { not: id },
            concepto: { contains: patron, mode: 'insensitive' },
            entidadFiscalId: null,
          },
        });
      }
      proveedorNombre = movimiento.entidadFiscal?.razonSocial || '';
    }

    return NextResponse.json({ movimiento, similares, proveedorNombre });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function extraerPatron(concepto: string): string | null {
  // Palabras genéricas bancarias/fiscales que NO identifican a una entidad
  const GENERICAS = new Set([
    'recibo', 'concepto', 'periodo', 'liquidacion', 'pago', 'cobro',
    'transferencia', 'ingreso', 'cargo', 'abono', 'comision',
    'domiciliacion', 'adeudo', 'orden', 'mandato', 'nomina',
    'regimen', 'general', 'autonomos', 'aplazamientos', 'cotizacion', 'cuota',
    'factura', 'fra', 'ref', 'referencia', 'numero', 'fecha', 'modelo',
    'impuesto', 'tributo', 'tasa', 'iva',
    'soluciones', 'informati', 'servicios', 'spain', 'empresa',
    'telecomunicaciones', 'technologies', 'fibra', 'internet', 'movil', 'fijo',
    'suministro', 'electrico', 'energia', 'clientes', 'cliente',
    'favor', 'cuenta', 'mensual', 'mensualidad', 'nif', 'cif',
    'para', 'por', 'con', 'del', 'los', 'las', 'una', 'uno',
  ]);

  // Extraer tokens (split por espacios, puntuación y guiones)
  const tokens = concepto.split(/[\s,;:()\[\]{}\-\/]+/).filter(t => t.length > 0);

  // Buscar la PRIMERA palabra significativa no-genérica
  // En conceptos bancarios, el nombre de la entidad suele aparecer primero
  // después de las palabras genéricas (Recibo, Pago, Transferencia...)
  for (const token of tokens) {
    // Ignorar tokens con puntos internos seguidos de letra (refs: R.e.autonomos, R.Q2827003A, S.A.)
    if (/\.[a-zA-Z]/.test(token) && token.indexOf('.') < token.length - 1) continue;

    // Limpiar punto final para evaluar
    const limpio = token.replace(/[.]$/, '');
    if (/^\d+$/.test(limpio)) continue;
    if (limpio.length < 3) continue;
    if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]{3,}/.test(limpio)) continue;

    const lower = limpio.toLowerCase();
    if (GENERICAS.has(lower)) continue;

    // Esta es la primera palabra significativa - probablemente el nombre de la entidad
    // Devolver el token original en minúsculas (Prisma usa mode: insensitive)
    return token.toLowerCase();
  }

  // Fallback: tomar la primera palabra con al menos 3 letras
  for (const token of tokens) {
    if (token.length >= 3 && /[a-zA-Z]{2,}/.test(token)) {
      return token.toLowerCase();
    }
  }
  return null;
}
