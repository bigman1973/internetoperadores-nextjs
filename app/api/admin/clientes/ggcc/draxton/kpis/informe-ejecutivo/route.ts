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
  const mesParam = searchParams.get('mes');
  const mes = mesParam ? parseInt(mesParam) : null;

  const plantaFilter = planta === 'TODAS' ? {} : { planta };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Fetch tickets data
  const ticketsWhere = {
    ...plantaFilter,
    anioImportacion: anio,
    ...(mes ? { mesImportacion: mes } : {}),
  };

  const totalTickets = await prisma.ticketDraxton.count({ where: ticketsWhere });
  const ticketsCerrados = await prisma.ticketDraxton.count({
    where: { ...ticketsWhere, estatus: { in: ['Completed', 'Resolved'] } },
  });

  const ticketsPorMes = await prisma.ticketDraxton.groupBy({
    by: ['mesImportacion'],
    where: { ...plantaFilter, anioImportacion: anio },
    _count: { id: true },
  });

  const ticketsPorCategoria = await prisma.ticketDraxton.groupBy({
    by: ['categoriaNivel2'],
    where: ticketsWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 6,
  });

  const ticketsPorTecnico = await prisma.ticketDraxton.groupBy({
    by: ['asignadoA'],
    where: ticketsWhere,
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
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

  // KPIs manuales
  const kpisAnuales = await prisma.kpiMensualDraxton.findMany({
    where: { ...plantaFilter, anio },
    orderBy: { mes: 'asc' },
  });

  const acumulado = kpisAnuales.reduce((acc, k) => ({
    horasAuditorias: acc.horasAuditorias + k.horasAuditorias,
    horasProveedores: acc.horasProveedores + k.horasProveedores,
    horasImplementaciones: acc.horasImplementaciones + k.horasImplementaciones,
    preventivosEjecutados: acc.preventivosEjecutados + k.preventivosEjecutados,
    preventivosplanificados: acc.preventivosplanificados + k.preventivosplanificados,
    horasContratadas: acc.horasContratadas + k.horasContratadas,
    horasEjecutadas: acc.horasEjecutadas + k.horasEjecutadas,
  }), { horasAuditorias: 0, horasProveedores: 0, horasImplementaciones: 0, preventivosEjecutados: 0, preventivosplanificados: 0, horasContratadas: 0, horasEjecutadas: 0 });

  const kpiMes = mes ? kpisAnuales.find(k => k.mes === mes) : null;
  const slaMet = ticketsPorSla.find(s => s.slaStatus === 'Met')?._count.id || 0;
  const slaBreached = ticketsPorSla.find(s => s.slaStatus === 'Breached')?._count.id || 0;
  const periodoTexto = mes ? `${MESES[mes - 1]} ${anio}` : `Año ${anio}`;
  const plantaTexto = planta === 'TODAS' ? 'Todas las plantas' : `Planta ${planta.charAt(0) + planta.slice(1).toLowerCase()}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe KPIs Draxton - ${periodoTexto}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; background: #fff; font-size: 11pt; line-height: 1.5; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #ea580c; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .print-btn:hover { background: #c2410c; }
  @media print { .print-btn { display: none; } }
  .page { page-break-after: always; padding: 40px 50px; min-height: 100vh; }
  .page:last-child { page-break-after: avoid; }
  h1 { font-size: 24pt; color: #1e3a5f; margin-bottom: 5px; }
  h2 { font-size: 14pt; color: #ea580c; margin-bottom: 15px; border-bottom: 2px solid #ea580c; padding-bottom: 5px; }
  h3 { font-size: 11pt; color: #374151; margin-bottom: 8px; }
  .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #1e3a5f; }
  .header .subtitle { color: #6b7280; font-size: 12pt; }
  .header .date { color: #9ca3af; font-size: 10pt; margin-top: 5px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; text-align: center; }
  .card .value { font-size: 22pt; font-weight: 700; color: #1e3a5f; }
  .card .label { font-size: 9pt; color: #6b7280; margin-top: 3px; }
  .card.green { border-color: #86efac; background: #f0fdf4; }
  .card.green .value { color: #166534; }
  .card.red { border-color: #fca5a5; background: #fef2f2; }
  .card.red .value { color: #991b1b; }
  .card.amber { border-color: #fcd34d; background: #fffbeb; }
  .card.amber .value { color: #92400e; }
  .card.blue { border-color: #93c5fd; background: #eff6ff; }
  .card.blue .value { color: #1e40af; }
  .bar-chart { margin: 10px 0; }
  .bar-row { display: flex; align-items: center; margin-bottom: 6px; }
  .bar-label { width: 180px; font-size: 9pt; color: #4b5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-container { flex: 1; height: 16px; background: #f3f4f6; border-radius: 4px; margin: 0 8px; }
  .bar-fill { height: 100%; border-radius: 4px; background: #3b82f6; }
  .bar-value { width: 40px; font-size: 9pt; font-weight: 600; color: #374151; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 15px; }
  th { background: #f3f4f6; padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #d1d5db; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  .text-right { text-align: right; }
  .narrative { background: #f9fafb; border-left: 4px solid #ea580c; padding: 12px 16px; margin: 15px 0; font-size: 10pt; }
  .footer { text-align: center; color: #9ca3af; font-size: 8pt; margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">⬇ Imprimir / Guardar PDF</button>

<!-- PÁGINA 1: Resumen Ejecutivo -->
<div class="page">
  <div class="header">
    <h1>Informe de Rendimiento IT</h1>
    <p class="subtitle">${plantaTexto} · ${periodoTexto}</p>
    <p class="date">Internet Operadores · Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>

  <h2>Resumen Ejecutivo</h2>
  ${kpiMes?.resumenEjecutivo ? `<div class="narrative">${kpiMes.resumenEjecutivo.replace(/\n/g, '<br>')}</div>` : '<div class="narrative">Pendiente de completar el resumen ejecutivo del periodo.</div>'}

  <div class="grid-4">
    <div class="card blue"><div class="value">${totalTickets}</div><div class="label">Tickets Totales</div></div>
    <div class="card green"><div class="value">${ticketsCerrados}</div><div class="label">Resueltos</div></div>
    <div class="card amber"><div class="value">${mttrHoras}h</div><div class="label">MTTR</div></div>
    <div class="card ${slaBreached > 5 ? 'red' : 'green'}"><div class="value">${slaMet}</div><div class="label">SLA Cumplido</div></div>
  </div>

  <h2>Distribución de Tickets por Mes</h2>
  <table>
    <tr><th>Mes</th>${ticketsPorMes.sort((a, b) => a.mesImportacion - b.mesImportacion).map(t => `<th class="text-right">${MESES[t.mesImportacion - 1]?.substring(0, 3)}</th>`).join('')}<th class="text-right">Total</th></tr>
    <tr><td>Tickets</td>${ticketsPorMes.sort((a, b) => a.mesImportacion - b.mesImportacion).map(t => `<td class="text-right">${t._count.id}</td>`).join('')}<td class="text-right"><strong>${totalTickets}</strong></td></tr>
  </table>

  <h2>Distribución por Técnico</h2>
  <div class="bar-chart">
    ${ticketsPorTecnico.filter(t => t.asignadoA).map(t => {
      const pct = totalTickets > 0 ? (t._count.id / totalTickets) * 100 : 0;
      return `<div class="bar-row"><span class="bar-label">${t.asignadoA}</span><div class="bar-container"><div class="bar-fill" style="width:${pct}%;background:#ea580c"></div></div><span class="bar-value">${t._count.id}</span></div>`;
    }).join('')}
  </div>
</div>

<!-- PÁGINA 2: Dashboard Operativo -->
<div class="page">
  <h2>Bloque 1: Continuidad Operativa</h2>
  
  <h3>Top Categorías de Tickets</h3>
  <div class="bar-chart">
    ${ticketsPorCategoria.map(t => {
      const pct = totalTickets > 0 ? (t._count.id / totalTickets) * 100 : 0;
      return `<div class="bar-row"><span class="bar-label">${t.categoriaNivel2 || 'Sin categoría'}</span><div class="bar-container"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-value">${t._count.id}</span></div>`;
    }).join('')}
  </div>

  <h3>Estado de SLAs</h3>
  <div class="grid-3">
    <div class="card green"><div class="value">${slaMet}</div><div class="label">Met (Cumplido)</div></div>
    <div class="card red"><div class="value">${slaBreached}</div><div class="label">Breached (Incumplido)</div></div>
    <div class="card"><div class="value">${totalTickets - slaMet - slaBreached}</div><div class="label">Active / Otros</div></div>
  </div>

  <h2>Bloque 2: Valor Añadido (Lo Invisible)</h2>
  <p style="font-size:9pt;color:#6b7280;margin-bottom:10px;">Horas dedicadas a tareas que no generan ticket pero aportan valor estratégico al servicio.</p>
  <div class="grid-3">
    <div class="card green"><div class="value">${acumulado.horasAuditorias}h</div><div class="label">Soporte a Auditorías<br><small>ISO, IATF, OEM</small></div></div>
    <div class="card blue"><div class="value">${acumulado.horasProveedores}h</div><div class="label">Gestión Proveedores<br><small>Alarmas, seguridad</small></div></div>
    <div class="card amber"><div class="value">${acumulado.horasImplementaciones}h</div><div class="label">Implementaciones<br><small>Mejoras, despliegues</small></div></div>
  </div>
  ${acumulado.horasAuditorias + acumulado.horasProveedores + acumulado.horasImplementaciones === 0 ? '<div class="narrative">Pendiente de registrar las horas de tareas de alto valor del periodo.</div>' : ''}
