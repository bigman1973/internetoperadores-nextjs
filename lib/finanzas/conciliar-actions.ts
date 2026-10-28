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
import { ConciliarDbError, conciliarDbErrorResponse, movementPartyAliases, payrollPeriodMatches, readConciliarProjectionTx, readConciliarRowForAction, restoreLiveBankFeeProjectionTx, unresolvedMovements } from './conciliar-db'
import { applyConciliarProjectionDeltaTx } from './conciliar-delta'
import { knownSingleBankFeeUndoMovement } from './conciliar-fee-undo'

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
    error instanceof ConciliarConfirmingServiceError
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

async function projectionStateAtActionStart(tx: Tx): Promise<{ wasDirty: boolean }> {
  const rows = await tx.$queryRaw<Array<{ dirtyAt: Date | null }>>(Prisma.sql`
    SELECT dirty_at AS "dirtyAt" FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1 FOR UPDATE
  `)
  if (!rows.length) fail(503, 'CONCILIAR_MIGRATION_PENDING', 'La proyección de Conciliar aún no está preparada.')
  // El trigger B4 marca esta misma fila dirty. FOR UPDATE se toma antes de
  // tocar fuentes para que dos acciones no retengan FOR SHARE y después ambas
  // intenten escalar a exclusivo al disparar el trigger. Las mutaciones ajenas
  // posteriores esperan y dejan dirty al terminar; una marca previa se conserva.
  return { wasDirty: rows[0].dirtyAt !== null }
}

/**
 * Confirmar una comisión sólo elimina su fila: no modifica ninguna factura,
 * propuesta, nómina ni fila derivada. Si la foto estaba limpia al comenzar y
 * las únicas patas son comisiones, la retirada anterior deja una proyección
 * exacta en el mismo commit. Limpiar la marca evita reconstruir ~6k filas para
 * ese caso acotado. Una foto que ya venía dirty nunca se declara limpia aquí.
 */
async function settleKnownFeeOnlyProjection(tx: Tx, stateAtStart: { wasDirty: boolean }, kinds: ReadonlySet<ConciliarProjectionSource['kind']>): Promise<boolean> {
  if (stateAtStart.wasDirty || kinds.size !== 1 || !kinds.has('COMISION_BANCARIA')) return false
  const updated = await tx.$queryRaw<Array<{ projectionVersion: bigint | number }>>(Prisma.sql`
    UPDATE estado_proyeccion_conciliar
       SET dirty_at=NULL,dirty_reason=NULL,rebuilt_at=CURRENT_TIMESTAMP,projection_version=projection_version+1
     WHERE singleton=true AND dirty_at IS NOT NULL
     RETURNING projection_version AS "projectionVersion"
  `)
  // All B4 changes are trigger-invalidated. An empty result is still safe: it
  // means no dirty marker remains; this path never clears a pre-existing one.
  return updated.length === 1
}

/**
 * Undo may restore only the exact local dependency closed by a one-leg fee
 * receipt. The receipt must carry the persisted source kind added by this
 * version; older receipts deliberately retain the dirty/full-rebuild path.
 */
async function restoreKnownFeeOnlyProjection(tx: Tx, stateAtStart: { wasDirty: boolean }, legs: readonly {
  movimientoId: string | null; operationB4Id: string | null; actionB5: string | null; proposalBlockId: string | null; result: unknown
}[]): Promise<boolean> {
  const movementId = knownSingleBankFeeUndoMovement({ wasDirty: stateAtStart.wasDirty, legs })
  if (!movementId || !await restoreLiveBankFeeProjectionTx(tx, movementId)) return false
  return settleKnownFeeOnlyProjection(tx, stateAtStart, new Set<ConciliarProjectionSource['kind']>(['COMISION_BANCARIA']))
}

/** A response view is read only after the projection DML of this exact action.
 * It is deliberately returned to HTTP but not persisted in operaciones_conciliar:
 * a later idempotency replay must never restore stale rows/hashes to a browser. */
