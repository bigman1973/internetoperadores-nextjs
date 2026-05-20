import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const lead = await prisma.leadMigracionWeb.findUnique({
      where: { id },
      include: {
        cuestionario: {
          include: {
            respuestas: { orderBy: { numeroPregunta: 'asc' } },
          },
        },
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (error: any) {
    console.error('Error al obtener lead:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { estado, prioridad, notas, informePdfUrl } = body;

    const data: any = {};
    if (estado) data.estado = estado;
    if (prioridad) data.prioridad = prioridad;
    if (notas !== undefined) data.notas = notas;
    if (informePdfUrl !== undefined) data.informePdfUrl = informePdfUrl;

    const lead = await prisma.leadMigracionWeb.update({
      where: { id },
      data,
    });

    return NextResponse.json({ lead });
  } catch (error: any) {
    console.error('Error al actualizar lead:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.leadMigracionWeb.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar lead:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
