import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params
    const id = parseInt(idParam)
    
    if (isNaN(id)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const tarifa = await prisma.tarifa.findUnique({
      where: { id, activa: true },
      select: {
        id: true,
        nombre: true,
        nombreComercial: true,
        descripcionCorta: true,
        descripcionLarga: true,
        precioSinIva: true,
        precioConIva: true,
        cuotaAlta: true,
        permanencia: true,
        categoria: true,
        subcategoria: true,
        tipoPeriodicidad: true,
        duracionPermanenciaMeses: true,
        precioPeriodo: true,
        precioPeriodoIva: true,
        tipoCliente: true,
        caracteristicas: true,
        grupoProducto: true,
      },
    })

    if (!tarifa) {
      return NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 404 })
    }

    return NextResponse.json(tarifa)
  } catch (error) {
    console.error('Error fetching tarifa:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
