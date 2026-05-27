import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params

    const alta = await prisma.altaServicio.findUnique({
      where: { id },
      include: {
        documentos: {
          orderBy: { createdAt: 'desc' },
        },
        enviosContrato: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 })
    }

    return NextResponse.json(alta)
  } catch (error: any) {
    console.error('Error obteniendo alta:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH: Editar datos del alta
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    // Campos editables
    const allowedFields = [
      'nombre', 'apellidos', 'dni', 'razonSocial', 'cif',
      'nombreApoderado', 'dniApoderado', 'email', 'telefono',
      'direccionFacturacion', 'localidadFacturacion', 'provinciaFacturacion', 'cpFacturacion',
      'direccionInstalacion', 'localidadInstalacion', 'provinciaInstalacion', 'cpInstalacion',
      'iban', 'observaciones', 'tarifaNombre'
    ]

    const updateData: any = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
    }

    const alta = await prisma.altaServicio.update({
      where: { id },
      data: updateData,
      include: {
        documentos: {
          orderBy: { createdAt: 'desc' },
        },
        enviosContrato: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    return NextResponse.json(alta)
  } catch (error: any) {
    console.error('Error actualizando alta:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
