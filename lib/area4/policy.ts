import { permisosFin } from '../impuestos/auth-permisos'

export const AREA4_CAPABILITIES = ['lectura', 'escritura', 'confirmar', 'exportar'] as const

export type Area4Capability = typeof AREA4_CAPABILITIES[number]

export type Area4Principal = Readonly<{
  id: number
  activo: boolean
  rol: string
  roles?: readonly string[]
}>

export type Area4Grant = Readonly<{
  codigo: string
  lectura: boolean
  escritura: boolean
  confirmar?: boolean
  exportar?: boolean
}>

/**
 * Control de identidades/evidencia y módulos reservados al propietario real
 * por sus guardias existentes de staging (Rentabilidad y Sistemas).
 * No se conceden por el rol Gerente ni por perfiles operativos.
 */
export const AREA4_OWNER_ONLY_PREFIXES = [
  'admin.usuarios',
  'admin.permisos',
  'admin.auditoria',
  'admin.actuar_como',
  'admin.rentabilidad',
  'admin.sistemas',
] as const

export function configuredArea4OwnerId(env: Record<string, string | undefined> = process.env): number | null {
  const explicit = env.AREA4_OWNER_USER_ID?.trim()
  const legacyActorIds = env.IMPERSONATION_ALLOWED_ACTOR_IDS?.split(',').map(value => value.trim()).filter(Boolean) || []
  // La configuración explícita prevalece. Mientras se migra la configuración,
  // se acepta únicamente un actor existente y unívoco de Actuar como; una lista
  // con más de un ID falla cerrada.
  const candidate = explicit || (legacyActorIds.length === 1 ? legacyActorIds[0] : '')
  const parsed = Number(candidate)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function isArea4Owner(
  principal: Area4Principal,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const ownerId = configuredArea4OwnerId(env)
  return principal.activo && principal.rol === 'SUPER_ADMIN' && ownerId !== null && principal.id === ownerId
}

export function isArea4OwnerOnlyArea(codigoArea: string): boolean {
  return AREA4_OWNER_ONLY_PREFIXES.some(prefix => codigoArea === prefix || codigoArea.startsWith(`${prefix}.`))
}

export function isArea4MissingAdoptionColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const missing = error as { code?: string; meta?: { column?: unknown } }
  if (missing.code !== 'P2022' || typeof missing.meta?.column !== 'string') return false
  return /^(?:(?:public|"public")\.)?(?:(?:usuarios_admin|"usuarios_admin")\.)?(?:permisos_area4_vivos|"permisos_area4_vivos")$/.test(missing.meta.column)
}

export function inheritedAreaCodes(codigoArea: string): string[] {
  const parts = codigoArea.split('.').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('.'))
}

export function grantAllowsArea4Capability(
  grants: readonly Area4Grant[],
  codigoArea: string,
  capability: Area4Capability,
): boolean {
  const inherited = new Set(inheritedAreaCodes(codigoArea))
  const matches = grants.filter(grant => inherited.has(grant.codigo))
    .sort((a, b) => b.codigo.split('.').length - a.codigo.split('.').length)
  // El ajuste más específico prevalece: revocar una hija no queda anulado
  // por un permiso amplio de su padre.
  return matches.length > 0 && Boolean(matches[0][capability])
}

/** Existing module restrictions are an intersection, never a new grant.
 * A general finance grant cannot delegate these role-only modules or approval.
 */
export function area4FinanceModuleAllows(input: Readonly<{
  principal: Area4Principal
  codigoArea: string
  capability: Area4Capability
  isImpersonating?: boolean
}>): boolean {
  const module = ['impuestos', 'presupuesto'].find(name => input.codigoArea === `admin.finanzas.${name}` || input.codigoArea.startsWith(`admin.finanzas.${name}.`))
  if (!module) return true
  if (!input.principal.activo || input.isImpersonating) return false
  const allowed = permisosFin(module as 'impuestos' | 'presupuesto', input.principal.rol, [...(input.principal.roles || [])])
  if (!allowed.acceso) return false
  if (input.capability === 'lectura') return true
  if (module === 'presupuesto' && input.capability === 'confirmar') return allowed.puedeAprobar
  return allowed.puedeEditar
}

/**
 * Política única, reusable por SSR, APIs y menú. El menú solo la representa;
 * cada ruta sensible debe volver a resolver la identidad viva antes de invocarla.
 */
export function evaluateArea4Capability(input: Readonly<{
  principal: Area4Principal
  grants: readonly Area4Grant[]
  codigoArea: string
  capability: Area4Capability
  ownerId?: number | null
  isImpersonating?: boolean
  permissionsAdopted?: boolean
}>): boolean {
  const { principal, grants, codigoArea, capability } = input
  if (!principal.activo) return false
  if (!area4FinanceModuleAllows(input)) return false

  const ownerId = input.ownerId === undefined ? configuredArea4OwnerId() : input.ownerId
  if (principal.rol === 'SUPER_ADMIN') {
    return ownerId !== null && principal.id === ownerId
  }

  if (isArea4OwnerOnlyArea(codigoArea)) return false

  // Una ACL adoptada vacía es una denegación, también para Gerente.
  if (input.permissionsAdopted && grants.length === 0) return false

  // Decisión de Víctor: Gerente opera todo el negocio, pero nunca usuarios,
  // perfiles/permisos, auditoría ni Actuar como.
  if (principal.rol === 'GERENTE') {
    const inherited = new Set(inheritedAreaCodes(codigoArea))
    if (!grants.some(grant => inherited.has(grant.codigo))) return true
  }

  return grantAllowsArea4Capability(grants, codigoArea, capability)
}