async function responseProjection(tx: Tx, responseView: ConciliarCommand['responseView'] | undefined, projectionSynchronized: boolean) {
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

async function confirmBankFee(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movementId = requireMovement(row.source)
  const sourceRows = await tx.$queryRaw<Array<{ id: string; version: number | bigint; amount: number | bigint; concepto: string | null; referencia: string | null; info: string | null; tercero: string | null; banco: string | null }>>(Prisma.sql`
    SELECT m.id,COALESCE(e.version,1) AS version,b4_importe_bancario_centimos(m.importe) AS amount,m.concepto,m.referencia,m.info_adicional AS info,m.tercero,c.banco
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.id=${movementId} AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' FOR UPDATE OF m
  `)
  const source = sourceRows[0]
  if (!source || safeInteger(source.amount) === null || safeInteger(source.version) === null) fail(409, 'DECISION_CAMBIADA', 'El movimiento cambió. Actualiza la lista.')
  const fee = row.source.kind === 'COMISION_BANCARIA' && isConciliarBankFee({ importeCentimos: Number(source.amount), concepto: source.concepto, referencia: source.referencia, infoAdicional: source.info, tercero: source.tercero, banco: source.banco })
  if (!fee || Number(source.amount) !== row.importeCentimos || Number(source.version) !== b4Version(row.source.versionB4)) fail(409, 'DECISION_CAMBIADA', 'El cargo ya no cumple la regla de gasto bancario. Actualiza la lista.')
  const result: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_FEE', operationId, row.id), version: Number(source.version),
    borrador: { movimientoId: movementId, importeMovimientoCentimos: Number(source.amount), estado: 'NO_REQUIERE', motivoNoRequiere: 'COMISION_BANCARIA', lineas: [] },
  })
  if (result.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La decisión ya existe fuera del recibo de Conciliar; actualiza la lista.')
  return { operationB4Id: String(result.operacion.id), result: { state: 'confirmada', movimientoId: movementId, operationB4Id: String(result.operacion.id) } }
}
async function confirmReceivedInvoice(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movementId = requireMovement(row.source), invoiceId = row.source.facturaRecibidaId
  if (!invoiceId) fail(409, 'DECISION_CAMBIADA', 'La propuesta ya no identifica una factura recibida. Actualiza la lista.')
  const movement = (await unresolvedMovements(tx, movementId))[0]
  const invoice = await tx.facturaRecibida.findUnique({ where: { id: invoiceId }, select: { numFactura: true, fecha: true, total: true, proveedor: true } })
  const total = invoice ? exactCents(String(invoice.total)) : null
  if (!movement || !invoice || total === null) fail(409, 'DECISION_CAMBIADA', 'La factura o el movimiento cambiaron. Actualiza la lista.')
  const exact = evaluarDocumentoExacto({ importeBancoCentimos: Number(movement.importeCentimos), importeDocumentoCentimos: -total,
    fechaBanco: movement.fecha, fechaDocumento: invoice.fecha instanceof Date ? invoice.fecha.toISOString().slice(0, 10) : null,
    conceptoBanco: String(movement.concepto ?? ''), referenciaDocumento: String(invoice.numFactura ?? ''),
    unicoTercero: conciliarAliasesMatch(movementPartyAliases(movement), [invoice.proveedor]) })
  if (!exact.seleccionable || Number(movement.importeCentimos) !== row.importeCentimos) fail(409, 'DECISION_CAMBIADA', exact.motivo || 'La propuesta cambió. Actualiza la lista.')
  const candidates = await inspectEasyCandidatesTx(tx, movementId)
  const current = candidates.find(item => item.suggestion.sourceId === invoiceId && item.suggestion.tipo === 'FACTURA_RECIBIDA' && item.suggestion.exacta)
  if (!current) fail(409, 'DECISION_CAMBIADA', 'La factura propuesta ya no coincide exactamente con el movimiento. Actualiza la lista.')
  const confirmed: any = await confirmEasyReconciliationTx(tx, actorId, {
    action: 'confirmar_factura', movimientoId: movementId, version: b4Version(row.source.versionB4), sugerenciaId: current.suggestion.id,
    idempotencyKey: uuidKey('CONCILIAR_RECEIVED', operationId, row.id), confirmacion: true,
  })
  return { operationB4Id: String(confirmed.operacionId), result: { state: 'confirmada', movimientoId: movementId, operationB4Id: String(confirmed.operacionId) } }
}

