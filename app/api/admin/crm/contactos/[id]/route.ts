import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

const SEGMENTS = new Set(['PARTICULAR', 'EMPRESA', 'PARTNER'])

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para editar este contacto.' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => ({}))
  const segmentoCrm = body.segmentoCrm || null
  if (segmentoCrm && !SEGMENTS.has(segmentoCrm)) {
    return NextResponse.json({ error: 'El área CRM no es válida.' }, { status: 400 })
  }

  const current = await prisma.crmRegistroHubspot.findUnique({ where: { id }, select: { clienteWebId: true, segmentoCrm: true } })
  if (!current) return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 })
  if (current.clienteWebId) {
    return NextResponse.json({ error: 'Este contacto ya es cliente y hereda el segmento de su ficha de cliente.' }, { status: 409 })
  }
  if (current.segmentoCrm === segmentoCrm) {
    return NextResponse.json({ success: true, unchanged: true })
  }

  const contact = await prisma.crmRegistroHubspot.update({
    where: { id },
    data: {
      segmentoCrm,
      segmentoCrmActualizadoAt: new Date(),
      segmentoCrmActualizadoPor: session.user.email || session.user.name || 'Administrador',
    },
    select: { id: true, segmentoCrm: true, segmentoCrmActualizadoAt: true, segmentoCrmActualizadoPor: true },
  })

  return NextResponse.json({ success: true, contact })
}
