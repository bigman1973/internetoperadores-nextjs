import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

// GET — obtener todas las peticiones (admin)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const estado = searchParams.get('estado') || '';
  const tipo = searchParams.get('tipo') || '';

  const where: any = {};
  if (estado) where.estado = estado;
  if (tipo) where.tipo = tipo;

  const peticiones = await prisma.peticionInterna.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  // KPIs
  const todas = await prisma.peticionInterna.findMany();
  const kpis = {
    total: todas.length,
    pendientes: todas.filter(p => p.estado === 'pendiente').length,
    aprobadas: todas.filter(p => p.estado === 'aprobada').length,
    enDesarrollo: todas.filter(p => p.estado === 'en_desarrollo').length,
    resueltas: todas.filter(p => p.estado === 'resuelta').length,
    descartadas: todas.filter(p => p.estado === 'descartada').length,
    errores: todas.filter(p => p.tipo === 'error').length,
    mejoras: todas.filter(p => p.tipo === 'mejora').length,
    sugerencias: todas.filter(p => p.tipo === 'sugerencia').length,
  };

  return NextResponse.json({ peticiones, kpis });
}

// POST — acciones admin
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, id } = body;

    if (action === 'cambiar_estado') {
      const data: any = { estado: body.estado };
      if (body.estado === 'resuelta') {
        data.resueltaPor = session.user.name || session.user.email;
        data.fechaResolucion = new Date();
      }
      await prisma.peticionInterna.update({ where: { id }, data });
      return NextResponse.json({ success: true });
    }

    if (action === 'cambiar_prioridad') {
      await prisma.peticionInterna.update({
        where: { id },
        data: { prioridad: body.prioridad }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'notas_admin') {
      await prisma.peticionInterna.update({
        where: { id },
        data: { notasAdmin: body.notas }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'eliminar') {
      await prisma.peticionInterna.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Accion no reconocida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
