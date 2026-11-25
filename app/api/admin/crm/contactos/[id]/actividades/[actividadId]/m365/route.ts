import { getServerSession } from 'next-auth'
import { bloqueoActuacion, m365Habilitado } from '@/lib/area1-m365'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { getOutlookUserAccessToken } from '@/lib/outlook-user-connection'
import { leerEventoOutlook, leerHiloCorreo } from '@/lib/area1-m365-graph'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; actividadId: string }> }

async function cargar(ctx: Ctx, necesitaEscritura: boolean) {
  if (!m365Habilitado()) return { error: NextResponse.json({ error: 'Microsoft 365 en la ficha no está disponible.' }, { status: 404 }) }
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 401 }) }
  const actuacion = bloqueoActuacion(session)
  if (actuacion) return { error: NextResponse.json({ error: actuacion }, { status: 403 }) }
  const userId = Number(session.user.id)
  const permission = await verificarPermisoServer(userId, 'admin.crm.contactos', session.user.role)
  if (necesitaEscritura ? !permission.escritura : !permission.lectura) return { error: NextResponse.json({ error: 'Sin permiso.' }, { status: 403 }) }
  const { id, actividadId } = await ctx.params
  const actividad = await prisma.crmActividad.findFirst({
    where: { id: actividadId, OR: [{ contactoId: id }, { contactos: { some: { contactoId: id } } }] },
    select: { id: true, tipo: true, creadoPorId: true, metadatos: true, titulo: true, fechaActividad: true, duracionSegundos: true, resultado: true },
  })
  if (!actividad) return { error: NextResponse.json({ error: 'Actividad no encontrada.' }, { status: 404 }) }
  const meta = (actividad.metadatos && typeof actividad.metadatos === 'object' && !Array.isArray(actividad.metadatos) ? actividad.metadatos : {}) as Record<string, Prisma.JsonValue>
  // Solo quien la creó: se consulta SU buzón con SU permiso delegado.
  if (actividad.creadoPorId !== userId) return { error: NextResponse.json({ error: 'Solo quien la creó puede consultarla en su Outlook.' }, { status: 403 }) }
  return { userId, email: (session.user.email || '').trim().toLowerCase(), actividad, meta }
}

/** GET: respuestas del hilo de un correo enviado desde el buzón del usuario. Solo lectura. */
export async function GET(_request: Request, ctx: Ctx) {
  const r = await cargar(ctx, false)
  if ('error' in r) return r.error
  if (r.actividad.tipo !== 'CORREO' || typeof r.meta.outlookConversationId !== 'string') {
    return NextResponse.json({ error: 'Este correo no se envió desde tu Outlook; no hay hilo que consultar.' }, { status: 400 })
  }
  let token
  try { token = await getOutlookUserAccessToken(r.userId, r.email, 'correo') } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vuelve a conectar Outlook.' }, { status: 401 })
  }
  const hilo = await leerHiloCorreo(token.accessToken, r.meta.outlookConversationId, token.mailbox)
  if (!hilo.ok) return NextResponse.json({ error: 'Microsoft 365 no ha devuelto el hilo.', codigoGraph: hilo.status }, { status: 502 })
  return NextResponse.json({ mensajes: hilo.mensajes.length, respuestas: hilo.mensajes.filter((m) => !m.esPropio) }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST: relee la reunión en Outlook y actualiza la ficha (fecha, título, cancelación, respuestas). No escribe en Outlook. */
export async function POST(_request: Request, ctx: Ctx) {
  const r = await cargar(ctx, true)
  if ('error' in r) return r.error
  if (r.actividad.tipo !== 'REUNION' || typeof r.meta.outlookEventId !== 'string') {
    return NextResponse.json({ error: 'Esta reunión no está enlazada con Outlook.' }, { status: 400 })
  }
  let token
  try { token = await getOutlookUserAccessToken(r.userId, r.email, 'calendario') } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vuelve a conectar Outlook.' }, { status: 401 })
  }
  const lectura = await leerEventoOutlook(token.accessToken, r.meta.outlookEventId)
  if (!lectura.ok || !lectura.evento) return NextResponse.json({ error: 'Microsoft 365 no ha devuelto la reunión.', codigoGraph: lectura.status }, { status: 502 })
  const ev = lectura.evento
  const cambios: string[] = []
  const data: Prisma.CrmActividadUpdateInput = {}
  const meta: Record<string, Prisma.JsonValue> = { ...r.meta, sincronizadoOutlookAt: new Date().toISOString() }

  if (!ev.existe || ev.cancelado) {
    if (r.actividad.resultado !== 'CALENDARIO_CANCELADO') { data.resultado = 'CALENDARIO_CANCELADO'; cambios.push(ev.existe ? 'cancelada en Outlook' : 'eliminada de Outlook') }
    meta.estadoCalendario = ev.existe ? 'CANCELADO' : 'ELIMINADO'
  } else {
    if (ev.inicio && new Date(ev.inicio).getTime() !== r.actividad.fechaActividad.getTime()) { data.fechaActividad = new Date(ev.inicio); cambios.push('fecha') }
    if (ev.inicio && ev.fin) {
      const dur = Math.max(0, Math.round((new Date(ev.fin).getTime() - new Date(ev.inicio).getTime()) / 1000))
      if (dur !== r.actividad.duracionSegundos) { data.duracionSegundos = dur; cambios.push('duración') }
    }
    if (ev.asunto && ev.asunto !== r.actividad.titulo) { data.titulo = ev.asunto.slice(0, 250); cambios.push('título') }
    if (ev.ubicacion && ev.ubicacion !== r.meta.ubicacion) { meta.ubicacion = ev.ubicacion; cambios.push('ubicación') }
    if (ev.teamsJoinUrl && ev.teamsJoinUrl !== r.meta.teamsJoinUrl) { meta.teamsJoinUrl = ev.teamsJoinUrl; cambios.push('enlace de Teams') }
    if (ev.webLink) meta.outlookWebLink = ev.webLink
    meta.respuestasInvitados = ev.respuestas
    meta.estadoCalendario = 'CREADO'
    if (r.actividad.resultado === 'CALENDARIO_CANCELADO') { data.resultado = 'CALENDARIO_CREADO'; cambios.push('reactivada') }
  }
  data.metadatos = meta
  await prisma.crmActividad.update({ where: { id: r.actividad.id }, data })
  return NextResponse.json({ ok: true, cambios, cancelada: !ev.existe || ev.cancelado, respuestas: ev.respuestas.length })
}
