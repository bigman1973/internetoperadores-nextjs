import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado');
    const proveedor = searchParams.get('proveedor');
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const sinImputar = searchParams.get('sinImputar');
    const countOnly = searchParams.get('count');

    const where: any = {
      // Excluir documentos de Confirming Draxton (se gestionan en GGC-Draxton)
      NOT: { carpetaOrigen: { contains: 'Confirming', mode: 'insensitive' } },
    };
    if (estado) where.estado = estado;
    if (proveedor) where.proveedor = { contains: proveedor, mode: 'insensitive' };
    if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
    if (hasta) where.fecha = { ...where.fecha, lte: new Date(hasta) };
    if (sinImputar === 'true') where.imputacion = null;
    const sinOcr = searchParams.get('sinOcr');
    if (sinOcr === 'true') where.ocrCompletado = false;
    const conciliada = searchParams.get('conciliada');
    if (conciliada === 'true') where.movimientos = { some: { conciliado: true } };
    if (conciliada === 'false') where.movimientos = { none: { conciliado: true } };

    // Si solo necesitan el count (para el modal de "aplicar a todas")
    if (countOnly === 'true') {
      const total = await prisma.facturaRecibida.count({ where });
      return NextResponse.json({ total });
    }

    const [facturas, total] = await Promise.all([
      prisma.facturaRecibida.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          movimientos: {
            where: { conciliado: true },
            select: { id: true, fechaOperacion: true, importe: true, concepto: true },
            take: 1,
          },
        },
      }),
      prisma.facturaRecibida.count({ where }),
    ]);

    // Resumen fiscal
    const resumenFiscal = await prisma.facturaRecibida.aggregate({
      where: { ...where, estado: { not: 'RECHAZADA' }, deducibleIva: true },
      _sum: { base: true, importeIva: true, importeIrpf: true, total: true },
      _count: true,
    });

    return NextResponse.json({
      facturas,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      resumenFiscal: {
        totalBase: resumenFiscal._sum.base || 0,
        totalIva: resumenFiscal._sum.importeIva || 0,
        totalIrpf: resumenFiscal._sum.importeIrpf || 0,
        totalFacturado: resumenFiscal._sum.total || 0,
        numFacturas: resumenFiscal._count,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      proveedor, cif, numFactura, fecha, base, tipoIva, importeIva,
      tipoIrpf, importeIrpf, total, concepto, imputacion, clienteImputado,
      departamento, archivoUrl, deducibleIva,
    } = body;

    if (!proveedor || !fecha || base === undefined || importeIva === undefined || total === undefined) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const factura = await prisma.facturaRecibida.create({
      data: {
        proveedor,
        cif: cif || null,
        numFactura: numFactura || null,
        fecha: new Date(fecha),
        base: parseFloat(base),
        tipoIva: tipoIva ? parseFloat(tipoIva) : 21,
        importeIva: parseFloat(importeIva),
        tipoIrpf: tipoIrpf ? parseFloat(tipoIrpf) : 0,
        importeIrpf: importeIrpf ? parseFloat(importeIrpf) : 0,
        total: parseFloat(total),
        concepto: concepto || null,
        imputacion: imputacion || null,
        clienteImputado: clienteImputado || null,
        departamento: departamento || null,
        archivoUrl: archivoUrl || null,
        deducibleIva: deducibleIva !== false,
        estado: 'PENDIENTE_REVISION',
      },
    });

    return NextResponse.json({ factura });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
