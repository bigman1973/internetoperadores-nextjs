import { NextResponse } from 'next/server'
import prisma from '../../../../../lib/prisma'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'

export const dynamic = 'force-dynamic'

// PUT - Actualizar usuario admin
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Solo SUPER_ADMIN puede editar usuarios
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Solo el Super Admin puede editar usuarios' }, { status: 403 })
    }

    const { id } = await params
    const userId = parseInt(id)
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { nombre, password, rol, activo } = body

    const updateData: any = {}
    if (nombre !== undefined) updateData.nombre = nombre
    if (rol !== undefined) updateData.rol = rol
    if (activo !== undefined) updateData.activo = activo
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10)
    }

    const usuario = await prisma.usuarioAdmin.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        ultimoAcceso: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ usuario })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    console.error('Error updating usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE - Eliminar usuario admin
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Solo SUPER_ADMIN puede eliminar usuarios
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Solo el Super Admin puede eliminar usuarios' }, { status: 403 })
    }

    const { id } = await params
    const userId = parseInt(id)
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    // No permitir auto-eliminación
    if (session.user.id === userId.toString()) {
      return NextResponse.json({ error: 'No puedes eliminarte a ti mismo' }, { status: 400 })
    }

    await prisma.usuarioAdmin.delete({
      where: { id: userId },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    console.error('Error deleting usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
