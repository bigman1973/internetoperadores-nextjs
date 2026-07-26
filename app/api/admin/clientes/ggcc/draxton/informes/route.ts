import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: listar informes o obtener uno por mes/anio
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const anio = searchParams.get('anio');

  const informes = await prisma.informeMensualDraxton.findMany({
    where: anio ? { anio: parseInt(anio) } : {},
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
  });

  return NextResponse.json(informes);
}

// POST: crear o actualizar informe
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { mes, anio, planta, titulo, resumenEjecutivo, recomendaciones } = body;

  const informe = await prisma.informeMensualDraxton.upsert({
    where: { mes_anio_planta: { mes, anio, planta: planta || 'TODAS' } },
    update: { titulo, resumenEjecutivo, recomendaciones, creadoPor: session.user?.email || null },
    create: { mes, anio, planta: planta || 'TODAS', titulo, resumenEjecutivo, recomendaciones, creadoPor: session.user?.email || null },
  });

  return NextResponse.json(informe);
}

// PUT: actualizar estado (borrador → revisado → entregado)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { id, estado, entregado } = body;

  const updateData: any = {};
  if (estado) updateData.estado = estado;
  if (entregado !== undefined) {
    updateData.entregado = entregado;
    if (entregado) updateData.fechaEntrega = new Date();
  }

  const informe = await prisma.informeMensualDraxton.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(informe);
}

// DELETE
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  await prisma.informeMensualDraxton.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