type LiveB5TicketSource = Readonly<{
  adjuntoB5Id: string
  gastoId: string
  documentoConciliableId: string
  driveId: string | null
  itemId: string | null
}>

/**
 * The persisted projection source is only a sealed pointer. Before touching B4,
 * prove its exact B5 attachment is still complete, still belongs to this same
 * movement and still owns the reviewed Gasto/TICKET wrapper pair. No provider
 * text, external URL or browser-supplied identifier participates in this check.
 */
async function liveB5TicketSourceTx(tx: Tx, source: ConciliarProjectionSource, movimientoId: string): Promise<LiveB5TicketSource> {
  const adjuntoB5Id = source.adjuntoB5Id, gastoId = source.gastoId, documentoConciliableId = source.documentoConciliableId
  if (!adjuntoB5Id || !gastoId || !documentoConciliableId) {
    fail(409, 'DECISION_CAMBIADA', 'El ticket B5 ya no conserva su identidad documental sellada. Actualiza la lista.')
  }
  const rows = await tx.$queryRaw<Array<LiveB5TicketSource>>(Prisma.sql`
    SELECT a.id::text AS "adjuntoB5Id",a.gasto_id AS "gastoId",a.documento_conciliable_id::text AS "documentoConciliableId",
      a.drive_id AS "driveId",a.onedrive_item_id AS "itemId"
    FROM adjuntos_pendientes_b5 a
    JOIN movimientos_bancarios m ON m.id=a.movimiento_id
    JOIN gastos g ON g.id=a.gasto_id AND g.estado IN ('APROBADO','CONTABILIZADO') AND g.metodo_pago='TARJETA_EMPRESA'
    JOIN documentos_conciliables d ON d.id=a.documento_conciliable_id AND d.gasto_id=g.id
      AND d.tipo='TICKET'::"TipoDocumentoConciliable" AND d.activo=true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(v.importe_centimos),0)::bigint AS asignado
      FROM vinculos_movimiento_documento v
      WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" AND v.documento_conciliable_id=d.id
    ) capacity ON TRUE
    WHERE a.id=CAST(${adjuntoB5Id} AS uuid) AND a.movimiento_id=${movimientoId}
      AND a.tipo_documento='TICKET' AND a.estado='UPLOAD_COMPLETO'::"EstadoAdjuntoPendienteB5"
      AND a.gasto_id=${gastoId} AND a.documento_conciliable_id=CAST(${documentoConciliableId} AS uuid)
      AND a.fecha_documento::date=g.fecha::date
      AND a.importe_documento_centimos=b4_importe_bancario_centimos(g.importe)
      AND d.importe_objetivo_centimos=-b4_importe_bancario_centimos(g.importe)
      AND b4_importe_bancario_centimos(m.importe)=-b4_importe_bancario_centimos(g.importe)
      AND g.fecha::date<=m.fecha_operacion::date AND capacity.asignado=0
    LIMIT 1
    FOR KEY SHARE OF a,m,g,d
  `)
  const current = rows[0]
  const configuredDrive = bibliotecaFinancieraConfigurada()
  if (!current || !configuredDrive || current.driveId !== configuredDrive
    || typeof current.itemId !== 'string' || !/^[A-Za-z0-9!_.~-]{4,220}$/.test(current.itemId)) {
    fail(409, 'EVIDENCIA_B5_CAMBIADA', 'El ticket B5 o su archivo privado controlado cambiaron. Actualiza la lista.')
  }
  return current
}

/** PAGO_TICKET_B5 does not create a second Gasto or wrapper. It only delegates
 * the final explicit B4 act to the established Modo Fácil operation after both
 * Conciliar's sealed B5 source and Modo Fácil's live exact candidate agree. */
