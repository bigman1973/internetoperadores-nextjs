import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '../../../../../lib/middleware/auth'
import { prisma } from '../../../../../lib/prisma'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth('admin')
    
    const { id: idStr } = await params
    const id = parseInt(idStr)
    const body = await request.json()
    const { titulo, descripcion, tipo, estado, autor, fecha } = body

    const setClauses: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (titulo !== undefined) { setClauses.push(`titulo = $${paramIndex++}`); values.push(titulo) }
    if (descripcion !== undefined) { setClauses.push(`descripcion = $${paramIndex++}`); values.push(descripcion) }
    if (tipo !== undefined) { setClauses.push(`tipo = $${paramIndex++}`); values.push(tipo) }
    if (estado !== undefined) { setClauses.push(`estado = $${paramIndex++}`); values.push(estado) }
    if (autor !== undefined) { setClauses.push(`autor = $${paramIndex++}`); values.push(autor) }
    if (fecha !== undefined) { setClauses.push(`fecha = $${paramIndex++}`); values.push(new Date(fecha)) }
    
    setClauses.push(`updated_at = $${paramIndex++}`)
    values.push(new Date())
    values.push(id)

    const result = await prisma.$queryRawUnsafe(`
      UPDATE desarrollo_historial
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, ...values)

    if (!(result as any[]).length) {
      return NextResponse.json({ error: 'Registro no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ registro: (result as any[])[0] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth('admin')
    
    const { id: idStr } = await params
    const id = parseInt(idStr)
    
    await prisma.$queryRawUnsafe(`DELETE FROM desarrollo_historial WHERE id = $1`, id)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
