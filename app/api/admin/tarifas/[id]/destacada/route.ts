import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { destacada } = await request.json()
    const tarifaId = parseInt(params.id)

    const tarifa = await prisma.tarifa.update({
      where: { id: tarifaId },
      data: {
        destacada,
        updatedById: parseInt(session.user.id),
      },
    })

    // Registrar en historial
    await prisma.historialCambio.create({
      data: {
        tarifaId,
        usuarioId: parseInt(session.user.id),
        accion: 'EDITAR',
        cambios: { destacada },
      },
    })

    return NextResponse.json(tarifa)
  } catch (error) {
    console.error('Error al cambiar destacada:', error)
    return NextResponse.json(
      { error: 'Error al cambiar destacada' },
      { status: 500 }
    )
  }
}
