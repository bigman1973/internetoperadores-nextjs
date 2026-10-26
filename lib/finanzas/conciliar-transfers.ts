import { Prisma } from '@prisma/client'
import { readStrictOwnTransfers, ConciliarDbError } from './conciliar-db'
import { derivedUuidV4 } from './easy-auto-core'
import { confirmarB4Tx, deshacerB4Tx } from './reconciliation-db'

type Tx = Prisma.TransactionClient & Record<string, any>

type StrictTransferProof = Readonly<{
  movementId: string
  oppositeMovementId: string
  fingerprint: string
}>

type LockedMovement = Readonly<{
  id: string
  version: number
  amount: number
}>

export type ConciliarTransferSource = Readonly<{
  kind: 'TRANSFERENCIA_PROPIA'
  movimientoId: string
  movimientoParId: string
  transferFingerprint: string
  versionB4: number
}>

export type ConciliarPairedTransferLegResult = Readonly<{
  state: 'confirmada'
  /** Allows undo to reject receipts for every other Conciliar source. */
  sourceKind: 'TRANSFERENCIA_PROPIA'
  pairedOperationB4Id: string
  pairedMovementId: string
  primaryMovementId: string
  transferFingerprint: string
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const INT_MIN = -2_147_483_648
const INT_MAX = 2_147_483_647

function fail(message: string): never {
  throw new ConciliarDbError(409, 'TRANSFERENCIA_CAMBIADA', message)
}

function ownRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null
}

function ownJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try { return ownRecord(JSON.parse(value)) } catch { return null }
  }
  return ownRecord(value)
}

function hasExactOwnKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length
    && actual.every(key => keys.includes(key))
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}

function movementId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 160 && value.trim() === value ? value : null
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = typeof value === 'bigint' ? Number(value) : value
  return Number.isSafeInteger(parsed) && (parsed as number) >= minimum && (parsed as number) <= maximum ? Number(parsed) : null
}

/**
 * Parses only the complete transfer source persisted by Conciliar. It deliberately
 * rejects a partial or extended object: this helper must not turn another row kind
 * into a transfer merely because it happens to contain two movement IDs.
 */
export function parseConciliarTransferSource(value: unknown): ConciliarTransferSource | null {
  const source = ownRecord(value)
  if (!source || !hasExactOwnKeys(source, ['kind', 'movimientoId', 'movimientoParId', 'transferFingerprint', 'versionB4'])) return null
  const primaryMovementId = movementId(source.movimientoId)
  const pairedMovementId = movementId(source.movimientoParId)
  const fingerprint = typeof source.transferFingerprint === 'string' && SHA256.test(source.transferFingerprint)
    ? source.transferFingerprint
    : null
  const version = integer(source.versionB4, 1, INT_MAX)
  if (source.kind !== 'TRANSFERENCIA_PROPIA' || !primaryMovementId || !pairedMovementId || primaryMovementId === pairedMovementId || !fingerprint || version === null) return null
  return {
    kind: 'TRANSFERENCIA_PROPIA',
    movimientoId: primaryMovementId,
    movimientoParId: pairedMovementId,
    transferFingerprint: fingerprint,
    versionB4: version,
  }
}

/** The displayed amount is only an assertion; writes always use locked bank amounts. */
export function exactTransferAmountsMatch(primaryAmount: unknown, pairedAmount: unknown, expectedAmount: unknown): boolean {
  const primary = integer(primaryAmount, INT_MIN, INT_MAX)
  const paired = integer(pairedAmount, INT_MIN, INT_MAX)
  const expected = integer(expectedAmount, INT_MIN, INT_MAX)
  return primary !== null && paired !== null && expected !== null && expected !== 0
    && primary === expected && paired === -expected
}

/**
 * Accepts proof only when the reader returned both reciprocal legs and both retain
 * the exact opaque source identity. A one-sided proof is never enough to write.
 */
export function strictPairedTransferProof(
  source: ConciliarTransferSource,
  proofs: ReadonlyMap<string, unknown>,
): Readonly<{ primary: StrictTransferProof; paired: StrictTransferProof }> | null {
  const primary = ownRecord(proofs.get(source.movimientoId))
  const paired = ownRecord(proofs.get(source.movimientoParId))
  const valid = (proof: Record<string, unknown> | null, movementIdValue: string, oppositeMovementId: string): proof is StrictTransferProof => !!proof
    && proof.movementId === movementIdValue
    && proof.oppositeMovementId === oppositeMovementId
    && proof.fingerprint === source.transferFingerprint
  if (!valid(primary, source.movimientoId, source.movimientoParId) || !valid(paired, source.movimientoParId, source.movimientoId)) return null
  return { primary, paired }
}

function asLockedMovement(row: unknown): LockedMovement | null {
  const source = ownRecord(row)
  const id = movementId(source?.id)
  const version = integer(source?.version, 1, INT_MAX)
  const amount = integer(source?.amount, INT_MIN, INT_MAX)
  return id && version !== null && amount !== null ? { id, version, amount } : null
}

