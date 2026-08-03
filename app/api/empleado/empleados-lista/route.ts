import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { canImpersonate } from '@/lib/empleado-impersonation';

/**
 * GET /api/empleado/empleados-lista
 * Devuelve la lista de empleados activos (solo para admins que pueden impersonar)
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const email = session.user.email.toLowerCase();
    const role = session.user.role || '';

    if (!canImpersonate(email, role)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const empleados = await prisma.empleado.findMany({
      where: { estado: 'ACTIVO' },
      select: {
        id: true,
        nombreCompleto: true,
        email: true,
        categoria: true,
      },
      orderBy: { nombreCompleto: 'asc' },
    });

    return NextResponse.json({ empleados });
  } catch (error: any) {
    console.error('Error en /api/empleado/empleados-lista:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
