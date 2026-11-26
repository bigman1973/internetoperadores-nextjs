/**
 * Área 1 · Llamadas a Microsoft Graph con el token DELEGADO del usuario (/me/...).
 * No decide el aislamiento: quien llama debe pasar los destinatarios ya filtrados por aislarCorreo().
 */
const GRAPH = 'https://graph.microsoft.com/v1.0'

type FetchLike = typeof fetch

export type CorreoUsuario = {
  accessToken: string
  subject: string
  html: string
  to: string[]
  cc?: string[]
  bcc?: string[]
}

export type CorreoUsuarioResultado = {
  success: boolean
  status: number | null
  error?: string
  uncertain?: boolean
  messageId?: string | null
  conversationId?: string | null
  internetMessageId?: string | null
  webLink?: string | null
}

const destinos = (list: string[] | undefined) => (list || []).map((address) => ({ emailAddress: { address } }))

async function graphError(response: Response) {
  const text = await response.text().catch(() => '')
  try { return JSON.parse(text)?.error?.message || `Graph ${response.status}` } catch { return text.slice(0, 300) || `Graph ${response.status}` }
}

/**
 * Crea el mensaje en Borradores del usuario y lo envía. Al enviarlo, Outlook lo guarda en Enviados.
 * Así obtenemos conversationId para mostrar las respuestas en la ficha.
 */
export async function enviarCorreoComoUsuario(input: CorreoUsuario, fetchImpl: FetchLike = fetch): Promise<CorreoUsuarioResultado> {
  if (!input.to.length) return { success: false, status: null, error: 'Sin destinatarios.' }
  let draftCreated = false
  try {
    const draft = await fetchImpl(`${GRAPH}/me/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.subject,
        body: { contentType: 'HTML', content: input.html },
        toRecipients: destinos(input.to),
        ccRecipients: destinos(input.cc),
        bccRecipients: destinos(input.bcc),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (draft.status !== 201) {
      return { success: false, status: draft.status, error: await graphError(draft), uncertain: draft.status >= 500 || draft.status === 429 }
    }
    draftCreated = true
    const created = await draft.json() as { id?: string; conversationId?: string; internetMessageId?: string; webLink?: string }
    if (!created.id) return { success: false, status: draft.status, error: 'Graph no devolvió el borrador.', uncertain: false }

    const sent = await fetchImpl(`${GRAPH}/me/messages/${encodeURIComponent(created.id)}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Length': '0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    const base = { messageId: created.id, conversationId: created.conversationId || null, internetMessageId: created.internetMessageId || null, webLink: created.webLink || null }
    if (sent.status === 202) return { success: true, status: 202, ...base }
    return { ...base, success: false, status: sent.status, error: await graphError(sent), uncertain: sent.status >= 500 || sent.status === 429 || sent.status === 408 }
  } catch (error) {
    // Si el borrador existía y falló el envío por red, no sabemos si salió: incierto.
    return { success: false, status: null, error: error instanceof Error ? error.message : 'Error de red con Microsoft 365.', uncertain: draftCreated }
  }
}

export type RespuestaCorreo = {
  id: string
  recibido: string | null
  de: string | null
  deNombre: string | null
  asunto: string | null
  extracto: string | null
  webLink: string | null
  esPropio: boolean
}

/** Solo lectura: mensajes del mismo hilo en el buzón del usuario. */
export async function leerHiloCorreo(accessToken: string, conversationId: string, buzonPropio: string, fetchImpl: FetchLike = fetch): Promise<{ ok: boolean; status: number; mensajes: RespuestaCorreo[]; error?: string }> {
  const url = new URL(`${GRAPH}/me/messages`)
  url.searchParams.set('$filter', `conversationId eq '${conversationId.replace(/'/g, "''")}'`)
  url.searchParams.set('$select', 'id,receivedDateTime,from,subject,bodyPreview,webLink,isDraft')
  url.searchParams.set('$top', '25')
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) return { ok: false, status: response.status, mensajes: [], error: await graphError(response) }
  const data = await response.json() as { value?: Array<{ id: string; receivedDateTime?: string; from?: { emailAddress?: { address?: string; name?: string } }; subject?: string; bodyPreview?: string; webLink?: string; isDraft?: boolean }> }
  const propio = buzonPropio.trim().toLowerCase()
  const mensajes = (data.value || [])
    .filter((m) => !m.isDraft)
    .map((m) => {
      const de = m.from?.emailAddress?.address?.toLowerCase() || null
      return {
        id: m.id,
        recibido: m.receivedDateTime || null,
        de,
        deNombre: m.from?.emailAddress?.name || null,
        asunto: m.subject || null,
        extracto: (m.bodyPreview || '').slice(0, 400) || null,
        webLink: m.webLink || null,
        esPropio: de === propio,
      }
    })
    .sort((a, b) => String(a.recibido).localeCompare(String(b.recibido)))
  return { ok: true, status: response.status, mensajes }
}