</div>

<!-- PÁGINA 3: Control de Activos y Balance -->
<div class="page">
  <h2>Bloque 3: Control de Activos y Riesgos Mitigados</h2>
  
  <div class="grid-2">
    <div class="card">
      <div class="value">${acumulado.preventivosEjecutados}/${acumulado.preventivosplanificados}</div>
      <div class="label">Preventivos Ejecutados / Planificados</div>
    </div>
    <div class="card ${acumulado.preventivosplanificados > 0 && (acumulado.preventivosEjecutados / acumulado.preventivosplanificados) >= 0.9 ? 'green' : 'amber'}">
      <div class="value">${acumulado.preventivosplanificados > 0 ? Math.round((acumulado.preventivosEjecutados / acumulado.preventivosplanificados) * 100) : 0}%</div>
      <div class="label">Cumplimiento Preventivos</div>
    </div>
  </div>

  <h2>Bloque 4: Balance de Recursos</h2>
  <p style="font-size:9pt;color:#6b7280;margin-bottom:10px;">Comparativa entre las horas contratadas y las realmente ejecutadas por el equipo IO.</p>
  
  <div class="grid-3">
    <div class="card"><div class="value">${acumulado.horasContratadas}h</div><div class="label">Horas Contratadas</div></div>
    <div class="card ${acumulado.horasEjecutadas > acumulado.horasContratadas ? 'red' : 'green'}"><div class="value">${acumulado.horasEjecutadas}h</div><div class="label">Horas Ejecutadas</div></div>
    <div class="card ${acumulado.horasEjecutadas > acumulado.horasContratadas ? 'red' : 'green'}">
      <div class="value">${acumulado.horasContratadas > 0 ? (acumulado.horasEjecutadas > acumulado.horasContratadas ? '+' : '') + Math.round(((acumulado.horasEjecutadas - acumulado.horasContratadas) / acumulado.horasContratadas) * 100) : 0}%</div>
      <div class="label">Over-delivery</div>
    </div>
  </div>

  ${acumulado.horasContratadas > 0 && acumulado.horasEjecutadas > acumulado.horasContratadas ? `
  <div class="narrative">
    <strong>Nota:</strong> El equipo IO está ejecutando un ${Math.round(((acumulado.horasEjecutadas - acumulado.horasContratadas) / acumulado.horasContratadas) * 100)}% más de horas de las contratadas. 
    Esto evidencia un nivel de servicio superior al pactado, lo cual debe considerarse en la próxima revisión contractual.
  </div>` : ''}

  <h2>Evolución Mensual</h2>
  <table>
    <tr><th>Mes</th><th class="text-right">Tickets</th><th class="text-right">H. Auditorías</th><th class="text-right">H. Proveedores</th><th class="text-right">H. Implement.</th><th class="text-right">H. Contrat.</th><th class="text-right">H. Ejecut.</th></tr>
    ${kpisAnuales.map(k => {
      const ticketsMes = ticketsPorMes.find(t => t.mesImportacion === k.mes);
      return `<tr><td>${MESES[k.mes - 1]?.substring(0, 3)}</td><td class="text-right">${ticketsMes?._count.id || '—'}</td><td class="text-right">${k.horasAuditorias || '—'}</td><td class="text-right">${k.horasProveedores || '—'}</td><td class="text-right">${k.horasImplementaciones || '—'}</td><td class="text-right">${k.horasContratadas || '—'}</td><td class="text-right">${k.horasEjecutadas || '—'}</td></tr>`;
    }).join('')}
  </table>
