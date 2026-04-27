export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../../lib/auth'
import prisma from '../../../../../../lib/prisma'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const resolvedParams = await params
    const tarifaId = parseInt(resolvedParams.id)

    // Build update data - only include fields that are present in the request
    const data: any = {
      updatedById: parseInt(session.user.id),
    }

    if ('publicarWebParticular' in body) {
      data.publicarWebParticular = body.publicarWebParticular
      // If disabling particular, also clear the section
      if (!body.publicarWebParticular) {
        data.seccionWebParticular = null
      }
    }
    if ('publicarWebEmpresa' in body) {
      data.publicarWebEmpresa = body.publicarWebEmpresa
    }
    if ('seccionWebParticular' in body) {
      data.seccionWebParticular = body.seccionWebParticular || null
    }

    const tarifa = await prisma.tarifa.update({
      where: { id: tarifaId },
      data,
      select: {
        id: true,
        publicarWebParticular: true,
        publicarWebEmpresa: true,
        seccionWebParticular: true,
      },
    })

    return NextResponse.json(tarifa)
  } catch (error) {
    console.error('Error al actualizar publicación web:', error)
    return NextResponse.json(
      { error: 'Error al actualizar publicación web' },
      { status: 500 }
    )
  }
}
