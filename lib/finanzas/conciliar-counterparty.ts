import { Prisma } from '@prisma/client'
import { derivedUuidV4 } from '@/lib/finanzas/easy-auto-core'
import {
  counterpartySuggestionId,
  type CounterpartyCandidateSeed,
  type CounterpartyType,
} from '@/lib/finanzas/easy-counterparty-core'
import {
  EasyCounterpartyServiceError,
  mutateEasyCounterpartyTx,
  readEasyCounterpartyBulkMaterialByIdsTx,
} from '@/lib/finanzas/easy-counterparty-db'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import type { ConciliarProjectionSource } from './conciliar-contract'

/**
 * P1 documental para Conciliar.
 *
 * No es un paso de UI, no crea fichas y no usa texto bancario. El padre lo llama
 * dentro de su misma transacción serializable después de confirmar/revalidar la
 * evidencia B4 documental y conserva el recibo devuelto en `leg.result`.
 */

type Tx = Prisma.TransactionClient & Record<string, any>

export type ConciliarCounterpartyDecision = Readonly<{
  assigned: true
  decisionId: string
  version: number
  movementId: string
  tipoTercero: CounterpartyType
  receipt: ConciliarCounterpartyReceipt
}>

export type ConciliarCounterpartyNoDecision = Readonly<{
  assigned: false
  movementId: string | null
  reason:
    | 'FILA_SIN_MOVIMIENTO'
    | 'FUENTE_SIN_IDENTIDAD_DOCUMENTAL'
    | 'CLIENTES_MULTIPLES'
    | 'FICHA_INEXISTENTE_O_AMBIGUA'
    | 'TIPO_O_SIGNO_INCOMPATIBLE'
    | 'DECISION_P1_YA_VIGENTE'
    | 'MATERIAL_P1_NO_DISPONIBLE'
}>

export type ConciliarCounterpartyAssignment = ConciliarCounterpartyDecision | ConciliarCounterpartyNoDecision

/** Sólo el recibo creado por este helper puede deshacerse con el helper gemelo. */
export type ConciliarCounterpartyReceipt = Readonly<{
  schema: 'CONCILIAR_COUNTERPARTY_RECEIPT_V1'
  actorId: number
  operationId: string
  movementId: string
  decisionId: string
  version: number
  sourceKind: ConciliarProjectionSource['kind']
  tipoTercero: CounterpartyType
}>

export type ConciliarCounterpartyDocumentalSource = Pick<ConciliarProjectionSource,
  'kind' | 'movimientoId' | 'facturaEmitidaId' | 'facturaRecibidaId' | 'nominaId' | 'propuestaId' | 'confirmingId'
>

type DocumentaryIdentity = Readonly<{
  type: CounterpartyType
  origin: 'ENTIDAD_FISCAL' | 'EMPLEADO'
  sourceIdentity: string
}>

type IdentityRow = Readonly<{
  sourceKind: string
  sourceId: string | null
  tipo: string | null
  entityId: string | null
  employeeId: string | null
  entityCount: number | bigint | string | null
}>

