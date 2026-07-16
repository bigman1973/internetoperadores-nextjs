import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const contratos = await prisma.contratoDraxton.findMany({
      orderBy: { createdAt: 'desc' },
      include: { contratosProveedor: true },
    });
    return NextResponse.json(contratos);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const contrato = await prisma.contratoDraxton.create({
      data: {
        codigoContrato: body.codigoContrato || null,
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    // Solo actualizar campos que se envían explícitamente (actualización parcial)
    const data: any = {};

    if (fields.codigoContrato !== undefined) data.codigoContrato = fields.codigoContrato || null;
    if (fields.titulo !== undefined) data.titulo = fields.titulo;
    if (fields.tipo !== undefined) data.tipo = fields.tipo;
    if (fields.fechaFirma !== undefined) data.fechaFirma = fields.fechaFirma ? new Date(fields.fechaFirma) : null;
    if (fields.fechaInicio !== undefined) data.fechaInicio = fields.fechaInicio ? new Date(fields.fechaInicio) : null;
    if (fields.fechaFin !== undefined) data.fechaFin = fields.fechaFin ? new Date(fields.fechaFin) : null;
    if (fields.fechaInicioServicio !== undefined) data.fechaInicioServicio = fields.fechaInicioServicio ? new Date(fields.fechaInicioServicio) : null;
    if (fields.permanenciaMeses !== undefined) data.permanenciaMeses = fields.permanenciaMeses ? parseInt(fields.permanenciaMeses) : null;
    if (fields.prorrogaAutomatica !== undefined) data.prorrogaAutomatica = fields.prorrogaAutomatica;
    if (fields.plazoProrroga !== undefined) data.plazoProrroga = fields.plazoProrroga || null;
    if (fields.importeMensual !== undefined) data.importeMensual = fields.importeMensual ? parseFloat(fields.importeMensual) : null;
    if (fields.importeAnual !== undefined) data.importeAnual = fields.importeAnual ? parseFloat(fields.importeAnual) : null;
    if (fields.formaPago !== undefined) data.formaPago = fields.formaPago || null;
    if (fields.estado !== undefined) data.estado = fields.estado;
    if (fields.contactoCliente !== undefined) data.contactoCliente = fields.contactoCliente || null;
    if (fields.contactoProveedor !== undefined) data.contactoProveedor = fields.contactoProveedor || null;
    if (fields.notas !== undefined) data.notas = fields.notas || null;
    if (fields.condicionesEspeciales !== undefined) data.condicionesEspeciales = fields.condicionesEspeciales || null;
    if (fields.serviciosJson !== undefined) data.serviciosJson = fields.serviciosJson;
    if (fields.documentoUrl !== undefined) data.documentoUrl = fields.documentoUrl || null;
    if (fields.documentoNombre !== undefined) data.documentoNombre = fields.documentoNombre || null;

    const contrato = await prisma.contratoDraxton.update({
      where: { id },
      data,
    });

    return NextResponse.json(contrato);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    }

    await prisma.contratoDraxton.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
