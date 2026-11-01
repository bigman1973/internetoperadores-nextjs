import { assertConciliarGreenPrecheckTx } from './conciliar-precheck'
import { preflightConciliarBankFeeTx, preflightConciliarReceivedInvoiceTx, preflightConciliarPayrollTx, preflightConciliarConfirmingTx, preflightConciliarB5TicketTx } from './conciliar-confirm-validators'
import { assertLiveCollectionProjectionForActionTx } from './conciliar-db'
import { Prisma, type PrismaClient } from '@prisma/client'
import prisma, { runWithConciliarSerializableAuthorization } from '@/lib/prisma'
import { assertConciliarRuntime, ConciliarRuntimeError } from '@/lib/finanzas/conciliar-runtime'
import { bibliotecaFinancieraConfigurada } from '@/lib/finanzas/archivo-fuente-controlada'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { confirmarB4Tx, createDocumentoB4Tx, deshacerB4Tx, B4ServiceError } from '@/lib/finanzas/reconciliation-db'
import { confirmEasyReconciliationTx, inspectEasyCandidatesTx, EasyReconciliationServiceError } from '@/lib/finanzas/easy-reconciliation-db'
import { runEasyCollectionsActionTx, EasyCollectionsServiceError } from '@/lib/finanzas/easy-collections-db'
import { signEasyCollectionsPreview } from '@/lib/finanzas/easy-collections-preview'
import { derivedUuidV4 } from '@/lib/finanzas/easy-auto-core'
import { confirmarReciboRemesaCompuestaTx, RemittancePaymentReceiptError } from '@/lib/finanzas/remittance-payment-receipts-db'
import { applyDocumentedConfirmingLiquidationSupport, ConciliarConfirmingServiceError, readConciliarConfirmingCandidates, undoDocumentedConfirmingInterestSupport } from '@/lib/finanzas/conciliar-confirming'
import { evaluarDocumentoExacto, isConciliarBankFee, parseConciliarCommand, type ConciliarCommand, type ConciliarProjectionSource } from './conciliar-contract'
import { assignConciliarDocumentaryCounterpartyTx, undoConciliarDocumentaryCounterpartyTx } from './conciliar-counterparty'
import { conciliarAliasesMatch, conciliarRequestHash, safeInteger } from './conciliar-core'
import { deleteConciliarBatchProjectionRowsTx, readConciliarConfirmBatchForActionTx, tryConfirmConciliarBankFeeBatchTx } from './conciliar-batch'
import type { ConciliarBatchProgress } from './conciliar-stream'
import { confirmConciliarTransferTx, undoConciliarPairedTransferTx } from './conciliar-transfers'
import { withConciliarHumanOwnTransferBatchTx, assertConciliarHumanOwnTransferPrimaryUndoTx, confirmConciliarHumanOwnTransferTx, humanOwnTransferActionForProjection, lockConciliarHumanOwnTransferUndoTx, parseConciliarHumanOwnTransferSource, undoConciliarHumanOwnTransferTx } from './conciliar-human-own-transfer'
import { ConciliarDbError, conciliarDbErrorResponse, movementPartyAliases, payrollPeriodMatches, readConciliarProjectionTx, readConciliarRowForAction, readConciliarRowForReviewPreflight, restoreLiveBankFeeProjectionBatchTx, unresolvedMovements } from './conciliar-db'
import { refreshAffectedConciliarProjectionTx } from './conciliar-affected-refresh'
import { materializeConciliarReadMetadataTx, rebuildConciliarProjectionTx } from './conciliar-db'
import { knownBankFeeUndoMovements } from './conciliar-fee-undo'
import { conciliarDocumentSourceGuardMessage, lockConciliarDocumentSourceForConfirmationTx, supportsConciliarDocumentSourceGuard } from './conciliar-document-source-guard'
import { Area3ReviewConfirmDbError, confirmArea3ReviewTx, preflightArea3ReviewConfirmTx } from './area3-review-confirm-db'
import { trustedImpersonationContextResolutionFromRequest } from '@/lib/impersonation-context'
import {
  assertConciliarRecoveryIntentExecutableTx,
  commitConciliarRecoveryIntentTx,
  prepareConciliarRecoveryIntent,
  resolveConciliarRecoveryIdentity,
  type ConciliarRecoveryWriteContext,
} from './conciliar-recovery'

type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx

export class ConciliarActionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}
const fail = (status: number, code: string, message: string): never => { throw new ConciliarActionError(status, code, message) }

const SERIALIZABLE_P2034_RETRY_DELAYS_MS = [25, 50] as const
type SerializableRetryDelay = (milliseconds: number) => Promise<void>

const waitForSerializableRetry: SerializableRetryDelay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function isRetryableSerializableP2034(error: unknown): boolean {
  if (
    error instanceof ConciliarRuntimeError ||
    error instanceof ConciliarActionError ||
    error instanceof ConciliarDbError ||
    error instanceof B4ServiceError ||
    error instanceof EasyReconciliationServiceError ||
    error instanceof EasyCollectionsServiceError ||
    error instanceof ConciliarConfirmingServiceError ||
    error instanceof Area3ReviewConfirmDbError
  ) return false
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
}

/** Replays only a Prisma-rolled-back SERIALIZABLE transaction; callers keep
 * validation, ACL checks and all non-transactional work outside this callback. */
export async function retryConciliarSerializableP2034<T>(transaction: () => Promise<T>, delay: SerializableRetryDelay = waitForSerializableRetry, onRollback?: (retrying: boolean) => void): Promise<T> {
  for (let retry = 0; ; retry += 1) {
    try {
      return await transaction()
    } catch (error) {
      if (!isRetryableSerializableP2034(error) || retry >= SERIALIZABLE_P2034_RETRY_DELAYS_MS.length) throw error
      onRollback?.(true)
      await delay(SERIALIZABLE_P2034_RETRY_DELAYS_MS[retry])
    }
  }
}

function json(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} } catch { return {} }
  return {}
}
function uuidKey(namespace: string, operationId: string, rowId: string): string {
  return derivedUuidV4(namespace, `${operationId}:${rowId}`)
}
function b4Version(value: unknown): number {
  const parsed = safeInteger(value)
  if (parsed === null || parsed < 1 || parsed > 2_147_483_647) fail(409, 'VERSION_OBSOLETA', 'La decisión ya no conserva una versión válida; actualiza la lista.')
  return parsed
}
function requireMovement(source: ConciliarProjectionSource): string {
  if (!source.movimientoId) fail(409, 'FILA_SIN_MOVIMIENTO', 'Esta fila no tiene un movimiento bancario que confirmar.')
  return source.movimientoId
}
function receiptSourceFields(source: ConciliarProjectionSource): Readonly<{ remesaId: number; compositionHash: string }> | null {
  // These persisted source fields are supplied by the parent-owned projection
  // contract/reader. Absence is deliberately not reconstructed from the browser.
  const row = source as ConciliarProjectionSource & { remesaId?: unknown; proposalCompositionHash?: unknown }
  return Number.isSafeInteger(row.remesaId) && Number(row.remesaId) > 0
    && typeof row.proposalCompositionHash === 'string' && /^[a-f0-9]{64}$/.test(row.proposalCompositionHash)
    ? { remesaId: Number(row.remesaId), compositionHash: row.proposalCompositionHash }
    : null
}
function isVersionedRemittanceSource(source: ConciliarProjectionSource): boolean {
  return source.kind === 'COBRO_PROPUESTA' && receiptSourceFields(source) !== null
}

type ConciliarHistoryActors = Readonly<{
  actorRealId: number
  actorEffectiveId: number
}>
type ConciliarHistoryActorSnapshot = Readonly<{
  actorRealDisplay: string
  actorEffectiveDisplay: string
}>

/** El actor real/efectivo sólo procede del contexto firmado; nunca se infiere
 * por proximidad temporal de registros de actuación. */
async function conciliarHistoryActors(actorId: number): Promise<ConciliarHistoryActors> {
  const context = await trustedImpersonationContextResolutionFromRequest()
  if (context.status === 'invalid' || (context.status === 'valid' && context.context.targetId !== actorId)) {
    fail(403, 'CONTEXTO_ACTUACION_CONCILIAR_INVALIDO', 'La identidad efectiva no coincide con el contexto firmado de actuación.')
  }
  return {
    actorRealId: context.status === 'valid' ? context.context.actorId : actorId,
    actorEffectiveId: actorId,
  }
}

