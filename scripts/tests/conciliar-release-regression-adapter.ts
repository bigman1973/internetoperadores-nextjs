/*
 * Private-release regression adapter.
 *
 * This module is intentionally owned by the release runner. It never opens a
 * connection, never logs source data, and only accepts a caller-owned pg client
 * already inside BEGIN READ ONLY. All identifiers below are opaque local tokens;
 * the runner emits only case IDs and static codes.
 */
import { readBankInvoicingPopulation } from '../../lib/finanzas/bank-invoicing-db'
import { extractRefsOwnIssued, normalizarReferenciaFactura, referenciasEmitidasComposicionCompatible, referenciasFacturaCitadas } from '../../lib/finanzas/conciliar-issued-reference-core'
import { readManualOwnAccountProofTx } from '../../lib/finanzas/conciliar-own-account-proof-db'
import { selectorSearchableText, type CanonicalRemittanceSelectorLink } from './conciliar-release-regression-selector-evidence'
import type { Prisma } from '@prisma/client'
import {
  canonicalGroupLabel,
  type GlobalAction,
  type GlobalConfirmingEvidence,
  type GlobalProjectionRow,
  type GlobalReferenceEvidence,
  type GlobalRegressionDataset,
  type GlobalRequestReason,
  type GlobalTab,
} from '../../lib/finanzas/conciliar-release-regression-global'
import type { ConciliarReleaseRegressionDataset, RegressionBankRow, RegressionProjectionRow } from '../../lib/finanzas/conciliar-release-regression-core'

export const ADAPTER_STATIC_CODES = [
  'REGRESSION_SCHEMA_INVALID',
  'REGRESSION_SNAPSHOT_INCOMPLETE',
  'REGRESSION_C11_EVIDENCE_MISSING',
  'REGRESSION_READONLY_QUERY_REJECTED',
] as const
export type AdapterStaticCode = typeof ADAPTER_STATIC_CODES[number]

export type ReadonlyPgClient = Readonly<{
  query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => Promise<{ rows: T[] }>
}>

type ProjectionSource = Readonly<{
  kind?: string
  movimientoId?: string
  movimientoParId?: string
  pairId?: string
  proofSource?: string
  propuestaId?: string
  facturaEmitidaId?: string
  facturaRecibidaId?: string
  nominaId?: string
  confirmingId?: string
  confirmingSourceHash?: string
}>
type ProjectionSqlRow = Readonly<{
  id: string
  tab: string
  movementId: string | null
  fecha: string
  amountCents: number | string
  pendingCents: number | string
  differenceCents: number | string
  requestState: string | null
  color: string
  groupLabel: string | null
  reasonText: string
  seleccionable: boolean
  documentValue: unknown
  proposalValue: string | null
  source: unknown
}>
type MovementSqlRow = Readonly<{
  movementKey: string
  bankName: string | null
  accountKey: string | null
  bankDate: string
  amountCents: number | string
  searchableText: string | null
  documentaryText: string | null
  bankReference: string | null
  counterpartyText: string | null
  b4Status: string
}>
type ProposalSqlRow = Readonly<{ proposalKey: string; movementKey: string; composition: unknown; amountCents: number | string; level: string | null; proposedState: string | null }>
type CollectionReservationSqlRow = Readonly<{ documentKey: string; proposalKey: string; movementKey: string }>
type C11SqlRow = Readonly<{
  liquidationId: string
  confirmingId: string
  liquidationKey: string
  version: number | string
  currentVersion: boolean
  documentState: string
  liquidationDate: string | null
  nominalCents: number | string
  interestCents: number | string
  commissionCents: number | string
  vatCommissionCents: number | string
  netCents: number | string
  sourceHash: string
}>
type C11LineSqlRow = Readonly<{ liquidationId: string; invoiceId: string; nominalCents: number | string }>
type C11DocumentSqlRow = Readonly<{ liquidationId: string; filename: string | null }>
type TotalsSqlRow = Readonly<{ tab: string; color: string; amountCents: number | string; groupLabel?: string | null }>
type CountSqlRow = Readonly<{ total: number | string }>

type CandidateProjection = Readonly<{
  id: string
  tab: GlobalTab
  movementKey: string | null
  bankDate: string
  amountCents: number
  differenceCents: number
  color: 'VERDE' | 'AMBAR' | 'ROJO'
  seleccionable: boolean
  groupLabel: string | null
  reasonText: string
  documentReference: string | null
  proposalValue: string | null
  source: ProjectionSource
  rawDocument: Record<string, unknown>
}>
type C11Prepared = Readonly<{ row: C11SqlRow; lines: readonly number[]; filenames: readonly string[] }>

const PAGE_SIZE = 500
const TABS = ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'] as const
const COLORS = ['VERDE', 'AMBAR', 'ROJO'] as const
const DANGEROUS_SQL = /\b(?:INSERT|UPDATE|DELETE|MERGE|UPSERT|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|LOCK|FOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE))\b/i

