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

export type BrevoEstado = {
  fuente: BrevoKeySource | null
  variables: { BREVO_API_KEY_STAGING: boolean; BREVO_API_KEY: boolean }
  ok: boolean
  error: string | null
  cuenta: { empresa: string | null; planes: string[] } | null
  listas: Array<{ id: number; nombre: string; suscriptores: number | null }>
  totalListas: number | null
}

/** Comprobación de SOLO LECTURA: GET /v3/account y GET /v3/contacts/lists. No envía nada ni modifica contactos. */
export async function comprobarBrevo(fetchImpl: typeof fetch = fetch, env: Env = process.env): Promise<BrevoEstado> {
  const fuente = brevoApiKeySource(env)
  const variables = { BREVO_API_KEY_STAGING: Boolean((env.BREVO_API_KEY_STAGING || '').trim()), BREVO_API_KEY: Boolean((env.BREVO_API_KEY || '').trim()) }
  const base: BrevoEstado = { fuente, variables, ok: false, error: null, cuenta: null, listas: [], totalListas: null }
  if (!fuente) return { ...base, error: 'BREVO_API_KEY_NO_CONFIGURADA' }
  const headers = { 'api-key': getBrevoApiKey(env), accept: 'application/json' }
  try {
    const rc = await fetchImpl('https://api.brevo.com/v3/account', { method: 'GET', headers, cache: 'no-store' })
    if (!rc.ok) return { ...base, error: rc.status === 401 ? 'BREVO_HTTP_401_CLAVE_NO_VALIDA_O_REVOCADA' : `BREVO_HTTP_${rc.status}` }
    const cuenta = await rc.json().catch(() => ({}))
    const rl = await fetchImpl('https://api.brevo.com/v3/contacts/lists?limit=50&offset=0', { method: 'GET', headers, cache: 'no-store' })
    if (!rl.ok) {
      return { ...base, ok: false, error: `BREVO_LISTAS_HTTP_${rl.status}`, cuenta: { empresa: cuenta?.companyName ?? null, planes: Array.isArray(cuenta?.plan) ? cuenta.plan.map((p: { type?: string }) => String(p?.type || '')) : [] } }
    }
    const listas = await rl.json().catch(() => ({}))
    return {
      ...base,
      ok: true,
      cuenta: { empresa: cuenta?.companyName ?? null, planes: Array.isArray(cuenta?.plan) ? cuenta.plan.map((p: { type?: string }) => String(p?.type || '')) : [] },
      listas: (Array.isArray(listas?.lists) ? listas.lists : []).map((l: { id: number; name: string; uniqueSubscribers?: number; totalSubscribers?: number }) => ({
        id: Number(l.id), nombre: String(l.name || ''), suscriptores: typeof l.uniqueSubscribers === 'number' ? l.uniqueSubscribers : typeof l.totalSubscribers === 'number' ? l.totalSubscribers : null,
      })),
      totalListas: typeof listas?.count === 'number' ? listas.count : null,
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? `BREVO_RED: ${e.message.slice(0, 60)}` : 'BREVO_RED' }
  }
}
