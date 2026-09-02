import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveEmpleado } from '@/lib/empleado-impersonation';
import {
  buildEmployeeTimesheetSummary,
  FECHA_INICIO_CONTROL_IMPUTACIONES,
  getMadridTodayIso,
  getWorkWeek,
  parseDateOnly,
} from '@/lib/imputaciones-diarias';

/**
 * GET /api/empleado/alertas
 * Devuelve alertas para el empleado:
 * - Horas pendientes de imputar en proyectos asignados
 * - Dias laborables sin imputar desde 01/09/2026 (descontando vacaciones/bajas)
 */
export async function GET(req: NextRequest) {
  try {
    const { empleado, error, status } = await resolveEmpleado(req);
    if (!empleado) {
      return NextResponse.json({ error }, { status });
    }

    const alertas: any[] = [];
    let resumenImputaciones = null;

    // 1. Peticiones entregadas que necesitan la validación del solicitante
    if (empleado.email) {
      const peticionesPendientes = await prisma.peticionInterna.findMany({
        where: {
          usuarioEmail: { equals: empleado.email.toLowerCase(), mode: 'insensitive' },
          estado: 'pendiente_validacion',
        },
        select: { id: true, titulo: true, fechaResolucion: true },
        orderBy: { fechaResolucion: 'asc' },
      });

      if (peticionesPendientes.length > 0) {
        alertas.push({
          tipo: 'peticiones_pendientes_validacion',
          nivel: 'info',
          titulo: peticionesPendientes.length === 1
            ? 'Tienes una petición pendiente de validar'
            : `Tienes ${peticionesPendientes.length} peticiones pendientes de validar`,
          descripcion: 'Revisa lo realizado y confirma si cumple tus requisitos o indica qué ajustes necesitas.',
          peticiones: peticionesPendientes,
        });
      }
    }

    // 2. Horas pendientes en proyectos asignados
    const asignaciones = await prisma.asignacionProyecto.findMany({
      where: { empleadoId: empleado.id, activa: true, horasEstimadas: { not: null, gt: 0 } },
      include: { proyecto: { select: { id: true, nombre: true, tipo: true, estado: true } } },
    });

    if (asignaciones.length > 0) {
      const imputacionesPorProyecto = await prisma.imputacionHoras.groupBy({
        by: ['proyectoId'],
        where: { empleadoId: empleado.id, proyectoId: { in: asignaciones.map(a => a.proyectoId) } },
        _sum: { horas: true },
      });
      const imputMap: Record<string, number> = {};
      imputacionesPorProyecto.forEach(g => {
        if (g.proyectoId) imputMap[g.proyectoId] = g._sum.horas || 0;
      });

      const proyectosPendientes = asignaciones
        .map(a => ({
          proyecto: a.proyecto,
          horasEstimadas: a.horasEstimadas || 0,
          horasImputadas: imputMap[a.proyectoId] || 0,
          horasPendientes: Math.max(0, (a.horasEstimadas || 0) - (imputMap[a.proyectoId] || 0)),
        }))
        .filter(p => p.horasPendientes > 0);

      if (proyectosPendientes.length > 0) {
        const totalPendientes = proyectosPendientes.reduce((s, p) => s + p.horasPendientes, 0);
        alertas.push({
          tipo: 'proyectos_pendientes',
          nivel: 'warning',
          titulo: `Tienes ${totalPendientes}h pendientes de imputar en proyectos`,
          descripcion: proyectosPendientes.map(p => `${p.proyecto.nombre}: ${p.horasPendientes}h`).join(', '),
          proyectos: proyectosPendientes,
        });
      }
    }

    // 3. Balance diario personal y aviso interno cuando una jornada incompleta supera 48 horas laborables
    const todayIso = getMadridTodayIso();
    const currentWeek = getWorkWeek(todayIso);
    const controlStart = parseDateOnly(FECHA_INICIO_CONTROL_IMPUTACIONES);
    const queryStart = currentWeek.startDate < controlStart ? currentWeek.startDate : controlStart;

    const [dailyImputations, absences] = await Promise.all([
      prisma.imputacionHoras.groupBy({
        by: ['empleadoId', 'fecha'],
        where: {
          empleadoId: empleado.id,
          fecha: { gte: queryStart, lte: currentWeek.endDate },
        },
        _sum: { horas: true },
        _count: { _all: true },
      }),
      prisma.calendarioPersonal.findMany({
        where: {
          estado: { in: ['APROBADO', 'SOLICITADO'] },
          fechaInicio: { lte: currentWeek.endDate },
          fechaFin: { gte: queryStart },
          OR: [
            { empleadoId: empleado.id },
            { empleadoId: null },
          ],
        },
        select: {
          empleadoId: true,
          empleadoNombre: true,
          tipo: true,
          estado: true,
          fechaInicio: true,
          fechaFin: true,
          horaInicio: true,
          horaFin: true,
          tipoPermiso: true,
        },
      }),
    ]);

    resumenImputaciones = buildEmployeeTimesheetSummary({
      todayIso,
      employee: {
        id: empleado.id,
        nombreCompleto: empleado.nombreCompleto,
        departamento: empleado.departamento,
        fechaAlta: empleado.fechaAlta,
        fechaBaja: empleado.fechaBaja,
      },
      imputations: dailyImputations.map(entry => ({
        empleadoId: entry.empleadoId,
        fecha: entry.fecha,
        horas: entry._sum.horas || 0,
        registros: entry._count._all,
      })),
      absences,
    });

    if (resumenImputaciones.alerta48h) {
      alertas.push({
        tipo: 'horas_sin_imputar_48h',
        nivel: 'error',
        titulo: `${resumenImputaciones.acumulado.horasPendientesMas48h} h llevan más de 48 horas pendientes`,
        descripcion: 'Revisa las jornadas indicadas cuando puedas. Vacaciones, permisos, bajas y fines de semana ya están descontados automáticamente.',
        diasSinImputar: resumenImputaciones.acumulado.diasPendientesMas48h,
      });
    } else if (resumenImputaciones.acumulado.horasPendientesVencidas > 0) {
      alertas.push({
        tipo: 'horas_sin_imputar',
        nivel: 'warning',
        titulo: `Tienes ${resumenImputaciones.acumulado.horasPendientesVencidas} h pendientes de completar`,
        descripcion: 'Son jornadas recientes y todavía no han superado las 48 horas. Puedes completarlas desde tu vista semanal.',
        diasSinImputar: resumenImputaciones.acumulado.diasPendientesVencidos,
      });
    }

    return NextResponse.json({ alertas, resumenImputaciones, empleado: { id: empleado.id, nombreCompleto: empleado.nombreCompleto } });
  } catch (error: any) {
    console.error('Error en GET /api/empleado/alertas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
