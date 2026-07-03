import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/empleado/gastos/clientes?q=texto
 * Buscar clientes para el selector (de facturas emitidas, únicos)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';

    // Buscar clientes únicos de facturas emitidas
    const clientes = await prisma.facturaEmitida.findMany({
      where: q ? { cliente: { contains: q, mode: 'insensitive' } } : {},
      select: { cliente: true },
      distinct: ['cliente'],
      orderBy: { cliente: 'asc' },
      take: 30,
    });

    // Añadir "Internet Operadores" como opción de estructura
    const lista = [
      { nombre: 'Internet Operadores (Estructura)', esEstructura: true },
      ...clientes.map(c => ({ nombre: c.cliente, esEstructura: false })),
    ];

    return NextResponse.json({ clientes: lista });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
