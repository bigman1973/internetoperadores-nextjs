import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolveEmpleado } from '@/lib/empleado-impersonation';

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

    // 1. Horas pendientes en proyectos asignados
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

    // 2. Dias sin imputar desde 01/09/2026
    const FECHA_INICIO_CONTROL = new Date('2026-09-01');
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    if (hoy >= FECHA_INICIO_CONTROL) {
      // Obtener dias con imputaciones desde la fecha de inicio
      const imputaciones = await prisma.imputacionHoras.findMany({
        where: {
          empleadoId: empleado.id,
          fecha: { gte: FECHA_INICIO_CONTROL, lte: hoy },
        },
        select: { fecha: true },
      });
      const diasConImputacion = new Set(
        imputaciones.map(i => i.fecha.toISOString().split('T')[0])
      );

      // Obtener vacaciones/bajas/permisos aprobados del empleado en ese periodo
      const ausencias = await prisma.calendarioPersonal.findMany({
        where: {
          empleadoId: empleado.id,
          estado: { in: ['APROBADO', 'SOLICITADO'] },
          fechaInicio: { lte: hoy },
          fechaFin: { gte: FECHA_INICIO_CONTROL },
        },
        select: { fechaInicio: true, fechaFin: true },
      });

      // Crear set de dias de ausencia
      const diasAusencia = new Set<string>();
      ausencias.forEach(a => {
        const start = new Date(Math.max(a.fechaInicio.getTime(), FECHA_INICIO_CONTROL.getTime()));
        const end = new Date(Math.min(a.fechaFin.getTime(), hoy.getTime()));
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          diasAusencia.add(d.toISOString().split('T')[0]);
        }
      });

      // Contar dias laborables sin imputar (lunes a viernes, no ausencia, no hoy)
      let diasSinImputar = 0;
      const ayer = new Date(hoy);
      ayer.setDate(ayer.getDate() - 1); // No contar hoy (aun puede imputar)

      for (let d = new Date(FECHA_INICIO_CONTROL); d <= ayer; d.setDate(d.getDate() + 1)) {
        const dia = d.getDay(); // 0=dom, 6=sab
        if (dia === 0 || dia === 6) continue; // Fin de semana
        const fechaStr = d.toISOString().split('T')[0];
        if (diasAusencia.has(fechaStr)) continue; // Ausencia
        if (!diasConImputacion.has(fechaStr)) {
          diasSinImputar++;
        }
      }

      if (diasSinImputar > 0) {
        alertas.push({
          tipo: 'dias_sin_imputar',
          nivel: diasSinImputar > 5 ? 'error' : 'warning',
          titulo: `Tienes ${diasSinImputar} dia${diasSinImputar > 1 ? 's' : ''} laborable${diasSinImputar > 1 ? 's' : ''} sin imputar`,
          descripcion: `Desde el 1 de septiembre de 2026, es necesario registrar las horas de trabajo diarias. Tienes ${diasSinImputar} dia${diasSinImputar > 1 ? 's' : ''} pendiente${diasSinImputar > 1 ? 's' : ''}.`,
          diasSinImputar,
        });
      }
    }

    return NextResponse.json({ alertas });
  } catch (error: any) {
    console.error('Error en GET /api/empleado/alertas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