async function conciliarHistoryActorSnapshot(tx: Tx, actors: ConciliarHistoryActors): Promise<ConciliarHistoryActorSnapshot> {
  const rows = await tx.$queryRaw<Array<{ id: number; nombre: string }>>(Prisma.sql`
    SELECT id,nombre FROM usuarios_admin
    WHERE id IN (${actors.actorRealId},${actors.actorEffectiveId})
    ORDER BY id ASC LIMIT 2
  `)
  const names = new Map(rows.map(row => [row.id, typeof row.nombre === 'string' ? row.nombre.trim().slice(0, 240) : '']))
  const actorEffectiveDisplay = names.get(actors.actorEffectiveId)
  const actorRealDisplay = names.get(actors.actorRealId)
  if (!actorEffectiveDisplay || !actorRealDisplay) {
    fail(503, 'AUDITORIA_ACTOR_NO_DISPONIBLE', 'No se pudo conservar la identidad de la confirmación.')
  }
  return { actorRealDisplay, actorEffectiveDisplay }
}

/** Snapshot de presentación al confirmar. La lectura histórica nunca recompone
 * evidencia desde fuentes financieras actuales. */
function conciliarHistoryLegSnapshot(row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  return {
    schema: 'CONCILIAR_CONFIRMACION_PATA_V1',
    fecha: row.fecha,
    concepto: row.concepto.slice(0, 500),
    importeCentimos: row.importeCentimos,
    documento: row.documento?.referencia?.slice(0, 300) ?? null,
  }
}

async function projectionStateAtActionStart(tx: Tx): Promise<{ wasDirty: boolean }> {
  const rows = await tx.$queryRaw<Array<{ dirtyAt: Date | null }>>(Prisma.sql`
    SELECT dirty_at AS "dirtyAt" FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1 FOR UPDATE
  `)
  if (!rows.length) fail(503, 'CONCILIAR_MIGRATION_PENDING', 'La proyección de Conciliar aún no está preparada.')
  // El trigger B4 marca esta misma fila dirty. FOR UPDATE se toma antes de
  // tocar fuentes para que dos acciones no retengan FOR SHARE y después ambas
  // intenten escalar a exclusivo al disparar el trigger. Las mutaciones ajenas
  // posteriores esperan y dejan dirty al terminar; una marca previa se conserva.
  const pending = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS total FROM area3_conciliar_projection_changes LIMIT 1`)
  return { wasDirty: rows[0].dirtyAt !== null || pending.length !== 1 || Number(pending[0].total) > 0 }
}

/**
 * Confirmar una comisión sólo elimina su fila: no modifica ninguna factura,
 * propuesta, nómina ni fila derivada. Si la foto estaba limpia al comenzar y
 * las únicas patas son comisiones, la retirada anterior deja una proyección
 * exacta en el mismo commit. Limpiar la marca evita reconstruir ~6k filas para
 * ese caso acotado. Una foto que ya venía dirty nunca se declara limpia aquí.
 */
async function settleKnownFeeOnlyProjection(tx: Tx, stateAtStart: { wasDirty: boolean }, kinds: ReadonlySet<ConciliarProjectionSource['kind']>, movementIds: readonly string[]): Promise<boolean> {
  if (stateAtStart.wasDirty || kinds.size !== 1 || !kinds.has('COMISION_BANCARIA')) return false
  const updated = await tx.$queryRaw<Array<{ projectionVersion: bigint | number }>>(Prisma.sql`
    UPDATE estado_proyeccion_conciliar
       SET dirty_at=NULL,dirty_reason=NULL,rebuilt_at=CURRENT_TIMESTAMP,projection_version=projection_version+1
     WHERE singleton=true AND dirty_at IS NOT NULL
     RETURNING projection_version AS "projectionVersion"
  `)
  // All B4 changes are trigger-invalidated. An empty result is still safe: it
  // means no dirty marker remains; this path never clears a pre-existing one.
  if (updated.length === 1) await tx.$executeRaw(Prisma.sql`DELETE FROM area3_conciliar_projection_changes WHERE kind='MOVEMENT' AND source_id IN (${Prisma.join(movementIds)})`)
  return updated.length === 1
}

/**
 * Undo may restore only the exact local dependency closed by a homogeneous,
 * clean fee receipt (one to one hundred B4 legs). The receipt must carry the
 * persisted source kind added by this version; older/mixed receipts deliberately
 * retain the dirty/full-rebuild path.
 */
async function restoreKnownFeeOnlyProjection(tx: Tx, stateAtStart: { wasDirty: boolean }, legs: readonly {
  movimientoId: string | null; operationB4Id: string | null; actionB5: string | null; proposalBlockId: string | null; result: unknown
}[]): Promise<boolean> {
  const movementIds = knownBankFeeUndoMovements({ wasDirty: stateAtStart.wasDirty, legs })
  if (!movementIds || !await restoreLiveBankFeeProjectionBatchTx(tx, movementIds)) return false
  return settleKnownFeeOnlyProjection(tx, stateAtStart, new Set<ConciliarProjectionSource['kind']>(['COMISION_BANCARIA']), movementIds)
}

/** A response view is read only after the projection DML of this exact action.
 * It is deliberately returned to HTTP but not persisted in operaciones_conciliar:
 * a later idempotency replay must never restore stale rows/hashes to a browser. */
async function responseProjection(tx: Tx, responseView: import('./conciliar-contract').ConciliarResponseView | undefined, projectionSynchronized: boolean) {
  if (!responseView || !projectionSynchronized) return undefined
  return readConciliarProjectionTx(tx, responseView)
}

async function lockOperationOrReplay(tx: Tx, actorId: number, action: 'CONFIRMAR' | 'PEDIR' | 'DESHACER', idempotencyKey: string, requestHash: string, parentId?: string): Promise<{ replay: true; id: string; result: Record<string, unknown> } | { replay: false; id: string }> {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conciliar:${actorId}:${idempotencyKey}`},0))::text AS locked`)
  const existing = await tx.$queryRaw<Array<{ id: string; requestHash: string; result: unknown }>>(Prisma.sql`
    SELECT id::text,request_hash AS "requestHash",resultado AS result
    FROM operaciones_conciliar WHERE actor_id=${actorId} AND idempotency_key=CAST(${idempotencyKey} AS uuid)
    LIMIT 1 FOR UPDATE
  `)
  if (existing[0]) {
    if (existing[0].requestHash !== requestHash) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia pertenece a otra solicitud.')
    return { replay: true, id: existing[0].id, result: json(existing[0].result) }
  }
  const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO operaciones_conciliar(actor_id,accion,estado,idempotency_key,request_hash,operacion_padre_id,resultado,created_at)
    VALUES(${actorId},CAST(${action} AS "AccionOperacionConciliar"),'APLICADA'::"EstadoOperacionConciliar",CAST(${idempotencyKey} AS uuid),${requestHash},${parentId ? Prisma.sql`CAST(${parentId} AS uuid)` : Prisma.sql`NULL`},'{}'::jsonb,CURRENT_TIMESTAMP)
    RETURNING id::text
  `)
  if (!inserted[0]?.id) fail(409, 'RECIBO_NO_CREADO', 'No se pudo crear el recibo de la acción.')
  return { replay: false, id: inserted[0].id }
}

async function appendLeg(tx: Tx, operationId: string, input: Readonly<{
  ordinal: number; rowId: string; movimientoId: string | null; operationB4Id?: string; actionB5?: 'PEDIDO'; proposalBlockId?: string; result: Record<string, unknown>
}>) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO patas_operacion_conciliar(operacion_conciliar_id,ordinal,fila_id,movimiento_id,operacion_b4_id,accion_b5,bloque_propuesta_cobro_id,resultado,created_at)
    VALUES(CAST(${operationId} AS uuid),${input.ordinal},${input.rowId},${input.movimientoId},
      ${input.operationB4Id ? Prisma.sql`CAST(${input.operationB4Id} AS uuid)` : Prisma.sql`NULL`},
      ${input.actionB5 ? input.actionB5 : Prisma.sql`NULL`},
      ${input.proposalBlockId ? Prisma.sql`CAST(${input.proposalBlockId} AS uuid)` : Prisma.sql`NULL`},
      CAST(${JSON.stringify(input.result)} AS jsonb),CURRENT_TIMESTAMP)
  `)
}
async function appendLegs(tx: Tx, operationId: string, inputs: readonly Readonly<{
  ordinal: number; rowId: string; movimientoId: string | null; operationB4Id?: string; actionB5?: 'PEDIDO'; proposalBlockId?: string; result: Record<string, unknown>
}>[]) {
  if (!inputs.length) return
  const values = inputs.map(input => Prisma.sql`(
    CAST(${operationId} AS uuid),${input.ordinal},${input.rowId},${input.movimientoId},
    ${input.operationB4Id ? Prisma.sql`CAST(${input.operationB4Id} AS uuid)` : Prisma.sql`NULL`},
    ${input.actionB5 ? input.actionB5 : Prisma.sql`NULL`},
    ${input.proposalBlockId ? Prisma.sql`CAST(${input.proposalBlockId} AS uuid)` : Prisma.sql`NULL`},
    CAST(${JSON.stringify(input.result)} AS jsonb),CURRENT_TIMESTAMP
  )`)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO patas_operacion_conciliar(operacion_conciliar_id,ordinal,fila_id,movimiento_id,operacion_b4_id,accion_b5,bloque_propuesta_cobro_id,resultado,created_at)
    VALUES ${Prisma.join(values)}
  `)
}
async function complete(tx: Tx, operationId: string, state: 'APLICADA' | 'PARCIAL' | 'REVERTIDA', result: Record<string, unknown>, reverted = false) {
  await tx.$executeRaw(Prisma.sql`
    UPDATE operaciones_conciliar SET estado=CAST(${state} AS "EstadoOperacionConciliar"),resultado=CAST(${JSON.stringify(result)} AS jsonb),revertida_at=${reverted ? Prisma.sql`CURRENT_TIMESTAMP` : Prisma.sql`NULL`}
    WHERE id=CAST(${operationId} AS uuid)
  `)
}
function rowMustMatch(row: Awaited<ReturnType<typeof readConciliarRowForAction>>, decisionHash: string) {
  if (row.decisionHash !== decisionHash) fail(409, 'DECISION_CAMBIADA', 'Esta fila cambió desde que abriste la página. Pulsa Actualizar y vuelve a confirmar.')
  if (!row.seleccionable) fail(422, 'FILA_NO_CONFIRMABLE', row.motivo || 'Esta fila necesita revisión antes de confirmar.')
}

