import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(n: number | null | undefined): string {
  if (!n && n !== 0) return '0,00 €';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {

  const { searchParams } = new URL(req.url);
  const mes = parseInt(searchParams.get('mes') || String(new Date().getMonth()));
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()));
  const planta = searchParams.get('planta') || 'TODAS';
  const baseUrl = new URL(req.url).origin;
  const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`;

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mesNombre = MESES[mes - 1] || 'Enero';
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  const plantaFilter = planta === 'TODAS' ? {} : { planta };

  // Fetch informe guardado
  const informe = await prisma.informeMensualDraxton.findUnique({
    where: { mes_anio_planta: { mes, anio, planta } },
  });

  // Tickets del mes
  const ticketsWhere = { ...plantaFilter, anioImportacion: anio, mesImportacion: mes };
  const totalTickets = await prisma.ticketDraxton.count({ where: ticketsWhere });
  const ticketsCerrados = await prisma.ticketDraxton.count({
    where: { ...ticketsWhere, estatus: { in: ['Completed', 'Resolved'] } },
  });

  const ticketsPorCategoria = await prisma.ticketDraxton.groupBy({
    by: ['categoriaNivel2'],
    where: ticketsWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 6,
  });

  const ticketsPorSla = await prisma.ticketDraxton.groupBy({
    by: ['slaStatus'],
    where: ticketsWhere,
    _count: { id: true },
  });

  // MTTR
  const ticketsConCierre = await prisma.ticketDraxton.findMany({
    where: { ...ticketsWhere, fechaCierre: { not: null } },
    select: { fechaCreacion: true, fechaCierre: true },
  });
  let mttrHoras = 0;
  if (ticketsConCierre.length > 0) {
    const totalH = ticketsConCierre.reduce((acc, t) => acc + (t.fechaCierre!.getTime() - t.fechaCreacion.getTime()) / (1000 * 60 * 60), 0);
    mttrHoras = Math.round((totalH / ticketsConCierre.length) * 10) / 10;
  }

  const slaMet = ticketsPorSla.find(s => s.slaStatus === 'Met')?._count.id || 0;
  const slaBreached = ticketsPorSla.find(s => s.slaStatus === 'Breached')?._count.id || 0;
  const slaPct = totalTickets > 0 ? Math.round((slaMet / totalTickets) * 100) : 0;

  // KPIs manuales del mes
  const kpiMes = await prisma.kpiMensualDraxton.findFirst({
    where: { mes, anio, ...(planta !== 'TODAS' ? { planta } : {}) },
  });

  // Proyectos internos
  const proyectos = await prisma.proyectoContratoDraxton.findMany({
    where: { activo: true },
    include: { responsable: { select: { nombreCompleto: true } } },
    orderBy: [{ prioridad: 'asc' }, { orden: 'asc' }],
  });
  const proyectosEnCurso = proyectos.filter(p => p.estado === 'en_curso');
  const mejorasEjecutadas = proyectos.filter(p => p.categoria === 'mejora_ejecutada');
  const proyectosCompletados = proyectos.filter(p => p.estado === 'completado');

  // Contratos activos (facturación)
  const contratos = await prisma.contratoDraxton.findMany({
    where: { estado: 'Activo' },
    select: { titulo: true, importeMensual: true, horasContratadas: true },
  });
  const totalFacturacion = contratos.reduce((s, c) => s + (Number(c.importeMensual) || 0), 0);
  const totalHorasContratadas = contratos.reduce((s, c) => s + (c.horasContratadas || 0), 0);

  const plantaTexto = planta === 'TODAS' ? 'Todas las plantas' : `Planta ${planta.charAt(0) + planta.slice(1).toLowerCase()}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe Mensual Draxton - ${mesNombre} ${anio}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; font-size: 10px; line-height: 1.6; color: #1f2937; background: white; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    body { margin: 0; padding: 0; }
    .page { page-break-after: always; page-break-inside: avoid; }
    .page:last-child { page-break-after: auto; }
    .no-print { display: none !important; }
  }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 18mm 25mm 18mm; position: relative; background: white; }
  .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 2px solid #E87A2E; margin-bottom: 20px; }
  .page-header img { height: 36px; object-fit: contain; }
  .page-header-right { text-align: right; font-size: 9px; color: #6b7280; }
  .page-footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 4px; }
  h2 { font-size: 13px; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6; }
  h3 { font-size: 11px; font-weight: 600; color: #1f2937; margin: 12px 0 6px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi-box { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
  .kpi-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px; }
  .kpi-value { font-size: 20px; font-weight: 800; }
  .narrative { background: #f9fafb; border-left: 4px solid #E87A2E; padding: 12px 16px; margin: 12px 0; font-size: 10px; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 16px; }
  thead th { background: #1f2937; color: white; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .badge { display: inline-block; font-size: 8px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
  .badge-green { background: #F0FDF4; color: #16a34a; }
  .badge-orange { background: #FFF3E8; color: #E87A2E; }
  .badge-blue { background: #EFF6FF; color: #2563eb; }
  .badge-gray { background: #f3f4f6; color: #6b7280; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
  .project-card { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #E87A2E; }
  .project-card.completado { border-left-color: #16a34a; }
  .bar-row { display: flex; align-items: center; margin-bottom: 5px; }
  .bar-label { width: 160px; font-size: 9px; color: #4b5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-container { flex: 1; height: 14px; background: #f3f4f6; border-radius: 4px; margin: 0 8px; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .bar-value { width: 35px; font-size: 9px; font-weight: 600; color: #374151; text-align: right; }
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 10px 20px; background: #E87A2E; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; z-index: 1000; box-shadow: 0 4px 12px rgba(232,122,46,0.3); }
  .print-btn:hover { background: #d06a1f; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">⬇ Imprimir / Guardar PDF</button>

<!-- PÁGINA 1: Resumen y KPIs -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME DE SERVICIOS</div>
      <div>Cliente: <strong>Draxton</strong></div>
      <div>${fecha}</div>
    </div>
  </div>

  <h1>Informe Mensual de Servicios IT</h1>
  <p style="font-size:11px;color:#6b7280;margin-bottom:20px;">${mesNombre} ${anio} — ${plantaTexto}</p>

  ${informe?.resumenEjecutivo ? `
  <h2 style="border-bottom:2px solid #E87A2E;">Resumen Ejecutivo</h2>
  <div class="narrative">${informe.resumenEjecutivo.replace(/\n/g, '<br>')}</div>
  ` : ''}

  <h2>Indicadores Clave del Periodo</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Tickets Gestionados</div>
      <div class="kpi-value" style="color:#2563eb;">${totalTickets}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Resueltos</div>
      <div class="kpi-value" style="color:#16a34a;">${ticketsCerrados}</div>
      <div style="font-size:8px;color:#6b7280;margin-top:2px;">${totalTickets > 0 ? Math.round((ticketsCerrados / totalTickets) * 100) : 0}% resolución</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Tiempo Medio Resolución</div>
      <div class="kpi-value" style="color:#d97706;">${mttrHoras}h</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">SLA Cumplido</div>
      <div class="kpi-value" style="color:${slaPct >= 95 ? '#16a34a' : '#dc2626'};">${slaPct}%</div>
      <div style="font-size:8px;color:#6b7280;margin-top:2px;">${slaMet} de ${slaMet + slaBreached}</div>
    </div>
  </div>

  <h2>Incidencias por Categoría</h2>
  <div style="margin-bottom:16px;">
    ${ticketsPorCategoria.map(t => {
      const pct = totalTickets > 0 ? (t._count.id / totalTickets) * 100 : 0;
      return `<div class="bar-row"><span class="bar-label">${t.categoriaNivel2 || 'General'}</span><div class="bar-container"><div class="bar-fill" style="width:${pct}%;background:#2563eb"></div></div><span class="bar-value">${t._count.id}</span></div>`;
    }).join('')}
  </div>

  ${kpiMes && kpiMes.horasContratadas > 0 ? `
  <h2>Horas Consumidas vs Contratadas</h2>
  <div class="grid-3">
    <div class="kpi-box" style="border-left:3px solid #374151;">
      <div class="kpi-label">Horas Contratadas</div>
      <div class="kpi-value" style="color:#374151;font-size:18px;">${kpiMes.horasContratadas}h</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid #2563eb;">
      <div class="kpi-label">Horas Ejecutadas</div>
      <div class="kpi-value" style="color:#2563eb;font-size:18px;">${kpiMes.horasEjecutadas}h</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid ${kpiMes.horasEjecutadas > kpiMes.horasContratadas ? '#E87A2E' : '#16a34a'};">
      <div class="kpi-label">Utilización</div>
      <div class="kpi-value" style="color:${kpiMes.horasEjecutadas > kpiMes.horasContratadas ? '#E87A2E' : '#16a34a'};font-size:18px;">${Math.round((kpiMes.horasEjecutadas / kpiMes.horasContratadas) * 100)}%</div>
    </div>
  </div>
  ` : totalHorasContratadas > 0 ? `
  <h2>Capacidad Contratada</h2>
  <p style="font-size:10px;color:#6b7280;">Total horas mensuales contratadas: <strong>${totalHorasContratadas}h</strong> distribuidas en ${contratos.length} contratos activos.</p>
  ` : ''}

  <div class="page-footer">
    <span>Internet Operadores S.L. — Informe de Servicios IT</span>
    <span>Página 1</span>
  </div>
</div>

<!-- PÁGINA 2: Proyectos y Mejoras -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME DE SERVICIOS</div>
      <div>Cliente: <strong>Draxton</strong></div>
      <div>${fecha}</div>
    </div>
  </div>

  <h2 style="border-bottom:2px solid #059669;">Proyectos en Curso</h2>
  ${proyectosEnCurso.length > 0 ? `
  ${proyectosEnCurso.map(p => `
    <div class="project-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:10px;">${p.titulo}</strong>
        <span class="badge badge-orange">${p.prioridad}</span>
      </div>
      ${p.descripcion ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">${p.descripcion}</div>` : ''}
      <div style="display:flex;gap:12px;margin-top:4px;font-size:8px;color:#9ca3af;">
        ${p.responsable ? `<span>Responsable: ${p.responsable.nombreCompleto}</span>` : ''}
        ${p.fechaFinPrevista ? `<span>Fecha prevista: ${formatDate(p.fechaFinPrevista)}</span>` : ''}
      </div>
      ${p.impacto ? `<div style="font-size:9px;color:#059669;margin-top:3px;font-style:italic;">Impacto: ${p.impacto}</div>` : ''}
    </div>
  `).join('')}
  ` : '<p style="font-size:10px;color:#6b7280;">No hay proyectos en curso actualmente.</p>'}

  ${mejorasEjecutadas.length > 0 || proyectosCompletados.length > 0 ? `
  <h2 style="border-bottom:2px solid #16a34a;">Mejoras Implementadas</h2>
  ${[...mejorasEjecutadas, ...proyectosCompletados].map(p => `
    <div class="project-card completado">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:10px;">${p.titulo}</strong>
        <span class="badge badge-green">${p.categoria === 'mejora_ejecutada' ? 'mejora' : 'completado'}</span>
      </div>
      ${p.descripcion ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">${p.descripcion}</div>` : ''}
      ${p.impacto ? `<div style="font-size:9px;color:#16a34a;margin-top:3px;font-style:italic;">Impacto: ${p.impacto}</div>` : ''}
    </div>
  `).join('')}
  ` : ''}

  ${kpiMes && (kpiMes.horasAuditorias > 0 || kpiMes.horasProveedores > 0 || kpiMes.horasImplementaciones > 0) ? `
  <h2 style="border-bottom:2px solid #2563eb;">Tareas de Valor Añadido</h2>
  <p style="font-size:9px;color:#6b7280;margin-bottom:10px;">Actividades adicionales realizadas fuera del ámbito de soporte reactivo.</p>
  <div class="grid-3">
    ${kpiMes.horasAuditorias > 0 ? `<div class="kpi-box" style="border-left:3px solid #059669;"><div class="kpi-label">Soporte Auditorías</div><div class="kpi-value" style="font-size:16px;color:#059669;">${kpiMes.horasAuditorias}h</div></div>` : ''}
    ${kpiMes.horasProveedores > 0 ? `<div class="kpi-box" style="border-left:3px solid #2563eb;"><div class="kpi-label">Gestión Proveedores</div><div class="kpi-value" style="font-size:16px;color:#2563eb;">${kpiMes.horasProveedores}h</div></div>` : ''}
    ${kpiMes.horasImplementaciones > 0 ? `<div class="kpi-box" style="border-left:3px solid #d97706;"><div class="kpi-label">Implementaciones</div><div class="kpi-value" style="font-size:16px;color:#d97706;">${kpiMes.horasImplementaciones}h</div></div>` : ''}
  </div>
  ` : ''}

  <div class="page-footer">
    <span>Internet Operadores S.L. — Informe de Servicios IT</span>
    <span>Página 2</span>
  </div>
</div>

<!-- PÁGINA 3: Facturación y Recomendaciones -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME DE SERVICIOS</div>
      <div>Cliente: <strong>Draxton</strong></div>
      <div>${fecha}</div>
    </div>
  </div>

  <h2 style="border-bottom:2px solid #374151;">Facturación del Periodo</h2>
  <table>
    <thead><tr><th>Contrato</th><th style="text-align:right">Importe Mensual</th><th style="text-align:right">Horas Incluidas</th></tr></thead>
    <tbody>
      ${contratos.map(c => `<tr><td>${c.titulo}</td><td style="text-align:right">${formatCurrency(Number(c.importeMensual))}</td><td style="text-align:right">${c.horasContratadas || '—'}h</td></tr>`).join('')}
      <tr style="background:#f3f4f6;font-weight:700;"><td>TOTAL</td><td style="text-align:right">${formatCurrency(totalFacturacion)}</td><td style="text-align:right">${totalHorasContratadas}h</td></tr>
    </tbody>
  </table>

  ${informe?.recomendaciones ? `
  <h2 style="border-bottom:2px solid #E87A2E;">Recomendaciones y Próximos Pasos</h2>
  <div class="narrative">${informe.recomendaciones.replace(/\n/g, '<br>')}</div>
  ` : ''}

  <h2 style="border-bottom:2px solid #374151;">Resumen de KPIs — Semáforo</h2>
  <table>
    <thead><tr><th>Indicador</th><th style="text-align:right">Valor</th><th style="text-align:right">Objetivo</th><th style="text-align:center">Estado</th></tr></thead>
    <tbody>
      <tr><td>Tasa de resolución</td><td style="text-align:right">${totalTickets > 0 ? Math.round((ticketsCerrados / totalTickets) * 100) : 0}%</td><td style="text-align:right">&gt; 95%</td><td style="text-align:center">${totalTickets > 0 && (ticketsCerrados / totalTickets) >= 0.95 ? '✅' : '⚠️'}</td></tr>
      <tr><td>MTTR</td><td style="text-align:right">${mttrHoras}h</td><td style="text-align:right">&lt; 24h</td><td style="text-align:center">${mttrHoras <= 24 ? '✅' : '⚠️'}</td></tr>
      <tr><td>SLA cumplido</td><td style="text-align:right">${slaPct}%</td><td style="text-align:right">&gt; 95%</td><td style="text-align:center">${slaPct >= 95 ? '✅' : '⚠️'}</td></tr>
      ${kpiMes && kpiMes.preventivosplanificados > 0 ? `<tr><td>Preventivos ejecutados</td><td style="text-align:right">${Math.round((kpiMes.preventivosEjecutados / kpiMes.preventivosplanificados) * 100)}%</td><td style="text-align:right">&gt; 90%</td><td style="text-align:center">${(kpiMes.preventivosEjecutados / kpiMes.preventivosplanificados) >= 0.9 ? '✅' : '⚠️'}</td></tr>` : ''}
    </tbody>
  </table>

  <div style="margin-top:30px;padding:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;">
    <p style="font-size:9px;color:#0369a1;font-weight:600;margin-bottom:4px;">PRÓXIMA REVISIÓN</p>
    <p style="font-size:10px;color:#374151;">El próximo informe de servicios se entregará en la primera semana de ${MESES[mes % 12] || 'Enero'} ${mes === 12 ? anio + 1 : anio}.</p>
  </div>

  <div class="page-footer">
    <span>Internet Operadores S.L. — Informe de Servicios IT</span>
    <span>Página 3</span>
  </div>
</div>

</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });

  } catch (error: any) {
    console.error('Error generando informe:', error);
    return new NextResponse(`<html><body><h1>Error generando informe</h1><pre>${error.message}</pre></body></html>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
