import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Mapeo nombre de remesa → serie de factura
function getSerieFromRemesa(nombreRemesa: string): string | null {
  const nombre = nombreRemesa.toUpperCase()
  if (nombre.includes('LLEIDA')) return 'CLL'
  if (nombre.includes('PALLARS')) return 'CPL'
  if (nombre.includes('MÓVILES') || nombre.includes('MOVILES')) return 'CMV'
  if (nombre.includes('COMUNIDAD')) return 'CCM'
  return null
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { anio, mes } = await request.json()
    
    if (!anio || !mes) {
      return NextResponse.json({ error: 'Faltan parámetros anio y mes' }, { status: 400 })
    }

    const fechaInicio = new Date(`${anio}-${String(mes).padStart(2, '0')}-01`)
    const fechaFin = new Date(anio, mes, 0) // último día del mes

    // 1. Obtener remesas del mes con su conciliación
    const remesas = await prisma.remesa.findMany({
      where: {
        fecha: { gte: fechaInicio, lte: fechaFin }
      },
      include: {
        conciliacion: true,
        devoluciones: {
          select: { facturaId: true, estado: true, fechaCobro: true }
        }
      }
    })

    if (remesas.length === 0) {
      return NextResponse.json({ error: 'No hay remesas para este mes' }, { status: 404 })
    }

    let totalMarcadas = 0
    let totalExcluidas = 0
    const detalles: { remesa: string; serie: string; marcadas: number; excluidas: number; yaEstaban: number }[] = []

    for (const remesa of remesas) {
      const serie = getSerieFromRemesa(remesa.nombre)
      if (!serie) continue

      // Obtener IDs de facturas con devolución NO recuperada
      const facturasConDevolucion = remesa.devoluciones
        .filter(d => d.facturaId && !d.fechaCobro) // tiene factura vinculada Y no se ha cobrado después
        .map(d => d.facturaId as number)

      // Obtener facturas PENDIENTES de esta serie en este mes
      const facturasPendientes = await prisma.factura.findMany({
        where: {
          serieFactura: serie,
          ejercicio: anio,
          fecha: { gte: fechaInicio, lte: fechaFin },
          situacion: { not: 'COBRADA' },
          id: { notIn: facturasConDevolucion.length > 0 ? facturasConDevolucion : [-1] }
        },
        select: { id: true, total: true, numeroDocumento: true }
      })

      // Contar las que ya estaban cobradas
      const yaCobradasCount = await prisma.factura.count({
        where: {
          serieFactura: serie,
          ejercicio: anio,
          fecha: { gte: fechaInicio, lte: fechaFin },
          situacion: 'COBRADA'
        }
      })

      // Marcar como COBRADA
      if (facturasPendientes.length > 0) {
        await prisma.factura.updateMany({
          where: {
            id: { in: facturasPendientes.map(f => f.id) }
          },
          data: {
            situacion: 'COBRADA',
            totalPendiente: 0
          }
        })
      }

      totalMarcadas += facturasPendientes.length
      totalExcluidas += facturasConDevolucion.length

      detalles.push({
        remesa: remesa.nombre,
        serie,
        marcadas: facturasPendientes.length,
        excluidas: facturasConDevolucion.length,
        yaEstaban: yaCobradasCount
      })
    }

    return NextResponse.json({
      success: true,
      totalMarcadas,
      totalExcluidas,
      detalles,
      mensaje: `${totalMarcadas} facturas marcadas como COBRADA. ${totalExcluidas} excluidas por devolución pendiente.`
    })

  } catch (error) {
    console.error('Error marcando facturas como cobradas:', error)
    return NextResponse.json(
      { error: 'Error interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
