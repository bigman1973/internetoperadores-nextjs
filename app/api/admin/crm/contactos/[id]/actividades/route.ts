import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { authOptions } from '@/lib/auth'
import { getDefaultEmailSender, sendCrmEmail } from '@/lib/email'
import { createOutlookUserCalendarEvent } from '@/lib/outlook-calendar'
import { getOutlookConnectionStatus, getOutlookUserAccessToken } from '@/lib/outlook-user-connection'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

const ACTIVITY_TYPES = new Set(['LLAMADA', 'CORREO', 'REUNION', 'NOTA', 'TAREA', 'WHATSAPP', 'LINKEDIN', 'SMS', 'CORREO_POSTAL'])
const DIRECTIONS = new Set(['ENTRANTE', 'SALIENTE'])
const CALL_RESULTS = new Set(['CONTACTADO', 'SIN_RESPUESTA', 'OCUPADO', 'BUZON_DE_VOZ', 'NUMERO_INCORRECTO', 'OTRO'])
const PRIORITIES = new Set(['BAJA', 'MEDIA', 'ALTA'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CORPORATE_DOMAINS = ['internetoperadores.com', 'lfgd.es', 'farmsplanet.es', 'elypseadvisory.com']

type JsonObject = Record<string, Prisma.JsonValue>
type ContactForActivity = {
  id: string
  nombre: string | null
  email: string | null
  propiedades: Prisma.JsonValue | null
  propiedadesLocales: Prisma.JsonValue | null
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

function cleanIds(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length <= 100))].slice(0, maxItems)
}

function cleanEmailList(value: unknown, maxItems: number) {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,]/) : []
  return [...new Set(raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))].slice(0, maxItems)
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, string>
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, field]) => typeof field === 'string' ? [[key, field]] : []))
}

