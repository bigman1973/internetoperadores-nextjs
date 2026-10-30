import { Prisma } from '@prisma/client'
import { confirmarB4Tx, deshacerB4Tx } from '@/lib/finanzas/reconciliation-db'
import { derivedUuidV4 } from './easy-auto-core'
import { ConciliarDbError } from './conciliar-errors'
import { CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE } from './conciliar-own-account-proof-core'
import { readManualOwnAccountProofTx } from './conciliar-own-account-proof-db'
import {
  classifyConciliarOwnTransferReviews,
  hasExactOwnRecipientEvidence,
  normalizedRegisteredOwnIban,
  type ConciliarTransferReviewMovement,
} from './conciliar-transfer-classifier'

/**
 * Ruta humana de traspasos propios.
 *
 * Esta vía no llama ni amplía `readStrictOwnTransfers`: la automática conserva
 * sus requisitos independientes de cadena de saldo y cobertura de extracto.
 * Antes de escribir, el motor reconstruye la misma clasificación de revisión
 * que produce el verde manual, dentro de la transacción SERIALIZABLE ya abierta.
 */

type Tx = Prisma.TransactionClient & Record<string, any>

const SHA256 = /^[a-f0-9]{64}$/
const MOVEMENT_ID = /^[A-Za-z0-9:_-]{1,160}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INT_MIN = -2_147_483_648
const INT_MAX = 2_147_483_647
const MAX_MANUAL_OWN_TRANSFER_POPULATION = 25_000

const fail = (code: string, message: string): never => {
  throw new ConciliarDbError(409, code, message)
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null
}

function stringId(value: unknown): string | null {
  return typeof value === 'string' && MOVEMENT_ID.test(value) ? value : null
}

function integer(value: unknown, minimum = INT_MIN, maximum = INT_MAX): number | null {
  const normalized = typeof value === 'bigint' ? Number(value) : value
  return Number.isSafeInteger(normalized) && (normalized as number) >= minimum && (normalized as number) <= maximum
    ? Number(normalized)
    : null
}

function uuid(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export type ConciliarHumanOwnTransferSource = Readonly<{
  kind: 'TRANSFERENCIA_PROPIA_MANUAL'
  movimientoId: string
  movimientoParId: string
  pairId: string
  proofSource: typeof CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE
  versionB4: number
}>

export type ConciliarHumanOwnTransferAction = Readonly<{
  kind: 'CONFIRMAR_PAREJA_PROPIA'
  /** Clave opaca de agrupación visual. Nunca se acepta de vuelta como input HTTP. */
  pairId: string
}>

/** Sólo una fuente completa y sellada puede habilitar la acción humana. */
export function parseConciliarHumanOwnTransferSource(value: unknown): ConciliarHumanOwnTransferSource | null {
  const source = record(value)
  const keys = ['kind', 'movimientoId', 'movimientoParId', 'pairId', 'proofSource', 'versionB4']
  if (!source || Object.keys(source).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(source, key))) return null
  const movimientoId = stringId(source.movimientoId)
  const movimientoParId = stringId(source.movimientoParId)
  const versionB4 = integer(source.versionB4, 1, INT_MAX)
  if (source.kind !== 'TRANSFERENCIA_PROPIA_MANUAL' || !movimientoId || !movimientoParId || movimientoId === movimientoParId
    || typeof source.pairId !== 'string' || !SHA256.test(source.pairId)
    || source.proofSource !== CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE || versionB4 === null) return null
  return { kind: 'TRANSFERENCIA_PROPIA_MANUAL', movimientoId, movimientoParId, pairId: source.pairId, proofSource: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE, versionB4 }
}

/**
 * La capacidad de pantalla se deriva sólo de la proyección sellada. El navegador
 * recibe una capacidad, no una evidencia económica ni una orden de B4.
 */
