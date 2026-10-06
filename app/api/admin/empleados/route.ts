import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkAdminAreaRead } from '@/lib/api-admin-area-read';

/**
 * GET /api/admin/empleados
 * Listar empleados con sus datos de nómina y KPIs completos
 * 
 * Query params:
 * - estado: 'todos' | 'ACTIVO' | 'INACTIVO'
 * - periodo: 'mes' | 'T1' | 'T2' | 'T3' | 'T4' | 'anual'
 * - mes: 1-12 (solo cuando periodo='mes')
 * - anio: año (default 2026)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    if (searchParams.get('view') === 'project-select') {
      const denied = await checkAdminAreaRead('admin.proyectos', [], session);
      if (denied) return denied;
      const empleados = await prisma.empleado.findMany({
        select: { id: true, nombreCompleto: true, departamento: true, costeHoraActual: true },
        orderBy: { nombreCompleto: 'asc' },
      });
      return NextResponse.json({ empleados });
    }
    if (searchParams.get('view') === 'career-select') {
      const denied = await checkAdminAreaRead('admin.personal.empleados', ['CONTABILIDAD', 'RRHH'], session);
      if (denied) return denied;
      const empleados = await prisma.empleado.findMany({
        where: { estado: 'ACTIVO' },
        select: { id: true, nombreCompleto: true, categoria: true, estado: true, fechaAlta: true },
        orderBy: { nombreCompleto: 'asc' },
      });
      return NextResponse.json({ empleados });
    }
    const denied = await checkAdminAreaRead('admin.personal.empleados', ['CONTABILIDAD', 'RRHH'], session);
    if (denied) return denied;
    const estado = searchParams.get('estado') || 'todos';
    const periodo = searchParams.get('periodo') || 'mes';
    const mes = parseInt(searchParams.get('mes') || '0');
    const anio = parseInt(searchParams.get('anio') || '2026');

    // Determine which months to query based on periodo
    let mesesFiltro: number[] = [];
    switch (periodo) {
      case 'T1': mesesFiltro = [1, 2, 3]; break;
      case 'T2': mesesFiltro = [4, 5, 6]; break;
      case 'T3': mesesFiltro = [7, 8, 9]; break;
      case 'T4': mesesFiltro = [10, 11, 12]; break;
      case 'anual': mesesFiltro = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; break;
      case 'mes':
      default:
        if (mes > 0) mesesFiltro = [mes];
        break;
    }

    const where: any = {};
    if (estado !== 'todos') {
      where.estado = estado;
    }

    // Build nominas filter
    const nominasWhere: any = { anio };
    if (mesesFiltro.length > 0) {
      nominasWhere.mes = { in: mesesFiltro };
    }

    // Determinar rango de fechas para filtrar entregas a cuenta
    let fechaDesde: Date;
    let fechaHasta: Date;
    if (periodo === 'mes' && mes > 0) {
      fechaDesde = new Date(anio, mes - 1, 1);
      fechaHasta = new Date(anio, mes, 0, 23, 59, 59);
    } else if (mesesFiltro.length > 0) {
      fechaDesde = new Date(anio, Math.min(...mesesFiltro) - 1, 1);
      fechaHasta = new Date(anio, Math.max(...mesesFiltro), 0, 23, 59, 59);
    } else {
      fechaDesde = new Date(anio, 0, 1);
      fechaHasta = new Date(anio, 11, 31, 23, 59, 59);
    }

    const empleados = await prisma.empleado.findMany({
      where,
      include: {
        nominas: {
          where: nominasWhere,
          orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        },
        entregasACuenta: {
          where: {
            fechaOperacion: { gte: fechaDesde, lte: fechaHasta },
          },
          select: {
            id: true,
            importe: true,
            tipoEntrega: true,
            concepto: true,
            fechaOperacion: true,
          },
        },
        condicionesSalariales: {
          orderBy: { fechaEfectiva: 'desc' },
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

    // Calculate totals: sum ALL nóminas in the period (not just the first one)
    const totales = {
      totalEmpleados: empleados.length,
      totalActivos: empleados.filter(e => e.estado === 'ACTIVO').length,
      totalCosteEmpresa: 0,
      totalDevengado: 0,
      totalNeto: 0,
      totalIRPF: 0,
      totalSSTrabajador: 0,
      totalSSEmpresa: 0,
      totalOtrosCostesEmpresa: 0,
      totalAnticipos: 0,
      mesesConDatos: 0,
    };

    // Track which months have data
    const mesesConDatosSet = new Set<number>();

    empleados.forEach(emp => {
      emp.nominas.forEach((nomina: any) => {
        totales.totalCosteEmpresa += nomina.costeTotalEmpresa || 0;
        totales.totalDevengado += nomina.devengadoTotal || 0;
        totales.totalNeto += nomina.netoPercibir || 0;
        totales.totalIRPF += nomina.irpf || 0;
        totales.totalSSTrabajador += nomina.ssTrabajador || 0;
        totales.totalSSEmpresa += nomina.ssEmpresa || 0;
        mesesConDatosSet.add(nomina.mes);
      });
      // Sumar entregas a cuenta
      (emp as any).entregasACuenta?.forEach((entrega: any) => {
        const importeAbs = Math.abs(entrega.importe || 0);
        if (entrega.tipoEntrega === 'coste_empresa') {
          totales.totalOtrosCostesEmpresa += importeAbs;
          totales.totalCosteEmpresa += importeAbs; // Suma al coste total
        } else if (entrega.tipoEntrega === 'anticipo') {
          totales.totalAnticipos += importeAbs;
        }
      });
    });

    totales.mesesConDatos = mesesConDatosSet.size;

    return NextResponse.json({ empleados, totales });
  } catch (error: any) {
    console.error('Error en GET /api/admin/empleados:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
