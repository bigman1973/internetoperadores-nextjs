export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Verificar permisos (solo Super Admin y Gerente pueden eliminar)
    if (!['SUPER_ADMIN', 'GERENTE'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'No tienes permisos para eliminar clientes' },
        { status: 403 }
      )
    }

    const resolvedParams = await params
    const clienteId = parseInt(resolvedParams.id)

    // Eliminar notificaciones asociadas primero
    await prisma.notificacionCliente.deleteMany({
      where: { clienteId },
    })

    // Eliminar cliente
    await prisma.clienteWeb.delete({
      where: { id: clienteId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al eliminar cliente:', error)
    return NextResponse.json(
      { error: 'Error al eliminar cliente' },
      { status: 500 }
    )
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
    const clienteId = parseInt(resolvedParams.id)

    const cliente = await prisma.clienteWeb.findUnique({
      where: { id: clienteId },
      include: {
        notificaciones: {
          orderBy: { fechaEnvio: 'desc' },
          take: 10,
        },
      },
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    return NextResponse.json(cliente)
  } catch (error) {
    console.error('Error al obtener cliente:', error)
    return NextResponse.json(
      { error: 'Error al obtener cliente' },
      { status: 500 }
    )
  }
}
