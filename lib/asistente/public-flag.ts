// Regla única de activación del asistente (contrato §10). Sólo servidor: lee
// variables de entorno sin prefijo NEXT_PUBLIC, por lo que nunca llegan al cliente.
// Staging (FINANCE_STAGING_SANDBOX=1) funciona sin variables nuevas; fuera de
// staging el asistente queda apagado hasta que se active de forma explícita.

export type AssistantMode = 'extractivo' | 'local' | 'desactivado'

type Env = Record<string, string | undefined>

const MODES: ReadonlySet<string> = new Set(['extractivo', 'local', 'desactivado'])

export function isStagingSandbox(env: Env = process.env): boolean {
  return env.FINANCE_STAGING_SANDBOX === '1'
}

/** Modo pedido por entorno. Si falta o no es válido: extractivo en staging, desactivado fuera. */
export function envAssistantMode(env: Env = process.env): AssistantMode {
  const raw = (env.ASSISTANT_MODE || '').trim()
  if (MODES.has(raw)) return raw as AssistantMode
  return isStagingSandbox(env) ? 'extractivo' : 'desactivado'
}

/** Widget público visible: 'true' explícito, o variable ausente en staging. 'false' apaga siempre. */
export function assistantPublicEnabled(env: Env = process.env): boolean {
  if (envAssistantMode(env) === 'desactivado') return false
  const raw = env.ASSISTANT_PUBLIC_ENABLED
  if (raw === 'true') return true
  if (raw === undefined || raw.trim() === '') return isStagingSandbox(env)
  return false
}

/** Espacio Cliente: sólo con 'true' explícito (hoy desactivado en todos los entornos). */
export function assistantClientEnabled(env: Env = process.env): boolean {
  return env.ASSISTANT_CLIENT_ENABLED === 'true' && envAssistantMode(env) !== 'desactivado'
}

export const ASSISTANT_EXCLUDED_PREFIXES = [
  '/admin', '/empleado', '/cliente', '/login', '/api', '/checkout', '/carrito', '/pago',
] as const

/** Rutas en las que nunca se monta el widget público. */
export function isAssistantExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return true
  const path = pathname.toLowerCase()
  return ASSISTANT_EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'))
}
