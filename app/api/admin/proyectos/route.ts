import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD'];

/**
 * GET /api/admin/proyectos
 * Listar proyectos con cálculo de rentabilidad
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

    const where: any = {};
    if (estado !== 'todos') {
      where.estado = estado;
    }

    const proyectos = await prisma.proyecto.findMany({
      where,
      include: {
        asignaciones: {
          include: {
            empleado: {
              select: { id: true, nombreCompleto: true, costeHoraActual: true },
            },
          },
        },
        imputaciones: {
          select: {
            horas: true,
            empleado: {
              select: { costeHoraActual: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calcular rentabilidad de cada proyecto
    const proyectosConRentabilidad = proyectos.map((p) => {
      const horasTotales = p.imputaciones.reduce((sum, imp) => sum + imp.horas, 0);
      const costePersonal = p.imputaciones.reduce((sum, imp) => {
        const costeHora = imp.empleado.costeHoraActual || 0;
        return sum + (imp.horas * costeHora);
      }, 0);
      const presupuesto = p.presupuesto || 0;
      const margen = presupuesto - costePersonal;
      const porcentajeMargen = presupuesto > 0 ? (margen / presupuesto) * 100 : 0;

      return {
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        cliente: p.cliente,
        estado: p.estado,
        presupuesto,
        fechaInicio: p.fechaInicio,
        fechaFin: p.fechaFin,
        asignaciones: p.asignaciones.map(a => ({
          empleado: a.empleado,
          rol: a.rol,
          porcentaje: a.porcentaje,
        })),
        horasTotales,
        costePersonal: Math.round(costePersonal * 100) / 100,
        margen: Math.round(margen * 100) / 100,
        porcentajeMargen: Math.round(porcentajeMargen * 10) / 10,
      };
    });

    return NextResponse.json({ proyectos: proyectosConRentabilidad });
  } catch (error: any) {
    console.error('Error en GET /api/admin/proyectos:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/proyectos
 * Crear un nuevo proyecto
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await req.json();
    const { codigo, nombre, cliente, descripcion, presupuesto, fechaInicio, fechaFin } = body;

    if (!nombre) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const proyecto = await prisma.proyecto.create({
      data: {
        codigo: codigo || null,
        nombre,
        cliente: cliente || null,
        descripcion: descripcion || null,
        presupuesto: presupuesto ? parseFloat(presupuesto) : null,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : null,
        fechaFin: fechaFin ? new Date(fechaFin) : null,
        estado: 'ACTIVO',
      },
    });

    return NextResponse.json({ proyecto }, { status: 201 });
  } catch (error: any) {
    console.error('Error en POST /api/admin/proyectos:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
