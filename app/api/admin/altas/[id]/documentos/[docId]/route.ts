import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { id, docId } = await params
    const { validado, observaciones } = await request.json()

    const documento = await prisma.documentoAlta.update({
      where: { id: parseInt(docId) },
      data: {
        validado: validado ?? undefined,
        observaciones: observaciones ?? undefined,
      },
    })

    return NextResponse.json({ success: true, documento })
  } catch (error: any) {
    console.error('Error actualizando documento:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
