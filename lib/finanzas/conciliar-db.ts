import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { readBankInvoicingPopulation, type B7ReadDatabase } from '@/lib/finanzas/bank-invoicing-db'
import type { InvoiceSettlement } from '@/lib/finanzas/bank-invoicing-core'
import { archivoRecibidaControlado, bibliotecaFinancieraConfigurada } from '@/lib/finanzas/archivo-fuente-controlada'
import { driveItemDesdeArchivoUrlNominaControlada } from '@/lib/finanzas/nominas-propuestas-db'
import { facturaEconomicaSQL } from '@/lib/finanzas/invoice-economic-filter'
import { readConciliarConfirmingCandidates, resolveConfirmedInterestPdf, resolveStoredConfirmingFile, type ConfirmingQueryClient } from '@/lib/finanzas/conciliar-confirming'
import { centsFromExactSqlText, proveLocalBalanceNeighborhoods, selectBilateralTransfers, type EasyAutoBalanceRow, type EasyAutoMovement } from '@/lib/finanzas/easy-auto-core'
import {
  CONCILIAR_COLORS,
  CONCILIAR_TABS,
  type ConciliarColor,
  type ConciliarDocument,
  type ConciliarGetInput,
  type ConciliarProjectionPayload,
  type ConciliarProjectionSource,
  type ConciliarRow,
  type ConciliarTab,
  type ConciliarTabSummary,
  evaluarDocumentoExacto,
  normalizarReferenciaFactura,
  redReasonForMovement,
  referenciasFacturaCitadas,
  textoSeguro,
} from './conciliar-contract'
import { selectConciliarB5DocumentReview, type ConciliarB5SupportCandidate, type ConciliarB5TicketCandidate } from './conciliar-b5-document-core'
import { conciliarAliasesContainDocumentaryAlias, conciliarAliasesMatch, conciliarColorRank, conciliarDecisionHash, conciliarExactCounterparty, conciliarHash, conciliarProjectionRowId, isoDay, safeInteger } from './conciliar-core'
import { ConciliarDbError, conciliarDbErrorResponse } from './conciliar-errors'
import { buildBankFeeProjectionSeed } from './conciliar-fee-undo'
import { classifyConciliarRequestKind, type ConciliarPayrollReview, type ConciliarProviderReview, type ConciliarRequestKindInput } from './conciliar-request-kind-core'
import { presentConciliarRequestKind } from './conciliar-request-kind-presentation'
import { planCollectionDocumentReservations, type CollectionDocumentReservation, type CollectionReservationPlan, type CollectionReservationProposal } from './conciliar-collection-reservation'
import { conciliarProveedorAliasesFuertes } from './conciliar-proveedor'
import { referenciasEmitidasComposicionCompatible } from './conciliar-issued-reference-core'
import { assignConciliarProviderPayments, type ConciliarProviderAssignmentReason, type ConciliarProviderInvoiceCandidate, type ConciliarProviderPayment, type ConciliarProviderPaymentAssignment } from './conciliar-proveedor-asignacion'
import { classifyConciliarOwnTransferReviews, conciliarOwnTransferReviewMotive, hasExactOwnRecipientEvidence, normalizedRegisteredOwnIban } from './conciliar-transfer-classifier'
import { readManualOwnAccountProofTx } from './conciliar-own-account-proof-db'
import { cents, day, document, exactMoney, json, nullableText, object, projectionRow, type ProjectionSqlRow } from './conciliar-projection-read'
import { remittanceSealForProposal } from './remittance-payment-receipts-db'

export { ConciliarDbError, conciliarDbErrorResponse } from './conciliar-errors'
export { readConciliarHistory, readConciliarProjection, readConciliarProjectionTx, readConciliarRow, readConciliarRowForAction } from './conciliar-projection-read'
// The thin reader retains the exact aggregate: COALESCE(SUM(p.pendiente_centimos::bigint),0)::text AS amount

/** No Prisma schema edit is needed for Conciliar's additive migration. */
type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx
const MAX_REBUILD_ROWS = 25_000
const fail = (status: number, code: string, message: string): never => { throw new ConciliarDbError(status, code, message) }

export type ConciliarReceiptLeg = Readonly<{
  ordinal: number
  rowId: string
  movimientoId: string | null
  operationB4Id?: string
  actionB5?: 'PEDIDO'
  proposalBlockId?: string
  result: Record<string, unknown>
}>

export async function createConciliarOperation(actorId: number, action: 'CONFIRMAR' | 'PEDIR' | 'DESHACER', idempotencyKey: string, requestHash: string, parentId?: string) {
  return db().$transaction(async tx => {
    const work = asTx(tx)
    await work.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`conciliar:${actorId}:${idempotencyKey}`},0))::text AS locked`)
    const existing = await work.$queryRaw<Array<{ id: string; requestHash: string; result: unknown; state: string }>>(Prisma.sql`
      SELECT id::text,request_hash AS "requestHash",resultado AS result,estado::text AS state
      FROM operaciones_conciliar WHERE actor_id=${actorId} AND idempotency_key=CAST(${idempotencyKey} AS uuid) LIMIT 1 FOR UPDATE
    `)
    if (existing[0]) {
      if (existing[0].requestHash !== requestHash) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia pertenece a otra acción.')
      return { replay: true as const, id: existing[0].id, result: json(existing[0].result), state: existing[0].state }
    }
    const inserted = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO operaciones_conciliar(actor_id,accion,estado,idempotency_key,request_hash,operacion_padre_id,resultado,created_at)
      VALUES(${actorId},CAST(${action} AS "AccionOperacionConciliar"),'APLICADA'::"EstadoOperacionConciliar",CAST(${idempotencyKey} AS uuid),${requestHash},${parentId ? Prisma.sql`CAST(${parentId} AS uuid)` : Prisma.sql`NULL`},'{}'::jsonb,CURRENT_TIMESTAMP)
      RETURNING id::text
    `)
    if (!inserted[0]?.id) fail(409, 'RECIBO_NO_CREADO', 'No se pudo crear el recibo de la acción.')
    return { replay: false as const, id: inserted[0].id, result: {}, state: 'APLICADA' }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })
}

export async function appendConciliarLeg(operationId: string, leg: ConciliarReceiptLeg) {
  await db().$transaction(async tx => {
    const work = asTx(tx)
    await work.$executeRaw(Prisma.sql`
      INSERT INTO patas_operacion_conciliar(operacion_conciliar_id,ordinal,fila_id,movimiento_id,operacion_b4_id,accion_b5,bloque_propuesta_cobro_id,resultado,created_at)
      VALUES(CAST(${operationId} AS uuid),${leg.ordinal},${leg.rowId},${leg.movimientoId},
        ${leg.operationB4Id ? Prisma.sql`CAST(${leg.operationB4Id} AS uuid)` : Prisma.sql`NULL`},
        ${leg.actionB5 ? leg.actionB5 : Prisma.sql`NULL`},
        ${leg.proposalBlockId ? Prisma.sql`CAST(${leg.proposalBlockId} AS uuid)` : Prisma.sql`NULL`},
        CAST(${JSON.stringify(leg.result)} AS jsonb),CURRENT_TIMESTAMP)
      ON CONFLICT (operacion_conciliar_id,fila_id) DO NOTHING
    `)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })
}

export async function finalizeConciliarOperation(operationId: string, state: 'APLICADA' | 'PARCIAL' | 'REVERTIDA', result: Record<string, unknown>, reverted = false) {
  await db().$executeRaw(Prisma.sql`
    UPDATE operaciones_conciliar
    SET estado=CAST(${state} AS "EstadoOperacionConciliar"),resultado=CAST(${JSON.stringify(result)} AS jsonb),revertida_at=${reverted ? Prisma.sql`CURRENT_TIMESTAMP` : Prisma.sql`NULL`}
    WHERE id=CAST(${operationId} AS uuid)
  `)
}

export async function legsForConciliarOperation(operationId: string) {
  return db().$queryRaw<Array<{ ordinal: number; rowId: string; movimientoId: string | null; operationB4Id: string | null; actionB5: string | null; proposalBlockId: string | null; result: unknown }>>(Prisma.sql`
    SELECT ordinal,fila_id AS "rowId",movimiento_id AS "movimientoId",operacion_b4_id::text AS "operationB4Id",accion_b5 AS "actionB5",bloque_propuesta_cobro_id::text AS "proposalBlockId",resultado AS result
    FROM patas_operacion_conciliar WHERE operacion_conciliar_id=CAST(${operationId} AS uuid) ORDER BY ordinal ASC
  `)
}

export async function readConciliarOperationForUndo(operationId: string, actorId: number) {
  const rows = await db().$queryRaw<Array<{ id: string; actorId: number; action: string; state: string }>>(Prisma.sql`
    SELECT id::text,actor_id AS "actorId",accion::text AS action,estado::text AS state
    FROM operaciones_conciliar WHERE id=CAST(${operationId} AS uuid) LIMIT 1
  `)
  const row = rows[0]
  if (!row) fail(404, 'RECIBO_NO_ENCONTRADO', 'No se encontró la acción para deshacer.')
  if (row.actorId !== actorId) fail(403, 'RECIBO_ACTOR_DISTINTO', 'Sólo quien realizó la acción puede deshacerla.')
  if (row.action !== 'CONFIRMAR' || row.state === 'REVERTIDA') fail(409, 'RECIBO_NO_REVERSIBLE', 'Esta acción ya no se puede deshacer.')
  return row
}

export async function markConciliarReverted(originalId: string) {
  await db().$executeRaw(Prisma.sql`UPDATE operaciones_conciliar SET estado='REVERTIDA'::"EstadoOperacionConciliar",revertida_at=CURRENT_TIMESTAMP WHERE id=CAST(${originalId} AS uuid) AND estado<>'REVERTIDA'::"EstadoOperacionConciliar"`)
}

/** Direct resolver used only by the limited Conciliar archivo proxy. It rechecks
 * the current row source and never accepts a drive/url/item from the browser. */
