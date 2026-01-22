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
      where: { id: tarifaId }
    })
    if (!tarifa) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
    return NextResponse.json(tarifa)
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
    const tarifa = await prisma.tarifa.update({
      where: { id: tarifaId },
      data: { ...body, updatedById: parseInt(session.user.id) },
    })
    return NextResponse.json(tarifa)
  } catch (error) {
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}
