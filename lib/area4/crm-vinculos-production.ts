import { vinculosBloqueProduccionHabilitado } from '../area1-puertas-produccion'
import { financeEnvironment } from '../finanzas/finance-environment'
import { rawRequestPathBeforeNormalization, strictSameOrigin } from '../impersonation-policy'
import { area4RegisteredSurface } from './section-registry'

export const AREA4_VINCULOS_BLOQUE_API = '/api/admin/crm/isp/vinculos/bloque'
export const AREA4_VINCULOS_BLOQUE_PAGE = '/admin/crm/isp/vinculos-bloque'
export const AREA4_VINCULOS_BLOQUE_BYTES = 16384

type Env = Record<string, string | undefined>

/** Separate gate, not AREA1_IMPORTACIONES_PRODUCCION or a finance-wide grant.
 * Uses the canonical Railway host/port/user/database comparator. No I/O.
 */
export function area4VinculosBloqueProductionEnabled(env: Env = process.env): boolean {
  if (!vinculosBloqueProduccionHabilitado(env) || env.FINANCE_STAGING_SANDBOX === '1'
    || env.FINANCE_DEPLOYMENT_READ_ONLY === '1' || env.IO_PRODUCTION_READ_ONLY === '1') return false
  try {
    return financeEnvironment({ vercelEnvironment: env.VERCEL_ENV, databaseUrl: env.DATABASE_URL,
      productionEnabled: '1', automaticLinksDisabled: '1' }) === 'production'
  } catch { return false }
}

/** Exactly the existing API GET/POST or dedicated document GET; never neighbors.
 * Reject query selectors, body-on-read and server actions instead of broadening
 * the closed command. URL normalization is not new authority.
 */
export function area4VinculosBloqueProductionSurface(request: Request): 'api' | 'page' | null {
  try {
    const url = new URL(request.url)
    const path = rawRequestPathBeforeNormalization(request.url)
    if (path !== url.pathname || url.search || url.hash || request.headers.has('next-action')) return null
    const kind = path === AREA4_VINCULOS_BLOQUE_API && ['GET', 'POST'].includes(request.method) ? 'api'
      : path === AREA4_VINCULOS_BLOQUE_PAGE && request.method === 'GET' ? 'page' : null
    if (!kind || (request.method === 'GET' && request.body !== null)) return null
    const match = area4RegisteredSurface(path!, kind)
    if (!match || match.surface.path !== path || match.section.key !== 'crm-isp' || match.baseline) return null
    if (kind === 'api' && (match.surface.request?.stagingImport !== 'isp-vinculos-bloque-v1'
      || match.surface.request.commandBodyLimit !== AREA4_VINCULOS_BLOQUE_BYTES)) return null
    return kind
  } catch { return null }
}

/** Native same-origin GET normally omits Origin: only that exact bodyless API
 * read may omit it, still over HTTPS with explicit Sec-Fetch-Site same-origin.
 * A present Origin must match exactly; POST always requires it. This is not
 * authentication: callers still require runtime/DSN/readonly and live owner V/C.
 * Documents themselves cannot send Origin on ordinary navigation; the document
 * gate still repeats runtime and owner checks and never reads/mutates the block.
 */
export function area4VinculosBloqueProductionOriginAllowed(request: Request): boolean {
  if (area4VinculosBloqueProductionSurface(request) !== 'api'
    || request.headers.get('sec-fetch-site') !== 'same-origin') return false
  const origin = request.headers.get('origin')
  if (origin !== null) return strictSameOrigin(origin, request.url)
  try { return request.method === 'GET' && new URL(request.url).protocol === 'https:' }
  catch { return false }
}

/** V/C only on this future exception. Stage keeps its existing V/E/C policy. */
export function area4VinculosBloqueProductionCapabilities(method: string): readonly ('lectura' | 'confirmar')[] {
  return method === 'GET' ? ['lectura'] : method === 'POST' ? ['lectura', 'confirmar'] : []
}