export async function resolveConciliarProjectionFile(rowId: string): Promise<Readonly<{ nombre: string; mimeType: 'application/pdf'; locator: { driveId: string; itemId: string } | { configured: true; itemId: string } }>> {
  const rows = await db().$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${rowId} LIMIT 1`)
  if (!rows.length) {
    const durable = await resolveConfirmedInterestPdf(db() as unknown as ConfirmingQueryClient, rowId)
    if (durable) return { nombre: durable.nombre, mimeType: 'application/pdf', locator: durable.locator }
    fail(404, 'ARCHIVO_FUERA_DE_AMBITO', 'El archivo no pertenece a una fila o un soporte confirming vigente.')
  }
  const row = projectionRow(rows[0])
  if (row.documento?.href !== `/api/admin/finanzas/conciliar/archivo/${encodeURIComponent(row.id)}`) fail(404, 'ARCHIVO_FUERA_DE_AMBITO', 'La fila no tiene un archivo documental disponible.')
  if (row.source.kind === 'COBRO_CONFIRMING' && row.source.confirmingId) {
    const file = await resolveStoredConfirmingFile(db() as unknown as ConfirmingQueryClient, row.source.confirmingId)
    if (!file) fail(404, 'ARCHIVO_NO_DISPONIBLE', 'El confirming ya no conserva su PDF controlado.')
    return { ...file, mimeType: 'application/pdf' }
  }
  if (row.source.kind === 'PAGO_FACTURA_RECIBIDA' && row.source.facturaRecibidaId) {
    const source = await (db() as any).facturaRecibida.findUnique({ where: { id: row.source.facturaRecibidaId }, select: { oneDriveDriveId: true, oneDriveItemId: true, archivoOneDrive: true } })
    const location = archivoRecibidaControlado(source)
    if (!location) fail(404, 'ARCHIVO_NO_DISPONIBLE', 'La factura ya no tiene un archivo controlado disponible.')
    return { nombre: textoSeguro(source.archivoOneDrive?.split(/[\\/]/).pop(), 'factura.pdf'), mimeType: 'application/pdf', locator: { driveId: location.driveId, itemId: location.itemId } }
  }
  if (row.source.kind === 'PAGO_NOMINA' && row.source.nominaId) {
    const source = await (db() as any).nomina.findUnique({ where: { id: row.source.nominaId }, select: { archivoUrl: true, archivoNombre: true, documentos: { select: { driveItemId: true, nombre: true, tipo: true }, take: 10 } } })
    const configured = bibliotecaFinancieraConfigurada()
    const item = source?.documentos?.find((item: any) => item?.tipo === 'NOMINA' && typeof item.driveItemId === 'string') ?? null
    const fallback = driveItemDesdeArchivoUrlNominaControlada(source?.archivoUrl)
    const itemId = item?.driveItemId ?? fallback
    if (!configured || typeof itemId !== 'string') fail(404, 'ARCHIVO_NO_DISPONIBLE', 'La nómina ya no tiene un archivo controlado disponible.')
    return { nombre: textoSeguro(item?.nombre ?? source?.archivoNombre, 'nomina.pdf'), mimeType: 'application/pdf', locator: { configured: true, itemId } }
  }
  fail(404, 'ARCHIVO_FUERA_DE_AMBITO', 'El archivo no pertenece a una fuente documental admitida.')
}

// ---------------------- Rebuild and refresh projection ---------------------

export type RebuildRow = Omit<ConciliarProjectionPayload, 'row'> & {
  tab: ConciliarTab
  row: Omit<ConciliarRow, 'decisionHash'>
  cuentaId: string | null
}
function baseRow(input: Omit<ConciliarRow, 'decisionHash'>): Omit<ConciliarRow, 'decisionHash'> { return input }
function projection(tab: ConciliarTab, input: Omit<ConciliarRow, 'decisionHash'>, source: ConciliarProjectionSource, cuentaId: string | null): RebuildRow {
  return {
    tab, row: input, source,
    sourceFingerprint: conciliarHash({ schema: 'CONCILIAR_SOURCE_V2', tab, source, row: { id: input.id, movimientoId: input.movimientoId, fecha: input.fecha, importeCentimos: input.importeCentimos, pendienteCentimos: input.pendienteCentimos, documento: input.documento, propuesta: input.propuesta, linksMovimiento: input.linksMovimiento } }),
    cuentaId,
  }
}
function candidateFileHref(id: string, available: boolean): string | null { return available ? `/api/admin/finanzas/conciliar/archivo/${encodeURIComponent(id)}` : null }
function rowId(tab: ConciliarTab, sourceIdentity: string): string { return conciliarProjectionRowId(tab, sourceIdentity) }

/** A received source keeps its signed economic amount. A supplier credit therefore
 * becomes a positive B4 target and is never erased or silently netted with debt. */
export function receivedInvoicePendingSettlement(input: Readonly<{ totalCentimos: number; assignedCentimos: number }>): Readonly<{ targetCentimos: number; pendingCentimos: number }> | null {
  if (!Number.isSafeInteger(input.totalCentimos) || !Number.isSafeInteger(input.assignedCentimos) || input.totalCentimos === 0) return null
  const targetCentimos = -input.totalCentimos
  const pendingCentimos = targetCentimos - input.assignedCentimos
  if (!Number.isSafeInteger(targetCentimos) || !Number.isSafeInteger(pendingCentimos) || pendingCentimos === 0 || Math.sign(pendingCentimos) !== Math.sign(targetCentimos)) return null
  return { targetCentimos, pendingCentimos }
}

export type ReceivedInvoicePendingPaymentCandidate = Readonly<{ rowId: string; color: ConciliarColor }>
export function receivedInvoicePendingCandidate(candidates: readonly ReceivedInvoicePendingPaymentCandidate[]): Readonly<{
  color: ConciliarColor
  motivo: string
  candidate: ReceivedInvoicePendingPaymentCandidate | null
}> {
  if (candidates.length === 0) return { color: 'ROJO', motivo: 'Aún no consta un pago confirmado.', candidate: null }
  if (candidates.length > 1) return { color: 'AMBAR', motivo: 'Hay varios pagos propuestos para esta factura; revísalos antes de confirmar.', candidate: null }
  const candidate = candidates[0]
  return candidate.color === 'VERDE'
    ? { color: 'VERDE', motivo: 'Hay un pago que coincide; ábrelo para confirmarlo.', candidate }
    : { color: 'AMBAR', motivo: 'Hay un pago propuesto que necesita revisión.', candidate }
}

/** A pending received invoice is a capacity, not merely its original total. */
function providerInvoiceCandidatesForMovement(movement: any, receivedByCounterparty: ReadonlyMap<string, readonly any[]>): ConciliarProviderInvoiceCandidate[] {
  const aliases = movementPartyAliases(movement)
  const selected = new Map<string, ConciliarProviderInvoiceCandidate>()
  for (const [providerAlias, invoices] of receivedByCounterparty) {
    const exactProvider = conciliarAliasesMatch(aliases, [providerAlias])
    const documentaryProvider = !exactProvider && conciliarAliasesContainDocumentaryAlias(aliases, [providerAlias])
    if (!exactProvider && !documentaryProvider) continue
    for (const invoice of invoices) {
      const total = exactMoney(invoice.total_text), assigned = safeInteger(invoice.asignado)
      if (total === null || total === 0 || assigned === null) continue
      const pending = receivedInvoicePendingSettlement({ totalCentimos: total, assignedCentimos: assigned })
      if (!pending) continue
      const candidate: ConciliarProviderInvoiceCandidate = {
        invoiceId: String(invoice.id), referencia: nullableText(invoice.referencia, 300),
        fecha: typeof invoice.fecha === 'string' ? invoice.fecha : null,
        vencimiento: typeof invoice.vencimiento === 'string' ? invoice.vencimiento : null,
        importeDisponibleCentimos: pending.pendingCentimos,
        providerMatch: exactProvider ? 'EXACT' : 'DOCUMENTARY',
      }
      const previous = selected.get(candidate.invoiceId)
      if (!previous || candidate.providerMatch === 'EXACT') selected.set(candidate.invoiceId, candidate)
    }
  }
  return [...selected.values()].sort((left, right) => left.invoiceId.localeCompare(right.invoiceId))
}

function providerAssignmentMotive(reason: ConciliarProviderAssignmentReason): string {
  switch (reason) {
    case 'SIN_REFERENCIA_DOCUMENTAL': return 'El proveedor y el importe coinciden, pero el banco no cita una factura; revísala antes de confirmar.'
    case 'IMPORTE_PEQUENO_DISTINTO': return 'La candidata es del mismo proveedor, pero el importe no coincide exactamente; revísala antes de confirmar.'
    case 'FECHA_DOCUMENTO_POSTERIOR': return 'La candidata es del mismo proveedor, pero la fecha de emisión es posterior al movimiento bancario; revísala antes de confirmar.'
    case 'PROVEEDOR_SOLO_DOCUMENTAL': return 'La candidata contiene el nombre completo del proveedor en el literal bancario, pero no un alias idéntico; revísala antes de confirmar.'
    case 'CANDIDATAS_EXACTAS_AMBIGUAS': return 'Hay varias facturas exactas posibles; revísalas antes de confirmar.'
    case 'FACTURA_EXACTA_RESERVADA': return 'Una factura exacta ya está reservada para otro cargo; revísalo antes de confirmar.'
    case 'CANDIDATAS_REVISION_AMBIGUAS': return 'Hay varias candidatas de revisión; no se propone una factura arbitraria.'
    case 'REFERENCIA_BANCARIA_SIN_FACTURA': return 'El banco cita una factura que no está disponible para este cargo; no se propone otra factura.'
    case 'REFERENCIA_NUMERO_INCOMPLETO': return 'El número citado no coincide con el número completo de la factura candidata; el importe coincide, pero requiere revisión.'
    case 'NINGUNA_FACTURA_DE_ESTE_IMPORTE': return 'Ninguna factura de este importe está disponible para este cargo.'
    case 'REFERENCIA_EXACTA': return 'La referencia bancaria identifica exactamente la factura.'
  }
}

function payrollReviewForConciliar(candidates: readonly unknown[]): ConciliarPayrollReview {
  return candidates.length === 1 ? 'EXACT_PERSONAL' : candidates.length > 1 ? 'AMBIGUOUS_PERSONAL' : 'NOT_APPLICABLE'
}
function providerReviewForConciliar(assignment: ConciliarProviderPaymentAssignment | undefined): ConciliarProviderReview {
  if (!assignment) return 'NONE'
  if (assignment.kind === 'EXACT_REFERENCE') return 'EXACT_DOCUMENT_REFERENCE'
  if (assignment.reason === 'REFERENCIA_NUMERO_INCOMPLETO') return 'NUMBER_CONFLICT'
  if (assignment.reason === 'REFERENCIA_BANCARIA_SIN_FACTURA') return 'REFERENCE_MISSING'
  if (assignment.kind === 'AMBAR') return 'AMBIGUOUS'
  if (assignment.kind === 'EXACT_NO_REFERENCE' || assignment.kind === 'REVIEW') return 'CANDIDATE_WITHOUT_REFERENCE'
  return 'NONE'
}
function requestKindInputForMovement(movement: any, amount: number, payrollReview: ConciliarPayrollReview, providerReview: ConciliarProviderReview = 'NONE'): ConciliarRequestKindInput {
  return {
    importeCentimos: amount, concepto: movement.concepto, referencia: movement.referencia,
    infoAdicional: movement.info_adicional, tercero: movement.tercero, payrollReview, providerReview,
    cardInstrument: /\b(?:TARJETA|CARD|VISA|MASTERCARD|AMEX|TPV|POS)\b/i.test(textoSeguro(movement.concepto)),
  }
}

/**
 * La referencia documental puede llegar fuera del concepto visible del extracto.
 * Se limita a los tres campos bancarios de la misma operación; no usa el tercero
 * ni texto generado. Este valor sólo decide y revalida identidad documental, no
 * sustituye el concepto que se presenta en la fila.
 */
function bankDocumentaryText(movement: Readonly<{ concepto?: unknown; referencia?: unknown; info_adicional?: unknown }>): string {
  return [movement.concepto, movement.referencia, movement.info_adicional]
    .map(value => textoSeguro(value))
    .filter((value): value is string => value.length > 0)
    .join(' ')
    .slice(0, 1_000)
}

export async function unresolvedMovements(tx: Tx, movementId?: string) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.fecha_operacion::date::text AS fecha,m.concepto,m.referencia,m.info_adicional,m.tercero,
      b4_importe_bancario_centimos(m.importe) AS "importeCentimos",c.id AS "cuentaId",c.banco,c.alias AS cuenta,
      ef.razon_social AS "entidadRazonSocial",ef.nombre_comercial AS "entidadNombreComercial",p1.label AS "terceroConfirmado",
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
      ) AS "tieneCuentaPropiaConfirmada",
      COALESCE(e.version,1) AS "versionB4"
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
    LEFT JOIN LATERAL (
      SELECT NULLIF(btrim(d.snapshot->>'label'),'') AS label
      FROM decisiones_tercero_modo_facil d
      WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
        AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ORDER BY d.created_at DESC,d.id DESC LIMIT 1
    ) p1 ON TRUE
    WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' AND b4_importe_bancario_centimos(m.importe) IS NOT NULL
      ${movementId ? Prisma.sql`AND m.id=${movementId}` : Prisma.empty}
    ORDER BY m.fecha_operacion DESC,m.id ASC LIMIT ${movementId ? 1 : MAX_REBUILD_ROWS}
      ${movementId ? Prisma.sql`FOR UPDATE OF m` : Prisma.empty}
  `)
}
async function liveCollectionProposals(tx: Tx, proposalId?: string) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    WITH current_generation AS (SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1)
    SELECT p.id::text AS "propuestaId",p.movimiento_id AS "movimientoId",p.movimiento_par_id AS "movimientoParId",p.fingerprint,p.metodo,p.nivel,p.estado_propuesto AS "estadoPropuesto",p.composicion,p.explicacion,
      p.lineas,p.importe_movimiento_centimos AS "importeCentimos",p.motivo_no_requiere AS "motivoNoRequiere"
    FROM modo_facil_propuestas_cobro p JOIN current_generation g ON g.id=p.generacion_id
    WHERE p.estado_propuesto IN ('JUSTIFICADO','NO_REQUIERE')
      ${proposalId ? Prisma.sql`AND p.id=CAST(${proposalId} AS uuid)` : Prisma.empty}
      ORDER BY p.movimiento_id ASC,p.id ASC LIMIT ${proposalId ? 1 : MAX_REBUILD_ROWS}
  `)
}

/** Server-only proof for the exceptional client-name presentation path. It is
 * deliberately derived from the FI records named by the live proposal and the
 * movement's registered CLIENTE card; composition text never supplies a CIF. */
export type CollectionClientIdentityProfile = Readonly<{
  proposalId: string
  movimientoId: string
  compositionCount: number
  compositionInvoiceIdCount: number
  invoiceCount: number
  distinctInvoiceCount: number
  invoiceCifs: readonly unknown[]
  invoiceNames: readonly unknown[]
  entityCif: unknown
  entityType: unknown
  entityActive: unknown
  entityLegalName: unknown
  entityCommercialName: unknown
  entityBoundToMovement?: boolean
}>

/**
 * Bounded closed-profile reader shared by full rebuild and delta. It neither
 * infers a client nor accepts composition.client as tax evidence. A malformed
 * or stale requested proposal makes the caller retain review/fallback state.
 */
export async function readCollectionClientIdentityProfiles(base: Prisma.TransactionClient, proposalIds: readonly string[]): Promise<ReadonlyMap<string, CollectionClientIdentityProfile> | null> {
  const requested = [...new Set(proposalIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 160))].sort()
  if (requested.length !== new Set(proposalIds).size || requested.length > MAX_REBUILD_ROWS
    || requested.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) return null
  if (!requested.length) return new Map()
  const tx = asTx(base)
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT p.id::text AS "proposalId",p.movimiento_id AS "movimientoId",
      COUNT(composition.ordinal)::integer AS "compositionCount",
      COUNT(composition_id.invoice_id)::integer AS "compositionInvoiceIdCount",
      COUNT(fe.id)::integer AS "invoiceCount",COUNT(DISTINCT fe.id)::integer AS "distinctInvoiceCount",
      COALESCE(array_agg(fe.cif) FILTER (WHERE fe.id IS NOT NULL),'{}'::text[]) AS "invoiceCifs",
      COALESCE(array_agg(fe.cliente) FILTER (WHERE fe.id IS NOT NULL),'{}'::text[]) AS "invoiceNames",
      ef.nif_cif AS "entityCif",ef.tipo::text AS "entityType",ef.activo AS "entityActive",
      ef.razon_social AS "entityLegalName",ef.nombre_comercial AS "entityCommercialName",
      (m.entidad_fiscal_id IS NOT NULL) AS "entityBoundToMovement"
    FROM modo_facil_propuestas_cobro p
    JOIN movimientos_bancarios m ON m.id=p.movimiento_id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
    LEFT JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(p.composicion)='array' THEN p.composicion ELSE COALESCE(p.composicion->'items','[]'::jsonb) END
    ) WITH ORDINALITY AS composition(value,ordinal) ON TRUE
    LEFT JOIN LATERAL (SELECT NULLIF(btrim(composition.value->>'facturaEmitidaId'),'') AS invoice_id) composition_id ON TRUE
    LEFT JOIN facturas_emitidas fe ON fe.id=composition_id.invoice_id
    WHERE p.id IN (${Prisma.join(requested.map(id => Prisma.sql`CAST(${id} AS uuid)`))})
    GROUP BY p.id,p.movimiento_id,m.entidad_fiscal_id,ef.nif_cif,ef.tipo,ef.activo,ef.razon_social,ef.nombre_comercial
    ORDER BY p.id ASC LIMIT ${requested.length + 1}
  `)
  if (rows.length !== requested.length || rows.length > MAX_REBUILD_ROWS) return null
  const result = new Map<string, CollectionClientIdentityProfile>()
  for (const row of rows) {
    const proposalId = nullableText(row.proposalId, 160), movimientoId = nullableText(row.movimientoId, 300)
    const compositionCount = safeInteger(row.compositionCount), compositionInvoiceIdCount = safeInteger(row.compositionInvoiceIdCount)
    const invoiceCount = safeInteger(row.invoiceCount), distinctInvoiceCount = safeInteger(row.distinctInvoiceCount)
    if (!proposalId || !movimientoId || !requested.includes(proposalId) || result.has(proposalId)
      || compositionCount === null || compositionInvoiceIdCount === null || invoiceCount === null || distinctInvoiceCount === null
      || !Array.isArray(row.invoiceCifs) || !Array.isArray(row.invoiceNames)) return null
    result.set(proposalId, {
      proposalId, movimientoId, compositionCount, compositionInvoiceIdCount, invoiceCount, distinctInvoiceCount,
      invoiceCifs: row.invoiceCifs, invoiceNames: row.invoiceNames, entityCif: row.entityCif,
      entityType: row.entityType, entityActive: row.entityActive, entityLegalName: row.entityLegalName,
      entityCommercialName: row.entityCommercialName, entityBoundToMovement: row.entityBoundToMovement === true,
    })
  }
  // No FK is invented: a missing bank entity can only use one active registered
  // CLIENTE card with the same complete FI CIF, plus a literal bank/card name
  // check in collectionClientIdentityMatches. Duplicate normalized CIFs fail closed.
  const neededCifs = [...new Set([...result.values()].flatMap(profile => {
    const cifs = profile.invoiceCifs.map(normalizedFiscalIdentity)
    return !profile.entityBoundToMovement && cifs.length > 0 && cifs.every(cif => cif !== null && cif === cifs[0]) ? [cifs[0]!] : []
  }))].sort()
  if (neededCifs.length) {
    const cards = await tx.$queryRaw<Array<{ cif: string; legal: string; commercial: string | null }>>(Prisma.sql`
      SELECT nif_cif AS cif,razon_social AS legal,nombre_comercial AS commercial
      FROM entidades_fiscales WHERE activo=true AND tipo='CLIENTE'
        AND upper(regexp_replace(nif_cif,'[.[:space:]-]','','g')) IN (${Prisma.join(neededCifs)})
      ORDER BY id LIMIT ${neededCifs.length * 2 + 1}
    `)
    if (cards.length > neededCifs.length * 2) return result
    const byCif = new Map<string, typeof cards>()
    for (const card of cards) {
      const cif = normalizedFiscalIdentity(card.cif)
      if (cif && neededCifs.includes(cif)) byCif.set(cif,[...(byCif.get(cif) ?? []),card])
    }
    for (const [id,profile] of result) {
      if (profile.entityBoundToMovement) continue
      const cif = normalizedFiscalIdentity(profile.invoiceCifs[0]), matching = cif ? byCif.get(cif) : null
      if (!matching || matching.length !== 1) continue
      result.set(id,{...profile,entityCif:matching[0].cif,entityType:'CLIENTE',entityActive:true,entityLegalName:matching[0].legal,entityCommercialName:matching[0].commercial})
    }
  }
  return result.size === requested.length ? result : null
}
async function receivedInvoices(tx: Tx) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT fr.id::text AS id,fr.num_factura AS referencia,fr.proveedor,fr.fecha::date::text AS fecha,fr.fecha_vencimiento::date::text AS vencimiento,fr.total::text AS total_text,
      fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId",fr.archivo_onedrive AS archivo,
      d.id::text AS "documentoId",d.importe_objetivo_centimos AS "objetivoCentimos",d.activo AS "documentoActivo",COALESCE(a.asignado,0)::bigint AS asignado
    FROM facturas_recibidas fr
    LEFT JOIN LATERAL (
      SELECT id,importe_objetivo_centimos,activo FROM documentos_conciliables
      WHERE factura_recibida_id=fr.id AND tipo='FACTURA_RECIBIDA'::"TipoDocumentoConciliable"
      ORDER BY activo DESC,created_at ASC,id ASC LIMIT 1
    ) d ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(v.importe_centimos)::bigint AS asignado FROM vinculos_movimiento_documento v
      JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
      JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
      WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" AND v.documento_conciliable_id=d.id
    ) a ON TRUE
    WHERE ${facturaEconomicaSQL('fr')}
      AND fr.conflicto_identidad=false AND fr.duplicado_externo=false
    ORDER BY fr.fecha DESC,fr.id ASC LIMIT ${MAX_REBUILD_ROWS}
  `)
}
async function payrollSources(tx: Tx) {
  return tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT n.id,n.mes,n.anio,n.neto_percibir::text AS total_text,n.archivo_url AS archivo_url,n.archivo_nombre AS archivo_nombre,
      e.nombre_completo AS "empleadoNombre",
      d.id::text AS "documentoId",d.importe_objetivo_centimos AS "objetivoCentimos",d.activo AS "documentoActivo",
      nd.drive_item_id AS "driveItemId",nd.nombre AS "documentoNombre"
    FROM nominas n JOIN empleados e ON e.id=n.empleado_id
    LEFT JOIN LATERAL (
      SELECT id,importe_objetivo_centimos,activo FROM documentos_conciliables
      WHERE nomina_id=n.id AND tipo='NOMINA'::"TipoDocumentoConciliable"
      ORDER BY activo DESC,created_at ASC,id ASC LIMIT 1
    ) d ON TRUE
    LEFT JOIN LATERAL (SELECT drive_item_id,nombre FROM nomina_documentos WHERE nomina_id=n.id AND tipo='NOMINA' ORDER BY created_at DESC,id DESC LIMIT 1) nd ON TRUE
    ORDER BY n.anio DESC,n.mes DESC,n.id ASC LIMIT ${MAX_REBUILD_ROWS}
  `)
}

