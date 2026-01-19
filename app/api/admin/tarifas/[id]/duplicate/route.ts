import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const tarifaId = parseInt(params.id)

    // Obtener tarifa original
    const tarifaOriginal = await prisma.tarifa.findUnique({
      where: { id: tarifaId },
    })

    if (!tarifaOriginal) {
      return NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 404 })
    }

    // Crear copia
    const { id, createdAt, updatedAt, ...dataTarifa } = tarifaOriginal

    const nuevaTarifa = await prisma.tarifa.create({
      data: {
        ...dataTarifa,
        nombre: `${dataTarifa.nombre} (Copia)`,
        activa: false, // Las copias empiezan inactivas
        destacada: false,
        createdById: parseInt(session.user.id),
        updatedById: parseInt(session.user.id),
      },
    })

    // Registrar en historial
    await prisma.historialCambio.create({
      data: {
        tarifaId: nuevaTarifa.id,
        usuarioId: parseInt(session.user.id),
        accion: 'CREAR',
        cambios: { duplicadaDe: tarifaId },
      },
    })

    return NextResponse.json(nuevaTarifa)
  } catch (error) {
    console.error('Error al duplicar tarifa:', error)
    return NextResponse.json(
      { error: 'Error al duplicar tarifa' },
      { status: 500 }
    )
  }
}