function contactEmail(contact: ContactForActivity) {
  const source = stringRecord(contact.propiedades)
  const local = stringRecord(contact.propiedadesLocales)
  return (local.email || source.email || contact.email || '').trim().toLowerCase()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function textToEmailHtml(text: string, authorName: string) {
  const body = escapeHtml(text).replace(/\r?\n/g, '<br>')
  const author = escapeHtml(authorName)
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.65"><div>${body}</div><div style="margin-top:28px;color:#475569">Un saludo,<br><strong>${author}</strong></div></div>`
}

function textToCalendarHtml(text: string, authorName: string) {
  const body = escapeHtml(text).replace(/\r?\n/g, '<br>')
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.65"><div>${body}</div><div style="margin-top:24px;color:#64748b;font-size:13px">Reunión registrada por ${escapeHtml(authorName)} desde el CRM de Internet Operadores.</div></div>`
}

function defaultTitle(type: string, direction: string | null) {
  const labels: Record<string, string> = {
    LLAMADA: `Llamada ${direction === 'ENTRANTE' ? 'entrante' : 'saliente'}`,
    CORREO: 'Correo electrónico',
    REUNION: 'Reunión',
    NOTA: 'Nota',
    TAREA: 'Tarea',
    WHATSAPP: 'WhatsApp',
    LINKEDIN: 'LinkedIn',
    SMS: 'SMS',
    CORREO_POSTAL: 'Correo postal',
  }
  return labels[type] || 'Actividad'
}

function errorMessage(type: string) {
  if (type === 'CORREO') return 'No se pudo enviar el correo.'
  if (type === 'REUNION') return 'No se pudo programar la reunión.'
  return 'No se pudo registrar la actividad.'
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
  if (contentLength > 150_000) return NextResponse.json({ error: 'La actividad supera el tamaño permitido.' }, { status: 413 })

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })

  const type = typeof body.type === 'string' ? body.type.toUpperCase() : 'LLAMADA'
  const description = cleanText(body.description, 20_000)
  const title = cleanText(body.title, 250)
  const direction = DIRECTIONS.has(body.direction) ? String(body.direction) : null
  const result = cleanText(body.result, 80)
  const clientRequestId = cleanText(body.clientRequestId, 100)
  const activityDate = typeof body.activityDate === 'string' ? new Date(body.activityDate) : new Date()
  const durationMinutes = body.durationMinutes == null || body.durationMinutes === '' ? null : Number(body.durationMinutes)
  const dealIds = cleanIds(body.dealIds, 100)
  const contactIds = [...new Set([id, ...cleanIds(body.contactIds, 49)])]
  const followUp = body.followUp && typeof body.followUp === 'object' && !Array.isArray(body.followUp) ? body.followUp : null
  const location = cleanText(body.location, 500)
  const to = cleanEmailList(body.to, 20)
  const cc = cleanEmailList(body.cc, 20)
  const bcc = cleanEmailList(body.bcc, 20)
  const authorId = Number(session.user.id)
  const authorName = session.user.name || session.user.email || 'Administrador'
  const authorEmail = session.user.email?.trim().toLowerCase() || ''
  const requestedOutlook = type === 'REUNION' && body.syncOutlook === true
  const outlookStatus = requestedOutlook ? await getOutlookConnectionStatus(authorId) : null
  const syncOutlook = Boolean(requestedOutlook && outlookStatus?.enabled && outlookStatus.connected)
  const onlineMeeting = syncOutlook && body.onlineMeeting === true
  const inviteAttendees = syncOutlook && body.inviteAttendees === true
  const preparedExternalChannel = ['WHATSAPP', 'LINKEDIN', 'SMS'].includes(type) && direction === 'SALIENTE' && body.prepareExternalChannel === true

  if (!ACTIVITY_TYPES.has(type)) return NextResponse.json({ error: 'El tipo de actividad no es válido.' }, { status: 400 })
  if (!description) return NextResponse.json({ error: type === 'CORREO' ? 'Escribe el contenido del correo.' : 'Añade una descripción útil de la actividad.' }, { status: 400 })
  if (!clientRequestId || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientRequestId)) return NextResponse.json({ error: 'No se ha podido identificar esta operación. Recarga la ficha.' }, { status: 400 })
  if (Number.isNaN(activityDate.getTime())) return NextResponse.json({ error: 'La fecha de la actividad no es válida.' }, { status: 400 })
  if (!['REUNION', 'TAREA'].includes(type) && activityDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) return NextResponse.json({ error: 'Esta actividad no puede registrarse con una fecha futura.' }, { status: 400 })
  if (durationMinutes != null && (!Number.isInteger(durationMinutes) || durationMinutes < 0 || durationMinutes > 10_080)) return NextResponse.json({ error: 'La duración debe estar entre 0 y 10.080 minutos.' }, { status: 400 })
  if (type === 'LLAMADA' && !direction) return NextResponse.json({ error: 'Selecciona si la llamada fue entrante o saliente.' }, { status: 400 })
  if (type === 'LLAMADA' && (!result || !CALL_RESULTS.has(result))) return NextResponse.json({ error: 'Selecciona el resultado de la llamada.' }, { status: 400 })
  if (['WHATSAPP', 'LINKEDIN', 'SMS', 'CORREO_POSTAL'].includes(type) && !direction) return NextResponse.json({ error: 'Selecciona si la comunicación fue entrante o saliente.' }, { status: 400 })
  if (type === 'CORREO') {
    if (!title) return NextResponse.json({ error: 'Escribe el asunto del correo.' }, { status: 400 })
    if (!to.length) return NextResponse.json({ error: 'Añade al menos un destinatario.' }, { status: 400 })
    if ([...to, ...cc, ...bcc].some((email) => !EMAIL_PATTERN.test(email))) return NextResponse.json({ error: 'Revisa las direcciones de correo.' }, { status: 400 })
  }
  if (type === 'REUNION' && syncOutlook) {
    if (!title) return NextResponse.json({ error: 'Escribe el título de la reunión.' }, { status: 400 })
    if (activityDate.getTime() < Date.now() - 5 * 60 * 1000) return NextResponse.json({ error: 'La reunión de Outlook debe programarse en el futuro.' }, { status: 400 })
    if (!durationMinutes || durationMinutes < 5) return NextResponse.json({ error: 'Indica una duración mínima de 5 minutos.' }, { status: 400 })
  }
  if (requestedOutlook && !outlookStatus?.enabled) return NextResponse.json({ error: 'Outlook individual aún está pendiente de activación en Microsoft 365.' }, { status: 503 })
  if (requestedOutlook && !outlookStatus?.connected) return NextResponse.json({ error: 'Conecta tu cuenta de Outlook antes de crear la reunión en tu agenda.' }, { status: 428 })

  let followUpDate: Date | null = null
  let followUpTitle: string | null = null
  let followUpPriority = 'MEDIA'
  if (followUp) {
    followUpTitle = cleanText(followUp.title, 250) || (type === 'TAREA' ? title : `Seguimiento de ${defaultTitle(type, direction).toLowerCase()}`)
    followUpDate = typeof followUp.dueAt === 'string' ? new Date(followUp.dueAt) : null
    followUpPriority = PRIORITIES.has(followUp.priority) ? String(followUp.priority) : 'MEDIA'
    if (!followUpDate || Number.isNaN(followUpDate.getTime())) return NextResponse.json({ error: 'La fecha límite de la tarea no es válida.' }, { status: 400 })
    if (followUpDate.getTime() < Date.now() - 60 * 60 * 1000) return NextResponse.json({ error: 'La tarea debe vencer en el futuro.' }, { status: 400 })
  }
  if (type === 'TAREA' && !followUpDate) return NextResponse.json({ error: 'Indica la fecha límite de la tarea.' }, { status: 400 })

  const sender = getDefaultEmailSender()
  let calendarAuthorization: Awaited<ReturnType<typeof getOutlookUserAccessToken>> | null = null
  if (syncOutlook) {
    try {
      calendarAuthorization = await getOutlookUserAccessToken(authorId, authorEmail)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Vuelve a conectar tu cuenta de Outlook.' }, { status: 401 })
    }
  }
  const calendarMailbox = calendarAuthorization?.mailbox || ''
  const replyTo = EMAIL_PATTERN.test(authorEmail) && CORPORATE_DOMAINS.some((domain) => authorEmail.endsWith(`@${domain}`)) ? authorEmail : undefined
  if (type === 'CORREO' && (!EMAIL_PATTERN.test(sender) || !CORPORATE_DOMAINS.some((domain) => sender.endsWith(`@${domain}`)))) {
    return NextResponse.json({ error: 'El buzón corporativo de salida no está configurado correctamente.' }, { status: 500 })
  }
  if (syncOutlook && (!EMAIL_PATTERN.test(calendarMailbox) || !CORPORATE_DOMAINS.some((domain) => calendarMailbox.endsWith(`@${domain}`)))) {
    return NextResponse.json({ error: 'La cuenta de Outlook conectada no corresponde a un buzón corporativo válido.' }, { status: 500 })
  }
  const emailFingerprint = type === 'CORREO'
    ? createHash('sha256').update(JSON.stringify({ sender, to, cc, bcc, title, description })).digest('hex')
    : null
  const calendarFingerprint = syncOutlook
    ? createHash('sha256').update(JSON.stringify({ calendarMailbox, title, activityDate: activityDate.toISOString(), durationMinutes, location, contactIds, onlineMeeting, inviteAttendees })).digest('hex')
    : null

  try {
    const setup = await prisma.$transaction(async (tx) => {
      const existing = await tx.crmActividad.findUnique({
        where: { clientRequestId },
        select: { id: true, tipo: true, resultado: true, creadoPorId: true, metadatos: true, createdAt: true },
      })
      if (existing) {
        if (existing.creadoPorId !== authorId) return { kind: 'forbidden-existing' as const }
        return { kind: 'existing' as const, activity: existing }
      }

      if (emailFingerprint) {
        const unresolvedDuplicate = await tx.crmActividad.findFirst({
          where: {
            contactoId: id,
            tipo: 'CORREO',
            resultado: { in: ['ENVIO_PENDIENTE', 'ENVIO_INCIERTO'] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            metadatos: { path: ['huellaOperacion'], equals: emailFingerprint },
          },
          select: { id: true },
        })
        if (unresolvedDuplicate) return { kind: 'unresolved-duplicate' as const }
      }

      if (calendarFingerprint) {
        const unresolvedCalendar = await tx.crmActividad.findFirst({
          where: {
            contactoId: id,
            tipo: 'REUNION',
            resultado: { in: ['CALENDARIO_PENDIENTE', 'CALENDARIO_INCIERTO'] },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            metadatos: { path: ['huellaCalendario'], equals: calendarFingerprint },
          },
          select: { id: true },
        })
        if (unresolvedCalendar) return { kind: 'unresolved-calendar' as const }
      }

      const contacts = await tx.crmRegistroHubspot.findMany({
        where: { id: { in: contactIds }, objectTypeId: '0-1' },
        select: { id: true, nombre: true, email: true, propiedades: true, propiedadesLocales: true },
      })
      if (!contacts.some((contact) => contact.id === id)) return { kind: 'missing' as const }
      if (contacts.length !== contactIds.length) return { kind: 'invalid-contacts' as const }

      const associatedDeals = dealIds.length ? await tx.crmNegocioHubspot.findMany({
        where: { hubspotId: { in: dealIds }, activo: true, contactos: { some: { contactoId: id } } },
        select: { hubspotId: true },
      }) : []
      if (associatedDeals.length !== dealIds.length) return { kind: 'invalid-deals' as const }

      const metadata: JsonObject = {}
      if (location) metadata.ubicacion = location
      if (type === 'CORREO') {
        metadata.remitente = sender
        metadata.para = to
        if (cc.length) metadata.cc = cc
        if (bcc.length) metadata.cantidadCco = bcc.length
        metadata.huellaOperacion = emailFingerprint
        metadata.guardadoEnEnviados = false
      }
      if (syncOutlook) {
        metadata.buzonCalendario = calendarMailbox
        metadata.organizadorUsuarioId = authorId
        metadata.huellaCalendario = calendarFingerprint
        metadata.estadoCalendario = 'PENDIENTE'
        metadata.reunionTeams = onlineMeeting
      }
      if (preparedExternalChannel) {
        metadata.modoAsistido = true
        metadata.canalPreparado = type
      }

      const activity = await tx.crmActividad.create({
        data: {
          contactoId: id,
          tipo: type,
          titulo: title || defaultTitle(type, direction),
          descripcion: description,
          metadatos: Object.keys(metadata).length ? metadata : undefined,
          fechaActividad: type === 'CORREO' ? new Date() : activityDate,
          direccion: type === 'CORREO' ? 'SALIENTE' : direction,
          resultado: type === 'CORREO' ? 'ENVIO_PENDIENTE' : syncOutlook ? 'CALENDARIO_PENDIENTE' : preparedExternalChannel ? 'CANAL_PREPARADO' : result || (type === 'TAREA' ? 'PENDIENTE' : 'REGISTRADA'),
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
              titulo: followUpTitle || defaultTitle(type, direction),
              descripcion: type === 'TAREA' ? description : `Seguimiento de la actividad “${title || defaultTitle(type, direction)}”.`,
              venceAt: followUpDate,
              estado: 'PENDIENTE',
              prioridad: followUpPriority,
              asignadoAId: authorId,
              asignadoANombre: authorName,
              creadoPorId: authorId,
              creadoPorNombre: authorName,
            },
          } : undefined,
        },
        select: { id: true, tipo: true, resultado: true, creadoPorId: true, metadatos: true, createdAt: true },
      })
      return { kind: 'created' as const, activity, contacts }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (setup.kind === 'missing') return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 })
    if (setup.kind === 'invalid-contacts') return NextResponse.json({ error: 'Uno de los contactos asociados ya no está disponible.' }, { status: 400 })
    if (setup.kind === 'invalid-deals') return NextResponse.json({ error: 'Uno de los negocios seleccionados no pertenece a este contacto.' }, { status: 400 })
    if (setup.kind === 'forbidden-existing') return NextResponse.json({ error: 'Esta operación ya pertenece a otro usuario.' }, { status: 409 })
    if (setup.kind === 'unresolved-duplicate') return NextResponse.json({ error: 'Ya existe un intento idéntico pendiente de revisión. Comprueba Elementos enviados antes de crear otro correo.' }, { status: 409 })
    if (setup.kind === 'unresolved-calendar') return NextResponse.json({ error: 'Ya existe una reunión idéntica pendiente de revisión en Outlook.' }, { status: 409 })

    const activity = setup.activity
    if (syncOutlook) {
      if (activity.tipo !== 'REUNION') return NextResponse.json({ error: 'El identificador de operación ya está en uso.' }, { status: 409 })
      const previousMetadata = stringRecord(activity.metadatos)
      if (activity.resultado === 'CALENDARIO_CREADO') {
        return NextResponse.json({ success: true, activityId: activity.id, unchanged: true, linkedToOutlook: Boolean(previousMetadata.outlookWebLink) })
      }
      if (activity.resultado === 'CALENDARIO_INCIERTO') {
        return NextResponse.json({ error: 'No se pudo confirmar si Outlook creó la reunión. Revisa tu calendario antes de repetirla.' }, { status: 409 })
      }
      if (setup.kind === 'existing' && activity.resultado === 'CALENDARIO_PENDIENTE') {
        if (activity.createdAt.getTime() < Date.now() - 2 * 60 * 1000) {
          await prisma.crmActividad.updateMany({
            where: { id: activity.id, resultado: 'CALENDARIO_PENDIENTE', creadoPorId: authorId },
            data: { resultado: 'CALENDARIO_INCIERTO' },
          })
          return NextResponse.json({ error: 'La creación anterior no terminó de confirmarse. Revisa tu calendario antes de repetirla.' }, { status: 409 })
        }
        return NextResponse.json({ error: 'Esta reunión ya se está procesando en Outlook.' }, { status: 409 })
      }
      if (setup.kind === 'existing' && activity.resultado === 'ERROR_CALENDARIO') {
        const claimed = await prisma.crmActividad.updateMany({
          where: { id: activity.id, resultado: 'ERROR_CALENDARIO', creadoPorId: authorId },
          data: { resultado: 'CALENDARIO_PENDIENTE' },
        })
        if (claimed.count !== 1) return NextResponse.json({ error: 'Esta reunión ya se está procesando en Outlook.' }, { status: 409 })
      }

      const meetingContacts = setup.kind === 'created' ? setup.contacts : await prisma.crmRegistroHubspot.findMany({
        where: { id: { in: contactIds }, objectTypeId: '0-1' },
        select: { id: true, nombre: true, email: true, propiedades: true, propiedadesLocales: true },
      })
      const attendees = inviteAttendees ? meetingContacts.flatMap((contact) => {
        const email = contactEmail(contact)
        return EMAIL_PATTERN.test(email) ? [{ email, name: contact.nombre }] : []
      }) : []
      const eventResult = await createOutlookUserCalendarEvent({
        accessToken: calendarAuthorization!.accessToken,
        mailbox: calendarMailbox,
        operationId: clientRequestId,
        subject: title!,
        html: textToCalendarHtml(description, authorName),
        start: activityDate,
        end: new Date(activityDate.getTime() + durationMinutes! * 60_000),
        location,
        attendees,
        onlineMeeting,
      })

      if (!eventResult.success) {
        const uncertain = Boolean(eventResult.uncertain)
        await prisma.crmActividad.update({
          where: { id: activity.id },
          data: {
            resultado: uncertain ? 'CALENDARIO_INCIERTO' : 'ERROR_CALENDARIO',
            metadatos: {
              buzonCalendario: calendarMailbox,
              organizadorUsuarioId: authorId,
              huellaCalendario: calendarFingerprint,
              estadoCalendario: uncertain ? 'INCIERTO' : 'RECHAZADO',
              codigoGraph: eventResult.status,
              reunionTeams: onlineMeeting,
              asistentes: attendees.map((attendee) => attendee.email),
              ...(location ? { ubicacion: location } : {}),
            },
          },
        })
        return NextResponse.json({
          error: uncertain
            ? 'No se pudo confirmar si Outlook creó la reunión. Revisa tu calendario antes de repetirla.'
            : 'Microsoft 365 ha rechazado la creación de la reunión. Vuelve a conectar tu cuenta de Outlook.',
          retryable: !uncertain,
        }, { status: uncertain ? 502 : 422 })
      }

      const createdMetadata = {
        buzonCalendario: eventResult.mailbox,
        organizadorUsuarioId: authorId,
        huellaCalendario: calendarFingerprint,
        estadoCalendario: 'CREADO',
        codigoGraph: eventResult.status,
        outlookEventId: eventResult.event!.id,
        ...(eventResult.event!.iCalUId ? { outlookICalUId: eventResult.event!.iCalUId } : {}),
        ...(eventResult.event!.webLink ? { outlookWebLink: eventResult.event!.webLink } : {}),
        ...(eventResult.event!.joinUrl ? { teamsJoinUrl: eventResult.event!.joinUrl } : {}),
        reunionTeams: onlineMeeting,
        asistentes: attendees.map((attendee) => attendee.email),
        ...(location ? { ubicacion: location } : {}),
      }
      try {
        await prisma.crmActividad.update({
          where: { id: activity.id },
          data: { resultado: 'CALENDARIO_CREADO', metadatos: createdMetadata },
        })
      } catch (persistenceError) {
        console.error('Outlook creó la reunión pero no se pudo confirmar inicialmente en CRM:', persistenceError)
        await prisma.crmActividad.updateMany({
          where: { id: activity.id, resultado: 'CALENDARIO_PENDIENTE', creadoPorId: authorId },
          data: { resultado: 'CALENDARIO_INCIERTO', metadatos: { ...createdMetadata, estadoCalendario: 'INCIERTO_TRAS_CREACION' } },
        }).catch((recoveryError) => console.error('No se pudo marcar la reunión como incierta:', recoveryError))
        return NextResponse.json({ error: 'Outlook ha podido crear la reunión, pero el CRM no ha confirmado el registro. Revisa el calendario antes de repetirla.' }, { status: 502 })
      }
      return NextResponse.json({ success: true, activityId: activity.id, linkedToOutlook: true, teamsMeeting: Boolean(eventResult.event!.joinUrl) })
    }

    if (type !== 'CORREO') {
      return NextResponse.json({ success: true, activityId: activity.id, unchanged: setup.kind === 'existing' })
    }

    if (activity.tipo !== 'CORREO') return NextResponse.json({ error: 'El identificador de operación ya está en uso.' }, { status: 409 })
    if (activity.resultado === 'ACEPTADO_GRAPH' || activity.resultado === 'ENVIADO') return NextResponse.json({ success: true, activityId: activity.id, unchanged: true, sentFrom: sender })
    if (activity.resultado === 'ENVIO_INCIERTO') return NextResponse.json({ error: 'Microsoft aceptó la conexión pero no confirmó el resultado. Revisa Elementos enviados antes de reintentar para evitar duplicados.' }, { status: 409 })
    if (setup.kind === 'existing' && activity.resultado === 'ENVIO_PENDIENTE') return NextResponse.json({ error: 'Este correo ya se está procesando. Revisa la cronología antes de volver a intentarlo.' }, { status: 409 })

    if (setup.kind === 'existing' && activity.resultado === 'ERROR_ENVIO') {
      const claimed = await prisma.crmActividad.updateMany({
        where: { id: activity.id, resultado: 'ERROR_ENVIO', creadoPorId: authorId },
        data: { resultado: 'ENVIO_PENDIENTE' },
      })
      if (claimed.count !== 1) return NextResponse.json({ error: 'Este correo ya se está procesando. Revisa la cronología antes de volver a intentarlo.' }, { status: 409 })
    }

    const emailResult = await sendCrmEmail({
      from: sender,
      replyTo,
      to,
      cc,
      bcc,
      subject: title!,
      html: textToEmailHtml(description, authorName),
    })

    if (!emailResult.success) {
      const uncertain = Boolean(emailResult.uncertain)
      await prisma.crmActividad.update({
        where: { id: activity.id },
        data: {
          resultado: uncertain ? 'ENVIO_INCIERTO' : 'ERROR_ENVIO',
          metadatos: {
            remitente: sender,
            para: to,
            ...(cc.length ? { cc } : {}),
            ...(bcc.length ? { cantidadCco: bcc.length } : {}),
            huellaOperacion: emailFingerprint,
            guardadoEnEnviados: false,
            estadoGraph: uncertain ? 'INCIERTO' : 'RECHAZADO',
            codigoGraph: emailResult.status,
          },
        },
      })
      return NextResponse.json({
        error: uncertain
          ? 'No se ha podido confirmar el resultado. Revisa Elementos enviados antes de repetirlo.'
          : 'Microsoft 365 ha rechazado el envío. Puedes corregirlo y volver a intentarlo.',
        retryable: !uncertain,
      }, { status: uncertain ? 502 : 422 })
    }

    await prisma.crmActividad.update({
      where: { id: activity.id },
      data: {
        resultado: 'ACEPTADO_GRAPH',
        fechaActividad: new Date(),
        metadatos: {
          remitente: emailResult.sender,
          para: to,
          ...(cc.length ? { cc } : {}),
          ...(bcc.length ? { cantidadCco: bcc.length } : {}),
          huellaOperacion: emailFingerprint,
          guardadoEnEnviados: 'SOLICITADO',
          estadoGraph: 'ACEPTADO',
          codigoGraph: emailResult.status,
        },
      },
    })
    return NextResponse.json({ success: true, activityId: activity.id, sentFrom: emailResult.sender, acceptedByMicrosoft: true })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const existing = await prisma.crmActividad.findUnique({ where: { clientRequestId }, select: { id: true, tipo: true, resultado: true, creadoPorId: true } })
      const completedEmail = type === 'CORREO' && (existing?.resultado === 'ACEPTADO_GRAPH' || existing?.resultado === 'ENVIADO')
      const completedCalendar = syncOutlook && existing?.resultado === 'CALENDARIO_CREADO'
      const completedLocalActivity = type !== 'CORREO' && !syncOutlook
      if (existing?.creadoPorId === authorId && existing.tipo === type && (completedEmail || completedCalendar || completedLocalActivity)) {
        return NextResponse.json({ success: true, activityId: existing.id, unchanged: true })
      }
    }
    console.error('Error registrando actividad CRM:', error)
    return NextResponse.json({ error: errorMessage(type) }, { status: 500 })
  }
}
