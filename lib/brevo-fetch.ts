/**
 * Todas las llamadas del panel a la API de Brevo pasan por aquí.
 *
 * Modo AISLADO (staging y previews): solo lecturas reales.
 *  - Correos (POST /v3/smtp/email): se desvían a BREVO_STAGING_TEST_EMAIL (sin cc/bcc).
 *    Si esa variable no existe o no es válida, no se envía nada y se registra.
 *  - Cualquier otra escritura (contactos, listas, campañas, webhooks…): se simula y se registra, sin llamar a Brevo.
 * Modo REAL: producción. No cambia nada respecto a llamar a fetch directamente.
 *
 * Depende SOLO del entorno (VERCEL_ENV y BREVO_STAGING_SANDBOX), nunca de qué clave haya.
 * Los registros no incluyen emails, nombres ni la clave: solo método, ruta y número de destinatarios.
 */
type Env = Record<string, string | undefined>

export type BrevoModo = 'real' | 'aislado'

/** Producción en Vercel: siempre real. Preview/development, o BREVO_STAGING_SANDBOX=1: aislado. */
export function brevoModo(env: Env = process.env): BrevoModo {
  if (env.VERCEL_ENV === 'production') return 'real'
  if ((env.BREVO_STAGING_SANDBOX || '').trim() === '1') return 'aislado'
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') return 'aislado'
  return 'real'
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function brevoCorreoPrueba(env: Env = process.env): string | null {
  const v = (env.BREVO_STAGING_TEST_EMAIL || '').trim()
  return EMAIL_OK.test(v) ? v : null
}

export type BrevoRegistro = { modo: BrevoModo; accion: 'real' | 'lectura' | 'desviado' | 'no_enviado' | 'simulado'; metodo: string; ruta: string; destinatarios?: number }

type Deps = { env?: Env; fetchImpl?: typeof fetch; log?: (r: BrevoRegistro) => void }

const logPorDefecto = (r: BrevoRegistro) => console.info(`[brevo-${r.modo}] ${JSON.stringify(r)}`)

function rutaDe(url: string): string {
  try { return new URL(url).pathname } catch { return String(url).replace(/\?.*$/, '').slice(0, 120) }
}

function contar(lista: unknown): number { return Array.isArray(lista) ? lista.length : 0 }

function simulada(ruta: string, metodo: string): Response {
  let body: unknown = {}
  if (ruta === '/v3/smtp/email') body = { messageId: '<simulado-staging@internetoperadores.local>' }
  else if (ruta === '/v3/contacts' && metodo === 'POST') body = { id: 0 }
  else if (/\/contacts\/(add|remove)$/.test(ruta)) body = { contacts: { success: [], failure: [], total: 0 } }
  return new Response(JSON.stringify(body), { status: 201, headers: { 'content-type': 'application/json', 'x-brevo-simulado': '1' } })
}

export function crearBrevoFetch(deps: Deps = {}) {
  return async function brevoFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const env = deps.env ?? process.env
    const fetchImpl = deps.fetchImpl ?? fetch
    const log = deps.log ?? logPorDefecto
    const url = String(input)
    const metodo = String(init.method || 'GET').toUpperCase()
    const ruta = rutaDe(url)
    const modo = brevoModo(env)

    if (modo === 'real') return fetchImpl(input, init)
    if (metodo === 'GET' || metodo === 'HEAD') { log({ modo, accion: 'lectura', metodo, ruta }); return fetchImpl(input, init) }

    if (metodo === 'POST' && ruta === '/v3/smtp/email') {
      let datos: any = null
      try { datos = typeof init.body === 'string' ? JSON.parse(init.body) : null } catch { datos = null }
      const destinatarios = datos ? contar(datos.to) + contar(datos.cc) + contar(datos.bcc) + (Array.isArray(datos.messageVersions) ? datos.messageVersions.reduce((n: number, v: any) => n + contar(v?.to) + contar(v?.cc) + contar(v?.bcc), 0) : 0) : 0
      const prueba = brevoCorreoPrueba(env)
      if (!prueba || !datos) { log({ modo, accion: 'no_enviado', metodo, ruta, destinatarios }); return simulada(ruta, metodo) }
      const desviado: any = { ...datos, to: [{ email: prueba, name: 'Prueba staging' }], subject: `[STAGING · ${destinatarios} dest.] ${datos.subject || ''}`.trim() }
      delete desviado.cc; delete desviado.bcc
      if (Array.isArray(datos.messageVersions)) {
        desviado.messageVersions = datos.messageVersions.slice(0, 1).map((v: any) => { const c = { ...v, to: [{ email: prueba, name: 'Prueba staging' }] }; delete c.cc; delete c.bcc; if (c.subject) c.subject = `[STAGING] ${c.subject}`; return c })
      }
      log({ modo, accion: 'desviado', metodo, ruta, destinatarios })
      return fetchImpl(input, { ...init, body: JSON.stringify(desviado) })
    }

    log({ modo, accion: 'simulado', metodo, ruta })
    return simulada(ruta, metodo)
  }
}

/** Sustituto directo de fetch para URLs de https://api.brevo.com. */
export const brevoFetch = crearBrevoFetch()