export function humanOwnTransferActionForProjection(input: Readonly<{
  color: unknown
  seleccionable: unknown
  grupo: unknown
  source: unknown
}>): ConciliarHumanOwnTransferAction | null {
  const source = parseConciliarHumanOwnTransferSource(input.source)
  if (!source || input.color !== 'VERDE' || input.seleccionable !== false || input.grupo !== 'TRASPASOS_PROPIOS') return null
  return { kind: 'CONFIRMAR_PAREJA_PROPIA', pairId: source.pairId }
}

/** Datos mínimos, ya extraídos de filas bancarias; no existe un DTO de navegador equivalente. */
export type ConciliarManualOwnTransferLiveMovement = Readonly<{
  id: unknown
  cuentaId: unknown
  fecha: unknown
  importeCentimos: unknown
  versionB4: unknown
  concepto: unknown
  referencia: unknown
  infoAdicional: unknown
  tercero: unknown
  banco: unknown
  tieneTerceroConfirmado: unknown
  tieneVinculoDocumental: unknown
  tieneCuentaPropiaConfirmada: unknown
}>

function nullableText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Adaptador compartido por proyección y preflight. Mantiene las exclusiones P1
 * real/documental y la evidencia de destinatario propio exactamente en el mismo
 * núcleo clasificador; nunca infiere propiedad desde texto libre.
 */
export function manualOwnTransferReviewMovement(
  raw: ConciliarManualOwnTransferLiveMovement,
  registeredAttestedOwnIbanKeys: ReadonlySet<string>,
): ConciliarTransferReviewMovement | null {
  const id = stringId(raw.id)
  const cuentaId = stringId(raw.cuentaId)
  const importeCentimos = integer(raw.importeCentimos)
  const versionB4 = integer(raw.versionB4, 1, INT_MAX)
  if (!id || !cuentaId || !validDay(raw.fecha) || importeCentimos === null || versionB4 === null) return null
  const movement: ConciliarTransferReviewMovement = {
    id,
    cuentaId,
    fecha: raw.fecha,
    importeCentimos,
    versionB4,
    concepto: nullableText(raw.concepto),
    referencia: nullableText(raw.referencia),
    infoAdicional: nullableText(raw.infoAdicional),
    tercero: nullableText(raw.tercero),
    bancoCuenta: nullableText(raw.banco),
    thirdPartyConfirmed: raw.tieneTerceroConfirmado === true,
    documentaryLinked: raw.tieneVinculoDocumental === true,
    ownRecipientExplicit: raw.tieneCuentaPropiaConfirmada === true,
  }
  return {
    ...movement,
    ownRecipientExplicit: movement.ownRecipientExplicit || hasExactOwnRecipientEvidence(movement, registeredAttestedOwnIbanKeys),
  }
}

/** Núcleo de lectura compartido: tanto la proyección como el preflight de
 * escritura llaman a este adaptador antes del clasificador recíproco. */
export function classifyConciliarHumanOwnTransferRows(input: Readonly<{
  movements: readonly ConciliarManualOwnTransferLiveMovement[]
  attestedOwnAccountIds: ReadonlySet<string>
  registeredAttestedOwnIbanKeys: ReadonlySet<string>
}>) {
  const movements = input.movements.flatMap(raw => {
    const movement = manualOwnTransferReviewMovement(raw, input.registeredAttestedOwnIbanKeys)
    return movement ? [movement] : []
  })
  return {
    movements,
    reviews: classifyConciliarOwnTransferReviews({ movements, attestedOwnAccountIds: input.attestedOwnAccountIds }),
  }
}

export type ConciliarHumanOwnTransferPreflight = Readonly<{
  source: ConciliarHumanOwnTransferSource
  primary: ConciliarTransferReviewMovement
  paired: ConciliarTransferReviewMovement
}>

/**
 * Misma validación pura de lectura para el verde manual y para su confirmación:
 * dos cuentas atestadas, movimientos distintos, céntimos opuestos, máximo tres
 * días, exclusiones P1/documentales, unicidad y reciprocidad del pairId.
 */
