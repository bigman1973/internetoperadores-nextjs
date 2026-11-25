/**
 * Área 1 · Microsoft 365 desde la ficha del CRM (permisos DELEGADOS del usuario conectado).
 *
 * Aislamiento: depende SOLO del entorno, nunca de la clave ni del buzón.
 *  - Producción en Vercel (VERCEL_ENV=production) y sin M365_STAGING_SANDBOX=1 → modo «real».
 *  - Cualquier otro caso (staging, previews, development, local) → modo «aislado».
 * En modo aislado ningún correo ni invitación llega a terceros:
 *  - si existe M365_STAGING_TEST_EMAIL (buzón corporativo), todo se desvía a esa dirección;
 *  - si no, el correo NO se envía (queda registrado como «no enviado (aislado)») y la reunión
 *    se crea solo en la agenda del propio usuario, sin invitados.
 * Producción no cambia nada.
 */

type Env = Record<string, string | undefined>
export type M365Modo = 'real' | 'aislado'

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMINIOS_CORPORATIVOS = ['internetoperadores.com', 'lfgd.es', 'farmsplanet.es', 'elypseadvisory.com']

export function m365Modo(env: Env = process.env): M365Modo {
  if ((env.M365_STAGING_SANDBOX || '').trim() === '1') return 'aislado'
  return env.VERCEL_ENV === 'production' ? 'real' : 'aislado'
}

/** Dirección de prueba para staging: solo se acepta si es un buzón corporativo. */
export function m365CorreoPrueba(env: Env = process.env): string | null {
  const v = (env.M365_STAGING_TEST_EMAIL || '').trim().toLowerCase()
  if (!EMAIL_OK.test(v)) return null
  return DOMINIOS_CORPORATIVOS.some((d) => v.endsWith(`@${d}`)) ? v : null
}

export type M365AccionAislamiento = 'real' | 'desviado' | 'no_enviado'

export type CorreoDestinos = { to: string[]; cc: string[]; bcc: string[]; subject: string }
export type CorreoAislado = CorreoDestinos & { modo: M365Modo; accion: M365AccionAislamiento; destinatariosOriginales: number; correoPrueba: string | null }

export function aislarCorreo(input: CorreoDestinos, env: Env = process.env): CorreoAislado {
  const modo = m365Modo(env)
  const originales = new Set([...input.to, ...input.cc, ...input.bcc].map((e) => e.trim().toLowerCase()).filter(Boolean)).size
  if (modo === 'real') return { ...input, modo, accion: 'real', destinatariosOriginales: originales, correoPrueba: null }
  const prueba = m365CorreoPrueba(env)
  if (!prueba) return { to: [], cc: [], bcc: [], subject: input.subject, modo, accion: 'no_enviado', destinatariosOriginales: originales, correoPrueba: null }
  return {
    to: [prueba],
    cc: [],
    bcc: [],
    subject: `[STAGING · ${originales} destinatario${originales === 1 ? '' : 's'} desviado${originales === 1 ? '' : 's'}] ${input.subject}`.slice(0, 250),
    modo,
    accion: 'desviado',
    destinatariosOriginales: originales,
    correoPrueba: prueba,
  }
}

export type Asistente = { email: string; name?: string | null }
export type AsistentesAislados = { asistentes: Asistente[]; modo: M365Modo; accion: M365AccionAislamiento; originales: number; correoPrueba: string | null }

export function aislarAsistentes(asistentes: Asistente[], env: Env = process.env): AsistentesAislados {
  const modo = m365Modo(env)
  const originales = asistentes.length
  if (modo === 'real') return { asistentes, modo, accion: 'real', originales, correoPrueba: null }
  if (!originales) return { asistentes: [], modo, accion: 'real', originales, correoPrueba: null }
  const prueba = m365CorreoPrueba(env)
  if (!prueba) return { asistentes: [], modo, accion: 'no_enviado', originales, correoPrueba: null }
  return { asistentes: [{ email: prueba, name: 'Prueba staging' }], modo, accion: 'desviado', originales, correoPrueba: prueba }
}

