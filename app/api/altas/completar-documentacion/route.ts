import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
    }

    const alta = await prisma.altaServicio.findUnique({
      where: { token },
      include: { documentos: true },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 })
    }

    if (alta.documentos.length === 0) {
      return NextResponse.json({ error: 'No hay documentos subidos' }, { status: 400 })
    }

    // Actualizar estado a DOCUMENTACION_COMPLETA
    await prisma.altaServicio.update({
      where: { id: alta.id },
      data: {
        estado: 'DOCUMENTACION_COMPLETA',
        completadoAt: new Date(),
      },
    })

    // TODO: Enviar email de confirmación al cliente
    // TODO: Enviar notificación al equipo de IO

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error completando documentación:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
