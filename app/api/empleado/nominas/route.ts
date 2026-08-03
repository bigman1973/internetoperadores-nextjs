import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveEmpleado } from '@/lib/empleado-impersonation';

/**
 * GET /api/empleado/nominas
 * Obtener las nóminas del empleado autenticado (o impersonado si admin + ?as=email)
 */
export async function GET(req: NextRequest) {
  try {
    const { empleado, isImpersonating, error, status } = await resolveEmpleado(req);
    if (!empleado) {
      return NextResponse.json({ error }, { status });
    }

    const nominas = await prisma.nomina.findMany({
      where: { empleadoId: empleado.id },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    return NextResponse.json({
      empleado: { id: empleado.id, nombreCompleto: empleado.nombreCompleto, email: empleado.email },
      nominas,
      isImpersonating,
    });
  } catch (error: any) {
    console.error('Error en GET /api/empleado/nominas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
