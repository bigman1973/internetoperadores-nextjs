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
