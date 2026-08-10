import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'

const CONTRATO_GUARDIAS_ID = '8d5e4790-cf71-4047-a286-9b0d6e6e8cef'

function formatDate(d: Date | string | null): string {
  if (!d) return '-'
  const date = new Date(d)
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())
    const desde = searchParams.get('desde') // formato YYYY-MM
    const hasta = searchParams.get('hasta')
    const tecnicoFilter = searchParams.get('tecnico')
    const baseUrl = new URL(req.url).origin

    // Obtener config
    const config = await prisma.guardiaConfig.findUnique({
      where: { contratoId: CONTRATO_GUARDIAS_ID },
      include: {
        tecnicos: {
          include: { empleado: { select: { nombreCompleto: true } } },
          orderBy: { fechaAlta: 'asc' }
        }
      }
    })

    // Contrato
    const contrato = await prisma.contratoDraxton.findUnique({
      where: { id: CONTRATO_GUARDIAS_ID },
      select: { titulo: true, fechaInicio: true, fechaFin: true, importeMensual: true }
    })

    // Fechas de filtro
    let fechaDesde = new Date(anio, 0, 1)
    let fechaHasta = new Date(anio, 11, 31, 23, 59, 59)
    if (desde) fechaDesde = new Date(desde + '-01')
    if (hasta) {
      fechaHasta = new Date(hasta + '-01')
      fechaHasta.setMonth(fechaHasta.getMonth() + 1)
      fechaHasta.setDate(fechaHasta.getDate() - 1)
    }

    // Incidencias
    const incidencias = await prisma.guardiaIncidencia.findMany({
      where: {
        configId: config?.id,
        fechaHora: { gte: fechaDesde, lte: fechaHasta }
      },
      include: {
        asignacion: { include: { tecnico: { include: { empleado: { select: { nombreCompleto: true } } } } } }
      },
      orderBy: { fechaHora: 'desc' }
    })

    // Asignaciones del periodo
    const asignaciones = await prisma.guardiaAsignacion.findMany({
      where: {
        configId: config?.id,
        semanaInicio: { gte: fechaDesde, lte: fechaHasta }
      },
      include: { tecnico: { include: { empleado: { select: { nombreCompleto: true } } } } }
    })

    // Calculos
    const total = incidencias.length
    const remotas = incidencias.filter(i => i.tipoResolucion === 'remoto').length
    const desplazamientos = incidencias.filter(i => i.tipoResolucion === 'desplazamiento').length
    const escalados = incidencias.filter(i => i.escaladoInterno).length
    const conDuracion = incidencias.filter(i => i.duracionMinutos)
    const duracionMedia = conDuracion.length > 0 ? Math.round(conDuracion.reduce((s, i) => s + (i.duracionMinutos || 0), 0) / conDuracion.length) : 0

    // Por categoria
    const porCategoria: Record<string, number> = {}
    incidencias.forEach(i => { const c = i.categoria || 'general'; porCategoria[c] = (porCategoria[c] || 0) + 1 })

    // Por planta
    const porPlanta: Record<string, number> = {}
    incidencias.forEach(i => { const p = i.planta || 'Sin especificar'; porPlanta[p] = (porPlanta[p] || 0) + 1 })

    // Por mes
    const porMes: Record<string, number> = {}
    incidencias.forEach(i => {
      const d = new Date(i.fechaHora)
      const key = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      porMes[key] = (porMes[key] || 0) + 1
    })

    // Por tecnico
    const porTecnico: Record<string, { total: number; remotas: number; desplaz: number; escalados: number }> = {}
    incidencias.forEach(i => {
      const nombre = i.asignacion?.tecnico?.empleado?.nombreCompleto || 'Sin asignar'
      if (!porTecnico[nombre]) porTecnico[nombre] = { total: 0, remotas: 0, desplaz: 0, escalados: 0 }
      porTecnico[nombre].total++
      if (i.tipoResolucion === 'remoto') porTecnico[nombre].remotas++
      if (i.tipoResolucion === 'desplazamiento') porTecnico[nombre].desplaz++
      if (i.escaladoInterno) porTecnico[nombre].escalados++
    })

    const periodoStr = desde || hasta
      ? `${desde ? new Date(desde + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : 'Inicio'} - ${hasta ? new Date(hasta + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : 'Actual'}`
      : `Enero - Diciembre ${anio}`

    const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`
    const fecha = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe Guardias Draxton - ${periodoStr}</title>
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
    .confidencial { display: inline-block; background: #FEF2F2; color: #dc2626; font-size: 8px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    h2 { font-size: 13px; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6; }
    h3 { font-size: 11px; font-weight: 600; color: #1f2937; margin: 12px 0 6px; }
    .subtitle { font-size: 11px; color: #6b7280; margin-bottom: 16px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .kpi-box { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
    .kpi-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px; }
    .kpi-value { font-size: 20px; font-weight: 800; }
    .kpi-sub { font-size: 8px; color: #9ca3af; margin-top: 2px; }
    .text-green { color: #16a34a; }
    .text-orange { color: #ea580c; }
    .text-blue { color: #2563eb; }
    .text-purple { color: #7c3aed; }
    .text-red { color: #dc2626; }
    .text-indigo { color: #4f46e5; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 16px; }
    thead th { background: #1f2937; color: white; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; }
    tbody td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
    tbody tr:nth-child(even) { background: #fafafa; }
    .total-row { background: #f3f4f6 !important; font-weight: 700; }
    .total-row td { border-top: 2px solid #e5e7eb; }
    .badge { display: inline-block; font-size: 7px; font-weight: 600; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; }
    .badge-green { background: #F0FDF4; color: #16a34a; }
    .badge-orange { background: #FFF7ED; color: #ea580c; }
    .badge-blue { background: #EFF6FF; color: #2563eb; }
    .badge-purple { background: #F5F3FF; color: #7c3aed; }
    .badge-gray { background: #f3f4f6; color: #6b7280; }
    .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .section-box { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .section-box h4 { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; letter-spacing: 0.3px; }
    .bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 60px; margin-top: 8px; }
    .bar { background: #4f46e5; border-radius: 2px 2px 0 0; min-width: 16px; position: relative; }
    .bar-label { font-size: 7px; color: #6b7280; text-align: center; margin-top: 2px; }
    .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #1f2937; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; z-index: 100; }
    .print-btn:hover { background: #111827; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

  <!-- PAGINA 1: Resumen Ejecutivo -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <span class="confidencial">Confidencial - Uso Interno</span><br/>
        Generado: ${fecha}
      </div>
    </div>

    <h1>Informe de Servicio de Guardias</h1>
    <p class="subtitle">Cliente: Draxton Europe Asia S.L.U. | Periodo: ${periodoStr}</p>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-label">Total Incidencias</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-sub">${incidencias.filter(i => i.estado === 'resuelta').length} resueltas</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Resolucion Remota</div>
        <div class="kpi-value text-green">${remotas}</div>
        <div class="kpi-sub">${total > 0 ? ((remotas / total) * 100).toFixed(0) : 0}% del total</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Desplazamientos</div>
        <div class="kpi-value text-orange">${desplazamientos}</div>
        <div class="kpi-sub">${total > 0 ? ((desplazamientos / total) * 100).toFixed(0) : 0}% del total</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Duracion Media</div>
        <div class="kpi-value text-blue">${duracionMedia} min</div>
        <div class="kpi-sub">${conDuracion.length} con registro</div>
      </div>
    </div>

    <h2>Distribucion por Categoria</h2>
    <table>
      <thead><tr><th>Categoria</th><th>Incidencias</th><th>%</th><th>Tipo predominante</th></tr></thead>
      <tbody>
        ${Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([cat, count]) => {
          const catInc = incidencias.filter(i => (i.categoria || 'general') === cat)
          const catRemotas = catInc.filter(i => i.tipoResolucion === 'remoto').length
          const tipoPred = catRemotas > catInc.length / 2 ? 'Remoto' : 'Mixto'
          return `<tr><td style="text-transform:capitalize;font-weight:600">${cat}</td><td>${count}</td><td>${total > 0 ? ((count / total) * 100).toFixed(0) : 0}%</td><td><span class="badge ${tipoPred === 'Remoto' ? 'badge-green' : 'badge-gray'}">${tipoPred}</span></td></tr>`
        }).join('')}
        <tr class="total-row"><td>Total</td><td>${total}</td><td>100%</td><td></td></tr>
      </tbody>
    </table>

    <h2>Distribucion por Planta</h2>
    <div class="section-grid">
      ${Object.entries(porPlanta).sort((a, b) => b[1] - a[1]).map(([planta, count]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f3f4f6">
          <span style="font-size:10px;font-weight:500">${planta}</span>
          <span style="font-size:12px;font-weight:700;color:#4f46e5">${count} <span style="font-size:8px;color:#9ca3af">(${total > 0 ? ((count / total) * 100).toFixed(0) : 0}%)</span></span>
        </div>
      `).join('')}
    </div>

    <div class="page-footer">
      <span>Internet Operadores S.L. - Informe de Guardias Draxton</span>
      <span>Pagina 1 de 2</span>
    </div>
  </div>

  <!-- PAGINA 2: Detalle por Tecnico y Periodo -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <span class="confidencial">Confidencial - Uso Interno</span><br/>
        ${periodoStr}
      </div>
    </div>

    <h2>Rendimiento por Tecnico</h2>
    <table>
      <thead><tr><th>Tecnico</th><th>Total</th><th>Remotas</th><th>Desplaz.</th><th>Escalados</th><th>% Remoto</th></tr></thead>
      <tbody>
        ${Object.entries(porTecnico).sort((a, b) => b[1].total - a[1].total).map(([nombre, data]) => `
          <tr>
            <td style="font-weight:600">${nombre}</td>
            <td>${data.total}</td>
            <td><span class="badge badge-green">${data.remotas}</span></td>
            <td><span class="badge badge-orange">${data.desplaz}</span></td>
            <td>${data.escalados > 0 ? `<span class="badge badge-purple">${data.escalados}</span>` : '0'}</td>
            <td style="font-weight:700;color:${data.total > 0 && (data.remotas / data.total) > 0.8 ? '#16a34a' : '#374151'}">${data.total > 0 ? ((data.remotas / data.total) * 100).toFixed(0) : 0}%</td>
          </tr>
        `).join('')}
        <tr class="total-row"><td>Total</td><td>${total}</td><td>${remotas}</td><td>${desplazamientos}</td><td>${escalados}</td><td>${total > 0 ? ((remotas / total) * 100).toFixed(0) : 0}%</td></tr>
      </tbody>
    </table>

    <h2>Evolucion Mensual</h2>
    <table>
      <thead><tr><th>Mes</th><th>Incidencias</th><th>% del Total</th></tr></thead>
      <tbody>
        ${Object.entries(porMes).map(([mes, count]) => `
          <tr><td style="font-weight:500;text-transform:capitalize">${mes}</td><td style="font-weight:700">${count}</td><td>${total > 0 ? ((count / total) * 100).toFixed(0) : 0}%</td></tr>
        `).join('')}
      </tbody>
    </table>

    <h2>Equipo de Guardias</h2>
    <table>
      <thead><tr><th>Tecnico</th><th>Nivel</th><th>Estado</th><th>Fecha Alta</th><th>Semanas Asignadas</th></tr></thead>
      <tbody>
        ${(config?.tecnicos || []).map(t => {
          const semanasAsig = asignaciones.filter(a => a.tecnicoId === t.id).length
          return `<tr>
            <td style="font-weight:600">${t.empleado.nombreCompleto}</td>
            <td><span class="badge ${t.nivel === 1 ? 'badge-blue' : t.nivel === 2 ? 'badge-purple' : 'badge-orange'}">Nivel ${t.nivel}</span></td>
            <td>${t.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Baja</span>'}</td>
            <td>${formatDate(t.fechaAlta)}</td>
            <td style="font-weight:700">${semanasAsig}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <h2>Protocolo de Escalado</h2>
    <div class="section-grid">
      <div class="section-box">
        <h4>Escalado Interno (IO)</h4>
        <p style="font-size:9px;line-height:1.8">
          <strong>N1:</strong> Tecnico de guardia (primera linea)<br/>
          <strong>N2:</strong> Alejandro Martinez Cayuelas<br/>
          <strong>N3:</strong> Joel Benet
        </p>
      </div>
      <div class="section-box">
        <h4>Escalado Draxton</h4>
        <p style="font-size:9px;line-height:1.8">
          <strong>N1/N2:</strong> Alexis Roldan<br/>
          <strong>N3:</strong> Sergi Tallon<br/>
          <strong>Notificacion:</strong> Service Desk + CC guardias
        </p>
      </div>
    </div>

    <div style="margin-top:16px;padding:10px;background:#FFF7ED;border:1px solid #fed7aa;border-radius:8px">
      <p style="font-size:9px;font-weight:600;color:#ea580c;margin-bottom:4px">Costes de Desplazamiento</p>
      <p style="font-size:9px;color:#374151">Kilometraje: 0,28 EUR/km | Actuacion presencial: 18 EUR/hora | Telefono guardia: 627 36 40 39</p>
    </div>

    <div class="page-footer">
      <span>Internet Operadores S.L. - Informe de Guardias Draxton</span>
      <span>Pagina 2 de 2</span>
    </div>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (error: any) {
    console.error('Error generando informe guardias:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
