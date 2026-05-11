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
      // If disabling particular, also clear the section and remove from secciones table
      if (!body.publicarWebParticular) {
        data.seccionWebParticular = null
        await prisma.tarifaSeccionWebParticular.deleteMany({
          where: { tarifaId },
        })
      }
    }
    if ('publicarWebEmpresa' in body) {
      data.publicarWebEmpresa = body.publicarWebEmpresa
      // If disabling empresa, also clear the section and remove from secciones table
      if (!body.publicarWebEmpresa) {
        data.seccionWebEmpresa = null
        // Remove all secciones from the many-to-many table
        await prisma.tarifaSeccionWeb.deleteMany({
          where: { tarifaId },
        })
      }
    }
    if ('seccionWebParticular' in body) {
      data.seccionWebParticular = body.seccionWebParticular || null
    }
    if ('seccionWebEmpresa' in body) {
      data.seccionWebEmpresa = body.seccionWebEmpresa || null
    }

    // Handle multiple secciones for Particulares (many-to-many)
    if ('seccionesWebParticular' in body) {
      const secciones: string[] = body.seccionesWebParticular || []
      
      // Update legacy field with the first section (backward compatibility)
      data.seccionWebParticular = secciones.length > 0 ? secciones[0] : null

      // Sync the many-to-many table
      await prisma.tarifaSeccionWebParticular.deleteMany({
        where: { tarifaId },
      })
      if (secciones.length > 0) {
        await prisma.tarifaSeccionWebParticular.createMany({
          data: secciones.map(seccion => ({ tarifaId, seccion })),
        })
      }
    }

    // Handle multiple secciones for Empresa (many-to-many)
    if ('seccionesWebEmpresa' in body) {
      const secciones: string[] = body.seccionesWebEmpresa || []
      
      // Update legacy field with the first section (backward compatibility)
      data.seccionWebEmpresa = secciones.length > 0 ? secciones[0] : null

      // Sync the many-to-many table
      await prisma.tarifaSeccionWeb.deleteMany({
        where: { tarifaId },
      })
      if (secciones.length > 0) {
        await prisma.tarifaSeccionWeb.createMany({
          data: secciones.map(seccion => ({ tarifaId, seccion })),
        })
      }
    }

    const tarifa = await prisma.tarifa.update({
      where: { id: tarifaId },
      data,
      select: {
        id: true,
        publicarWebParticular: true,
        publicarWebEmpresa: true,
        seccionWebParticular: true,
        seccionWebEmpresa: true,
        seccionesWeb: {
          select: { seccion: true },
        },
        seccionesWebParticular: {
          select: { seccion: true },
        },
      },
    })

    return NextResponse.json({
      ...tarifa,
      seccionesWebEmpresa: tarifa.seccionesWeb.map((s: { seccion: string }) => s.seccion),
      seccionesWebParticular: tarifa.seccionesWebParticular.map((s: { seccion: string }) => s.seccion),
    })
  } catch (error) {
    console.error('Error al actualizar publicación web:', error)
    return NextResponse.json(
      { error: 'Error al actualizar publicación web' },
      { status: 500 }
    )
  }
}
