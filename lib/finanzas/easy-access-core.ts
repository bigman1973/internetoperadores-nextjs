export const EASY_ONLY_PROFILE = 'MODO_FACIL_ONLY' as const
const SAFE = new Set(['GET','HEAD','OPTIONS'])

/** Presentation/access routing only. Every Conciliar handler still proves its
 * exact runtime and live database identity independently before reading/writing. */
export function conciliarEasyOnlySurfaceEnabled(): boolean {
  if (process.env.FINANCE_STAGING_SANDBOX === '1') return true
  return process.env.VERCEL_ENV === 'production'
    && process.env.FINANCE_EASY_PRODUCTION_ENABLED === '1'
    && process.env.FINANCE_MODEL_PRODUCTION_ENABLED === '1'
    && process.env.FINANCE_AUTOMATIC_LINKS_DISABLED === '1'
    && process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED === '1'
    && process.env.NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED === '1'
    && process.env.IO_PRODUCTION_READ_ONLY !== '1'
}

export const EASY_ONLY_HOME = conciliarEasyOnlySurfaceEnabled() ? '/admin/finanzas/conciliar' : '/admin/finanzas/modo-facil'
/** Allowlist, not a prefix grant: a new action does not become available silently. */
export function easyOnlyRequestAllowed(path: string, method: string, search: URLSearchParams = new URLSearchParams(), userId?: number): boolean {
  // Rectificativas humanas remains staging-only until a separate production validation.
  if (path === '/api/admin/finanzas/rectificativas') return process.env.FINANCE_STAGING_SANDBOX === '1' && ['GET','HEAD','POST'].includes(method)
  if (conciliarEasyOnlySurfaceEnabled()) {
    if (path === '/admin/finanzas/conciliar') return SAFE.has(method)
    if (path === '/api/admin/finanzas/conciliar') return ['GET','HEAD','POST'].includes(method)
    if (path === '/api/admin/finanzas/conciliar/intereses') return ['GET','HEAD','POST'].includes(method)
    if (path === '/api/admin/finanzas/conciliar/historial') return SAFE.has(method)
    if (path === '/api/admin/finanzas/conciliar/remesa-preview') return SAFE.has(method)
    if (/^\/api\/admin\/finanzas\/conciliar\/(?:archivo|detalle)\/[A-Za-z0-9_-]{1,160}$/.test(path)) return SAFE.has(method)
  }
  if (path === '/admin/finanzas/modo-facil' || path === '/admin/finanzas/para-pedir') return SAFE.has(method)
  if (path === '/api/admin/finanzas/modo-facil') return ['GET','HEAD','POST'].includes(method)
  if (path === '/api/admin/finanzas/modo-facil/perfil') return SAFE.has(method)
  if (path === '/api/admin/finanzas/modo-facil/tarjetas') return SAFE.has(method)
  if (path === '/api/admin/finanzas/modo-facil/reglas') return ['GET','HEAD','POST'].includes(method)
  if (['/api/admin/finanzas/modo-facil/foto','/api/admin/finanzas/modo-facil/deshacer','/api/admin/finanzas/modo-facil/terceros','/api/admin/finanzas/modo-facil/terceros/bloque','/api/admin/finanzas/modo-facil/cobros'].includes(path)) return ['GET','HEAD','POST'].includes(method)
  if (path === '/api/admin/finanzas/modo-facil/para-pedir') return SAFE.has(method)
  if (/^\/api\/admin\/finanzas\/modo-facil\/documentos\/[A-Za-z0-9_-]{1,100}\/archivo$/.test(path)) return SAFE.has(method)
  if (/^\/api\/admin\/finanzas\/movimientos\/[A-Za-z0-9_-]{1,100}\/archivos$/.test(path)) {
    const ids=search.getAll('archivoId')
    return SAFE.has(method) && ids.length===1 && /^ADJUNTO_B5:[A-Za-z0-9_-]{1,100}$/.test(ids[0]) && [...search.keys()].every(key=>key==='archivoId')
  }
  // RoleContext loads only its own permissions. All other permission requests fail closed.
  if (path === '/api/admin/permisos') return SAFE.has(method) && search.get('action') === 'usuario' && !!userId && search.get('usuarioId') === String(userId)
  return false
}
