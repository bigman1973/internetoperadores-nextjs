import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - Obtener personal de un proyecto
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const proyectoId = searchParams.get('proyectoId');

  if (!proyectoId) {
    return NextResponse.json({ error: 'proyectoId es obligatorio' }, { status: 400 });
  }

  const personal = await prisma.personalProyectoDraxton.findMany({
    where: { proyectoId },
    include: {
      empleado: {
        select: {
          id: true,
          nombreCompleto: true,
          categoria: true,
          departamento: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(personal);
}

// POST - Asignar persona al proyecto
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { proyectoId, empleadoId, porcentajeDedicacion, nivelTecnico, rol, funciones, fechaInicio, fechaFin, notas } = body;

  if (!proyectoId || !empleadoId) {
    return NextResponse.json({ error: 'proyectoId y empleadoId son obligatorios' }, { status: 400 });
  }

  // Verificar que no esté ya asignado
  const existente = await prisma.personalProyectoDraxton.findUnique({
    where: { proyectoId_empleadoId: { proyectoId, empleadoId } },
  });

  if (existente) {
    return NextResponse.json({ error: 'Esta persona ya está asignada al proyecto' }, { status: 409 });
  }

  const nuevo = await prisma.personalProyectoDraxton.create({
    data: {
      proyectoId,
      empleadoId,
      porcentajeDedicacion: porcentajeDedicacion ? parseFloat(porcentajeDedicacion) : 100,
      nivelTecnico: nivelTecnico ? parseInt(nivelTecnico) : null,
      rol: rol || null,
      funciones: funciones || null,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
      fechaFin: fechaFin ? new Date(fechaFin) : null,
      notas: notas || null,
    },
    include: {
      empleado: {
        select: {
          id: true,
          nombreCompleto: true,
          categoria: true,
          departamento: true,
        },
      },
    },
  });

  return NextResponse.json(nuevo, { status: 201 });
}

// PUT - Actualizar asignación
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...data } = body;

  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
  }

  const updateData: any = {};
  if (data.porcentajeDedicacion !== undefined) updateData.porcentajeDedicacion = parseFloat(data.porcentajeDedicacion);
  if (data.nivelTecnico !== undefined) updateData.nivelTecnico = data.nivelTecnico ? parseInt(data.nivelTecnico) : null;
  if (data.rol !== undefined) updateData.rol = data.rol || null;
  if (data.funciones !== undefined) updateData.funciones = data.funciones || null;
  if (data.fechaInicio !== undefined) updateData.fechaInicio = data.fechaInicio ? new Date(data.fechaInicio) : null;
  if (data.fechaFin !== undefined) updateData.fechaFin = data.fechaFin ? new Date(data.fechaFin) : null;
  if (data.activo !== undefined) updateData.activo = data.activo;
  if (data.notas !== undefined) updateData.notas = data.notas || null;

  const updated = await prisma.personalProyectoDraxton.update({
    where: { id },
    data: updateData,
    include: {
      empleado: {
        select: {
          id: true,
          nombreCompleto: true,
          categoria: true,
          departamento: true,
        },
      },
    },
  });

  return NextResponse.json(updated);
}

// DELETE - Desasignar persona
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
  }

  await prisma.personalProyectoDraxton.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
