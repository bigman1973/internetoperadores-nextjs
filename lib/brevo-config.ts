/**
 * Clave de Brevo del panel, en un único sitio.
 * - En staging (Preview de la rama staging) existe BREVO_API_KEY_STAGING: tiene prioridad.
 * - En el resto (producción incluida) se usa BREVO_API_KEY.
 * Nunca se devuelve ni se registra el valor fuera de este módulo, salvo para la cabecera `api-key`.
 */
export type BrevoKeySource = 'BREVO_API_KEY_STAGING' | 'BREVO_API_KEY'

type Env = Record<string, string | undefined>

export function brevoApiKeySource(env: Env = process.env): BrevoKeySource | null {
  if ((env.BREVO_API_KEY_STAGING || '').trim()) return 'BREVO_API_KEY_STAGING'
  if ((env.BREVO_API_KEY || '').trim()) return 'BREVO_API_KEY'
  return null
}

export function getBrevoApiKey(env: Env = process.env): string {
  const source = brevoApiKeySource(env)
  return source ? (env[source] || '').trim() : ''
}

export type BrevoLectura = { ok: boolean; httpStatus: number | null; codigo: string | null; mensaje: string | null }

export type BrevoEstado = {
  fuente: BrevoKeySource | null
  variables: { BREVO_API_KEY_STAGING: boolean; BREVO_API_KEY: boolean }
  ok: boolean
  error: string | null
  pruebas: { cuenta: BrevoLectura | null; listas: BrevoLectura | null }
  cuenta: { empresa: string | null; planes: string[] } | null
  listas: Array<{ id: number; nombre: string; suscriptores: number | null }>
  totalListas: number | null
}

async function leer(fetchImpl: typeof fetch, url: string, key: string): Promise<{ r: BrevoLectura; body: any }> {
  try {
    const res = await fetchImpl(url, { method: 'GET', headers: { 'api-key': key, accept: 'application/json' }, cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    const mensaje = res.ok ? null : String(body?.message || '').replace(key, '***').slice(0, 160) || null
    return { r: { ok: res.ok, httpStatus: res.status, codigo: res.ok ? null : (body?.code ? String(body.code) : null), mensaje }, body }
  } catch (e) {
    return { r: { ok: false, httpStatus: null, codigo: 'red', mensaje: e instanceof Error ? e.message.slice(0, 80) : 'error de red' }, body: null }
  }
}

/** Comprobación de SOLO LECTURA: GET /v3/account y GET /v3/contacts/lists, por separado. No envía nada ni modifica contactos. */
export async function comprobarBrevo(fetchImpl: typeof fetch = fetch, env: Env = process.env): Promise<BrevoEstado> {
  const fuente = brevoApiKeySource(env)
  const variables = { BREVO_API_KEY_STAGING: Boolean((env.BREVO_API_KEY_STAGING || '').trim()), BREVO_API_KEY: Boolean((env.BREVO_API_KEY || '').trim()) }
  const base: BrevoEstado = { fuente, variables, ok: false, error: null, pruebas: { cuenta: null, listas: null }, cuenta: null, listas: [], totalListas: null }
  if (!fuente) return { ...base, error: 'BREVO_API_KEY_NO_CONFIGURADA' }
  const key = getBrevoApiKey(env)
  const c = await leer(fetchImpl, 'https://api.brevo.com/v3/account', key)
  const l = await leer(fetchImpl, 'https://api.brevo.com/v3/contacts/lists?limit=50&offset=0', key)
  const cuenta = c.r.ok ? { empresa: c.body?.companyName ?? null, planes: Array.isArray(c.body?.plan) ? c.body.plan.map((p: { type?: string }) => String(p?.type || '')) : [] } : null
  const listas = l.r.ok ? (Array.isArray(l.body?.lists) ? l.body.lists : []).map((x: { id: number; name: string; uniqueSubscribers?: number; totalSubscribers?: number }) => ({
    id: Number(x.id), nombre: String(x.name || ''), suscriptores: typeof x.uniqueSubscribers === 'number' ? x.uniqueSubscribers : typeof x.totalSubscribers === 'number' ? x.totalSubscribers : null,
  })) : []
  const fallo = !c.r.ok && !l.r.ok ? (c.r.httpStatus === 401 || l.r.httpStatus === 401 ? 'BREVO_HTTP_401_CLAVE_NO_VALIDA_O_REVOCADA' : `BREVO_HTTP_${l.r.httpStatus ?? c.r.httpStatus}`) : !l.r.ok ? `BREVO_LISTAS_HTTP_${l.r.httpStatus}` : !c.r.ok ? `BREVO_CUENTA_HTTP_${c.r.httpStatus}_SIN_PERMISO_CUENTA` : null
  return { ...base, ok: l.r.ok, error: fallo, pruebas: { cuenta: c.r, listas: l.r }, cuenta, listas, totalListas: l.r.ok && typeof l.body?.count === 'number' ? l.body.count : null }
}