type B5DocumentSource = Readonly<{
  adjuntoB5Id: string
  movimientoId: string
  tipoDocumento: string
  referencia: string | null
  tercero: string | null
  fechaDocumento: string | null
  importeDocumentoCentimos: unknown
  gastoId: string | null
  gastoCentimos: unknown
  gastoEstado: string | null
  gastoMetodoPago: string | null
  gastoFecha: string | null
  documentoConciliableId: string | null
  documentoActivo: boolean | null
  objetivoCentimos: unknown
  asignadoActivoCentimos: unknown
  driveId: string | null
  itemId: string | null
}>

/**
 * B5 remains evidence of the same bank movement that received it. This is a
 * bounded read of only completed records; it does not create a Gasto or a B4
 * wrapper and it never uses a provider name/reference as financial identity.
 */
async function b5DocumentSources(tx: Tx): Promise<B5DocumentSource[]> {
  const rows = await tx.$queryRaw<B5DocumentSource[]>(Prisma.sql`
    SELECT a.id::text AS "adjuntoB5Id",a.movimiento_id AS "movimientoId",a.tipo_documento AS "tipoDocumento",
      COALESCE(a.concepto,a.storage_name) AS referencia,a.nombre_tercero AS tercero,a.fecha_documento::date::text AS "fechaDocumento",
      a.importe_documento_centimos AS "importeDocumentoCentimos",a.gasto_id AS "gastoId",
      b4_importe_bancario_centimos(g.importe) AS "gastoCentimos",g.estado::text AS "gastoEstado",g.metodo_pago::text AS "gastoMetodoPago",
      g.fecha::date::text AS "gastoFecha",d.id::text AS "documentoConciliableId",d.activo AS "documentoActivo",
      d.importe_objetivo_centimos AS "objetivoCentimos",COALESCE(v.asignado,0)::bigint AS "asignadoActivoCentimos",
      a.drive_id AS "driveId",a.onedrive_item_id AS "itemId"
    FROM adjuntos_pendientes_b5 a
    LEFT JOIN gastos g ON g.id=a.gasto_id
    LEFT JOIN documentos_conciliables d ON d.id=a.documento_conciliable_id AND d.gasto_id=a.gasto_id
      AND d.tipo='TICKET'::"TipoDocumentoConciliable"
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(link.importe_centimos),0)::bigint AS asignado
      FROM vinculos_movimiento_documento link
      JOIN operaciones_justificacion_b4 operation ON operation.id=link.operacion_creacion_id
        AND operation.estado='APLICADA'::"EstadoOperacionB4" AND operation.revertida_at IS NULL
      JOIN estado_justificacion_movimientos state ON state.movimiento_id=link.movimiento_id
        AND state.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
      WHERE link.activo AND link.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" AND link.documento_conciliable_id=d.id
    ) v ON TRUE
    WHERE a.estado='UPLOAD_COMPLETO'::"EstadoAdjuntoPendienteB5" AND a.tipo_documento IN ('TICKET','SOPORTE')
    ORDER BY a.movimiento_id ASC,a.created_at ASC,a.id ASC
    LIMIT ${MAX_REBUILD_ROWS + 1}
  `)
  if (rows.length > MAX_REBUILD_ROWS) fail(409, 'PROYECCION_DEMASIADA', 'Hay demasiados adjuntos B5 completos para una proyección íntegra.')
  return rows
}

function isControlledB5TicketFile(input: Readonly<{ driveId: string | null; itemId: string | null }>): boolean {
  const configured = bibliotecaFinancieraConfigurada()
  return configured !== null && input.driveId === configured && typeof input.itemId === 'string' && /^[A-Za-z0-9!_.~-]{4,220}$/.test(input.itemId)
}

function b5TicketCandidate(source: B5DocumentSource): ConciliarB5TicketCandidate | null {
  if (source.tipoDocumento !== 'TICKET' || !source.gastoId || !source.documentoConciliableId) return null
  const gastoCents = safeInteger(source.gastoCentimos)
  const documentCents = safeInteger(source.importeDocumentoCentimos)
  const targetCents = safeInteger(source.objetivoCentimos)
  const allocatedCents = safeInteger(source.asignadoActivoCentimos)
  return {
    adjuntoB5Id: source.adjuntoB5Id, movimientoId: source.movimientoId, gastoId: source.gastoId,
    documentoConciliableId: source.documentoConciliableId, uploadCompleto: true,
    documentoActivo: source.documentoActivo === true,
    // A received ticket must still be the exact reviewed company-card Gasto for
    // its B5 date. A merchant string is deliberately not an identity condition.
    gastoRevalidable: source.gastoEstado === 'APROBADO' || source.gastoEstado === 'CONTABILIZADO'
      ? source.gastoMetodoPago === 'TARJETA_EMPRESA' && source.gastoFecha === source.fechaDocumento
      : false,
    archivoControlado: isControlledB5TicketFile(source), fechaDocumento: source.fechaDocumento,
    importeDocumentoCentimos: documentCents, importeGastoCentimos: gastoCents,
    importeObjetivoCentimos: targetCents, asignadoActivoCentimos: allocatedCents,
    referencia: source.referencia, tercero: source.tercero,
  }
}

function b5SupportCandidate(source: B5DocumentSource): ConciliarB5SupportCandidate | null {
  return source.tipoDocumento === 'SOPORTE'
    ? { adjuntoB5Id: source.adjuntoB5Id, movimientoId: source.movimientoId, uploadCompleto: true, referencia: source.referencia }
    : null
}

function proposalComposition(raw: unknown): Array<{ facturaEmitidaId: string | null; numFactura: string | null; cliente: string | null; importeCentimos: number | null; vencimiento: string | null }> {
  const items = Array.isArray(raw) ? raw : Array.isArray(json(raw).items) ? json(raw).items as unknown[] : []
  return items.flatMap(item => {
    const value = object(item)
    const invoice = nullableText(value.facturaEmitidaId, 160)
    const amount = safeInteger(value.importeCentimos)
    return [{ facturaEmitidaId: invoice, numFactura: nullableText(value.numFactura, 240), cliente: nullableText(value.cliente, 300), importeCentimos: amount, vencimiento: typeof value.vencimiento === 'string' ? value.vencimiento.slice(0, 10) : null }]
  })
}

/** Observa capacidad documental vigente de los propietarios B4/B7 existentes.
 * Sólo SELECT bajo la transacción del llamador; no crea reservas, tablas ni FI. */