async function requireCurrentDocumentLifecycleForConfirmation(tx: Tx, source: ConciliarProjectionSource): Promise<void> {
  if (!supportsConciliarDocumentSourceGuard(source)) return
  const live = await lockConciliarDocumentSourceForConfirmationTx(tx, { source, expectedVersionState: source.documentLifecycleVersionState })
  if (!live.elegible) fail(409, live.codigo, conciliarDocumentSourceGuardMessage(live.codigo))
}

async function confirmBankFee(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movementId = requireMovement(row.source)
  const source = await preflightConciliarBankFeeTx(tx,row,true)
  const result: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_FEE', operationId, row.id), version: Number(source.version),
    borrador: { movimientoId: movementId, importeMovimientoCentimos: Number(source.amount), estado: 'NO_REQUIERE', motivoNoRequiere: 'COMISION_BANCARIA', lineas: [] },
  })
  if (result.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La decisión ya existe fuera del recibo de Conciliar; actualiza la lista.')
  return { operationB4Id: String(result.operacion.id), result: { state: 'confirmada', movimientoId: movementId, operationB4Id: String(result.operacion.id) } }
}
async function confirmReceivedInvoice(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movementId = requireMovement(row.source)
  const current = await preflightConciliarReceivedInvoiceTx(tx,row,true)
  const confirmed: any = await confirmEasyReconciliationTx(tx, actorId, {
    action: 'confirmar_factura', movimientoId: movementId, version: b4Version(row.source.versionB4), sugerenciaId: current.suggestion.id,
    idempotencyKey: uuidKey('CONCILIAR_RECEIVED', operationId, row.id), confirmacion: true,
  })
  return { operationB4Id: String(confirmed.operacionId), result: { state: 'confirmada', movimientoId: movementId, operationB4Id: String(confirmed.operacionId) } }
}

/** PAGO_TICKET_B5 does not create a second Gasto or wrapper. It only delegates
 * the final explicit B4 act to the established Modo Fácil operation after both
 * Conciliar's sealed B5 source and Modo Fácil's live exact candidate agree. */
async function confirmB5Ticket(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movimientoId = requireMovement(row.source)
  const {current,live} = await preflightConciliarB5TicketTx(tx,row,true)
  const confirmed: any = await confirmEasyReconciliationTx(tx, actorId, {
    action: 'confirmar_factura', movimientoId, version: b4Version(row.source.versionB4), sugerenciaId: current.suggestion.id,
    idempotencyKey: uuidKey('CONCILIAR_TICKET_B5', operationId, row.id), confirmacion: true,
  })
  return {
    operationB4Id: String(confirmed.operacionId),
    result: {
      state: 'confirmada', movimientoId, operationB4Id: String(confirmed.operacionId),
      b5: { adjuntoB5Id: live.adjuntoB5Id, gastoId: live.gastoId, documentoConciliableId: live.documentoConciliableId },
    },
  }
}

async function confirmPayroll(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movementId = requireMovement(row.source), nominaId = row.source.nominaId!
  const source = await preflightConciliarPayrollTx(tx,row,true)
  const wrapper: any = await createDocumentoB4Tx(tx, actorId, { action: 'documento', tipoDocumento: 'NOMINA', sourceId: nominaId })
  const confirmed: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_PAYROLL', operationId, row.id), version: Number(source.version),
    borrador: { movimientoId: movementId, importeMovimientoCentimos: Number(source.amount), estado: 'JUSTIFICADO', lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: wrapper.documento.id, importeCentimos: Number(source.amount) }] },
  })
  if (confirmed.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La decisión ya existe fuera del recibo de Conciliar; actualiza la lista.')
  return { operationB4Id: String(confirmed.operacion.id), result: { state: 'confirmada', movimientoId: movementId, operationB4Id: String(confirmed.operacion.id) } }
}
function exactCents(text: string): number | null {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null
  const negative = text.startsWith('-'), [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.')
  const parsed = Number(BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2)))
  return Number.isSafeInteger(parsed) ? negative ? -parsed : parsed : null
}
function controlledPayrollItem(value: unknown): boolean {
  return typeof value === 'string' && /^\/api\/admin\/nominas\/download\/[A-Za-z0-9!_.~-]{4,220}$/.test(value)
}

async function confirmCollectionProposal(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const source = row.source
  if (!source.propuestaId || !source.movimientoId || !source.proposalFingerprint) fail(409, 'DECISION_CAMBIADA', 'La propuesta de cobro ya no está completa. Actualiza la lista.')
  await assertLiveCollectionProjectionForActionTx(tx,row)
  const selection = { propuestaId: source.propuestaId, movimientoId: source.movimientoId, fingerprint: source.proposalFingerprint }
  const receiptSource = receiptSourceFields(source)
  if (receiptSource) {
    const receiptKey = uuidKey('CONCILIAR_COLLECTION', operationId, row.id)
    const requestHash = conciliarRequestHash(actorId, {
      action: 'confirmar', idempotencyKey: operationId, items: [{ id: row.id, decisionHash: row.decisionHash }],
    })
    const result: any = await confirmarReciboRemesaCompuestaTx(tx, actorId, {
      selection, idempotencyKey: receiptKey, expectedCompositionHash: receiptSource.compositionHash,
      blockId: operationId, keyHash: `conciliar:${operationId}`, requestHash,
    })
    if (result?.resultado?.remesaId !== receiptSource.remesaId) {
      fail(409, 'DECISION_CAMBIADA', 'La remesa asociada cambió; actualiza la lista.')
    }
    return {
      operationB4Id: String(result.operationB4Id),
      result: {
        state: 'confirmada', movimientoId: source.movimientoId,
        reciboCobroRemesaB7Id: String(result.reciboId), remesaId: receiptSource.remesaId,
      },
    }
  }
  const result: any = await runEasyCollectionsActionTx(tx, actorId, {
    action: 'confirmar_bloque', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_COLLECTION', operationId, row.id), previewToken: signEasyCollectionsPreview(actorId, [selection]), items: [selection],
  }, { preserveSerializableP2034: true })
  return { proposalBlockId: String(result.bloqueId), result: { state: 'confirmada', movimientoId: source.movimientoId, proposalBlockId: String(result.bloqueId) } }
}

/** C11 arrives from persisted current/latest liquidation evidence. Conciliar
 * re-reads it inside the SERIALIZABLE B4 transaction, applies its nominal FI
 * lines plus the three exact deductions and appends the C11 support. It never
 * parses/downloads confirming files or fabricates a bank movement/cargo. */
