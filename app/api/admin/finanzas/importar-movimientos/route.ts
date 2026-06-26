import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import {
  parseSantanderXLSX,
  parseSantanderTXT,
  parseCaixaGuissonaCSV,
  parseBBVACSV,
  parseVividCSV,
  parseWiseXLSX,
  parseNorma43,
  detectarFormato,
  MovimientoParsed,
} from '@/lib/finanzas/parsers';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('archivo') as File;
    const bancoManual = formData.get('banco') as string | null;
    const cuentaId = formData.get('cuentaId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado archivo' }, { status: 400 });
    }

    const filename = file.name;
    const buffer = Buffer.from(await file.arrayBuffer());
    let movimientos: MovimientoParsed[] = [];
    let formato = bancoManual || detectarFormato(filename);

    // Parsear según formato
    switch (formato) {
      case 'santander': {
        if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          movimientos = parseSantanderXLSX(rows);
        } else {
          // TXT
          const content = buffer.toString('utf-8');
          movimientos = parseSantanderTXT(content);
        }
        break;
      }
      case 'guissona': {
        const content = buffer.toString('utf-8');
        movimientos = parseCaixaGuissonaCSV(content);
        break;
      }
      case 'bbva': {
        if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          // Convertir a CSV y parsear
          const csv = XLSX.utils.sheet_to_csv(sheet);
          movimientos = parseBBVACSV(csv);
        } else {
          const content = buffer.toString('utf-8');
          movimientos = parseBBVACSV(content);
        }
        break;
      }
      case 'vivid': {
        const content = buffer.toString('utf-8');
        movimientos = parseVividCSV(content);
        break;
      }
      case 'wise': {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        movimientos = parseWiseXLSX(rows);
        break;
      }
      case 'norma43': {
        const content = buffer.toString('utf-8');
        movimientos = parseNorma43(content);
        break;
      }
      default:
        return NextResponse.json({ error: `Formato no reconocido: ${formato}` }, { status: 400 });
    }

    if (movimientos.length === 0) {
      return NextResponse.json({ error: 'No se pudieron extraer movimientos del archivo' }, { status: 400 });
    }

    // Determinar cuenta bancaria
    let cuenta = null;
    if (cuentaId) {
      cuenta = await prisma.cuentaBancaria.findUnique({ where: { id: cuentaId } });
    } else {
      // Intentar determinar por formato
      const bancoMap: Record<string, string> = {
        santander: 'Santander',
        bbva: 'BBVA',
        guissona: 'Caixa Guissona',
        vivid: 'Vivid',
        wise: 'Wise',
      };
      const bancoNombre = bancoMap[formato];
      if (bancoNombre) {
        cuenta = await prisma.cuentaBancaria.findFirst({ where: { banco: bancoNombre } });
      }
    }

    if (!cuenta) {
      return NextResponse.json({ error: 'No se pudo determinar la cuenta bancaria' }, { status: 400 });
    }

    // Insertar movimientos evitando duplicados
    let insertados = 0;
    let duplicados = 0;
    const errores: string[] = [];

    for (const mov of movimientos) {
      try {
        await prisma.movimientoBancario.create({
          data: {
            cuentaId: cuenta.id,
            fechaOperacion: mov.fechaOperacion,
            fechaValor: mov.fechaValor,
            concepto: mov.concepto,
            importe: mov.importe,
            saldo: mov.saldo,
            referencia: mov.referencia,
            codigoOperacion: mov.codigoOperacion,
            infoAdicional: mov.infoAdicional,
            hashUnico: mov.hashUnico,
            origenArchivo: filename,
          },
        });
        insertados++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          // Duplicado (hash único ya existe)
          duplicados++;
        } else {
          errores.push(`Error en movimiento ${mov.fechaOperacion}: ${e.message}`);
        }
      }
    }

    // Actualizar saldo de la cuenta con el último movimiento
    const ultimoMov = movimientos[0]; // Los movimientos suelen venir del más reciente al más antiguo
    if (ultimoMov && ultimoMov.saldo !== null) {
      await prisma.cuentaBancaria.update({
        where: { id: cuenta.id },
        data: {
          saldoActual: ultimoMov.saldo,
          fechaSaldo: ultimoMov.fechaOperacion,
        },
      });
    }

    // Aplicar reglas de imputación automáticas
    const reglasAplicadas = await aplicarReglasImputacion(cuenta.id);

    return NextResponse.json({
      success: true,
      resumen: {
        archivo: filename,
        formato,
        banco: cuenta.banco,
        totalParseados: movimientos.length,
        insertados,
        duplicados,
        errores: errores.length,
        reglasAplicadas,
      },
      errores: errores.length > 0 ? errores.slice(0, 10) : undefined,
    });
  } catch (error: any) {
    console.error('Error importando movimientos:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

// Aplicar reglas de imputación automáticas a movimientos sin categorizar
async function aplicarReglasImputacion(cuentaId: string): Promise<number> {
  const reglas = await prisma.reglaImputacion.findMany({
    where: { activa: true },
    orderBy: { confianza: 'desc' },
  });

  if (reglas.length === 0) return 0;

  const movimientosSinCategoria = await prisma.movimientoBancario.findMany({
    where: {
      cuentaId,
      categoria: null,
    },
  });

  let aplicadas = 0;

  for (const mov of movimientosSinCategoria) {
    for (const regla of reglas) {
      const patron = regla.patron.toLowerCase();
      if (mov.concepto.toLowerCase().includes(patron)) {
        await prisma.movimientoBancario.update({
          where: { id: mov.id },
          data: {
            categoria: regla.imputacion,
            tipoPago: regla.tipoPago,
          },
        });
        // Incrementar uso de la regla
        await prisma.reglaImputacion.update({
          where: { id: regla.id },
          data: { vecesUsada: { increment: 1 } },
        });
        aplicadas++;
        break; // Solo aplicar la primera regla que matchee
      }
    }
  }

  return aplicadas;
}

// GET - Obtener resumen de movimientos
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cuentaId = searchParams.get('cuentaId');
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const categoria = searchParams.get('categoria');
    const conciliado = searchParams.get('conciliado');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (cuentaId) where.cuentaId = cuentaId;
    if (desde) where.fechaOperacion = { ...where.fechaOperacion, gte: new Date(desde) };
    if (hasta) where.fechaOperacion = { ...where.fechaOperacion, lte: new Date(hasta) };
    if (categoria) where.categoria = categoria;
    if (conciliado !== null && conciliado !== undefined) where.conciliado = conciliado === 'true';

    const [movimientos, total] = await Promise.all([
      prisma.movimientoBancario.findMany({
        where,
        include: { cuenta: true, factura: true, gasto: true },
        orderBy: { fechaOperacion: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.movimientoBancario.count({ where }),
    ]);

    return NextResponse.json({
      movimientos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
