import { NextResponse } from 'next/server'
import { prisma } from '../../../../../../lib/prisma'

// PATCH: Actualizar una estrategia
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { estrategia, autor } = body

    const actualizada = await prisma.estrategiaProducto.update({
      where: { id: parseInt(id) },
      data: {
        ...(estrategia !== undefined && { estrategia }),
        ...(autor !== undefined && { autor }),
      },
    })

    return NextResponse.json(actualizada)
  } catch (error) {
    console.error('Error al actualizar estrategia:', error)
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }
}

// DELETE: Eliminar una estrategia
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.estrategiaProducto.delete({
      where: { id: parseInt(id) },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error al eliminar estrategia:', error)
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  }
}