async function confirmB5Ticket(tx: Tx, actorId: number, operationId: string, row: Awaited<ReturnType<typeof readConciliarRowForAction>>) {
  const movimientoId = requireMovement(row.source)
  const candidates = await inspectEasyCandidatesTx(tx, movimientoId)
  const live = await liveB5TicketSourceTx(tx, row.source, movimientoId)
  const current = candidates.find(item => item.suggestion.tipo === 'TICKET'
    && item.suggestion.sourceId === live.gastoId
    && item.suggestion.documentoConciliableId === live.documentoConciliableId
    && item.suggestion.exacta === true
    && item.suggestion.archivoDisponible === true
    && item.suggestion.importeCentimos === row.importeCentimos)
  if (!current) {
    fail(409, 'DECISION_CAMBIADA', 'El ticket B5 ya no es la candidata exacta y disponible del mismo movimiento. Actualiza la lista.')
  }
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
  const movementId = requireMovement(row.source), nominaId = row.source.nominaId
  if (!nominaId) fail(409, 'DECISION_CAMBIADA', 'La nómina propuesta ya no está identificada. Actualiza la lista.')
  const movement = (await unresolvedMovements(tx, movementId))[0]
  const sourceRows = await tx.$queryRaw<Array<{ id: string; mes: number; anio: number; empleadoNombre: string; total: string | null; itemId: string | null; legacyUrl: string | null; version: number | bigint; amount: number | bigint }>>(Prisma.sql`
    SELECT n.id,n.mes,n.anio,employee.nombre_completo AS "empleadoNombre",n.neto_percibir::text AS total,COALESCE(nd.drive_item_id,'') AS "itemId",n.archivo_url AS "legacyUrl",COALESCE(e.version,1) AS version,b4_importe_bancario_centimos(m.importe) AS amount
    FROM movimientos_bancarios m JOIN nominas n ON n.id=${nominaId}
    JOIN empleados employee ON employee.id=n.empleado_id
    LEFT JOIN LATERAL (SELECT drive_item_id FROM nomina_documentos WHERE nomina_id=n.id AND tipo='NOMINA' ORDER BY created_at DESC,id DESC LIMIT 1) nd ON TRUE
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.id=${movementId} AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' FOR UPDATE OF m
  `)
  const source = sourceRows[0]
  if (!source || typeof source.total !== 'string' || safeInteger(source.amount) === null || safeInteger(source.version) === null) fail(409, 'DECISION_CAMBIADA', 'La nómina o el movimiento cambió. Actualiza la lista.')
  const net = exactCents(source.total)
  const hasFile = typeof source.itemId === 'string' && source.itemId.length >= 4 || controlledPayrollItem(source.legacyUrl)
  if (!movement || !payrollPeriodMatches(movement.fecha, source) || !conciliarAliasesMatch(movementPartyAliases(movement), [source.empleadoNombre])) fail(409, 'DECISION_CAMBIADA', 'El empleado o el mes de la nómina ya no coinciden con la transferencia. Actualiza la lista.')
  if (net === null || !hasFile || Number(source.amount) !== -net || Number(source.version) !== b4Version(row.source.versionB4)) fail(409, 'DECISION_CAMBIADA', 'La nómina ya no coincide exactamente o no conserva su archivo controlado.')
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
  const movementId = requireMovement(row.source), confirmingId = row.source.confirmingId, sourceHash = row.source.confirmingSourceHash
  if (!confirmingId || !sourceHash) fail(409, 'DECISION_CAMBIADA', 'El confirming ya no conserva su fuente documental. Actualiza la lista.')
  const live = await readConciliarConfirmingCandidates(tx, { movimientoIds: [movementId] })
  const candidate = live.candidates.find(item => item.movimientoId === movementId && item.confirmingId === confirmingId && item.sourceHash === sourceHash)
  if (!candidate || candidate.evidenceSchema !== 'C11' || candidate.estado !== 'LISTO_PARA_CONFIRMACION_B4'
    || candidate.sourceHash !== sourceHash || candidate.totalLineasB4Centimos !== row.importeCentimos || candidate.lineasB4.length < 1) {
    fail(409, 'EVIDENCIA_C11_CAMBIADA', 'La liquidación confirming C11, sus facturas o sus deducciones explícitas cambiaron. Actualiza la lista.')
  }
  if (candidate.lineasB4.some(line => line.tipo === 'DOCUMENTO' && !line.documentoConciliableId)) fail(409, 'EVIDENCIA_C11_INCOMPLETA', 'Falta un documento B4 C11 vigente.')
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

async function undoB4Leg(tx: Tx, actorId: number, operationId: string, ordinal: number, leg: any) {
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
  const priorResult = json(leg.result)
  const pairedReversal = priorResult.sourceKind === 'TRANSFERENCIA_PROPIA'
    ? await undoConciliarPairedTransferTx(tx, actorId, priorResult, operationId)
    : null
  const reversal: any = await deshacerB4Tx(tx, actorId, {
    action: 'deshacer', confirmacion: true, idempotencyKey: uuidKey('CONCILIAR_UNDO', operationId, leg.rowId), version: Number(current[0].version), operacionId: operationIdB4,
    lineas: active.map(line => ({ id: line.id, importeCentimos: Number(line.amount) })),
  })
  if (reversal.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La reversión ya existe fuera del recibo de Conciliar.')
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

async function confirm(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'confirmar' }>, onProgress?: (event: ConciliarBatchProgress) => void) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'CONFIRMAR', command.idempotencyKey, conciliarRequestHash(actorId, command))
  if (receipt.replay) return { operationId: receipt.id, idempotent: true, ...receipt.result }
  const stateAtStart = await projectionStateAtActionStart(tx)
  const outcomes: Array<Record<string, unknown>> = []
  const plan = await readConciliarConfirmBatchForActionTx(tx, command.items, fail)
  const selectedRows = plan.rows
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
  let projectionSynchronized = await settleKnownFeeOnlyProjection(tx, stateAtStart, plan.kinds)
  if (!projectionSynchronized && selectedRows.length === 1) {
    const row = selectedRows[0]
    const sourceKind = row.source.kind
    const leg = await tx.$queryRaw<Array<{ operationB4Id: string | null }>>(Prisma.sql`
      SELECT operacion_b4_id::text AS "operationB4Id"
      FROM patas_operacion_conciliar
      WHERE operacion_conciliar_id=CAST(${receipt.id} AS uuid) AND ordinal=1 LIMIT 2 FOR KEY SHARE
    `)
    const operationB4Id = leg.length === 1 ? leg[0]?.operationB4Id : null
    if (operationB4Id && (sourceKind === 'COBRO_PROPUESTA' || sourceKind === 'COBRO_CONFIRMING')) {
      const delta = await applyConciliarProjectionDeltaTx(tx, {
        projectionWasDirty: stateAtStart.wasDirty, action: 'CONFIRMAR', sourceKind,
        originalOperationB4Id: operationB4Id, movimientoId: requireMovement(row.source),
      })
      projectionSynchronized = delta.projectionSynchronized
    }
  }
  const result = { ok: true, outcomes, applied: command.items.length, failed: 0, reversible: true, projectionSynchronized, refreshedAt: new Date().toISOString() }
  await complete(tx, receipt.id, 'APLICADA', result)
  const projection = await responseProjection(tx, command.responseView, projectionSynchronized)
  return { operationId: receipt.id, idempotent: false, ...result, ...(projection ? { projection } : {}) }
}

