import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'FINANCIERO'];

/**
 * GET /api/admin/empleados
 * Listar empleados con sus datos de nómina más reciente
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const estado = searchParams.get('estado') || 'todos';
    const mes = parseInt(searchParams.get('mes') || '0');
    const anio = parseInt(searchParams.get('anio') || '2026');

    const where: any = {};
    if (estado !== 'todos') {
      where.estado = estado;
    }

    const empleados = await prisma.empleado.findMany({
      where,
      include: {
        nominas: {
          where: mes > 0 ? { mes, anio } : { anio },
          orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
          take: mes > 0 ? 1 : 12,
        },
        _count: {
          select: {
            imputaciones: true,
            asignaciones: true,
          },
        },
      },
      orderBy: { nombreCompleto: 'asc' },
    });

    // Calcular totales
    const totales = {
      totalEmpleados: empleados.length,
      totalActivos: empleados.filter(e => e.estado === 'ACTIVO').length,
      totalCosteEmpresa: 0,
      totalNeto: 0,
      totalSSEmpresa: 0,
    };

    empleados.forEach(emp => {
      if (emp.nominas.length > 0) {
        const ultimaNomina = emp.nominas[0];
        totales.totalCosteEmpresa += ultimaNomina.costeTotalEmpresa || 0;
        totales.totalNeto += ultimaNomina.netoPercibir || 0;
        totales.totalSSEmpresa += ultimaNomina.ssEmpresa || 0;
      }
    });

    return NextResponse.json({ empleados, totales });
  } catch (error: any) {
    console.error('Error en GET /api/admin/empleados:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