async function lockMovements(tx: Tx, movementIds: readonly string[]): Promise<void> {
  for (const id of [...movementIds].sort((left, right) => left.localeCompare(right))) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${id} AS text),0))::text AS locked`
  }
}

async function lockedMovements(tx: Tx, movementIds: readonly string[]): Promise<ReadonlyMap<string, LockedMovement>> {
  const rows = await tx.$queryRaw<Array<unknown>>(Prisma.sql`
    SELECT m.id,COALESCE(e.version,1) AS version,b4_importe_bancario_centimos(m.importe) AS amount
    FROM movimientos_bancarios m
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.id IN (${Prisma.join(movementIds.map(id => Prisma.sql`${id}`))})
    ORDER BY m.id ASC
    FOR UPDATE OF m
  `)
  if (rows.length !== movementIds.length) fail('Uno de los movimientos de la transferencia ya no existe. Actualiza la lista.')
  const result = new Map<string, LockedMovement>()
  for (const row of rows) {
    const parsed = asLockedMovement(row)
    if (!parsed || result.has(parsed.id)) fail('Los datos de la transferencia ya no se pueden comprobar. Actualiza la lista.')
    result.set(parsed.id, parsed)
  }
  return result
}

function confirmKey(operationId: string, movementIdValue: string): string {
  return derivedUuidV4('CONCILIAR_TRANSFER_CONFIRM_V1', `${operationId}:${movementIdValue}`)
}

function pairedUndoKey(undoOperationId: string, movementIdValue: string): string {
  return derivedUuidV4('CONCILIAR_TRANSFER_PAIRED_UNDO_V1', `${undoOperationId}:${movementIdValue}`)
}

function isOwnTransferConfirmationSnapshot(value: unknown, expectedMovementId: string): boolean {
  const request = ownJsonRecord(value)
  if (!request || !hasExactOwnKeys(request, ['action', 'confirmacion', 'idempotencyKey', 'version', 'borrador'])) return false
  const draft = ownRecord(request.borrador)
  return request.action === 'confirmar'
    && request.confirmacion === true
    && uuid(request.idempotencyKey) !== null
    && integer(request.version, 1, INT_MAX) !== null
    && !!draft
    && hasExactOwnKeys(draft, ['movimientoId', 'importeMovimientoCentimos', 'estado', 'motivoNoRequiere', 'lineas'])
    && draft.movimientoId === expectedMovementId
    && integer(draft.importeMovimientoCentimos, INT_MIN, INT_MAX) !== null
    && draft.estado === 'NO_REQUIERE'
    && draft.motivoNoRequiere === 'TRASPASO_INTERNO_SIN_DOCUMENTO'
    && Array.isArray(draft.lineas)
    && draft.lineas.length === 0
}

/**
 * Confirms both legs while using the caller's transaction. It neither creates a
 * transaction nor selects a batch: the only B4 writes are the two locked legs.
 */
export async function confirmConciliarTransferTx(
  base: Prisma.TransactionClient,
  actorId: number,
  operationId: string,
  rowSource: unknown,
  expectedAmount: number,
): Promise<Readonly<{ operationB4Id: string; result: ConciliarPairedTransferLegResult }>> {
  const tx = base as Tx
  const source = parseConciliarTransferSource(rowSource)
  const receiptId = uuid(operationId)
  if (!source || !receiptId || integer(actorId, 1, INT_MAX) === null || !Number.isSafeInteger(expectedAmount)) {
    fail('La transferencia seleccionada no es válida. Actualiza la lista.')
  }

  const movementIds = [source.movimientoId, source.movimientoParId]
  await lockMovements(tx, movementIds)
  const liveMovements = await lockedMovements(tx, movementIds)
  const proofMap = await readStrictOwnTransfers(tx)
  if (!strictPairedTransferProof(source, proofMap as ReadonlyMap<string, unknown>)) {
    fail('No se puede comprobar que los dos movimientos sigan siendo el mismo traspaso. Actualiza la lista.')
  }

  const primary = liveMovements.get(source.movimientoId)
  const paired = liveMovements.get(source.movimientoParId)
  if (!primary || !paired || !exactTransferAmountsMatch(primary.amount, paired.amount, expectedAmount) || primary.version !== source.versionB4) {
    fail('La transferencia cambió desde que abriste la lista. Actualiza y vuelve a intentarlo.')
  }

  const primaryResult: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar',
    confirmacion: true,
    idempotencyKey: confirmKey(receiptId, primary.id),
    version: primary.version,
    borrador: {
      movimientoId: primary.id,
      importeMovimientoCentimos: primary.amount,
      estado: 'NO_REQUIERE',
      motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO',
      lineas: [],
    },
  })
  if (primaryResult.idempotente || !uuid(primaryResult?.operacion?.id)) {
    fail('La transferencia ya tiene una confirmación distinta. Actualiza la lista.')
  }

  const pairedResult: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar',
    confirmacion: true,
    idempotencyKey: confirmKey(receiptId, paired.id),
    version: paired.version,
    borrador: {
      movimientoId: paired.id,
      importeMovimientoCentimos: paired.amount,
      estado: 'NO_REQUIERE',
      motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO',
      lineas: [],
    },
  })
  const primaryOperationId = uuid(primaryResult?.operacion?.id)
  const pairedOperationId = uuid(pairedResult?.operacion?.id)
  if (pairedResult.idempotente || !primaryOperationId || !pairedOperationId) {
    fail('La transferencia ya tiene una confirmación distinta. Actualiza la lista.')
  }

  return {
    operationB4Id: primaryOperationId,
    result: {
      state: 'confirmada',
      sourceKind: 'TRANSFERENCIA_PROPIA',
      pairedOperationB4Id: pairedOperationId,
      pairedMovementId: paired.id,
      primaryMovementId: primary.id,
      transferFingerprint: source.transferFingerprint,
    },
  }
}

/**
 * Parses the durable, own JSON stored in a Conciliar leg. Unknown keys and every
 * missing marker are rejected so that a malformed receipt cannot target an
 * unrelated operation during undo.
 */
export function parseConciliarPairedTransferLegResult(value: unknown): ConciliarPairedTransferLegResult | null {
  const result = ownJsonRecord(value)
  if (!result || !hasExactOwnKeys(result, ['state', 'sourceKind', 'pairedOperationB4Id', 'pairedMovementId', 'primaryMovementId', 'transferFingerprint'])) return null
  const pairedOperationB4Id = uuid(result.pairedOperationB4Id)
  const pairedMovementId = movementId(result.pairedMovementId)
  const primaryMovementId = movementId(result.primaryMovementId)
  const transferFingerprint = typeof result.transferFingerprint === 'string' && SHA256.test(result.transferFingerprint)
    ? result.transferFingerprint
    : null
  if (result.state !== 'confirmada' || result.sourceKind !== 'TRANSFERENCIA_PROPIA' || !pairedOperationB4Id || !pairedMovementId || !primaryMovementId || pairedMovementId === primaryMovementId || !transferFingerprint) return null
  return {
    state: 'confirmada',
    sourceKind: 'TRANSFERENCIA_PROPIA',
    pairedOperationB4Id,
    pairedMovementId,
    primaryMovementId,
    transferFingerprint,
  }
}

/** Reverses only the paired leg; the parent reverses and records the primary leg. */
export async function undoConciliarPairedTransferTx(
  base: Prisma.TransactionClient,
  actorId: number,
  rawLegResult: unknown,
  undoOperationId: string,
): Promise<Readonly<{ pairedOriginalOperationB4Id: string; pairedReversalOperationB4Id: string }>> {
  const tx = base as Tx
  const leg = parseConciliarPairedTransferLegResult(rawLegResult)
  const receiptId = uuid(undoOperationId)
  if (!leg || !receiptId || integer(actorId, 1, INT_MAX) === null) {
    fail('El recibo de la transferencia no es válido para deshacerla.')
  }

  const originals = await tx.$queryRaw<Array<unknown>>(Prisma.sql`
    SELECT o.id::text AS id,o.movimiento_id AS "movementId",o.solicitada_por_id AS "actorId",
      o.version_resultante AS version,o.estado::text AS state,(o.revertida_at IS NOT NULL) AS reverted,
      (o.revierte_operacion_id IS NOT NULL) AS "isReversal",o.snapshot_solicitud AS snapshot,e.version AS "liveVersion"
    FROM operaciones_justificacion_b4 o
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=o.movimiento_id
    WHERE o.id=CAST(${leg.pairedOperationB4Id} AS uuid)
    LIMIT 1 FOR UPDATE OF o,e
  `)
  const original = ownRecord(originals[0])
  const originalId = uuid(original?.id)
  const originalMovementId = movementId(original?.movementId)
  const originalActorId = integer(original?.actorId, 1, INT_MAX)
  const version = integer(original?.version, 1, INT_MAX)
  const liveVersion = integer(original?.liveVersion, 1, INT_MAX)
  if (!originalId || !originalMovementId || originalMovementId !== leg.pairedMovementId
    || originalActorId !== actorId || original?.state !== 'APLICADA' || original?.reverted !== false
    || original?.isReversal !== false || !isOwnTransferConfirmationSnapshot(original?.snapshot, originalMovementId)
    || version === null || liveVersion === null || liveVersion !== version) {
    fail('La otra parte de la transferencia cambió y no se puede deshacer con seguridad.')
  }

  const reversal: any = await deshacerB4Tx(tx, actorId, {
    action: 'deshacer',
    confirmacion: true,
    idempotencyKey: pairedUndoKey(receiptId, originalMovementId),
    version: liveVersion,
    operacionId: originalId,
    lineas: [],
  })
  const reversalId = uuid(reversal?.operacion?.id)
  if (reversal?.idempotente || !reversalId) {
    fail('La otra parte de la transferencia ya cambió. Actualiza la lista.')
  }
  return { pairedOriginalOperationB4Id: originalId, pairedReversalOperationB4Id: reversalId }
}