export async function readLiveCollectionDocumentReservations(base: Prisma.TransactionClient): Promise<readonly CollectionDocumentReservation[]> {
  const tx = asTx(base)
  const rows = await tx.$queryRaw<Array<{ documentKey: unknown; proposalKey: unknown; movementKey: unknown }>>(Prisma.sql`
    SELECT d.factura_emitida_id AS "documentKey",e.detalle->>'propuestaId' AS "proposalKey",v.movimiento_id AS "movementKey"
    FROM vinculos_movimiento_documento v
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
    JOIN estado_justificacion_movimientos state ON state.movimiento_id=v.movimiento_id
    JOIN eventos_justificacion_b4 e ON e.operacion_id=o.id
      AND e.accion='APROBACION'::"AccionEventoJustificacionB4"
      AND e.detalle->>'origen'='PROPUESTA_COBRO'
      AND e.detalle->>'propuestaId' IS NOT NULL
    WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
      AND d.activo AND d.factura_emitida_id IS NOT NULL
      AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
      AND state.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    UNION ALL
    SELECT line.factura_emitida_id AS "documentKey",receipt.propuesta_id::text AS "proposalKey",receipt.movimiento_id AS "movementKey"
    FROM recibos_cobro_remesa_b7 receipt
    JOIN lineas_recibo_cobro_remesa_b7 line ON line.recibo_id=receipt.id
    JOIN vinculos_movimiento_documento v ON v.id=receipt.vinculo_b4_id
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
    JOIN estado_justificacion_movimientos state ON state.movimiento_id=v.movimiento_id
    WHERE receipt.schema_version='B7_REMESA_RECIBO_V1'
      AND receipt.estado='CONFIRMADO'::"EstadoReciboCobroRemesaB7"
      AND receipt.snapshot_solicitud->>'schemaVersion'='B7_REMESA_RECIBO_V1'
      AND receipt.snapshot_resultado->>'schemaVersion'='B7_REMESA_RECIBO_V1'
      AND line.snapshot->>'schemaVersion'='B7_REMESA_RECIBO_V1'
      AND line.snapshot->'facturaEmitida'->>'id'=line.factura_emitida_id
      AND (line.snapshot->>'importeCentimos')::integer=line.importe_centimos
      AND v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
      AND d.activo
      AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
      AND state.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    ORDER BY 1,2,3
    LIMIT ${MAX_REBUILD_ROWS + 1}
  `)
  if (rows.length > MAX_REBUILD_ROWS) throw new Error('CONCILIAR_COLLECTION_RESERVATIONS_TOO_MANY')
  return rows.map(row => ({
    documentKey: typeof row.documentKey === 'string' ? row.documentKey : null,
    proposalKey: typeof row.proposalKey === 'string' ? row.proposalKey : null,
    movementKey: typeof row.movementKey === 'string' ? row.movementKey : null,
    status: 'CONFIRMED' as const,
  }))
}
export type CollectionReservationResolution = Readonly<{
  plan: CollectionReservationPlan
  selectedByMovement: ReadonlyMap<string, any>
  soleReviewByMovement: ReadonlyMap<string, any>
}>
/** Construye G1 contra toda la población viva. No desempata por orden ni UUID. */
export function collectionReservationResolution(input: Readonly<{
  proposals: readonly any[]
  movements: readonly any[]
  invoiceDates: ConciliarInvoiceDateIndex
  issuedReferences: readonly unknown[]
  clientIdentityByProposal: ReadonlyMap<string, CollectionClientIdentityProfile>
  reservations?: readonly CollectionDocumentReservation[]
}>): CollectionReservationResolution {
  const movementById = new Map(input.movements.map(movement => [String(movement.id), movement]))
  const byProposal = new Map<string, any>()
  const candidates: CollectionReservationProposal[] = []
  for (const proposal of input.proposals) {
    const proposalKey = typeof proposal?.propuestaId === 'string' ? proposal.propuestaId : null
    const movementKey = typeof proposal?.movimientoId === 'string' ? proposal.movimientoId : null
    const movement = movementKey ? movementById.get(movementKey) : undefined
    if (!proposalKey || !movementKey || !movement || proposal.estadoPropuesto !== 'JUSTIFICADO'
      || !['EXACTA', 'REVISAR'].includes(String(proposal.nivel))) continue
    if (byProposal.has(proposalKey)) throw new Error('CONCILIAR_COLLECTION_RESERVATION_PROPOSAL_DUPLICATE')
    byProposal.set(proposalKey, proposal)
    const amount = safeInteger(movement.importeCentimos)
    const status = amount === null ? null : collectionProposalStatus({
      proposal, amount, fechaBanco: day(movement.fecha, 'El movimiento'), conceptoBanco: textoSeguro(movement.concepto),
      movementAliases: movementPartyAliases(movement), invoiceDates: input.invoiceDates,
      issuedReferences: input.issuedReferences, movementId: movementKey,
      clientIdentity: input.clientIdentityByProposal.get(proposalKey),
    })
    const composition = proposalComposition(proposal.composicion)
    const remittanceSeal = isRemittanceMethod(proposal.metodo)
      ? remittanceSealForProposal({
        propuestaId: proposalKey, movimientoId: movementKey, fingerprint: String(proposal.fingerprint),
        metodo: String(proposal.metodo), importeMovimientoCentimos: amount ?? 0,
        lineas: proposal.lineas, composicion: proposal.composicion,
      })
      : null
    const remittanceComplete = !isRemittanceMethod(proposal.metodo) || remittanceSeal !== null
    candidates.push({
      proposalKey, movementKey, projection: 'BANK_MOVEMENT', state: 'ACTIVE',
      quote: proposal.nivel === 'EXACTA' && remittanceComplete ? 'EXACT' : 'AMBER',
      quotedAmountCents: safeInteger(proposal.importeCentimos), bankAmountCents: amount,
      composition: composition.map(line => ({ documentKey: line.facturaEmitidaId, importeCentimos: line.importeCentimos })),
      evidence: {
        documentEvidenceComplete: status?.green === true && remittanceComplete,
        counterpartyEvidenceComplete: status?.green === true && remittanceComplete,
      },
    })
  }
  const plan = planCollectionDocumentReservations({ proposals: candidates, reservations: input.reservations })
  const selectedByMovement = new Map<string, any>()
  for (const selected of plan.selected) {
    const proposal = byProposal.get(selected.proposalKey)
    if (!proposal || String(proposal.movimientoId) !== selected.movementKey || selectedByMovement.has(selected.movementKey)) {
      throw new Error('CONCILIAR_COLLECTION_RESERVATION_PLAN_INVALID')
    }
    selectedByMovement.set(selected.movementKey, proposal)
  }
  const reviewsByMovement = new Map<string, string[]>()
  for (const review of plan.review) reviewsByMovement.set(review.movementKey, [...(reviewsByMovement.get(review.movementKey) ?? []), review.proposalKey])
  const soleReviewByMovement = new Map<string, any>()
  for (const [movementKey, proposalKeys] of reviewsByMovement) {
    if (proposalKeys.length !== 1 || selectedByMovement.has(movementKey)) continue
    const proposal = byProposal.get(proposalKeys[0]!)
    if (proposal) soleReviewByMovement.set(movementKey, proposal)
  }
  return { plan, selectedByMovement, soleReviewByMovement }
}
/** Same live classification before every human collection confirmation. This
 * validates current generation, own-reference namespace, dates and client proof;
 * the persisted green badge is not evidence and this helper writes nothing. */
export async function assertLiveCollectionProjectionForActionTx(base: Prisma.TransactionClient, expected: Readonly<{id:string; importeCentimos:number; source:ConciliarProjectionSource}>) {
  const source = expected.source, tx = asTx(base)
  if (!source.propuestaId || !source.movimientoId || !source.proposalFingerprint) fail(409,'DECISION_CAMBIADA','La propuesta de cobro está incompleta. Actualiza la lista.')
  const [movements,proposals,bank,reservations] = await Promise.all([
    unresolvedMovements(tx), liveCollectionProposals(tx),
    readBankInvoicingPopulation(tx as unknown as B7ReadDatabase,{enabled:true,assertIsolatedStaging:async()=>undefined}),
    readLiveCollectionDocumentReservations(base),
  ])
  const proposal = proposals.find(item => String(item.propuestaId) === source.propuestaId)
  const movement = movements.find(item => String(item.id) === source.movimientoId)
  if (!movement || !proposal || String(proposal.movimientoId)!==source.movimientoId || String(proposal.fingerprint)!==source.proposalFingerprint) fail(409,'DECISION_CAMBIADA','El cobro o su propuesta cambiaron. Actualiza la lista.')
  const profiles = await readCollectionClientIdentityProfiles(base,proposals.map(item => String(item.propuestaId)))
  if (!profiles) fail(409,'DECISION_CAMBIADA','No se puede comprobar la evidencia documental vigente. Actualiza la lista.')
  const invoiceDates = new Map(bank.invoices.map(item=>[item.invoiceId,item.fechaISO]))
  const collectionReservations = collectionReservationResolution({
    proposals,movements,invoiceDates,issuedReferences:bank.invoices.map(item=>item.numFactura),
    clientIdentityByProposal:profiles,reservations,
  })
  if (collectionReservations.selectedByMovement.get(source.movimientoId)?.propuestaId !== source.propuestaId) {
    fail(409,'DECISION_CAMBIADA','La reserva documental de este cobro cambió. Actualiza la lista.')
  }
  const current = collectionProjectionForMovement(movement,proposal,invoiceDates,bank.invoices.map(item=>item.numFactura),profiles.get(source.propuestaId))
  if (current.row.id!==expected.id || current.row.importeCentimos!==expected.importeCentimos || current.row.color!=='VERDE' || !current.row.seleccionable) fail(409,'DECISION_CAMBIADA','El cobro ya no coincide exactamente con la documentación y el cliente actuales. Actualiza la lista.')
}

export function proposalCompositionInvoiceIds(raw: unknown): string[] {
  return [...new Set(proposalComposition(raw).flatMap(item => item.facturaEmitidaId ? [item.facturaEmitidaId] : []))].sort()
}

type ProposalLine = Readonly<{ tipo: 'DOCUMENTO' | 'DIFERENCIA'; tipoDocumento?: 'FACTURA_EMITIDA' | 'REMESA'; sourceId?: string; importeCentimos: number; motivoDiferencia?: string }>
function proposalLines(raw: unknown): ProposalLine[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 40) return null
  const result: ProposalLine[] = []
  for (const value of raw) {
    const line = object(value), amount = safeInteger(line.importeCentimos)
    if (amount === null || amount === 0) return null
    if (line.tipo === 'DOCUMENTO' && (line.tipoDocumento === 'FACTURA_EMITIDA' || line.tipoDocumento === 'REMESA') && typeof line.sourceId === 'string' && line.sourceId.length > 0 && line.sourceId.length <= 160) {
      result.push({ tipo: 'DOCUMENTO', tipoDocumento: line.tipoDocumento, sourceId: line.sourceId, importeCentimos: amount })
    } else if (line.tipo === 'DIFERENCIA' && typeof line.motivoDiferencia === 'string' && line.motivoDiferencia.length <= 80) {
      result.push({ tipo: 'DIFERENCIA', motivoDiferencia: line.motivoDiferencia, importeCentimos: amount })
    } else return null
  }
  const total = result.reduce((sum, line) => sum + line.importeCentimos, 0)
  return Number.isSafeInteger(total) ? result : null
}
function proposalLineTotal(lines: readonly ProposalLine[]): number | null {
  const total = lines.reduce((sum, line) => sum + line.importeCentimos, 0)
  return Number.isSafeInteger(total) ? total : null
}
function isRemittanceMethod(value: unknown): boolean {
  return value === 'REMESA_VENCIMIENTO' || value === 'REMESA_UNION' || value === 'REMESA_RESIDUO'
}
function compactCompositionDetail(composition: readonly ReturnType<typeof proposalComposition>[number][]): string | null {
  if (!composition.length) return null
  const listed = composition.slice(0, 12).map(item => `${item.numFactura ?? 'Factura'}${item.cliente ? ` · ${item.cliente}` : ''}`).join(' · ')
  const suffix = composition.length > 12 ? ` · y ${composition.length - 12} más` : ''
  return textoSeguro(`${composition.length} recibos: ${listed}${suffix}`).slice(0, 1_600)
}
export function movementPartyAliases(movement: any): string[] {
  // P1 stores its evidence caption (`name · kind · masked CIF`), not a raw
  // company name. Reuse the existing humanCounterpartyName presentation for
  // collections only; never strip arbitrary bank text or reinterpret payments.
  const amount = safeInteger(movement.importeCentimos)
  const confirmedName = amount !== null && amount > 0 && typeof movement.terceroConfirmado === 'string'
    ? movement.terceroConfirmado.split(' · ',1)[0].trim()
    : movement.terceroConfirmado
  const aliases = [movement.tercero, confirmedName, movement.entidadRazonSocial, movement.entidadNombreComercial]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  // Sólo un cargo puede ser pago de factura recibida. La expansión cerrada de
  // Xfera se comparte con la revalidación B4, que reutiliza esta misma función.
  if (amount === null || amount >= 0) return aliases
  return conciliarProveedorAliasesFuertes(
    aliases.map(conciliarExactCounterparty).filter((value): value is string => value !== null),
    conciliarExactCounterparty(movement.concepto),
  )
}

function normalizedFiscalIdentity(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const compact = value.normalize('NFKC').trim().toLocaleUpperCase('es-ES').replace(/[.\s-]/g, '')
  return /^[A-Z0-9]{7,20}$/.test(compact) ? compact : null
}

/** Legal/commercial presentation may differ only by punctuation and spacing.
 * Tokens are deliberately neither removed nor reordered; this helper is used
 * only after the same registered CLIENTE CIF has been proven. */
function legalPresentationIdentity(value: unknown): string | null {
  const exact = conciliarExactCounterparty(value)
  if (!exact) return null
  const tokens = exact.split(/[\p{P}\p{S}\s]+/gu).filter(Boolean)
  // S.A./SA, S.L./SL and their U suffix are punctuation presentations only.
  // No letter (including U), company-name token or word order is discarded.
  for (const length of [3,2]) {
    const suffix = tokens.slice(-length)
    if (suffix.length === length && suffix.every(token => /^[A-Z]{1,3}$/.test(token)) && ['SA','SL','SAU','SLU'].includes(suffix.join(''))) {
      tokens.splice(-length,length,suffix.join(''))
      break
    }
  }
  const presentation = tokens.join('\u0001')
  return presentation.length > 0 && presentation.length <= 300 ? presentation : null
}

