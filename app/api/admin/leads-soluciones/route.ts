import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get('tipo');
  const estado = searchParams.get('estado');
  const prioridad = searchParams.get('prioridad');
  const buscar = searchParams.get('buscar');

  try {
    const where: any = {};
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (prioridad) where.prioridad = prioridad;
    if (buscar) {
      where.OR = [
        { nombre: { contains: buscar, mode: 'insensitive' } },
        { empresa: { contains: buscar, mode: 'insensitive' } },
        { email: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.leadSolucion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Estadísticas rápidas
    const stats = await prisma.leadSolucion.groupBy({
      by: ['estado'],
      _count: { id: true },
    });

    // Estadísticas por tipo
    const statsTipo = await prisma.leadSolucion.groupBy({
      by: ['tipo'],
      _count: { id: true },
    });

    return NextResponse.json({ leads, stats, statsTipo });
  } catch (error: any) {
    console.error('Error al obtener leads soluciones:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
