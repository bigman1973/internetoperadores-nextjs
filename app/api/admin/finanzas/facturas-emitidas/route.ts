import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Listar facturas emitidas con filtros
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const estado = searchParams.get('estado');
    const cliente = searchParams.get('cliente');
    const serie = searchParams.get('serie');
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const imputacion = searchParams.get('imputacion');
    const busqueda = searchParams.get('q');

    const where: any = {};
    if (estado) where.estado = estado;
    if (cliente) where.cliente = { contains: cliente, mode: 'insensitive' };
    if (serie) where.serie = serie;
    if (imputacion) where.imputacion = imputacion;
    if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
    if (hasta) where.fecha = { ...where.fecha, lte: new Date(hasta) };
    if (busqueda) {
      where.OR = [
        { cliente: { contains: busqueda, mode: 'insensitive' } },
        { numFactura: { contains: busqueda, mode: 'insensitive' } },
        { concepto: { contains: busqueda, mode: 'insensitive' } },
        { cif: { contains: busqueda, mode: 'insensitive' } },
      ];
    }

    const [facturas, total] = await Promise.all([
      prisma.facturaEmitida.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.facturaEmitida.count({ where }),
    ]);

    // Resumen
    const resumen = await prisma.facturaEmitida.aggregate({
      where,
      _sum: { total: true, importeCobrado: true },
      _count: true,
    });

    const porEstado = await prisma.facturaEmitida.groupBy({
      by: ['estado'],
      where: desde || hasta ? { fecha: where.fecha } : {},
      _sum: { total: true },
      _count: true,
    });

    return NextResponse.json({
      facturas,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      resumen: {
        totalFacturado: resumen._sum.total || 0,
        totalCobrado: resumen._sum.importeCobrado || 0,
        pendienteCobro: (resumen._sum.total || 0) - (resumen._sum.importeCobrado || 0),
        count: resumen._count,
        porEstado,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Crear factura emitida (manual o importación)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { facturas } = body; // Puede ser una o varias

    if (Array.isArray(facturas)) {
      // Importación masiva
      let insertadas = 0;
      let duplicadas = 0;
      const errores: string[] = [];

      for (const f of facturas) {
        try {
          await prisma.facturaEmitida.create({
            data: {
              cliente: f.cliente,
              cif: f.cif || null,
              numFactura: f.numFactura,
              serie: f.serie || extraerSerie(f.numFactura),
              fecha: new Date(f.fecha),
              fechaVencimiento: f.fechaVencimiento ? new Date(f.fechaVencimiento) : null,
              base: f.base,
              tipoIva: f.tipoIva || 21,
              importeIva: f.importeIva,
              tipoIrpf: f.tipoIrpf || 0,
              importeIrpf: f.importeIrpf || 0,
              total: f.total,
              concepto: f.concepto || null,
              lineas: f.lineas ? JSON.stringify(f.lineas) : null,
              estado: f.estado || 'EMITIDA',
              imputacion: f.imputacion || null,
              formaCobro: f.formaCobro || null,
              importeCobrado: f.importeCobrado || 0,
              fechaCobro: f.fechaCobro ? new Date(f.fechaCobro) : null,
              remesaRef: f.remesaRef || null,
              origenSistema: f.origenSistema || 'Manual',
              idExterno: f.idExterno || null,
            },
          });
          insertadas++;
        } catch (e: any) {
          if (e.code === 'P2002') {
            duplicadas++;
          } else {
            errores.push(`${f.numFactura}: ${e.message}`);
          }
        }
      }

      return NextResponse.json({
        success: true,
        insertadas,
        duplicadas,
        errores: errores.length > 0 ? errores.slice(0, 10) : undefined,
      });
    } else {
      // Crear una sola factura
      const factura = await prisma.facturaEmitida.create({
        data: {
          cliente: body.cliente,
          cif: body.cif || null,
          numFactura: body.numFactura,
          serie: body.serie || extraerSerie(body.numFactura),
          fecha: new Date(body.fecha),
          fechaVencimiento: body.fechaVencimiento ? new Date(body.fechaVencimiento) : null,
          base: body.base,
          tipoIva: body.tipoIva || 21,
          importeIva: body.importeIva,
          tipoIrpf: body.tipoIrpf || 0,
          importeIrpf: body.importeIrpf || 0,
          total: body.total,
          concepto: body.concepto || null,
          estado: body.estado || 'EMITIDA',
          imputacion: body.imputacion || null,
          formaCobro: body.formaCobro || null,
          origenSistema: body.origenSistema || 'Manual',
        },
      });

      return NextResponse.json({ success: true, factura });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Actualizar factura emitida
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    // Convertir fechas si vienen como string
    if (data.fecha) data.fecha = new Date(data.fecha);
    if (data.fechaVencimiento) data.fechaVencimiento = new Date(data.fechaVencimiento);
    if (data.fechaCobro) data.fechaCobro = new Date(data.fechaCobro);

    const factura = await prisma.facturaEmitida.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, factura });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Extraer serie del número de factura (ej: CLL26/1234 → CLL)
function extraerSerie(numFactura: string): string | null {
  const match = numFactura.match(/^([A-Z]+)/);
  return match ? match[1] : null;
}