/**
 * An exceptional alias expansion is allowed only for a complete live proposal:
 * every composition entry resolves once to FI, every FI carries the same CIF as
 * the active registered CLIENTE card selected on the bank movement, and every
 * FI client name is its legal/commercial card presentation modulo punctuation.
 * No amount, composition label, token removal, inferred card, or new alias can
 * make this predicate true.
 */
/** A registered company acronym may be written out by the bank. This is not
 * fuzzy matching: exactly one registered internal term has a closed, literal expansion;
 * arbitrary words sharing initials are rejected. Every prefix and suffix token stays
 * identical. Used only inside the complete same-CIF registered-client proof. */
function registeredClientPresentationMatches(bank: unknown, registered: unknown): boolean {
  const bankName = legalPresentationIdentity(bank), registeredName = legalPresentationIdentity(registered)
  if (!bankName || !registeredName) return false
  if (bankName === registeredName) return true
  const left = bankName.split('\u0001'), right = registeredName.split('\u0001')
  // An exact corporate prefix and legal suffix are mandatory; no first-word,
  // whole-name or legal-suffix acronym can become a company identity.
  if (!['SA','SL','SAU','SLU'].includes(right[right.length-1])) return false
  for (let index=1; index<right.length-1; index++) {
    const acronym = right[index]
    const expansion = acronym === 'ECS' ? ['ENTERPRISE','COMPUTING','SOLUTIONS'] : null
    if (!expansion || left.length!==right.length+expansion.length-1) continue
    if (!right.slice(0,index).every((token,i)=>left[i]===token)) continue
    const expanded = left.slice(index,index+expansion.length)
    if (!expansion.every((word,i)=>expanded[i]===word)) continue
    if (right.slice(index+1).every((token,i)=>left[index+expansion.length+i]===token)) return true
  }
  return false
}

export function collectionClientIdentityMatches(profile: CollectionClientIdentityProfile | undefined, bankAliases: readonly unknown[] = []): boolean {
  if (!profile || profile.compositionCount < 1 || profile.compositionInvoiceIdCount !== profile.compositionCount
    || profile.invoiceCount !== profile.compositionCount || profile.distinctInvoiceCount !== profile.compositionCount
    || profile.invoiceCifs.length !== profile.compositionCount || profile.invoiceNames.length !== profile.compositionCount
    || profile.entityType !== 'CLIENTE' || profile.entityActive !== true) return false
  const entityCif = normalizedFiscalIdentity(profile.entityCif)
  const legal = legalPresentationIdentity(profile.entityLegalName)
  const commercial = legalPresentationIdentity(profile.entityCommercialName)
  const presentations = new Set([legal, commercial].filter((value): value is string => value !== null))
  if (!entityCif || !presentations.size) return false
  if (!profile.entityBoundToMovement && !bankAliases.some(alias => {
    return registeredClientPresentationMatches(alias,profile.entityLegalName) || registeredClientPresentationMatches(alias,profile.entityCommercialName)
  })) return false
  return profile.invoiceCifs.every(value => normalizedFiscalIdentity(value) === entityCif)
    && profile.invoiceNames.every(value => {
      const presentation = legalPresentationIdentity(value)
      return presentation !== null && presentations.has(presentation)
    })
}
export function payrollPeriodMatches(fechaBanco: string, payroll: any): boolean {
  const year = Number(fechaBanco.slice(0, 4)), month = Number(fechaBanco.slice(5, 7))
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isSafeInteger(payroll.anio) || !Number.isSafeInteger(payroll.mes)) return false
  return (payroll.anio === year && payroll.mes === month) || (month === 1 ? payroll.anio === year - 1 && payroll.mes === 12 : payroll.anio === year && payroll.mes === month - 1)
}
function collectionProposalStatus(input: Readonly<{
  proposal: any | undefined
  amount: number
  fechaBanco: string
  conceptoBanco: string
  movementAliases: readonly string[]
  invoiceDates: ReadonlyMap<string, string | null>
  issuedReferences?: readonly unknown[]
  movementId?: string
  clientIdentity?: CollectionClientIdentityProfile
}>): Readonly<{ green: boolean; reason: string; composition: ReturnType<typeof proposalComposition>; lines: readonly ProposalLine[]; remesaIds: number[] }> {
  const proposal = input.proposal
  const composition = proposal ? proposalComposition(proposal.composicion) : []
  const lines = proposal ? proposalLines(proposal.lineas) : null
  if (!proposal || !lines || proposalLineTotal(lines) !== input.amount || Number(proposal.importeCentimos) !== input.amount || proposal.estadoPropuesto !== 'JUSTIFICADO' || proposal.nivel !== 'EXACTA') {
    return { green: false, reason: proposal ? 'La propuesta de cobro cambió o necesita revisión.' : 'Falta el documento que explica este cobro.', composition, lines: lines ?? [], remesaIds: [] }
  }
  const documents = lines.filter((line): line is ProposalLine & { tipo: 'DOCUMENTO'; sourceId: string; tipoDocumento: 'FACTURA_EMITIDA' | 'REMESA' } => line.tipo === 'DOCUMENTO' && !!line.sourceId && !!line.tipoDocumento)
  if (!documents.length || !composition.length || composition.some(item => item.importeCentimos === null || item.importeCentimos! <= 0)) {
    return { green: false, reason: 'La propuesta no conserva la composición completa de los recibos.', composition, lines, remesaIds: [] }
  }
  const compositionTotal = composition.reduce((sum, item) => sum + (item.importeCentimos ?? 0), 0)
  if (!Number.isSafeInteger(compositionTotal) || compositionTotal !== input.amount) {
    return { green: false, reason: 'La suma de los recibos no coincide exactamente con el ingreso.', composition, lines, remesaIds: [] }
  }
  const referencesMatch = input.issuedReferences === undefined
    ? referenciasFacturaCitadas(input.conceptoBanco).every(reference => composition.some(item => normalizarReferenciaFactura(item.numFactura) === reference))
    : referenciasEmitidasComposicionCompatible(input.conceptoBanco, composition.map(item => item.numFactura), input.issuedReferences)
  if (!referencesMatch) {
    return { green: false, reason: 'El número de factura citado por el banco no coincide con los recibos de la propuesta.', composition, lines, remesaIds: [] }
  }
  const invoiceDates = composition.map(item => item.facturaEmitidaId ? input.invoiceDates.get(item.facturaEmitidaId) ?? null : null)
  if (invoiceDates.some(date => date === null || date > input.fechaBanco)) {
    return { green: false, reason: 'Falta una fecha de factura verificable anterior al cobro.', composition, lines, remesaIds: [] }
  }
  const clientAliasMatches = conciliarAliasesMatch(input.movementAliases, composition.map(item => item.cliente))
  const clientFiscalIdentityMatches = input.clientIdentity?.proposalId === String(proposal.propuestaId)
    && input.clientIdentity.movimientoId === input.movementId
    && collectionClientIdentityMatches(input.clientIdentity, input.movementAliases)
  if (!isRemittanceMethod(proposal.metodo) && input.movementAliases.length > 0 && !clientAliasMatches && !clientFiscalIdentityMatches) {
    return { green: false, reason: 'El cliente identificado no coincide exactamente con la factura propuesta.', composition, lines, remesaIds: [] }
  }
  const remesaIds = documents.filter(line => line.tipoDocumento === 'REMESA' && /^\d+$/.test(line.sourceId)).map(line => Number(line.sourceId)).filter(Number.isSafeInteger).sort((left, right) => left - right)
  return { green: true, reason: isRemittanceMethod(proposal.metodo) ? 'La remesa y todos sus recibos cierran exactamente con el ingreso.' : 'Importe, cliente y facturas de la propuesta coinciden.', composition, lines, remesaIds }
}

type InvoiceCandidate = Readonly<{ movementId: string; color: ConciliarColor; rowId: string; propuestaId: string | null }>
/** Índice canónico de fechas procedente de la población B7 completa.  Tanto el
 * rebuild como los parches parciales deben usarlo: releer sólo FacturaEmitida
 * puede convertir una FI excluida/no económica en una propuesta verde distinta
 * de la que produciría el rebuild. */
export type ConciliarInvoiceDateIndex = ReadonlyMap<string, string | null>

/** Constructor único de EMITIDAS para rebuild y delta.  El estado monetario
 * procede siempre de calculateBankInvoicing; una propuesta sólo colorea el
 * candidato de revisión y nunca altera pendienteCentimos. */
export function emittedProjection(settlement: InvoiceSettlement, candidate: InvoiceCandidate | undefined): RebuildRow | null {
  if (settlement.paymentState === 'COBRADA_CALCULADA') return null
  const target = settlement.targetCents, pending = settlement.remainingCents
  const color: ConciliarColor = pending === null || target === null || settlement.paymentState === 'PENDIENTE_COBRO_REVISION' ? 'AMBAR' : 'ROJO'
  const reason = pending === null ? 'No se puede comprobar el saldo de esta factura con la evidencia bancaria disponible.'
    : settlement.paymentState === 'PENDIENTE_COBRO_REVISION' ? 'La factura tiene una asignación que requiere revisión; no se considera cobrada.'
      : 'Factura emitida pendiente de cobro documental.'
  const rowColor = candidate?.color === 'VERDE' ? 'VERDE' : candidate ? 'AMBAR' : color
  const rowReason = candidate?.color === 'VERDE' ? 'Hay un cobro que coincide; ábrelo para confirmarlo.' : candidate ? 'Hay un cobro propuesto que necesita revisión.' : reason
  return projection('EMITIDAS', baseRow({
    id: rowId('EMITIDAS', `PENDIENTE_FACTURA_EMITIDA:${settlement.invoiceId}`), movimientoId: candidate?.movementId ?? null,
    fecha: settlement.fechaISO ?? '1970-01-01', concepto: settlement.numFactura ?? 'Factura emitida', banco: null, cuenta: null,
    importeCentimos: pending ?? 0, pendienteCentimos: pending ?? 0, color: rowColor, grupo: 'FACTURAS_EMITIDAS', motivo: rowReason,
    documento: target === null ? null : { referencia: settlement.numFactura ?? `Factura ${settlement.invoiceId}`, tercero: settlement.cliente, importeCentimos: target, fecha: settlement.fechaISO, href: null },
    propuesta: candidate?.propuestaId ?? null, seleccionable: false, diferenciaCentimos: 0,
    linksMovimiento: candidate ? [{ id: candidate.rowId, href: `/admin/finanzas/conciliar?tab=COBROS&q=${encodeURIComponent(settlement.numFactura ?? '')}`, etiqueta: 'Abrir el cobro propuesto' }] : undefined,
    detail: settlement.reasons.join(' · ').slice(0, 1_600) || null,
  }), { kind: 'PENDIENTE_FACTURA_EMITIDA', facturaEmitidaId: settlement.invoiceId, ...(candidate ? { movimientoId: candidate.movementId } : {}) } as ConciliarProjectionSource, null)
}

/** Constructor único para un cobro propuesto. Todas las entradas son fuentes
 * vivas leídas por el llamador; ni la fila anterior ni sus hashes participan. */
export function collectionProjectionForMovement(movement: any, proposalRow: any | undefined, invoiceDates: ConciliarInvoiceDateIndex, issuedReferences?: readonly unknown[], clientIdentity?: CollectionClientIdentityProfile, reservationReviewOnly = false): RebuildRow {
  const id = String(movement.id), amount = cents(movement.importeCentimos, 'El movimiento')
  const fecha = day(movement.fecha, 'El movimiento'), concepto = textoSeguro(movement.concepto)
  const cuentaId = String(movement.cuentaId), banco = nullableText(movement.banco, 300), cuenta = nullableText(movement.cuenta, 300)
  const status = collectionProposalStatus({ proposal: proposalRow, amount, fechaBanco: fecha, conceptoBanco: concepto, movementAliases: movementPartyAliases(movement), invoiceDates, issuedReferences, movementId: id, clientIdentity })
  const one = status.composition.length === 1 ? status.composition[0] : null
  const documentValue = one && one.importeCentimos !== null ? { referencia: one.numFactura ?? 'Factura emitida', tercero: one.cliente, importeCentimos: one.importeCentimos, fecha: one.facturaEmitidaId ? invoiceDates.get(one.facturaEmitidaId) ?? null : null, href: null } : null
  const compositionTotal = status.composition.length && status.composition.every(line => line.importeCentimos !== null)
    ? status.composition.reduce((sum, line) => sum + line.importeCentimos!, 0) : null
  const documentaryDifference = compositionTotal !== null && Number.isSafeInteger(compositionTotal) ? amount - compositionTotal : 0
  const remesaProposal = proposalRow && /^REMESA_/.test(String(proposalRow.metodo))
  const remesaSeal = remesaProposal ? remittanceSealForProposal({ propuestaId: String(proposalRow.propuestaId), movimientoId: id, fingerprint: String(proposalRow.fingerprint), metodo: String(proposalRow.metodo), importeMovimientoCentimos: amount, lineas: proposalRow.lineas, composicion: proposalRow.composicion }) : null
  const green = !reservationReviewOnly && status.green && (!remesaProposal || remesaSeal !== null)
  const color: ConciliarColor = green ? 'VERDE' : proposalRow ? 'AMBAR' : 'ROJO'
  const motivo = reservationReviewOnly
    ? 'La propuesta de cobro requiere revisión antes de confirmar.'
    : remesaProposal && !remesaSeal ? 'La remesa necesita una composición íntegra de sus facturas antes de confirmarla.' : green ? status.reason : proposalRow
      ? status.reason
      : redReasonForMovement({ importeCentimos: amount, concepto, tarjeta: false })
  const source: ConciliarProjectionSource = proposalRow
    ? { kind: 'COBRO_PROPUESTA', movimientoId: id, propuestaId: String(proposalRow.propuestaId), proposalFingerprint: String(proposalRow.fingerprint), ...(remesaSeal ? { remesaId: remesaSeal.remesaId, proposalCompositionHash: remesaSeal.compositionHash } : {}), versionB4: cents(movement.versionB4, 'La versión') }
    : { kind: 'COBRO_PROPUESTA', movimientoId: id, versionB4: cents(movement.versionB4, 'La versión') }
  return projection('COBROS', baseRow({
    id: rowId('COBROS', `COBRO_PROPUESTA:${id}:${String(proposalRow?.propuestaId ?? 'SIN_PROPUESTA')}`), movimientoId: id, fecha, concepto, banco, cuenta,
    importeCentimos: amount, pendienteCentimos: amount, color, grupo: proposalRow ? nullableText(proposalRow.metodo, 120) : null, motivo, documento: documentValue,
    propuesta: proposalRow ? String(proposalRow.propuestaId) : null, seleccionable: green, diferenciaCentimos: green ? 0 : documentaryDifference,
    detail: proposalRow ? compactCompositionDetail(status.composition) ?? textoSeguro(proposalRow.explicacion).slice(0, 1_600) : null,
  }), source, cuentaId)
}

