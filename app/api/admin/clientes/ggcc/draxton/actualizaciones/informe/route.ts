import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())

    const inicioAnio = new Date(anio, 0, 1)
    const finAnio = new Date(anio, 11, 31)

    const ejecuciones = await prisma.actualizacionEjecucion.findMany({
      where: { fecha: { gte: inicioAnio, lte: finAnio } },
      include: { imputaciones: true, planificacion: { select: { titulo: true } } },
      orderBy: { fecha: 'asc' }
    })

    const contratos = await prisma.contratoDraxton.findMany({
      where: { estado: { in: ['activo', 'renovacion'] }, OR: [{ tipo: 'Mantenimiento' }, { horasContratadas: { gt: 0 } }] },
      select: { id: true, titulo: true, horasContratadas: true }
    })

    // Calcular imputaciones por contrato
    const todasImputaciones = await prisma.actualizacionImputacion.findMany({ select: { contratoId: true, horas: true } })
    const imputPorContrato: Record<string, number> = {}
    todasImputaciones.forEach(i => { imputPorContrato[i.contratoId] = (imputPorContrato[i.contratoId] || 0) + i.horas })

    const totalHoras = ejecuciones.reduce((s, e) => s + e.horasDedicadas, 0)
    const totalCoste = ejecuciones.reduce((s, e) => s + (e.costeTotal || 0), 0)
    const horasImputadas = ejecuciones.reduce((s, e) => s + e.totalImputado, 0)
    const horasPendientes = totalHoras - horasImputadas

    // Agrupar por mes
    const porMes: Record<string, { horas: number; count: number }> = {}
    ejecuciones.forEach(e => {
      const mes = new Date(e.fecha).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      if (!porMes[mes]) porMes[mes] = { horas: 0, count: 0 }
      porMes[mes].horas += e.horasDedicadas
      porMes[mes].count++
    })

    // Sugerencia de imputación para las pendientes
    const pendientes = ejecuciones.filter(e => e.totalImputado < e.horasDedicadas)
    const balanceContratos = contratos.map(c => ({
      id: c.id,
      titulo: c.titulo,
      horasContratadas: Number(c.horasContratadas) || 0,
      imputadas: imputPorContrato[c.id] || 0,
      disponibles: (Number(c.horasContratadas) || 0) - (imputPorContrato[c.id] || 0),
    })).sort((a, b) => b.disponibles - a.disponibles)

    // Generar sugerencia
    const sugerencias: { fecha: string; horas: number; contrato: string }[] = []
    let balanceCopy = balanceContratos.map(c => ({ ...c }))
    pendientes.forEach(e => {
      const horasPend = e.horasDedicadas - e.totalImputado
      const mejorContrato = balanceCopy.sort((a, b) => b.disponibles - a.disponibles)[0]
      if (mejorContrato && mejorContrato.disponibles > 0) {
        sugerencias.push({ fecha: new Date(e.fecha).toLocaleDateString('es-ES'), horas: horasPend, contrato: mejorContrato.titulo })
        mejorContrato.disponibles -= horasPend
        mejorContrato.imputadas += horasPend
      }
    })

    const logoUrl = 'https://internetoperadores.com/wp-content/uploads/2023/01/logo-io-web.png'

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe Actualizaciones Programadas ${anio}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1f2937; line-height: 1.5; margin: 0; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #4f46e5; padding-bottom: 15px; margin-bottom: 20px; }
  .logo { height: 40px; }
  .title { font-size: 18px; font-weight: bold; color: #1f2937; }
  .subtitle { font-size: 12px; color: #6b7280; }
  .confidencial { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 9px; padding: 3px 8px; border-radius: 4px; font-weight: bold; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 13px; font-weight: bold; color: #4f46e5; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px; }
  th { background: #f3f4f6; text-align: left; padding: 6px 8px; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  tr:hover { background: #f9fafb; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; text-align: center; }
  .kpi-value { font-size: 20px; font-weight: bold; color: #1f2937; }
  .kpi-label { font-size: 9px; color: #6b7280; text-transform: uppercase; }
  .kpi-red .kpi-value { color: #dc2626; }
  .kpi-green .kpi-value { color: #16a34a; }
  .suggestion { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; margin-top: 15px; }
  .suggestion-title { font-weight: bold; color: #92400e; margin-bottom: 5px; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-yellow { background: #fef3c7; color: #92400e; }
  .footer { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Imprimir / PDF</button>

<div class="header">
  <div>
    <div class="title">Informe Actualizaciones Programadas</div>
    <div class="subtitle">Draxton Europe & Asia - Periodo: ${anio}</div>
  </div>
  <div style="text-align: right;">
    <img src="${logoUrl}" class="logo" alt="Internet Operadores" /><br/>
    <span class="confidencial">CONFIDENCIAL - USO INTERNO</span>
  </div>
</div>

<!-- KPIs -->
<div class="kpi-grid">
  <div class="kpi-box"><div class="kpi-value">${totalHoras.toFixed(1)}h</div><div class="kpi-label">Total Horas</div></div>
  <div class="kpi-box"><div class="kpi-value">${totalCoste.toFixed(0)}EUR</div><div class="kpi-label">Coste Total</div></div>
  <div class="kpi-box kpi-green"><div class="kpi-value">${horasImputadas.toFixed(1)}h</div><div class="kpi-label">Horas Imputadas</div></div>
  <div class="kpi-box ${horasPendientes > 0 ? 'kpi-red' : 'kpi-green'}"><div class="kpi-value">${horasPendientes.toFixed(1)}h</div><div class="kpi-label">Pendiente Imputar</div></div>
</div>

<!-- Resumen mensual -->
<div class="section">
  <div class="section-title">Resumen Mensual</div>
  <table>
    <tr><th>Mes</th><th>Intervenciones</th><th>Horas</th></tr>
    ${Object.entries(porMes).map(([mes, d]) => `<tr><td>${mes}</td><td>${d.count}</td><td>${d.horas.toFixed(1)}h</td></tr>`).join('')}
  </table>
</div>

<!-- Detalle de intervenciones -->
<div class="section">
  <div class="section-title">Detalle de Intervenciones</div>
  <table>
    <tr><th>Fecha</th><th>Tecnico</th><th>Horas</th><th>Tipo</th><th>Plantas</th><th>Descripcion</th><th>Imputado</th></tr>
    ${ejecuciones.map(e => `<tr>
      <td>${new Date(e.fecha).toLocaleDateString('es-ES')}</td>
      <td>${e.tecnicoNombre || '-'} (N${e.nivelTecnico})</td>
      <td><strong>${e.horasDedicadas}h</strong></td>
      <td>${e.tipo}</td>
      <td>${e.plantasAfectadas || '-'}</td>
      <td>${e.descripcion || e.planificacion?.titulo || '-'}</td>
      <td>${e.totalImputado >= e.horasDedicadas ? '<span class="badge badge-green">100%</span>' : e.totalImputado > 0 ? `<span class="badge badge-yellow">${((e.totalImputado / e.horasDedicadas) * 100).toFixed(0)}%</span>` : '<span class="badge badge-red">Pendiente</span>'}</td>
    </tr>`).join('')}
  </table>
</div>

<!-- Balance de contratos -->
<div class="section">
  <div class="section-title">Balance de Contratos de Horas</div>
  <table>
    <tr><th>Contrato</th><th>Horas/mes contratadas</th><th>Imputadas (actualizaciones)</th><th>Disponibles</th></tr>
    ${balanceContratos.map(c => `<tr>
      <td>${c.titulo}</td>
      <td>${c.horasContratadas}h</td>
      <td>${c.imputadas.toFixed(1)}h</td>
      <td style="color: ${c.disponibles >= 0 ? '#16a34a' : '#dc2626'}; font-weight: bold;">${c.disponibles.toFixed(1)}h</td>
    </tr>`).join('')}
  </table>
</div>

<!-- Sugerencia de imputación -->
${sugerencias.length > 0 ? `
<div class="suggestion">
  <div class="suggestion-title">Sugerencia de Imputacion para Pendientes</div>
  <p style="font-size: 10px; color: #78350f; margin-bottom: 8px;">Basado en la disponibilidad de horas de cada contrato, sugerimos imputar las ejecuciones pendientes de la siguiente manera:</p>
  <table>
    <tr><th>Fecha intervencion</th><th>Horas</th><th>Contrato sugerido</th></tr>
    ${sugerencias.map(s => `<tr><td>${s.fecha}</td><td>${s.horas.toFixed(1)}h</td><td><strong>${s.contrato}</strong></td></tr>`).join('')}
  </table>
</div>
` : ''}

<div class="footer">
  <span>Internet Operadores S.L. - Informe generado el ${new Date().toLocaleDateString('es-ES')} a las ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
  <span>Pagina 1 de 1</span>
</div>
</body>
</html>`

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (error: any) {
    console.error('Error informe actualizaciones:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
