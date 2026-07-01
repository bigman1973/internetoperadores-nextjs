import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const tipo = searchParams.get('tipo') || '';
    const estado = searchParams.get('estado') || '';
    const empleado = searchParams.get('empleado') || '';
    const desde = searchParams.get('desde') || '';
    const hasta = searchParams.get('hasta') || '';
    const conciliado = searchParams.get('conciliado') || '';

    const where: any = {};
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (empleado) where.empleadoId = empleado;
    if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
    if (hasta) where.fecha = { ...where.fecha, lte: new Date(hasta) };
    if (conciliado === 'si') where.conciliado = true;
    if (conciliado === 'no') where.conciliado = false;

    const [gastos, total] = await Promise.all([
      prisma.gasto.findMany({
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
      prisma.gasto.count({ where }),
    ]);

    // Resumen
    const resumen = await prisma.gasto.aggregate({
      where: { ...where, estado: { not: 'PENDIENTE' } },
      _sum: { importe: true, importeIva: true, baseIva: true },
      _count: true,
    });

    // Resumen por tipo
    const porTipo = await prisma.gasto.groupBy({
      by: ['tipo'],
      where,
      _sum: { importe: true },
      _count: true,
      orderBy: { _sum: { importe: 'desc' } },
    });

    return NextResponse.json({
      gastos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      resumen: {
        totalImporte: resumen._sum.importe || 0,
        totalIva: resumen._sum.importeIva || 0,
        totalBase: resumen._sum.baseIva || 0,
        numGastos: resumen._count,
      },
      porTipo,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      concepto, importe, fecha, tipo, departamento, empleado, empleadoId,
      comercio, cifComercio, tarjeta, cuentaBancariaId, archivoUrl, archivoNombre,
      deducibleIva, baseIva, importeIva, tipoIva, imputacion, categoriaIS,
    } = body;

    if (!concepto || importe === undefined || !fecha) {
      return NextResponse.json(
        { error: 'Campos obligatorios: concepto, importe, fecha' },
        { status: 400 }
      );
    }

    const gasto = await prisma.gasto.create({
      data: {
        concepto,
        importe: parseFloat(importe),
        fecha: new Date(fecha),
        tipo: tipo || 'GASTO_GENERAL',
        departamento: departamento || null,
        empleado: empleado || null,
        empleadoId: empleadoId || null,
        comercio: comercio || null,
        cifComercio: cifComercio || null,
        tarjeta: tarjeta || null,
        cuentaBancariaId: cuentaBancariaId || null,
        archivoUrl: archivoUrl || null,
        archivoNombre: archivoNombre || null,
        deducibleIva: deducibleIva || false,
        baseIva: baseIva ? parseFloat(baseIva) : null,
        importeIva: importeIva ? parseFloat(importeIva) : null,
        tipoIva: tipoIva ? parseFloat(tipoIva) : null,
        imputacion: imputacion || null,
        categoriaIS: categoriaIS || null,
        deducibleIS: true,
      },
    });

    return NextResponse.json({ success: true, gasto });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