export async function confirmingProjectionForMovement(tx: Tx, movement: any, candidate: any): Promise<RebuildRow> {
  const id = String(movement.id), amount = cents(movement.importeCentimos, 'El movimiento')
  const fecha = day(movement.fecha, 'El movimiento'), concepto = textoSeguro(movement.concepto)
  const cuentaId = String(movement.cuentaId), banco = nullableText(movement.banco, 300), cuenta = nullableText(movement.cuenta, 300)
  const exact = candidate.estado === 'LISTO_PARA_CONFIRMACION_B4'
    && candidate.totalLineasB4Centimos === amount
    && candidate.sourceHash !== null
  const documents = candidate.facturas
  const single = documents.length === 1 ? documents[0] : null
  const opaqueId = rowId('COBROS', `COBRO_CONFIRMING:${id}:${candidate.confirmingId}`)
  const confirmingFile = await resolveStoredConfirmingFile(tx as unknown as ConfirmingQueryClient, candidate.confirmingId)
  const documentValue = candidate.totalFacturasCentimos !== null ? {
    referencia: single ? single.numeroFacturaEmitida ?? single.numeroDocumento : `Confirming · ${documents.length} facturas`,
    tercero: single?.sociedadFactura ?? 'Grupo Draxton', importeCentimos: candidate.totalFacturasCentimos,
    fecha: candidate.fechaDocumento, href: candidateFileHref(opaqueId, !!confirmingFile),
  } : null
  return projection('COBROS', baseRow({
    id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount,
    color: exact ? 'VERDE' : 'AMBAR', grupo: 'CONFIRMING_DRAXTON',
    motivo: exact ? 'El documento de confirming, sus facturas y las deducciones indicadas cierran exactamente.' : 'El confirming necesita revisión antes de confirmarlo.',
    documento: documentValue, propuesta: `confirming:${candidate.confirmingId}`, seleccionable: exact,
    diferenciaCentimos: exact ? 0 : amount - (candidate.totalLineasB4Centimos ?? 0),
    detail: candidate.gastosFinancierosHistoricosIgnorados ? 'Sólo se han usado las deducciones que aparecen expresamente en el documento.' : null,
  }), {
    kind: 'COBRO_CONFIRMING', movimientoId: id, confirmingId: candidate.confirmingId,
    confirmingSourceHash: candidate.sourceHash ?? undefined, versionB4: cents(movement.versionB4, 'La versión'),
  }, cuentaId)
}

const PROJECTION_INSERT_BATCH = 500
async function assertProjectionSnapshot(tx: Tx): Promise<void> {
  // The advisory lock serializes rebuilds from imports, confirmations and explicit
  // refreshes. The surrounding caller owns the transaction; it must already give
  // us a repeatable snapshot before any source population is read.
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'conciliar:projection:rebuild:v1'},0))::text AS locked`)
  const rows = await tx.$queryRaw<Array<{ isolation: string }>>(Prisma.sql`SELECT lower(current_setting('transaction_isolation')) AS isolation`)
  if (!['repeatable read', 'serializable'].includes(rows[0]?.isolation ?? '')) {
    fail(409, 'PROYECCION_SNAPSHOT_REQUERIDO', 'La actualización de Conciliar requiere una lectura repetible.')
  }
}

function projectionInsertValue(item: RebuildRow) {
  return {
    id: item.row.id, tab: item.tab, movimientoId: item.row.movimientoId, cuentaId: item.cuentaId, fecha: item.row.fecha,
    importeCentimos: item.row.importeCentimos, pendienteCentimos: item.row.pendienteCentimos, color: item.row.color,
    grupo: item.row.grupo, motivo: item.row.motivo, concepto: item.row.concepto, banco: item.row.banco, cuenta: item.row.cuenta,
    documento: item.row.documento, propuesta: item.row.propuesta, seleccionable: item.row.seleccionable,
    diferenciaCentimos: item.row.diferenciaCentimos, linksMovimiento: item.row.linksMovimiento ?? null, detail: item.row.detail,
    source: item.source, sourceFingerprint: item.sourceFingerprint,
  }
}

export async function insertProjectionBatches(tx: Tx, rows: readonly RebuildRow[]): Promise<void> {
  for (let start = 0; start < rows.length; start += PROJECTION_INSERT_BATCH) {
    const batch = rows.slice(start, start + PROJECTION_INSERT_BATCH).map(projectionInsertValue)
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO conciliar_proyecciones(
        id,tab,movimiento_id,cuenta_id,fecha,importe_centimos,pendiente_centimos,color,grupo,motivo,concepto,banco,cuenta,
        documento,propuesta,seleccionable,diferencia_centimos,links_movimiento,detail,source,source_fingerprint,updated_at
      )
      SELECT x.id,x.tab,x."movimientoId",x."cuentaId",CAST(x.fecha AS date),x."importeCentimos",x."pendienteCentimos",x.color,
        x.grupo,x.motivo,x.concepto,x.banco,x.cuenta,x.documento,x.propuesta,x.seleccionable,x."diferenciaCentimos",
        x."linksMovimiento",x.detail,x.source,x."sourceFingerprint",CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(CAST(${JSON.stringify(batch)} AS jsonb)) AS x(
        id text,tab text,"movimientoId" text,"cuentaId" text,fecha text,"importeCentimos" integer,"pendienteCentimos" integer,
        color text,grupo text,motivo text,concepto text,banco text,cuenta text,documento jsonb,propuesta text,seleccionable boolean,
        "diferenciaCentimos" integer,"linksMovimiento" jsonb,detail text,source jsonb,"sourceFingerprint" text
      )
    `)
  }
}

/**
 * Rebuilds an exact, already-classified set of bank-fee rows from their current
 * locked B4 sources. It never accepts a historic projection/fingerprint/decision
 * hash as evidence. The three set queries deliberately finish before the single
 * insert: any missing source, active P1, current non-fee classification or
 * existing projection returns false without a partial restoration. The caller
 * then retains dirty and uses the established full-rebuild route.
 */
