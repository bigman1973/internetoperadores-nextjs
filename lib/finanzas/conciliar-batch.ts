import { Prisma } from '@prisma/client'
import { derivedUuidV4 } from '@/lib/finanzas/easy-auto-core'
import {
  B8CentroCosteServiceError,
  requireActualActorPermissionB8Tx,
} from '@/lib/finanzas/centros-coste-db'
import {
  B8_RECEIPT_SCHEMA,
  B8_SOURCE_NOTE_RULE,
  metadataHashEleccionesCentro,
  relatedSourceHashP2,
} from '@/lib/finanzas/centros-coste-core'
import {
  counterpartyCandidateHash,
  counterpartyRequestHash,
  counterpartySha256,
  type ConfirmCounterpartyInput,
  type CounterpartyCandidateSeed,
} from '@/lib/finanzas/easy-counterparty-core'
import { assertFinanceEasyRuntime } from '@/lib/finanzas/prototype-staging'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { conciliarHash } from './conciliar-core'
import { isConciliarBankFee, type ConciliarProjectionSource } from './conciliar-contract'
import { projectionRow, type ProjectionSqlRow } from './conciliar-projection-read'

type Tx = Prisma.TransactionClient & Record<string, any>

type BatchFail = (status: number, code: string, message: string) => never

/** This is deliberately only the browser's closed selection. Amounts, sources and
 * B4 versions always come from the locked persisted projection below. */
export type ConciliarBatchSelection = Readonly<{ id: string; decisionHash: string }>

export type ConciliarBatchActionRow = ReturnType<typeof projectionRow>

/** A controlled provider failure. It deliberately carries no SQL, source amount,
 * entity identity or other sensitive material into the HTTP response. */
export class ConciliarBatchProviderError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}
function providerFail(status: number, code: string, message: string): never {
  throw new ConciliarBatchProviderError(status, code, message)
}

export type ConciliarConfirmBatchPlan = Readonly<{
  rows: readonly ConciliarBatchActionRow[]
  /** Includes both legs of a TRANSFERENCIA_PROPIA, in a stable unique order. */
  movementIds: readonly string[]
  kinds: ReadonlySet<ConciliarProjectionSource['kind']>
  onlyBankFees: boolean
}>

function requireMovement(source: ConciliarProjectionSource, fail: BatchFail): string {
  if (!source.movimientoId) fail(409, 'FILA_SIN_MOVIMIENTO', 'Esta fila no tiene un movimiento bancario que confirmar.')
  return source.movimientoId
}

function isVersionedRemittance(source: ConciliarProjectionSource): boolean {
  return source.kind === 'COBRO_PROPUESTA'
    && Number.isSafeInteger(source.remesaId) && Number(source.remesaId) > 0
    && typeof source.proposalCompositionHash === 'string' && /^[a-f0-9]{64}$/.test(source.proposalCompositionHash)
}

/**
 * Verifies the persisted rows after they have been locked, before any B4/P1 DML.
 * It intentionally keeps the existing fail-closed, all-or-nothing receipt model:
 * no preliminary row result is a committed result.
 */
export function planConciliarConfirmBatch(
  selections: readonly ConciliarBatchSelection[],
  rows: readonly ConciliarBatchActionRow[],
  fail: BatchFail,
): ConciliarConfirmBatchPlan {
  if (rows.length !== selections.length) fail(409, 'FILA_OBSOLETA', 'Una fila ya no está disponible. Actualiza la lista.')
  const byId = new Map(rows.map(row => [row.id, row]))
  const ordered = selections.map(selection => {
    const row = byId.get(selection.id)
    if (!row) fail(409, 'FILA_OBSOLETA', 'Una fila ya no está disponible. Actualiza la lista.')
    if (row.decisionHash !== selection.decisionHash) {
      fail(409, 'DECISION_CAMBIADA', 'Esta fila cambió desde que abriste la página. Pulsa Actualizar y vuelve a confirmar.')
    }
    if (!row.seleccionable) fail(422, 'FILA_NO_CONFIRMABLE', row.motivo || 'Esta fila necesita revisión antes de confirmar.')
    return row
  })

  if (ordered.some(row => isVersionedRemittance(row.source)) && ordered.length !== 1) {
    fail(422, 'REMESA_REQUIERE_CONFIRMACION_INDIVIDUAL', 'Una remesa sólo puede confirmarse individualmente tras revisar su composición completa.')
  }

  const movementIds = new Set<string>()
  const kinds = new Set<ConciliarProjectionSource['kind']>()
  for (const row of ordered) {
    kinds.add(row.source.kind)
    const movementId = requireMovement(row.source, fail)
    if (movementIds.has(movementId)) fail(422, 'MOVIMIENTO_REPETIDO', 'La selección incluye el mismo movimiento más de una vez.')
    movementIds.add(movementId)
    if (row.source.kind === 'TRANSFERENCIA_PROPIA' && row.source.movimientoParId) {
      if (movementIds.has(row.source.movimientoParId)) fail(422, 'MOVIMIENTO_REPETIDO', 'La selección repite una parte del mismo traspaso.')
      movementIds.add(row.source.movimientoParId)
    }
  }

  return {
    rows: ordered,
    movementIds: [...movementIds].sort((left, right) => left.localeCompare(right)),
    kinds,
    onlyBankFees: ordered.length > 0 && ordered.every(row => row.source.kind === 'COMISION_BANCARIA'),
  }
}

