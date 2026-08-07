import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Clientes Draxton (buscar por nombre en facturaEmitida)
const DRAXTON_CLIENTES = ['DRAXTON', 'INFUN', 'FUCHOSA', 'ALTEC']

// Mapeo de sociedades
const SOCIEDADES: Record<string, string> = {
  'DRAXTON EUROPE': 'DRAXTON EUROPE & ASIA',
  'DRAXTON POWERTRAIN': 'DRAXTON POWERTRAIN & CHASSIS',
  'DRAXTON BRNO': 'DRAXTON BRNO',
  'INFUN': 'INFUN FOR',
  'FUCHOSA': 'FUCHOSA',
  'ALTEC': 'ALTEC',
}

function getSociedad(cliente: string): string {
  const upper = (cliente || '').toUpperCase()
  for (const [key, value] of Object.entries(SOCIEDADES)) {
    if (upper.includes(key)) return value
  }
  return cliente || 'OTROS'
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())

  try {
    const startDate = new Date(`${year}-01-01`)
    const endDate = new Date(`${year + 1}-01-01`)

    // Obtener facturas emitidas de Draxton del año (desde facturaEmitida)
    const facturas = await prisma.facturaEmitida.findMany({
      where: {
        fecha: { gte: startDate, lt: endDate },
        OR: DRAXTON_CLIENTES.map(c => ({ cliente: { contains: c, mode: 'insensitive' as const } })),
      },
      select: {
        id: true,
        numFactura: true,
        serie: true,
        fecha: true,
        cliente: true,
        base: true,
        importeIva: true,
        total: true,
        estado: true,
        importeCobrado: true,
        formaCobro: true,
        fechaCobro: true,
        concepto: true,
      },
      orderBy: { fecha: 'asc' },
    })

    // Agrupar por mes
    const porMes: Record<string, {
      mes: string,
      facturas: number,
      base: number,
      total: number,
      cobrado: number,
      pendiente: number,
      porSociedad: Record<string, { facturas: number, base: number, total: number, cobrado: number }>
    }> = {}

    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`
      porMes[key] = {
        mes: key,
        facturas: 0,
        base: 0,
        total: 0,
        cobrado: 0,
        pendiente: 0,
        porSociedad: {}
      }
    }

    let totalBase = 0
    let totalTotal = 0
    let totalCobrado = 0
    let totalPendiente = 0

    for (const f of facturas) {
      const mes = f.fecha.toISOString().substring(0, 7)
      if (!porMes[mes]) continue

      const base = Number(f.base)
      const total = Number(f.total)
      const cobrado = Number(f.importeCobrado) || 0
      const pendiente = total - cobrado

      porMes[mes].facturas++
      porMes[mes].base += base
      porMes[mes].total += total
      porMes[mes].cobrado += cobrado
      porMes[mes].pendiente += pendiente

      const sociedad = getSociedad(f.cliente)
      if (!porMes[mes].porSociedad[sociedad]) {
        porMes[mes].porSociedad[sociedad] = { facturas: 0, base: 0, total: 0, cobrado: 0 }
      }
      porMes[mes].porSociedad[sociedad].facturas++
      porMes[mes].porSociedad[sociedad].base += base
      porMes[mes].porSociedad[sociedad].total += total
      porMes[mes].porSociedad[sociedad].cobrado += cobrado

      totalBase += base
      totalTotal += total
      totalCobrado += cobrado
      totalPendiente += pendiente
    }

    // Detalle de facturas para la tabla
    const detalle = facturas.map(f => ({
      id: f.id,
      numero: f.numFactura,
      fecha: f.fecha.toISOString().substring(0, 10),
      sociedad: getSociedad(f.cliente),
      base: Number(f.base),
      iva: Number(f.importeIva),
      total: Number(f.total),
      situacion: f.estado,
      pendiente: Number(f.total) - (Number(f.importeCobrado) || 0),
      cobrado: Number(f.importeCobrado) || 0,
      formaCobro: f.formaCobro,
    }))

    // Resumen por sociedad
    const sociedadesMap: Record<string, { facturas: number, base: number, total: number, cobrado: number, pendiente: number }> = {}
    for (const f of facturas) {
      const soc = getSociedad(f.cliente)
      if (!sociedadesMap[soc]) {
        sociedadesMap[soc] = { facturas: 0, base: 0, total: 0, cobrado: 0, pendiente: 0 }
      }
      sociedadesMap[soc].facturas++
      sociedadesMap[soc].base += Number(f.base)
      sociedadesMap[soc].total += Number(f.total)
      sociedadesMap[soc].cobrado += Number(f.importeCobrado) || 0
      sociedadesMap[soc].pendiente += Number(f.total) - (Number(f.importeCobrado) || 0)
    }

    const porSociedad = Object.entries(sociedadesMap)
      .map(([nombre, data]) => ({ nombre, ...data }))
      .filter(s => s.facturas > 0)
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({
      year,
      resumen: {
        totalFacturas: facturas.length,
        totalBase,
        totalTotal,
        totalCobrado,
        totalPendiente,
      },
      porMes: Object.values(porMes).filter(m => m.facturas > 0),
      porSociedad,
      detalle,
    })
  } catch (error: any) {
    console.error('Error en API finanzas Draxton:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