async function confirmConfirming(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movementId = requireMovement(row.source), sourceHash = row.source.confirmingSourceHash!
  const candidate = await preflightConciliarConfirmingTx(tx,row,true)
  const result: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_CONFIRMING', operationId, row.id), version: b4Version(row.source.versionB4),
    borrador: {
      movimientoId: movementId, importeMovimientoCentimos: row.importeCentimos, estado: 'JUSTIFICADO',
      lineas: candidate.lineasB4.map(line => line.tipo === 'DOCUMENTO'
        ? { tipo: 'DOCUMENTO' as const, documentoConciliableId: line.documentoConciliableId!, importeCentimos: line.importeCentimos }
        : { tipo: 'DIFERENCIA' as const, motivoDiferencia: line.motivoDiferencia, importeCentimos: line.importeCentimos }),
    },
  })
  if (result.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La decisión confirming ya existe fuera del recibo de Conciliar; actualiza la lista.')
  const support = await applyDocumentedConfirmingLiquidationSupport(tx, actorId, {
    liquidacionId: candidate.liquidacionId,
    movimientoId: movementId,
    operacionB4Id: String(result.operacion.id),
    sourceHash,
    idempotencyKey: uuidKey('CONCILIAR_CONFIRMING_C11_SUPPORT', operationId, row.id),
  })
  // Conserva la clave histórica del recibo para que undoB4Leg pueda anclar el
  // wrapper de reversión sin bifurcar acciones; el UUID identifica soporte C11.
  const interestSupport = { loteId: support.resultado.soporteId, version: support.resultado.version, schema: 'C11' }
  return { operationB4Id: String(result.operacion.id), result: { state: 'confirmada', movimientoId: movementId, operationB4Id: String(result.operacion.id), interestSupport } }
}

async function applyConfirmRow(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  switch (row.source.kind) {
    case 'COBRO_PROPUESTA': return confirmCollectionProposal(tx, actorId, operationId, row)
    case 'COBRO_CONFIRMING': return confirmConfirming(tx, actorId, operationId, row)
    case 'PAGO_FACTURA_RECIBIDA': return confirmReceivedInvoice(tx, actorId, operationId, row)
    case 'PAGO_NOMINA': return confirmPayroll(tx, actorId, operationId, row)
    case 'PAGO_TICKET_B5': return confirmB5Ticket(tx, actorId, operationId, row)
    case 'COMISION_BANCARIA': return confirmBankFee(tx, actorId, operationId, row)
    case 'TRANSFERENCIA_PROPIA': return confirmConciliarTransferTx(tx, actorId, operationId, row.source, row.importeCentimos)
    case 'TRANSFERENCIA_PROPIA_MANUAL':
      fail(422, 'FILA_NO_CONFIRMABLE', 'Este traspaso está clasificado para revisión; la confirmación conserva su comprobación estricta independiente.')
    default: fail(422, 'FILA_NO_CONFIRMABLE', 'Esta fila es informativa o necesita una revisión humana.')
  }
}

async function askRow(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movementId = requireMovement(row.source)
  const lock = await tx.$queryRaw<Array<{ id: string; version: number | bigint; state: string }>>(Prisma.sql`
    SELECT m.id,COALESCE(g.version,1) AS version,COALESCE(e.estado::text,'SIN_DOCUMENTO') AS state
    FROM movimientos_bancarios m LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id=m.id
    WHERE m.id=${movementId} FOR UPDATE OF m
  `)
  const source = lock[0]
  if (!source || source.state !== 'SIN_DOCUMENTO') fail(409, 'DECISION_CAMBIADA', 'El movimiento ya tiene una decisión. Actualiza la lista.')
  const previous = await tx.$queryRaw<Array<{ id: string; version: number | bigint; estado: string; nota: string | null; responsable: number | null }>>(Prisma.sql`
    SELECT id::text,version,estado::text,nota,responsable_admin_id AS responsable FROM gestiones_pendientes_movimiento_b5 WHERE movimiento_id=${movementId} LIMIT 1 FOR UPDATE
  `)
  const before = previous[0] ? { version: Number(previous[0].version), estado: previous[0].estado, nota: previous[0].nota, responsableAdminId: previous[0].responsable } : { version: 1, estado: 'PENDIENTE', nota: null, responsableAdminId: null }
  const note = 'Pedido desde Conciliar: falta documento o justificante.'
  const version = before.version + 1
  const updated = previous[0]
    ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`UPDATE gestiones_pendientes_movimiento_b5 SET estado='PEDIDO'::"EstadoGestionPendienteB5",nota=${note},version=${version},updated_at=CURRENT_TIMESTAMP WHERE id=CAST(${previous[0].id} AS uuid) RETURNING id::text`)
    : await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO gestiones_pendientes_movimiento_b5(id,movimiento_id,responsable_admin_id,nota,estado,version,created_at,updated_at) VALUES(gen_random_uuid(),${movementId},NULL,${note},'PEDIDO'::"EstadoGestionPendienteB5",${version},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) RETURNING id::text`)
  const gestionId = updated[0]?.id
  if (!gestionId) fail(409, 'PEDIDO_NO_REGISTRADO', 'No se pudo registrar el pedido; vuelve a intentarlo.')
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO auditorias_gestiones_pendientes_b5(id,gestion_id,movimiento_id,actor_id,accion,version_anterior,version_resultante,snapshot_anterior,snapshot_resultado,created_at)
    VALUES(gen_random_uuid(),CAST(${gestionId} AS uuid),${movementId},${actorId},CAST(${previous[0] ? 'ACTUALIZACION' : 'CREACION'} AS "AccionAuditoriaGestionPendienteB5"),${before.version},${version},CAST(${JSON.stringify(before)} AS jsonb),CAST(${JSON.stringify({ responsableAdminId: null, estado: 'PEDIDO', nota: note, version })} AS jsonb),CURRENT_TIMESTAMP)
  `)
  await appendLeg(tx, operationId, { ordinal: 1, rowId: row.id, movimientoId: movementId, actionB5: 'PEDIDO', result: { state: 'pedido', movimientoId: movementId, gestionId } })
  return { state: 'pedido', movementId, gestionId }
}