/**
 * Locks all selected projection rows in one deterministic statement. The caller
 * must still revalidate each economic source through its B4/domain service.
 */
export async function readConciliarConfirmBatchForActionTx(
  base: Prisma.TransactionClient,
  selections: readonly ConciliarBatchSelection[],
  fail: BatchFail,
): Promise<ConciliarConfirmBatchPlan> {
  const tx = base as Tx
  const ids = selections.map(item => item.id)
  const rows = await tx.$queryRaw<ProjectionSqlRow[]>(Prisma.sql`
    SELECT p.*
    FROM conciliar_proyecciones p
    WHERE p.id IN (${Prisma.join(ids)})
    ORDER BY p.id ASC
    FOR UPDATE OF p
  `)
  return planConciliarConfirmBatch(selections, rows.map(projectionRow), fail)
}

/** The selected movements are removed from the transient projection in one DML
 * statement, only after every leg has been recorded in the same transaction. */
export async function deleteConciliarBatchProjectionRowsTx(
  base: Prisma.TransactionClient,
  movementIds: readonly string[],
): Promise<void> {
  if (!movementIds.length) return
  const tx = base as Tx
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM conciliar_proyecciones
    WHERE movimiento_id IN (${Prisma.join([...new Set(movementIds)].sort((left, right) => left.localeCompare(right)))})
  `)
}

/**
 * Server-only input to the homogeneous bank-fee provider. The browser cannot
 * submit it: every field is reconstructed from the locked Conciliar projection.
 */
export type ConciliarBankFeeBatchInput = Readonly<{
  action: 'confirmar_comisiones_conciliar_lote'
  operationId: string
  items: readonly Readonly<{
    rowId: string
    movimientoId: string
    version: number
    importeMovimientoCentimos: number
    idempotencyKey: string
  }>[]
}>

export type ConciliarBankFeeBatchResult = Readonly<{
  rowId: string
  operationB4Id: string
  /** `null` is allowed only where the locked movement lacks an active AAPP fiscal
   * card, or already has a live P1 decision. */
  counterpartyReceipt: Record<string, unknown> | null
}>

/** Material re-read under the deterministic B4 advisory locks. It deliberately
 * contains no browser field and no free-text bank identity. */
export type ConciliarBankFeeLockedSource = Readonly<{
  movementId: string
  importeCentimos: number | bigint | null
  concepto: string | null
  referencia: string | null
  infoAdicional: string | null
  tercero: string | null
  banco: string | null
  estado: string | null
  motivoNoRequiere: string | null
  version: number | bigint | null
  entityId: string | null
  entityName: string | null
  entityNif: string | null
  activeP1Id: string | null
  p1Version: number | bigint | null
}>

type B4StateSnapshot = Readonly<{
  estado: 'SIN_DOCUMENTO'
  motivoNoRequiere: null
  version: number
}>
type B4ResultSnapshot = Readonly<{
  estado: 'NO_REQUIERE'
  motivoNoRequiere: 'COMISION_BANCARIA'
  version: number
}>
type EmptyB8Receipt = Readonly<{
  metadataHash: string
  relatedSourceHashP2: string
  snapshotSolicitud: Record<string, unknown>
  snapshotResultado: Record<string, unknown>
}>
type PreparedP1 = Readonly<{
  decisionId: string
  candidateHash: string
  requestHash: string
  idempotencyKey: string
  version: number
  snapshot: Record<string, unknown>
  receipt: Record<string, unknown>
}>

/** Internal prepared plan. It holds only values reconstructed from locked tables
 * and deterministic receipts; it is never returned to the browser. */
export type ConciliarBankFeePrepared = Readonly<{
  rowId: string
  movementId: string
  operationB4Id: string
  idempotencyKey: string
  version: number
  importeCentimos: number
  b4Request: Record<string, unknown>
  b4PayloadHash: string
  previousState: B4StateSnapshot
  hadStoredState: boolean
  resultState: B4ResultSnapshot
  b8: EmptyB8Receipt
  p1: PreparedP1 | null
}>

function asInt(value: unknown, code: string): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value
  if (!Number.isSafeInteger(parsed)) providerFail(409, code, 'La información de una comisión cambió. Actualiza la lista.')
  return parsed as number
}

function p1Label(name: string | null, nif: string | null): string {
  const source = nif?.replace(/\s+/g, '').toUpperCase() ?? ''
  const masked = !source ? 'sin NIF/CIF visible'
    : source.length <= 4 ? `${source[0] ?? '•'}•••`
      : `${source.slice(0, 2)}••••${source.slice(-2)}`
  return `${name?.trim() || 'Tercero registrado'} · Administración registrada · NIF/CIF ${masked}`
}

/** The same economic request that B4 stores for an individual bank-fee click.
 * It intentionally has no B8 fields: B8 uses its separate immutable receipt. */
export function buildConciliarBankFeeB4Request(item: Readonly<{
  movimientoId: string
  version: number
  importeMovimientoCentimos: number
  idempotencyKey: string
}>): Record<string, unknown> {
  return {
    action: 'confirmar',
    confirmacion: true,
    idempotencyKey: item.idempotencyKey,
    version: item.version,
    borrador: {
      movimientoId: item.movimientoId,
      importeMovimientoCentimos: item.importeMovimientoCentimos,
      estado: 'NO_REQUIERE',
      motivoNoRequiere: 'COMISION_BANCARIA',
      lineas: [],
    },
  }
}

/** A NO_REQUIERE confirmation must still have a B8 receipt with an explicitly
 * empty mapping. These values are deterministic and are deliberately reusable in
 * replay validation. */
export function buildConciliarBankFeeEmptyB8Receipt(): EmptyB8Receipt {
  const choices: readonly [] = []
  const metadataHash = metadataHashEleccionesCentro(choices)
  const sourceHash = relatedSourceHashP2(choices)
  return {
    metadataHash,
    relatedSourceHashP2: sourceHash,
    snapshotSolicitud: {
      schema: B8_RECEIPT_SCHEMA,
      sourceNoteRule: B8_SOURCE_NOTE_RULE,
      mapping: [],
    },
    snapshotResultado: {
      schema: B8_RECEIPT_SCHEMA,
      accion: 'CONFIRMACION_B4_ELECCIONES',
      sourceNoteRule: B8_SOURCE_NOTE_RULE,
      metadataHash,
      relatedSourceHashP2: sourceHash,
      mapping: [],
    },
  }
}

/** The B4 append-only stream remains three events per movement just like the
 * individual confirmation. Origin/note make this explicit human batch action
 * auditable without creating an automatic receipt. */
export function buildConciliarBankFeeB4EventDetail(version: number): Record<string, unknown> {
  return { version, origen: 'MANUAL', nota: 'COMISION_BANCARIA' }
}

export function assertConciliarBankFeeBatchInput(input: ConciliarBankFeeBatchInput): readonly ConciliarBankFeeBatchInput['items'][number][] {
  if (input.action !== 'confirmar_comisiones_conciliar_lote' || !/^[0-9a-f-]{36}$/i.test(input.operationId)
    || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    providerFail(400, 'FEE_BATCH_INVALIDO', 'La selección de comisiones no es válida.')
  }
  const rows = new Set<string>(), movements = new Set<string>(), keys = new Set<string>()
  for (const item of input.items) {
    if (!item || typeof item.rowId !== 'string' || !item.rowId || item.rowId.length > 240
      || typeof item.movimientoId !== 'string' || !item.movimientoId || item.movimientoId.length > 160
      || !Number.isSafeInteger(item.version) || item.version < 1
      || !Number.isSafeInteger(item.importeMovimientoCentimos) || item.importeMovimientoCentimos >= 0
      || !/^[0-9a-f-]{36}$/i.test(item.idempotencyKey)
      || rows.has(item.rowId) || movements.has(item.movimientoId) || keys.has(item.idempotencyKey)) {
      providerFail(400, 'FEE_BATCH_INVALIDO', 'La selección de comisiones no es válida.')
    }
    rows.add(item.rowId)
    movements.add(item.movimientoId)
    keys.add(item.idempotencyKey)
  }
  return input.items
}

/**
 * Purely prepares the exact B4/B8/P1 records from locked server material. It is
 * exported for synthetic tests, but no caller should use it with browser data.
 */
export function prepareConciliarBankFeeBatchRows(
  input: ConciliarBankFeeBatchInput,
  actorId: number,
  sources: readonly ConciliarBankFeeLockedSource[],
): readonly ConciliarBankFeePrepared[] {
  const items = assertConciliarBankFeeBatchInput(input)
  if (!Number.isSafeInteger(actorId) || actorId < 1) {
    providerFail(403, 'ACTOR_NO_AUTORIZADO', 'Actor financiero no autorizado.')
  }
  const byMovement = new Map(sources.map(row => [row.movementId, row]))
  if (byMovement.size !== items.length) providerFail(409, 'MOVIMIENTO_NO_ENCONTRADO', 'Una comisión ya no está disponible. Actualiza la lista.')
  const b8 = buildConciliarBankFeeEmptyB8Receipt()

  return items.map(item => {
    const source = byMovement.get(item.movimientoId)
    if (!source) providerFail(409, 'MOVIMIENTO_NO_ENCONTRADO', 'Una comisión ya no está disponible. Actualiza la lista.')
    const amount = asInt(source.importeCentimos, 'IMPORTE_MOVIMIENTO_CAMBIADO')
    const version = source.version === null ? 1 : asInt(source.version, 'VERSION_CONFLICT')
    if (amount >= 0 || amount !== item.importeMovimientoCentimos || version !== item.version) {
      providerFail(409, amount !== item.importeMovimientoCentimos || amount >= 0 ? 'IMPORTE_MOVIMIENTO_CAMBIADO' : 'VERSION_CONFLICT', 'La comisión cambió desde que abriste la página. Actualiza la lista.')
    }
    if (source.estado !== null && source.estado !== 'SIN_DOCUMENTO') {
      providerFail(409, 'DESHACER_REQUERIDO', 'Una comisión ya está conciliada; actualiza la lista antes de continuar.')
    }
    if (source.estado === 'SIN_DOCUMENTO' && source.motivoNoRequiere !== null) {
      providerFail(409, 'ESTADO_B4_INVALIDO', 'La comisión no conserva un estado B4 válido. Actualiza la lista.')
    }
    if (!isConciliarBankFee({
      importeCentimos: amount,
      concepto: source.concepto,
      referencia: source.referencia,
      infoAdicional: source.infoAdicional,
      tercero: source.tercero,
      banco: source.banco,
    })) {
      providerFail(409, 'COMISION_RECLASIFICADA', 'Una fila ya no cumple la regla de comisión bancaria. Actualiza la lista.')
    }

    const operationB4Id = derivedUuidV4('CONCILIAR_FEE_B4_V1', `${input.operationId}:${item.movimientoId}`)
    const b4Request = buildConciliarBankFeeB4Request({
      movimientoId: item.movimientoId,
      version,
      importeMovimientoCentimos: amount,
      idempotencyKey: item.idempotencyKey,
    })
    const previousState: B4StateSnapshot = { estado: 'SIN_DOCUMENTO', motivoNoRequiere: null, version }
    const resultState: B4ResultSnapshot = { estado: 'NO_REQUIERE', motivoNoRequiere: 'COMISION_BANCARIA', version: version + 1 }

    let p1: PreparedP1 | null = null
    // This eligibility is the exact direct P1 candidate: the fiscal relation on
    // the movement currently names one active AAPP card with a real NIF/CIF. The
    // account name/text never becomes an identity and never creates a card.
    if (source.entityId && !source.activeP1Id) {
      const seed: CounterpartyCandidateSeed = {
        movimientoId: item.movimientoId,
        tipoTercero: 'BANCO',
        origen: 'ENTIDAD_FISCAL',
        sourceIdentity: `EF:${source.entityId}`,
      }
      const candidateHash = counterpartyCandidateHash(seed)
      const idempotencyKey = derivedUuidV4('CONCILIAR_COUNTERPARTY_P1_V1', `${input.operationId}:${item.movimientoId}`)
      const p1Version = asInt(source.p1Version, 'P1_VERSION_INVALIDA')
      const p1Input: ConfirmCounterpartyInput = {
        action: 'confirmar',
        movimientoId: item.movimientoId,
        version: p1Version,
        sugerenciaId: `p1_${candidateHash}`,
        idempotencyKey,
        confirmacion: true,
      }
      const decisionId = derivedUuidV4('CONCILIAR_COUNTERPARTY_P1_DECISION_V1', `${input.operationId}:${item.movimientoId}`)
      const sourceHash = counterpartySha256({ schema: 'EASY_COUNTERPARTY_SOURCE_V1', sourceIdentity: seed.sourceIdentity })
      p1 = {
        decisionId,
        candidateHash,
        idempotencyKey,
        version: p1Version,
        requestHash: counterpartyRequestHash(actorId, p1Input),
        snapshot: {
          schema: 'EASY_COUNTERPARTY_RECEIPT_V1',
          candidateHash,
          sourceHash,
          origin: 'ENTIDAD_FISCAL',
          label: p1Label(source.entityName, source.entityNif),
        },
        receipt: {
          schema: 'CONCILIAR_COUNTERPARTY_RECEIPT_V1',
          actorId,
          operationId: input.operationId,
          movementId: item.movimientoId,
          decisionId,
          version: p1Version + 1,
          sourceKind: 'COMISION_BANCARIA',
          tipoTercero: 'BANCO',
        },
      }
    }

    return {
      rowId: item.rowId,
      movementId: item.movimientoId,
      operationB4Id,
      idempotencyKey: item.idempotencyKey,
      version,
      importeCentimos: amount,
      b4Request,
      b4PayloadHash: conciliarHash(b4Request),
      previousState,
      hadStoredState: source.estado !== null,
      resultState,
      b8,
      p1,
    }
  })
}

/**
 * B4's individual lock is `hashtextextended(CAST(movimientoId AS text),0)`.
 * This vector form takes exactly those advisory locks in lexical movement order,
 * before the single physical-row lock/read below. Keep its grammar deliberately
 * narrow in lib/prisma.ts; it is a read/lock statement, never a write.
 */
async function lockAdvisoryVectorTx(tx: Tx, keys: readonly string[]): Promise<void> {
  const values = [...new Set(keys)].sort((left, right) => left.localeCompare(right))
    .map(id => Prisma.sql`(CAST(${id} AS text))`)
  await tx.$queryRaw(Prisma.sql`
    SELECT pg_advisory_xact_lock(hashtextextended(v.movimiento_id,0))::text AS locked
    FROM (VALUES ${Prisma.join(values)}) AS v(movimiento_id)
    ORDER BY v.movimiento_id ASC
  `)
}

async function lockB4FeeMovementsTx(tx: Tx, movementIds: readonly string[]): Promise<void> {
  await lockAdvisoryVectorTx(tx, movementIds)
}

/** The P1 append-only trigger locks this exact prefixed key after the ordinary
 * movement key. Acquiring the same keys vectorially before its createMany keeps
 * an all-fee batch deterministic without changing P1's individual lock order. */
async function lockP1FeeMovementsTx(tx: Tx, movementIds: readonly string[]): Promise<void> {
  if (!movementIds.length) return
  await lockAdvisoryVectorTx(tx, movementIds.map(movementId => `easy-counterparty:${movementId}`))
}

/** All economic/source state comes from these now-locked server rows. Browser
 * selection IDs/hashes have already been verified by the Conciliar projection. */
async function lockedFeeSourcesTx(tx: Tx, movementIds: readonly string[]): Promise<readonly ConciliarBankFeeLockedSource[]> {
  return tx.$queryRaw<ConciliarBankFeeLockedSource[]>(Prisma.sql`
    SELECT m.id AS "movementId",b4_importe_bancario_centimos(m.importe) AS "importeCentimos",
      m.concepto,m.referencia,m.info_adicional AS "infoAdicional",m.tercero,c.banco,
      e.estado::text AS estado,e.motivo_no_requiere::text AS "motivoNoRequiere",e.version,
      ef.id::text AS "entityId",ef.razon_social AS "entityName",ef.nif_cif AS "entityNif",
      active_p1.id::text AS "activeP1Id",COALESCE(p1_versions.version,0)::int AS "p1Version"
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
      AND ef.activo=true AND ef.tipo='AAPP'::"TipoEntidadFiscal" AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT d.id FROM decisiones_tercero_modo_facil d
      WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
        AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ORDER BY d.created_at DESC,d.id DESC LIMIT 1
    ) active_p1 ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS version FROM decisiones_tercero_modo_facil d WHERE d.movimiento_id=m.id
    ) p1_versions ON true
    WHERE m.id IN (${Prisma.join(movementIds)})
    ORDER BY m.id ASC
    FOR UPDATE OF m
  `)
}

type ExistingB4Replay = Readonly<{
  id: string
  movimientoId: string
  idempotencyKey: string
  payloadHash: string
  estado: string
  versionEsperada: number
  versionResultante: number | null
  revertidaAt: Date | null
  snapshotResultado: unknown
}>

type ExistingP1Replay = Readonly<{
  decisionId: string
  movementId: string
  idempotencyKey: string
  action: string
  tipo: string
  origin: string
  candidateHash: string
  requestHash: string
  snapshot: unknown
  version: number | bigint
}>

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch { return {} }
  }
  return {}
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try { return conciliarHash(left) === conciliarHash(right) } catch { return false }
}

/** Idempotency is normally intercepted by operaciones_conciliar. This narrower
 * replay path preserves B4/B8/P1 safety if a caller-owned transaction is retried
 * directly before it can create a second ledger record. */
async function existingBatchReplayTx(
  tx: Tx,
  actorId: number,
  input: ConciliarBankFeeBatchInput,
  sources: readonly ConciliarBankFeeLockedSource[],
): Promise<readonly ConciliarBankFeeBatchResult[] | null> {
  const items = assertConciliarBankFeeBatchInput(input)
  const sourceByMovement = new Map(sources.map(source => [source.movementId, source]))
  if (sourceByMovement.size !== items.length) {
    providerFail(409, 'MOVIMIENTO_NO_ENCONTRADO', 'Una comisión ya no está disponible. Actualiza la lista.')
  }
  const records: ExistingB4Replay[] = await (tx as any).operacionJustificacionB4.findMany({
    where: { solicitadaPorId: actorId, idempotencyKey: { in: items.map(item => item.idempotencyKey) } },
    select: {
      id: true,
      movimientoId: true,
      idempotencyKey: true,
      payloadHash: true,
      estado: true,
      versionEsperada: true,
      versionResultante: true,
      revertidaAt: true,
      snapshotResultado: true,
    },
  })
  if (!records.length) return null
  if (records.length !== items.length) {
    providerFail(409, 'B4_IDEMPOTENCY_INCOMPLETA', 'La selección conserva una idempotencia parcial; actualiza la lista.')
  }
  const byKey = new Map(records.map(record => [record.idempotencyKey, record]))
  const expectedB8 = buildConciliarBankFeeEmptyB8Receipt()
  for (const item of items) {
    const existing = byKey.get(item.idempotencyKey)
    const expectedId = derivedUuidV4('CONCILIAR_FEE_B4_V1', `${input.operationId}:${item.movimientoId}`)
    const expectedRequest = buildConciliarBankFeeB4Request(item)
    const expectedResult: B4ResultSnapshot = { estado: 'NO_REQUIERE', motivoNoRequiere: 'COMISION_BANCARIA', version: item.version + 1 }
    if (!existing || existing.id !== expectedId || existing.movimientoId !== item.movimientoId
      || existing.payloadHash !== conciliarHash(expectedRequest) || existing.versionEsperada !== item.version
      || existing.versionResultante !== item.version + 1 || existing.estado !== 'APLICADA' || existing.revertidaAt !== null
      || !sameCanonical(jsonRecord(existing.snapshotResultado), expectedResult)) {
      providerFail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La decisión ya existe fuera del recibo actual; actualiza la lista.')
    }
  }

  const receipts: Array<{ operacionB4Id: string; actorId: number; idempotencyKey: string; metadataHash: string; relatedSourceHashP2: string; snapshotSolicitud: unknown; snapshotResultado: unknown }> = await (tx as any).reciboEleccionCentroB8.findMany({
    where: { operacionB4Id: { in: records.map(record => record.id) } },
    select: {
      operacionB4Id: true,
      actorId: true,
      idempotencyKey: true,
      metadataHash: true,
      relatedSourceHashP2: true,
      snapshotSolicitud: true,
      snapshotResultado: true,
    },
  })
  const receiptByOperation = new Map(receipts.map(receipt => [receipt.operacionB4Id, receipt]))
  for (const record of records) {
    const receipt = receiptByOperation.get(record.id)
    if (!receipt || receipt.actorId !== actorId || receipt.idempotencyKey !== record.idempotencyKey
      || receipt.metadataHash !== expectedB8.metadataHash || receipt.relatedSourceHashP2 !== expectedB8.relatedSourceHashP2
      || !sameCanonical(jsonRecord(receipt.snapshotSolicitud), expectedB8.snapshotSolicitud)
      || !sameCanonical(jsonRecord(receipt.snapshotResultado), expectedB8.snapshotResultado)) {
      providerFail(409, 'B8_RECEIPT_MISSING', 'La decisión existente no conserva su recibo B8 vacío verificable.')
    }
  }

  const p1Keys = items.map(item => derivedUuidV4('CONCILIAR_COUNTERPARTY_P1_V1', `${input.operationId}:${item.movimientoId}`))
  const p1Rows = await tx.$queryRaw<ExistingP1Replay[]>(Prisma.sql`
    SELECT d.id::text AS "decisionId",d.movimiento_id AS "movementId",d.idempotency_key::text AS "idempotencyKey",
      d.accion::text AS action,d.tipo_tercero::text AS tipo,d.origen::text AS origin,d.candidato_hash AS "candidateHash",
      d.request_hash AS "requestHash",d.snapshot,
      (SELECT COUNT(*)::int FROM decisiones_tercero_modo_facil current_decision WHERE current_decision.movimiento_id=d.movimiento_id) AS version
    FROM decisiones_tercero_modo_facil d
    WHERE d.actor_id=${actorId} AND d.idempotency_key IN (${Prisma.join(p1Keys.map(key => Prisma.sql`CAST(${key} AS uuid)`) )})
    ORDER BY d.movimiento_id ASC
    FOR KEY SHARE
  `)
  const p1ByKey = new Map(p1Rows.map(row => [row.idempotencyKey, row]))
  return items.map(item => {
    const source = sourceByMovement.get(item.movimientoId)
    if (!source) providerFail(409, 'MOVIMIENTO_NO_ENCONTRADO', 'Una comisión ya no está disponible. Actualiza la lista.')
    const p1 = p1ByKey.get(derivedUuidV4('CONCILIAR_COUNTERPARTY_P1_V1', `${input.operationId}:${item.movimientoId}`))
    if (!p1) {
      if (source.entityId && !source.activeP1Id) {
        providerFail(409, 'P1_RECIBO_MISSING', 'La comisión conserva una ficha bancaria vigente pero falta su recibo P1 propio.')
      }
      return { rowId: item.rowId, operationB4Id: derivedUuidV4('CONCILIAR_FEE_B4_V1', `${input.operationId}:${item.movimientoId}`), counterpartyReceipt: null }
    }
    if (!source.entityId) {
      // The current AAPP fiscal source is gone. Do not expose/adopt an old P1
      // receipt on replay; a null receipt is the documented missing-identity
      // outcome and B4/B8 still retain their immutable original evidence.
      return { rowId: item.rowId, operationB4Id: derivedUuidV4('CONCILIAR_FEE_B4_V1', `${input.operationId}:${item.movimientoId}`), counterpartyReceipt: null }
    }
    if (source.activeP1Id && source.activeP1Id !== p1.decisionId) {
      // A later/live P1 belongs to another decision. It is never adopted into
      // this Conciliar receipt; the allowed outcome is the documented null.
      return { rowId: item.rowId, operationB4Id: derivedUuidV4('CONCILIAR_FEE_B4_V1', `${input.operationId}:${item.movimientoId}`), counterpartyReceipt: null }
    }
    const currentVersion = asInt(p1.version, 'P1_VERSION_INVALIDA')
    const p1Version = currentVersion - 1
    const candidateHash = counterpartyCandidateHash({ movimientoId: item.movimientoId, tipoTercero: 'BANCO', origen: 'ENTIDAD_FISCAL', sourceIdentity: `EF:${source.entityId}` })
    const p1Input: ConfirmCounterpartyInput = {
      action: 'confirmar', movimientoId: item.movimientoId, version: p1Version,
      sugerenciaId: `p1_${candidateHash}`,
      idempotencyKey: p1.idempotencyKey, confirmacion: true,
    }
    if (p1Version < 0 || p1.movementId !== item.movimientoId || source.activeP1Id !== p1.decisionId
      || p1.action !== 'CONFIRMADA' || p1.tipo !== 'BANCO' || p1.origin !== 'ENTIDAD_FISCAL'
      || p1.candidateHash !== candidateHash || p1.requestHash !== counterpartyRequestHash(actorId, p1Input)
      || jsonRecord(p1.snapshot).schema !== 'EASY_COUNTERPARTY_RECEIPT_V1'
      || jsonRecord(p1.snapshot).candidateHash !== candidateHash
      || jsonRecord(p1.snapshot).sourceHash !== counterpartySha256({ schema: 'EASY_COUNTERPARTY_SOURCE_V1', sourceIdentity: `EF:${source.entityId}` })
      || jsonRecord(p1.snapshot).origin !== 'ENTIDAD_FISCAL') {
      providerFail(409, 'P1_IDEMPOTENCY_EXTERNA', 'La decisión de tercero existente no corresponde a la comisión actual.')
    }
    return {
      rowId: item.rowId,
      operationB4Id: derivedUuidV4('CONCILIAR_FEE_B4_V1', `${input.operationId}:${item.movimientoId}`),
      counterpartyReceipt: {
        schema: 'CONCILIAR_COUNTERPARTY_RECEIPT_V1',
        actorId,
        operationId: input.operationId,
        movementId: item.movimientoId,
        decisionId: p1.decisionId,
        version: currentVersion,
        sourceKind: 'COMISION_BANCARIA',
        tipoTercero: 'BANCO',
      },
    }
  })
}

function countFrom(result: unknown, code: string): number {
  const value = (result as { count?: unknown } | null)?.count
  if (!Number.isSafeInteger(value)) providerFail(500, code, 'No se pudo conservar el recibo de conciliación.')
  return value as number
}

async function requireBatchEffectiveActorTx(tx: Tx, actorId: number): Promise<void> {
  await assertFinanceEasyRuntime(tx)
  const b4Access = await requireB4ActorAccess(actorId, 'escritura', tx)
  if ('response' in b4Access) {
    providerFail(b4Access.response.status, 'ACCESS_REVOKED', 'Tu permiso para conciliar ya no está vigente.')
  }
  try {
    await requireActualActorPermissionB8Tx(tx, actorId, 'escritura')
  } catch (error) {
    if (error instanceof B8CentroCosteServiceError) providerFail(error.status, error.code, error.message)
    throw error
  }
}

async function persistConciliarBankFeeBatchTx(
  tx: Tx,
  actorId: number,
  prepared: readonly ConciliarBankFeePrepared[],
): Promise<void> {
  const now = new Date()
  const operations = await (tx as any).operacionJustificacionB4.createMany({
    data: prepared.map(item => ({
      id: item.operationB4Id,
      movimientoId: item.movementId,
      estado: 'APLICADA',
      idempotencyKey: item.idempotencyKey,
      payloadHash: item.b4PayloadHash,
      versionEsperada: item.version,
      versionResultante: item.resultState.version,
      solicitadaPorId: actorId,
      aprobadaPorId: actorId,
      snapshotSolicitud: item.b4Request,
      snapshotEstadoPrevio: item.previousState,
      snapshotResultado: item.resultState,
      aprobadaAt: now,
      aplicadaAt: now,
    })),
  })
  if (countFrom(operations, 'B4_OPERACIONES_NO_CREADAS') !== prepared.length) {
    providerFail(409, 'B4_OPERACIONES_NO_CREADAS', 'No se pudieron conservar todas las decisiones B4.')
  }

  const withoutState = prepared.filter(item => !item.hadStoredState)
  if (withoutState.length) {
    const states = await (tx as any).estadoJustificacionMovimientoB4.createMany({
      data: withoutState.map(item => ({
        movimientoId: item.movementId,
        estado: 'NO_REQUIERE',
        motivoNoRequiere: 'COMISION_BANCARIA',
        version: item.resultState.version,
        actualizadoPorId: actorId,
      })),
    })
    if (countFrom(states, 'B4_ESTADOS_NO_CREADOS') !== withoutState.length) {
      providerFail(409, 'B4_ESTADOS_NO_CREADOS', 'No se pudieron conservar todos los estados B4.')
    }
  }

  const withState = prepared.filter(item => item.hadStoredState)
  if (withState.length) {
    const values = withState.map(item => Prisma.sql`(${item.movementId},${item.version})`)
    const states = await tx.$queryRaw<Array<{ movementId: string }>>(Prisma.sql`
      UPDATE estado_justificacion_movimientos AS e
         SET estado='NO_REQUIERE'::"EstadoJustificacionMovimiento",
             motivo_no_requiere='COMISION_BANCARIA'::"MotivoNoRequiere",
             version=e.version+1,
             actualizado_por_id=${actorId}
        FROM (VALUES ${Prisma.join(values)}) AS selected(movimiento_id,version_esperada)
       WHERE e.movimiento_id=selected.movimiento_id
         AND e.estado='SIN_DOCUMENTO'::"EstadoJustificacionMovimiento"
         AND e.version=selected.version_esperada
      RETURNING e.movimiento_id AS "movementId"
    `)
    if (states.length !== withState.length) {
      providerFail(409, 'VERSION_CONFLICT', 'Una comisión cambió mientras se confirmaba; actualiza la lista.')
    }
  }

  const events = await (tx as any).eventoJustificacionB4.createMany({
    data: prepared.flatMap(item => ['SOLICITUD', 'APROBACION', 'APLICACION'].map(accion => ({
      operacionId: item.operationB4Id,
      movimientoId: item.movementId,
      accion,
      actorId,
      detalle: buildConciliarBankFeeB4EventDetail(item.resultState.version),
    }))),
  })
  if (countFrom(events, 'B4_AUDITORIA_NO_CREADA') !== prepared.length * 3) {
    providerFail(500, 'B4_AUDITORIA_NO_CREADA', 'No se pudo conservar la auditoría B4.')
  }

  const b8 = await (tx as any).reciboEleccionCentroB8.createMany({
    data: prepared.map(item => ({
      operacionB4Id: item.operationB4Id,
      actorId,
      idempotencyKey: item.idempotencyKey,
      metadataHash: item.b8.metadataHash,
      relatedSourceHashP2: item.b8.relatedSourceHashP2,
      sourceNoteRule: B8_SOURCE_NOTE_RULE,
      snapshotSolicitud: item.b8.snapshotSolicitud,
      snapshotResultado: item.b8.snapshotResultado,
    })),
  })
  if (countFrom(b8, 'B8_RECIBOS_NO_CREADOS') !== prepared.length) {
    providerFail(500, 'B8_RECIBOS_NO_CREADOS', 'No se pudo conservar el recibo B8 de todas las comisiones.')
  }

  const p1Items = prepared.flatMap(item => item.p1 ? [{ item, p1: item.p1 }] : [])
  if (p1Items.length) {
    const p1 = await (tx as any).decisionTerceroModoFacil.createMany({
      data: p1Items.map(({ item, p1 }) => ({
        id: p1.decisionId,
        movimientoId: item.movementId,
        actorId,
        accion: 'CONFIRMADA',
        tipoTercero: 'BANCO',
        origen: 'ENTIDAD_FISCAL',
        candidatoHash: p1.candidateHash,
        idempotencyKey: p1.idempotencyKey,
        requestHash: p1.requestHash,
        revierteId: null,
        snapshot: p1.snapshot,
      })),
    })
    if (countFrom(p1, 'P1_DECISIONES_NO_CREADAS') !== p1Items.length) {
      providerFail(500, 'P1_DECISIONES_NO_CREADAS', 'No se pudo conservar la decisión P1 de las comisiones con ficha bancaria.')
    }
  }
}

/**
 * Real set-based provider for a closed homogeneous selection of bank fees. It is
 * invoked inside Conciliar's existing SERIALIZABLE transaction and returns only
 * after B4/B8/P1 DML is appended (never after commit). A later exception rolls
 * back the full package, including all provisional per-row progress.
 */
export async function tryConfirmConciliarBankFeeBatchTx(
  base: Prisma.TransactionClient,
  actorId: number,
  input: ConciliarBankFeeBatchInput,
): Promise<readonly ConciliarBankFeeBatchResult[]> {
  const tx = base as Tx
  const items = assertConciliarBankFeeBatchInput(input)
  await requireBatchEffectiveActorTx(tx, actorId)
  await lockB4FeeMovementsTx(tx, items.map(item => item.movimientoId))
  const sources = await lockedFeeSourcesTx(tx, [...new Set(items.map(item => item.movimientoId))].sort((left, right) => left.localeCompare(right)))
  const replay = await existingBatchReplayTx(tx, actorId, input, sources)
  if (replay) return replay
  const prepared = prepareConciliarBankFeeBatchRows(input, actorId, sources)
  await lockP1FeeMovementsTx(tx, prepared.filter(item => item.p1 !== null).map(item => item.movementId))
  await persistConciliarBankFeeBatchTx(tx, actorId, prepared)
  return prepared.map(item => ({
    rowId: item.rowId,
    operationB4Id: item.operationB4Id,
    counterpartyReceipt: item.p1?.receipt ?? null,
  }))
}
