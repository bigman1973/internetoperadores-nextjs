import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planta = searchParams.get('planta') || 'LLEIDA';
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()));
  const mes = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : null;

  const plantaFilter = planta === 'TODAS' ? {} : { planta };

  // === BLOQUE 1: Continuidad Operativa (datos de tickets) ===
  const ticketsWhere = {
    ...plantaFilter,
    anioImportacion: anio,
    ...(mes ? { mesImportacion: mes } : {}),
  };

  const totalTickets = await prisma.ticketDraxton.count({ where: ticketsWhere });

  const ticketsCerrados = await prisma.ticketDraxton.count({
    where: { ...ticketsWhere, estatus: { in: ['Completed', 'Resolved'] } },
  });

  // Tickets por mes
  const ticketsPorMes = await prisma.ticketDraxton.groupBy({
    by: ['mesImportacion'],
    where: { ...plantaFilter, anioImportacion: anio },
    _count: { id: true },
  });

  // Tickets por categoría (nivel 2)
  const ticketsPorCategoria = await prisma.ticketDraxton.groupBy({
    by: ['categoriaNivel2'],
    where: ticketsWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Tickets por técnico
  const ticketsPorTecnico = await prisma.ticketDraxton.groupBy({
    by: ['asignadoA'],
    where: ticketsWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Tickets por severidad
  const ticketsPorSeveridad = await prisma.ticketDraxton.groupBy({
    by: ['severidad'],
    where: ticketsWhere,
    _count: { id: true },
  });

  // SLA status
  const ticketsPorSla = await prisma.ticketDraxton.groupBy({
    by: ['slaStatus'],
    where: ticketsWhere,
    _count: { id: true },
  });

  // MTTR (tiempo medio de resolución en horas) - solo tickets cerrados con fecha cierre
  const ticketsConCierre = await prisma.ticketDraxton.findMany({
    where: { ...ticketsWhere, fechaCierre: { not: null } },
    select: { fechaCreacion: true, fechaCierre: true },
  });

  let mttrHoras = 0;
  if (ticketsConCierre.length > 0) {
    const totalHoras = ticketsConCierre.reduce((acc, t) => {
      const diff = (t.fechaCierre!.getTime() - t.fechaCreacion.getTime()) / (1000 * 60 * 60);
      return acc + diff;
    }, 0);
    mttrHoras = totalHoras / ticketsConCierre.length;
  }

  // Ratio proactividad: tickets tipo SOLICITUDES (generados por IT) vs INCIDENCIAS (usuarios)
  const ticketsProactivos = await prisma.ticketDraxton.count({
    where: { ...ticketsWhere, categoriaTipo: { contains: 'SOLICITUD' } },
  });
  const ratioProactividad = totalTickets > 0 ? (ticketsProactivos / totalTickets) * 100 : 0;

  // Tickets por tipo (solicitudes vs incidencias)
  const ticketsPorTipo = await prisma.ticketDraxton.groupBy({
    by: ['categoriaTipo'],
    where: ticketsWhere,
    _count: { id: true },
  });

  // === BLOQUE 2-4: KPIs manuales ===
  const kpiMensual = mes
    ? await prisma.kpiMensualDraxton.findUnique({
        where: { planta_mes_anio: { planta: planta === 'TODAS' ? 'LLEIDA' : planta, mes, anio } },
      })
    : null;

  const kpisAnuales = await prisma.kpiMensualDraxton.findMany({
    where: { ...plantaFilter, anio },
    orderBy: { mes: 'asc' },
  });

  // Acumulados anuales de KPIs manuales
  const acumuladoKpis = kpisAnuales.reduce(
    (acc, k) => ({
      horasAuditorias: acc.horasAuditorias + k.horasAuditorias,
      horasProveedores: acc.horasProveedores + k.horasProveedores,
      horasImplementaciones: acc.horasImplementaciones + k.horasImplementaciones,
      preventivosEjecutados: acc.preventivosEjecutados + k.preventivosEjecutados,
      preventivosplanificados: acc.preventivosplanificados + k.preventivosplanificados,
      horasContratadas: acc.horasContratadas + k.horasContratadas,
      horasEjecutadas: acc.horasEjecutadas + k.horasEjecutadas,
    }),
    {
      horasAuditorias: 0,
      horasProveedores: 0,
      horasImplementaciones: 0,
      preventivosEjecutados: 0,
      preventivosplanificados: 0,
      horasContratadas: 0,
      horasEjecutadas: 0,
    }
  );

  return NextResponse.json({
    filtros: { planta, anio, mes },
    bloque1: {
      totalTickets,
      ticketsCerrados,
      ticketsAbiertos: totalTickets - ticketsCerrados,
      mttrHoras: Math.round(mttrHoras * 10) / 10,
      ratioProactividad: Math.round(ratioProactividad * 10) / 10,
      ticketsPorMes: ticketsPorMes.map(t => ({ mes: t.mesImportacion, total: t._count.id })).sort((a, b) => a.mes - b.mes),
      ticketsPorCategoria: ticketsPorCategoria.map(t => ({ categoria: t.categoriaNivel2 || 'Sin categoría', total: t._count.id })),
      ticketsPorTecnico: ticketsPorTecnico.map(t => ({ tecnico: t.asignadoA || 'Sin asignar', total: t._count.id })),
      ticketsPorSeveridad: ticketsPorSeveridad.map(t => ({ severidad: t.severidad || 'Sin severidad', total: t._count.id })),
      ticketsPorSla: ticketsPorSla.map(t => ({ sla: t.slaStatus || 'Sin SLA', total: t._count.id })),
      ticketsPorTipo: ticketsPorTipo.map(t => ({ tipo: t.categoriaTipo || 'Sin tipo', total: t._count.id })),
    },
    bloque2: {
      kpiMensual,
      acumulado: {
        horasAuditorias: acumuladoKpis.horasAuditorias,
        horasProveedores: acumuladoKpis.horasProveedores,
        horasImplementaciones: acumuladoKpis.horasImplementaciones,
      },
    },
    bloque3: {
      preventivosEjecutados: acumuladoKpis.preventivosEjecutados,
      preventivosplanificados: acumuladoKpis.preventivosplanificados,
      cumplimiento: acumuladoKpis.preventivosplanificados > 0
        ? Math.round((acumuladoKpis.preventivosEjecutados / acumuladoKpis.preventivosplanificados) * 100)
        : 0,
    },
    bloque4: {
      horasContratadas: acumuladoKpis.horasContratadas,
      horasEjecutadas: acumuladoKpis.horasEjecutadas,
      overDelivery: acumuladoKpis.horasContratadas > 0
        ? Math.round(((acumuladoKpis.horasEjecutadas - acumuladoKpis.horasContratadas) / acumuladoKpis.horasContratadas) * 100)
        : 0,
      saturacion: acumuladoKpis.horasContratadas > 0
        ? Math.round((acumuladoKpis.horasEjecutadas / acumuladoKpis.horasContratadas) * 100)
        : 0,
    },
    kpisAnuales,
  });
}
