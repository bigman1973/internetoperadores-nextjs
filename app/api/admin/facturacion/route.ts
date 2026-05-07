import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// V-Valley client ID in ISP Gestión (id_cliente in facturas table)
const VVALLEY_ID_CLIENTE = 1969

export async function GET() {
  try {
    // Get all facturas
    const facturas = await prisma.factura.findMany({
      orderBy: { fecha: 'desc' },
    })

    // Get all remesas
    const remesas = await prisma.remesa.findMany({
      orderBy: { fecha: 'desc' },
    })

    // Stats
    const totalFacturado = facturas.reduce((sum, f) => sum + Number(f.total), 0)
    const cobradas = facturas.filter(f => f.situacion === 'COBRADA')
    const pendientes = facturas.filter(f => f.situacion === 'PENDIENTE')
    const totalCobrado = cobradas.reduce((sum, f) => sum + Number(f.total), 0)
    const totalPendienteAmount = facturas.reduce((sum, f) => sum + Number(f.totalPendiente || 0), 0)
    const totalRemesado = remesas.reduce((sum, r) => sum + Number(r.totalImporte), 0)

    // V-Valley facturas
    const vvalleyFacturas = facturas.filter(f => f.idCliente === VVALLEY_ID_CLIENTE)
    const totalVValley = vvalleyFacturas.reduce((sum, f) => sum + Number(f.total), 0)

    // Facturación por mes (incluyendo V-Valley)
    const porMesMap: Record<string, { total: number; count: number; vvalleyTotal: number; vvalleyCount: number }> = {}
    facturas.forEach(f => {
      const mes = f.fecha.toISOString().substring(0, 7)
      if (!porMesMap[mes]) porMesMap[mes] = { total: 0, count: 0, vvalleyTotal: 0, vvalleyCount: 0 }
      porMesMap[mes].total += Number(f.total)
      porMesMap[mes].count += 1
      if (f.idCliente === VVALLEY_ID_CLIENTE) {
        porMesMap[mes].vvalleyTotal += Number(f.total)
        porMesMap[mes].vvalleyCount += 1
      }
    })

    // Remesas por mes
    const remesasPorMesMap: Record<string, { total: number; count: number }> = {}
    remesas.forEach(r => {
      const mes = r.fecha.toISOString().substring(0, 7)
      if (!remesasPorMesMap[mes]) remesasPorMesMap[mes] = { total: 0, count: 0 }
      remesasPorMesMap[mes].total += Number(r.totalImporte)
      remesasPorMesMap[mes].count += 1
    })

    // Unificar datos mensuales: facturación total, V-Valley, remesas
    const allMeses = new Set([...Object.keys(porMesMap), ...Object.keys(remesasPorMesMap)])
    const resumenMensual = Array.from(allMeses)
      .sort()
      .map(mes => {
        const facData = porMesMap[mes] || { total: 0, count: 0, vvalleyTotal: 0, vvalleyCount: 0 }
        const remData = remesasPorMesMap[mes] || { total: 0, count: 0 }
        return {
          mes,
          totalFacturado: facData.total,
          numFacturas: facData.count,
          vvalleyFacturado: facData.vvalleyTotal,
          vvalleyNumFacturas: facData.vvalleyCount,
          vvalleyPorcentaje: facData.total > 0 ? (facData.vvalleyTotal / facData.total) * 100 : 0,
          totalRemesado: remData.total,
          numRemesas: remData.count,
        }
      })

    // Facturación por serie
    const porSerieMap: Record<string, { total: number; count: number }> = {}
    facturas.forEach(f => {
      const serie = f.serieFactura || 'Sin serie'
      if (!porSerieMap[serie]) porSerieMap[serie] = { total: 0, count: 0 }
      porSerieMap[serie].total += Number(f.total)
      porSerieMap[serie].count += 1
    })
    const porSerie = Object.entries(porSerieMap)
      .map(([serie, data]) => ({ serie, ...data }))
      .sort((a, b) => b.total - a.total)

    // Remesas por mes (mantener para compatibilidad)
    const remesasPorMes = Object.entries(remesasPorMesMap)
      .map(([mes, data]) => ({ mes, ...data }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    // Remesas por categoría (extraer del nombre)
    const remesasPorCatMap: Record<string, { total: number; count: number }> = {}
    remesas.forEach(r => {
      const parts = r.nombre.replace(/REMESA\s*/i, '').split(/\s+/)
      const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
      const filteredParts = parts.filter(p => !meses.includes(p.toUpperCase()) && !/^\d{4}$/.test(p))
      const categoria = filteredParts.join(' ') || 'General'
      if (!remesasPorCatMap[categoria]) remesasPorCatMap[categoria] = { total: 0, count: 0 }
      remesasPorCatMap[categoria].total += Number(r.totalImporte)
      remesasPorCatMap[categoria].count += 1
    })
    const remesasPorCategoria = Object.entries(remesasPorCatMap)
      .map(([categoria, data]) => ({ categoria, ...data }))
      .sort((a, b) => b.total - a.total)

    // Facturación por mes (mantener para compatibilidad)
    const porMes = Object.entries(porMesMap)
      .map(([mes, data]) => ({ mes, total: data.total, count: data.count }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    return NextResponse.json({
      stats: {
        totalFacturas: facturas.length,
        totalFacturado,
        totalCobrado,
        totalPendiente: totalPendienteAmount,
        cobradas: cobradas.length,
        pendientes: pendientes.length,
        totalRemesas: remesas.length,
        totalRemesado,
        vvalleyTotal: totalVValley,
        vvalleyFacturas: vvalleyFacturas.length,
        vvalleyPorcentaje: totalFacturado > 0 ? (totalVValley / totalFacturado) * 100 : 0,
      },
      facturas: facturas.map(f => ({
        id: f.id,
        serieFactura: f.serieFactura,
        numeroDocumento: f.numeroDocumento,
        documento: f.documento,
        fecha: f.fecha.toISOString(),
        codigoCliente: f.codigoCliente,
        nombreCompleto: f.nombreCompleto,
        nifCif: f.nifCif,
        base: Number(f.base),
        totalImpuesto: Number(f.totalImpuesto),
        total: Number(f.total),
        situacion: f.situacion,
        totalPendiente: Number(f.totalPendiente || 0),
      })),
      remesas: remesas.map(r => ({
        id: r.id,
        nombre: r.nombre,
        fecha: r.fecha.toISOString(),
        totalImporte: Number(r.totalImporte),
        numeroRegistros: r.numeroRegistros,
        remesado: r.remesado,
        contabilizado: r.contabilizado,
        ibanAcreedor: r.ibanAcreedor,
      })),
      resumenMensual,
      porMes,
      porSerie,
      remesasPorMes,
      remesasPorCategoria,
    })
  } catch (error: any) {
    console.error('Error fetching facturacion:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
