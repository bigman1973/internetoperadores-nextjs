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
