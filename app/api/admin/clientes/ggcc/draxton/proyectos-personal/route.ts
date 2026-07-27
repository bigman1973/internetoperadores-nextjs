import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - Obtener personal de un proyecto (incluye costeHoraActual del empleado)
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
          costeHoraActual: true,
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
  const { proyectoId, empleadoId, tipoImputacion, porcentajeDedicacion, horasImputadas, nivelTecnico, rol, funciones, fechaInicio, fechaFin, notas } = body;

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

  // Obtener costeHoraActual del empleado
  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: { costeHoraActual: true },
  });

  const costeHora = empleado?.costeHoraActual || null;
  const horas = horasImputadas ? parseFloat(horasImputadas) : null;
  const costeTotal = (costeHora && horas) ? costeHora * horas : null;

  const nuevo = await prisma.personalProyectoDraxton.create({
    data: {
      proyectoId,
      empleadoId,
      tipoImputacion: tipoImputacion || 'horas',
      porcentajeDedicacion: porcentajeDedicacion ? parseFloat(porcentajeDedicacion) : null,
      horasImputadas: horas,
      costeHora,
      costeTotal,
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
          costeHoraActual: true,
        },
      },
    },
  });

  // Recalcular coste personal total del proyecto
  await recalcularCostePersonalProyecto(proyectoId);

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
  if (data.tipoImputacion !== undefined) updateData.tipoImputacion = data.tipoImputacion;
  if (data.porcentajeDedicacion !== undefined) updateData.porcentajeDedicacion = data.porcentajeDedicacion ? parseFloat(data.porcentajeDedicacion) : null;
  if (data.horasImputadas !== undefined) updateData.horasImputadas = data.horasImputadas ? parseFloat(data.horasImputadas) : null;
  if (data.costeHora !== undefined) updateData.costeHora = data.costeHora ? parseFloat(data.costeHora) : null;
  if (data.nivelTecnico !== undefined) updateData.nivelTecnico = data.nivelTecnico ? parseInt(data.nivelTecnico) : null;
  if (data.rol !== undefined) updateData.rol = data.rol || null;
  if (data.funciones !== undefined) updateData.funciones = data.funciones || null;
  if (data.fechaInicio !== undefined) updateData.fechaInicio = data.fechaInicio ? new Date(data.fechaInicio) : null;
  if (data.fechaFin !== undefined) updateData.fechaFin = data.fechaFin ? new Date(data.fechaFin) : null;
  if (data.activo !== undefined) updateData.activo = data.activo;
  if (data.notas !== undefined) updateData.notas = data.notas || null;

  // Recalcular costeTotal si cambian horas o costeHora
  if (updateData.horasImputadas !== undefined || updateData.costeHora !== undefined) {
    const current = await prisma.personalProyectoDraxton.findUnique({ where: { id } });
    const horas = updateData.horasImputadas ?? current?.horasImputadas;
    const coste = updateData.costeHora ?? current?.costeHora;
    updateData.costeTotal = (horas && coste) ? horas * coste : null;
  }

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
          costeHoraActual: true,
        },
      },
    },
  });

  // Recalcular coste personal total del proyecto
  await recalcularCostePersonalProyecto(updated.proyectoId);

  return NextResponse.json(updated);
}

// DELETE - Desasignar persona
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
  }

  const deleted = await prisma.personalProyectoDraxton.delete({ where: { id } });

  // Recalcular coste personal total del proyecto
  await recalcularCostePersonalProyecto(deleted.proyectoId);

  return NextResponse.json({ success: true });
}

// Función auxiliar: recalcular el coste total de personal y actualizar margen del proyecto
async function recalcularCostePersonalProyecto(proyectoId: string) {
  const asignaciones = await prisma.personalProyectoDraxton.findMany({
    where: { proyectoId, activo: true },
    select: { costeTotal: true },
  });

  const costePersonalTotal = asignaciones.reduce((sum, a) => sum + (a.costeTotal || 0), 0);

  // Obtener proyecto para recalcular margen
  const proyecto = await prisma.proyectoContratoDraxton.findUnique({
    where: { id: proyectoId },
    select: { importeVenta: true, costeProveedores: true },
  });

  if (proyecto) {
    const venta = proyecto.importeVenta ? Number(proyecto.importeVenta) : 0;
    const proveedores = proyecto.costeProveedores ? Number(proyecto.costeProveedores) : 0;
    const margen = venta - proveedores - costePersonalTotal;

    await prisma.proyectoContratoDraxton.update({
      where: { id: proyectoId },
      data: { margenEstimado: margen },
    });
  }
}
