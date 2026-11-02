import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { vincularLeadExistente } from '@/lib/crm-captacion-web'

export async function POST(_request: Request, context: { params: Promise<{ tipo: string; id: string }> }) {
  const session = await getServerSession(authOptions)
  const userId = Number(session?.user.id)
  if (!session || session.user.userType !== 'admin' || !session.user.id || !Number.isInteger(userId)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const { tipo: requestedType, id } = await context.params
  const tipo = requestedType.toUpperCase()
  if ((tipo !== 'MIGRACION' && tipo !== 'SOLUCION' && tipo !== 'PARTNER') || !id) {
    return NextResponse.json({ error: 'Tipo de lead no válido.' }, { status: 400 })
  }

  const sourceArea = tipo === 'PARTNER' ? 'admin.crm.partners' : 'admin.leads'
  const [sourcePermission, contactPermission] = await Promise.all([
    verificarPermisoServer(userId, sourceArea, session.user.role),
    verificarPermisoServer(userId, 'admin.crm.contactos', session.user.role),
  ])
  if (!sourcePermission.lectura || !sourcePermission.escritura || !contactPermission.lectura || !contactPermission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para vincular este lead a una ficha CRM.' }, { status: 403 })
  }

  try {
    const select = { id: true, crmContactoId: true } as const
    const lead = tipo === 'MIGRACION'
      ? await prisma.leadMigracionWeb.findUnique({ where: { id }, select })
      : tipo === 'SOLUCION'
        ? await prisma.leadSolucion.findUnique({ where: { id }, select })
        : await prisma.leadPartner.findUnique({ where: { id }, select })
    if (!lead) return NextResponse.json({ error: 'Lead no encontrado.' }, { status: 404 })

    // No deduplicar por correo ni transformar el histórico desde una lectura.
    // El helper conserva los valores originales y resuelve la vinculación idempotente.
    const contactoId = lead.crmContactoId || (await vincularLeadExistente(tipo, id)).contactoId
    return NextResponse.json({ success: true, contactoId })
  } catch (error) {
    console.error('[CRM lead bridge] No se pudo vincular el lead:', error)
    return NextResponse.json({ error: 'No se pudo crear o vincular la ficha CRM. Inténtalo de nuevo.' }, { status: 500 })
  }
}
