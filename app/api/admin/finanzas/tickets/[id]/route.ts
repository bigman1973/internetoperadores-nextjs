import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gasto = await prisma.gasto.findUnique({
      where: { id: params.id },
      include: {
        movimientos: {
          select: { id: true, fechaOperacion: true, importe: true, concepto: true, conciliado: true },
        },
      },
    });

    if (!gasto) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    return NextResponse.json(gasto);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const {
      concepto, importe, fecha, tipo, departamento, empleado, empleadoId,
      comercio, cifComercio, tarjeta, imputacion, estado, deducibleIva,
      baseIva, importeIva, tipoIva, categoriaIS, deducibleIS,
    } = body;

    const data: any = {};
    if (concepto !== undefined) data.concepto = concepto;
    if (importe !== undefined) data.importe = parseFloat(importe);
    if (fecha !== undefined) data.fecha = new Date(fecha);
    if (tipo !== undefined) data.tipo = tipo;
    if (departamento !== undefined) data.departamento = departamento;
    if (empleado !== undefined) data.empleado = empleado;
    if (empleadoId !== undefined) data.empleadoId = empleadoId;
    if (comercio !== undefined) data.comercio = comercio;
    if (cifComercio !== undefined) data.cifComercio = cifComercio;
    if (tarjeta !== undefined) data.tarjeta = tarjeta;
    if (imputacion !== undefined) data.imputacion = imputacion;
    if (estado !== undefined) data.estado = estado;
    if (deducibleIva !== undefined) data.deducibleIva = deducibleIva;
    if (baseIva !== undefined) data.baseIva = baseIva ? parseFloat(baseIva) : null;
    if (importeIva !== undefined) data.importeIva = importeIva ? parseFloat(importeIva) : null;
    if (tipoIva !== undefined) data.tipoIva = tipoIva ? parseFloat(tipoIva) : null;
    if (categoriaIS !== undefined) data.categoriaIS = categoriaIS;
    if (deducibleIS !== undefined) data.deducibleIS = deducibleIS;

    const gasto = await prisma.gasto.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ success: true, gasto });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Desasociar movimientos bancarios primero
    await prisma.movimientoBancario.updateMany({
      where: { gastoId: params.id },
      data: { gastoId: null, conciliado: false },
    });

    await prisma.gasto.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
