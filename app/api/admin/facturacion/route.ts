import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    // Facturación por mes
    const porMesMap: Record<string, { total: number; count: number }> = {}
    facturas.forEach(f => {
      const mes = f.fecha.toISOString().substring(0, 7)
      if (!porMesMap[mes]) porMesMap[mes] = { total: 0, count: 0 }
      porMesMap[mes].total += Number(f.total)
      porMesMap[mes].count += 1
    })
    const porMes = Object.entries(porMesMap)
      .map(([mes, data]) => ({ mes, ...data }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

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

    // Remesas por mes
    const remesasPorMesMap: Record<string, { total: number; count: number }> = {}
    remesas.forEach(r => {
      const mes = r.fecha.toISOString().substring(0, 7)
      if (!remesasPorMesMap[mes]) remesasPorMesMap[mes] = { total: 0, count: 0 }
      remesasPorMesMap[mes].total += Number(r.totalImporte)
      remesasPorMesMap[mes].count += 1
    })
    const remesasPorMes = Object.entries(remesasPorMesMap)
      .map(([mes, data]) => ({ mes, ...data }))
      .sort((a, b) => a.mes.localeCompare(b.mes))

    // Remesas por categoría (extraer del nombre)
    const remesasPorCatMap: Record<string, { total: number; count: number }> = {}
    remesas.forEach(r => {
      // Extract category from name like "REMESA MÓVILES ENERO 2026"
      const parts = r.nombre.replace(/REMESA\s*/i, '').split(/\s+/)
      // Remove month and year from the end
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