export function preflightConciliarHumanOwnTransfer(input: Readonly<{
  source: unknown
  movements: readonly ConciliarManualOwnTransferLiveMovement[]
  attestedOwnAccountIds: ReadonlySet<string>
  registeredAttestedOwnIbanKeys: ReadonlySet<string>
}>): ConciliarHumanOwnTransferPreflight | null {
  const source = parseConciliarHumanOwnTransferSource(input.source)
  const classified = classifyConciliarHumanOwnTransferRows(input)
  if (!source || new Set(classified.movements.map(movement => movement.id)).size !== classified.movements.length) return null
  const movements = new Map(classified.movements.map(movement => [movement.id, movement]))
  const primary = movements.get(source.movimientoId)
  const paired = movements.get(source.movimientoParId)
  if (!primary || !paired || primary.versionB4 !== source.versionB4) return null
  const reviews = classified.reviews
  const primaryReview = reviews.get(primary.id)
  const pairedReview = reviews.get(paired.id)
  if (primaryReview?.kind !== 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA'
    || pairedReview?.kind !== 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA'
    || primaryReview.movimientoParId !== paired.id || pairedReview.movimientoParId !== primary.id
    || primaryReview.transferFingerprint !== source.pairId || pairedReview.transferFingerprint !== source.pairId) return null
  return { source, primary, paired }
}

