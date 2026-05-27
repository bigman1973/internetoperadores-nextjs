import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const { estado } = await request.json()

    const estadosValidos = [
      'FORMULARIO_PENDIENTE',
      'FORMULARIO_COMPLETADO',
      'DOCUMENTACION_PENDIENTE',
      'DOCUMENTACION_PARCIAL',
      'DOCUMENTACION_COMPLETA',
      'PAGO_PENDIENTE',
      'PAGO_COMPLETADO',
      'EN_REVISION',
      'APROBADA',
      'RECHAZADA',
      'SERVICIO_ACTIVO',
      'CANCELADA',
    ]

    if (!estadosValidos.includes(estado)) {
      return NextResponse.json({ error: 'Estado no válido' }, { status: 400 })
    }

    const alta = await prisma.altaServicio.update({
      where: { id },
      data: { estado },
    })

    return NextResponse.json({ success: true, estado: alta.estado })
  } catch (error: any) {
    console.error('Error actualizando estado:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
