import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'FINANCIERO'];

/**
 * GET /api/admin/empleados/[id]
 * Detalle de un empleado con todas sus nóminas e imputaciones
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const empleado = await prisma.empleado.findUnique({
      where: { id: params.id },
      include: {
        nominas: {
          orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        },
        asignaciones: {
          include: {
            proyecto: true,
          },
          where: { activa: true },
        },
        imputaciones: {
          orderBy: { fecha: 'desc' },
          take: 50,
          include: {
            proyecto: {
              select: { nombre: true, codigo: true },
            },
          },
        },
      },
    });

    if (!empleado) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    }

    // Calcular resumen de costes anuales
    const nominasAnio = empleado.nominas.filter(n => n.anio === 2026);
    const resumenAnual = {
      mesesRegistrados: nominasAnio.length,
      totalCosteEmpresa: nominasAnio.reduce((sum, n) => sum + (n.costeTotalEmpresa || 0), 0),
      totalNeto: nominasAnio.reduce((sum, n) => sum + n.netoPercibir, 0),
      totalSSEmpresa: nominasAnio.reduce((sum, n) => sum + (n.ssEmpresa || 0), 0),
      totalIRPF: nominasAnio.reduce((sum, n) => sum + (n.irpf || 0), 0),
      promedioCosteEmpresaMensual: 0,
    };
    if (resumenAnual.mesesRegistrados > 0) {
      resumenAnual.promedioCosteEmpresaMensual = resumenAnual.totalCosteEmpresa / resumenAnual.mesesRegistrados;
    }

    return NextResponse.json({ empleado, resumenAnual });
  } catch (error: any) {
    console.error('Error en GET /api/admin/empleados/[id]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/empleados/[id]
 * Actualizar datos de un empleado
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await req.json();
    const { departamento, categoria, estado, costeHoraActual } = body;

    const empleado = await prisma.empleado.update({
      where: { id: params.id },
      data: {
        ...(departamento !== undefined && { departamento }),
        ...(categoria !== undefined && { categoria }),
        ...(estado !== undefined && { estado }),
        ...(costeHoraActual !== undefined && { costeHoraActual }),
      },
    });

    return NextResponse.json({ empleado });
  } catch (error: any) {
    console.error('Error en PATCH /api/admin/empleados/[id]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
