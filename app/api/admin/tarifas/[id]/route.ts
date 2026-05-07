export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import prisma from '../../../../../lib/prisma'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const resolvedParams = await params
    const tarifaId = parseInt(resolvedParams.id)
    await prisma.tarifa.delete({ where: { id: tarifaId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const resolvedParams = await params
    const tarifaId = parseInt(resolvedParams.id)
    const tarifa = await prisma.tarifa.findUnique({
      where: { id: tarifaId },
      include: {
        seccionesWeb: { select: { seccion: true } },
      },
    })
    if (!tarifa) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json({
      ...tarifa,
      seccionesWebEmpresa: tarifa.seccionesWeb.map(s => s.seccion),
    })
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const resolvedParams = await params
    const tarifaId = parseInt(resolvedParams.id)
    const body = await request.json()

    // Extract seccionesWebEmpresa before passing to Prisma update
    const { seccionesWebEmpresa, ...updateData } = body

    // If seccionesWebEmpresa is provided, sync the many-to-many table
    if (seccionesWebEmpresa !== undefined) {
      const secciones: string[] = seccionesWebEmpresa || []
      // Update legacy field for backward compatibility
      updateData.seccionWebEmpresa = secciones.length > 0 ? secciones[0] : null
      // Sync the many-to-many table
      await prisma.tarifaSeccionWeb.deleteMany({ where: { tarifaId } })
      if (secciones.length > 0) {
        await prisma.tarifaSeccionWeb.createMany({
          data: secciones.map((seccion: string) => ({ tarifaId, seccion })),
        })
      }
    }

    const tarifa = await prisma.tarifa.update({
      where: { id: tarifaId },
      data: { ...updateData, updatedById: parseInt(session.user.id) },
    })
    return NextResponse.json(tarifa)
  } catch (error) {
    console.error('Error al actualizar tarifa:', error)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}
