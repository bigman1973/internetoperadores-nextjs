import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'

const HORAS_NETAS_MES = 128.67

function diasLaborablesMes(a: number, m: number): number {
  let count = 0;
  const dias = new Date(a, m, 0).getDate();
  for (let d = 1; d <= dias; d++) { const day = new Date(a, m - 1, d).getDay(); if (day !== 0 && day !== 6) count++; }
  return count;
}
function diasLaborablesActivos(a: number, m: number, fi: Date | null, ff: Date | null): number {
  const p1 = new Date(a, m - 1, 1); const p2 = new Date(a, m, 0);
  const inicio = fi && fi > p1 ? fi : p1; const fin = ff && ff < p2 ? ff : p2;
  if (fin < inicio) return 0;
  let count = 0; const cur = new Date(inicio);
  while (cur <= fin) { const day = cur.getDay(); if (day !== 0 && day !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())
    const tipoInforme = searchParams.get('tipo') || 'interno' // 'interno' o 'cliente'

    const inicioAnio = new Date(anio, 0, 1)
    const finAnio = new Date(anio, 11, 31)

    const ejecuciones = await prisma.actualizacionEjecucion.findMany({
      where: { fecha: { gte: inicioAnio, lte: finAnio } },
      include: { imputaciones: true, planificacion: { select: { titulo: true } } },
      orderBy: { fecha: 'asc' }
    })

    // Factor de conversión vigente
    const tarifaVigente = await prisma.actualizacionTarifaConversion.findFirst({
      where: { fechaHasta: null },
      orderBy: { fechaDesde: 'desc' }
    })
    const factorConversion = tarifaVigente?.factorConversion || 1
    const costeHoraTarifa = tarifaVigente ? Number(tarifaVigente.costeHora) || 0 : 0

    // Contratos de horas activos
    const contratos = await prisma.contratoDraxton.findMany({
      where: { estado: 'Activo', horasContratadas: { gt: 0 } },
      select: { id: true, titulo: true, horasContratadas: true, importeMensual: true, nivelContratado: true, fechaInicio: true, fechaFin: true,
        personalAsignado: { select: { porcentajeDedicacion: true, nivelTecnico: true, fechaInicio: true, fechaFin: true } }
      }
    })

    // Imputaciones por contrato
    const todasImputaciones = await prisma.actualizacionImputacion.findMany({
      where: { ejecucion: { fecha: { gte: inicioAnio, lte: finAnio } } },
      select: { contratoId: true, horas: true }
    })
    const imputPorContrato: Record<string, number> = {}
    todasImputaciones.forEach(i => { imputPorContrato[i.contratoId] = (imputPorContrato[i.contratoId] || 0) + i.horas })

    // KPIs
    const totalHorasReales = ejecuciones.reduce((s, e) => s + e.horasDedicadas, 0)
    const totalHorasContrato = totalHorasReales * factorConversion
    const totalCoste = ejecuciones.reduce((s, e) => s + (e.costeTotal || 0), 0)
    const horasImputadas = ejecuciones.reduce((s, e) => s + e.totalImputado, 0)
    const horasImputadasContrato = horasImputadas * factorConversion
    const horasPendientesReales = totalHorasReales - horasImputadas
    const horasPendientesContrato = horasPendientesReales * factorConversion

    // Resumen mensual
    const porMes: Record<string, { horas: number; horasContrato: number; count: number; coste: number }> = {}
    ejecuciones.forEach(e => {
      const mes = new Date(e.fecha).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      if (!porMes[mes]) porMes[mes] = { horas: 0, horasContrato: 0, count: 0, coste: 0 }
      porMes[mes].horas += e.horasDedicadas
      porMes[mes].horasContrato += e.horasDedicadas * factorConversion
      porMes[mes].count++
      porMes[mes].coste += (e.costeTotal || 0)
    })

    // Balance de contratos con previsión fin año (misma lógica que seguimiento)
    const mesActual = new Date().getMonth() + 1
    const balanceContratos = contratos.map(c => {
      const horasMes = Number(c.horasContratadas) || 0
      const nivelContratado = c.nivelContratado || 1
      const precioHora = horasMes > 0 && c.importeMensual ? Number(c.importeMensual) / horasMes : 0

      // Saldo actual
      let saldoAcum = 0
      for (let m = 1; m <= mesActual; m++) {
        const diasLab = diasLaborablesMes(anio, m)
        let horasEquivMes = 0
        for (const p of c.personalAsignado) {
          const fi = p.fechaInicio ? new Date(p.fechaInicio) : null
          const ff = p.fechaFin ? new Date(p.fechaFin) : null
          const diasAct = diasLaborablesActivos(anio, m, fi, ff)
          const proporcion = diasLab > 0 ? diasAct / diasLab : 0
          const horasBase = HORAS_NETAS_MES * (p.porcentajeDedicacion / 100) * proporcion
          horasEquivMes += horasBase * ((p.nivelTecnico || 1) / nivelContratado)
        }
        saldoAcum += horasEquivMes - horasMes
      }

      // Previsión fin año
      let saldoPrevisto = saldoAcum
      const fechaFinContrato = c.fechaFin ? new Date(c.fechaFin) : null
      for (let m = mesActual + 1; m <= 12; m++) {
        if (fechaFinContrato && fechaFinContrato < new Date(anio, m - 1, 1)) break
        const diasLab = diasLaborablesMes(anio, m)
        let horasEquivMes = 0
        for (const p of c.personalAsignado) {
          const fi = p.fechaInicio ? new Date(p.fechaInicio) : null
          const ff = p.fechaFin ? new Date(p.fechaFin) : null
          const diasAct = diasLaborablesActivos(anio, m, fi, ff)
          const proporcion = diasLab > 0 ? diasAct / diasLab : 0
          const horasBase = HORAS_NETAS_MES * (p.porcentajeDedicacion / 100) * proporcion
          horasEquivMes += horasBase * ((p.nivelTecnico || 1) / nivelContratado)
        }
        saldoPrevisto += horasEquivMes - horasMes
      }

      const imputadasContrato = (imputPorContrato[c.id] || 0) * factorConversion
      return {
        titulo: c.titulo,
        horasMes,
        precioHora: Math.round(precioHora * 100) / 100,
        saldoActual: Math.round(saldoAcum * 10) / 10,
        previsionFinAnio: Math.round(saldoPrevisto * 10) / 10,
        imputadasReal: imputPorContrato[c.id] || 0,
        imputadasContrato: Math.round(imputadasContrato * 10) / 10,
        saldoNeto: Math.round((saldoAcum - imputadasContrato) * 10) / 10,
      }
    })

    // Sugerencia de imputación: imputar al contrato con MENOR previsión fin año (mayor déficit)
    // Al imputar horas, el déficit se reduce (la previsión mejora)
    const pendientes = ejecuciones.filter(e => e.totalImputado < e.horasDedicadas)
    const sugerencias: { fecha: string; horas: number; horasContrato: number; contrato: string; razon: string }[] = []
    const balanceCopy = balanceContratos.map(c => ({ ...c, prevision: c.previsionFinAnio }))
    pendientes.forEach(e => {
      const horasPend = e.horasDedicadas - e.totalImputado
      const horasContr = horasPend * factorConversion
      // Ordenar por previsión ASCENDENTE: primero el que tiene menor previsión (mayor déficit)
      const mejor = balanceCopy.sort((a, b) => a.prevision - b.prevision)[0]
      if (mejor) {
        const razon = mejor.prevision < 0 ? `Deficit previsto: ${mejor.prevision.toFixed(1)}h → tras imputar: ${(mejor.prevision + horasContr).toFixed(1)}h` : `Prevision: +${mejor.prevision.toFixed(1)}h`
        sugerencias.push({ fecha: new Date(e.fecha).toLocaleDateString('es-ES'), horas: horasPend, horasContrato: horasContr, contrato: mejor.titulo, razon })
        mejor.prevision += horasContr // Imputar MEJORA el déficit (suma)
      }
    })

    const logoUrl = 'https://internetoperadores.com/wp-content/uploads/2023/01/logo-io-web.png'
    const fechaGeneracion = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    const horaGeneracion = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

    // Si es informe para cliente, generar versión sin costes internos
    if (tipoInforme === 'cliente') {
      const htmlCliente = generarInformeCliente({ anio, ejecuciones, factorConversion, totalHorasReales, totalHorasContrato, horasPendientesReales, horasPendientesContrato, balanceContratos, sugerencias, logoUrl, fechaGeneracion, horaGeneracion, porMes })
      return new NextResponse(htmlCliente, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe Actualizaciones Programadas - Draxton ${anio}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    body { margin: 0; padding: 0; }
    .page { page-break-after: always; page-break-inside: avoid; }
    .page:last-child { page-break-after: auto; }
    .no-print { display: none !important; }
  }
  body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif; font-size: 10px; color: #1f2937; line-height: 1.5; margin: 0; padding: 0; background: #f3f4f6; }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 18mm 18mm 25mm 18mm;
    position: relative;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 2px solid #E87A2E;
    margin-bottom: 20px;
  }
  .page-header img { height: 36px; object-fit: contain; }
  .page-header-right { text-align: right; font-size: 9px; color: #6b7280; }
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
  .confidencial { display: inline-block; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 8px; padding: 2px 8px; border-radius: 3px; font-weight: 700; letter-spacing: 0.5px; margin-top: 4px; }
  h1 { font-size: 18px; font-weight: 800; color: #111827; margin: 0 0 4px 0; }
  h2 { font-size: 12px; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6; }
  .subtitle { font-size: 11px; color: #6b7280; margin: 0; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi-box { padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
  .kpi-label { font-size: 7px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 3px; }
  .kpi-value { font-size: 18px; font-weight: 800; color: #1f2937; }
  .kpi-sub { font-size: 8px; color: #9ca3af; margin-top: 2px; }
  .kpi-orange .kpi-value { color: #E87A2E; }
  .kpi-red .kpi-value { color: #dc2626; }
  .kpi-green .kpi-value { color: #16a34a; }
  .kpi-blue .kpi-value { color: #2563eb; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 14px; }
  thead th { background: #1f2937; color: white; padding: 7px 8px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th:first-child { border-radius: 4px 0 0 0; }
  thead th:last-child { border-radius: 0 4px 0 0; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: 700; }
  .text-green { color: #16a34a; }
  .text-red { color: #dc2626; }
  .text-blue { color: #2563eb; }
  .text-orange { color: #E87A2E; }
  .text-gray { color: #6b7280; }
  .badge { display: inline-block; font-size: 7px; font-weight: 600; padding: 2px 6px; border-radius: 3px; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-yellow { background: #fef3c7; color: #92400e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .highlight-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin: 16px 0; }
  .highlight-title { font-weight: 700; font-size: 10px; color: #92400e; margin-bottom: 8px; }
  .factor-box { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 16px; }
  .factor-value { font-size: 24px; font-weight: 800; color: #4338ca; }
  .factor-text { font-size: 9px; color: #4338ca; line-height: 1.4; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #E87A2E; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; z-index: 100; }
  .print-btn:hover { background: #d16a20; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

<!-- PAGINA 1: Resumen ejecutivo -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <strong>INTERNET OPERADORES S.L.</strong><br/>
      Informe interno - ${fechaGeneracion}<br/>
      <span class="confidencial">CONFIDENCIAL - USO INTERNO</span>
    </div>
  </div>

  <h1>Actualizaciones Programadas Draxton</h1>
  <p class="subtitle">Informe de intervenciones y propuesta de imputacion a contratos - Periodo: ${anio}</p>

  <!-- Factor de conversión -->
  <div class="factor-box">
    <div class="factor-value">x${factorConversion}</div>
    <div class="factor-text">
      <strong>Factor de conversion vigente</strong><br/>
      1 hora de actualizacion = ${factorConversion} horas de contrato<br/>
      <span style="font-size: 8px;">Tecnico Nivel 2 (x2) — tareas que un tecnico N1 no puede realizar — + Fuera de horario laboral (x2) = Factor x${factorConversion}</span>
      ${costeHoraTarifa > 0 ? `Coste neto tecnico: ${costeHoraTarifa.toFixed(2)} EUR/h | Coste bruto empresa: ${(costeHoraTarifa * 1.35).toFixed(2)} EUR/h` : ''}
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi-box kpi-orange">
      <div class="kpi-label">Horas ejecutadas</div>
      <div class="kpi-value">${totalHorasReales.toFixed(1)}h</div>
      <div class="kpi-sub">= ${totalHorasContrato.toFixed(0)}h contrato (x${factorConversion})</div>
    </div>
    <div class="kpi-box kpi-green">
      <div class="kpi-label">Imputadas a contratos</div>
      <div class="kpi-value">${horasImputadas.toFixed(1)}h</div>
      <div class="kpi-sub">= ${horasImputadasContrato.toFixed(0)}h contrato</div>
    </div>
    <div class="kpi-box ${horasPendientesReales > 0 ? 'kpi-red' : 'kpi-green'}">
      <div class="kpi-label">Pendientes de imputar</div>
      <div class="kpi-value">${horasPendientesReales.toFixed(1)}h</div>
      <div class="kpi-sub">= ${horasPendientesContrato.toFixed(0)}h contrato a absorber</div>
    </div>
  </div>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Intervenciones</div>
      <div class="kpi-value">${ejecuciones.length}</div>
      <div class="kpi-sub">${anio}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Coste total empresa</div>
      <div class="kpi-value">${totalCoste > 0 ? totalCoste.toFixed(0) : (totalHorasReales * costeHoraTarifa * 1.35).toFixed(0)} EUR</div>
      <div class="kpi-sub">Coste bruto (neto x 1.35)</div>
    </div>
    <div class="kpi-box kpi-blue">
      <div class="kpi-label">Valor contrato equiv.</div>
      <div class="kpi-value">${balanceContratos.length > 0 ? (totalHorasContrato * (balanceContratos.reduce((s, c) => s + c.precioHora, 0) / balanceContratos.length)).toFixed(0) : '0'} EUR</div>
      <div class="kpi-sub">Si se facturaran al precio/h medio</div>
    </div>
  </div>

  <!-- Resumen mensual -->
  <h2>Resumen Mensual</h2>
  <table>
    <thead><tr><th>Mes</th><th class="text-center">Intervenciones</th><th class="text-right">Horas reales</th><th class="text-right">Horas contrato (x${factorConversion})</th><th class="text-right">Coste</th></tr></thead>
    <tbody>
      ${Object.entries(porMes).map(([mes, d]) => `<tr>
        <td class="font-bold">${mes.charAt(0).toUpperCase() + mes.slice(1)}</td>
        <td class="text-center">${d.count}</td>
        <td class="text-right">${d.horas.toFixed(1)}h</td>
        <td class="text-right font-bold text-blue">${d.horasContrato.toFixed(0)}h</td>
        <td class="text-right">${d.coste > 0 ? d.coste.toFixed(0) + ' EUR' : (d.horas * costeHoraTarifa * 1.35).toFixed(0) + ' EUR'}</td>
      </tr>`).join('')}
      <tr style="border-top: 2px solid #1f2937; font-weight: 700;">
        <td>TOTAL</td>
        <td class="text-center">${ejecuciones.length}</td>
        <td class="text-right">${totalHorasReales.toFixed(1)}h</td>
        <td class="text-right text-blue">${totalHorasContrato.toFixed(0)}h</td>
        <td class="text-right">${totalCoste > 0 ? totalCoste.toFixed(0) : (totalHorasReales * costeHoraTarifa * 1.35).toFixed(0)} EUR</td>
      </tr>
    </tbody>
  </table>

  <!-- Balance de contratos -->
  <h2>Balance de Contratos de Horas</h2>
  <table>
    <thead><tr><th>Contrato</th><th class="text-right">h/mes</th><th class="text-right">EUR/h</th><th class="text-right">Saldo actual</th><th class="text-right">Actualiz. imputadas</th><th class="text-right">Saldo neto</th><th class="text-right">Prevision dic ${anio}</th></tr></thead>
    <tbody>
      ${balanceContratos.map(c => `<tr>
        <td class="font-bold">${c.titulo}</td>
        <td class="text-right">${c.horasMes}h</td>
        <td class="text-right">${c.precioHora.toFixed(2)}</td>
        <td class="text-right ${c.saldoActual >= 0 ? 'text-green' : 'text-red'}">${c.saldoActual > 0 ? '+' : ''}${c.saldoActual}h</td>
        <td class="text-right text-orange">${c.imputadasContrato > 0 ? '-' + c.imputadasContrato + 'h' : '-'}</td>
        <td class="text-right font-bold ${c.saldoNeto >= 0 ? 'text-green' : 'text-red'}">${c.saldoNeto > 0 ? '+' : ''}${c.saldoNeto}h</td>
        <td class="text-right ${c.previsionFinAnio >= 0 ? 'text-blue' : 'text-red'} font-bold">${c.previsionFinAnio > 0 ? '+' : ''}${c.previsionFinAnio}h</td>
      </tr>`).join('')}
    </tbody>
  </table>
  <p style="font-size: 8px; color: #6b7280; margin-top: 4px;">Saldo actual = horas cubiertas por personal - horas comprometidas. Prevision = proyeccion con personal actual hasta dic ${anio}.</p>

  <div class="page-footer">
    <span>Internet Operadores S.L. - ${fechaGeneracion} ${horaGeneracion}</span>
    <span>Pagina 1 de 2</span>
  </div>
</div>

<!-- PAGINA 2: Detalle y propuesta -->
<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <strong>INTERNET OPERADORES S.L.</strong><br/>
      Actualizaciones Draxton ${anio} - Detalle
    </div>
  </div>

  <h2>Detalle de Intervenciones</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Tecnico</th><th class="text-right">Horas</th><th class="text-right">H. contrato</th><th>Tipo</th><th>Descripcion</th><th class="text-center">Estado</th></tr></thead>
    <tbody>
      ${ejecuciones.map(e => {
        const horasContr = e.horasDedicadas * factorConversion
        const pctImput = e.horasDedicadas > 0 ? (e.totalImputado / e.horasDedicadas) * 100 : 0
        return `<tr>
          <td>${new Date(e.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
          <td>${e.tecnicoNombre || '-'} <span class="text-gray">(N${e.nivelTecnico})</span></td>
          <td class="text-right font-bold">${e.horasDedicadas}h</td>
          <td class="text-right font-bold text-blue">${horasContr}h</td>
          <td><span class="badge badge-blue">${e.tipo}</span></td>
          <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.descripcion || e.planificacion?.titulo || '-'}</td>
          <td class="text-center">${pctImput >= 100 ? '<span class="badge badge-green">Imputado</span>' : pctImput > 0 ? `<span class="badge badge-yellow">${pctImput.toFixed(0)}%</span>` : '<span class="badge badge-red">Pendiente</span>'}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <!-- Propuesta de imputación -->
  ${horasPendientesReales > 0 ? `
  <div class="highlight-box">
    <div class="highlight-title">Propuesta de Imputacion a Contratos</div>
    <p style="font-size: 9px; color: #78350f; margin: 0 0 10px 0;">
      Quedan <strong>${horasPendientesReales.toFixed(1)}h reales</strong> (= <strong>${horasPendientesContrato.toFixed(0)}h de contrato</strong>) pendientes de imputar.
      Se sugiere imputar al contrato con mayor deficit previsto a fin de a\u00f1o para compensar el balance:
    </p>
    <table>
      <thead><tr><th>Fecha</th><th class="text-right">Horas reales</th><th class="text-right">Horas contrato (x${factorConversion})</th><th>Contrato sugerido</th><th>Razon</th></tr></thead>
      <tbody>
        ${sugerencias.map(s => `<tr>
          <td>${s.fecha}</td>
          <td class="text-right font-bold">${s.horas.toFixed(1)}h</td>
          <td class="text-right font-bold text-blue">${s.horasContrato.toFixed(0)}h</td>
          <td class="font-bold">${s.contrato}</td>
          <td class="text-gray">${s.razon}</td>
        </tr>`).join('')}
        <tr style="border-top: 2px solid #92400e; font-weight: 700; color: #92400e;">
          <td>TOTAL</td>
          <td class="text-right">${horasPendientesReales.toFixed(1)}h</td>
          <td class="text-right">${horasPendientesContrato.toFixed(0)}h</td>
          <td colspan="2"></td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : `
  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 16px 0; text-align: center;">
    <strong style="color: #166534;">Todas las horas de actualizaciones estan imputadas a contratos.</strong>
  </div>
  `}

  <!-- Resumen para propuesta al cliente -->
  <h2>Resumen para Propuesta al Cliente</h2>
  <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
    <table style="margin: 0;">
      <tbody>
        <tr><td class="font-bold" style="width: 50%;">Total horas de actualizaciones realizadas (${anio})</td><td class="text-right font-bold">${totalHorasReales.toFixed(1)}h</td></tr>
        <tr><td>Factor de conversion aplicado</td><td class="text-right font-bold text-blue">x${factorConversion}</td></tr>
        <tr style="border-top: 2px solid #1f2937;"><td class="font-bold" style="font-size: 11px;">Total horas equivalentes de contrato</td><td class="text-right font-bold text-blue" style="font-size: 14px;">${totalHorasContrato.toFixed(0)}h</td></tr>
        <tr><td class="text-gray">Distribucion propuesta:</td><td></td></tr>
        ${balanceContratos.map(c => {
          const proporcion = c.saldoActual > 0 ? c.saldoActual : 0
          return `<tr><td style="padding-left: 16px;">${c.titulo}</td><td class="text-right">${c.imputadasContrato > 0 ? c.imputadasContrato + 'h imputadas' : 'Pendiente'}</td></tr>`
        }).join('')}
      </tbody>
    </table>
  </div>

  <div class="page-footer">
    <span>Internet Operadores S.L. - ${fechaGeneracion} ${horaGeneracion}</span>
    <span>Pagina 2 de 2</span>
  </div>
</div>

</body>
</html>`

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (error: any) {
    console.error('Error informe actualizaciones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generarInformeCliente({ anio, ejecuciones, factorConversion, totalHorasReales, totalHorasContrato, horasPendientesReales, horasPendientesContrato, balanceContratos, sugerencias, logoUrl, fechaGeneracion, horaGeneracion, porMes }: any): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe Actualizaciones Programadas - Draxton ${anio}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    body { margin: 0; padding: 0; }
    .page { page-break-after: always; page-break-inside: avoid; }
    .page:last-child { page-break-after: auto; }
    .no-print { display: none !important; }
  }
  body { font-family: 'Segoe UI', -apple-system, Arial, sans-serif; font-size: 10px; color: #1f2937; line-height: 1.5; margin: 0; padding: 0; background: #f3f4f6; }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 18mm 18mm 25mm 18mm;
    position: relative;
    background: white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 14px;
    border-bottom: 2px solid #E87A2E;
    margin-bottom: 20px;
  }
  .page-header img { height: 36px; object-fit: contain; }
  .page-header-right { text-align: right; font-size: 9px; color: #6b7280; }
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
  h1 { font-size: 18px; font-weight: 800; color: #111827; margin: 0 0 4px 0; }
  h2 { font-size: 12px; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6; }
  .subtitle { font-size: 11px; color: #6b7280; margin: 0; }
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi-box { padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
  .kpi-label { font-size: 7px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 3px; }
  .kpi-value { font-size: 18px; font-weight: 800; color: #1f2937; }
  .kpi-sub { font-size: 8px; color: #9ca3af; margin-top: 2px; }
  .kpi-orange .kpi-value { color: #E87A2E; }
  .kpi-blue .kpi-value { color: #2563eb; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 14px; }
  thead th { background: #1f2937; color: white; padding: 7px 8px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
  thead th:first-child { border-radius: 4px 0 0 0; }
  thead th:last-child { border-radius: 0 4px 0 0; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: 700; }
  .text-blue { color: #2563eb; }
  .text-orange { color: #E87A2E; }
  .badge { display: inline-block; font-size: 7px; font-weight: 600; padding: 2px 6px; border-radius: 3px; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .factor-box { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 16px; }
  .factor-value { font-size: 24px; font-weight: 800; color: #4338ca; }
  .factor-text { font-size: 9px; color: #4338ca; line-height: 1.4; }
  .highlight-box { background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 14px; margin: 16px 0; }
  .highlight-title { font-weight: 700; font-size: 10px; color: #3730a3; margin-bottom: 8px; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #E87A2E; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; z-index: 100; }
  .print-btn:hover { background: #d16a20; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

<div class="page">
  <div class="page-header">
    <img src="${logoUrl}" alt="Internet Operadores" />
    <div class="page-header-right">
      <strong>INTERNET OPERADORES S.L.</strong><br/>
      Informe de Actualizaciones Programadas<br/>
      ${fechaGeneracion}
    </div>
  </div>

  <h1>Actualizaciones Programadas Draxton</h1>
  <p class="subtitle">Resumen de intervenciones de mantenimiento preventivo y actualizaciones de seguridad - ${anio}</p>

  <!-- Factor de conversión -->
  <div class="factor-box">
    <div class="factor-value">x${factorConversion}</div>
    <div class="factor-text">
      <strong>Factor de conversion aplicado</strong><br/>
      1 hora de actualizacion programada equivale a ${factorConversion} horas de contrato<br/>
      <span style="font-size: 8px;">Tecnico Nivel 2 (x2) — tareas que un tecnico N1 no puede realizar — + Fuera de horario laboral (x2) = Factor x${factorConversion}</span>
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi-box kpi-orange">
      <div class="kpi-label">Horas realizadas</div>
      <div class="kpi-value">${totalHorasReales.toFixed(1)}h</div>
      <div class="kpi-sub">Intervenciones fin de semana</div>
    </div>
    <div class="kpi-box kpi-blue">
      <div class="kpi-label">Horas equivalentes contrato</div>
      <div class="kpi-value">${totalHorasContrato.toFixed(0)}h</div>
      <div class="kpi-sub">Aplicando factor x${factorConversion}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Intervenciones</div>
      <div class="kpi-value">${ejecuciones.length}</div>
      <div class="kpi-sub">Periodo ${anio}</div>
    </div>
  </div>

  <!-- Resumen mensual -->
  <h2>Resumen Mensual de Intervenciones</h2>
  <table>
    <thead><tr><th>Mes</th><th class="text-center">Intervenciones</th><th class="text-right">Horas realizadas</th><th class="text-right">Horas equivalentes contrato</th></tr></thead>
    <tbody>
      ${Object.entries(porMes).map(([mes, d]: [string, any]) => `<tr>
        <td class="font-bold">${mes.charAt(0).toUpperCase() + mes.slice(1)}</td>
        <td class="text-center">${d.count}</td>
        <td class="text-right">${d.horas.toFixed(1)}h</td>
        <td class="text-right font-bold text-blue">${d.horasContrato.toFixed(0)}h</td>
      </tr>`).join('')}
      <tr style="border-top: 2px solid #1f2937; font-weight: 700;">
        <td>TOTAL</td>
        <td class="text-center">${ejecuciones.length}</td>
        <td class="text-right">${totalHorasReales.toFixed(1)}h</td>
        <td class="text-right text-blue">${totalHorasContrato.toFixed(0)}h</td>
      </tr>
    </tbody>
  </table>

  <!-- Detalle de intervenciones -->
  <h2>Detalle de Intervenciones Realizadas</h2>
  <table>
    <thead><tr><th>Fecha</th><th class="text-right">Horas</th><th class="text-right">H. equiv. contrato</th><th>Tipo</th><th>Descripcion</th></tr></thead>
    <tbody>
      ${ejecuciones.map((e: any) => {
        const horasContr = e.horasDedicadas * factorConversion
        return `<tr>
          <td>${new Date(e.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
          <td class="text-right font-bold">${e.horasDedicadas}h</td>
          <td class="text-right font-bold text-blue">${horasContr}h</td>
          <td><span class="badge badge-blue">${e.tipo}</span></td>
          <td style="max-width: 220px;">${e.descripcion || e.planificacion?.titulo || 'Actualizaciones programadas'}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <!-- Propuesta de imputación -->
  <div class="highlight-box">
    <div class="highlight-title">Propuesta de Imputacion a Contratos de Servicio</div>
    <p style="font-size: 9px; color: #3730a3; margin: 0 0 10px 0;">
      Las ${totalHorasReales.toFixed(1)} horas de actualizaciones realizadas equivalen a <strong>${totalHorasContrato.toFixed(0)} horas de contrato</strong> (factor x${factorConversion}).
      Se propone imputar estas horas a los contratos de servicio vigentes de la siguiente manera:
    </p>
    <table>
      <thead><tr><th>Contrato de servicio</th><th class="text-right">Horas equiv. a imputar</th></tr></thead>
      <tbody>
        ${sugerencias.length > 0 ? sugerencias.map((s: any) => `<tr>
          <td class="font-bold">${s.contrato}</td>
          <td class="text-right font-bold text-blue">${s.horasContrato.toFixed(0)}h</td>
        </tr>`).join('') : `<tr><td colspan="2" class="text-center" style="color: #6b7280;">Todas las horas ya estan imputadas</td></tr>`}
        ${sugerencias.length > 0 ? `<tr style="border-top: 2px solid #1f2937; font-weight: 700;">
          <td>TOTAL</td>
          <td class="text-right text-blue">${horasPendientesContrato.toFixed(0)}h</td>
        </tr>` : ''}
      </tbody>
    </table>
  </div>

  <div class="page-footer">
    <span>Internet Operadores S.L. - ${fechaGeneracion} ${horaGeneracion}</span>
    <span>Informe de Actualizaciones Programadas ${anio}</span>
  </div>
</div>

</body>
</html>`
}
