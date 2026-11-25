/**
 * Área 1 · «Mi día» del Resumen del CRM con la agenda de Outlook del usuario conectado.
 * Misma conexión DELEGADA de la ficha (lib/outlook-user-connection). SOLO LECTURA: GET /me/calendarView.
 * Nunca escribe en Outlook ni envía nada. No se usa en «Ver como» ni mientras se actúa como otra persona:
 * cada uno solo ve su propio calendario.
 */
import prisma from '@/lib/prisma'
import { getOutlookConnectionStatus, getOutlookUserAccessToken } from '@/lib/outlook-user-connection'
import { leerAgendaOutlook, type EventoAgenda } from '@/lib/area1-m365-graph'
import { inicioDiaMadrid } from '@/lib/area1-crm-resumen'
export { grupoTarea } from '@/lib/area1-crm-resumen'

export type FichaEnlazada = { tipo: 'contacto' | 'empresa'; id: string; nombre: string; href: string }
export type ReunionAgenda = {
  id: string
  dia: 'HOY' | 'MANANA'
  hora: string
  asunto: string
  teamsJoinUrl: string | null
  webLink: string | null
  fichas: FichaEnlazada[]
}
export type AgendaOutlook =
  | { estado: 'ok'; correo: string; reuniones: ReunionAgenda[] }
  | { estado: 'desactivado' | 'sin_conexion' | 'sin_permiso' | 'no_disponible' | 'error'; motivo: string }

/** Dominios que no identifican a una empresa (correo personal o el nuestro). */
export const DOMINIOS_GENERICOS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.com.es', 'msn.com',
  'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'aol.com', 'gmx.com', 'gmx.es', 'protonmail.com', 'proton.me', 'telefonica.net', 'movistar.es',
])
export const DOMINIOS_PROPIOS = new Set(['internetoperadores.com'])
export const dominioDe = (email: string) => (email.split('@')[1] || '').trim().toLowerCase()

/** Lógica pura: une cada evento con las fichas cuyos emails (contacto) o dominio (empresa) coinciden. */
export function cruzarAgenda(
  eventos: EventoAgenda[],
  propio: string,
  contactos: Array<{ id: string; email: string | null; nombre: string | null; empresa: string | null }>,
  empresas: Array<{ id: string; nombre: string; dominio: string | null }>,
  manana0: Date,
): ReunionAgenda[] {
  const yo = propio.trim().toLowerCase()
  const porEmail = new Map<string, (typeof contactos)[number]>()
  for (const c of contactos) if (c.email) porEmail.set(c.email.trim().toLowerCase(), c)
  const porDominio = new Map<string, (typeof empresas)[number]>()
  for (const e of empresas) {
    const d = (e.dominio || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
    if (d && !DOMINIOS_GENERICOS.has(d) && !DOMINIOS_PROPIOS.has(d) && !porDominio.has(d)) porDominio.set(d, e)
  }
  return eventos.filter((e) => e.inicio).map((e) => {
    const inicio = new Date(e.inicio as string)
    const externos = [...new Set([...e.asistentes, ...(e.organizador ? [e.organizador] : [])])].filter((m) => m && m !== yo)
    const fichas: FichaEnlazada[] = []
    const vistos = new Set<string>()
    for (const m of externos) {
      const c = porEmail.get(m)
      if (c && !vistos.has(`c:${c.id}`)) { vistos.add(`c:${c.id}`); fichas.push({ tipo: 'contacto', id: c.id, nombre: c.nombre || c.empresa || m, href: `/admin/crm/contactos/${c.id}` }); continue }
      const d = dominioDe(m)
      const emp = porDominio.get(d)
      if (emp && !vistos.has(`e:${emp.id}`)) { vistos.add(`e:${emp.id}`); fichas.push({ tipo: 'empresa', id: emp.id, nombre: emp.nombre, href: `/admin/crm/empresas/${emp.id}` }) }
    }
    return {
      id: e.id,
      dia: inicio.getTime() >= manana0.getTime() ? 'MANANA' as const : 'HOY' as const,
      hora: e.todoElDia ? 'Todo el día' : inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }),
      asunto: e.asunto.slice(0, 140),
      teamsJoinUrl: e.teamsJoinUrl,
      webLink: e.webLink,
      fichas: fichas.slice(0, 4),
    }
  })
}

/** Lee la agenda de hoy y mañana del usuario conectado. Solo lectura. */
export async function cargarAgendaOutlook(input: { userId: number; email: string; bloqueada: string | null }, ahora = new Date()): Promise<AgendaOutlook> {
  if (input.bloqueada) return { estado: 'no_disponible', motivo: input.bloqueada }
  const estado = await getOutlookConnectionStatus(input.userId).catch(() => null)
  if (!estado || !estado.enabled) return { estado: 'desactivado', motivo: 'La conexión con Outlook no está activa en este entorno.' }
  if (!estado.connected) return { estado: 'sin_conexion', motivo: 'Conecta tu Outlook para ver aquí tus reuniones de hoy y mañana.' }
  let token: Awaited<ReturnType<typeof getOutlookUserAccessToken>>
  try {
    token = await getOutlookUserAccessToken(input.userId, input.email, 'calendario')
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    return /permiso|scope/i.test(msg)
      ? { estado: 'sin_permiso', motivo: 'Tu conexión de Outlook no incluye el calendario: vuelve a conectarla.' }
      : { estado: 'sin_conexion', motivo: 'Tu conexión de Outlook ha caducado: vuelve a conectarla.' }
  }
  const hoy0 = inicioDiaMadrid(ahora)
  const manana0 = inicioDiaMadrid(new Date(hoy0.getTime() + 36 * 3600000))
  const pasado0 = inicioDiaMadrid(new Date(manana0.getTime() + 36 * 3600000))
  const r = await leerAgendaOutlook(token.accessToken, hoy0, pasado0).catch(() => null)
  if (!r || !r.ok) return { estado: 'error', motivo: 'No se ha podido leer tu calendario de Outlook ahora. Inténtalo más tarde.' }
  const emails: string[] = [...new Set<string>(r.eventos.flatMap((e) => [...e.asistentes, ...(e.organizador ? [e.organizador] : [])]))].filter((m) => m && m !== input.email.toLowerCase()).slice(0, 300)
  const dominios = [...new Set(emails.map(dominioDe))].filter((d) => d && !DOMINIOS_GENERICOS.has(d) && !DOMINIOS_PROPIOS.has(d)).slice(0, 100)
  const [contactos, empresas] = await Promise.all([
    emails.length
      ? prisma.crmRegistroHubspot.findMany({ where: { objectTypeId: '0-1', email: { in: emails, mode: 'insensitive' } }, select: { id: true, email: true, nombre: true, empresa: true }, take: 300 })
      : Promise.resolve([]),
    dominios.length
      ? prisma.crmEmpresa.findMany({ where: { activo: true, dominio: { in: dominios, mode: 'insensitive' } }, select: { id: true, nombre: true, dominio: true }, take: 100 })
      : Promise.resolve([]),
  ])
  return { estado: 'ok', correo: token.mailbox || input.email, reuniones: cruzarAgenda(r.eventos, token.mailbox || input.email, contactos, empresas, manana0) }
}
