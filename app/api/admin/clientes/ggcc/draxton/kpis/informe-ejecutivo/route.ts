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

function estilosBase(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 10px;
      line-height: 1.6;
      color: #1f2937;
      background: white;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .page { page-break-after: always; page-break-inside: avoid; }
      .page:last-child { page-break-after: auto; }
      .no-print { display: none !important; }
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 20mm 18mm 25mm 18mm;
      position: relative;
      background: white;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 2px solid #E87A2E;
      margin-bottom: 20px;
    }
    .page-header img {
      height: 36px;
      object-fit: contain;
    }
    .page-header-right {
      text-align: right;
      font-size: 9px;
      color: #6b7280;
    }
    .page-footer {
      position: absolute;
      bottom: 12mm;
      left: 18mm;
      right: 18mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
    }
    h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    h2 { font-size: 13px; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6; }
    h3 { font-size: 11px; font-weight: 600; color: #1f2937; margin: 0; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-box {
      padding: 14px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      text-align: center;
    }
    .kpi-label {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .kpi-value {
      font-size: 20px;
      font-weight: 800;
    }
    .badge {
      display: inline-block;
      font-size: 8px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-orange { background: #FFF3E8; color: #E87A2E; }
    .badge-green { background: #F0FDF4; color: #16a34a; }
    .badge-blue { background: #EFF6FF; color: #2563eb; }
    .badge-red { background: #FEF2F2; color: #dc2626; }
    .badge-gray { background: #f3f4f6; color: #6b7280; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 16px;
    }
    thead th {
      background: #1f2937;
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #f3f4f6;
    }
    tbody tr:nth-child(even) { background: #fafafa; }
    .bar-chart { margin: 10px 0; }
    .bar-row { display: flex; align-items: center; margin-bottom: 5px; }
    .bar-label { width: 160px; font-size: 9px; color: #4b5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-container { flex: 1; height: 14px; background: #f3f4f6; border-radius: 4px; margin: 0 8px; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .bar-value { width: 35px; font-size: 9px; font-weight: 600; color: #374151; text-align: right; }
    .narrative {
      background: #f9fafb;
      border-left: 4px solid #E87A2E;
      padding: 12px 16px;
      margin: 12px 0;
      font-size: 10px;
      line-height: 1.6;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .project-card {
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      margin-bottom: 8px;
      border-left: 3px solid #E87A2E;
    }
    .project-card.completado { border-left-color: #16a34a; }
    .project-card.planificado { border-left-color: #6b7280; }
    .print-btn {
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 10px 20px;
      background: #E87A2E;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(232,122,46,0.3);
    }
    .print-btn:hover { background: #d06a1f; }
  `;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const planta = searchParams.get('planta') || 'LLEIDA';
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()));
  const mesParam = searchParams.get('mes');
  const mes = mesParam ? parseInt(mesParam) : null;
  const baseUrl = new URL(req.url).origin;
  const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`;

  const plantaFilter = planta === 'TODAS' ? {} : { planta };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

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
    take: 8,
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

  // Proyectos internos
  const proyectos = await prisma.proyectoContratoDraxton.findMany({
    where: { activo: true },
    include: { responsable: { select: { nombre: true, apellidos: true } } },
    orderBy: [{ prioridad: 'asc' }, { orden: 'asc' }],
  });

  const proyectosEnCurso = proyectos.filter(p => p.estado === 'en_curso');
  const proyectosCompletados = proyectos.filter(p => p.estado === 'completado');
  const mejorasEjecutadas = proyectos.filter(p => p.categoria === 'mejora_ejecutada');
  const propuestasFuturas = proyectos.filter(p => p.categoria === 'propuesta_futura');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe KPIs Draxton - ${periodoTexto}</title>
<style>${estilosBase()}</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">⬇ Imprimir / Guardar PDF</button>

<!-- PÁGINA 1: Resumen Ejecutivo -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME INTERNO</div>
      <div>${fecha}</div>
      <div style="color:#dc2626;font-weight:700;margin-top:4px;">⚠ CONFIDENCIAL</div>
    </div>
  </div>

  <h1>Informe de Rendimiento IT</h1>
  <p style="font-size:11px;color:#6b7280;margin-bottom:20px;">${plantaTexto} — ${periodoTexto}</p>

  ${kpiMes?.resumenEjecutivo ? `<div class="narrative">${kpiMes.resumenEjecutivo.replace(/\n/g, '<br>')}</div>` : ''}

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Tickets Totales</div>
      <div class="kpi-value" style="color:#2563eb;">${totalTickets}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Resueltos</div>
      <div class="kpi-value" style="color:#16a34a;">${ticketsCerrados}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">MTTR (horas)</div>
      <div class="kpi-value" style="color:#d97706;">${mttrHoras}h</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">SLA Cumplido</div>
      <div class="kpi-value" style="color:${slaBreached > 5 ? '#dc2626' : '#16a34a'};">${slaMet}</div>
    </div>
  </div>

  <h2>Distribución de Tickets por Mes</h2>
  <table>
    <thead><tr><th>Mes</th>${ticketsPorMes.sort((a, b) => a.mesImportacion - b.mesImportacion).map(t => `<th style="text-align:right">${MESES[t.mesImportacion - 1]?.substring(0, 3)}</th>`).join('')}<th style="text-align:right">Total</th></tr></thead>
    <tbody><tr><td>Tickets</td>${ticketsPorMes.sort((a, b) => a.mesImportacion - b.mesImportacion).map(t => `<td style="text-align:right">${t._count.id}</td>`).join('')}<td style="text-align:right;font-weight:700">${totalTickets}</td></tr></tbody>
  </table>

  <h2>Distribución por Técnico</h2>
  <div class="bar-chart">
    ${ticketsPorTecnico.filter(t => t.asignadoA).map(t => {
      const pct = totalTickets > 0 ? (t._count.id / totalTickets) * 100 : 0;
      return `<div class="bar-row"><span class="bar-label">${t.asignadoA}</span><div class="bar-container"><div class="bar-fill" style="width:${pct}%;background:#E87A2E"></div></div><span class="bar-value">${t._count.id}</span></div>`;
    }).join('')}
  </div>

  <div class="page-footer">
    <span>Internet Operadores S.L. — Documento confidencial</span>
    <span>Página 1</span>
  </div>
</div>

<!-- PÁGINA 2: Dashboard Operativo -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME INTERNO</div>
      <div>${fecha}</div>
    </div>
  </div>

  <h2 style="border-bottom:2px solid #2563eb;">Continuidad Operativa — Detalle</h2>
  
  <h3 style="margin-bottom:8px;">Top Categorías de Tickets</h3>
  <div class="bar-chart">
    ${ticketsPorCategoria.map(t => {
      const pct = totalTickets > 0 ? (t._count.id / totalTickets) * 100 : 0;
      return `<div class="bar-row"><span class="bar-label">${t.categoriaNivel2 || 'Sin categoría'}</span><div class="bar-container"><div class="bar-fill" style="width:${pct}%;background:#2563eb"></div></div><span class="bar-value">${t._count.id}</span></div>`;
    }).join('')}
  </div>

  <h3 style="margin:14px 0 8px;">Estado de SLAs</h3>
  <div class="grid-3">
    <div class="kpi-box" style="border-left:3px solid #16a34a;">
      <div class="kpi-label">Met (Cumplido)</div>
      <div class="kpi-value" style="color:#16a34a;font-size:18px;">${slaMet}</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid #dc2626;">
      <div class="kpi-label">Breached (Incumplido)</div>
      <div class="kpi-value" style="color:#dc2626;font-size:18px;">${slaBreached}</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid #6b7280;">
      <div class="kpi-label">Active / Otros</div>
      <div class="kpi-value" style="color:#6b7280;font-size:18px;">${totalTickets - slaMet - slaBreached}</div>
    </div>
  </div>

  <h2 style="border-bottom:2px solid #059669;">Valor Añadido — Tareas de Alto Valor</h2>
  <p style="font-size:9px;color:#6b7280;margin-bottom:10px;">Horas dedicadas a tareas que no generan ticket pero aportan valor estratégico al servicio.</p>
  <div class="grid-3">
    <div class="kpi-box" style="border-left:3px solid #059669;">
      <div class="kpi-label">Soporte a Auditorías</div>
      <div class="kpi-value" style="color:#059669;font-size:18px;">${acumulado.horasAuditorias}h</div>
      <div style="font-size:8px;color:#6b7280;margin-top:2px;">ISO, IATF, OEM</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid #2563eb;">
      <div class="kpi-label">Gestión Proveedores</div>
      <div class="kpi-value" style="color:#2563eb;font-size:18px;">${acumulado.horasProveedores}h</div>
      <div style="font-size:8px;color:#6b7280;margin-top:2px;">Alarmas, seguridad</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid #d97706;">
      <div class="kpi-label">Implementaciones</div>
      <div class="kpi-value" style="color:#d97706;font-size:18px;">${acumulado.horasImplementaciones}h</div>
      <div style="font-size:8px;color:#6b7280;margin-top:2px;">Mejoras, despliegues</div>
    </div>
  </div>

  <div class="page-footer">
    <span>Internet Operadores S.L. — Documento confidencial</span>
    <span>Página 2</span>
  </div>
</div>

<!-- PÁGINA 3: Proyectos Internos -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME INTERNO</div>
      <div>${fecha}</div>
    </div>
  </div>

  <h2 style="border-bottom:2px solid #059669;">Proyectos Internos e Implementaciones</h2>
  <p style="font-size:9px;color:#6b7280;margin-bottom:14px;">Proyectos, mejoras ejecutadas y propuestas de mejora vinculados a los contratos activos.</p>

  <div class="grid-3" style="margin-bottom:14px;">
    <div class="kpi-box" style="border-left:3px solid #E87A2E;">
      <div class="kpi-label">En curso</div>
      <div class="kpi-value" style="color:#E87A2E;font-size:18px;">${proyectosEnCurso.length}</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid #16a34a;">
      <div class="kpi-label">Completados</div>
      <div class="kpi-value" style="color:#16a34a;font-size:18px;">${proyectosCompletados.length}</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid #2563eb;">
      <div class="kpi-label">Mejoras ejecutadas</div>
      <div class="kpi-value" style="color:#2563eb;font-size:18px;">${mejorasEjecutadas.length}</div>
    </div>
  </div>

  ${proyectosEnCurso.length > 0 ? `
  <h3 style="margin-bottom:8px;">Proyectos en Curso</h3>
  ${proyectosEnCurso.map(p => `
    <div class="project-card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:10px;">${p.titulo}</strong>
        <span class="badge badge-orange">${p.prioridad}</span>
      </div>
      ${p.descripcion ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">${p.descripcion}</div>` : ''}
      <div style="display:flex;gap:12px;margin-top:4px;font-size:8px;color:#9ca3af;">
        ${p.responsable ? `<span>👤 ${p.responsable.nombre} ${p.responsable.apellidos}</span>` : ''}
        ${p.fechaInicio ? `<span>Inicio: ${formatDate(p.fechaInicio)}</span>` : ''}
        ${p.fechaFinPrevista ? `<span>Previsto: ${formatDate(p.fechaFinPrevista)}</span>` : ''}
      </div>
      ${p.impacto ? `<div style="font-size:9px;color:#059669;margin-top:3px;font-style:italic;">Impacto: ${p.impacto}</div>` : ''}
    </div>
  `).join('')}` : ''}

  ${proyectosCompletados.length > 0 ? `
  <h3 style="margin:12px 0 8px;">Proyectos Completados</h3>
  ${proyectosCompletados.map(p => `
    <div class="project-card completado">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:10px;">${p.titulo}</strong>
        <span class="badge badge-green">completado</span>
      </div>
      ${p.descripcion ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">${p.descripcion}</div>` : ''}
      ${p.impacto ? `<div style="font-size:9px;color:#059669;margin-top:3px;font-style:italic;">Impacto: ${p.impacto}</div>` : ''}
      <div style="display:flex;gap:12px;margin-top:4px;font-size:8px;color:#9ca3af;">
        ${p.fechaFinReal ? `<span>Finalizado: ${formatDate(p.fechaFinReal)}</span>` : ''}
        ${p.ahorroEstimado ? `<span>Ahorro: ${Number(p.ahorroEstimado).toLocaleString('es-ES')}€</span>` : ''}
      </div>
    </div>
  `).join('')}` : ''}

  ${propuestasFuturas.length > 0 ? `
  <h3 style="margin:12px 0 8px;">Propuestas de Mejora Futura</h3>
  ${propuestasFuturas.map(p => `
    <div class="project-card planificado">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:10px;">${p.titulo}</strong>
        <span class="badge badge-gray">propuesta</span>
      </div>
      ${p.descripcion ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;">${p.descripcion}</div>` : ''}
      ${p.impacto ? `<div style="font-size:9px;color:#6b7280;margin-top:3px;font-style:italic;">Impacto esperado: ${p.impacto}</div>` : ''}
    </div>
  `).join('')}` : ''}

  <div class="page-footer">
    <span>Internet Operadores S.L. — Documento confidencial</span>
    <span>Página 3</span>
  </div>
</div>

<!-- PÁGINA 4: Balance y Recomendaciones -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME INTERNO</div>
      <div>${fecha}</div>
    </div>
  </div>

  <h2 style="border-bottom:2px solid #dc2626;">Balance de Recursos</h2>
  <p style="font-size:9px;color:#6b7280;margin-bottom:10px;">Comparativa entre las horas contratadas y las realmente ejecutadas por el equipo IO.</p>
  
  ${acumulado.horasContratadas > 0 ? `
  <div class="grid-3">
    <div class="kpi-box">
      <div class="kpi-label">Horas Contratadas</div>
      <div class="kpi-value" style="color:#374151;font-size:18px;">${acumulado.horasContratadas}h</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid ${acumulado.horasEjecutadas > acumulado.horasContratadas ? '#dc2626' : '#16a34a'};">
      <div class="kpi-label">Horas Ejecutadas</div>
      <div class="kpi-value" style="color:${acumulado.horasEjecutadas > acumulado.horasContratadas ? '#dc2626' : '#16a34a'};font-size:18px;">${acumulado.horasEjecutadas}h</div>
    </div>
    <div class="kpi-box" style="border-left:3px solid ${acumulado.horasEjecutadas > acumulado.horasContratadas ? '#dc2626' : '#16a34a'};">
      <div class="kpi-label">Over-delivery</div>
      <div class="kpi-value" style="color:${acumulado.horasEjecutadas > acumulado.horasContratadas ? '#dc2626' : '#16a34a'};font-size:18px;">${acumulado.horasContratadas > 0 ? (acumulado.horasEjecutadas > acumulado.horasContratadas ? '+' : '') + Math.round(((acumulado.horasEjecutadas - acumulado.horasContratadas) / acumulado.horasContratadas) * 100) : 0}%</div>
    </div>
  </div>
  ${acumulado.horasEjecutadas > acumulado.horasContratadas ? `
  <div class="narrative">
    <strong>Nota:</strong> El equipo IO está ejecutando un ${Math.round(((acumulado.horasEjecutadas - acumulado.horasContratadas) / acumulado.horasContratadas) * 100)}% más de horas de las contratadas. 
    Esto evidencia un nivel de servicio superior al pactado, lo cual debe considerarse en la próxima revisión contractual.
  </div>` : ''}
  ` : '<div class="narrative">Pendiente de registrar las horas contratadas y ejecutadas del periodo.</div>'}

  <h2 style="border-bottom:2px solid #374151;">Control de Activos</h2>
  ${acumulado.preventivosplanificados > 0 ? `
  <div style="display:flex;align-items:center;gap:16px;margin:10px 0;">
    <div style="flex:1;background:#f3f4f6;border-radius:6px;height:20px;overflow:hidden;">
      <div style="height:100%;background:${(acumulado.preventivosEjecutados / acumulado.preventivosplanificados) >= 0.9 ? '#16a34a' : '#d97706'};width:${Math.min(100, Math.round((acumulado.preventivosEjecutados / acumulado.preventivosplanificados) * 100))}%;border-radius:6px;"></div>
    </div>
    <span style="font-size:14px;font-weight:700;color:#374151;">${Math.round((acumulado.preventivosEjecutados / acumulado.preventivosplanificados) * 100)}%</span>
  </div>
  <p style="font-size:9px;color:#6b7280;">${acumulado.preventivosEjecutados} de ${acumulado.preventivosplanificados} preventivos planificados ejecutados.</p>
  ` : '<p style="font-size:9px;color:#6b7280;">Pendiente de registrar datos de preventivos.</p>'}

  <h2 style="border-bottom:2px solid #374151;">Indicadores Clave — Semáforo</h2>
  <table>
    <thead><tr><th>Indicador</th><th style="text-align:right">Valor Actual</th><th style="text-align:right">Objetivo</th><th style="text-align:center">Estado</th></tr></thead>
    <tbody>
      <tr><td>Tickets resueltos / Total</td><td style="text-align:right">${totalTickets > 0 ? Math.round((ticketsCerrados / totalTickets) * 100) : 0}%</td><td style="text-align:right">&gt; 95%</td><td style="text-align:center">${totalTickets > 0 && (ticketsCerrados / totalTickets) >= 0.95 ? '✅' : '⚠️'}</td></tr>
      <tr><td>MTTR (horas)</td><td style="text-align:right">${mttrHoras}h</td><td style="text-align:right">&lt; 24h</td><td style="text-align:center">${mttrHoras <= 24 ? '✅' : '⚠️'}</td></tr>
      <tr><td>SLA cumplido</td><td style="text-align:right">${totalTickets > 0 ? Math.round((slaMet / totalTickets) * 100) : 0}%</td><td style="text-align:right">&gt; 95%</td><td style="text-align:center">${totalTickets > 0 && (slaMet / totalTickets) >= 0.95 ? '✅' : '⚠️'}</td></tr>
      <tr><td>Cumplimiento preventivos</td><td style="text-align:right">${acumulado.preventivosplanificados > 0 ? Math.round((acumulado.preventivosEjecutados / acumulado.preventivosplanificados) * 100) : 0}%</td><td style="text-align:right">&gt; 90%</td><td style="text-align:center">${acumulado.preventivosplanificados > 0 && (acumulado.preventivosEjecutados / acumulado.preventivosplanificados) >= 0.9 ? '✅' : '⚠️'}</td></tr>
      <tr><td>Proyectos en curso</td><td style="text-align:right">${proyectosEnCurso.length}</td><td style="text-align:right">—</td><td style="text-align:center">ℹ️</td></tr>
      <tr><td>Saturación equipo</td><td style="text-align:right">${acumulado.horasContratadas > 0 ? Math.round((acumulado.horasEjecutadas / acumulado.horasContratadas) * 100) : 0}%</td><td style="text-align:right">&lt; 110%</td><td style="text-align:center">${acumulado.horasContratadas > 0 && (acumulado.horasEjecutadas / acumulado.horasContratadas) <= 1.1 ? '✅' : '🔴'}</td></tr>
    </tbody>
  </table>

  ${kpiMes?.recomendaciones ? `
  <h2 style="border-bottom:2px solid #E87A2E;">Recomendaciones</h2>
  <div class="narrative">${kpiMes.recomendaciones.replace(/\n/g, '<br>')}</div>
  ` : ''}

  <div class="page-footer">
    <span>Internet Operadores S.L. — Documento confidencial</span>
    <span>Página 4</span>
  </div>
</div>

</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
