import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';

  // Buscar clientes activos por nombre o CIF
  const clientes = await prisma.clienteWeb.findMany({
    where: {
      activo: true,
      OR: q ? [
        { nombre: { contains: q, mode: 'insensitive' } },
        { cif: { contains: q, mode: 'insensitive' } },
      ] : undefined,
    },
    select: {
      id: true,
      nombre: true,
      cif: true,
      municipio: true,
      provincia: true,
    },
    orderBy: { nombre: 'asc' },
    take: 50,
  });

  return NextResponse.json(clientes);
}
