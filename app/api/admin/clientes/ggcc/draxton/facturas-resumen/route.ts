import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: Resumen de facturación vinculada por contrato Draxton + datos de cobro por confirming
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())

  // Obtener todas las vinculaciones
  const vinculaciones = await prisma.facturaContratoDraxton.findMany()

  // Obtener las facturas vinculadas del año
  const facturaIds = vinculaciones.map(v => v.facturaId)
  const facturas = facturaIds.length > 0
    ? await prisma.factura.findMany({
        where: { id: { in: facturaIds }, ejercicio: anio },
        select: { id: true, base: true, total: true, numeroDocumento: true },
      })
    : []

  const facturasMap = new Map(facturas.map(f => [f.id, f]))

  // Obtener datos de cobro de facturaEmitida para cruzar por numFactura
  const facturasEmitidasAll = await prisma.facturaEmitida.findMany({
    where: {
      fecha: { gte: new Date(`${anio}-01-01`), lt: new Date(`${anio + 1}-01-01`) },
      numFactura: { startsWith: 'DRAX' },
    },
    select: { numFactura: true, importeCobrado: true, estado: true },
  })
  const cobradoMap = new Map(facturasEmitidasAll.map(f => [f.numFactura, f]))

  // Agrupar por contrato separando mensualidad vs adicional
  const resumenPorContrato: Record<string, { 
    facturado: number; facturas: number; 
    facturadoAdicional: number; facturasAdicional: number;
    cobrado: number; facturasCobradas: number;
    pendienteCobro: number;
  }> = {}

  for (const vinc of vinculaciones) {
    const factura = facturasMap.get(vinc.facturaId)
    if (!factura) continue // factura no es del año seleccionado

    if (!resumenPorContrato[vinc.contratoDraxtonId]) {
      resumenPorContrato[vinc.contratoDraxtonId] = { 
        facturado: 0, facturas: 0, 
        facturadoAdicional: 0, facturasAdicional: 0,
        cobrado: 0, facturasCobradas: 0,
        pendienteCobro: 0,
      }
    }

    if (vinc.tipoFacturacion === 'adicional') {
      resumenPorContrato[vinc.contratoDraxtonId].facturadoAdicional += Number(vinc.importeAsignado)
      resumenPorContrato[vinc.contratoDraxtonId].facturasAdicional++
    } else {
      resumenPorContrato[vinc.contratoDraxtonId].facturado += Number(vinc.importeAsignado)
      resumenPorContrato[vinc.contratoDraxtonId].facturas++
    }

    // Cruzar con facturaEmitida para obtener cobrado por contrato
    const numDoc = factura.numeroDocumento // Ej: DRAX26/24
    const fe = cobradoMap.get(numDoc)
    if (fe && fe.importeCobrado > 0) {
      // Proporción del cobro asignada a este contrato
      const proporcion = Number(vinc.importeAsignado) / Number(factura.total)
      resumenPorContrato[vinc.contratoDraxtonId].cobrado += fe.importeCobrado * proporcion
      if (fe.estado === 'COBRADA') {
        resumenPorContrato[vinc.contratoDraxtonId].facturasCobradas++
      }
    }
  }

  // Calcular pendiente de cobro por contrato
  for (const key of Object.keys(resumenPorContrato)) {
    const r = resumenPorContrato[key]
    r.pendienteCobro = (r.facturado + r.facturadoAdicional) - r.cobrado
  }

  // Obtener datos de cobro de FacturaEmitida (confirming) para el año
  // Las facturas emitidas a Draxton tienen numFactura tipo DRAX26/XX
  const facturasEmitidas = await prisma.facturaEmitida.findMany({
    where: {
      fecha: { 
        gte: new Date(`${anio}-01-01`), 
        lt: new Date(`${anio + 1}-01-01`) 
      },
      OR: [
        { cliente: { contains: 'Draxton', mode: 'insensitive' } },
        { cliente: { contains: 'Fuchosa', mode: 'insensitive' } },
        { cliente: { contains: 'Altec', mode: 'insensitive' } },
        { cliente: { contains: 'Infun', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      numFactura: true,
      total: true,
      importeCobrado: true,
      estado: true,
      formaCobro: true,
      imputacion: true,
    },
  })

  // Calcular totales de cobro global (no por contrato, ya que la vinculación es con facturas legacy)
  const totalCobrado = facturasEmitidas.reduce((sum, f) => sum + (f.importeCobrado || 0), 0)
  const totalFacturadoEmitidas = facturasEmitidas.reduce((sum, f) => sum + f.total, 0)
  const facturasCobradas = facturasEmitidas.filter(f => f.estado === 'COBRADA').length
  const facturasPendientesCobro = facturasEmitidas.filter(f => f.estado !== 'COBRADA').length
  const pendienteCobro = totalFacturadoEmitidas - totalCobrado

  // Calcular totales de facturación legacy
  const totalFacturado = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturado, 0)
  const totalFacturas = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturas, 0)
  const totalFacturadoAdicional = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturadoAdicional, 0)
  const totalFacturasAdicional = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturasAdicional, 0)

  // Datos de confirming
  const confirmingLineas = await prisma.confirmingLinea.findMany({
    where: { facturaEmitidaId: { not: null } },
    select: { 
      numFactura: true, 
      importe: true, 
      facturaEmitidaId: true,
      confirming: { select: { confirmingProveedor: true, fecha: true } },
    },
  })

  return NextResponse.json({
    anio,
    resumenPorContrato,
    totalFacturado,
    totalFacturas,
    totalFacturadoAdicional,
    totalFacturasAdicional,
    // Datos de cobro (confirming)
    cobro: {
      totalCobrado,
      totalFacturadoEmitidas,
      facturasCobradas,
      facturasPendientesCobro,
      pendienteCobro,
      totalFacturasEmitidas: facturasEmitidas.length,
      porcentajeCobrado: totalFacturadoEmitidas > 0 
        ? Math.round((totalCobrado / totalFacturadoEmitidas) * 100) 
        : 0,
    },
    // Detalle de confirmings vinculados
    confirmings: {
      totalLineas: confirmingLineas.length,
      importeTotal: confirmingLineas.reduce((sum, l) => sum + l.importe, 0),
    },
  })
}
