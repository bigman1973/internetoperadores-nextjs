export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { newsletterSuscrito } = await request.json()
    const resolvedParams = await params
    const clienteId = parseInt(resolvedParams.id)

    const cliente = await prisma.clienteWeb.update({
      where: { id: clienteId },
      data: {
        newsletterSuscrito,
      },
    })

    return NextResponse.json(cliente)
  } catch (error) {
    console.error('Error al cambiar suscripción newsletter:', error)
    return NextResponse.json(
      { error: 'Error al cambiar suscripción newsletter' },
      { status: 500 }
    )
  }
}