async function undoB4Leg(tx: Tx, actorId: number, operationId: string, ordinal: number, leg: any, originalConciliarOperationId: string) {
  const receiptResult = json(leg.result)
  if (receiptResult.sourceKind === 'TRANSFERENCIA_PROPIA_MANUAL') {
    await lockConciliarHumanOwnTransferUndoTx(tx, receiptResult)
  }
  const operationIdB4 = leg.operationB4Id as string
  const operation = await tx.$queryRaw<Array<{ movementId: string; version: number | bigint; state: string; reverted: Date | null }>>(Prisma.sql`
    SELECT o.movimiento_id AS "movementId",o.version_resultante AS version,o.estado::text AS state,o.revertida_at AS reverted
    FROM operaciones_justificacion_b4 o WHERE o.id=CAST(${operationIdB4} AS uuid) LIMIT 1 FOR UPDATE
  `)
  const original = operation[0]
  if (!original || original.state !== 'APLICADA' || original.reverted) fail(409, 'RECIBO_CAMBIADO', 'Una de las decisiones ya cambió y no se puede deshacer de forma segura.')
  const current = await tx.$queryRaw<Array<{ version: number | bigint }>>(Prisma.sql`SELECT version FROM estado_justificacion_movimientos WHERE movimiento_id=${original.movementId} LIMIT 1 FOR UPDATE`)
  const active = await tx.$queryRaw<Array<{ id: string; amount: number | bigint }>>(Prisma.sql`SELECT id::text,importe_centimos AS amount FROM vinculos_movimiento_documento WHERE operacion_creacion_id=CAST(${operationIdB4} AS uuid) AND activo=true ORDER BY id ASC`)
  if (!current[0] || Number(current[0].version) !== Number(original.version)) fail(409, 'RECIBO_CAMBIADO', 'El movimiento fue modificado después de confirmar. Actualiza la lista.')
  const priorResult = receiptResult
  if (priorResult.sourceKind === 'TRANSFERENCIA_PROPIA_MANUAL') {
    await assertConciliarHumanOwnTransferPrimaryUndoTx(tx, actorId, priorResult, operationIdB4)
  }
  const pairedReversal = priorResult.sourceKind === 'TRANSFERENCIA_PROPIA'
    ? await undoConciliarPairedTransferTx(tx, actorId, priorResult, operationId)
    : priorResult.sourceKind === 'TRANSFERENCIA_PROPIA_MANUAL'
      ? await undoConciliarHumanOwnTransferTx(tx, actorId, priorResult, operationId)
      : null
  const reversal: any = await deshacerB4Tx(tx, actorId, {
    action: 'deshacer', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_UNDO', operationId, leg.rowId), version: Number(current[0].version), operacionId: operationIdB4,
    lineas: active.map(line => ({ id: line.id, importeCentimos: Number(line.amount) })),
  })
  if (reversal.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La reversión ya existe fuera del recibo de Conciliar.')
  const review = json(priorResult.review)
  if (review.schema === 'AREA3_REVIEW_APPROVED_V1'
    && typeof review.motivo === 'string'
    && typeof review.sourceHash === 'string'
    && /^[a-f0-9]{64}$/.test(review.sourceHash)
    && typeof review.decisionHash === 'string'
    && /^[a-f0-9]{64}$/.test(review.decisionHash)) {
    // El recibo de revisión no se modifica: su reversión queda como evento B4
    // separado, ligado a la operación de reversión completa e irreversible.
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO eventos_justificacion_b4(id,operacion_id,movimiento_id,accion,actor_id,detalle,created_at)
      VALUES(CAST(${uuidKey('AREA3_REVIEW_UNDO_EVENT', operationId, leg.rowId)} AS uuid),CAST(${String(reversal.operacion.id)} AS uuid),${original.movementId},'REVERSION'::"AccionEventoJustificacionB4",${actorId},
        CAST(${JSON.stringify({
          schema: 'AREA3_REVIEW_UNDO_V1',
          originalOperationB4Id: operationIdB4,
          originalConciliarOperationId,
          reversalConciliarOperationId: operationId,
          motivo: review.motivo,
          sourceHash: review.sourceHash,
          decisionHash: review.decisionHash,
          fullUndo: true,
        })} AS jsonb),CURRENT_TIMESTAMP)
    `)
  }
  const support = json(priorResult.interestSupport)
  if (typeof support.loteId === 'string' && typeof support.version === 'number' && Number.isSafeInteger(support.version) && support.version > 0) {
    await undoDocumentedConfirmingInterestSupport(tx, actorId, {
      action: 'deshacer', loteId: support.loteId, version: support.version,
      motivo: 'Reversión de la conciliación confirming original.', idempotencyKey: uuidKey('CONCILIAR_CONFIRMING_INTEREST_UNDO', operationId, leg.rowId),
    })
  }
  await appendLeg(tx, operationId, { ordinal, rowId: leg.rowId, movimientoId: original.movementId, operationB4Id: String(reversal.operacion.id), result: { state: 'deshecha', originalOperationB4Id: operationIdB4, operationB4Id: String(reversal.operacion.id), ...(pairedReversal ?? {}) } })
}

async function undoCollectionLeg(tx: Tx, actorId: number, operationId: string, ordinal: number, leg: any) {
  const result: any = await runEasyCollectionsActionTx(tx, actorId, {
    action: 'deshacer_bloque', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_COLLECTION_UNDO', operationId, leg.rowId), bloqueId: leg.proposalBlockId,
  }, { preserveSerializableP2034: true })
  await appendLeg(tx, operationId, { ordinal, rowId: leg.rowId, movimientoId: leg.movimientoId ?? null, proposalBlockId: String(result.bloqueId), result: { state: 'deshecha', proposalBlockId: String(result.bloqueId) } })
}

async function requireLiveWrite(actorId: number, database: Tx) {
  await assertConciliarRuntime(database)
  const access = await requireB4ActorAccess(actorId, 'escritura', database)
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'Tu permiso para conciliar ya no está vigente.')
}

async function confirmStandard(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'confirmar'; items: readonly unknown[] }>, actors: ConciliarHistoryActors, onProgress?: (event: ConciliarBatchProgress) => void) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'CONFIRMAR', command.idempotencyKey, conciliarRequestHash(actorId, command))
  if (receipt.replay) return { operationId: receipt.id, recoveryReceiptOperationId: receipt.id, idempotent: true, ...receipt.result }
  const historyActors = await conciliarHistoryActorSnapshot(tx, actors)
  const stateAtStart = await projectionStateAtActionStart(tx)
  const outcomes: Array<Record<string, unknown>> = []
  const plan = await readConciliarConfirmBatchForActionTx(tx, command.items, fail)
  const selectedRows = plan.rows
  const g7PrecheckStartedAt = Date.now()
  for (const row of selectedRows) await assertConciliarGreenPrecheckTx(tx,row)
  // La puerta G7 se conserva por cada fila antes de cualquier DML. El recibo
  // mide su coste real para que staging decida si procede una prelectura
  // set-based compartida con el proveedor homogéneo de comisiones.
  const g7PrecheckTelemetry = {
    schema: 'CONCILIAR_G7_PRECHECK_TELEMETRY_V1',
    selectedRows: selectedRows.length,
    elapsedMs: Date.now() - g7PrecheckStartedAt,
    mode: plan.onlyBankFees ? 'COMISIONES_HOMOGENEAS_POR_FILA' : 'MIXTO_POR_FILA',
  } as const
  const legs: Array<{
    ordinal: number; rowId: string; movimientoId: string | null; operationB4Id?: string; proposalBlockId?: string; result: Record<string, unknown>
  }> = []

  // The reviewed set-based provider is limited to homogeneous bank fees;
  // heterogeneous batches retain their exact existing domain services.
  const feeResults = plan.onlyBankFees
    ? await tryConfirmConciliarBankFeeBatchTx(tx, actorId, {
      action: 'confirmar_comisiones_conciliar_lote', operationId: receipt.id,
      items: selectedRows.map(row => ({
        rowId: row.id, movimientoId: requireMovement(row.source), version: b4Version(row.source.versionB4),
        importeMovimientoCentimos: row.importeCentimos, idempotencyKey: uuidKey('CONCILIAR_FEE', receipt.id, row.id),
      })),
    })
    : null
  const feeByRowId = feeResults ? new Map(feeResults.map(item => [item.rowId, item])) : null

  for (let index = 0; index < selectedRows.length; index += 1) {
    const row = selectedRows[index]
    const movementId = requireMovement(row.source)
    const fee = feeByRowId?.get(row.id)
    const result = fee
      ? { operationB4Id: fee.operationB4Id, result: { state: 'confirmada', movimientoId: movementId, operationB4Id: fee.operationB4Id } }
      : await applyConfirmRow(tx, actorId, receipt.id, row)
    // A non-null fee provider has performed P1 itself in the same transaction.
    // Re-running the normal helper here would reintroduce one ACL/material read
    // per row and could create a second decision. Its receipt remains attached to
    // this leg for the established fail-closed undo path.
    const counterparty = fee
      ? null
      : await assignConciliarDocumentaryCounterpartyTx(tx, { actorId, operationId: receipt.id, movementId, importeCentimos: row.importeCentimos, source: row.source })
    const detail = {
      ...result.result,
      sourceKind: row.source.kind,
      presentation: conciliarHistoryLegSnapshot(row),
      ...(fee?.counterpartyReceipt ? { counterpartyReceipt: fee.counterpartyReceipt } : {}),
      ...(counterparty?.assigned ? { counterpartyReceipt: counterparty.receipt } : {}),
    }
    legs.push({ ordinal: index + 1, rowId: row.id, movimientoId: row.movimientoId, operationB4Id: 'operationB4Id' in result ? result.operationB4Id : undefined, proposalBlockId: 'proposalBlockId' in result ? result.proposalBlockId : undefined, result: detail })
    outcomes.push({ id: row.id, ok: true, code: 'HECHO', message: 'Hecho. Puedes deshacer esta confirmación.', operationId: receipt.id })
    // This is explicitly provisional: B4/P1 DML is still in the same uncommitted
    // SERIALIZABLE transaction. The route never emits outcomes before COMMIT.
    onProgress?.({ kind: 'row-applied', completed: index + 1, total: selectedRows.length, rowId: row.id })
  }
  await appendLegs(tx, receipt.id, legs)
  // Retirada mínima en una sola DML después de registrar todas las patas. El
  // recálculo documental posterior conserva sus propios bloqueos.
  await deleteConciliarBatchProjectionRowsTx(tx, plan.movementIds)
  let projectionSynchronized = await settleKnownFeeOnlyProjection(tx, stateAtStart, plan.kinds, plan.movementIds)
  const result = {
    ok: true, outcomes, applied: command.items.length, failed: 0, reversible: true, projectionSynchronized,
    history: { schema: 'CONCILIAR_HISTORIAL_V1', ...actors, ...historyActors },
    g7PrecheckTelemetry,
    refreshedAt: new Date().toISOString(),
  }
  await complete(tx, receipt.id, 'APLICADA', result)
  return { operationId: receipt.id, recoveryReceiptOperationId: receipt.id, idempotent: false, ...result }
}

/**
 * Ruta humana explícita, distinta de confirmar: cada item representa una pareja
 * sellada y sólo el servidor deriva su otra pata, importes, titularidad y B4.
 * Mantiene `seleccionable:false`, por lo que el lote ordinario nunca la absorbe.
 */
async function confirmHumanOwnTransfers(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'confirmar_traspasos_propios_manual' }>, actors: ConciliarHistoryActors) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'CONFIRMAR', command.idempotencyKey, conciliarRequestHash(actorId, command))
  if (receipt.replay) return { operationId: receipt.id, recoveryReceiptOperationId: receipt.id, idempotent: true, ...receipt.result }
  const historyActors = await conciliarHistoryActorSnapshot(tx, actors)
  const pairStateAtStart = await projectionStateAtActionStart(tx)
  const pairs = new Map<string, {
    inputs: Array<{ row: Awaited<ReturnType<typeof readConciliarRowForAction>>; source: NonNullable<ReturnType<typeof parseConciliarHumanOwnTransferSource>> }>
  }>()
  const movementIds = new Set<string>()
  for (const item of command.items) {
    const row = await readConciliarRowForAction(tx, item.id)
    if (row.decisionHash !== item.decisionHash) {
      fail(409, 'DECISION_CAMBIADA', 'Esta pareja cambió desde que abriste la página. Pulsa Actualizar y vuelve a confirmar.')
    }
    await assertConciliarGreenPrecheckTx(tx,row)
    const action = humanOwnTransferActionForProjection({ color: row.color, seleccionable: row.seleccionable, grupo: row.grupo, source: row.source })
    const source = parseConciliarHumanOwnTransferSource(row.source)
    // El id de proyección sólo selecciona su pata sellada. Nunca se acepta una
    // fuente de otra fila, aunque comparta una pareja o un hash válido.
    if (!action || !source || row.movimientoId !== source.movimientoId) {
      fail(422, 'PAREJA_NO_CONFIRMABLE', 'Esta fila ya no permite confirmar una pareja propia. Actualiza la lista.')
    }
    const existing = pairs.get(action.pairId)
    if (existing) {
      const first = existing.inputs[0]!.source
      // Las dos filas de la misma pareja se deduplican, no se ejecutan dos B4
      // veces. Cualquier supuesta segunda pata debe ser exactamente recíproca.
      if (first.movimientoId !== source.movimientoParId || first.movimientoParId !== source.movimientoId
        || first.proofSource !== source.proofSource || movementIds.has(source.movimientoId) === false || movementIds.has(source.movimientoParId) === false) {
        fail(422, 'PAREJA_REPETIDA', 'Las patas seleccionadas no conservan la misma pareja propia sellada. Actualiza la lista.')
      }
      existing.inputs.push({ row, source })
      continue
    }
    if (movementIds.has(source.movimientoId) || movementIds.has(source.movimientoParId)) {
      fail(422, 'MOVIMIENTO_REPETIDO', 'La selección mezcla movimientos de parejas propias distintas.')
    }
    pairs.set(action.pairId, { inputs: [{ row, source }] })
    movementIds.add(source.movimientoId)
    movementIds.add(source.movimientoParId)
  }
  if (pairs.size < 1 || pairs.size > 20) {
    fail(400, 'VALIDATION_ERROR', 'Selecciona entre una y veinte parejas propias.')
  }

  const legs: Array<{ ordinal: number; rowId: string; movimientoId: string | null; operationB4Id: string; result: Record<string, unknown> }> = []
  const outcomes: Array<Record<string, unknown>> = []
  await withConciliarHumanOwnTransferBatchTx(tx, async () => {
  for (const [index, [, pair]] of [...pairs.entries()].sort(([left], [right]) => left.localeCompare(right)).entries()) {
    // El selector de menor movimiento sólo hace estable el recibo. El motor
    // vuelve a normalizar sobre las filas bloqueadas, sin confiar en este orden.
    const selected = pair.inputs.slice().sort((left, right) => left.source.movimientoId.localeCompare(right.source.movimientoId) || left.row.id.localeCompare(right.row.id))[0]!
    const result = await confirmConciliarHumanOwnTransferTx(tx, actorId, receipt.id, selected.source, selected.row.importeCentimos)
    legs.push({ ordinal: index + 1, rowId: selected.row.id, movimientoId: result.result.primaryMovementId, operationB4Id: result.operationB4Id, result: result.result })
    for (const input of pair.inputs) {
      outcomes.push({ id: input.row.id, ok: true, code: 'PAREJA_CONFIRMADA', message: 'Pareja propia confirmada. Puedes deshacer la pareja completa.', operationId: receipt.id })
    }
  }
  })
  await appendLegs(tx, receipt.id, legs)
  // Las dos patas se retiran a la vez sólo después del recibo íntegro del lote.
  await deleteConciliarBatchProjectionRowsTx(tx, [...movementIds])
  let projectionSynchronized = false
  if (!pairStateAtStart.wasDirty) {
    const otherChanges = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS total FROM area3_conciliar_projection_changes
      WHERE kind<>'MOVEMENT' OR source_id NOT IN (${Prisma.join([...movementIds])}) LIMIT 1
    `)
    if (otherChanges.length === 1 && Number(otherChanges[0].total) === 0) {
      await tx.$executeRaw(Prisma.sql`DELETE FROM area3_conciliar_projection_changes WHERE kind='MOVEMENT' AND source_id IN (${Prisma.join([...movementIds])})`)
      await tx.$executeRaw(Prisma.sql`UPDATE estado_proyeccion_conciliar SET dirty_at=NULL,dirty_reason=NULL,rebuilt_at=CURRENT_TIMESTAMP,projection_version=projection_version+1 WHERE singleton=true`)
      projectionSynchronized = true
    }
  }
  const result = {
    ok: true,
    outcomes,
    applied: pairs.size,
    failed: 0,
    reversible: true,
    confirmationMode: 'HUMANA_PAREJA_ATESTADA_V1',
    projectionSynchronized,
    // La pareja tiene dos outcomes pero una sola pata durable canónica; el
    // lector la mostrará explícitamente sin detalle antes que reconstruirla.
    history: { schema: 'CONCILIAR_HISTORIAL_V1', ...actors, ...historyActors },
    refreshedAt: new Date().toISOString(),
  }
  await complete(tx, receipt.id, 'APLICADA', result)
  return { operationId: receipt.id, recoveryReceiptOperationId: receipt.id, idempotent: false, ...result }
}