function fail(code: AdapterStaticCode): never { throw new Error(code) }
function integer(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && Math.abs(parsed) <= 2_147_483_647 ? parsed : null
}
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function object(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return object(JSON.parse(value)) } catch { return {} }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function array(value: unknown): unknown[] {
  if (typeof value === 'string') {
    try { return array(JSON.parse(value)) } catch { return [] }
  }
  return Array.isArray(value) ? value : []
}
function day(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}
function hasTab(value: unknown): value is GlobalTab { return (TABS as readonly string[]).includes(String(value)) }
function hasColor(value: unknown): value is 'VERDE' | 'AMBAR' | 'ROJO' { return (COLORS as readonly string[]).includes(String(value)) }
function source(value: unknown): ProjectionSource { return object(value) as ProjectionSource }
function safeSelect(sql: string): void {
  const compact = sql.trim()
  if (!/^(?:SELECT|WITH)\b/i.test(compact) || /;|--|\/\*/.test(compact) || DANGEROUS_SQL.test(compact)) fail('REGRESSION_READONLY_QUERY_REJECTED')
}
async function query<T extends Record<string, unknown>>(client: ReadonlyPgClient, sql: string, values: readonly unknown[] = []): Promise<T[]> {
  safeSelect(sql)
  return (await client.query<T>(sql, values)).rows
}
async function paged<T extends Record<string, unknown>>(client: ReadonlyPgClient, countSql: string, pageSql: string): Promise<T[]> {
  const countRows = await query<CountSqlRow>(client, countSql)
  const total = integer(countRows[0]?.total)
  if (countRows.length !== 1 || total === null || total < 0) fail('REGRESSION_SCHEMA_INVALID')
  const result: T[] = []
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const rows = await query<T>(client, pageSql, [PAGE_SIZE, offset])
    if (rows.length > PAGE_SIZE) fail('REGRESSION_SCHEMA_INVALID')
    result.push(...rows)
  }
  if (result.length !== total) fail('REGRESSION_SNAPSHOT_INCOMPLETE')
  return result
}

const PROJECTION_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM conciliar_proyecciones LIMIT 1`
const RECEIVED_REFERENCE_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM facturas_recibidas LIMIT 1`
const RECEIVED_REFERENCE_PAGE_SQL = `SELECT id,num_factura AS reference FROM facturas_recibidas ORDER BY id ASC LIMIT $1 OFFSET $2`
const PROJECTION_PAGE_SQL = `
  SELECT p.id,p.tab,p.movimiento_id AS "movementId",p.fecha::date::text AS fecha,
    p.importe_centimos AS "amountCents",p.pendiente_centimos AS "pendingCents",p.diferencia_centimos AS "differenceCents",g.estado::text AS "requestState",p.color,p.grupo AS "groupLabel",
    p.motivo AS "reasonText",p.seleccionable,p.documento AS "documentValue",p.propuesta AS "proposalValue",p.source
  FROM conciliar_proyecciones p LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id=p.movimiento_id
  ORDER BY p.id ASC LIMIT $1 OFFSET $2`
const MOVEMENT_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM movimientos_bancarios LIMIT 1`
const MOVEMENT_PAGE_SQL = `
  SELECT m.id AS "movementKey",c.banco AS "bankName",m.cuenta_id AS "accountKey",m.fecha_operacion::date::text AS "bankDate",
    b4_importe_bancario_centimos(m.importe) AS "amountCents",
    concat_ws(' ',m.concepto,m.referencia) AS "searchableText",
    concat_ws(' ',m.concepto,m.referencia,m.info_adicional) AS "documentaryText",m.referencia AS "bankReference",m.tercero AS "counterpartyText",
    COALESCE(e.estado::text,'SIN_DOCUMENTO') AS "b4Status"
  FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
  ORDER BY m.id ASC LIMIT $1 OFFSET $2`
const REMITTANCE_SELECTOR_SCOPE = `FROM vinculos_movimiento_documento v
  JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
  JOIN remesas r ON r.id=d.remesa_id
  JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
  JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
  WHERE v.activo AND v.tipo_linea='DOCUMENTO' AND d.activo AND d.tipo='REMESA'
    AND o.estado='APLICADA' AND o.revertida_at IS NULL AND e.estado='JUSTIFICADO'`
const REMITTANCE_SELECTOR_COUNT_SQL = `SELECT COUNT(*)::bigint AS total ${REMITTANCE_SELECTOR_SCOPE} LIMIT 1`
const REMITTANCE_SELECTOR_PAGE_SQL = `SELECT v.movimiento_id AS "movementKey",v.activo AS "lineActive",v.tipo_linea::text AS "lineKind",d.activo AS "documentActive",d.tipo::text AS "documentType",o.estado::text AS "operationState",(o.revertida_at IS NOT NULL) AS "operationReverted",e.estado::text AS "movementState",r.nombre AS "remittanceName" ${REMITTANCE_SELECTOR_SCOPE} ORDER BY v.id ASC LIMIT $1 OFFSET $2`
const PROPOSAL_COUNT_SQL = `
  WITH current_generation AS (SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1)
  SELECT COUNT(*)::bigint AS total FROM modo_facil_propuestas_cobro p JOIN current_generation g ON g.id=p.generacion_id
  WHERE p.estado_propuesto IN ('JUSTIFICADO','NO_REQUIERE') LIMIT 1`
const PROPOSAL_PAGE_SQL = `
  WITH current_generation AS (SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1)
  SELECT p.id::text AS "proposalKey",p.movimiento_id AS "movementKey",p.composicion AS composition,p.importe_movimiento_centimos AS "amountCents",p.nivel AS level,p.estado_propuesto AS "proposedState"
  FROM modo_facil_propuestas_cobro p JOIN current_generation g ON g.id=p.generacion_id
  WHERE p.estado_propuesto IN ('JUSTIFICADO','NO_REQUIERE') ORDER BY p.id ASC LIMIT $1 OFFSET $2`
const COLLECTION_RESERVATION_SCOPE = `
  FROM (
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
  ) reservations`
const COLLECTION_RESERVATION_COUNT_SQL = `SELECT COUNT(*)::bigint AS total ${COLLECTION_RESERVATION_SCOPE} LIMIT 1`
const COLLECTION_RESERVATION_PAGE_SQL = `SELECT "documentKey","proposalKey","movementKey" ${COLLECTION_RESERVATION_SCOPE} ORDER BY "documentKey","proposalKey","movementKey" LIMIT $1 OFFSET $2`
const C11_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM liquidaciones_confirming_documentales LIMIT 1`
const C11_PAGE_SQL = `
  SELECT l.id::text AS "liquidationId",l.confirming_id AS "confirmingId",l.liquidacion_key AS "liquidationKey",l.version,
    NOT EXISTS (SELECT 1 FROM liquidaciones_confirming_documentales n WHERE n.confirming_id=l.confirming_id AND n.liquidacion_key=l.liquidacion_key AND n.version>l.version) AS "currentVersion",
    l.estado_documental::text AS "documentState",l.fecha_liquidacion::date::text AS "liquidationDate",
    l.nominal_centimos AS "nominalCents",l.intereses_centimos AS "interestCents",l.comision_centimos AS "commissionCents",l.iva_comision_centimos AS "vatCommissionCents",l.neto_bancario_centimos AS "netCents",trim(l.fuente_hash) AS "sourceHash"
  FROM liquidaciones_confirming_documentales l ORDER BY l.id ASC LIMIT $1 OFFSET $2`
