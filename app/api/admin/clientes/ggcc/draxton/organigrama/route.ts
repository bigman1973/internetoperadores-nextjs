import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET: Obtener todo el organigrama
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const nodos = await prisma.organigramaDraxton.findMany({
    where: { activo: true },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  });

  return NextResponse.json({ nodos });
}

// POST: Crear nodo
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();

  const nodo = await prisma.organigramaDraxton.create({
    data: {
      nombre: body.nombre,
      rol: body.rol,
      tipoEntidad: body.tipoEntidad || 'interno',
      empresa: body.empresa || null,
      ubicacion: body.ubicacion || 'HQ',
      departamento: body.departamento || null,
      esColaborador: body.esColaborador || false,
      especialidad: body.especialidad || null,
      email: body.email || null,
      telefono: body.telefono || null,
      notas: body.notas || null,
      reportaAId: body.reportaAId || null,
      orden: body.orden || 0,
    },
  });

  return NextResponse.json(nodo, { status: 201 });
}

// PUT: Actualizar nodo
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { id, ...data } = body;

  if (!id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });

  const nodo = await prisma.organigramaDraxton.update({
    where: { id },
    data: {
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.rol !== undefined && { rol: data.rol }),
      ...(data.tipoEntidad !== undefined && { tipoEntidad: data.tipoEntidad }),
      ...(data.empresa !== undefined && { empresa: data.empresa }),
      ...(data.ubicacion !== undefined && { ubicacion: data.ubicacion }),
      ...(data.departamento !== undefined && { departamento: data.departamento }),
      ...(data.esColaborador !== undefined && { esColaborador: data.esColaborador }),
      ...(data.especialidad !== undefined && { especialidad: data.especialidad }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.telefono !== undefined && { telefono: data.telefono }),
      ...(data.notas !== undefined && { notas: data.notas }),
      ...(data.reportaAId !== undefined && { reportaAId: data.reportaAId || null }),
      ...(data.orden !== undefined && { orden: data.orden }),
      ...(data.activo !== undefined && { activo: data.activo }),
    },
  });

  return NextResponse.json(nodo);
}

// DELETE: Eliminar nodo (soft delete)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id es obligatorio' }, { status: 400 });

  await prisma.organigramaDraxton.update({
    where: { id },
    data: { activo: false },
  });

  return NextResponse.json({ ok: true });
}
