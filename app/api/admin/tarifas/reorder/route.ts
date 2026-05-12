import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import { prisma } from '../../../../../lib/prisma'

// PUT /api/admin/tarifas/reorder
// Body: { items: [{ id: number, orden: number }] }
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Se requiere un array de items con id y orden' }, { status: 400 })
    }

    // Validate all items have id and orden
    for (const item of items) {
      if (typeof item.id !== 'number' || typeof item.orden !== 'number') {
        return NextResponse.json({ error: 'Cada item debe tener id (number) y orden (number)' }, { status: 400 })
      }
    }

    // Update all in a transaction
    await prisma.$transaction(
      items.map((item: { id: number; orden: number }) =>
        prisma.tarifa.update({
          where: { id: item.id },
          data: { orden: item.orden },
        })
      )
    )

    return NextResponse.json({ success: true, updated: items.length })
  } catch (error) {
    console.error('Error reordering tarifas:', error)
    return NextResponse.json({ error: 'Error al reordenar tarifas' }, { status: 500 })
  }
}
