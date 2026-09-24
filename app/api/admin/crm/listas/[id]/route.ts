import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

const SEGMENTS = new Set(['PARTICULAR', 'EMPRESA', 'PARTNER'])
const PURPOSES = new Set(['SIN_CLASIFICAR', 'COMERCIAL', 'CAPTACION', 'NEWSLETTER', 'PARTNERS', 'SUPRESION', 'OPERATIVA'])

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.listas', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para editar esta lista.' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const segmentoCrm = body.segmentoCrm || null
  const proposito = String(body.proposito || 'SIN_CLASIFICAR')
  const notasInternas = typeof body.notasInternas === 'string' ? body.notasInternas.trim() || null : null

  if (segmentoCrm && !SEGMENTS.has(segmentoCrm)) {
    return NextResponse.json({ error: 'Segmento CRM no válido.' }, { status: 400 })
  }
  if (!PURPOSES.has(proposito)) {
    return NextResponse.json({ error: 'Propósito de lista no válido.' }, { status: 400 })
  }

  try {
    const list = await prisma.crmLista.update({
      where: { id },
      data: { segmentoCrm, proposito, notasInternas },
      select: { id: true, segmentoCrm: true, proposito: true, notasInternas: true, updatedAt: true },
    })
    return NextResponse.json({ success: true, list })
  } catch (error) {
    console.error('[CRM-LISTAS] Error actualizando clasificación:', error)
    return NextResponse.json({ error: 'No se pudo guardar la clasificación.' }, { status: 500 })
  }
}
