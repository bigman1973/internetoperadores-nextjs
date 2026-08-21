import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET — obtener mis peticiones
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const peticiones = await prisma.peticionInterna.findMany({
    where: { usuarioEmail: session.user.email },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ peticiones });
}

// PUT — editar mi peticion (solo si está pendiente)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { id, titulo, descripcion, captura } = body;
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

    // Verificar que la petición es del usuario y está pendiente
    const existing = await prisma.peticionInterna.findFirst({
      where: { id: Number(id), usuarioEmail: session.user.email }
    });
    if (!existing) return NextResponse.json({ error: 'Petici\u00f3n no encontrada' }, { status: 404 });
    if (existing.estado !== 'pendiente') return NextResponse.json({ error: 'Solo se pueden editar peticiones pendientes' }, { status: 400 });

    const updated = await prisma.peticionInterna.update({
      where: { id: Number(id) },
      data: {
        ...(titulo && { titulo }),
        ...(descripcion && { descripcion }),
        ...(captura !== undefined && { captura: captura || null }),
      }
    });
    return NextResponse.json({ success: true, peticion: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — eliminar mi peticion (solo si está pendiente)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

    const existing = await prisma.peticionInterna.findFirst({
      where: { id: Number(id), usuarioEmail: session.user.email }
    });
    if (!existing) return NextResponse.json({ error: 'Petici\u00f3n no encontrada' }, { status: 404 });
    if (existing.estado !== 'pendiente') return NextResponse.json({ error: 'Solo se pueden eliminar peticiones pendientes' }, { status: 400 });

    await prisma.peticionInterna.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — crear nueva peticion
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { tipo, seccion, titulo, descripcion, captura } = body;

    if (!titulo || !descripcion) {
      return NextResponse.json({ error: 'Titulo y descripcion son obligatorios' }, { status: 400 });
    }

    const peticion = await prisma.peticionInterna.create({
      data: {
        tipo: tipo || 'mejora',
        seccion: seccion || 'panel_admin',
        titulo,
        descripcion,
        captura: captura || null,
        usuarioEmail: session.user.email,
        usuarioNombre: session.user.name || session.user.email.split('@')[0],
        prioridad: tipo === 'error' ? 'alta' : 'media',
      }
    });

    return NextResponse.json({ success: true, peticion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
