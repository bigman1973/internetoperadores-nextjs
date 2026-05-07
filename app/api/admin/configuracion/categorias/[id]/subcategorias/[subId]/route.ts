export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../../../../lib/auth'
import prisma from '../../../../../../../../lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resolvedParams = await params
    const subId = parseInt(resolvedParams.subId)
    const body = await request.json()

    const subcategoria = await prisma.subcategoriaTarifa.update({
      where: { id: subId },
      data: {
        ...(body.nombre && { nombre: body.nombre }),
        ...(body.descripcion !== undefined && { descripcion: body.descripcion }),
        ...(body.orden !== undefined && { orden: body.orden }),
        ...(body.activa !== undefined && { activa: body.activa }),
      },
    })

    return NextResponse.json(subcategoria)
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una subcategoría con ese nombre en esta categoría' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resolvedParams = await params
    const subId = parseInt(resolvedParams.subId)

    // Verificar si hay tarifas usando esta subcategoría
    const subcategoria = await prisma.subcategoriaTarifa.findUnique({
      where: { id: subId },
      include: { categoria: true }
    })

    if (!subcategoria) {
      return NextResponse.json({ error: 'Subcategoría no encontrada' }, { status: 404 })
    }

    const tarifasCount = await prisma.tarifa.count({
      where: {
        categoria: subcategoria.categoria.nombre,
        subcategoria: subcategoria.nombre,
      }
    })

    if (tarifasCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: hay ${tarifasCount} tarifas usando esta subcategoría` },
        { status: 409 }
      )
    }

    await prisma.subcategoriaTarifa.delete({ where: { id: subId } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