function noAssignment(movementId: string | null, reason: ConciliarCounterpartyNoDecision['reason']): ConciliarCounterpartyNoDecision {
  return { assigned: false, movementId, reason }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function integer(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function validActorId(actorId: unknown): actorId is number {
  return typeof actorId === 'number' && Number.isSafeInteger(actorId) && actorId > 0
}

/**
 * Pure compatibility gate shared by synthetic tests. Source kinds deliberately
 * prescribe only existing roles; no operation may recast an entity from its
 * registered fiscal role based on sign/text.
 */
export function documentaryCounterpartyTypeIsCompatible(
  sourceKind: ConciliarProjectionSource['kind'],
  type: CounterpartyType,
  importeCentimos: number,
): boolean {
  if (!Number.isSafeInteger(importeCentimos) || importeCentimos === 0) return false
  if (sourceKind === 'PAGO_FACTURA_RECIBIDA') return type === 'PROVEEDOR' && importeCentimos < 0
  if (sourceKind === 'PAGO_NOMINA') return type === 'EMPLEADO' && importeCentimos < 0
  if (sourceKind === 'COBRO_CONFIRMING') return type === 'CLIENTE' && importeCentimos > 0
  // A collection proposal can contain several invoices/clients. It may only use
  // the unique registered client returned by the exact documentary query below.
  if (sourceKind === 'COBRO_PROPUESTA') return type === 'CLIENTE' && importeCentimos > 0
  if (sourceKind === 'COMISION_BANCARIA') return type === 'BANCO'
  return false
}

/**
 * Pure source guard. The operation is intentionally silent for fee/pending rows:
 * B4 remains valid and P1 is simply not augmented.
 */
export function isDocumentaryCounterpartySource(source: ConciliarCounterpartyDocumentalSource): boolean {
  return !!text(source.movimientoId) && (
    (source.kind === 'PAGO_FACTURA_RECIBIDA' && !!text(source.facturaRecibidaId))
    || (source.kind === 'PAGO_NOMINA' && !!text(source.nominaId))
    || (source.kind === 'COBRO_CONFIRMING' && !!text(source.confirmingId))
    || (source.kind === 'COBRO_PROPUESTA' && !!text(source.propuestaId))
    // B4 may classify a bank fee as NO_REQUIERE. It may supplement P1 only if
    // the movement already has the exact registered AAPP/bank fiscal identity.
    || source.kind === 'COMISION_BANCARIA'
  )
}

/** Resolves an exact *registered* identity only. `null` never means "try text". */
export function documentaryIdentityFromRow(row: IdentityRow): DocumentaryIdentity | null | 'CLIENTES_MULTIPLES' {
  const sourceKind = text(row.sourceKind)
  const sourceId = text(row.sourceId)
  const type = text(row.tipo)
  const entityId = text(row.entityId)
  const employeeId = text(row.employeeId)
  const entityCount = integer(row.entityCount)

  if (sourceKind === 'PAGO_FACTURA_RECIBIDA') {
    return sourceId && type === 'PROVEEDOR' && entityId
      ? { type: 'PROVEEDOR', origin: 'ENTIDAD_FISCAL', sourceIdentity: `EF:${entityId}` }
      : null
  }
  if (sourceKind === 'PAGO_NOMINA') {
    return sourceId && employeeId
      ? { type: 'EMPLEADO', origin: 'EMPLEADO', sourceIdentity: `EMPLEADO:${employeeId}` }
      : null
  }
  if (sourceKind === 'COBRO_CONFIRMING') {
    return sourceId && type === 'CLIENTE' && entityId
      ? { type: 'CLIENTE', origin: 'ENTIDAD_FISCAL', sourceIdentity: `EF:${entityId}` }
      : null
  }
  if (sourceKind === 'COBRO_PROPUESTA') {
    if (entityCount !== 1) return entityCount !== null && entityCount > 1 ? 'CLIENTES_MULTIPLES' : null
    return sourceId && type === 'CLIENTE' && entityId
      ? { type: 'CLIENTE', origin: 'ENTIDAD_FISCAL', sourceIdentity: `EF:${entityId}` }
      : null
  }
  if (sourceKind === 'COMISION_BANCARIA') {
    return sourceId && type === 'BANCO' && entityId
      ? { type: 'BANCO', origin: 'ENTIDAD_FISCAL', sourceIdentity: `EF:${entityId}` }
      : null
  }
  return null
}

/**
 * Builds the exact documentary identity query as a single bounded source read.
 * - received invoices use exactly one existing PROVEEDOR fiscal card by CIF;
 * - payroll uses its stored employee FK;
 * - confirming preserves every individual FE society and accepts only one
 *   registered CLIENTE fiscal card across its document lines;
 * - collection proposals rebuild their clients from FE FK/document composition;
 *   multiple clients are returned as an explicit no-assignment state.
 */
function identitySql(source: ConciliarCounterpartyDocumentalSource): Prisma.Sql | null {
  if (source.kind === 'PAGO_FACTURA_RECIBIDA' && source.facturaRecibidaId) return Prisma.sql`
    WITH matches AS (
      SELECT ef.id FROM facturas_recibidas fr
      JOIN entidades_fiscales ef ON ef.activo=true AND ef.tipo='PROVEEDOR'::"TipoEntidadFiscal"
        AND NULLIF(btrim(fr.cif),'') IS NOT NULL AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
        AND upper(btrim(ef.nif_cif))=upper(btrim(fr.cif))
      WHERE fr.id=${source.facturaRecibidaId}
    )
    SELECT 'PAGO_FACTURA_RECIBIDA'::text AS "sourceKind",${source.facturaRecibidaId}::text AS "sourceId",
      CASE WHEN COUNT(*)=1 THEN 'PROVEEDOR'::text ELSE NULL END AS tipo,
      CASE WHEN COUNT(*)=1 THEN (array_agg(id::text ORDER BY id::text))[1] ELSE NULL END AS "entityId",NULL::text AS "employeeId",COUNT(*)::int AS "entityCount"
    FROM matches
  `
  if (source.kind === 'PAGO_NOMINA' && source.nominaId) return Prisma.sql`
    SELECT 'PAGO_NOMINA'::text AS "sourceKind",n.id::text AS "sourceId",NULL::text AS tipo,
      NULL::text AS "entityId",e.id::text AS "employeeId",NULL::int AS "entityCount"
    FROM nominas n JOIN empleados e ON e.id=n.empleado_id
    WHERE n.id=${source.nominaId} LIMIT 1
  `
  if (source.kind === 'COBRO_CONFIRMING' && source.confirmingId) return Prisma.sql`
    WITH invoices AS (
      SELECT DISTINCT fe.id,fe.cif FROM confirming_lineas cl
      JOIN facturas_emitidas fe ON fe.id=cl.factura_emitida_id
      WHERE cl.confirming_id=${source.confirmingId}
    ), invoice_cards AS (
      SELECT i.id,
        (SELECT COUNT(*)::int FROM entidades_fiscales ef WHERE ef.activo=true AND ef.tipo='CLIENTE'::"TipoEntidadFiscal"
          AND NULLIF(btrim(i.cif),'') IS NOT NULL AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
          AND upper(btrim(ef.nif_cif))=upper(btrim(i.cif))) AS card_count,
        (SELECT (array_agg(ef.id::text ORDER BY ef.id::text))[1] FROM entidades_fiscales ef WHERE ef.activo=true AND ef.tipo='CLIENTE'::"TipoEntidadFiscal"
          AND NULLIF(btrim(i.cif),'') IS NOT NULL AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
          AND upper(btrim(ef.nif_cif))=upper(btrim(i.cif))) AS entity_id
      FROM invoices i
    )
    SELECT 'COBRO_CONFIRMING'::text AS "sourceKind",${source.confirmingId}::text AS "sourceId",
      CASE WHEN COUNT(*)>0 AND BOOL_AND(card_count=1) AND COUNT(DISTINCT entity_id)=1 THEN 'CLIENTE'::text ELSE NULL END AS tipo,
      CASE WHEN COUNT(*)>0 AND BOOL_AND(card_count=1) AND COUNT(DISTINCT entity_id)=1 THEN (array_agg(entity_id ORDER BY entity_id))[1] ELSE NULL END AS "entityId",NULL::text AS "employeeId",COUNT(DISTINCT entity_id)::int AS "entityCount"
    FROM invoice_cards
  `
  if (source.kind === 'COBRO_PROPUESTA' && source.propuestaId) return Prisma.sql`
    WITH invoices AS (
      SELECT DISTINCT fe.id,lower(NULLIF(btrim(fe.cliente),'')) AS client_key,fe.cif
      FROM modo_facil_propuestas_cobro p
      JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(p.composicion)='array' THEN p.composicion ELSE '[]'::jsonb END
      ) AS composition(value) ON true
      JOIN facturas_emitidas fe ON fe.id=NULLIF(btrim(composition.value->>'facturaEmitidaId'),'')
      WHERE p.id=CAST(${source.propuestaId} AS uuid)
        AND p.movimiento_id=${source.movimientoId}
    ), invoice_cards AS (
      SELECT i.id,i.client_key,
        (SELECT COUNT(*)::int FROM entidades_fiscales ef WHERE ef.activo=true AND ef.tipo='CLIENTE'::"TipoEntidadFiscal"
          AND NULLIF(btrim(i.cif),'') IS NOT NULL AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
          AND upper(btrim(ef.nif_cif))=upper(btrim(i.cif))) AS card_count,
        (SELECT (array_agg(ef.id::text ORDER BY ef.id::text))[1] FROM entidades_fiscales ef WHERE ef.activo=true AND ef.tipo='CLIENTE'::"TipoEntidadFiscal"
          AND NULLIF(btrim(i.cif),'') IS NOT NULL AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
          AND upper(btrim(ef.nif_cif))=upper(btrim(i.cif))) AS entity_id
      FROM invoices i
    )
    SELECT 'COBRO_PROPUESTA'::text AS "sourceKind",${source.propuestaId}::text AS "sourceId",
      CASE WHEN COUNT(*)>0 AND COUNT(DISTINCT client_key)=1 AND BOOL_AND(card_count=1) AND COUNT(DISTINCT entity_id)=1 THEN 'CLIENTE'::text ELSE NULL END AS tipo,
      CASE WHEN COUNT(*)>0 AND COUNT(DISTINCT client_key)=1 AND BOOL_AND(client_key IS NOT NULL) AND BOOL_AND(card_count=1) AND COUNT(DISTINCT entity_id)=1 THEN (array_agg(entity_id ORDER BY entity_id))[1] ELSE NULL END AS "entityId",NULL::text AS "employeeId",COUNT(DISTINCT client_key)::int AS "entityCount"
    FROM invoice_cards
  `
  if (source.kind === 'COMISION_BANCARIA' && source.movimientoId) return Prisma.sql`
    SELECT 'COMISION_BANCARIA'::text AS "sourceKind",m.id::text AS "sourceId",'BANCO'::text AS tipo,
      ef.id::text AS "entityId",NULL::text AS "employeeId",1::int AS "entityCount"
    FROM movimientos_bancarios m JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
      AND ef.activo=true AND ef.tipo='AAPP'::"TipoEntidadFiscal" AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
    WHERE m.id=${source.movimientoId} LIMIT 1
  `
  return null
}

function p1Key(operationId: string, movementId: string): string {
  return derivedUuidV4('CONCILIAR_COUNTERPARTY_P1_V1', `${operationId}:${movementId}`)
}

function undoP1Key(operationId: string, decisionId: string): string {
  return derivedUuidV4('CONCILIAR_COUNTERPARTY_P1_UNDO_V1', `${operationId}:${decisionId}`)
}

/**
 * Adds P1 only when a just-confirmed Conciliar row has one coherent existing
 * documentary identity. The caller owns the transaction; this function neither
 * opens `$transaction` nor performs B4/UI work.
 */
export async function assignConciliarDocumentaryCounterpartyTx(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    actorId: number
    operationId: string
    movementId: string
    importeCentimos: number
    source: ConciliarCounterpartyDocumentalSource
  }>,
): Promise<ConciliarCounterpartyAssignment> {
  const work = tx as Tx
  const movementId = text(input.movementId)
  const operationId = text(input.operationId)
  if (!movementId || !text(input.source.movimientoId) || input.source.movimientoId !== movementId) return noAssignment(movementId, 'FILA_SIN_MOVIMIENTO')
  if (!validActorId(input.actorId)) throw new Error('CONCILIAR_COUNTERPARTY_ACTOR_INVALIDO')
  if (!operationId) throw new Error('CONCILIAR_COUNTERPARTY_OPERATION_INVALIDA')
  const access = await requireB4ActorAccess(input.actorId, 'escritura')
  if ('response' in access) throw new EasyCounterpartyServiceError(access.response.status, 'ACCESS_REVOKED', 'El permiso B4 cambió; no se aplicó la decisión P1 documental.')
  if (!isDocumentaryCounterpartySource(input.source)) return noAssignment(movementId, 'FUENTE_SIN_IDENTIDAD_DOCUMENTAL')

  // This locks the movement and exposes the current P1 version/state. It is also
  // the mandated material re-read, so a prior P1 decision is never overwritten.
  const material = await readEasyCounterpartyBulkMaterialByIdsTx(tx, [movementId])
  const current = material[0]
  if (!current || current.id !== movementId) return noAssignment(movementId, 'MATERIAL_P1_NO_DISPONIBLE')
  if (current.importeCentimos !== input.importeCentimos) return noAssignment(movementId, 'TIPO_O_SIGNO_INCOMPATIBLE')
  const active = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT d.id::text AS id FROM decisiones_tercero_modo_facil d
    WHERE d.movimiento_id=${movementId} AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
      AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
    ORDER BY d.created_at DESC,d.id DESC LIMIT 1 FOR KEY SHARE
  `)
  if (active.length) return noAssignment(movementId, 'DECISION_P1_YA_VIGENTE')

  const query = identitySql(input.source)
  if (!query) return noAssignment(movementId, 'FUENTE_SIN_IDENTIDAD_DOCUMENTAL')
  const rows = await work.$queryRaw<IdentityRow[]>(query)
  const identity = documentaryIdentityFromRow(rows[0] ?? {
    sourceKind: input.source.kind, sourceId: null, tipo: null, entityId: null, employeeId: null, entityCount: null,
  })
  if (identity === 'CLIENTES_MULTIPLES') return noAssignment(movementId, 'CLIENTES_MULTIPLES')
  if (!identity) return noAssignment(movementId, 'FICHA_INEXISTENTE_O_AMBIGUA')
  if (!documentaryCounterpartyTypeIsCompatible(input.source.kind, identity.type, current.importeCentimos)) {
    return noAssignment(movementId, 'TIPO_O_SIGNO_INCOMPATIBLE')
  }

  const seed: CounterpartyCandidateSeed = {
    movimientoId: movementId,
    tipoTercero: identity.type,
    origen: identity.origin,
    sourceIdentity: identity.sourceIdentity,
  }
  let result: any
  try {
    result = await mutateEasyCounterpartyTx(tx, input.actorId, {
      action: 'confirmar', movimientoId: movementId, version: current.version,
      sugerenciaId: counterpartySuggestionId(seed), idempotencyKey: p1Key(operationId, movementId), confirmacion: true,
    })
  } catch (error) {
    // A source can disappear/change between our exact documentary read and P1's
    // own locked candidate reconstruction. That is a safe "no coherent current
    // candidate" outcome, not a reason to block an otherwise documented B4 leg.
    // Access revocation and every operational/schema error intentionally propagate.
    if (error instanceof EasyCounterpartyServiceError && error.code === 'SUGERENCIA_OBSOLETA') {
      return noAssignment(movementId, 'FICHA_INEXISTENTE_O_AMBIGUA')
    }
    throw error
  }

  // The helper only claims assignment when it appended a *new* P1 confirmation.
  // A replay or an unexpected existing receipt is deliberately non-invasive.
  if (result?.idempotente || typeof result?.decisionId !== 'string' || result.movimientoId !== movementId || result.accion !== 'CONFIRMADA') {
    return noAssignment(movementId, 'DECISION_P1_YA_VIGENTE')
  }
  const receipt: ConciliarCounterpartyReceipt = {
    schema: 'CONCILIAR_COUNTERPARTY_RECEIPT_V1', actorId: input.actorId, operationId, movementId,
    decisionId: result.decisionId, version: current.version + 1, sourceKind: input.source.kind, tipoTercero: identity.type,
  }
  return { assigned: true, decisionId: result.decisionId, version: receipt.version, movementId, tipoTercero: identity.type, receipt }
}

function receipt(value: unknown): ConciliarCounterpartyReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const actorId = integer(row.actorId), version = integer(row.version)
  const sourceKind = text(row.sourceKind)
  const operationId = text(row.operationId), movementId = text(row.movementId), decisionId = text(row.decisionId), schema = text(row.schema), tipo = text(row.tipoTercero)
  if (schema !== 'CONCILIAR_COUNTERPARTY_RECEIPT_V1' || actorId === null || actorId < 1 || version === null || version < 1 || !operationId || !movementId || !decisionId
    || !['COBRO_PROPUESTA', 'COBRO_CONFIRMING', 'PAGO_FACTURA_RECIBIDA', 'PAGO_NOMINA', 'COMISION_BANCARIA', 'PENDIENTE_FACTURA_EMITIDA'].includes(sourceKind ?? '')
    || !['CLIENTE', 'PROVEEDOR', 'EMPLEADO', 'BANCO', 'CUENTA_PROPIA'].includes(tipo ?? '')) return null
  return { schema: 'CONCILIAR_COUNTERPARTY_RECEIPT_V1', actorId, operationId, movementId, decisionId, version, sourceKind: sourceKind as ConciliarProjectionSource['kind'], tipoTercero: tipo as CounterpartyType }
}

/**
 * Reverts exactly the still-current decision created by the same caller's prior
 * Conciliar operation. Call before B4 undo: a newer P1 state fails closed rather
 * than being changed, and no historic/current foreign receipt can be adopted.
 */
export async function undoConciliarDocumentaryCounterpartyTx(
  tx: Prisma.TransactionClient,
  actorId: number,
  rawReceipt: unknown,
): Promise<Readonly<{ undone: boolean; decisionId?: string; version?: number }>> {
  const own = receipt(rawReceipt)
  if (!own) return { undone: false }
  const operationId = own.operationId
  if (!validActorId(actorId)) throw new Error('CONCILIAR_COUNTERPARTY_ACTOR_INVALIDO')
  if (own.actorId !== actorId) throw new Error('CONCILIAR_COUNTERPARTY_RECEIPT_ACTOR_DISTINTO')

  const material = await readEasyCounterpartyBulkMaterialByIdsTx(tx, [own.movementId])
  const current = material[0]
  if (!current || current.id !== own.movementId || current.version !== own.version || current.estado !== 'IDENTIFICADO') {
    throw new Error('CONCILIAR_COUNTERPARTY_RECEIPT_NO_VIGENTE')
  }
  const active = await (tx as Tx).$queryRaw<Array<{ id: string; actorId: number | bigint; key: string }>>(Prisma.sql`
    SELECT d.id::text AS id,d.actor_id AS "actorId",d.idempotency_key::text AS key
    FROM decisiones_tercero_modo_facil d
    WHERE d.movimiento_id=${own.movementId} AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
      AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
    ORDER BY d.created_at DESC,d.id DESC LIMIT 1 FOR UPDATE
  `)
  if (!active[0] || active[0].id !== own.decisionId || integer(active[0].actorId) !== actorId || active[0].key !== p1Key(operationId, own.movementId)) {
    throw new Error('CONCILIAR_COUNTERPARTY_RECEIPT_NO_VIGENTE')
  }
  const result: any = await mutateEasyCounterpartyTx(tx, actorId, {
    action: 'revertir', decisionId: own.decisionId, version: current.version,
    idempotencyKey: undoP1Key(operationId, own.decisionId), confirmacion: true,
  })
  if (result?.idempotente) return { undone: false }
  if (typeof result?.decisionId !== 'string' || result.accion !== 'REVERTIDA' || result.movimientoId !== own.movementId) {
    throw new Error('CONCILIAR_COUNTERPARTY_UNDO_NO_CREADO')
  }
  return { undone: true, decisionId: result.decisionId, version: current.version + 1 }
}
