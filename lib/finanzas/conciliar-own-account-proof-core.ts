/*
 * Prueba manual de cuentas propias para la revisión humana de Conciliar.
 *
 * No activa políticas, no confirma B4 y no deriva titularidad de textos bancarios.
 * Sólo consume declaraciones auditadas ya existentes y la salida es una fuente
 * sellable que el integrador debe volver a comprobar dentro de su transacción.
 */

export const CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE = 'DECLARACION_MANUAL_AUDITADA_V1' as const

export type ConciliarManualOwnAccountDeclaration = Readonly<{
  accountId: string
  version: number
  state: 'DECLARADA' | 'REVOCADA'
  confirmationDeclared: boolean
  /** Número de filas con la misma cuenta y versión máxima; cualquier duplicado bloquea. */
  sameVersionCount?: number
}>

export type ConciliarManualOwnAccountProof = Readonly<{
  source: typeof CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE
  accountIds: ReadonlySet<string>
}>

export type ConciliarHumanOwnTransferPairSource = Readonly<{
  kind: 'TRANSFERENCIA_PROPIA_MANUAL'
  movimientoId: string
  movimientoParId: string
  pairId: string
  source: typeof CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE
  versionB4: number
}>

const ACCOUNT_ID = /^[A-Za-z0-9:_-]{1,160}$/
const PAIR_ID = /^[a-f0-9]{64}$/

function validAccountId(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_ID.test(value)
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 2_147_483_647
}

/**
 * Uses only the current, audited declaration for each already-active account.
 * A revocation, absent human confirmation, malformed row or duplicate current
 * version fails closed for that account. Earlier declarations never override a
 * later declaration/revocation.
 */
export function manualOwnAccountProof(
  declarations: readonly ConciliarManualOwnAccountDeclaration[],
): ConciliarManualOwnAccountProof {
  const current = new Map<string, ConciliarManualOwnAccountDeclaration>()
  for (const declaration of declarations) {
    if (!validAccountId(declaration.accountId) || !validVersion(declaration.version)
      || (declaration.state !== 'DECLARADA' && declaration.state !== 'REVOCADA')
      || typeof declaration.confirmationDeclared !== 'boolean'
      || (declaration.sameVersionCount !== undefined && (!Number.isSafeInteger(declaration.sameVersionCount) || declaration.sameVersionCount < 1))) continue
    const previous = current.get(declaration.accountId)
    if (!previous || declaration.version > previous.version) current.set(declaration.accountId, declaration)
    else if (declaration.version === previous.version) {
      // Defensive even when a DB adapter should already have counted duplicates.
      current.set(declaration.accountId, { ...declaration, sameVersionCount: Math.max(2, declaration.sameVersionCount ?? 1, previous.sameVersionCount ?? 1) })
    }
  }
  const accountIds = new Set<string>()
  for (const declaration of current.values()) {
    if (declaration.state === 'DECLARADA' && declaration.confirmationDeclared === true && (declaration.sameVersionCount ?? 1) === 1) {
      accountIds.add(declaration.accountId)
    }
  }
  return { source: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE, accountIds }
}

/**
 * Builds the persisted source for a manual transfer confirmation bridge. The
 * caller must still re-read both movement legs, manual declarations and the
 * independent strict historical proof before any B4 write.
 */
export function humanOwnTransferPairSource(input: Readonly<{
  movimientoId: unknown
  movimientoParId: unknown
  pairId: unknown
  versionB4: unknown
}>): ConciliarHumanOwnTransferPairSource | null {
  if (!validAccountId(input.movimientoId) || !validAccountId(input.movimientoParId)
    || input.movimientoId === input.movimientoParId || typeof input.pairId !== 'string'
    || !PAIR_ID.test(input.pairId) || !validVersion(input.versionB4)) return null
  return {
    kind: 'TRANSFERENCIA_PROPIA_MANUAL',
    movimientoId: input.movimientoId,
    movimientoParId: input.movimientoParId,
    pairId: input.pairId,
    source: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE,
    versionB4: input.versionB4,
  }
}
