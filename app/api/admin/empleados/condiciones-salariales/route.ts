import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkIncorporationDate } from '@/lib/salary-incorporation-date';

async function validateIncorporationStart(empleadoId: string, value: string | Date) {
  const employee = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: { fechaAlta: true, antiguedadNomina: true },
  });
  if (!employee) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
  const check = checkIncorporationDate(employee.fechaAlta, employee.antiguedadNomina, value);
  if (check === 'hire-unverified') {
    return NextResponse.json({ error: 'No consta un alta contractual contrastada en nómina para esta incorporación' }, { status: 409 });
  }
  if (check === 'date-mismatch') {
    return NextResponse.json({ error: 'La fecha de incorporación debe coincidir con el alta contractual acreditada en nómina' }, { status: 400 });
  }
  return null;
}

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
  if (motivo === 'incorporacion') {
    const denied = await validateIncorporationStart(empleadoId, fechaEfectiva);
    if (denied) return denied;
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
  const current = await prisma.condicionSalarial.findUnique({ where: { id }, select: { empleadoId: true, fechaEfectiva: true, motivo: true } });
  if (!current) return NextResponse.json({ error: 'Condición salarial no encontrada' }, { status: 404 });
  if ((motivo ?? current.motivo) === 'incorporacion' && (fechaEfectiva !== undefined || motivo === 'incorporacion')) {
    const denied = await validateIncorporationStart(current.empleadoId, fechaEfectiva || current.fechaEfectiva);
    if (denied) return denied;
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
