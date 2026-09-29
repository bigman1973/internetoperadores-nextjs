import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

const STATES = new Set(['PENDIENTE', 'COMPLETADA'])

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para actualizar tareas CRM.' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const state = body && typeof body === 'object' && !Array.isArray(body) && typeof body.state === 'string' ? body.state : ''
  const expectedState = body && typeof body === 'object' && !Array.isArray(body) && typeof body.expectedState === 'string' ? body.expectedState : ''
  if (!STATES.has(state)) return NextResponse.json({ error: 'Estado de tarea no válido.' }, { status: 400 })
  if (!STATES.has(expectedState) || expectedState === state) return NextResponse.json({ error: 'La transición de la tarea no es válida.' }, { status: 400 })

  const updated = await prisma.crmTarea.updateMany({
    where: { id, estado: expectedState },
    data: { estado: state, completadoAt: state === 'COMPLETADA' ? new Date() : null },
  })
  if (updated.count !== 1) {
    const exists = await prisma.crmTarea.findUnique({ where: { id }, select: { estado: true } })
    if (!exists) return NextResponse.json({ error: 'Tarea no encontrada.' }, { status: 404 })
    return NextResponse.json({ error: 'La tarea ha cambiado desde que abriste la ficha. Actualiza la página antes de continuar.', state: exists.estado }, { status: 409 })
  }
  return NextResponse.json({ success: true, state })
}
