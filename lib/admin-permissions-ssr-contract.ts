/**
 * Forma mínima y serializable de los permisos que el layout ya leyó para el
 * actor efectivo de esta respuesta. No contiene ids internos ni es autoridad
 * para APIs, mutaciones o una respuesta posterior.
 */
export type AdminPermissionSsrSeed = Readonly<{
  codigo: string
  lectura: boolean
  escritura: boolean
}>

export type AdminPermissionSeedLoadMode = 'seed' | 'skip' | 'privileged' | 'fetch' | 'idle'

export function serializeAdminPermissionSsrSeed(
  rows: readonly Readonly<{ area: Readonly<{ codigo: string }>; lectura: boolean; escritura: boolean }>[],
): AdminPermissionSsrSeed[] {
  return rows.map(({ area, lectura, escritura }) => ({
    codigo: area.codigo,
    lectura,
    escritura,
  }))
}

/** Mantiene el criterio histórico de entrada al panel: al menos una lectura. */
export function countReadableAdminPermissionSeeds(permissions: readonly AdminPermissionSsrSeed[]): number {
  return permissions.reduce((count, permission) => count + (permission.lectura ? 1 : 0), 0)
}

/**
 * Decide únicamente si el cliente puede reutilizar la foto que recibió en esta
 * respuesta. Una previsualización local invalida definitivamente la foto: al
 * salir de ella se vuelve a leer, nunca se restaura una ACL anterior.
 */
export function decideAdminPermissionSeedLoad(input: Readonly<{
  actorId: number | null | undefined
  effectiveUserId: number | null | undefined
  initialPermissionsLoaded: boolean | undefined
  skipPermissionLoad: boolean | undefined
  isPrivilegedRealRole: boolean
  isViewingAs: boolean
  initialSeedInvalidated: boolean
}>): AdminPermissionSeedLoadMode {
  if (!Number.isSafeInteger(input.effectiveUserId) || (input.effectiveUserId as number) <= 0) return 'idle'

  const isInitialActor = input.actorId === input.effectiveUserId
  const canReuseInitialResponse = isInitialActor && !input.isViewingAs && !input.initialSeedInvalidated

  if (canReuseInitialResponse && input.initialPermissionsLoaded === true) return 'seed'
  if (canReuseInitialResponse && input.skipPermissionLoad === true) return 'skip'
  // Tras una previsualización no se restaura la foto ni una excepción de rol:
  // el actor inicial vuelve a leerse desde la API actual.
  if (input.initialSeedInvalidated) return 'fetch'
  if (input.isPrivilegedRealRole && !input.isViewingAs) return 'privileged'

  return 'fetch'
}
