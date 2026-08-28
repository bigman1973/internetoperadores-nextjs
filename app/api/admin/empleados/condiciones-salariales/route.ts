import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET: Listar condiciones salariales (por empleado o todas)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empleadoId = searchParams.get('empleadoId');

  const where = empleadoId ? { empleadoId } : {};

  const condiciones = await prisma.condicionSalarial.findMany({
    where,
    include: {
      empleado: {
        select: { id: true, nombreCompleto: true, codigoNomina: true }
      }
    },
    orderBy: [{ empleadoId: 'asc' }, { fechaEfectiva: 'desc' }],
  });

  return NextResponse.json(condiciones);
}

// POST: Crear nueva condición salarial
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Operación exclusiva para SUPER_ADMIN' }, { status: 403 });
  }

  const body = await req.json();
  const { empleadoId, fechaEfectiva, brutoAnual, motivo, notas } = body;

  if (!empleadoId || !fechaEfectiva || !brutoAnual) {
    return NextResponse.json(
      { error: 'empleadoId, fechaEfectiva y brutoAnual son obligatorios' },
      { status: 400 }
    );
  }

  const condicion = await prisma.condicionSalarial.create({
    data: {
      empleadoId,
      fechaEfectiva: new Date(fechaEfectiva),
      brutoAnual: parseFloat(brutoAnual),
      motivo: motivo || null,
      notas: notas || null,
      creadoPor: session.user?.email || null,
    },
    include: {
      empleado: {
        select: { id: true, nombreCompleto: true, codigoNomina: true }
      }
    },
  });

  return NextResponse.json(condicion, { status: 201 });
}

// PUT: Actualizar condición salarial
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Operación exclusiva para SUPER_ADMIN' }, { status: 403 });
  }

  const body = await req.json();
  const { id, fechaEfectiva, brutoAnual, motivo, notas } = body;

  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
  }

  const condicion = await prisma.condicionSalarial.update({
    where: { id },
    data: {
      ...(fechaEfectiva && { fechaEfectiva: new Date(fechaEfectiva) }),
      ...(brutoAnual !== undefined && { brutoAnual: parseFloat(brutoAnual) }),
      ...(motivo !== undefined && { motivo }),
      ...(notas !== undefined && { notas }),
    },
    include: {
      empleado: {
        select: { id: true, nombreCompleto: true, codigoNomina: true }
      }
    },
  });

  return NextResponse.json(condicion);
}

// DELETE: Eliminar condición salarial
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Operación exclusiva para SUPER_ADMIN' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });
  }

  await prisma.condicionSalarial.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
