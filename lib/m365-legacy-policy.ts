/** Decisión de Víctor 26/11/2026: cierre reversible, individual por ruta.
 * No sustituye autenticación, permisos, aislamiento M365 ni las guardas globales.
 * No afecta a Peticiones ni a las lecturas de calendario propio/Mi Día.
 */
export const M365_LEGACY_PENDING_MESSAGE = 'Envio pendiente de activar (se hara desde Mi Outlook)'
export const M365_LEGACY_PENDING_CODE = 'M365_LEGACY_PENDING'
export const M365_LEGACY_FLAGS = {
  leads: 'M365_LEGACY_LEADS_EMAIL_ENABLED',
  mantenimiento: 'M365_LEGACY_MANTENIMIENTO_EMAIL_ENABLED',
  altas: 'M365_LEGACY_ALTAS_CONTRATO_ENABLED',
  crm: 'M365_LEGACY_CRM_EXTERNAL_ENABLED',
  magicLink: 'M365_LEGACY_MAGIC_LINK_ENABLED',
} as const
export type M365LegacyRoute = keyof typeof M365_LEGACY_FLAGS

/** Sólo el literal 1 reabre esta puerta; ausente, vacío o cualquier otro valor cierra. */
export function m365LegacyEnabled(route: M365LegacyRoute, env: Record<string, string | undefined> = process.env): boolean {
  return env[M365_LEGACY_FLAGS[route]] === '1'
}
export function m365LegacyPendingBody() {
  return { error: M365_LEGACY_PENDING_MESSAGE, message: M365_LEGACY_PENDING_MESSAGE, code: M365_LEGACY_PENDING_CODE, codigo: M365_LEGACY_PENDING_CODE, success: false }
}
export function isM365LegacyPending(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  return ('code' in data && data.code === M365_LEGACY_PENDING_CODE) || ('codigo' in data && data.codigo === M365_LEGACY_PENDING_CODE)
}

/** Sólo para ajustar el mensaje del cierre global existente; no abre ninguna excepción. */
export function m365LegacyMailRouteFromPath(path: string): M365LegacyRoute | null {
  if (/^\/api\/admin\/leads\/[^/]+\/enviar-email$/.test(path)) return 'leads'
  if (/^\/api\/admin\/leads-mantenimiento\/[^/]+\/enviar-email$/.test(path)) return 'mantenimiento'
  if (/^\/api\/altas\/[^/]+\/enviar-contrato$/.test(path)) return 'altas'
  return null
}

/** Escape de sandbox exclusivamente local: nunca infiere false de un texto o número.
 * El handler conserva validación completa, permisos vivos y bloqueo de actuación.
 */
export function isM365LegacyLocalActivity(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const value = body as Record<string, unknown>
  if (typeof value.type !== 'string' || !['NOTA', 'LLAMADA', 'TAREA', 'REUNION', 'WHATSAPP', 'LINKEDIN', 'SMS', 'CORREO_POSTAL'].includes(value.type)) return false
  if (value.syncOutlook !== undefined && value.syncOutlook !== false) return false
  if (value.viaOutlook !== undefined && value.viaOutlook !== false) return false
  if (value.prepareExternalChannel !== undefined && value.prepareExternalChannel !== false) return false
  return true
}

export function m365LegacyLocalSandboxEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.FINANCE_STAGING_SANDBOX !== '1' || env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== 'staging') return false
  if (env.FINANCE_DEPLOYMENT_READ_ONLY === '1' || env.IO_PRODUCTION_READ_ONLY === '1') return false
  try {
    const db = new URL(env.DATABASE_URL || '')
    return db.username === 'io_staging_finanzas' && db.pathname === '/io_staging_finanzas'
  } catch { return false }
}