async function lockMovements(tx: Tx, movementIds: readonly string[]): Promise<void> {
  for (const movementId of [...new Set(movementIds)].sort((left, right) => left.localeCompare(right))) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movementId} AS text),0))::text AS locked`)
  }
}

/** Mismo orden que la confirmación: evita que undo tome una pata mientras otra
 * transacción espera la otra y preserve la pareja como unidad atómica. */
export async function lockConciliarHumanOwnTransferUndoTx(
  base: Prisma.TransactionClient,
  rawLegResult: unknown,
): Promise<void> {
  const leg = parseConciliarHumanOwnTransferLegResult(rawLegResult)
  if (!leg) fail('RECIBO_MANUAL_INVALIDO', 'El recibo de la pareja propia no permite deshacerla con seguridad.')
  await lockMovements(base as Tx, [leg.primaryMovementId, leg.pairedMovementId])
}

/**
 * Lee la población viva que decide la unicidad. La lectura no repara ni
 * reconstruye proyecciones; está limitada y se usa sólo dentro del preflight de
 * la transacción serializable de la acción humana.
 */
async function readLiveManualOwnTransferPopulationTx(tx: Tx): Promise<readonly ConciliarManualOwnTransferLiveMovement[]> {
  const rows = await tx.$queryRaw<Array<ConciliarManualOwnTransferLiveMovement>>(Prisma.sql`
    SELECT m.id,m.cuenta_id AS "cuentaId",m.fecha_operacion::date::text AS fecha,
      b4_importe_bancario_centimos(m.importe) AS "importeCentimos",COALESCE(e.version,1) AS "versionB4",
      m.concepto,m.referencia,m.info_adicional AS "infoAdicional",m.tercero,c.banco,
      (m.factura_id IS NOT NULL OR m.gasto_id IS NOT NULL OR m.factura_emitida_id IS NOT NULL OR m.nomina_id IS NOT NULL
        OR m.entrega_a_cuenta_empleado_id IS NOT NULL) AS "tieneVinculoDocumental",
      EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND d.tipo_tercero<>'CUENTA_PROPIA'::"TipoTerceroModoFacil"
          AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ) AS "tieneTerceroConfirmado",
      EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND d.tipo_tercero='CUENTA_PROPIA'::"TipoTerceroModoFacil"
          AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ) AS "tieneCuentaPropiaConfirmada"
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND b4_importe_bancario_centimos(m.importe) IS NOT NULL
    ORDER BY m.fecha_operacion DESC,m.id ASC
    LIMIT ${MAX_MANUAL_OWN_TRANSFER_POPULATION + 1}
  `)
  return rows.length > MAX_MANUAL_OWN_TRANSFER_POPULATION ? [] : rows
}

async function lockSelectedManualOwnTransferMovementsTx(tx: Tx, movementIds: readonly string[]): Promise<readonly ConciliarManualOwnTransferLiveMovement[]> {
  const rows = await tx.$queryRaw<Array<ConciliarManualOwnTransferLiveMovement>>(Prisma.sql`
    SELECT m.id,m.cuenta_id AS "cuentaId",m.fecha_operacion::date::text AS fecha,
      b4_importe_bancario_centimos(m.importe) AS "importeCentimos",COALESCE(e.version,1) AS "versionB4",
      m.concepto,m.referencia,m.info_adicional AS "infoAdicional",m.tercero,c.banco,
      (m.factura_id IS NOT NULL OR m.gasto_id IS NOT NULL OR m.factura_emitida_id IS NOT NULL OR m.nomina_id IS NOT NULL
        OR m.entrega_a_cuenta_empleado_id IS NOT NULL) AS "tieneVinculoDocumental",
      EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND d.tipo_tercero<>'CUENTA_PROPIA'::"TipoTerceroModoFacil"
          AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ) AS "tieneTerceroConfirmado",
      EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND d.tipo_tercero='CUENTA_PROPIA'::"TipoTerceroModoFacil"
          AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ) AS "tieneCuentaPropiaConfirmada"
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.id IN (${Prisma.join(movementIds.map(movementId => Prisma.sql`${movementId}`))})
      AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND b4_importe_bancario_centimos(m.importe) IS NOT NULL
    ORDER BY m.id ASC
    FOR UPDATE OF m
  `)
  return rows
}

async function readAttestedIbanKeysTx(tx: Tx, accountIds: ReadonlySet<string>): Promise<ReadonlySet<string>> {
  const ids = [...accountIds].sort()
  if (!ids.length) return new Set()
  const rows = await tx.$queryRaw<Array<{ iban: string | null }>>(Prisma.sql`
    SELECT iban FROM cuentas_bancarias
    WHERE activa=true AND id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})
    ORDER BY id ASC LIMIT ${ids.length + 1}
  `)
  if (rows.length > ids.length) return new Set()
  return new Set(rows.flatMap(row => normalizedRegisteredOwnIban(row.iban) ?? []))
}

function confirmKey(operationId: string, movementId: string): string {
  return derivedUuidV4('CONCILIAR_HUMAN_OWN_TRANSFER_CONFIRM_V1', `${operationId}:${movementId}`)
}

function pairedUndoKey(undoOperationId: string, movementId: string): string {
  return derivedUuidV4('CONCILIAR_HUMAN_OWN_TRANSFER_PAIRED_UNDO_V1', `${undoOperationId}:${movementId}`)
}

export type ConciliarHumanOwnTransferLegResult = Readonly<{
  state: 'confirmada'
  sourceKind: 'TRANSFERENCIA_PROPIA_MANUAL'
  confirmationMode: 'HUMANA_PAREJA_ATESTADA_V1'
  proofSource: typeof CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE
  pairId: string
  pairedOperationB4Id: string
  pairedMovementId: string
  primaryMovementId: string
}>

/** El recibo es cerrado: no permite apuntar undo a una operación B4 ajena. */
export function parseConciliarHumanOwnTransferLegResult(value: unknown): ConciliarHumanOwnTransferLegResult | null {
  const result = typeof value === 'string'
    ? (() => { try { return record(JSON.parse(value)) } catch { return null } })()
    : record(value)
  const keys = ['state', 'sourceKind', 'confirmationMode', 'proofSource', 'pairId', 'pairedOperationB4Id', 'pairedMovementId', 'primaryMovementId']
  if (!result || Object.keys(result).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(result, key))) return null
  const pairedOperationB4Id = uuid(result.pairedOperationB4Id)
  const pairedMovementId = stringId(result.pairedMovementId)
  const primaryMovementId = stringId(result.primaryMovementId)
  if (result.state !== 'confirmada' || result.sourceKind !== 'TRANSFERENCIA_PROPIA_MANUAL'
    || result.confirmationMode !== 'HUMANA_PAREJA_ATESTADA_V1'
    || result.proofSource !== CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE
    || typeof result.pairId !== 'string' || !SHA256.test(result.pairId)
    || !pairedOperationB4Id || !pairedMovementId || !primaryMovementId || pairedMovementId === primaryMovementId) return null
  return {
    state: 'confirmada', sourceKind: 'TRANSFERENCIA_PROPIA_MANUAL', confirmationMode: 'HUMANA_PAREJA_ATESTADA_V1',
    proofSource: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE, pairId: result.pairId,
    pairedOperationB4Id, pairedMovementId, primaryMovementId,
  }
}

function isInternalTransferConfirmationSnapshot(value: unknown, movementId: string): boolean {
  const request = typeof value === 'string'
    ? (() => { try { return record(JSON.parse(value)) } catch { return null } })()
    : record(value)
  const draft = request ? record(request.borrador) : null
  const requestKeys = ['action', 'confirmacion', 'idempotencyKey', 'version', 'borrador']
  const draftKeys = ['movimientoId', 'importeMovimientoCentimos', 'estado', 'motivoNoRequiere', 'lineas']
  return !!request && Object.keys(request).length === requestKeys.length && requestKeys.every(key => Object.prototype.hasOwnProperty.call(request, key))
    && request.action === 'confirmar' && request.confirmacion === true && uuid(request.idempotencyKey) !== null
    && integer(request.version, 1, INT_MAX) !== null && !!draft
    && Object.keys(draft).length === draftKeys.length && draftKeys.every(key => Object.prototype.hasOwnProperty.call(draft, key))
    && draft.movimientoId === movementId && integer(draft.importeMovimientoCentimos) !== null
    && draft.estado === 'NO_REQUIERE' && draft.motivoNoRequiere === 'TRASPASO_INTERNO_SIN_DOCUMENTO'
    && Array.isArray(draft.lineas) && draft.lineas.length === 0
}

/** Valida la pata primaria sellada antes de revertir la pareja. Se llama desde
 * el deshacer general bajo el mismo SERIALIZABLE y bloqueo de recibo. */
export async function assertConciliarHumanOwnTransferPrimaryUndoTx(
  base: Prisma.TransactionClient,
  actorId: number,
  rawLegResult: unknown,
  primaryOperationB4Id: unknown,
): Promise<void> {
  const tx = base as Tx
  const leg = parseConciliarHumanOwnTransferLegResult(rawLegResult)
  const operationId = uuid(primaryOperationB4Id)
  if (!leg || !operationId || !Number.isSafeInteger(actorId) || actorId < 1) {
    fail('RECIBO_MANUAL_INVALIDO', 'El recibo de la pareja propia no permite deshacerla con seguridad.')
  }
  const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT o.id::text AS id,o.movimiento_id AS "movementId",o.solicitada_por_id AS "actorId",
      o.version_resultante AS version,o.estado::text AS state,(o.revertida_at IS NOT NULL) AS reverted,
      (o.revierte_operacion_id IS NOT NULL) AS "isReversal",o.snapshot_solicitud AS snapshot,e.version AS "liveVersion"
    FROM operaciones_justificacion_b4 o
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=o.movimiento_id
    WHERE o.id=CAST(${operationId} AS uuid)
    LIMIT 1 FOR UPDATE OF o,e
  `)
  const original = rows[0]
  const originalId = uuid(original?.id)
  const movementId = stringId(original?.movementId)
  const originalActorId = integer(original?.actorId, 1, INT_MAX)
  const version = integer(original?.version, 1, INT_MAX)
  const liveVersion = integer(original?.liveVersion, 1, INT_MAX)
  if (!originalId || originalId !== operationId || !movementId || movementId !== leg.primaryMovementId || originalActorId !== actorId
    || original?.state !== 'APLICADA' || original?.reverted !== false || original?.isReversal !== false
    || !isInternalTransferConfirmationSnapshot(original?.snapshot, movementId)
    || version === null || liveVersion === null || version !== liveVersion) {
    fail('RECIBO_CAMBIADO', 'La pata principal de la pareja propia cambió y no se puede deshacer con seguridad.')
  }
}

