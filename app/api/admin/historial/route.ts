import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../../../../lib/middleware/auth'
import { prisma } from '../../../../lib/prisma'

export async function GET(request: NextRequest) {
  try {
    await requireAuth('admin')
    
    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') || ''
    const estado = searchParams.get('estado') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '500')
    const skip = (page - 1) * limit

    const where: any = {}
    if (tipo) where.tipo = tipo
    if (estado) where.estado = estado

    const [registros, total] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT * FROM desarrollo_historial
        ${tipo ? `WHERE tipo = '${tipo}'` : ''}
        ${estado ? `${tipo ? 'AND' : 'WHERE'} estado = '${estado}'` : ''}
        ORDER BY fecha DESC
        LIMIT ${limit} OFFSET ${skip}
      `),
      prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count FROM desarrollo_historial
        ${tipo ? `WHERE tipo = '${tipo}'` : ''}
        ${estado ? `${tipo ? 'AND' : 'WHERE'} estado = '${estado}'` : ''}
      `)
    ])

    return NextResponse.json({
      registros,
      total: (total as any[])[0]?.count || 0,
      page,
      limit
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth('admin')
    
    const body = await request.json()
    const { titulo, descripcion, tipo, estado, autor, fecha } = body

    if (!titulo) {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 })
    }

    const result = await prisma.$queryRawUnsafe(`
      INSERT INTO desarrollo_historial (titulo, descripcion, tipo, estado, autor, fecha)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, titulo, descripcion || '', tipo || 'publica', estado || 'completado', autor || 'Manus AI', fecha ? new Date(fecha) : new Date())

    return NextResponse.json({ registro: (result as any[])[0] }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