/** Correo recibido en el buzón del usuario (solo lectura; no se guarda en el panel). */
export type CorreoRecibido = {
  id: string
  recibido: string | null
  de: string | null
  deNombre: string | null
  asunto: string | null
  extracto: string | null
  webLink: string | null
}
const EMAIL_RE = /^[^\s@'"<>(),;:]+@[a-z0-9.-]+\.[a-z]{2,}$/i
/** Direcciones de las personas de la ficha: válidas, sin repetir, sin el dominio propio y como mucho `max`. */
export function direccionesRecibidos(emails: Array<string | null | undefined>, dominiosPropios: Iterable<string> = ['internetoperadores.com'], max = 20): string[] {
  const propios = new Set([...dominiosPropios].map((d) => d.toLowerCase()))
  const out: string[] = []
  for (const raw of emails) {
    const e = String(raw || '').trim().toLowerCase()
    if (!EMAIL_RE.test(e) || propios.has(e.split('@')[1]) || out.includes(e)) continue
    out.push(e)
    if (out.length >= max) break
  }
  return out
}
/** $filter de Graph: recibidos desde `desde` y enviados por alguna de las direcciones (ya validadas). */
export function filtroRecibidos(direcciones: string[], desde: Date): string {
  const de = direcciones.map((d) => `from/emailAddress/address eq '${d.replace(/'/g, "''")}'`).join(' or ')
  return `receivedDateTime ge ${desde.toISOString()} and (${de})`
}
/**
 * Solo lectura (GET /me/messages): correos que las direcciones dadas han enviado al usuario.
 * No marca como leído, no mueve ni guarda nada. Si Graph rechaza el orden en servidor, se reintenta sin $orderby y se ordena aquí.
 */
export async function leerCorreosRecibidos(accessToken: string, direcciones: string[], opciones: { desde: Date; top?: number }, fetchImpl: FetchLike = fetch): Promise<{ ok: boolean; status: number; correos: CorreoRecibido[]; error?: string }> {
  if (!direcciones.length) return { ok: true, status: 200, correos: [] }
  const top = Math.min(Math.max(opciones.top || 25, 1), 50)
  const pedir = async (ordenar: boolean) => {
    const url = new URL(`${GRAPH}/me/messages`)
    url.searchParams.set('$filter', filtroRecibidos(direcciones, opciones.desde))
    url.searchParams.set('$select', 'id,receivedDateTime,from,subject,bodyPreview,webLink,isDraft')
    url.searchParams.set('$top', String(top))
    if (ordenar) url.searchParams.set('$orderby', 'receivedDateTime desc')
    return fetchImpl(url.toString(), { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  }
  let response = await pedir(true)
  if (response.status === 400) response = await pedir(false)
  if (!response.ok) return { ok: false, status: response.status, correos: [], error: await graphError(response) }
  const data = await response.json() as { value?: Array<{ id: string; receivedDateTime?: string; from?: { emailAddress?: { address?: string; name?: string } }; subject?: string; bodyPreview?: string; webLink?: string; isDraft?: boolean }> }
  const permitidas = new Set(direcciones)
  const correos = (data.value || [])
    .filter((m) => !m.isDraft && permitidas.has(String(m.from?.emailAddress?.address || '').toLowerCase()))
    .map((m) => ({
      id: m.id,
      recibido: m.receivedDateTime || null,
      de: m.from?.emailAddress?.address?.toLowerCase() || null,
      deNombre: m.from?.emailAddress?.name || null,
      asunto: m.subject || null,
      extracto: (m.bodyPreview || '').slice(0, 300) || null,
      webLink: m.webLink || null,
    }))
    .sort((a, b) => String(b.recibido).localeCompare(String(a.recibido)))
    .slice(0, top)
  return { ok: true, status: response.status, correos }
}
export type EventoOutlook = {
  existe: boolean
  cancelado: boolean
  asunto: string | null
  inicio: string | null
  fin: string | null
  ubicacion: string | null
  teamsJoinUrl: string | null
  webLink: string | null
  respuestas: Array<{ email: string; respuesta: string }>
}

/** Solo lectura: estado actual del evento en la agenda del usuario (cambios hechos en Outlook). */
export async function leerEventoOutlook(accessToken: string, eventId: string, fetchImpl: FetchLike = fetch): Promise<{ ok: boolean; status: number; evento?: EventoOutlook; error?: string }> {
  const url = new URL(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`)
  url.searchParams.set('$select', 'subject,start,end,isCancelled,location,onlineMeeting,webLink,attendees')
  const response = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) {
    return { ok: true, status: 404, evento: { existe: false, cancelado: true, asunto: null, inicio: null, fin: null, ubicacion: null, teamsJoinUrl: null, webLink: null, respuestas: [] } }
  }
  if (!response.ok) return { ok: false, status: response.status, error: await graphError(response) }
  const e = await response.json() as {
    subject?: string; isCancelled?: boolean; webLink?: string
    start?: { dateTime?: string }; end?: { dateTime?: string }
    location?: { displayName?: string }; onlineMeeting?: { joinUrl?: string } | null
    attendees?: Array<{ emailAddress?: { address?: string }; status?: { response?: string } }>
  }
  const utc = (v?: string) => (v ? (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? new Date(v) : new Date(`${v}Z`)).toISOString() : null)
  return {
    ok: true,
    status: response.status,
    evento: {
      existe: true,
      cancelado: Boolean(e.isCancelled),
      asunto: e.subject || null,
      inicio: utc(e.start?.dateTime),
      fin: utc(e.end?.dateTime),
      ubicacion: e.location?.displayName || null,
      teamsJoinUrl: e.onlineMeeting?.joinUrl || null,
      webLink: e.webLink || null,
      respuestas: (e.attendees || []).flatMap((a) => a.emailAddress?.address ? [{ email: a.emailAddress.address.toLowerCase(), respuesta: a.status?.response || 'none' }] : []),
    },
  }
}

/** Agenda del usuario (solo lectura): GET /me/calendarView entre dos instantes. Nunca escribe ni envía. */
export type EventoAgenda = {
  id: string
  asunto: string
  inicio: string | null
  fin: string | null
  todoElDia: boolean
  teamsJoinUrl: string | null
  webLink: string | null
  asistentes: string[]
  organizador: string | null
}
export async function leerAgendaOutlook(accessToken: string, desde: Date, hasta: Date, fetchImpl: FetchLike = fetch): Promise<{ ok: boolean; status: number; eventos: EventoAgenda[]; error?: string }> {
  const url = new URL(`${GRAPH}/me/calendarView`)
  url.searchParams.set('startDateTime', desde.toISOString())
  url.searchParams.set('endDateTime', hasta.toISOString())
  url.searchParams.set('$select', 'id,subject,start,end,isAllDay,isCancelled,onlineMeeting,webLink,attendees,organizer')
  url.searchParams.set('$orderby', 'start/dateTime')
  url.searchParams.set('$top', '50')
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) return { ok: false, status: response.status, eventos: [], error: await graphError(response) }
  const data = await response.json() as { value?: Array<{
    id?: string; subject?: string; isAllDay?: boolean; isCancelled?: boolean; webLink?: string
    start?: { dateTime?: string }; end?: { dateTime?: string }; onlineMeeting?: { joinUrl?: string } | null
    attendees?: Array<{ emailAddress?: { address?: string } }>; organizer?: { emailAddress?: { address?: string } }
  }> }
  const utc = (v?: string) => (v ? (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? new Date(v) : new Date(`${v}Z`)).toISOString() : null)
  const eventos = (data.value || []).filter((e) => e.id && !e.isCancelled).map((e) => ({
    id: e.id as string,
    asunto: (e.subject || '').trim() || '(sin asunto)',
    inicio: utc(e.start?.dateTime),
    fin: utc(e.end?.dateTime),
    todoElDia: Boolean(e.isAllDay),
    teamsJoinUrl: e.onlineMeeting?.joinUrl || null,
    webLink: e.webLink || null,
    asistentes: [...new Set((e.attendees || []).flatMap((a) => a.emailAddress?.address ? [a.emailAddress.address.trim().toLowerCase()] : []))],
    organizador: e.organizer?.emailAddress?.address?.trim().toLowerCase() || null,
  }))
  return { ok: true, status: response.status, eventos }
}