const C11_LINE_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM lineas_liquidacion_confirming LIMIT 1`
const C11_LINE_PAGE_SQL = `
  SELECT liquidacion_id::text AS "liquidationId",factura_emitida_id AS "invoiceId",nominal_centimos AS "nominalCents"
  FROM lineas_liquidacion_confirming ORDER BY id ASC LIMIT $1 OFFSET $2`
const C11_DOCUMENT_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM documentos_liquidacion_confirming LIMIT 1`
const C11_DOCUMENT_PAGE_SQL = `
  SELECT liquidacion_id::text AS "liquidationId",nombre_original AS filename
  FROM documentos_liquidacion_confirming ORDER BY id ASC LIMIT $1 OFFSET $2`
const TOTALS_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM (SELECT tab,color FROM conciliar_proyecciones GROUP BY tab,color) totals LIMIT 1`
const TOTALS_PAGE_SQL = `
  SELECT tab,color,COALESCE(SUM(importe_centimos::bigint),0)::bigint AS "amountCents"
  FROM conciliar_proyecciones GROUP BY tab,color ORDER BY tab,color LIMIT $1 OFFSET $2`
const GROUP_TOTALS_COUNT_SQL = `SELECT COUNT(*)::bigint AS total FROM (SELECT tab,color,COALESCE(grupo,'OTROS') FROM conciliar_proyecciones GROUP BY tab,color,COALESCE(grupo,'OTROS')) groups LIMIT 1`
const GROUP_TOTALS_PAGE_SQL = `
  SELECT tab,color,COALESCE(grupo,'OTROS') AS "groupLabel",COALESCE(SUM(importe_centimos::bigint),0)::bigint AS "amountCents"
  FROM conciliar_proyecciones GROUP BY tab,color,COALESCE(grupo,'OTROS') ORDER BY tab,color,COALESCE(grupo,'OTROS') LIMIT $1 OFFSET $2`

function parseComposition(value: unknown): readonly Readonly<{ documentKey: string; reference: string | null; client: string | null; amountCents: number; invoiceId: string | null }>[] {
  const root = Array.isArray(array(value)) ? array(value) : array(object(value).items)
  return root.map((item) => {
    const line = object(item)
    const invoiceId = text(line.facturaEmitidaId)
    const reference = text(line.numFactura)
    const client = text(line.cliente)
    const amountCents = integer(line.importeCentimos)
    return { documentKey: invoiceId ?? '', reference, client, amountCents: amountCents ?? Number.NaN, invoiceId }
  })
}
function documentReference(value: unknown): string | null { return text(object(value).referencia) }
function documentAmount(value: unknown): number | null { return integer(object(value).importeCentimos) }
function normalizedText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES').replace(/\s+/g, ' ').trim()
}
function canonicalProtectedKind(value: CandidateProjection): 'OWN_TRANSFER' | 'BANK_FEE' | 'PAYROLL' | 'NONE' {
  const group = canonicalPersistedGroup(value.groupLabel)
  if (value.source.kind === 'TRANSFERENCIA_PROPIA' || value.source.kind === 'TRANSFERENCIA_PROPIA_MANUAL' || group === 'TRASPASOS_PROPIOS') return 'OWN_TRANSFER'
  if (value.source.kind === 'COMISION_BANCARIA' || group === 'GASTOS_BANCO') return 'BANK_FEE'
  if (value.source.kind === 'PAGO_NOMINA' || group === 'NOMINAS') return 'PAYROLL'
  return 'NONE'
}
function canonicalPersistedGroup(value: string | null): string | null {
  const direct = canonicalGroupLabel(value ?? 'OTROS')
  if (direct) return direct
  const normalized = normalizedText(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (/^CONFIRMING(?:_DRAXTON)?$/.test(normalized)) return 'CONFIRMING'
  if (/^REMESA(?:S|_.+)?$/.test(normalized)) return 'REMESAS'
  if (/^(?:REF_FACTURA(?:_PARCIAL)?|COBRO_ISP|CLIENTE_IMPORTE|SUMA_CLIENTE|CLIENTES?)$/.test(normalized)) return 'CLIENTES'
  if (/^(?:TRASPASO_PROPIO|TRANSFERENCIA_PROPIA)$/.test(normalized)) return 'TRASPASOS_PROPIOS'
  if (/^(?:CONFIRMING_C9)$/.test(normalized)) return 'CONFIRMING'
  if (/^(?:DEVOLUCION_RECIBO)$/.test(normalized)) return 'DEVOLUCIONES'
  if (/^FACTURA_RECIBIDA$/.test(normalized)) return 'PROVEEDORES'
  if (/^(?:FACTURA|FACTURA_PROVEEDOR|PROVEEDOR(?:ES)?)$/.test(normalized)) return 'PROVEEDORES'
  if (/^FACTURA_EMITIDA$/.test(normalized)) return 'CLIENTES'
  if (/^COMISION_BANCO$/.test(normalized)) return 'GASTOS_BANCO'
  if (/^(?:DOCUMENTOS_RECIBIDOS|DOCUMENTOS_RECIBIDO)$/.test(normalized)) return 'OTROS'
  return null
}
function paraPedirFromKernel(row: CandidateProjection, bank: ReadonlyMap<string, MovementSqlRow>, requestState: string | null): boolean {
  // Exact predicate from para-pedir-projection-read.ts projection_base. It is
  // intentionally not a red-only approximation and does not turn a UI action
  // into a new classification.
  const movement = row.movementKey ? bank.get(row.movementKey) : undefined
  return row.movementKey !== null && (row.tab === 'COBROS' || row.tab === 'PAGOS')
    && !['TRASPASOS_PROPIOS','GASTOS_BANCO','NOMINAS'].includes(canonicalPersistedGroup(row.groupLabel) ?? '')
    && (movement?.b4Status === 'SIN_DOCUMENTO')
    && (requestState === null || requestState === 'PENDIENTE' || requestState === 'PEDIDO' || requestState === 'RECIBIDO')
}
function requestSemantics(row: CandidateProjection, bank: ReadonlyMap<string, MovementSqlRow>, requestState: string | null): Readonly<{ action: GlobalAction; reason: GlobalRequestReason }> {
  const protectedKind = canonicalProtectedKind(row)
  const inParaPedir = paraPedirFromKernel(row, bank, requestState)
  const requestEnabled = inParaPedir && row.color === 'ROJO' && (requestState === null || requestState === 'PENDIENTE')
  // Missing payroll has a distinct documentary route. A payroll row may be
  // amber/green in Conciliar, but it can never become a request for invoice.
  if (protectedKind === 'PAYROLL') return requestEnabled ? { action: 'REQUEST_PAYROLL', reason: 'MISSING_PAYROLL' } : { action: 'NONE', reason: 'NONE' }
  if (requestEnabled) return { action: 'REQUEST_INVOICE', reason: 'MISSING_INVOICE' }
  return { action: 'NONE', reason: 'NONE' }
}

/** Returns null instead of inventing C11 evidence when the persisted source is missing or ambiguous. */
export function confirmingEvidenceForSource(sourceValue: ProjectionSource, bankDate: string, candidates: readonly C11Prepared[]): GlobalConfirmingEvidence | null {
  if (sourceValue.kind !== 'COBRO_CONFIRMING' || !sourceValue.confirmingId || !sourceValue.confirmingSourceHash) return null
  const matching = candidates.filter(item => item.row.confirmingId === sourceValue.confirmingId && item.row.sourceHash === sourceValue.confirmingSourceHash)
  if (matching.length !== 1) return null
  const found = matching[0]!
  const version = integer(found.row.version)
  const nominal = integer(found.row.nominalCents)
  const interest = integer(found.row.interestCents)
  const commission = integer(found.row.commissionCents)
  const vat = integer(found.row.vatCommissionCents)
  const net = integer(found.row.netCents)
  const liquidationDate = day(found.row.liquidationDate)
  if (version === null || nominal === null || interest === null || commission === null || vat === null || net === null) return null
  return {
    evidenceSchema: 'C11', liquidationVersion: version, currentVersion: found.row.currentVersion === true,
    // A PostgreSQL row visible to this read-only transaction is committed; the
    // documentary state still has to be CUADRA and the evaluator rechecks every
    // line/cent/date below. No C9 support state is used as a substitute.
    persisted: found.row.documentState === 'CUADRA', sourceCommitState: found.row.documentState === 'CUADRA' ? 'COMMITTED' : 'UNKNOWN',
    bankDate, liquidationDate, invoiceLineCents: found.lines, interestCents: interest,
    commissionCents: commission, vatCommissionCents: vat, netCents: net,
  }
}

function referenceEvidenceForRow(row: CandidateProjection, bank: MovementSqlRow | undefined, proposal: ProposalSqlRow | undefined, issuedReferences: readonly string[], receivedReferences: ReadonlyMap<string, string>): GlobalReferenceEvidence | null {
  if (!bank) return null
  const documentaryText = bank.documentaryText ?? ''
  const cited = referenciasFacturaCitadas(documentaryText)
  const own = extractRefsOwnIssued(documentaryText, issuedReferences)
  const ownSet = new Set(own)
  const external = cited.filter(reference => !ownSet.has(reference))
  const composition = proposal ? parseComposition(proposal.composition) : []
  const ownCompatible = composition.length > 0 && referenciasEmitidasComposicionCompatible(documentaryText, composition.map(item => item.reference), issuedReferences)
  // The existing collection proposal preserves the client evidence alongside
  // its FI composition. Treat a client locator/name beside a canonical own FI
  // reference as EXTERNAL_CUSTOMER, never as a decisive invoice reference.
  const bankText = normalizedText(`${bank.searchableText ?? ''} ${bank.counterpartyText ?? ''}`)
  const externalClientPresent = own.length > 0 && composition.some(item => {
    const client = normalizedText(item.client)
    return client.length >= 4 && bankText.includes(client)
  })
  const citations: Array<{ origin: 'OWN_CANONICAL' | 'SUPPLIER_EXACT' | 'EXTERNAL_CUSTOMER' | 'UNVERIFIED'; usedForDecision: boolean }> = [
    ...own.map(() => ({ origin: 'OWN_CANONICAL' as const, usedForDecision: ownCompatible })),
    ...external.map(() => ({ origin: 'EXTERNAL_CUSTOMER' as const, usedForDecision: false })),
  ]
  // A supplier citation is documentary only if the current source resolves to
  // that literal registered invoice number. Never invent an invoice identifier,
  // use the movement date as an invoice date, or infer its total from the bank.
  if (row.source.kind === 'PAGO_FACTURA_RECIBIDA' && row.documentReference && row.source.facturaRecibidaId) {
    const registered = receivedReferences.get(row.source.facturaRecibidaId)
    const normalized = registered ? normalizarReferenciaFactura(registered) : null
    if (normalized && normalizarReferenciaFactura(row.documentReference) === normalized && cited.includes(normalized)) {
      citations.push({ origin: 'SUPPLIER_EXACT', usedForDecision: row.color === 'VERDE' && row.seleccionable })
    }
  }
  if (!citations.length && row.source.kind !== 'COBRO_PROPUESTA' && row.source.kind !== 'PAGO_FACTURA_RECIBIDA') return null
  if (externalClientPresent) citations.push({ origin: 'EXTERNAL_CUSTOMER', usedForDecision: false })
  return { citations, externalReferencePresent: external.length > 0 || externalClientPresent, ownReferenceCompatible: ownCompatible, ownProposalBlockedByReference: false }
}

function toCandidateProjection(row: ProjectionSqlRow): CandidateProjection {
  const amount = integer(row.amountCents)
  const difference = integer(row.differenceCents)
  const date = day(row.fecha)
  if (!row.id || !hasTab(row.tab) || !hasColor(row.color) || amount === null || difference === null || !date || typeof row.reasonText !== 'string' || typeof row.seleccionable !== 'boolean') fail('REGRESSION_SCHEMA_INVALID')
  return {
    id: row.id, tab: row.tab, movementKey: row.movementId === null ? null : text(row.movementId), bankDate: date,
    amountCents: amount, differenceCents: difference, color: row.color, seleccionable: row.seleccionable, groupLabel: text(row.groupLabel), reasonText: row.reasonText,
    documentReference: documentReference(row.documentValue), proposalValue: text(row.proposalValue), source: source(row.source), rawDocument: object(row.documentValue),
  }
}
function totalsFromRows(rows: readonly CandidateProjection[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const row of rows) {
    const key = `${row.tab}:${row.color}`
    result.set(key, (result.get(key) ?? 0) + row.amountCents)
  }
  return result
}
function groupTotalsFromRows(rows: readonly CandidateProjection[]): Map<string, number> {
  const result = new Map<string, number>()
  for (const row of rows) {
    const canonical = canonicalPersistedGroup(row.groupLabel) ?? `INVALID:${row.groupLabel ?? ''}`
    const key = `${row.tab}:${row.color}:${canonical}`
    result.set(key, (result.get(key) ?? 0) + row.amountCents)
  }
  return result
}
function mapAggregate(rows: readonly TotalsSqlRow[], grouped: boolean): Map<string, number> {
  const result = new Map<string, number>()
  for (const row of rows) {
    const amount = integer(row.amountCents)
    if (!hasTab(row.tab) || !hasColor(row.color) || amount === null) continue
    const canonical = grouped ? canonicalPersistedGroup(row.groupLabel ?? null) ?? `INVALID:${row.groupLabel ?? ''}` : null
    const key = grouped ? `${row.tab}:${row.color}:${canonical}` : `${row.tab}:${row.color}`
    // SQL grouped by the exact persisted label. Different source spellings
    // can be one contract-defined canonical group, so combine those source
    // buckets before the independent G4 comparison.
    if (grouped) result.set(key, (result.get(key) ?? 0) + amount)
    else {
      if (result.has(key)) fail('REGRESSION_SCHEMA_INVALID')
      result.set(key, amount)
    }
  }
  return result
}
function equalMaps(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>): boolean {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value)
}
function missingConfirmingEvidence(bankDate: string): GlobalConfirmingEvidence {
  return {
    evidenceSchema: 'NONE', liquidationVersion: null, currentVersion: false, persisted: false, sourceCommitState: 'UNKNOWN',
    bankDate, liquidationDate: null, invoiceLineCents: [], interestCents: 0, commissionCents: 0, vatCommissionCents: 0, netCents: 0,
  }
}

export type ReleaseRegressionAdapterResult = Readonly<{
  cpDataset: ConciliarReleaseRegressionDataset
  /** Includes every persisted tab, needed only by ABSENT_CONFIRMED C/P cases. */
  cpAllTabProjectionRows: readonly RegressionProjectionRow[]
  globalDataset: GlobalRegressionDataset
}>

export async function readReleaseRegressionAdapter(client: ReadonlyPgClient): Promise<ReleaseRegressionAdapterResult> {
  // node-postgres permits only one in-flight query per client. Read every
  // bounded source serially inside the already-open read-only transaction.
  const projectionRaw = await paged<ProjectionSqlRow>(client, PROJECTION_COUNT_SQL, PROJECTION_PAGE_SQL)
  const movementRaw = await paged<MovementSqlRow>(client, MOVEMENT_COUNT_SQL, MOVEMENT_PAGE_SQL)
  const receivedReferenceRows = await paged<{ id: string; reference: string | null }>(client, RECEIVED_REFERENCE_COUNT_SQL, RECEIVED_REFERENCE_PAGE_SQL)
  const receivedReferences = new Map(receivedReferenceRows.filter(row => typeof row.id === 'string' && typeof row.reference === 'string').map(row => [row.id, row.reference as string]))
  const proposalRaw = await paged<ProposalSqlRow>(client, PROPOSAL_COUNT_SQL, PROPOSAL_PAGE_SQL)
  const collectionReservationRaw = await paged<CollectionReservationSqlRow>(client, COLLECTION_RESERVATION_COUNT_SQL, COLLECTION_RESERVATION_PAGE_SQL)
  const c11Raw = await paged<C11SqlRow>(client, C11_COUNT_SQL, C11_PAGE_SQL)
  const c11Lines = await paged<C11LineSqlRow>(client, C11_LINE_COUNT_SQL, C11_LINE_PAGE_SQL)
  const c11Documents = await paged<C11DocumentSqlRow>(client, C11_DOCUMENT_COUNT_SQL, C11_DOCUMENT_PAGE_SQL)
  const remittanceSelectorLinks = await paged<CanonicalRemittanceSelectorLink & { movementKey: string }>(client, REMITTANCE_SELECTOR_COUNT_SQL, REMITTANCE_SELECTOR_PAGE_SQL)
  const linkedByMovement = new Map<string, CanonicalRemittanceSelectorLink[]>()
  for (const link of remittanceSelectorLinks) linkedByMovement.set(link.movementKey, [...(linkedByMovement.get(link.movementKey) ?? []), link])
  // This is the existing canonical active-financial-settlement reader. It does
  // not inspect ISP paid flags and does not write; its sources are B4/B6/B7.
  const bankInvoicing = await readBankInvoicingPopulation({
    $queryRawUnsafe: async <T>(sql: string): Promise<T> => {
      safeSelect(sql)
      return (await client.query(sql)).rows as T
    },
  }, { enabled: true, assertIsolatedStaging: async () => undefined })
  const totalRows = await paged<TotalsSqlRow>(client, TOTALS_COUNT_SQL, TOTALS_PAGE_SQL)
  const groupRows = await paged<TotalsSqlRow>(client, GROUP_TOTALS_COUNT_SQL, GROUP_TOTALS_PAGE_SQL)

  const manualOwnAccountProof = await readManualOwnAccountProofTx({
    async $queryRaw<T>(statement: Prisma.Sql): Promise<T> {
      safeSelect(statement.text)
      return (await client.query(statement.text, statement.values)).rows as T
    },
  }, movementRaw.map(row => String(row.accountKey ?? '')))

  const projections = projectionRaw.map(toCandidateProjection)
  const bankRowsByKey = new Map<string, MovementSqlRow>()
  const cpBanks: RegressionBankRow[] = []
  for (const raw of movementRaw) {
    const row = { ...raw, searchableText: selectorSearchableText({ bankDescription: [raw.searchableText], linkedRemittances: linkedByMovement.get(raw.movementKey) ?? [] }) }
    const cents = integer(row.amountCents), date = day(row.bankDate)
    if (!row.movementKey || cents === null || !date) fail('REGRESSION_SCHEMA_INVALID')
    if (bankRowsByKey.has(row.movementKey)) fail('REGRESSION_SCHEMA_INVALID')
    bankRowsByKey.set(row.movementKey, row)
    cpBanks.push({
      movementKey: row.movementKey, bankName: text(row.bankName), accountKey: text(row.accountKey), bankDate: date, amountCents: cents,
      searchableText: row.searchableText ?? '', counterpartyText: text(row.counterpartyText),
      isCardPayment: /\b(?:TARJETA|CARD|VISA|MASTERCARD|AMEX|TPV|POS)\b/.test(normalizedText(row.documentaryText)),
      b4Confirmed: row.b4Status === 'JUSTIFICADO' || row.b4Status === 'NO_REQUIERE', oppositeOwnAccountPairs: [],
    })
  }
  const proposalByKey = new Map<string, ProposalSqlRow>()
  for (const proposal of proposalRaw) {
    if (!proposal.proposalKey || proposalByKey.has(proposal.proposalKey)) fail('REGRESSION_SCHEMA_INVALID')
    proposalByKey.set(proposal.proposalKey, proposal)
  }
  const collectionReservations = collectionReservationRaw.map(row => {
    const documentKey = text(row.documentKey), proposalKey = text(row.proposalKey), movementKey = text(row.movementKey)
    if (!documentKey || !proposalKey || !movementKey) fail('REGRESSION_SCHEMA_INVALID')
    return { documentKey, proposalKey, movementKey, status: 'CONFIRMED' as const }
  })
  const c11LineMap = new Map<string, number[]>()
  for (const line of c11Lines) {
    const cents = integer(line.nominalCents)
    if (!line.liquidationId || !line.invoiceId || cents === null) fail('REGRESSION_SCHEMA_INVALID')
    c11LineMap.set(line.liquidationId, [...(c11LineMap.get(line.liquidationId) ?? []), cents])
  }
  const c11FileMap = new Map<string, string[]>()
  for (const document of c11Documents) if (document.liquidationId) {
    const filename = text(document.filename)
    if (filename) c11FileMap.set(document.liquidationId, [...(c11FileMap.get(document.liquidationId) ?? []), filename])
  }
  const c11Prepared: C11Prepared[] = c11Raw.map(row => ({ row, lines: c11LineMap.get(row.liquidationId) ?? [], filenames: c11FileMap.get(row.liquidationId) ?? [] }))

  // Transfer pairing is supplied only by Conciliar's persisted transfer source;
  // it never guesses ownership from account names/CC-like bank text.
  const pairs = new Map<string, Array<{ daysApart: number; oppositeSign: boolean; distinctAccount: boolean }>>()
  for (const row of projections) {
    if (!['TRANSFERENCIA_PROPIA', 'TRANSFERENCIA_PROPIA_MANUAL'].includes(row.source.kind ?? '') || !row.movementKey || !row.source.movimientoParId) continue
    const left = bankRowsByKey.get(row.movementKey), right = bankRowsByKey.get(row.source.movimientoParId)
    if (row.source.kind === 'TRANSFERENCIA_PROPIA_MANUAL' && (
      row.source.proofSource !== manualOwnAccountProof.proof.source || !/^[a-f0-9]{64}$/.test(row.source.pairId ?? '')
      || !left?.accountKey || !right?.accountKey
      || !manualOwnAccountProof.proof.accountIds.has(left.accountKey) || !manualOwnAccountProof.proof.accountIds.has(right.accountKey)
    )) continue
    const leftCents = integer(left?.amountCents), rightCents = integer(right?.amountCents)
    const leftDay = day(left?.bankDate), rightDay = day(right?.bankDate)
    if (!left || !right || leftCents === null || rightCents === null || !leftDay || !rightDay) continue
    const daysApart = Math.abs((Date.parse(`${leftDay}T00:00:00Z`) - Date.parse(`${rightDay}T00:00:00Z`)) / 86_400_000)
    if (!Number.isSafeInteger(daysApart)) continue
    pairs.set(row.movementKey, [...(pairs.get(row.movementKey) ?? []), { daysApart, oppositeSign: leftCents === -rightCents, distinctAccount: left.accountKey !== right.accountKey }])
  }
  const cpBankRows = cpBanks.map(row => ({ ...row, oppositeOwnAccountPairs: pairs.get(row.movementKey) ?? [] }))

  const cpProjection = (row: CandidateProjection): RegressionProjectionRow => {
    const proposal = row.source.propuestaId ? proposalByKey.get(row.source.propuestaId) : undefined
    const composition = proposal ? parseComposition(proposal.composition) : []
    const documentReferences = composition.flatMap(item => item.reference ? [item.reference] : [])
    const partialReferences = composition.flatMap(item => {
      // A partial proposal is observable only from its persisted composition and
      // a corresponding FI amount. Lack of a source amount is not turned into a pass.
      const cents = item.amountCents
      return Number.isSafeInteger(cents) && row.color === 'AMBAR' && cents !== row.amountCents && item.reference ? [item.reference] : []
    })
    const c11 = confirmingEvidenceForSource(row.source, row.bankDate, c11Prepared)
    const matchedC11 = c11 && row.source.confirmingId && row.source.confirmingSourceHash
      ? c11Prepared.find(item => item.row.confirmingId === row.source.confirmingId && item.row.sourceHash === row.source.confirmingSourceHash) : undefined
    const sourceRow = projectionRaw.find(item => item.id === row.id)
    const isParaPedir = paraPedirFromKernel(row, bankRowsByKey, sourceRow?.requestState ?? null)
    return {
      movementKey: row.movementKey ?? `issued:${row.id}`, visible: true, tab: row.tab, color: row.color, groupLabel: row.groupLabel,
      documentReference: row.documentReference, suggestedDocumentReferences: documentReferences,
      partialDocumentReferences: partialReferences, documentFileNames: matchedC11?.filenames ?? [], reasonText: row.reasonText,
      differenceCents: row.differenceCents, isParaPedir,
      confirmingEvidence: c11 ? { persisted: c11.persisted, nominalCents: integer(matchedC11?.row.nominalCents), deductionsCents: [integer(matchedC11?.row.interestCents) ?? Number.NaN, integer(matchedC11?.row.commissionCents) ?? Number.NaN, integer(matchedC11?.row.vatCommissionCents) ?? Number.NaN], netCents: integer(matchedC11?.row.netCents) } : null,
      remittanceComposition: proposal ? { lineCount: composition.length, sumCents: composition.reduce((sum, item) => sum + (Number.isSafeInteger(item.amountCents) ? item.amountCents : 0), 0), exact: row.color === 'VERDE' && composition.every(item => Number.isSafeInteger(item.amountCents) && item.amountCents > 0) } : null,
    }
  }
  const cpAllTabProjectionRows = projections.filter(row => row.movementKey !== null).map(cpProjection)
  const cpDataset: ConciliarReleaseRegressionDataset = { bankRows: cpBankRows, projectionRows: cpAllTabProjectionRows }

  const issuedReferences = bankInvoicing.invoices.map(invoice => invoice.numFactura).filter((value): value is string => typeof value === 'string')
  const settledInvoiceIds = new Set(bankInvoicing.invoices.filter(invoice => invoice.paymentState === 'COBRADA_CALCULADA').map(invoice => invoice.invoiceId))
  /**
   * The whole persisted Conciliar projection was read above before this
   * classifier runs. A raw current proposal is only G1-OFFERED when its actual
   * source id is present on a current green selectable row for the same bank
   * movement. An unrepresented source is a proven absence, not a fabricated
   * amber review or a reservation.
   */
  const classifyCurrentCollectionSource = (proposal: ProposalSqlRow): 'OFFERED' | 'NOT_OFFERED' => projections.some(row => row.movementKey === proposal.movementKey
    && row.source.kind === 'COBRO_PROPUESTA'
    && row.source.propuestaId === proposal.proposalKey
    && row.color === 'VERDE'
    && row.seleccionable === true) ? 'OFFERED' : 'NOT_OFFERED'
  const collectionSourcePopulation = {
    allCurrentSourcesRead: true,
    allCurrentProjectionsRead: true,
    classifierExecuted: true,
    sources: proposalRaw.map(proposal => {
      const sourceId = text(proposal.proposalKey)
      const movementKey = text(proposal.movementKey)
      if (!sourceId || !movementKey) fail('REGRESSION_SCHEMA_INVALID')
      return { sourceId, movementKey, status: classifyCurrentCollectionSource(proposal) }
    }),
  } as const
  const globalRows: GlobalProjectionRow[] = projections.map((row) => {
    const bank = row.movementKey ? bankRowsByKey.get(row.movementKey) : undefined
    const entityKind = row.tab === 'EMITIDAS' ? 'ISSUED_INVOICE' as const : 'BANK_MOVEMENT' as const
    const issuedId = text(row.source.facturaEmitidaId)
    const activeCollectionSettlement = entityKind === 'ISSUED_INVOICE' ? (issuedId ? settledInvoiceIds.has(issuedId) : null) : null
    const reconciliationStatus = bank && (bank.b4Status === 'JUSTIFICADO' || bank.b4Status === 'NO_REQUIERE')
      ? 'B4_CONFIRMED' as const
      : entityKind === 'ISSUED_INVOICE' && activeCollectionSettlement === true ? 'COLLECTION_SETTLED' as const : 'PENDING' as const
    const requestState = projectionRaw.find(item => item.id === row.id)?.requestState ?? null
    const requests = requestSemantics(row, bankRowsByKey, requestState)
    const proposal = row.source.propuestaId ? proposalByKey.get(row.source.propuestaId) : undefined
    const composition = proposal ? parseComposition(proposal.composition) : []
    const proposals = row.source.kind === 'COBRO_PROPUESTA' && row.movementKey && row.source.propuestaId
      ? [{ proposalKey: row.source.propuestaId, source: 'BANK_MOVEMENT' as const,
          // The current persisted Conciliar row, not a historic source level,
          // defines whether this is an exact claim. A non-green source proposal
          // remains an amber review even if an older generator labelled it EXACTA.
          quote: row.color === 'VERDE' && row.seleccionable === true ? 'EXACT' as const : 'AMBER' as const,
          assignment: row.color === 'VERDE' && row.seleccionable === true ? 'RESERVED' as const : 'REVIEW' as const,
          sourceOnly: false,
          projectionProof: { proposalKey: row.source.propuestaId, movementKey: row.movementKey, color: row.color, seleccionable: row.seleccionable },
          // The stored proposal quote is distinct from the FI composition. G1
          // must observe a mismatch, never make one disappear by recomputing it.
          quotedAmountCents: proposal ? integer(proposal.amountCents) : null,
          composition: composition.map(item => ({ documentKey: item.documentKey, amountCents: item.amountCents })) }]
      : []
    return {
      movementKey: row.movementKey ?? `issued:${row.id}`, tab: row.tab, visible: true, entityKind, reconciliationStatus,
      activeCollectionSettlement, color: row.color, groupLabel: row.groupLabel, action: requests.action, requestReason: requests.reason,
      amountCents: row.amountCents, bankDate: row.movementKey ? row.bankDate : null, protectedKind: canonicalProtectedKind(row), seleccionable: row.seleccionable, proposals,
      referenceEvidence: referenceEvidenceForRow(row, bank, proposal, issuedReferences, receivedReferences),
      confirmingEvidence: row.source.kind === 'COBRO_CONFIRMING'
        ? confirmingEvidenceForSource(row.source, row.bankDate, c11Prepared) ?? missingConfirmingEvidence(row.bankDate)
        : null,
    }
  })
  const visibleMovementKeys = new Set(globalRows.filter(row => row.entityKind === 'BANK_MOVEMENT').map(row => row.movementKey))
  for (const bank of cpBankRows) {
    if ((bank.b4Confirmed !== true) || visibleMovementKeys.has(bank.movementKey)) continue
    globalRows.push({
      movementKey: bank.movementKey, tab: bank.amountCents >= 0 ? 'COBROS' : 'PAGOS', visible: false, entityKind: 'BANK_MOVEMENT', reconciliationStatus: 'B4_CONFIRMED',
      activeCollectionSettlement: null, color: 'AMBAR', groupLabel: null, action: 'NONE', requestReason: 'NONE', amountCents: bank.amountCents, bankDate: bank.bankDate,
      protectedKind: 'NONE', seleccionable: false, proposals: [], referenceEvidence: null, confirmingEvidence: null,
    })
  }
  const visibleIssuedIds = new Set(projections.filter(row => row.tab === 'EMITIDAS').map(row => text(row.source.facturaEmitidaId)).filter((value): value is string => value !== null))
  for (const invoice of bankInvoicing.invoices) {
    if (invoice.paymentState !== 'COBRADA_CALCULADA' || visibleIssuedIds.has(invoice.invoiceId)) continue
    globalRows.push({
      movementKey: `settled:${invoice.invoiceId}`, tab: 'EMITIDAS', visible: false, entityKind: 'ISSUED_INVOICE', reconciliationStatus: 'COLLECTION_SETTLED',
      activeCollectionSettlement: true, color: 'VERDE', groupLabel: 'FACTURAS_EMITIDAS', action: 'NONE', requestReason: 'NONE',
      amountCents: 0, bankDate: null, protectedKind: 'NONE', seleccionable: false, proposals: [], referenceEvidence: null, confirmingEvidence: null,
    })
  }

  const exactTotals = mapAggregate(totalRows, false), exactGroups = mapAggregate(groupRows, true)
  const projectionTotals = totalsFromRows(projections), projectionGroups = groupTotalsFromRows(projections)
  const totalsComplete = exactTotals.size <= 12 && equalMaps(exactTotals, projectionTotals) && equalMaps(exactGroups, projectionGroups)
  const tabColorTotals = TABS.flatMap(tab => COLORS.map(color => ({ tab, color, amountCents: exactTotals.get(`${tab}:${color}`) ?? 0 })))
  const groupTotals = [...exactGroups].map(([key, amountCents]) => {
    const [tab, color, canonicalGroup] = key.split(':')
    return { tab: tab as GlobalTab, color: color as 'VERDE' | 'AMBAR' | 'ROJO', canonicalGroup, amountCents }
  })
  const totalVisibleRows = projections.length
  const globalDataset: GlobalRegressionDataset = {
    rows: globalRows, collectionReservations, collectionSourcePopulation,
    totals: { allPagesRead: totalsComplete, totalVisibleRows, rowsRead: projectionRaw.length, pageSize: PAGE_SIZE, pagesRead: totalVisibleRows ? Math.ceil(totalVisibleRows / PAGE_SIZE) : 0, tabColorTotals, groupTotals },
  }
  return { cpDataset, cpAllTabProjectionRows, globalDataset }
}
