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
        { error: 'No tienes permisos para eliminar tarifas' },
        { status: 403 }
      )
    }

    const resolvedParams = await params
    const tarifaId = parseInt(resolvedParams.id)

    // TODO: Implementar verificación de servicios contratados cuando se cree el modelo
    // const serviciosCount = await prisma.servicioContratado.count({
    //   where: { tarifaId },
    // })
    // if (serviciosCount > 0) {
    //   return NextResponse.json(
    //     { error: 'No se puede eliminar una tarifa con servicios contratados' },
    //     { status: 400 }
    //   )
    // }

    // Registrar en historial antes de eliminar
    await prisma.historialCambio.create({
      data: {
        tarifaId,
        usuarioId: parseInt(session.user.id),
        accion: 'ELIMINAR',
      },
    })

    // Eliminar tarifa
    await prisma.tarifa.delete({
      where: { id: tarifaId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error al eliminar tarifa:', error)
    return NextResponse.json(
      { error: 'Error al eliminar tarifa' },
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
    const tarifaId = parseInt(resolvedParams.id)

    const tarifa = await prisma.tarifa.findUnique({
      where: { id: tarifaId },
      include: {
        createdBy: {
          select: {
            nombre: true,
            email: true,
          },
        },
        updatedBy: {
          select: {
            nombre: true,
            email: true,
          },
        },
      },
    })

    if (!tarifa) {
      return NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 404 })
    }

    return NextResponse.json(tarifa)
  } catch (error) {
    console.error('Error al obtener tarifa:', error)
    return NextResponse.json(
      { error: 'Error al obtener tarifa' },
      { status: 500 }
    )
  }
}
