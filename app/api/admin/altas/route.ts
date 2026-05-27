import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const altas = await prisma.altaServicio.findMany({
      include: {
        documentos: {
          select: { id: true, validado: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = altas.map(alta => ({
      id: alta.id,
      tipoCliente: alta.tipoCliente,
      nombre: alta.nombre,
      apellidos: alta.apellidos,
      razonSocial: alta.razonSocial,
      email: alta.email,
      telefono: alta.telefono,
      tarifaNombre: alta.tarifaNombre,
      importeCuota: alta.importeCuota,
      metodoPago: alta.metodoPago,
      estado: alta.estado,
      esPortabilidad: alta.esPortabilidad,
      createdAt: alta.createdAt,
      documentosCount: alta.documentos.length,
      documentosValidados: alta.documentos.filter(d => d.validado).length,
    }))

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error listando altas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
