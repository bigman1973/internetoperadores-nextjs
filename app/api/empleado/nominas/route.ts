import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/empleado/nominas
 * Obtener las nóminas del empleado autenticado
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Buscar el empleado por email
    const empleado = await prisma.empleado.findFirst({
      where: { email: session.user.email.toLowerCase() },
    });

    if (!empleado) {
      return NextResponse.json({ error: 'No se encontró tu perfil de empleado. Contacta con administración.' }, { status: 404 });
    }

    const nominas = await prisma.nomina.findMany({
      where: { empleadoId: empleado.id },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    return NextResponse.json({ empleado: { id: empleado.id, nombreCompleto: empleado.nombreCompleto }, nominas });
  } catch (error: any) {
    console.error('Error en GET /api/empleado/nominas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
