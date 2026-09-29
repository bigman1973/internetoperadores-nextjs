import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { authOptions } from '@/lib/auth'
import { getDefaultEmailSender, sendCrmEmail } from '@/lib/email'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

const ACTIVITY_TYPES = new Set(['LLAMADA', 'CORREO', 'REUNION', 'NOTA', 'TAREA', 'WHATSAPP', 'LINKEDIN', 'SMS', 'CORREO_POSTAL'])
const DIRECTIONS = new Set(['ENTRANTE', 'SALIENTE'])
const CALL_RESULTS = new Set(['CONTACTADO', 'SIN_RESPUESTA', 'OCUPADO', 'BUZON_DE_VOZ', 'NUMERO_INCORRECTO', 'OTRO'])
const PRIORITIES = new Set(['BAJA', 'MEDIA', 'ALTA'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CORPORATE_DOMAINS = ['internetoperadores.com', 'lfgd.es', 'farmsplanet.es', 'elypseadvisory.com']

type JsonObject = Record<string, Prisma.JsonValue>

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
  return type === 'CORREO' ? 'No se pudo enviar el correo.' : 'No se pudo registrar la actividad.'
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

  const authorId = Number(session.user.id)
  const authorName = session.user.name || session.user.email || 'Administrador'
  const sender = getDefaultEmailSender()
  const authorEmail = session.user.email?.trim().toLowerCase() || ''
  const replyTo = EMAIL_PATTERN.test(authorEmail) && CORPORATE_DOMAINS.some((domain) => authorEmail.endsWith(`@${domain}`)) ? authorEmail : undefined
  if (type === 'CORREO' && (!EMAIL_PATTERN.test(sender) || !CORPORATE_DOMAINS.some((domain) => sender.endsWith(`@${domain}`)))) {
    return NextResponse.json({ error: 'El buzón corporativo de salida no está configurado correctamente.' }, { status: 500 })
  }
  const emailFingerprint = type === 'CORREO'
    ? createHash('sha256').update(JSON.stringify({ sender, to, cc, bcc, title, description })).digest('hex')
    : null

  try {
    const setup = await prisma.$transaction(async (tx) => {
      const existing = await tx.crmActividad.findUnique({
        where: { clientRequestId },
        select: { id: true, tipo: true, resultado: true, creadoPorId: true },
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

      const contacts = await tx.crmRegistroHubspot.findMany({
        where: { id: { in: contactIds }, objectTypeId: '0-1' },
        select: { id: true },
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

      const activity = await tx.crmActividad.create({
        data: {
          contactoId: id,
          tipo: type,
          titulo: title || defaultTitle(type, direction),
          descripcion: description,
          metadatos: Object.keys(metadata).length ? metadata : undefined,
          fechaActividad: type === 'CORREO' ? new Date() : activityDate,
          direccion: type === 'CORREO' ? 'SALIENTE' : direction,
          resultado: type === 'CORREO' ? 'ENVIO_PENDIENTE' : result || (type === 'TAREA' ? 'PENDIENTE' : 'REGISTRADA'),
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
        select: { id: true, tipo: true, resultado: true, creadoPorId: true },
      })
      return { kind: 'created' as const, activity }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (setup.kind === 'missing') return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 })
    if (setup.kind === 'invalid-contacts') return NextResponse.json({ error: 'Uno de los contactos asociados ya no está disponible.' }, { status: 400 })
    if (setup.kind === 'invalid-deals') return NextResponse.json({ error: 'Uno de los negocios seleccionados no pertenece a este contacto.' }, { status: 400 })
    if (setup.kind === 'forbidden-existing') return NextResponse.json({ error: 'Esta operación ya pertenece a otro usuario.' }, { status: 409 })
    if (setup.kind === 'unresolved-duplicate') return NextResponse.json({ error: 'Ya existe un intento idéntico pendiente de revisión. Comprueba Elementos enviados antes de crear otro correo.' }, { status: 409 })

    const activity = setup.activity
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
      if (existing?.creadoPorId === authorId && existing.tipo === type && (type !== 'CORREO' || existing.resultado === 'ACEPTADO_GRAPH' || existing.resultado === 'ENVIADO')) {
        return NextResponse.json({ success: true, activityId: existing.id, unchanged: true })
      }
    }
    console.error('Error registrando actividad CRM:', error)
    return NextResponse.json({ error: errorMessage(type) }, { status: 500 })
  }
}