/** Sólo lectura: aplica el mismo núcleo G7 que REVIEW_CONFIRM, sin recibo,
 * auditoría, B4, refresh ni cambio de proyección. */
async function previewArea3Review(tx: Tx, command: Extract<ConciliarCommand, { action: 'confirmar'; review: { kind: 'REVIEW_PREVIEW' } }>) {
  const row = await readConciliarRowForReviewPreflight(tx, command.review.id)
  if (row.decisionHash !== command.review.decisionHash) fail(409, 'DECISION_CAMBIADA', 'La propuesta cambió desde que abriste la página. Actualiza y vuelve a revisar.')
  const preview = await preflightArea3ReviewConfirmTx(tx, row)
  const decision = preview.decision
  if (decision.ok !== false) return fail(409, 'REVISION_AREA3_INESPERADA', 'La propuesta requiere reconocer la advertencia vigente antes de confirmar.')
  return {
    ok: decision.codigo === 'ACK_REQUERIDO',
    reviewPreview: {
      id: row.id,
      decisionHash: row.decisionHash,
      color: decision.color,
      puedeConfirmarRevision: decision.codigo === 'ACK_REQUERIDO',
      confirmableGreen: false,
      codigo: decision.codigo,
      mensaje: decision.mensaje,
      sourceHash: decision.sourceHash,
      acknowledgement: decision.codigo === 'ACK_REQUERIDO' ? {
        schema: 'AREA3_REVIEW_ACK_V1', version: '2026-10-30', motivo: row.source.providerReviewReason, sourceHash: decision.sourceHash,
      } : null,
    },
  }
}

/** REVIEW_CONFIRM nunca entra en `confirmStandard`: es una sola fila ÁMBAR,
 * su ACK queda dentro de la pata reversible y B4 conserva su undo real. */
