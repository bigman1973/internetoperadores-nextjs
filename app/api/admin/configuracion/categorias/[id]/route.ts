export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../../lib/auth'
import prisma from '../../../../../../lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)
    const body = await request.json()

    const categoria = await prisma.categoriaTarifa.update({
      where: { id },
      data: {
        ...(body.nombre && { nombre: body.nombre.toUpperCase() }),
        ...(body.descripcion !== undefined && { descripcion: body.descripcion }),
        ...(body.color && { color: body.color }),
        ...(body.orden !== undefined && { orden: body.orden }),
        ...(body.activa !== undefined && { activa: body.activa }),
      },
      include: { subcategorias: { orderBy: { orden: 'asc' } } },
    })

    return NextResponse.json(categoria)
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Ya existe una categoría con ese nombre' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)

    // Verificar si hay tarifas usando esta categoría
    const categoria = await prisma.categoriaTarifa.findUnique({ where: { id } })
    if (!categoria) {
      return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    }

    const tarifasCount = await prisma.tarifa.count({
      where: { categoria: categoria.nombre }
    })

    if (tarifasCount > 0) {
      return NextResponse.json(
        { error: `No se puede eliminar: hay ${tarifasCount} tarifas usando esta categoría` },
        { status: 409 }
      )
    }

    await prisma.categoriaTarifa.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