</div>

<!-- PÁGINA 4: Recomendaciones -->
<div class="page">
  <h2>Recomendaciones y Próximos Pasos</h2>
  
  ${kpiMes?.recomendaciones ? `<div class="narrative">${kpiMes.recomendaciones.replace(/\n/g, '<br>')}</div>` : `
  <div class="narrative">
    Las recomendaciones se generarán a partir de los datos registrados en los KPIs manuales de cada mes.
  </div>`}

  <h3 style="margin-top:20px;">Indicadores Clave para Seguimiento</h3>
  <table>
    <tr><th>Indicador</th><th>Valor Actual</th><th>Objetivo</th><th>Estado</th></tr>
    <tr><td>Tickets resueltos / Total</td><td class="text-right">${totalTickets > 0 ? Math.round((ticketsCerrados / totalTickets) * 100) : 0}%</td><td class="text-right">&gt; 95%</td><td>${totalTickets > 0 && (ticketsCerrados / totalTickets) >= 0.95 ? '✅' : '⚠️'}</td></tr>
    <tr><td>MTTR (horas)</td><td class="text-right">${mttrHoras}h</td><td class="text-right">&lt; 24h</td><td>${mttrHoras <= 24 ? '✅' : '⚠️'}</td></tr>
    <tr><td>SLA cumplido</td><td class="text-right">${slaMet}</td><td class="text-right">&gt; 95% tickets</td><td>${totalTickets > 0 && (slaMet / totalTickets) >= 0.95 ? '✅' : '⚠️'}</td></tr>
    <tr><td>Cumplimiento preventivos</td><td class="text-right">${acumulado.preventivosplanificados > 0 ? Math.round((acumulado.preventivosEjecutados / acumulado.preventivosplanificados) * 100) : 0}%</td><td class="text-right">&gt; 90%</td><td>${acumulado.preventivosplanificados > 0 && (acumulado.preventivosEjecutados / acumulado.preventivosplanificados) >= 0.9 ? '✅' : '⚠️'}</td></tr>
    <tr><td>Saturación equipo</td><td class="text-right">${acumulado.horasContratadas > 0 ? Math.round((acumulado.horasEjecutadas / acumulado.horasContratadas) * 100) : 0}%</td><td class="text-right">&lt; 110%</td><td>${acumulado.horasContratadas > 0 && (acumulado.horasEjecutadas / acumulado.horasContratadas) <= 1.1 ? '✅' : '🔴'}</td></tr>
  </table>

  <div class="footer">
    <p>Internet Operadores · Informe de Rendimiento IT · ${plantaTexto} · ${periodoTexto}</p>
    <p>Documento generado automáticamente el ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
  </div>
</div>

</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
