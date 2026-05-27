import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const altas = await prisma.altaServicio.findMany({
      where: { email: session.user.email },
      include: {
        documentos: {
          select: {
            tipo: true,
            validado: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = altas.map(alta => ({
      id: alta.id,
      tarifaNombre: alta.tarifaNombre || 'Servicio',
      estado: alta.estado,
      createdAt: alta.createdAt.toISOString(),
      token: alta.token,
      importeCuota: Number(alta.importeCuota || 0),
      documentos: alta.documentos,
      contratoFirmado: alta.contratoFirmado,
    }))

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error obteniendo altas del cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