/** Texto para la interfaz (sin datos personales). */
export function avisoAislamiento(env: Env = process.env): string | null {
  if (m365Modo(env) === 'real') return null
  const prueba = m365CorreoPrueba(env)
  return prueba
    ? 'Entorno de pruebas: los correos e invitaciones se desvían a la dirección de prueba; ningún cliente los recibe.'
    : 'Entorno de pruebas: no se envía ningún correo ni invitación (falta la dirección de prueba). Queda registrado en la ficha.'
}

/** Permisos delegados que pide el panel. Nunca permisos de aplicación. */
export const M365_SCOPES_CALENDARIO = ['offline_access', 'User.Read', 'Calendars.ReadWrite'] as const
export const M365_SCOPES_CORREO = ['Mail.Send', 'Mail.ReadWrite'] as const
export const M365_SCOPES_TODOS = [...M365_SCOPES_CALENDARIO, ...M365_SCOPES_CORREO] as const

export type M365Necesidad = 'calendario' | 'correo'

export function scopesConcedidos(scopes: string | null | undefined): Set<string> {
  return new Set((scopes || '').split(/\s+/).filter(Boolean).map((s) => s.replace(/^https:\/\/graph\.microsoft\.com\//i, '').toLowerCase()))
}

export function tienePermiso(scopes: string | null | undefined, necesidad: M365Necesidad): boolean {
  const s = scopesConcedidos(scopes)
  if (necesidad === 'calendario') return s.has('calendars.readwrite')
  return s.has('mail.send') && s.has('mail.readwrite')
}

/** Scopes a pedir al renovar: solo los ya concedidos (las conexiones antiguas siguen funcionando). */
export function scopesParaRenovar(scopes: string | null | undefined): string {
  const s = scopesConcedidos(scopes)
  const pedir: string[] = ['offline_access', 'User.Read']
  for (const sc of [...M365_SCOPES_CALENDARIO, ...M365_SCOPES_CORREO]) {
    if (sc === 'offline_access' || sc === 'User.Read') continue
    if (s.has(sc.toLowerCase())) pedir.push(sc)
  }
  return pedir.join(' ')
}

/** Canal de correo por defecto (decisión de Víctor, 25/11): «Mi Outlook»; el buzón corporativo queda como opción. */
export type M365Conexion = { enabled: boolean; connected: boolean; mail?: boolean }
export function canalCorreoInicial(conexion: M365Conexion): 'outlook' | 'corporativo' {
  return conexion.enabled ? 'outlook' : 'corporativo'
}
export function correoOutlookListo(conexion: M365Conexion): boolean {
  return conexion.enabled && conexion.connected && Boolean(conexion.mail)
}
/** Si se ha elegido Mi Outlook y aún no se puede usar, no se cae al corporativo en silencio: se pide conectar o elegir. */
export function bloqueoCanalCorreo(viaOutlook: boolean, conexion: M365Conexion): string | null {
  if (!viaOutlook || correoOutlookListo(conexion)) return null
  if (!conexion.enabled) return 'El envío desde Outlook no está activo en este entorno: elige «Buzón corporativo».'
  return conexion.connected
    ? 'Concede el permiso de correo a tu Outlook o elige «Buzón corporativo».'
    : 'Conecta tu Outlook o elige «Buzón corporativo» para enviar.'
}

/** Mientras alguien «actúa como» otra persona no se usa su Outlook, no se envían correos ni se redacta con IA en su nombre. */
export const M365_BLOQUEO_ACTUACION = 'No disponible mientras actúas como otra persona: sal de «Actuar como» para usar Outlook, correo o IA.'
export function bloqueoActuacion(session: { impersonation?: unknown } | null | undefined): string | null {
  return session && session.impersonation ? M365_BLOQUEO_ACTUACION : null
}
