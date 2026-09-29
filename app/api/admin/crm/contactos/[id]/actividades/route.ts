import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

const DIRECTIONS = new Set(['ENTRANTE', 'SALIENTE'])
const RESULTS = new Set(['CONTACTADO', 'SIN_RESPUESTA', 'OCUPADO', 'BUZON_DE_VOZ', 'NUMERO_INCORRECTO', 'OTRO'])

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para registrar actividad en este contacto.' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 100_000) return NextResponse.json({ error: 'La actividad supera el tamaño permitido.' }, { status: 413 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })

  const description = cleanText(body.description, 20_000)
  const title = cleanText(body.title, 250)
  const direction = typeof body.direction === 'string' ? body.direction : ''
  const result = typeof body.result === 'string' ? body.result : ''
  const clientRequestId = cleanText(body.clientRequestId, 100)
  const activityDate = typeof body.activityDate === 'string' ? new Date(body.activityDate) : null
  const durationMinutes = body.durationMinutes == null || body.durationMinutes === '' ? null : Number(body.durationMinutes)
  const rawDealIds: unknown[] = Array.isArray(body.dealIds) ? body.dealIds : []
  const dealIds: string[] = [...new Set(rawDealIds.filter((value): value is string => typeof value === 'string' && value.length <= 100))].slice(0, 100)
  const rawContactIds: unknown[] = Array.isArray(body.contactIds) ? body.contactIds : []
  const contactIds: string[] = [...new Set([id, ...rawContactIds.filter((value): value is string => typeof value === 'string' && value.length <= 100)])].slice(0, 50)
  const followUp = body.followUp && typeof body.followUp === 'object' && !Array.isArray(body.followUp) ? body.followUp : null

  if (!description) return NextResponse.json({ error: 'Explica brevemente qué se ha hablado en la llamada.' }, { status: 400 })
  if (!DIRECTIONS.has(direction)) return NextResponse.json({ error: 'Selecciona si la llamada fue entrante o saliente.' }, { status: 400 })
  if (!RESULTS.has(result)) return NextResponse.json({ error: 'Selecciona el resultado de la llamada.' }, { status: 400 })
  if (!activityDate || Number.isNaN(activityDate.getTime())) return NextResponse.json({ error: 'La fecha de la llamada no es válida.' }, { status: 400 })
  if (activityDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'La llamada no puede registrarse con una fecha futura.' }, { status: 400 })
  if (durationMinutes != null && (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 1440)) return NextResponse.json({ error: 'La duración debe estar entre 0 y 1.440 minutos.' }, { status: 400 })
  if (!clientRequestId || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientRequestId)) return NextResponse.json({ error: 'No se ha podido identificar esta operación. Recarga la ficha.' }, { status: 400 })

  let followUpDate: Date | null = null
  let followUpTitle: string | null = null
  if (followUp) {
    followUpTitle = cleanText(followUp.title, 250) || 'Seguimiento de llamada'
    followUpDate = typeof followUp.dueAt === 'string' ? new Date(followUp.dueAt) : null
    if (!followUpDate || Number.isNaN(followUpDate.getTime())) return NextResponse.json({ error: 'La fecha de seguimiento no es válida.' }, { status: 400 })
    if (followUpDate.getTime() < Date.now() - 60 * 60 * 1000) return NextResponse.json({ error: 'La tarea de seguimiento debe vencer en el futuro.' }, { status: 400 })
  }

  const authorId = Number(session.user.id)
  const authorName = session.user.name || session.user.email || 'Administrador'

  try {
    const resultData = await prisma.$transaction(async (tx) => {
      const contacts = await tx.crmRegistroHubspot.findMany({ where: { id: { in: contactIds }, objectTypeId: '0-1' }, select: { id: true } })
      if (!contacts.some((contact) => contact.id === id)) return { kind: 'missing' as const }
      if (contacts.length !== contactIds.length) return { kind: 'invalid-contacts' as const }

      const associatedDeals = dealIds.length ? await tx.crmNegocioHubspot.findMany({
        where: { hubspotId: { in: dealIds }, activo: true, contactos: { some: { contactoId: id } } },
        select: { hubspotId: true },
      }) : []
      if (associatedDeals.length !== dealIds.length) return { kind: 'invalid-deals' as const }

      const existing = await tx.crmActividad.findUnique({ where: { clientRequestId }, select: { id: true } })
      if (existing) return { kind: 'existing' as const, id: existing.id }

      const activity = await tx.crmActividad.create({
        data: {
          contactoId: id,
          tipo: 'LLAMADA',
          titulo: title || `Llamada ${direction === 'ENTRANTE' ? 'entrante' : 'saliente'}`,
          descripcion: description,
          fechaActividad: activityDate,
          direccion: direction,
          resultado: result,
          duracionSegundos: durationMinutes == null ? null : durationMinutes * 60,
          origen: 'LOCAL',
          clientRequestId,
          creadoPorId: authorId,
          creadoPorNombre: authorName,
          contactos: { create: contacts.map((contact) => ({ contactoId: contact.id })) },
          negocios: associatedDeals.length ? { create: associatedDeals.map((deal) => ({ negocioHubspotId: deal.hubspotId })) } : undefined,
          tareaSeguimiento: followUpDate ? {
            create: {
              contactoId: id,
              titulo: followUpTitle || 'Seguimiento de llamada',
              descripcion: `Seguimiento de la llamada registrada el ${activityDate.toLocaleString('es-ES')}.`,
              venceAt: followUpDate,
              estado: 'PENDIENTE',
              prioridad: 'MEDIA',
              asignadoAId: authorId,
              asignadoANombre: authorName,
              creadoPorId: authorId,
              creadoPorNombre: authorName,
            },
          } : undefined,
        },
        select: { id: true },
      })
      return { kind: 'created' as const, id: activity.id }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

    if (resultData.kind === 'missing') return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 })
    if (resultData.kind === 'invalid-contacts') return NextResponse.json({ error: 'Uno de los contactos asociados ya no está disponible.' }, { status: 400 })
    if (resultData.kind === 'invalid-deals') return NextResponse.json({ error: 'Uno de los negocios seleccionados no pertenece a este contacto.' }, { status: 400 })
    return NextResponse.json({ success: true, activityId: resultData.id, unchanged: resultData.kind === 'existing' })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const existing = await prisma.crmActividad.findUnique({ where: { clientRequestId }, select: { id: true } })
      if (existing) return NextResponse.json({ success: true, activityId: existing.id, unchanged: true })
    }
    console.error('Error registrando actividad CRM:', error)
    return NextResponse.json({ error: 'No se pudo registrar la llamada. Inténtalo de nuevo.' }, { status: 500 })
  }
}
