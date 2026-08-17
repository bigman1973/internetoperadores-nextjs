import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/empleado/buscar-clientes?q=texto
 * Buscar clientes de la BD (ISPGestión) para vincular a imputaciones
 * Accesible por cualquier usuario autenticado
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const clientes = await prisma.clienteWeb.findMany({
    where: {
      OR: [
        { nombre: { contains: q, mode: 'insensitive' } },
        { nombreComercial: { contains: q, mode: 'insensitive' } },
        { cif: { contains: q, mode: 'insensitive' } },
        { nif: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      nombre: true,
      nombreComercial: true,
      cif: true,
      nif: true,
      municipio: true,
      personaFisica: true,
    },
    orderBy: { nombre: 'asc' },
    take: 20,
  });

  return NextResponse.json(clientes);
}