async function ask(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'pedir' }>) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'PEDIR', command.idempotencyKey, conciliarRequestHash(actorId, command))
  if (receipt.replay) return { operationId: receipt.id, idempotent: true, ...receipt.result }
  await projectionStateAtActionStart(tx)
  const row = await readConciliarRowForAction(tx, command.id)
  if (row.decisionHash !== command.decisionHash) fail(409, 'DECISION_CAMBIADA', 'Esta fila cambió desde que abriste la página. Pulsa Actualizar y vuelve a pedir el documento.')
  if (row.color !== 'ROJO') fail(422, 'FILA_NO_PEDIBLE', 'Sólo se puede pedir documentación cuando realmente falta el papel.')
  const outcome = await askRow(tx, actorId, receipt.id, row)
  const result = { ok: true, outcome, outcomes: [{ id: row.id, ok: true, code: 'PEDIDO', message: 'Añadido a Para pedir. No se ha enviado ningún aviso.' }], refreshedAt: new Date().toISOString() }
  await complete(tx, receipt.id, 'APLICADA', result)
  return { operationId: receipt.id, idempotent: false, ...result }
}

async function undo(tx: Tx, actorId: number, command: Extract<ConciliarCommand, { action: 'deshacer' }>) {
  const receipt = await lockOperationOrReplay(tx, actorId, 'DESHACER', command.idempotencyKey, conciliarRequestHash(actorId, command), command.operationId)
  if (receipt.replay) return { operationId: command.operationId, idempotent: true, ...receipt.result }
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
    else await undoB4Leg(tx, actorId, receipt.id, leg.ordinal, leg)
  }
  await tx.$executeRaw(Prisma.sql`UPDATE operaciones_conciliar SET estado='REVERTIDA'::"EstadoOperacionConciliar",revertida_at=CURRENT_TIMESTAMP WHERE id=CAST(${source.id} AS uuid) AND estado='APLICADA'::"EstadoOperacionConciliar"`)
  const projectionSynchronized = await restoreKnownFeeOnlyProjection(tx, stateAtStart, legs)
  let synchronized = projectionSynchronized
  if (!synchronized && legs.length === 1 && legs[0]?.operationB4Id && legs[0].movimientoId) {
    const sourceKind = json(legs[0].result).sourceKind
    if (sourceKind === 'COBRO_PROPUESTA' || sourceKind === 'COBRO_CONFIRMING') {
      const delta = await applyConciliarProjectionDeltaTx(tx, {
        projectionWasDirty: stateAtStart.wasDirty, action: 'DESHACER', sourceKind,
        originalOperationB4Id: legs[0].operationB4Id, movimientoId: legs[0].movimientoId,
      })
      synchronized = delta.projectionSynchronized
    }
  }
  const result = { ok: true, revertedOperationId: source.id, legs: legs.length, undone: true, projectionSynchronized: synchronized, message: 'Deshecho. La confirmación original sigue conservada en el historial.', refreshedAt: new Date().toISOString() }
  await complete(tx, receipt.id, 'APLICADA', result)
  const projection = await responseProjection(tx, command.responseView, synchronized)
  return { operationId: source.id, idempotent: false, ...result, ...(projection ? { projection } : {}) }
}

