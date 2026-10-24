export const EASY_ONLY_PROFILE = 'MODO_FACIL_ONLY' as const
export const EASY_ONLY_HOME = '/admin/finanzas/modo-facil'
const SAFE = new Set(['GET','HEAD','OPTIONS'])
/** Allowlist, not a prefix grant: a new action does not become available silently. */
export function easyOnlyRequestAllowed(path: string, method: string, search: URLSearchParams = new URLSearchParams(), userId?: number): boolean {
  if (path === '/admin/finanzas/modo-facil' || path === '/admin/finanzas/para-pedir') return SAFE.has(method)
  if (path === '/api/admin/finanzas/modo-facil') return ['GET','HEAD','POST'].includes(method)
  if (path === '/api/admin/finanzas/modo-facil/perfil') return SAFE.has(method)
  if (path === '/api/admin/finanzas/modo-facil/tarjetas') return SAFE.has(method)
  if (path === '/api/admin/finanzas/modo-facil/reglas') return ['GET','HEAD','POST'].includes(method)
  if (['/api/admin/finanzas/modo-facil/foto','/api/admin/finanzas/modo-facil/deshacer','/api/admin/finanzas/modo-facil/terceros','/api/admin/finanzas/modo-facil/terceros/bloque'].includes(path)) return ['GET','HEAD','POST'].includes(method)
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
