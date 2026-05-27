import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params

    const alta = await prisma.altaServicio.findUnique({
      where: { id },
      include: {
        documentos: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 })
    }

    return NextResponse.json(alta)
  } catch (error: any) {
    console.error('Error obteniendo alta:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