async function confirmArea3Review(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'confirmar'; review: { kind: 'REVIEW_CONFIRM' } }>, actors: ConciliarHistoryActors) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'CONFIRMAR', command.idempotencyKey, conciliarRequestHash(actorId, command))
  if (receipt.replay) return { operationId: receipt.id, recoveryReceiptOperationId: receipt.id, idempotent: true, ...receipt.result }
  const historyActors = await conciliarHistoryActorSnapshot(tx, actors)
  const stateAtStart = await projectionStateAtActionStart(tx)
  const row = await readConciliarRowForAction(tx, command.review.id)
  if (row.decisionHash !== command.review.decisionHash) fail(409, 'DECISION_CAMBIADA', 'La propuesta cambió desde que abriste la página. Actualiza y vuelve a revisar.')
  await requireCurrentDocumentLifecycleForConfirmation(tx, row.source)
  const applied = await confirmArea3ReviewTx(tx, actorId, receipt.id, row, command.review.acknowledgement)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO eventos_justificacion_b4(id,operacion_id,movimiento_id,accion,actor_id,detalle,created_at)
    VALUES(CAST(${uuidKey('AREA3_REVIEW_CONFIRM_EVENT', receipt.id, row.id)} AS uuid),CAST(${applied.operationB4Id} AS uuid),${applied.result.movimientoId},'APROBACION'::"AccionEventoJustificacionB4",${actorId},
      CAST(${JSON.stringify({
        schema: 'AREA3_REVIEW_CONFIRM_AUDIT_V1',
        conciliarOperationId: receipt.id,
        rowId: row.id,
        actorId,
        approverId: actorId,
        acknowledgement: command.review.acknowledgement,
        review: applied.result.review,
        // La decisión durable proviene del mismo preflight bloqueado que B4
        // acaba de confirmar; la auditoría conserva también su procedencia.
        documentEvidenceKind: applied.result.review.documentEvidenceKind,
        documentVersionHash: applied.result.review.documentVersionHash,
        versionB4: applied.result.review.versionB4,
        amountLineCentimos: applied.result.review.importeLineaCentimos,
        documentNetBeforeCentimos: applied.result.review.netoDocumentoPrevioCentimos,
        documentNetAfterCentimos: applied.result.review.netoDocumentoResultanteCentimos,
        fullMovementClosure: true,
        remainderCentimos: 0,
      })} AS jsonb),CURRENT_TIMESTAMP)
  `)
  await appendLeg(tx, receipt.id, {
    ordinal: 1, rowId: row.id, movimientoId: row.movimientoId, operationB4Id: applied.operationB4Id,
    result: { ...applied.result, presentation: conciliarHistoryLegSnapshot(row) },
  })
  // Sólo se retira la fila afectada. El trigger B4 deja el resto marcado como
  // pendiente; la lectura/búsqueda posterior no recalcula finanzas.
  await deleteConciliarBatchProjectionRowsTx(tx, [applied.result.movimientoId])
  const result = {
    ok: true,
    outcomes: [{ id: row.id, ok: true, code: 'REVIEW_APPROVED', message: 'Revisión confirmada. La advertencia queda registrada y puedes deshacer esta confirmación.', operationId: receipt.id }],
    applied: 1, failed: 0, reversible: true, projectionSynchronized: false,
    refreshScope: 'AFECTADA_PENDIENTE',
    history: { schema: 'CONCILIAR_HISTORIAL_V1', ...actors, ...historyActors },
    refreshedAt: new Date().toISOString(),
    review: applied.result.review, projectionWasDirty: stateAtStart.wasDirty,
  }
  await complete(tx, receipt.id, 'APLICADA', result)
  return { operationId: receipt.id, recoveryReceiptOperationId: receipt.id, idempotent: false, ...result }
}

async function confirm(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'confirmar' }>, actors: ConciliarHistoryActors, onProgress?: (event: ConciliarBatchProgress) => void) {
  if ('review' in command) {
    if(command.review.kind === 'REVIEW_PREVIEW') return previewArea3Review(tx,{action:'confirmar',review:command.review})
    return confirmArea3Review(tx,actorId,{action:'confirmar',idempotencyKey:'idempotencyKey' in command ? command.idempotencyKey : fail(400,'REVIEW_CONFIRM_INVALIDA','Falta identificar la confirmación humana.'),review:command.review},actors)
  }
  return confirmStandard(tx, actorId, command, actors, onProgress)
}

async function ask(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'pedir' }>) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'PEDIR', command.idempotencyKey, conciliarRequestHash(actorId, command))
  if (receipt.replay) return { operationId: receipt.id, idempotent: true, ...receipt.result }
  const askState = await projectionStateAtActionStart(tx)
  const row = await readConciliarRowForAction(tx, command.id)
  if (row.decisionHash !== command.decisionHash) fail(409, 'DECISION_CAMBIADA', 'Esta fila cambió desde que abriste la página. Pulsa Actualizar y vuelve a pedir el documento.')
  if (row.color !== 'ROJO') fail(422, 'FILA_NO_PEDIBLE', 'Sólo se puede pedir documentación cuando realmente falta el papel.')
  const outcome = await askRow(tx, actorId, receipt.id, row)
  let projectionSynchronized = false
  // Sólo una foto que ya estaba limpia puede consumir la entrada que acaba de
  // producir PEDIR. Si había cola/dirty antes de bloquear el estado, incluso la
  // misma fila debe conservarse para el refresco afectado posterior.
  if (!askState.wasDirty) {
    const movementId = requireMovement(row.source)
    const currentRows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM conciliar_proyecciones WHERE movimiento_id=${movementId} ORDER BY id LIMIT 100`)
    await materializeConciliarReadMetadataTx(tx, currentRows.map(item => item.id))
    await tx.$executeRaw(Prisma.sql`DELETE FROM area3_conciliar_projection_changes WHERE kind='MOVEMENT' AND source_id=${movementId}`)
    const settled = await tx.$queryRaw<Array<{ projectionVersion: bigint | number }>>(Prisma.sql`
      UPDATE estado_proyeccion_conciliar
         SET dirty_at=NULL,dirty_reason=NULL,rebuilt_at=CURRENT_TIMESTAMP,projection_version=projection_version+1
       WHERE singleton=true AND NOT EXISTS (SELECT 1 FROM area3_conciliar_projection_changes)
       RETURNING projection_version AS "projectionVersion"
    `)
    projectionSynchronized = settled.length === 1
  }
  const result = { ok: true, projectionSynchronized, outcome, outcomes: [{ id: row.id, ok: true, code: 'PEDIDO', message: 'Añadido a Para pedir. No se ha enviado ningún aviso.' }], refreshedAt: new Date().toISOString() }
  await complete(tx, receipt.id, 'APLICADA', result)
  return { operationId: receipt.id, idempotent: false, ...result }
}

