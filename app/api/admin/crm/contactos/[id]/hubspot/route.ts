import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { syncHubspotContactProperties } from '@/lib/hubspot-listas'

export const maxDuration = 60

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para actualizar este contacto.' }, { status: 403 })
  }

  const { id } = await context.params
  const contact = await prisma.crmRegistroHubspot.findFirst({
    where: { id, objectTypeId: '0-1' },
    select: { hubspotId: true },
  })
  if (!contact) return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 })

  await prisma.crmSincronizacionHubspot.updateMany({
    where: { estado: 'EN_PROGRESO', bloqueo: 'hubspot-crm-write', iniciadoAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
    data: { estado: 'INTERRUMPIDA', bloqueo: null, finalizadoAt: new Date() },
  })

  let run
  try {
    run = await prisma.crmSincronizacionHubspot.create({
      data: {
        modo: 'CONTACTO_INDIVIDUAL',
        estado: 'EN_PROGRESO',
        bloqueo: 'hubspot-crm-write',
        ejecutadoPor: session.user.email || session.user.name || 'Administrador',
      },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') return NextResponse.json({ error: 'Hay otra actualización de HubSpot en curso. Espera a que termine.' }, { status: 409 })
    throw error
  }

  try {
    const result = await syncHubspotContactProperties(contact.hubspotId)
    await prisma.crmSincronizacionHubspot.update({
      where: { id: run.id },
      data: { estado: 'COMPLETADA', bloqueo: null, registrosActualizados: 1, propiedadesDetectadas: result.definitions, finalizadoAt: new Date() },
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar la ficha desde HubSpot.'
    await prisma.crmSincronizacionHubspot.update({
      where: { id: run.id },
      data: { estado: 'ERROR', bloqueo: null, errores: 1, detalle: [{ error: message }], finalizadoAt: new Date() },
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
