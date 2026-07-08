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

    // 1. Obtener remesas del mes con su conciliación y devoluciones
    const remesas = await prisma.remesa.findMany({
      where: {
        fecha: { gte: fechaInicio, lte: fechaFin }
      },
      include: {
        conciliacion: true,
        devoluciones: {
          select: { facturaId: true, estado: true, fechaCobro: true, numeroFactura: true }
        }
      }
    })

    if (remesas.length === 0) {
      return NextResponse.json({ error: 'No hay remesas para este mes' }, { status: 404 })
    }

    let totalMarcadasCobrada = 0
    let totalMarcadasPendiente = 0
    let totalYaEstaban = 0
    const detalles: { remesa: string; serie: string; marcadasCobrada: number; marcadasPendiente: number; yaEstaban: number }[] = []

    for (const remesa of remesas) {
      const serie = getSerieFromRemesa(remesa.nombre)
      if (!serie) continue

      // Separar devoluciones: las NO recuperadas vs las recuperadas
      const devolucionesNoRecuperadas = remesa.devoluciones
        .filter(d => d.facturaId && !d.fechaCobro)
        .map(d => d.facturaId as number)

      const devolucionesRecuperadas = remesa.devoluciones
        .filter(d => d.facturaId && d.fechaCobro)
        .map(d => d.facturaId as number)

      // --- PASO A: Marcar como PENDIENTE las facturas con devolución NO recuperada ---
      // (Nuestra BD manda: si ISPGestión las trajo como COBRADA pero tienen devolución sin recuperar, las ponemos PENDIENTE)
      let marcadasPendiente = 0
      if (devolucionesNoRecuperadas.length > 0) {
        const result = await prisma.factura.updateMany({
          where: {
            id: { in: devolucionesNoRecuperadas },
            situacion: { not: 'PENDIENTE' } // Solo actualizar si no están ya como PENDIENTE
          },
          data: {
            situacion: 'PENDIENTE'
          }
        })
        marcadasPendiente = result.count
      }

      // --- PASO B: Marcar como COBRADA las facturas de la remesa que NO tienen devolución pendiente ---
      const idsExcluir = devolucionesNoRecuperadas.length > 0 ? devolucionesNoRecuperadas : [-1]
      
      const facturasPorCobrar = await prisma.factura.findMany({
        where: {
          serieFactura: serie,
          ejercicio: anio,
          fecha: { gte: fechaInicio, lte: fechaFin },
          situacion: { not: 'COBRADA' },
          id: { notIn: idsExcluir }
        },
        select: { id: true }
      })

      let marcadasCobrada = 0
      if (facturasPorCobrar.length > 0) {
        const result = await prisma.factura.updateMany({
          where: {
            id: { in: facturasPorCobrar.map(f => f.id) }
          },
          data: {
            situacion: 'COBRADA',
            totalPendiente: 0
          }
        })
        marcadasCobrada = result.count
      }

      // --- PASO C: Contar las que ya estaban correctamente como COBRADA ---
      const yaCobradasCount = await prisma.factura.count({
        where: {
          serieFactura: serie,
          ejercicio: anio,
          fecha: { gte: fechaInicio, lte: fechaFin },
          situacion: 'COBRADA'
        }
      })

      totalMarcadasCobrada += marcadasCobrada
      totalMarcadasPendiente += marcadasPendiente
      totalYaEstaban += yaCobradasCount - marcadasCobrada // las que ya estaban antes

      detalles.push({
        remesa: remesa.nombre,
        serie,
        marcadasCobrada,
        marcadasPendiente,
        yaEstaban: yaCobradasCount - marcadasCobrada
      })
    }

    return NextResponse.json({
      success: true,
      totalMarcadasCobrada,
      totalMarcadasPendiente,
      totalYaEstaban,
      detalles,
      mensaje: `${totalMarcadasCobrada} facturas marcadas COBRADA. ${totalMarcadasPendiente} marcadas PENDIENTE (devolución sin recuperar). ${totalYaEstaban} ya estaban correctas.`
    })

  } catch (error) {
    console.error('Error marcando facturas como cobradas:', error)
    return NextResponse.json(
      { error: 'Error interno', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}