async function undo(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'deshacer' }>) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'DESHACER', command.idempotencyKey, conciliarRequestHash(actorId, command), command.operationId)
  if (receipt.replay) return { operationId: command.operationId, recoveryReceiptOperationId: receipt.id, idempotent: true, ...receipt.result }
  const original = await tx.$queryRaw<Array<{ id: string; actorId: number; action: string; state: string }>>(Prisma.sql`
    SELECT id::text,actor_id AS "actorId",accion::text AS action,estado::text AS state FROM operaciones_conciliar WHERE id=CAST(${command.operationId} AS uuid) LIMIT 1 FOR UPDATE
  `)
  const source = original[0]
  if (!source) fail(404, 'RECIBO_NO_ENCONTRADO', 'No se encontró la acción para deshacer.')
  if (source.actorId !== actorId) fail(403, 'RECIBO_ACTOR_DISTINTO', 'Sólo quien confirmó puede deshacer su acción.')
  if (source.action !== 'CONFIRMAR' || source.state !== 'APLICADA') fail(409, 'RECIBO_NO_REVERSIBLE', 'Esta acción ya no se puede deshacer.')
  // Capture a clean baseline under the same exclusive projection lock before
  // P1/B4 undo. Dirty from an earlier action is never cleared by this branch.
  const stateAtStart = await projectionStateAtActionStart(tx)
  const legs = await tx.$queryRaw<Array<{ ordinal: number; rowId: string; movimientoId: string | null; operationB4Id: string | null; actionB5: string | null; proposalBlockId: string | null; result: unknown }>>(Prisma.sql`
    SELECT ordinal,fila_id AS "rowId",movimiento_id AS "movimientoId",operacion_b4_id::text AS "operationB4Id",accion_b5 AS "actionB5",bloque_propuesta_cobro_id::text AS "proposalBlockId",resultado AS result
    FROM patas_operacion_conciliar WHERE operacion_conciliar_id=CAST(${source.id} AS uuid) ORDER BY ordinal ASC
  `)
  if (!legs.length || legs.some(leg => leg.actionB5 || (!leg.operationB4Id && !leg.proposalBlockId))) fail(409, 'RECIBO_NO_REVERSIBLE', 'El recibo no conserva todas las patas reversibles.')
  for (const leg of legs) {
    await undoConciliarDocumentaryCounterpartyTx(tx, actorId, json(leg.result).counterpartyReceipt)
    if (leg.proposalBlockId) await undoCollectionLeg(tx, actorId, receipt.id, leg.ordinal, leg)
    else await undoB4Leg(tx, actorId, receipt.id, leg.ordinal, leg, source.id)
  }
  await tx.$executeRaw(Prisma.sql`UPDATE operaciones_conciliar SET estado='REVERTIDA'::"EstadoOperacionConciliar",revertida_at=CURRENT_TIMESTAMP WHERE id=CAST(${source.id} AS uuid) AND estado='APLICADA'::"EstadoOperacionConciliar"`)
  const projectionSynchronized = await restoreKnownFeeOnlyProjection(tx, stateAtStart, legs)
  let synchronized = projectionSynchronized
  if (!synchronized && !stateAtStart.wasDirty && legs.every(leg => json(leg.result).sourceKind === 'TRANSFERENCIA_PROPIA_MANUAL')) {
    const movementIds = legs.flatMap(leg => {
      const result = json(leg.result)
      return [result.primaryMovementId, result.pairedMovementId].filter((id): id is string => typeof id === 'string')
    })
    const other = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS total FROM area3_conciliar_projection_changes WHERE kind<>'MOVEMENT' OR source_id NOT IN (${Prisma.join(movementIds)}) LIMIT 1`)
    if (other.length === 1 && Number(other[0].total) === 0) {
      await rebuildConciliarProjectionTx(tx, actorId, {
        movementIds, manualPairsOnly: true,
        consumedChanges: movementIds.map(sourceId => ({ kind: 'MOVEMENT' as const, sourceId })),
      })
      synchronized = true
    }
  }
  const result = { ok: true, revertedOperationId: source.id, legs: legs.length, undone: true, projectionSynchronized: synchronized, message: 'Deshecho. La confirmación original sigue conservada en el historial.', refreshedAt: new Date().toISOString() }
  await complete(tx, receipt.id, 'APLICADA', result)
  return { operationId: source.id, recoveryReceiptOperationId: receipt.id, idempotent: false, ...result }
}

/** Internal transaction seam, also exercised against a local restore with
 * mandatory rollback. The public host below always performs the same live
 * staging/access checks before opening the SERIALIZABLE transaction. All
 * business services still revalidate the effective actor inside this tx. */
export async function runConciliarTransactionCommand(tx: Tx, actorId: number, raw: unknown, actors: ConciliarHistoryActors, onProgress?: (event: ConciliarBatchProgress) => void, recoveryContext: ConciliarRecoveryWriteContext | null = null) {
  const command = parseConciliarCommand(raw)
  if (command.action === 'confirmar' && 'review' in command && command.review.kind === 'REVIEW_PREVIEW') {
    fail(409, 'REVIEW_PREVIEW_SOLO_LECTURA', 'La previsualización de revisión se ejecuta únicamente en su transacción de sólo lectura.')
  }
  // The PENDING record is durable before business DML. Re-taking the shared
  // receipt lock inside this callback prevents late replay/commit races.
  await assertConciliarRecoveryIntentExecutableTx(tx, recoveryContext)
  let result: Record<string, any>
  if (command.action === 'confirmar') result = await confirm(tx, actorId, command, actors, onProgress)
  else if (command.action === 'confirmar_traspasos_propios_manual') result = await confirmHumanOwnTransfers(tx, actorId, command, actors)
  else if (command.action === 'pedir') result = await ask(tx, actorId, command)
  else result = await undo(tx, actorId, command)
  // Fresh snapshot after all selective DML, never persist it in the idempotency
  // receipt. Replays receive today's view rather than the original stale page.
  if (result.projectionSynchronized !== true || result.idempotent === true) {
    const refreshed = await refreshAffectedConciliarProjectionTx(tx, actorId)
    result = { ...result, projectionSynchronized: refreshed.projectionSynchronized }
  }
  if (recoveryContext) {
    const receiptOperationId = typeof result.recoveryReceiptOperationId === 'string' ? result.recoveryReceiptOperationId : null
    if (!receiptOperationId) fail(503, 'RECOVERY_RECIBO_AUSENTE', 'La acción no devolvió un recibo recuperable.')
    await commitConciliarRecoveryIntentTx(
      tx,
      recoveryContext,
      receiptOperationId,
      recoveryContext.intent.action === 'DESHACER' ? recoveryContext.intent.targetConfirmationOperationId : null,
    )
  }
  const projection = await responseProjection(tx, 'responseView' in command ? command.responseView : undefined, result.projectionSynchronized === true)
  return { ...result, ...(projection ? { projection } : {}) }
}

export type ConciliarActionRunOptions = Readonly<{
  /** Progreso de DML aún no comprometido; el consumidor debe esperar el commit. */
  onProgress?: (event: ConciliarBatchProgress) => void
}>

/**
 * Costura server-side para una foto transaccional ya abierta. Conserva el
 * parser cerrado, la identidad de runtime y la ACL B4 de lectura de la ruta
 * pública; no crea recibos, B4, auditoría ni refresco. El host público sigue
 * declarando su propia transacción READ ONLY antes de llegar aquí.
 */
export async function runConciliarReviewPreviewTx(tx: Tx, actorId: number, raw: unknown) {
  const command = parseConciliarCommand(raw)
  if (command.action !== 'confirmar' || !('review' in command) || command.review.kind !== 'REVIEW_PREVIEW') {
    return fail(400, 'REVIEW_PREVIEW_INVALIDA', 'La acción no es una previsualización de revisión válida.')
  }
  await assertConciliarRuntime(tx)
  const access = await requireB4ActorAccess(actorId, 'lectura', tx)
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'Tu permiso para revisar la propuesta ya no está vigente.')
  const review = { kind: 'REVIEW_PREVIEW' as const, id: command.review.id, decisionHash: command.review.decisionHash }
  return previewArea3Review(tx, { action: 'confirmar', review })
}

/**
 * REVIEW_PREVIEW no crea recibos, no agenda refresh y no exige permiso de
 * escritura. El núcleo G7 se evalúa contra una foto declarada READ ONLY; un
 * bloqueo permanece ámbar con su razón llana y nunca promociona la fila a verde.
 */
export async function runConciliarReviewPreview(actorId: number, raw: unknown) {
  return db().$transaction(async base => {
    const tx = asTx(base)
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    return runConciliarReviewPreviewTx(tx, actorId, raw)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 })
}

export async function runConciliarAction(actorId: number, raw: unknown, options: ConciliarActionRunOptions = {}) {
  const command = parseConciliarCommand(raw)
  if (command.action === 'confirmar' && 'review' in command && command.review.kind === 'REVIEW_PREVIEW') {
    fail(409, 'REVIEW_PREVIEW_SOLO_LECTURA', 'La previsualización de revisión no es una mutación.')
  }
  const actors = await conciliarHistoryActors(actorId)
  const recoveryIdentity = await resolveConciliarRecoveryIdentity(actorId)
  // This independent commit precedes all financial DML. Any crash, rollback or
  // exhausted serializable retry therefore remains PENDING; this code never
  // invents NOT_COMMITTED from a missing receipt.
  const recoveryContext = await prepareConciliarRecoveryIntent(actorId, command, recoveryIdentity)
  let provisionalCompleted = 0
  const reportProgress = (event: ConciliarBatchProgress) => {
    if (event.kind === 'row-applied') provisionalCompleted = event.completed
    options.onProgress?.(event)
  }
  const txSerializable = () => db().$transaction(async base => {
    const tx = asTx(base)
    // Runtime identity and the actor's B4 write ACL are both reread in the
    // SERIALIZABLE transaction immediately before the receipt and business DML.
    await requireLiveWrite(actorId, tx)
    return runWithConciliarSerializableAuthorization(tx, () => runConciliarTransactionCommand(tx, actorId, command, actors, command.action === 'confirmar' ? reportProgress : undefined, recoveryContext), actorId)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
  return retryConciliarSerializableP2034(txSerializable, waitForSerializableRetry, retrying => {
    if (command.action === 'confirmar' && 'items' in command) {
      options.onProgress?.({ kind: 'attempt-rolled-back', completed: provisionalCompleted, total: command.items.length, retrying })
      provisionalCompleted = 0
    }
  })
}

export function conciliarActionErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof ConciliarRuntimeError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof ConciliarActionError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof ConciliarDbError) return conciliarDbErrorResponse(error)
  if (error instanceof ConciliarConfirmingServiceError) return { status: error.status, body: { error: error.message.replace(/\b(?:B[4-8]|C9|C10)\b/g, 'documental'), codigo: error.code } }
  if (error instanceof B4ServiceError || error instanceof EasyReconciliationServiceError || error instanceof EasyCollectionsServiceError || error instanceof RemittancePaymentReceiptError) return { status: (error as any).status ?? 409, body: { error: error.message, codigo: (error as any).code ?? 'DECISION_CAMBIADA' } }
  const code = String((error as any)?.code ?? '')
  if (['P2002', 'P2034', '40001', '40P01', '55P03'].includes(code)) return { status: 409, body: { error: 'La información cambió mientras se procesaba. Pulsa Actualizar y vuelve a intentarlo.', codigo: 'CONCURRENT_CONFLICT' } }
  return { status: 503, body: { error: 'No se pudo comprobar el resultado. Reintenta exactamente la misma acción para evitar duplicados.', codigo: 'CONCILIAR_RESULTADO_INCIERTO' } }
}