export async function restoreLiveBankFeeProjectionBatchTx(base: Prisma.TransactionClient, movimientoIds: readonly string[]): Promise<boolean> {
  if (movimientoIds.length < 1 || movimientoIds.length > 100 || new Set(movimientoIds).size !== movimientoIds.length) return false
  const tx = asTx(base)
  const ids = Prisma.join(movimientoIds.map(movimientoId => Prisma.sql`${movimientoId}`))
  const movements = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id AS "movimientoId",m.cuenta_id AS "cuentaId",m.fecha_operacion::date::text AS fecha,
      b4_importe_bancario_centimos(m.importe) AS "importeCentimos",COALESCE(e.version,1) AS "versionB4",
      m.concepto,m.referencia,m.info_adicional AS "infoAdicional",m.tercero,c.banco,c.alias AS cuenta
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.id IN (${ids}) AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
    FOR UPDATE OF m,c
  `)
  if (movements.length !== movimientoIds.length) return false
  const currentByMovementId = new Map<string, any>()
  for (const current of movements) {
    const movimientoId = typeof current?.movimientoId === 'string' ? current.movimientoId : null
    if (!movimientoId || currentByMovementId.has(movimientoId)) return false
    currentByMovementId.set(movimientoId, current)
  }
  if (currentByMovementId.size !== movimientoIds.length || movimientoIds.some(movimientoId => !currentByMovementId.has(movimientoId))) return false
  const activeP1 = await tx.$queryRaw<Array<{ movimientoId: string }>>(Prisma.sql`
    SELECT d.movimiento_id AS "movimientoId"
    FROM decisiones_tercero_modo_facil d
    WHERE d.movimiento_id IN (${ids}) AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
      AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
    FOR UPDATE OF d
  `)
  if (activeP1.length) return false
  const existing = await tx.$queryRaw<Array<{ movimientoId: string }>>(Prisma.sql`
    SELECT movimiento_id AS "movimientoId" FROM conciliar_proyecciones
    WHERE movimiento_id IN (${ids}) FOR UPDATE
  `)
  if (existing.length) return false
  const rows: RebuildRow[] = []
  for (const movimientoId of movimientoIds) {
    const rebuilt = buildBankFeeProjectionSeed(currentByMovementId.get(movimientoId))
    if (!rebuilt) return false
    rows.push(projection(rebuilt.tab, rebuilt.row, rebuilt.source, rebuilt.cuentaId))
  }
  await insertProjectionBatches(tx, rows)
  return true
}

/** Single-leg compatibility adapter for callers and local fixtures predating batches. */
export async function restoreLiveBankFeeProjectionTx(base: Prisma.TransactionClient, movimientoId: string): Promise<boolean> {
  return restoreLiveBankFeeProjectionBatchTx(base, [movimientoId])
}

type StrictTransferLeg = Readonly<{ movementId: string; oppositeMovementId: string; fingerprint: string }>
/**
 * Conciliar deliberately reuses the same fail-closed ingredients as the approved
 * Modo fácil automation: bilateral candidates, account attestation, exact local
 * balance chain and extract coverage. A pair that lacks any one proof is simply
 * not returned; it must remain human review, never an amount-only transfer.
 */
export async function readStrictOwnTransfers(tx: Tx): Promise<ReadonlyMap<string, StrictTransferLeg>> {
  const seeds = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.cuenta_id AS "cuentaId",m.fecha_operacion::date::text AS fecha,m.importe::text AS "importeText",
      m.concepto,m.referencia,m.info_adicional AS "infoAdicional",m.tercero,c.banco AS "bancoCuenta",COALESCE(e.version,1) AS "versionB4"
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id AND c.activa=true
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND m.factura_id IS NULL AND m.gasto_id IS NULL AND m.factura_emitida_id IS NULL AND m.nomina_id IS NULL
      AND m.entrega_a_cuenta_empleado_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM patas_recibo_auto_modo_facil p WHERE p.movimiento_id=m.id)
      AND NOT EXISTS (
        SELECT 1 FROM decisiones_tercero_modo_facil d
        WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
          AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id)
      )
    ORDER BY m.fecha_operacion::date ASC,m.id ASC LIMIT ${MAX_REBUILD_ROWS + 1}
  `)
  if (seeds.length > MAX_REBUILD_ROWS) return new Map()
  const movements: EasyAutoMovement[] = []
  for (const row of seeds) {
    try {
      const amount = centsFromExactSqlText(row.importeText, `traspaso ${String(row.id)}.importe`)
      const version = safeInteger(row.versionB4)
      if (version === null || version < 1) continue
      movements.push({
        id: String(row.id), cuentaId: String(row.cuentaId), fecha: day(row.fecha, 'El movimiento'), importeCentimos: amount, versionB4: version,
        concepto: nullableText(row.concepto), referencia: nullableText(row.referencia), infoAdicional: nullableText(row.infoAdicional), tercero: nullableText(row.tercero), bancoCuenta: nullableText(row.bancoCuenta),
      })
    } catch { /* malformed source never becomes a transfer proof */ }
  }
  const pairs = selectBilateralTransfers(movements)
  if (!pairs.length) return new Map()
  const accountIds = [...new Set(pairs.flatMap(pair => pair.movimientos.map(item => item.cuentaId)))].sort()
  const movementIds = pairs.flatMap(pair => pair.movimientos.map(item => item.id))
  const attestations = await tx.$queryRaw<Array<{ cuentaId: string }>>(Prisma.sql`
    SELECT DISTINCT a.cuenta_id AS "cuentaId"
    FROM atestaciones_cuenta_auto_modo_facil a
    JOIN politicas_auto_modo_facil p ON p.id=a.politica_id AND p.estado='ACTIVA'
      AND p.entorno=CASE WHEN current_database()='io_staging_finanzas' THEN 'STAGING' ELSE 'PRODUCTION' END
    WHERE a.cuenta_id IN (${Prisma.join(accountIds.map(id => Prisma.sql`${id}`))})
    ORDER BY a.cuenta_id ASC LIMIT ${accountIds.length}
  `)
  const owned = new Set(attestations.map(row => row.cuentaId))
  if (pairs.some(pair => pair.movimientos.some(item => !owned.has(item.cuentaId)))) return new Map()
  const balances = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.cuenta_id AS "cuentaId",m.fecha_operacion::date::text AS fecha,m.importe::text AS "importeText",m.saldo::text AS "saldoText",
      c.fecha_corte_extracto::date::text AS "cutoff"
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id AND c.activa=true
    WHERE m.cuenta_id IN (${Prisma.join(accountIds.map(id => Prisma.sql`${id}`))})
    ORDER BY m.cuenta_id ASC,m.fecha_operacion::date ASC,m.id ASC LIMIT ${MAX_REBUILD_ROWS + 1}
  `)
  if (balances.length > MAX_REBUILD_ROWS) return new Map()
  const sourceById = new Map<string, any>()
  const balanceRows: EasyAutoBalanceRow[] = balances.map(row => {
    let importeCentimos: number | null = null, saldoCentimos: number | null = null
    try { importeCentimos = centsFromExactSqlText(row.importeText, `saldo ${String(row.id)}.importe`, true) } catch { /* invalid proof is retained */ }
    try { saldoCentimos = row.saldoText === null ? null : centsFromExactSqlText(row.saldoText, `saldo ${String(row.id)}.saldo`, true) } catch { /* invalid proof is retained */ }
    sourceById.set(String(row.id), row)
    return { id: String(row.id), cuentaId: String(row.cuentaId), fecha: day(row.fecha, 'El movimiento'), importeCentimos, saldoCentimos }
  })
  const evidence = proveLocalBalanceNeighborhoods(balanceRows, movementIds)
  const result = new Map<string, StrictTransferLeg>()
  for (const pair of pairs) {
    const [left, right] = pair.movimientos
    const valid = [left, right].every(leg => {
      const proof = evidence.get(leg.id), source = sourceById.get(leg.id), cutoff = typeof source?.cutoff === 'string' ? source.cutoff.slice(0, 10) : null
      return proof?.ok === true && (!cutoff || cutoff >= leg.fecha)
    })
    if (!valid) continue
    result.set(left.id, { movementId: left.id, oppositeMovementId: right.id, fingerprint: pair.fingerprint })
    result.set(right.id, { movementId: right.id, oppositeMovementId: left.id, fingerprint: pair.fingerprint })
  }
  return result
}

export async function rebuildConciliarProjectionTx(base: Prisma.TransactionClient, rebuiltById: number | null) {
  const tx = asTx(base)
  await assertProjectionSnapshot(tx)
  const [movements, proposals, invoices, payroll, b5Documents, bank, confirming, transfers, reservations] = await Promise.all([
    unresolvedMovements(tx), liveCollectionProposals(tx), receivedInvoices(tx), payrollSources(tx),
    b5DocumentSources(tx),
    readBankInvoicingPopulation(tx as unknown as B7ReadDatabase, { enabled: true, assertIsolatedStaging: async () => undefined }),
    readConciliarConfirmingCandidates(tx, { allRebuild: true }),
    readStrictOwnTransfers(tx),
    readLiveCollectionDocumentReservations(tx),
  ])
  const manualOwnAccounts = await readManualOwnAccountProofTx(tx, movements.map(movement => String(movement.cuentaId)))
  const manualOwnIbanRows = manualOwnAccounts.proof.accountIds.size
    ? await tx.$queryRaw<Array<{ iban: string | null }>>(Prisma.sql`
      SELECT iban FROM cuentas_bancarias
      WHERE activa=true AND id IN (${Prisma.join([...manualOwnAccounts.proof.accountIds].sort().map(id => Prisma.sql`${id}`))})
      ORDER BY id ASC LIMIT ${MAX_REBUILD_ROWS + 1}
    `)
    : []
  if (manualOwnIbanRows.length > MAX_REBUILD_ROWS) throw new Error('CONCILIAR_MANUAL_OWN_ACCOUNTS_TOO_MANY')
  const manualOwnIbanKeys = new Set(manualOwnIbanRows.flatMap(row => {
    const iban = normalizedRegisteredOwnIban(row.iban)
    return iban ? [iban] : []
  }))
  const transferReviews = classifyConciliarOwnTransferReviews({
    movements: movements.map(movement => ({
      id: String(movement.id), cuentaId: String(movement.cuentaId), fecha: String(movement.fecha),
      importeCentimos: safeInteger(movement.importeCentimos) ?? 0, versionB4: safeInteger(movement.versionB4) ?? 0,
      concepto: nullableText(movement.concepto), referencia: nullableText(movement.referencia),
      infoAdicional: nullableText(movement.info_adicional), tercero: nullableText(movement.tercero), bancoCuenta: nullableText(movement.banco),
      thirdPartyConfirmed: movement.tieneTerceroConfirmado === true,
      documentaryLinked: movement.tieneVinculoDocumental === true,
      ownRecipientExplicit: movement.tieneCuentaPropiaConfirmada === true || hasExactOwnRecipientEvidence({
        id: String(movement.id), cuentaId: String(movement.cuentaId), fecha: String(movement.fecha),
        importeCentimos: safeInteger(movement.importeCentimos) ?? 0, versionB4: safeInteger(movement.versionB4) ?? 0,
        concepto: nullableText(movement.concepto), referencia: nullableText(movement.referencia),
        infoAdicional: nullableText(movement.info_adicional), tercero: nullableText(movement.tercero), bancoCuenta: nullableText(movement.banco),
      }, manualOwnIbanKeys),
    })),
    attestedOwnAccountIds: manualOwnAccounts.proof.accountIds,
  })
  const rows: RebuildRow[] = []
  const clientIdentityProfiles = await readCollectionClientIdentityProfiles(tx, proposals.map(proposal => String(proposal.propuestaId)))
  const clientIdentityByProposal = clientIdentityProfiles ?? new Map<string, CollectionClientIdentityProfile>()
  const invoiceDates = new Map(bank.invoices.map(item => [item.invoiceId, item.fechaISO]))
  const issuedReferences = bank.invoices.map(item => item.numFactura)
  const collectionReservations = collectionReservationResolution({
    proposals, movements, invoiceDates, issuedReferences, clientIdentityByProposal, reservations,
  })
  const receivedByCounterparty = new Map<string, any[]>()
  for (const invoice of invoices) {
    const total = exactMoney(invoice.total_text), counterparty = conciliarExactCounterparty(invoice.proveedor)
    if (total === null || total === 0 || counterparty === null) continue
    receivedByCounterparty.set(counterparty, [...(receivedByCounterparty.get(counterparty) ?? []), invoice])
  }
  const confirmingByMovement = new Map(confirming.candidates.map(item => [item.movimientoId, item]))
  const invoiceCandidate = new Map<string, InvoiceCandidate>()
  const receivedInvoicePaymentCandidates = new Map<string, ReceivedInvoicePendingPaymentCandidate[]>()
  const receivedById = new Map(invoices.map(invoice => [String(invoice.id), invoice]))
  const b5TicketsByMovement = new Map<string, ConciliarB5TicketCandidate[]>()
  const b5SupportsByMovement = new Map<string, ConciliarB5SupportCandidate[]>()
  for (const source of b5Documents) {
    const ticket = b5TicketCandidate(source)
    if (ticket) b5TicketsByMovement.set(ticket.movimientoId, [...(b5TicketsByMovement.get(ticket.movimientoId) ?? []), ticket])
    const support = b5SupportCandidate(source)
    if (support) b5SupportsByMovement.set(support.movimientoId, [...(b5SupportsByMovement.get(support.movimientoId) ?? []), support])
  }
  // Reserve received-invoice capacity across the complete unresolved payment
  // population before rendering any row. This intentionally runs before the UI
  // reader can paginate, so an exact invoice cannot be proposed to two cargos.
  const providerPayments: ConciliarProviderPayment[] = []
  for (const movement of movements) {
    const amount = safeInteger(movement.importeCentimos)
    if (amount === null || amount >= 0) continue
    const id = String(movement.id), fecha = isoDay(movement.fecha)
    if (!fecha || transfers.has(id) || transferReviews.has(id)) continue
    const fee = buildBankFeeProjectionSeed({
      movimientoId: id, cuentaId: String(movement.cuentaId), fecha, importeCentimos: amount, versionB4: movement.versionB4,
      concepto: textoSeguro(movement.concepto), referencia: movement.referencia, infoAdicional: movement.info_adicional,
      tercero: movement.tercero, banco: nullableText(movement.banco, 300), cuenta: nullableText(movement.cuenta, 300),
    })
    if (fee) continue
    const b5Review = selectConciliarB5DocumentReview({
      movimientoId: id, importeMovimientoCentimos: amount, fechaMovimiento: fecha,
      tickets: b5TicketsByMovement.get(id) ?? [], soportes: b5SupportsByMovement.get(id) ?? [],
    })
    if (b5Review.kind !== 'NONE') continue
    const aliases = movementPartyAliases(movement)
    const payrollCandidates = payroll.filter(candidate => {
      const net = exactMoney(candidate.total_text)
      return net !== null && -net === amount && payrollPeriodMatches(fecha, candidate) && conciliarAliasesMatch(aliases, [candidate.empleadoNombre])
    })
    if (payrollCandidates.length === 1) continue
    const preProviderKind = classifyConciliarRequestKind(requestKindInputForMovement(movement, amount, payrollReviewForConciliar(payrollCandidates)))
    if (preProviderKind && ['IMPUESTOS', 'PRESTAMO', 'NOMINA_PERSONAL', 'GASTO_BANCO'].includes(preProviderKind.kind)) continue
    providerPayments.push({
      movementId: id, fecha, importeBancoCentimos: amount, conceptoBanco: bankDocumentaryText(movement),
      referenciaBanco: nullableText(movement.referencia, 300),
      candidates: providerInvoiceCandidatesForMovement(movement, receivedByCounterparty),
    })
  }
  const providerAssignments = assignConciliarProviderPayments(providerPayments)

  for (const movement of movements) {
    const id = String(movement.id), amount = cents(movement.importeCentimos, 'El movimiento')
    const fecha = day(movement.fecha, 'El movimiento'), concepto = textoSeguro(movement.concepto)
    const cuentaId = String(movement.cuentaId), banco = nullableText(movement.banco, 300), cuenta = nullableText(movement.cuenta, 300)
    const transfer = transfers.get(id)
    if (transfer) {
      const tab: ConciliarTab = amount > 0 ? 'COBROS' : 'PAGOS'
      const opaqueId = rowId(tab, `TRANSFERENCIA_PROPIA:${id}:${transfer.oppositeMovementId}:${transfer.fingerprint}`)
      const pairTab = amount > 0 ? 'PAGOS' : 'COBROS'
      rows.push(projection(tab, baseRow({
        id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount,
        color: 'VERDE', grupo: 'TRASPASOS_PROPIOS', motivo: 'Traspaso entre dos cuentas propias comprobado.', documento: null,
        propuesta: null, seleccionable: true, diferenciaCentimos: 0,
        linksMovimiento: [{ id: transfer.oppositeMovementId, href: `/admin/finanzas/conciliar?tab=${pairTab}&q=${encodeURIComponent(transfer.oppositeMovementId)}`, etiqueta: 'Ver el movimiento de la otra cuenta' }], detail: null,
      }), {
        kind: 'TRANSFERENCIA_PROPIA', movimientoId: id, movimientoParId: transfer.oppositeMovementId,
        transferFingerprint: transfer.fingerprint, versionB4: cents(movement.versionB4, 'La versión'),
      } as ConciliarProjectionSource, cuentaId))
      continue
    }
    const transferReview = transferReviews.get(id)
    if (transferReview) {
      const tab: ConciliarTab = amount > 0 ? 'COBROS' : 'PAGOS'
      const pairTab = amount > 0 ? 'PAGOS' : 'COBROS'
      const oppositeMovementId = transferReview.movimientoParId
      const pairedExactly = transferReview.kind === 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA'
      rows.push(projection(tab, baseRow({
        id: rowId(tab, `REVISION_TRASPASO_PROPIO:${id}:${transferReview.kind}:${transferReview.transferFingerprint ?? 'SIN_PAREJA'}`),
        movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount,
        color: pairedExactly ? 'VERDE' : 'AMBAR', grupo: 'TRASPASOS_PROPIOS', motivo: conciliarOwnTransferReviewMotive(transferReview), documento: null,
        propuesta: null, seleccionable: false, diferenciaCentimos: 0,
        ...(oppositeMovementId ? { linksMovimiento: [{ id: oppositeMovementId, href: `/admin/finanzas/conciliar?tab=${pairTab}&q=${encodeURIComponent(oppositeMovementId)}`, etiqueta: 'Ver el posible movimiento de la otra cuenta' }] } : {}),
        detail: pairedExactly
          ? 'Pareja de traspaso propio visible: esta fila no permite confirmar ni pedir documentación; la confirmación histórica mantiene su prueba estricta independiente.'
          : 'Revisión de traspaso propio: esta fila no permite confirmar ni pedir documentación.',
      }), {
        kind: 'TRANSFERENCIA_PROPIA_MANUAL', movimientoId: id,
        ...(oppositeMovementId && transferReview.transferFingerprint ? {
          movimientoParId: oppositeMovementId, pairId: transferReview.transferFingerprint,
        } : {}),
        proofSource: manualOwnAccounts.proof.source,
        versionB4: cents(movement.versionB4, 'La versión'),
      } as ConciliarProjectionSource, cuentaId))
      continue
    }
    if (amount > 0) {
      const confirmingCandidate = confirmingByMovement.get(id)
      if (confirmingCandidate) {
        rows.push(await confirmingProjectionForMovement(tx, movement, confirmingCandidate))
        continue
      }
      const selectedProposal = collectionReservations.selectedByMovement.get(id)
      const reviewProposal = selectedProposal ? undefined : collectionReservations.soleReviewByMovement.get(id)
      const proposalRow = selectedProposal ?? reviewProposal
      const reservationReviewOnly = !selectedProposal && !!reviewProposal
      const clientIdentity = proposalRow ? clientIdentityByProposal.get(String(proposalRow.propuestaId)) : undefined
      const proposalStatus = collectionProposalStatus({ proposal: proposalRow, amount, fechaBanco: fecha, conceptoBanco: concepto, movementAliases: movementPartyAliases(movement), invoiceDates, issuedReferences, movementId: id, clientIdentity })
      const collection = collectionProjectionForMovement(movement, proposalRow, invoiceDates, issuedReferences, clientIdentity, reservationReviewOnly)
      rows.push(collection)
      if (selectedProposal && collection.row.color === 'VERDE') for (const item of proposalStatus.composition) {
        if (!item.facturaEmitidaId) continue
        const prior = invoiceCandidate.get(item.facturaEmitidaId)
        if (!prior || conciliarColorRank(collection.row.color) < conciliarColorRank(prior.color)) invoiceCandidate.set(item.facturaEmitidaId, { movementId: id, color: collection.row.color, rowId: collection.row.id, propuestaId: String(proposalRow.propuestaId) })
      }
      continue
    }

    const fee = buildBankFeeProjectionSeed({
      movimientoId: id, cuentaId, fecha, importeCentimos: amount, versionB4: movement.versionB4,
      concepto, referencia: movement.referencia, infoAdicional: movement.info_adicional, tercero: movement.tercero, banco, cuenta,
    })
    if (fee) {
      rows.push(projection(fee.tab, fee.row, fee.source, fee.cuentaId))
      continue
    }
    const b5Review = selectConciliarB5DocumentReview({
      movimientoId: id, importeMovimientoCentimos: amount, fechaMovimiento: fecha,
      tickets: b5TicketsByMovement.get(id) ?? [], soportes: b5SupportsByMovement.get(id) ?? [],
    })
    if (b5Review.kind !== 'NONE') {
      const adjuntoB5Id = b5Review.source.adjuntoB5Id
      const ticket = b5Review.kind === 'TICKET' ? b5Review : null
      // This is the established B5 private proxy contract: movement and opaque
      // attachment ID only. It has no drive/item/Graph locator and is recomputed
      // server-side by the existing allowlisted route before download.
      const attachmentHref = `/api/admin/finanzas/movimientos/${encodeURIComponent(id)}/archivos?archivoId=${encodeURIComponent(`ADJUNTO_B5:${adjuntoB5Id}`)}`
      const ticketFile = ticket ? (b5TicketsByMovement.get(id) ?? []).find(item => item.adjuntoB5Id === adjuntoB5Id) : null
      const controlledFile = ticketFile ? ticketFile.archivoControlado : false
      const opaqueId = rowId('PAGOS', `PAGO_TICKET_B5:${id}:${adjuntoB5Id}`)
      const source: ConciliarProjectionSource = {
        kind: 'PAGO_TICKET_B5', movimientoId: id, adjuntoB5Id,
        ...(ticket ? { gastoId: ticket.source.gastoId, documentoConciliableId: ticket.source.documentoConciliableId } : {}),
        versionB4: cents(movement.versionB4, 'La versión'),
      }
      // SOPORTE intentionally has no ConciliarDocument: the existing public
      // document shape makes its amount mandatory, while a support must never
      // assert one. Its B5 receipt badge stays visible through gestionDocumento.
      // The attached private href is carried only for a ticket until the parent
      // extends gestionDocumento with its amountless private-document link.
      const documentValue: ConciliarDocument | null = ticket
        ? {
          referencia: ticket.referencia, tercero: ticket.tercero,
          importeCentimos: ticket.importeDocumentoCentimos ?? 0, fecha: ticket.fechaDocumento,
          href: controlledFile ? attachmentHref : null,
        }
        : null
      rows.push(projection('PAGOS', baseRow({
        id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount,
        color: b5Review.color, grupo: ticket ? 'Tarjeta' : 'Documentos recibidos', motivo: b5Review.motivo,
        documento: documentValue, propuesta: null, seleccionable: b5Review.seleccionable,
        diferenciaCentimos: ticket ? ticket.diferenciaCentimos : 0,
        detail: ticket
          ? 'Ticket recibido para este pago. Revisa el archivo antes de confirmar.'
          : 'Archivo recibido: no acredita por sí solo el importe del pago. Revísalo antes de decidir.',
      }), source, cuentaId))
      continue
    }
    const aliases = movementPartyAliases(movement)
    const payrollCandidates = payroll.filter(candidate => {
      const net = exactMoney(candidate.total_text)
      return net !== null && -net === amount && payrollPeriodMatches(fecha, candidate) && conciliarAliasesMatch(aliases, [candidate.empleadoNombre])
    })
    if (payrollCandidates.length === 1) {
      const payrollSource = payrollCandidates[0], payrollCents = exactMoney(payrollSource.total_text)!, payrollFile = !!(typeof payrollSource.driveItemId === 'string' || driveItemDesdeArchivoUrlNominaControlada(payrollSource.archivo_url)) && !!bibliotecaFinancieraConfigurada()
      const opaqueId = rowId('PAGOS', `PAGO_NOMINA:${id}:${String(payrollSource.id)}`)
      const doc: ConciliarDocument = { referencia: `Nómina ${String(payrollSource.mes).padStart(2, '0')}/${payrollSource.anio}`, tercero: nullableText(payrollSource.empleadoNombre), importeCentimos: -payrollCents, fecha: null, href: candidateFileHref(opaqueId, payrollFile) }
      rows.push(projection('PAGOS', baseRow({ id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color: payrollFile ? 'VERDE' : 'AMBAR', grupo: 'NOMINAS', motivo: payrollFile ? 'Empleado, mes y líquido de la nómina coinciden con la transferencia.' : 'La nómina coincide, pero falta su archivo controlado.', documento: doc, propuesta: null, seleccionable: payrollFile, diferenciaCentimos: 0, detail: null }), { kind: 'PAGO_NOMINA', movimientoId: id, nominaId: String(payrollSource.id), versionB4: cents(movement.versionB4, 'La versión') }, cuentaId))
      continue
    }
    const providerAssignment = providerAssignments.get(id)
    const invoice = providerAssignment?.invoiceId ? receivedById.get(providerAssignment.invoiceId) : undefined
    if (providerAssignment && invoice) {
      const total = exactMoney(invoice.total_text)
      if (total === null || total === 0) throw new Error('CONCILIAR_PROVIDER_ASSIGNMENT_SOURCE_INVALID')
      const file = archivoRecibidaControlado({ oneDriveDriveId: invoice.driveId, oneDriveItemId: invoice.itemId, archivoOneDrive: invoice.archivo }) !== null
      const opaqueId = rowId('PAGOS', `PAGO_FACTURA_RECIBIDA:${id}:${String(invoice.id)}`)
      const exactCounterparty = conciliarAliasesMatch(aliases, [invoice.proveedor])
      // The assignment can inspect the three source fields to reserve capacity,
      // but a green row must use the same visible-concept revalidation as the
      // existing confirmation guard. This prevents a projection from becoming
      // confirmable on bank metadata that the action cannot revalidate.
      const evalExact = evaluarDocumentoExacto({ importeBancoCentimos: amount, importeDocumentoCentimos: -total, fechaBanco: fecha, fechaDocumento: typeof invoice.fecha === 'string' ? invoice.fecha : null, conceptoBanco: concepto, referenciaDocumento: String(invoice.referencia ?? 'Factura recibida'), unicoTercero: exactCounterparty })
      const green = providerAssignment.kind === 'EXACT_REFERENCE' && exactCounterparty && evalExact.color === 'VERDE' && file
      const color: ConciliarColor = green ? 'VERDE' : 'AMBAR'
      const amountDifference = amount - -total
      const dueHint = typeof invoice.vencimiento === 'string' ? ` Vencimiento: ${invoice.vencimiento}.` : ''
      const motive = green ? evalExact.motivo : providerAssignmentMotive(providerAssignment.reason)
      rows.push(projection('PAGOS', baseRow({ id: opaqueId, movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color, grupo: 'FACTURA_RECIBIDA', motivo: motive, documento: { referencia: String(invoice.referencia ?? 'Factura recibida'), tercero: nullableText(invoice.proveedor), importeCentimos: -total, fecha: typeof invoice.fecha === 'string' ? invoice.fecha : null, href: candidateFileHref(opaqueId, file) }, propuesta: null, seleccionable: green, diferenciaCentimos: amountDifference, detail: dueHint.trim() || null }), { kind: 'PAGO_FACTURA_RECIBIDA', movimientoId: id, facturaRecibidaId: String(invoice.id), versionB4: cents(movement.versionB4, 'La versión') }, cuentaId))
      const invoiceId = String(invoice.id)
      receivedInvoicePaymentCandidates.set(invoiceId, [...(receivedInvoicePaymentCandidates.get(invoiceId) ?? []), { rowId: opaqueId, color }])
      continue
    }
    const fallback = presentConciliarRequestKind(requestKindInputForMovement(movement, amount, payrollReviewForConciliar(payrollCandidates), providerReviewForConciliar(providerAssignment)))
    if (!fallback) throw new Error('CONCILIAR_REQUEST_KIND_PAYMENT_INVALID')
    rows.push(projection('PAGOS', baseRow({ id: rowId('PAGOS', `PAGO_SIN_DOCUMENTO:${id}`), movimientoId: id, fecha, concepto, banco, cuenta, importeCentimos: amount, pendienteCentimos: amount, color: fallback.color, grupo: fallback.grupo, motivo: fallback.motivo, documento: null, propuesta: null, seleccionable: false, diferenciaCentimos: 0, detail: null }), { kind: 'PAGO_FACTURA_RECIBIDA', movimientoId: id, versionB4: cents(movement.versionB4, 'La versión') }, cuentaId))
  }

  for (const settlement of bank.invoices) {
    const row = emittedProjection(settlement, invoiceCandidate.get(settlement.invoiceId))
    if (row) rows.push(row)
  }

  for (const invoice of invoices) {
    const total = exactMoney(invoice.total_text)
    if (total === null || total === 0) continue
    const assigned = safeInteger(invoice.asignado) ?? 0
    const settlement = receivedInvoicePendingSettlement({ totalCentimos: total, assignedCentimos: assigned })
    if (!settlement) continue
    const { targetCentimos: target, pendingCentimos: pending } = settlement
    const file = archivoRecibidaControlado({ oneDriveDriveId: invoice.driveId, oneDriveItemId: invoice.itemId, archivoOneDrive: invoice.archivo }) !== null
    const opaqueId = rowId('RECIBIDAS', `PENDIENTE_FACTURA_RECIBIDA:${String(invoice.id)}`)
    const candidate = receivedInvoicePendingCandidate(receivedInvoicePaymentCandidates.get(String(invoice.id)) ?? [])
    const reference = String(invoice.referencia ?? 'Factura recibida')
    const invoiceDate = day(invoice.fecha, 'La factura recibida')
    const motive = total < 0 && candidate.candidate === null ? 'Abono proveedor pendiente de aplicar.' : candidate.motivo
    rows.push(projection('RECIBIDAS', baseRow({ id: opaqueId, movimientoId: null, fecha: invoiceDate, concepto: reference, banco: null, cuenta: null, importeCentimos: pending, pendienteCentimos: pending, color: candidate.color, grupo: 'FACTURAS_RECIBIDAS', motivo: motive, documento: { referencia: reference, tercero: nullableText(invoice.proveedor), importeCentimos: target, fecha: invoiceDate, href: candidateFileHref(opaqueId, file) }, propuesta: null, seleccionable: false, diferenciaCentimos: 0, linksMovimiento: candidate.candidate ? [{ id: candidate.candidate.rowId, href: `/admin/finanzas/conciliar?tab=PAGOS&q=${encodeURIComponent(reference)}`, etiqueta: 'Abrir movimiento' }] : undefined, detail: file ? null : 'La factura existe, pero falta su PDF controlado; no se puede confirmar un pago nuevo sin el documento.' }), { kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: String(invoice.id) }, null))
  }

  if (rows.length > MAX_REBUILD_ROWS) fail(409, 'PROYECCION_DEMASIADA', 'La proyección supera el límite de rebuild manual; acota o revisa las fuentes.')
  await tx.$executeRaw(Prisma.sql`DELETE FROM conciliar_proyecciones`)
  await insertProjectionBatches(tx, rows)
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO estado_proyeccion_conciliar(singleton,dirty_at,dirty_reason,rebuilt_at,rebuilt_by_id,projection_version)
    VALUES(true,NULL,NULL,CURRENT_TIMESTAMP,${rebuiltById},1)
    ON CONFLICT(singleton) DO UPDATE SET dirty_at=NULL,dirty_reason=NULL,rebuilt_at=CURRENT_TIMESTAMP,rebuilt_by_id=${rebuiltById},projection_version=estado_proyeccion_conciliar.projection_version+1
  `)
  return { rows: rows.length, emitted: bank.invoices.length, rebuiltAt: new Date().toISOString() }
}

export async function rebuildConciliarProjection(rebuiltById: number | null) {
  return db().$transaction(tx => rebuildConciliarProjectionTx(tx, rebuiltById), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 })
}
