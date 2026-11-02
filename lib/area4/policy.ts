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
 * Estas áreas controlan identidades, permisos o la evidencia de seguridad.
 * No se conceden por el rol Gerente ni por perfiles operativos.
 */
export const AREA4_OWNER_ONLY_PREFIXES = [
  'admin.usuarios',
  'admin.permisos',
  'admin.auditoria',
  'admin.actuar_como',
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
  return grants.some(grant => inherited.has(grant.codigo) && Boolean(grant[capability]))
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
}>): boolean {
  const { principal, grants, codigoArea, capability } = input
  if (!principal.activo) return false

  const ownerId = input.ownerId === undefined ? configuredArea4OwnerId() : input.ownerId
  if (principal.rol === 'SUPER_ADMIN') {
    return ownerId !== null && principal.id === ownerId
  }

  if (isArea4OwnerOnlyArea(codigoArea)) return false

  // Decisión de Víctor: Gerente opera todo el negocio, pero nunca usuarios,
  // perfiles/permisos, auditoría ni Actuar como.
  if (principal.rol === 'GERENTE') return true

  return grantAllowsArea4Capability(grants, codigoArea, capability)
}
