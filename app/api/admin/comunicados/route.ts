import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const comunicados = await prisma.comunicado.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ comunicados })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { tipo, asunto, contenido, destinatarios } = body

  if (!asunto || !contenido) {
    return NextResponse.json({ error: 'Asunto y contenido son requeridos' }, { status: 400 })
  }

  const comunicado = await prisma.comunicado.create({
    data: {
      tipo: tipo || 'MANTENIMIENTO',
      asunto,
      contenido,
      destinatarios: destinatarios || 'TODOS',
      estado: 'BORRADOR',
      creadoPor: session.user?.email || 'admin',
    },
  })

  return NextResponse.json(comunicado)
}
