import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

// GET: Obtener proyectos de un contrato o todos
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contratoId = searchParams.get('contratoId');

    const where: any = { activo: true };
    if (contratoId) where.contratoDraxtonId = contratoId;

    const proyectos = await prisma.proyectoContratoDraxton.findMany({
      where,
      include: {
        responsable: {
          select: { id: true, nombreCompleto: true, categoria: true },
        },
        contratoDraxton: {
          select: { id: true, titulo: true },
        },
      },
      orderBy: [{ categoria: 'asc' }, { orden: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json(proyectos);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Crear un nuevo proyecto
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      contratoDraxtonId,
      responsableId,
      titulo,
      descripcion,
      categoria,
      estado,
      impacto,
      ahorroEstimado,
      fechaInicio,
      fechaFinPrevista,
      fechaFinReal,
      prioridad,
      orden,
    } = body;

    if (!contratoDraxtonId || !titulo) {
      return NextResponse.json({ error: 'contratoDraxtonId y titulo son obligatorios' }, { status: 400 });
    }

    const proyecto = await prisma.proyectoContratoDraxton.create({
      data: {
        contratoDraxtonId,
        responsableId: responsableId || null,
        titulo,
        descripcion: descripcion || null,
        categoria: categoria || 'proyecto',
        estado: estado || 'en_curso',
        impacto: impacto || null,
        ahorroEstimado: ahorroEstimado ? parseFloat(ahorroEstimado) : null,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFinPrevista: fechaFinPrevista ? new Date(fechaFinPrevista) : null,
        fechaFinReal: fechaFinReal ? new Date(fechaFinReal) : null,
        prioridad: prioridad || 'media',
        orden: orden || 0,
      },
      include: {
        responsable: {
          select: { id: true, nombreCompleto: true, categoria: true },
        },
      },
    });

    return NextResponse.json(proyecto);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT: Actualizar un proyecto
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
    }

    // Limpiar campos
    const updateData: any = {};
    if (data.titulo !== undefined) updateData.titulo = data.titulo;
    if (data.descripcion !== undefined) updateData.descripcion = data.descripcion;
    if (data.categoria !== undefined) updateData.categoria = data.categoria;
    if (data.estado !== undefined) updateData.estado = data.estado;
    if (data.impacto !== undefined) updateData.impacto = data.impacto;
    if (data.ahorroEstimado !== undefined) updateData.ahorroEstimado = data.ahorroEstimado ? parseFloat(data.ahorroEstimado) : null;
    if (data.fechaInicio !== undefined) updateData.fechaInicio = data.fechaInicio ? new Date(data.fechaInicio) : null;
    if (data.fechaFinPrevista !== undefined) updateData.fechaFinPrevista = data.fechaFinPrevista ? new Date(data.fechaFinPrevista) : null;
    if (data.fechaFinReal !== undefined) updateData.fechaFinReal = data.fechaFinReal ? new Date(data.fechaFinReal) : null;
    if (data.prioridad !== undefined) updateData.prioridad = data.prioridad;
    if (data.orden !== undefined) updateData.orden = data.orden;
    if (data.responsableId !== undefined) updateData.responsableId = data.responsableId || null;
    if (data.activo !== undefined) updateData.activo = data.activo;

    const proyecto = await prisma.proyectoContratoDraxton.update({
      where: { id },
      data: updateData,
      include: {
        responsable: {
          select: { id: true, nombreCompleto: true, categoria: true },
        },
      },
    });

    return NextResponse.json(proyecto);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Eliminar (soft delete) un proyecto
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
    }

    await prisma.proyectoContratoDraxton.update({
      where: { id },
      data: { activo: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
