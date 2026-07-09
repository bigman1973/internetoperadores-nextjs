import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Códigos de cliente Draxton en ISP Gestión
const DRAXTON_CODIGOS = ['006003', '006004', '006006', '006001']

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())

  try {
    // Obtener todas las facturas de Draxton del año
    const facturas = await prisma.factura.findMany({
      where: {
        codigoCliente: { in: DRAXTON_CODIGOS },
        ejercicio: year,
      },
      select: {
        id: true,
        serieFactura: true,
        numeroDocumento: true,
        fecha: true,
        nombreCompleto: true,
        codigoCliente: true,
        base: true,
        totalImpuesto: true,
        total: true,
        situacion: true,
        totalPendiente: true,
      },
      orderBy: { fecha: 'asc' },
    })

    // Mapeo de códigos a nombres cortos de sociedad
    const SOCIEDADES: Record<string, string> = {
      '006003': 'DRAXTON EUROPE & ASIA',
      '006004': 'DRAXTON POWERTRAIN & CHASSIS',
      '006006': 'DRAXTON BRNO',
      '006001': 'INFUN FOR',
    }

    // Agrupar por mes
    const porMes: Record<string, {
      mes: string,
      facturas: number,
      base: number,
      total: number,
      cobrado: number,
      pendiente: number,
      porSociedad: Record<string, { facturas: number, base: number, total: number }>
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
      for (const cod of DRAXTON_CODIGOS) {
        porMes[key].porSociedad[SOCIEDADES[cod]] = { facturas: 0, base: 0, total: 0 }
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
      const pendiente = Number(f.totalPendiente)
      const cobrado = total - pendiente

      porMes[mes].facturas++
      porMes[mes].base += base
      porMes[mes].total += total
      porMes[mes].cobrado += cobrado
      porMes[mes].pendiente += pendiente

      const sociedad = SOCIEDADES[f.codigoCliente] || f.nombreCompleto
      if (porMes[mes].porSociedad[sociedad]) {
        porMes[mes].porSociedad[sociedad].facturas++
        porMes[mes].porSociedad[sociedad].base += base
        porMes[mes].porSociedad[sociedad].total += total
      }

      totalBase += base
      totalTotal += total
      totalCobrado += cobrado
      totalPendiente += pendiente
    }

    // Detalle de facturas para la tabla
    const detalle = facturas.map(f => ({
      id: f.id,
      numero: `${f.serieFactura}/${f.numeroDocumento}`,
      fecha: f.fecha.toISOString().substring(0, 10),
      sociedad: SOCIEDADES[f.codigoCliente] || f.nombreCompleto,
      base: Number(f.base),
      iva: Number(f.totalImpuesto),
      total: Number(f.total),
      situacion: f.situacion,
      pendiente: Number(f.totalPendiente),
    }))

    // Resumen por sociedad
    const porSociedad = DRAXTON_CODIGOS.map(cod => {
      const facts = facturas.filter(f => f.codigoCliente === cod)
      return {
        codigo: cod,
        nombre: SOCIEDADES[cod],
        facturas: facts.length,
        base: facts.reduce((s, f) => s + Number(f.base), 0),
        total: facts.reduce((s, f) => s + Number(f.total), 0),
        cobrado: facts.reduce((s, f) => s + Number(f.total) - Number(f.totalPendiente), 0),
        pendiente: facts.reduce((s, f) => s + Number(f.totalPendiente), 0),
      }
    }).filter(s => s.facturas > 0)

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
