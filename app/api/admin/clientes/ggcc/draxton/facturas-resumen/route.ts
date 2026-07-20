import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: Resumen de facturación vinculada por contrato Draxton
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
        select: { id: true, base: true, total: true },
      })
    : []

  const facturasMap = new Map(facturas.map(f => [f.id, f]))

  // Agrupar por contrato separando mensualidad vs adicional
  const resumenPorContrato: Record<string, { facturado: number; facturas: number; facturadoAdicional: number; facturasAdicional: number }> = {}

  for (const vinc of vinculaciones) {
    const factura = facturasMap.get(vinc.facturaId)
    if (!factura) continue // factura no es del año seleccionado

    if (!resumenPorContrato[vinc.contratoDraxtonId]) {
      resumenPorContrato[vinc.contratoDraxtonId] = { facturado: 0, facturas: 0, facturadoAdicional: 0, facturasAdicional: 0 }
    }

    if (vinc.tipoFacturacion === 'adicional') {
      resumenPorContrato[vinc.contratoDraxtonId].facturadoAdicional += Number(vinc.importeAsignado)
      resumenPorContrato[vinc.contratoDraxtonId].facturasAdicional++
    } else {
      resumenPorContrato[vinc.contratoDraxtonId].facturado += Number(vinc.importeAsignado)
      resumenPorContrato[vinc.contratoDraxtonId].facturas++
    }
  }

  // Calcular totales
  const totalFacturado = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturado, 0)
  const totalFacturas = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturas, 0)
  const totalFacturadoAdicional = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturadoAdicional, 0)
  const totalFacturasAdicional = Object.values(resumenPorContrato).reduce((sum, r) => sum + r.facturasAdicional, 0)

  return NextResponse.json({
    anio,
    resumenPorContrato,
    totalFacturado,
    totalFacturas,
    totalFacturadoAdicional,
    totalFacturasAdicional,
  })
}