/** Internal transaction seam, also exercised against a local restore with
 * mandatory rollback. The public host below always performs the same live
 * staging/access checks before opening the SERIALIZABLE transaction. All
 * business services still revalidate the effective actor inside this tx. */
export async function runConciliarTransactionCommand(tx: Tx, actorId: number, raw: unknown, onProgress?: (event: ConciliarBatchProgress) => void) {
  const command = parseConciliarCommand(raw)
  if (command.action === 'confirmar') return confirm(tx, actorId, command, onProgress)
  if (command.action === 'pedir') return ask(tx, actorId, command)
  return undo(tx, actorId, command)
}

export type ConciliarActionRunOptions = Readonly<{
  /** Progreso de DML aún no comprometido; el consumidor debe esperar el commit. */
  onProgress?: (event: ConciliarBatchProgress) => void
}>

export async function runConciliarAction(actorId: number, raw: unknown, options: ConciliarActionRunOptions = {}) {
  const command = parseConciliarCommand(raw)
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
    return runWithConciliarSerializableAuthorization(tx, () => runConciliarTransactionCommand(tx, actorId, command, command.action === 'confirmar' ? reportProgress : undefined))
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
  return retryConciliarSerializableP2034(txSerializable, waitForSerializableRetry, retrying => {
    if (command.action === 'confirmar') {
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
