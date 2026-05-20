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
  const estado = searchParams.get('estado');
  const prioridad = searchParams.get('prioridad');
  const sector = searchParams.get('sector');
  const buscar = searchParams.get('buscar');

  try {
    const where: any = {};
    if (estado) where.estado = estado;
    if (prioridad) where.prioridad = prioridad;
    if (sector) where.sector = sector;
    if (buscar) {
      where.OR = [
        { nombreEmpresa: { contains: buscar, mode: 'insensitive' } },
        { contacto: { contains: buscar, mode: 'insensitive' } },
        { email: { contains: buscar, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.leadMigracionWeb.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        cuestionario: {
          select: { id: true, token: true, estado: true },
        },
      },
    });

    // Estadísticas rápidas
    const stats = await prisma.leadMigracionWeb.groupBy({
      by: ['estado'],
      _count: { id: true },
    });

    return NextResponse.json({ leads, stats });
  } catch (error: any) {
    console.error('Error al obtener leads:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