/** Revierte sólo la segunda pata. El llamador revierte la primaria en la misma
 * transacción; cualquier fallo deja ambas decisiones originales intactas. */
export async function undoConciliarHumanOwnTransferTx(
  base: Prisma.TransactionClient,
  actorId: number,
  rawLegResult: unknown,
  undoOperationId: string,
): Promise<Readonly<{ pairedOriginalOperationB4Id: string; pairedReversalOperationB4Id: string }>> {
  const tx = base as Tx
  const leg = parseConciliarHumanOwnTransferLegResult(rawLegResult)
  const receiptId = uuid(undoOperationId)
  if (!leg || !receiptId || !Number.isSafeInteger(actorId) || actorId < 1) {
    fail('RECIBO_MANUAL_INVALIDO', 'El recibo de la pareja propia no permite deshacerla con seguridad.')
  }
  const originals = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT o.id::text AS id,o.movimiento_id AS "movementId",o.solicitada_por_id AS "actorId",
      o.version_resultante AS version,o.estado::text AS state,(o.revertida_at IS NOT NULL) AS reverted,
      (o.revierte_operacion_id IS NOT NULL) AS "isReversal",o.snapshot_solicitud AS snapshot,e.version AS "liveVersion"
    FROM operaciones_justificacion_b4 o
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=o.movimiento_id
    WHERE o.id=CAST(${leg.pairedOperationB4Id} AS uuid)
    LIMIT 1 FOR UPDATE OF o,e
  `)
  const original = originals[0]
  const originalId = uuid(original?.id)
  const movementId = stringId(original?.movementId)
  const originalActorId = integer(original?.actorId, 1, INT_MAX)
  const version = integer(original?.version, 1, INT_MAX)
  const liveVersion = integer(original?.liveVersion, 1, INT_MAX)
  if (!originalId || !movementId || movementId !== leg.pairedMovementId || originalActorId !== actorId
    || original?.state !== 'APLICADA' || original?.reverted !== false || original?.isReversal !== false
    || !isInternalTransferConfirmationSnapshot(original?.snapshot, movementId)
    || version === null || liveVersion === null || version !== liveVersion) {
    fail('RECIBO_CAMBIADO', 'La otra pata de la pareja propia cambió y no se puede deshacer con seguridad.')
  }
  const reversal: any = await deshacerB4Tx(tx, actorId, {
    action: 'deshacer', confirmacion: true, idempotencyKey: pairedUndoKey(receiptId, movementId),
    version: liveVersion, operacionId: originalId, lineas: [],
  })
  const reversalId = uuid(reversal?.operacion?.id)
  if (reversal?.idempotente || !reversalId) {
    fail('B4_IDEMPOTENCY_EXTERNA', 'La otra pata de la pareja propia ya cambió. Actualiza la lista.')
  }
  return { pairedOriginalOperationB4Id: originalId, pairedReversalOperationB4Id: reversalId }
}

/**
 * Confirma exactamente dos patas con el justificante B4 ya existente para
 * traspasos internos. Todo fallo de la segunda pata revierte la primera porque
 * este motor sólo opera dentro de la transacción SERIALIZABLE del llamador.
 */
export async function confirmConciliarHumanOwnTransferTx(
  base: Prisma.TransactionClient,
  actorId: number,
  operationId: string,
  rawSource: unknown,
  expectedPrimaryAmount: number,
): Promise<Readonly<{
  operationB4Id: string
  result: Readonly<{
    state: 'confirmada'
    sourceKind: 'TRANSFERENCIA_PROPIA_MANUAL'
    confirmationMode: 'HUMANA_PAREJA_ATESTADA_V1'
    proofSource: typeof CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE
    pairId: string
    pairedOperationB4Id: string
    pairedMovementId: string
    primaryMovementId: string
  }>
}>> {
  const tx = base as Tx
  const source = parseConciliarHumanOwnTransferSource(rawSource)
  if (!source || !Number.isSafeInteger(actorId) || actorId < 1 || !Number.isSafeInteger(expectedPrimaryAmount)) {
    fail('TRANSFERENCIA_MANUAL_INVALIDA', 'La pareja de traspaso propia ya no es válida. Actualiza la lista.')
  }
  const movementIds = [source.movimientoId, source.movimientoParId]
  await lockMovements(tx, movementIds)
  const locked = await lockSelectedManualOwnTransferMovementsTx(tx, movementIds)
  if (locked.length !== movementIds.length || new Set(locked.map(row => String(row.id))).size !== movementIds.length) {
    fail('TRANSFERENCIA_CAMBIADA', 'Uno de los movimientos ya tiene una decisión o cambió. Actualiza la lista.')
  }

  const population = await readLiveManualOwnTransferPopulationTx(tx)
  if (!population.length) fail('TRANSFERENCIA_CAMBIADA', 'No se puede volver a comprobar la pareja de traspaso. Actualiza la lista.')
  const proof = await readManualOwnAccountProofTx(tx, population.map(row => String(row.cuentaId)))
  const ibanKeys = await readAttestedIbanKeysTx(tx, proof.proof.accountIds)
  const preflight = preflightConciliarHumanOwnTransfer({
    source,
    movements: population,
    attestedOwnAccountIds: proof.proof.accountIds,
    registeredAttestedOwnIbanKeys: ibanKeys,
  })
  if (!preflight || preflight.primary.importeCentimos !== expectedPrimaryAmount || preflight.paired.importeCentimos !== -expectedPrimaryAmount) {
    fail('TRANSFERENCIA_CAMBIADA', 'La pareja ya no cumple la comprobación humana de cuentas propias. Actualiza la lista.')
  }

  const lockedById = new Map(locked.map(row => [String(row.id), row]))
  const lockedPrimary = manualOwnTransferReviewMovement(lockedById.get(preflight.primary.id)!, ibanKeys)
  const lockedPaired = manualOwnTransferReviewMovement(lockedById.get(preflight.paired.id)!, ibanKeys)
  if (!lockedPrimary || !lockedPaired
    || lockedPrimary.versionB4 !== preflight.primary.versionB4 || lockedPaired.versionB4 !== preflight.paired.versionB4
    || lockedPrimary.importeCentimos !== preflight.primary.importeCentimos || lockedPaired.importeCentimos !== preflight.paired.importeCentimos) {
    fail('TRANSFERENCIA_CAMBIADA', 'Los movimientos cambiaron mientras se comprobaba la pareja. Actualiza la lista.')
  }

  const primaryResult: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey: confirmKey(operationId, preflight.primary.id), version: preflight.primary.versionB4,
    borrador: {
      movimientoId: preflight.primary.id, importeMovimientoCentimos: preflight.primary.importeCentimos,
      estado: 'NO_REQUIERE', motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO', lineas: [],
    },
  })
  const primaryOperationB4Id = uuid(primaryResult?.operacion?.id)
  if (primaryResult?.idempotente || !primaryOperationB4Id) {
    fail('B4_IDEMPOTENCY_EXTERNA', 'La primera pata ya tiene una decisión distinta. Actualiza la lista.')
  }

  const pairedResult: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true, idempotencyKey: confirmKey(operationId, preflight.paired.id), version: preflight.paired.versionB4,
    borrador: {
      movimientoId: preflight.paired.id, importeMovimientoCentimos: preflight.paired.importeCentimos,
      estado: 'NO_REQUIERE', motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO', lineas: [],
    },
  })
  const pairedOperationB4Id = uuid(pairedResult?.operacion?.id)
  if (pairedResult?.idempotente || !pairedOperationB4Id) {
    fail('B4_IDEMPOTENCY_EXTERNA', 'La segunda pata ya tiene una decisión distinta. Actualiza la lista.')
  }

  return {
    operationB4Id: primaryOperationB4Id,
    result: {
      state: 'confirmada',
      sourceKind: 'TRANSFERENCIA_PROPIA_MANUAL',
      confirmationMode: 'HUMANA_PAREJA_ATESTADA_V1',
      proofSource: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE,
      pairId: source.pairId,
      pairedOperationB4Id,
      pairedMovementId: preflight.paired.id,
      primaryMovementId: preflight.primary.id,
    },
  }
}
