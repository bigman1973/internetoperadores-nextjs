import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET: Obtener KPIs de un mes/año/planta
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planta = searchParams.get('planta') || 'LLEIDA';
  const mes = parseInt(searchParams.get('mes') || '0');
  const anio = parseInt(searchParams.get('anio') || '0');

  if (mes && anio) {
    // Un mes específico
    const kpi = await prisma.kpiMensualDraxton.findUnique({
      where: { planta_mes_anio: { planta, mes, anio } },
    });
    return NextResponse.json({ kpi });
  }

  // Todos los KPIs de un año
  const anioFiltro = anio || new Date().getFullYear();
  const kpis = await prisma.kpiMensualDraxton.findMany({
    where: { anio: anioFiltro, ...(planta !== 'TODAS' ? { planta } : {}) },
    orderBy: [{ planta: 'asc' }, { mes: 'asc' }],
  });

  return NextResponse.json({ kpis });
}

// POST: Crear o actualizar KPIs de un mes
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { planta, mes, anio, ...datos } = body;

  if (!planta || !mes || !anio) {
    return NextResponse.json({ error: 'Faltan planta, mes o año' }, { status: 400 });
  }

  const kpi = await prisma.kpiMensualDraxton.upsert({
    where: { planta_mes_anio: { planta, mes, anio } },
    create: {
      planta,
      mes,
      anio,
      ...datos,
      creadoPor: session.user?.email || null,
    },
    update: {
      ...datos,
    },
  });

  return NextResponse.json({ kpi });
}
