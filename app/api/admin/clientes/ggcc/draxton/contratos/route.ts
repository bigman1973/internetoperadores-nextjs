import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const contratos = await prisma.contratoDraxton.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(contratos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const contrato = await prisma.contratoDraxton.create({
    data: {
      titulo: body.titulo,
      tipo: body.tipo || 'Servicios Internet',
      fechaFirma: body.fechaFirma ? new Date(body.fechaFirma) : null,
      fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : null,
      fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
      fechaInicioServicio: body.fechaInicioServicio ? new Date(body.fechaInicioServicio) : null,
      permanenciaMeses: body.permanenciaMeses ? parseInt(body.permanenciaMeses) : null,
      prorrogaAutomatica: body.prorrogaAutomatica ?? true,
      plazoProrroga: body.plazoProrroga || null,
      importeMensual: body.importeMensual ? parseFloat(body.importeMensual) : null,
      importeAnual: body.importeAnual ? parseFloat(body.importeAnual) : null,
      formaPago: body.formaPago || null,
      estado: body.estado || 'Activo',
      contactoCliente: body.contactoCliente || null,
      contactoProveedor: body.contactoProveedor || null,
      notas: body.notas || null,
      condicionesEspeciales: body.condicionesEspeciales || null,
      serviciosJson: body.serviciosJson || null,
      documentoUrl: body.documentoUrl || null,
      documentoNombre: body.documentoNombre || null,
    },
  });

  return NextResponse.json(contrato, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const contrato = await prisma.contratoDraxton.update({
    where: { id },
    data: {
      titulo: data.titulo,
      tipo: data.tipo || 'Servicios Internet',
      fechaFirma: data.fechaFirma ? new Date(data.fechaFirma) : null,
      fechaInicio: data.fechaInicio ? new Date(data.fechaInicio) : null,
      fechaFin: data.fechaFin ? new Date(data.fechaFin) : null,
      fechaInicioServicio: data.fechaInicioServicio ? new Date(data.fechaInicioServicio) : null,
      permanenciaMeses: data.permanenciaMeses ? parseInt(data.permanenciaMeses) : null,
      prorrogaAutomatica: data.prorrogaAutomatica ?? true,
      plazoProrroga: data.plazoProrroga || null,
      importeMensual: data.importeMensual ? parseFloat(data.importeMensual) : null,
      importeAnual: data.importeAnual ? parseFloat(data.importeAnual) : null,
      formaPago: data.formaPago || null,
      estado: data.estado || 'Activo',
      contactoCliente: data.contactoCliente || null,
      contactoProveedor: data.contactoProveedor || null,
      notas: data.notas || null,
      condicionesEspeciales: data.condicionesEspeciales || null,
      serviciosJson: data.serviciosJson || null,
      documentoUrl: data.documentoUrl || null,
      documentoNombre: data.documentoNombre || null,
    },
  });

  return NextResponse.json(contrato);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  await prisma.contratoDraxton.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
