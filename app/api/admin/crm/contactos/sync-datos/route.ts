import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { syncHubspotContactPropertyBatch } from '@/lib/hubspot-listas'

export const maxDuration = 60

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }
  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para importar información de contactos.' }, { status: 403 })
  }

  await prisma.crmSincronizacionHubspot.updateMany({
    where: { estado: 'EN_PROGRESO', bloqueo: 'hubspot-crm-write', iniciadoAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
    data: { estado: 'INTERRUMPIDA', bloqueo: null, finalizadoAt: new Date() },
  })

  let run
  try {
    run = await prisma.crmSincronizacionHubspot.create({
      data: {
        modo: 'CONTACTOS_COMPLETOS',
        estado: 'EN_PROGRESO',
        bloqueo: 'hubspot-crm-write',
        ejecutadoPor: session.user.email || session.user.name || 'Administrador',
      },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') return NextResponse.json({ error: 'Ya hay un lote de contactos en curso.' }, { status: 409 })
    throw error
  }

  try {
    const body = await request.json().catch(() => ({}))
    if (body?.restart === true) {
      await prisma.crmRegistroHubspot.updateMany({
        where: { objectTypeId: '0-1', listas: { some: { activo: true, lista: { activo: true } } } },
        data: { propiedadesCompletasAt: null },
      })
    }
    const result = await syncHubspotContactPropertyBatch(500)
    await prisma.crmSincronizacionHubspot.update({
      where: { id: run.id },
      data: {
        estado: 'COMPLETADA',
        bloqueo: null,
        registrosActualizados: result.processed,
        propiedadesDetectadas: result.definitions,
        finalizadoAt: new Date(),
      },
    })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo completar el lote de contactos.'
    await prisma.crmSincronizacionHubspot.update({
      where: { id: run.id },
      data: { estado: 'ERROR', bloqueo: null, errores: 1, detalle: [{ error: message }], finalizadoAt: new Date() },
    })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
