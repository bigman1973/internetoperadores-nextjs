import {
  calculateBankInvoicing,
  exactSourceCents,
  summarizeBankInvoicing,
  type B4DifferenceLineInput,
  type B4DocumentLineInput,
  type BankCoverage,
  type BankInvoicingResult,
  type CanonicalInvoiceInput,
  type ExplicitRemittanceInput,
  type RemittancePaymentReceiptInput,
  type RemittanceMemberInput,
  type RemittanceRefundInput,
} from './bank-invoicing-core'
import {
  invoiceMatchesB7Query,
  parseB7GetQuery,
  sortInvoicesB7,
  type B7GetQuery,
  type B7ReadDto,
} from './bank-invoicing-contract'
import {
  associationSourceHash,
  facturaSourceFingerprint,
  facturasSourceHash,
  remesaSourceFingerprint,
  type B6FacturaFuente,
  type B6RemesaFuente,
} from './b6-source-fingerprint'

const B7_READ_MAX_ROWS = 25_000
const B7_READ_LIMIT = B7_READ_MAX_ROWS + 1

/**
 * Deliberately small read-only surface. The host supplies its existing Prisma
 * client; this module creates no client and has no environment dependency.
 */
export interface B7ReadDatabase {
  $queryRawUnsafe<T>(sql: string): Promise<T>
}

export interface B7ReaderOptions {
  enabled: boolean
  /** Existing staging guard; it must reject before even a SELECT is sent. */
  assertIsolatedStaging(): Promise<void>
}

export interface B7ReadDiagnostics {
  canonicalPopulation: 'FACTURAS_EMITIDAS_TODAS'
  ispIdentity: 'FACTURA_EMITIDA_FACTURA_ISP_ID_EXPLICITA_SOLO_METADATA'
  b4Proof: 'ACTIVO__OPERACION_APLICADA_NO_REVERTIDA__JUSTIFICADO__CIERRE_FISICO_EXACTO'
  b6Proof: 'FACTURA_REMESA_ID__AUDITORIA_HUMANA__FI_MAPA_COMPLETO__FUENTE_EXACTA'
  ispPaymentFieldsRead: false
  mutations: false
}

export interface B7ReadResponse extends B7ReadDto {
  diagnostics: B7ReadDiagnostics
}

type InvoiceRow = {
  id: string
  sourceTotalText: string | null
  b2Economic: boolean
  numFactura: string | null
  cliente: string | null
  fechaISO: string | null
  fechaVencimientoISO: string | null
  facturaISPId: number | null
}
type DirectRow = {
  lineId: string
  movementId: string
  invoiceId: string
  signedCents: number | bigint | string | null
  active: boolean | null
  documentActive: boolean | null
  documentKind: string
  wrapperTargetCents: number | bigint | string | null
  operationApplied: boolean | null
  operationReverted: boolean | null
  movementJustified: boolean | null
  physicalBankCents: number | bigint | string | null
  sumAllActiveCents: number | bigint | string | null
  activeDocumentLineCount: number | bigint | string | null
  allActiveLinesApplied: boolean | null
}
type DifferenceRow = {
  movementId: string
  signedCents: number | bigint | string | null
  active: boolean | null
  operationApplied: boolean | null
  operationReverted: boolean | null
  movementJustified: boolean | null
  physicalBankCents: number | bigint | string | null
  sumAllActiveCents: number | bigint | string | null
  allActiveLinesApplied: boolean | null
}
type RemittanceMemberRow = {
  remittanceId: number
  remittanceIspGestionId: number | null
  remittanceFechaISO: string | null
  sourceTotalText: string | null
  wrapperTargetCents: number | bigint | string | null
  wrapperActive: boolean | null
  wrapperCount: number | bigint | string
  facturaISPId: number | null
  facturaISPGestionId: number | null
  facturaISPFechaISO: string | null
  invoiceId: string | null
  facturaISPSourceTotalText: string | null
  facturaEmitidaSourceTotalText: string | null
}
type RemittanceLineRow = Omit<DirectRow, 'invoiceId'> & { remittanceId: number }
type RefundRow = {
  remittanceId: number
  linkId: string | null
  facturaISPId: number | null
  signedCents: number | bigint | string | null
  confirmed: boolean | null
  confirmedByHuman: boolean | null
  active: boolean | null
  documentActive: boolean | null
  documentKind: string | null
  operationApplied: boolean | null
  operationReverted: boolean | null
  movementJustified: boolean | null
  physicalBankCents: number | bigint | string | null
  sumAllActiveCents: number | bigint | string | null
  activeDocumentLineCount: number | bigint | string | null
  allActiveLinesApplied: boolean | null
}
type RemittanceAuditRow = {
  remittanceId: number
  sourceHash: string | null
  snapshotSolicitud: unknown
  snapshotResultado: unknown
}
type ReceiptRow = {
  remittanceId: number
  receiptId: string
  sourceHash: string | null
  proposalFingerprint: string | null
  compositionHash: string | null
  snapshotSchemaValid: boolean | null
  bankDateISO: string | null
  lineId: string | null
  movementId: string | null
  signedCents: number | bigint | string | null
  active: boolean | null
  documentActive: boolean | null
  documentKind: string | null
  wrapperTargetCents: number | bigint | string | null
  operationApplied: boolean | null
  operationReverted: boolean | null
  movementJustified: boolean | null
  physicalBankCents: number | bigint | string | null
  sumAllActiveCents: number | bigint | string | null
  activeDocumentLineCount: number | bigint | string | null
  allActiveLinesApplied: boolean | null
}
type ReceiptLineRow = {
  receiptId: string
  invoiceId: string | null
  facturaISPId: number | null
  cents: number | bigint | string | null
  sourceHash: string | null
  snapshotSchemaValid: boolean | null
}
type CoverageRow = {
  activeAccountCount: number | bigint | string
  accountsWithKnownCutoff: number | bigint | string
  minimumCutoff: string | Date | null
}

function asSafeInteger(value: unknown): number | null {
  try {
    const parsed = typeof value === 'bigint' ? value
      : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value)
        : typeof value === 'string' && /^-?\d+$/.test(value) ? BigInt(value)
          : null
    if (parsed === null || parsed > BigInt(Number.MAX_SAFE_INTEGER) || parsed < -BigInt(Number.MAX_SAFE_INTEGER)) return null
    return Number(parsed)
  } catch {
    return null
  }
}

function asCount(value: unknown): number {
  const result = asSafeInteger(value)
  if (result === null || result < 0) throw new Error('B7_READ_COUNT_INVALIDO')
  return result
}
function assertCompleteBoundedPopulation(label: string, rows: readonly unknown[]): void {
  if (rows.length >= B7_READ_LIMIT) throw new Error(`B7_READ_${label}_DEMASIADO_GRANDE`)
}

function dateISO(value: string | Date | null): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return null
}

/**
 * Canonical population: *all* FacturaEmitida. `total::text` preserves the current
 * Float representation and is revalidated by the core; no payment/status column
 * is selected. B2 economic eligibility for emitted FI is its canonical source row
 * itself — B2's received-invoice quality predicates are intentionally not applied.
 */
const INVOICES_SQL = `
  SELECT
    fe.id,
    fe.total::text AS "sourceTotalText",
    TRUE AS "b2Economic",
    fe.num_factura AS "numFactura",
    fe.cliente,
    fe.fecha::date::text AS "fechaISO",
    fe.fecha_vencimiento::date::text AS "fechaVencimientoISO",
    fe.factura_isp_id AS "facturaISPId"
  FROM facturas_emitidas fe
  ORDER BY fe.fecha DESC, fe.id ASC
  LIMIT ${B7_READ_LIMIT}
`

/**
 * Each FI B4 wrapper is read by actual FK only. The live B4 proof includes the
 * creating operation, movement state, exact physical amount, and all-active close.
 */
const DIRECT_DOCUMENT_LINES_SQL = `
  SELECT
    v.id::text AS "lineId", v.movimiento_id AS "movementId", d.factura_emitida_id AS "invoiceId",
    v.importe_centimos AS "signedCents", v.activo AS "active", d.activo AS "documentActive", d.tipo::text AS "documentKind",
    d.importe_objetivo_centimos AS "wrapperTargetCents",
    (o.estado = 'APLICADA'::"EstadoOperacionB4") AS "operationApplied",
    (o.revertida_at IS NOT NULL) AS "operationReverted",
    (e.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento") AS "movementJustified",
    b4_importe_bancario_centimos(m.importe) AS "physicalBankCents",
    closure.sum_active AS "sumAllActiveCents", closure.document_count AS "activeDocumentLineCount",
    closure.all_active_lines_applied AS "allActiveLinesApplied"
  FROM vinculos_movimiento_documento v
  JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
  JOIN movimientos_bancarios m ON m.id = v.movimiento_id
  LEFT JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
  JOIN LATERAL (
    SELECT COALESCE(SUM(x.importe_centimos), 0)::bigint AS sum_active,
      COUNT(*) FILTER (WHERE x.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::integer AS document_count,
      BOOL_AND(COALESCE(ox.estado = 'APLICADA'::"EstadoOperacionB4" AND ox.revertida_at IS NULL, FALSE)) AS all_active_lines_applied
    FROM vinculos_movimiento_documento x
    LEFT JOIN operaciones_justificacion_b4 ox ON ox.id = x.operacion_creacion_id
    WHERE x.movimiento_id = v.movimiento_id AND x.activo
  ) closure ON TRUE
  WHERE v.activo AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
    AND d.tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable"
  ORDER BY v.id ASC
  LIMIT ${B7_READ_LIMIT}
`

/** Differences are read separately and only affect cash, never documentary debt. */
const DIFFERENCES_SQL = `
  SELECT
    v.movimiento_id AS "movementId", v.importe_centimos AS "signedCents", v.activo AS "active",
    (o.estado = 'APLICADA'::"EstadoOperacionB4") AS "operationApplied",
    (o.revertida_at IS NOT NULL) AS "operationReverted",
    (e.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento") AS "movementJustified",
    b4_importe_bancario_centimos(m.importe) AS "physicalBankCents",
    closure.sum_active AS "sumAllActiveCents", closure.all_active_lines_applied AS "allActiveLinesApplied"
  FROM vinculos_movimiento_documento v
  JOIN movimientos_bancarios m ON m.id = v.movimiento_id
  LEFT JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
  JOIN LATERAL (
    SELECT COALESCE(SUM(x.importe_centimos), 0)::bigint AS sum_active,
      BOOL_AND(COALESCE(ox.estado = 'APLICADA'::"EstadoOperacionB4" AND ox.revertida_at IS NULL, FALSE)) AS all_active_lines_applied
    FROM vinculos_movimiento_documento x
    LEFT JOIN operaciones_justificacion_b4 ox ON ox.id = x.operacion_creacion_id
    WHERE x.movimiento_id = v.movimiento_id AND x.activo
  ) closure ON TRUE
  WHERE v.tipo_linea = 'DIFERENCIA'::"TipoLineaVinculo"
  ORDER BY v.id ASC
  LIMIT ${B7_READ_LIMIT}
`

/**
 * Current B6 source rows, not ISP payment/status fields. The reader recomputes the
 * B6 fingerprints and compares them with immutable human-audit snapshots in memory.
 * Missing FI mirrors remain explicit rows and block allocation in the core.
 */
const REMITTANCE_MEMBERS_SQL = `
  SELECT
    r.id AS "remittanceId", r.isp_gestion_id AS "remittanceIspGestionId",
    r.fecha::date::text AS "remittanceFechaISO", r.total_importe::text AS "sourceTotalText",
    wrapper.target_centimos AS "wrapperTargetCents", wrapper.activo AS "wrapperActive", wrapper.wrapper_count AS "wrapperCount",
    f.id AS "facturaISPId", f.isp_gestion_id AS "facturaISPGestionId",
    f.fecha::date::text AS "facturaISPFechaISO", fi.id AS "invoiceId",
    f.total::text AS "facturaISPSourceTotalText", fi.total::text AS "facturaEmitidaSourceTotalText"
  FROM remesas r
  JOIN facturas f ON f.remesa_id = r.id
  LEFT JOIN facturas_emitidas fi ON fi.factura_isp_id = f.id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::integer AS wrapper_count,
      MAX(d.importe_objetivo_centimos) AS target_centimos, BOOL_AND(d.activo) AS activo
    FROM documentos_conciliables d
    WHERE d.tipo = 'REMESA'::"TipoDocumentoConciliable" AND d.remesa_id = r.id
  ) wrapper ON TRUE
  ORDER BY r.id ASC, f.id ASC
  LIMIT ${B7_READ_LIMIT}
`

/** Immutable B6 association facts. No dynamic/user SQL enters this constant SELECT. */
const REMITTANCE_AUDITS_SQL = `
  SELECT
    a.remesa_id AS "remittanceId", a.source_hash AS "sourceHash",
    a.snapshot_solicitud AS "snapshotSolicitud", a.snapshot_resultado AS "snapshotResultado"
  FROM auditoria_remesa_b6 a
  WHERE a.accion = 'ASOCIACION_FACTURAS_CONFIRMADA'::"AccionAuditoriaRemesaB6"
    AND a.actor_id IS NOT NULL
  ORDER BY a.remesa_id ASC, a.id ASC
  LIMIT ${B7_READ_LIMIT}
`

/** Sólo vínculos REMESA activos; la historia anulada se conserva, pero no acredita ni invalida cobros vigentes. */
const REMITTANCE_LINES_SQL = `
  SELECT
    d.remesa_id AS "remittanceId", v.id::text AS "lineId", v.movimiento_id AS "movementId",
    v.importe_centimos AS "signedCents", v.activo AS "active", d.activo AS "documentActive", d.tipo::text AS "documentKind",
    d.importe_objetivo_centimos AS "wrapperTargetCents",
    (o.estado = 'APLICADA'::"EstadoOperacionB4") AS "operationApplied",
    (o.revertida_at IS NOT NULL) AS "operationReverted",
    (e.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento") AS "movementJustified",
    b4_importe_bancario_centimos(m.importe) AS "physicalBankCents",
    closure.sum_active AS "sumAllActiveCents", closure.document_count AS "activeDocumentLineCount",
    closure.all_active_lines_applied AS "allActiveLinesApplied"
  FROM vinculos_movimiento_documento v
  JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
  JOIN movimientos_bancarios m ON m.id = v.movimiento_id
  LEFT JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
  JOIN LATERAL (
    SELECT COALESCE(SUM(x.importe_centimos), 0)::bigint AS sum_active,
      COUNT(*) FILTER (WHERE x.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::integer AS document_count,
      BOOL_AND(COALESCE(ox.estado = 'APLICADA'::"EstadoOperacionB4" AND ox.revertida_at IS NULL, FALSE)) AS all_active_lines_applied
    FROM vinculos_movimiento_documento x
    LEFT JOIN operaciones_justificacion_b4 ox ON ox.id = x.operacion_creacion_id
    WHERE x.movimiento_id = v.movimiento_id AND x.activo
  ) closure ON TRUE
  WHERE v.activo AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
    AND d.tipo = 'REMESA'::"TipoDocumentoConciliable"
  ORDER BY v.id ASC
  LIMIT ${B7_READ_LIMIT}
`

/**
 * Confirmed B6 facts are never enough by themselves. This query returns their
 * current B4 provenance so core repeats active/APLICADA/unreverted/JUSTIFICADO,
 * physical closure, and single-document requirements after any later deshacer.
 */
const REMITTANCE_REFUNDS_SQL = `
  SELECT
    a.remesa_id AS "remittanceId", a.vinculo_id::text AS "linkId", a.factura_isp_id AS "facturaISPId",
    a.importe_centimos AS "signedCents",
    (a.estado = 'CONFIRMADA'::"EstadoAsignacionDevolucionRemesaB6") AS confirmed,
    (a.confirmada_por_id IS NOT NULL AND a.confirmada_at IS NOT NULL) AS "confirmedByHuman",
    v.activo AS "active", d.activo AS "documentActive", d.tipo::text AS "documentKind",
    (o.estado = 'APLICADA'::"EstadoOperacionB4") AS "operationApplied",
    (o.revertida_at IS NOT NULL) AS "operationReverted",
    (e.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento") AS "movementJustified",
    b4_importe_bancario_centimos(m.importe) AS "physicalBankCents",
    closure.sum_active AS "sumAllActiveCents", closure.document_count AS "activeDocumentLineCount",
    closure.all_active_lines_applied AS "allActiveLinesApplied"
  FROM asignaciones_devolucion_remesa_b6 a
  LEFT JOIN vinculos_movimiento_documento v ON v.id = a.vinculo_id
  LEFT JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
  LEFT JOIN movimientos_bancarios m ON m.id = v.movimiento_id
  LEFT JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(x.importe_centimos), 0)::bigint AS sum_active,
      COUNT(*) FILTER (WHERE x.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::integer AS document_count,
      BOOL_AND(COALESCE(ox.estado = 'APLICADA'::"EstadoOperacionB4" AND ox.revertida_at IS NULL, FALSE)) AS all_active_lines_applied
    FROM vinculos_movimiento_documento x
    LEFT JOIN operaciones_justificacion_b4 ox ON ox.id = x.operacion_creacion_id
    WHERE x.movimiento_id = v.movimiento_id AND x.activo
  ) closure ON TRUE
  ORDER BY a.id ASC
  LIMIT ${B7_READ_LIMIT}
`

/** B7 V1 receipt headers are immutable; B4 state is deliberately read live. */
const REMITTANCE_RECEIPTS_SQL = `
  SELECT
    r.remesa_id AS "remittanceId", r.id::text AS "receiptId", r.source_hash AS "sourceHash",
    r.proposal_fingerprint AS "proposalFingerprint", r.composition_hash AS "compositionHash",
    (r.schema_version='B7_REMESA_RECIBO_V1' AND r.estado='CONFIRMADO'::"EstadoReciboCobroRemesaB7"
      AND r.snapshot_solicitud->>'schemaVersion'='B7_REMESA_RECIBO_V1'
      AND r.snapshot_resultado->>'schemaVersion'='B7_REMESA_RECIBO_V1') AS "snapshotSchemaValid",
    m.fecha_operacion::date::text AS "bankDateISO",
    v.id::text AS "lineId", v.movimiento_id AS "movementId", v.importe_centimos AS "signedCents",
    v.activo AS "active", d.activo AS "documentActive", d.tipo::text AS "documentKind", d.importe_objetivo_centimos AS "wrapperTargetCents",
    (o.estado='APLICADA'::"EstadoOperacionB4") AS "operationApplied", (o.revertida_at IS NOT NULL) AS "operationReverted",
    (e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento") AS "movementJustified", b4_importe_bancario_centimos(m.importe) AS "physicalBankCents",
    closure.sum_active AS "sumAllActiveCents", closure.document_count AS "activeDocumentLineCount", closure.all_active_lines_applied AS "allActiveLinesApplied"
  FROM recibos_cobro_remesa_b7 r
  LEFT JOIN vinculos_movimiento_documento v ON v.id=r.vinculo_b4_id
  LEFT JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
  LEFT JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
  LEFT JOIN movimientos_bancarios m ON m.id=v.movimiento_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(x.importe_centimos),0)::bigint AS sum_active,
      COUNT(*) FILTER (WHERE x.tipo_linea='DOCUMENTO'::"TipoLineaVinculo")::integer AS document_count,
      BOOL_AND(COALESCE(ox.estado = 'APLICADA'::"EstadoOperacionB4" AND ox.revertida_at IS NULL, FALSE)) AS all_active_lines_applied
    FROM vinculos_movimiento_documento x
    LEFT JOIN operaciones_justificacion_b4 ox ON ox.id = x.operacion_creacion_id
    WHERE x.movimiento_id=v.movimiento_id AND x.activo
  ) closure ON TRUE
  ORDER BY r.remesa_id,r.id
  LIMIT ${B7_READ_LIMIT}
`

const REMITTANCE_RECEIPT_LINES_SQL = `
  SELECT l.recibo_id::text AS "receiptId",l.factura_emitida_id AS "invoiceId",l.factura_isp_id AS "facturaISPId",
    l.importe_centimos AS cents,l.source_hash AS "sourceHash",
    (l.snapshot->>'schemaVersion'='B7_REMESA_RECIBO_V1'
      AND l.snapshot->'facturaEmitida'->>'id'=l.factura_emitida_id
      AND (l.snapshot->'facturaISP'->>'id')::integer=l.factura_isp_id
      AND (l.snapshot->>'importeCentimos')::integer=l.importe_centimos) AS "snapshotSchemaValid"
  FROM lineas_recibo_cobro_remesa_b7 l
  ORDER BY l.recibo_id,l.ordinal
  LIMIT ${B7_READ_LIMIT}
`

// La cobertura usa el corte manual más reciente o el corte explícito importado. No se
// actualiza cuentas_bancarias ni se infiere un corte desde saldo/movimientos.
const COVERAGE_SQL = `
  WITH cuentas_activas AS (
    SELECT id, fecha_corte_extracto FROM cuentas_bancarias WHERE activa = true
  ), ultimo_corte_manual AS (
    SELECT DISTINCT ON (cuenta_id) cuenta_id, fecha_corte
    FROM cortes_cobertura_manual_b3
    ORDER BY cuenta_id, version DESC
  )
  SELECT COUNT(c.id)::integer AS "activeAccountCount",
    COUNT(COALESCE(m.fecha_corte,c.fecha_corte_extracto))::integer AS "accountsWithKnownCutoff",
    MIN(COALESCE(m.fecha_corte,c.fecha_corte_extracto)) AS "minimumCutoff"
  FROM cuentas_activas c
  LEFT JOIN ultimo_corte_manual m ON m.cuenta_id = c.id
`

function coverage(row: CoverageRow | undefined): BankCoverage {
  const activeAccountCount = row ? asCount(row.activeAccountCount) : 0
  const accountsWithKnownCutoff = row ? asCount(row.accountsWithKnownCutoff) : 0
  const asOf = dateISO(row?.minimumCutoff ?? null)
  if (activeAccountCount > 0 && activeAccountCount === accountsWithKnownCutoff && asOf) {
    return { status: 'KNOWN', asOf, activeAccountCount, accountsWithKnownCutoff }
  }
  if (accountsWithKnownCutoff > 0 && accountsWithKnownCutoff < activeAccountCount) {
    return { status: 'PARTIAL', asOf: null, activeAccountCount, accountsWithKnownCutoff }
  }
  return { status: 'UNKNOWN', asOf: null, activeAccountCount, accountsWithKnownCutoff }
}

function docLine(row: DirectRow | RemittanceLineRow): B4DocumentLineInput {
  return {
    lineId: row.lineId,
    movementId: row.movementId,
    ...('invoiceId' in row && row.invoiceId ? { invoiceId: row.invoiceId } : {}),
    ...('remittanceId' in row ? { remittanceId: String(row.remittanceId) } : {}),
    signedCents: asSafeInteger(row.signedCents), active: row.active === true,
    documentActive: row.documentActive === true,
    documentKind: row.documentKind === 'REMESA' ? 'REMESA' : 'FACTURA_EMITIDA',
    wrapperTargetCents: asSafeInteger(row.wrapperTargetCents),
    operationApplied: row.operationApplied === true, operationReverted: row.operationReverted === true,
    movementJustified: row.movementJustified === true,
    physicalBankCents: asSafeInteger(row.physicalBankCents), sumAllActiveCents: asSafeInteger(row.sumAllActiveCents),
    activeDocumentLineCount: asSafeInteger(row.activeDocumentLineCount),
    allActiveLinesApplied: row.allActiveLinesApplied === true,
  }
}

/** Receipt headers retain a live B4 proof but may be inactive after deshacer. */
function receiptDocumentLine(row: ReceiptRow): B4DocumentLineInput {
  return {
    lineId: row.lineId ?? '', movementId: row.movementId ?? '', remittanceId: String(row.remittanceId),
    signedCents: asSafeInteger(row.signedCents), active: row.active === true,
    documentActive: row.documentActive === true,
    documentKind: row.documentKind === 'REMESA' ? 'REMESA' : 'FACTURA_EMITIDA',
    wrapperTargetCents: asSafeInteger(row.wrapperTargetCents),
    operationApplied: row.operationApplied === true, operationReverted: row.operationReverted === true,
    movementJustified: row.movementJustified === true,
    physicalBankCents: asSafeInteger(row.physicalBankCents), sumAllActiveCents: asSafeInteger(row.sumAllActiveCents),
    activeDocumentLineCount: asSafeInteger(row.activeDocumentLineCount), allActiveLinesApplied: row.allActiveLinesApplied === true,
  }
}

function differenceLine(row: DifferenceRow): B4DifferenceLineInput {
  return {
    movementId: row.movementId, signedCents: asSafeInteger(row.signedCents), active: row.active === true,
    operationApplied: row.operationApplied === true, operationReverted: row.operationReverted === true,
    movementJustified: row.movementJustified === true,
    physicalBankCents: asSafeInteger(row.physicalBankCents), sumAllActiveCents: asSafeInteger(row.sumAllActiveCents),
    allActiveLinesApplied: row.allActiveLinesApplied === true,
  }
}

type CurrentRemittanceSource = Readonly<{
  remesa: B6RemesaFuente
  facturas: readonly B6FacturaFuente[]
  facturaFingerprints: readonly string[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function auditString(value: unknown): string | null {
  return typeof value === 'string' ? value.toLowerCase() : null
}

function auditIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id))) return null
  const ids = [...value] as number[]
  if (new Set(ids).size !== ids.length) return null
  return ids.sort((left, right) => left - right)
}

function sameIds(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function exactAuditRemesa(value: unknown, current: B6RemesaFuente): boolean {
  if (!isRecord(value)) return false
  return value.id === current.id
    && value.ispGestionId === current.ispGestionId
    && value.fecha === current.fecha
    && value.totalCentimos === current.totalCentimos
}

function exactAuditFacturas(value: unknown, current: CurrentRemittanceSource): boolean {
  if (!Array.isArray(value) || value.length !== current.facturas.length) return false
  const auditFacturas: B6FacturaFuente[] = []
  for (const raw of value) {
    if (!isRecord(raw) || !Number.isSafeInteger(raw.id) || !Number.isSafeInteger(raw.ispGestionId)
      || typeof raw.fecha !== 'string' || !Number.isSafeInteger(raw.totalCentimos)) return false
    auditFacturas.push({
      id: raw.id as number,
      ispGestionId: raw.ispGestionId as number,
      fecha: raw.fecha,
      totalCentimos: raw.totalCentimos as number,
    })
  }
  const currentSorted = [...current.facturas].sort((left, right) => left.id - right.id)
  const auditSorted = [...auditFacturas].sort((left, right) => left.id - right.id)
  return auditSorted.every((factura, index) => factura.id === currentSorted[index].id
    && factura.ispGestionId === currentSorted[index].ispGestionId
    && factura.fecha === currentSorted[index].fecha
    && factura.totalCentimos === currentSorted[index].totalCentimos
    && facturaSourceFingerprint(factura) === current.facturaFingerprints[index])
}

/**
 * A human action stays usable only while its exact B6 source snapshot still equals
 * the current remesa and all of its current member sources. IDs alone never prove
 * a date/management-id/amount-preserving association.
 */
function hasCurrentHumanAssociation(current: CurrentRemittanceSource | null, audits: readonly RemittanceAuditRow[]): boolean {
  if (!current) return false
  const ids = current.facturas.map((factura) => factura.id).sort((left, right) => left - right)
  const currentRemesaHash = remesaSourceFingerprint(current.remesa)
  const currentFacturasHash = facturasSourceHash(current.facturas)
  const currentAssociationHash = associationSourceHash(current.remesa, current.facturas)
  return audits.some((audit) => {
    const request = isRecord(audit.snapshotSolicitud) ? audit.snapshotSolicitud : null
    const result = isRecord(audit.snapshotResultado) ? audit.snapshotResultado : null
    const sourceSnapshot = result && isRecord(result.sourceSnapshot) ? result.sourceSnapshot : null
    return request !== null && result !== null && sourceSnapshot !== null
      && sameIds(auditIds(result.facturaIdsISP) ?? [], ids)
      && auditString(request.expectedRemesaHashSHA256) === currentRemesaHash
      && auditString(request.expectedFacturasHashSHA256) === currentFacturasHash
      && auditString(result.facturasSourceHashSHA256) === currentFacturasHash
      && auditString(audit.sourceHash) === currentAssociationHash
      && auditString(sourceSnapshot.sourceHash) === currentAssociationHash
      && exactAuditRemesa(sourceSnapshot.remesaBefore, current.remesa)
      && exactAuditFacturas(sourceSnapshot.facturas, current)
  })
}

function remittancesFromRows(
  members: RemittanceMemberRow[],
  lines: RemittanceLineRow[],
  refunds: RefundRow[],
  audits: RemittanceAuditRow[],
  receiptRows: ReceiptRow[],
  receiptLineRows: ReceiptLineRow[],
): ExplicitRemittanceInput[] {
  const memberRowsByRemittance = new Map<number, RemittanceMemberRow[]>()
  for (const row of members) {
    const group = memberRowsByRemittance.get(row.remittanceId) ?? []
    group.push(row)
    memberRowsByRemittance.set(row.remittanceId, group)
  }
  const sourceByRemittance = new Map<number, CurrentRemittanceSource | null>()
  for (const [remittanceId, rows] of memberRowsByRemittance) {
    const first = rows[0]
    const remesaCents = exactSourceCents(first.sourceTotalText)
    const remesaFecha = dateISO(first.remittanceFechaISO)
    const facturas: B6FacturaFuente[] = []
    let invalid = !Number.isSafeInteger(first.remittanceIspGestionId) || remesaFecha === null || remesaCents === null || remesaCents === 0
    for (const row of rows) {
      const cents = exactSourceCents(row.facturaISPSourceTotalText)
      const fecha = dateISO(row.facturaISPFechaISO)
      if (!Number.isSafeInteger(row.facturaISPId) || !Number.isSafeInteger(row.facturaISPGestionId) || fecha === null || cents === null || cents === 0) {
        invalid = true
        continue
      }
      if (row.remittanceIspGestionId !== first.remittanceIspGestionId || row.remittanceFechaISO !== first.remittanceFechaISO || row.sourceTotalText !== first.sourceTotalText) invalid = true
      facturas.push({ id: row.facturaISPId, ispGestionId: row.facturaISPGestionId, fecha, totalCentimos: cents })
    }
    if (new Set(facturas.map((factura) => factura.id)).size !== facturas.length) invalid = true
    sourceByRemittance.set(remittanceId, invalid ? null : {
      remesa: { id: remittanceId, ispGestionId: first.remittanceIspGestionId!, fecha: remesaFecha!, totalCentimos: remesaCents! },
      facturas,
      facturaFingerprints: [...facturas].sort((left, right) => left.id - right.id).map(facturaSourceFingerprint),
    })
  }
  const auditsByRemittance = new Map<number, RemittanceAuditRow[]>()
  for (const audit of audits) {
    const group = auditsByRemittance.get(audit.remittanceId) ?? []
    group.push(audit)
    auditsByRemittance.set(audit.remittanceId, group)
  }
  const result = new Map<number, ExplicitRemittanceInput>()
  for (const row of members) {
    let item = result.get(row.remittanceId)
    if (!item) {
      const humanConfirmedAssociation = hasCurrentHumanAssociation(
        sourceByRemittance.get(row.remittanceId) ?? null,
        auditsByRemittance.get(row.remittanceId) ?? [],
      )
      item = {
        remittanceId: String(row.remittanceId), sourceTotalText: row.sourceTotalText,
        wrapperTargetCents: asSafeInteger(row.wrapperTargetCents), wrapperActive: row.wrapperActive === true,
        wrapperCount: asSafeInteger(row.wrapperCount),
        humanConfirmedAssociation,
        humanAssociationStale: !humanConfirmedAssociation,
        members: [], bankDocumentLines: [], refunds: [], paymentReceipts: [],
      }
      result.set(row.remittanceId, item)
    }
    // A null/invalid ISP membership is retained to force review, never discarded.
    item.members.push({
      facturaISPId: Number.isSafeInteger(row.facturaISPId) ? row.facturaISPId! : -1,
      invoiceId: row.invoiceId ?? null,
      facturaISPSourceTotalText: row.facturaISPSourceTotalText,
      facturaEmitidaSourceTotalText: row.facturaEmitidaSourceTotalText,
      facturaISPFechaISO: dateISO(row.facturaISPFechaISO),
    })
  }
  // A wrapper line with no source-membership cannot allocate FI and is deliberately
  // not made a synthetic candidate; no invoice identity can be inferred from it.
  for (const row of lines) result.get(row.remittanceId)?.bankDocumentLines.push(docLine(row))
  for (const row of refunds) {
    result.get(row.remittanceId)?.refunds.push({
      linkId: row.linkId, facturaISPId: row.facturaISPId, signedCents: asSafeInteger(row.signedCents),
      confirmed: row.confirmed === true, confirmedByHuman: row.confirmedByHuman === true,
      active: row.active === true, documentActive: row.documentActive === true,
      documentKind: row.documentKind === 'REMESA' ? 'REMESA' : row.documentKind === 'FACTURA_EMITIDA' ? 'FACTURA_EMITIDA' : null,
      operationApplied: row.operationApplied === true, operationReverted: row.operationReverted === true,
      movementJustified: row.movementJustified === true,
      physicalBankCents: asSafeInteger(row.physicalBankCents), sumAllActiveCents: asSafeInteger(row.sumAllActiveCents),
      activeDocumentLineCount: asSafeInteger(row.activeDocumentLineCount),
      allActiveLinesApplied: row.allActiveLinesApplied === true,
    })
  }
  const receiptLinesByReceipt = new Map<string, ReceiptLineRow[]>()
  for (const line of receiptLineRows) {
    const group = receiptLinesByReceipt.get(line.receiptId) ?? []
    group.push(line)
    receiptLinesByReceipt.set(line.receiptId, group)
  }
  for (const row of receiptRows) {
    const remittance = result.get(row.remittanceId)
    // Never synthesise a remittance/FI relation from a receipt. If its current
    // source remittance is not readable, it is not payment evidence.
    if (!remittance) continue
    const receipt: RemittancePaymentReceiptInput = {
      receiptId: row.receiptId,
      sourceHash: row.sourceHash,
      proposalFingerprint: row.proposalFingerprint,
      compositionHash: row.compositionHash,
      snapshotSchemaValid: row.snapshotSchemaValid === true,
      bankDateISO: dateISO(row.bankDateISO),
      b4Line: receiptDocumentLine(row),
      lines: (receiptLinesByReceipt.get(row.receiptId) ?? []).map(line => ({
        invoiceId: line.invoiceId,
        facturaISPId: line.facturaISPId,
        cents: asSafeInteger(line.cents),
        sourceHash: line.sourceHash,
        snapshotSchemaValid: line.snapshotSchemaValid === true,
      })),
    }
    remittance.paymentReceipts!.push(receipt)
  }
  return [...result.values()]
}

/**
 * Loads the complete canonical FI population and calculates it once.  The caller
 * supplies the DB/transaction, so this function never starts a transaction or
 * mutates state.  `assertIsolatedStaging` runs before the first SELECT.
 */
export async function readBankInvoicingPopulation(
  db: B7ReadDatabase,
  options: B7ReaderOptions,
): Promise<BankInvoicingResult> {
  if (!options.enabled) throw new Error('B7_READ_DISABLED')
  await options.assertIsolatedStaging()

  const [invoiceRows, directRows, differenceRows, memberRows, remittanceLines, refundRows, coverageRows, remittanceAudits, receiptRows, receiptLineRows] = await Promise.all([
    db.$queryRawUnsafe<InvoiceRow[]>(INVOICES_SQL),
    db.$queryRawUnsafe<DirectRow[]>(DIRECT_DOCUMENT_LINES_SQL),
    db.$queryRawUnsafe<DifferenceRow[]>(DIFFERENCES_SQL),
    db.$queryRawUnsafe<RemittanceMemberRow[]>(REMITTANCE_MEMBERS_SQL),
    db.$queryRawUnsafe<RemittanceLineRow[]>(REMITTANCE_LINES_SQL),
    db.$queryRawUnsafe<RefundRow[]>(REMITTANCE_REFUNDS_SQL),
    db.$queryRawUnsafe<CoverageRow[]>(COVERAGE_SQL),
    db.$queryRawUnsafe<RemittanceAuditRow[]>(REMITTANCE_AUDITS_SQL),
    db.$queryRawUnsafe<ReceiptRow[]>(REMITTANCE_RECEIPTS_SQL),
    db.$queryRawUnsafe<ReceiptLineRow[]>(REMITTANCE_RECEIPT_LINES_SQL),
  ])
  assertCompleteBoundedPopulation('FACTURAS_EMITIDAS', invoiceRows)
  assertCompleteBoundedPopulation('B4_DIRECTO', directRows)
  assertCompleteBoundedPopulation('B4_DIFERENCIAS', differenceRows)
  assertCompleteBoundedPopulation('MIEMBROS_REMESA', memberRows)
  assertCompleteBoundedPopulation('B4_REMESA', remittanceLines)
  assertCompleteBoundedPopulation('DEVOLUCIONES_REMESA', refundRows)
  assertCompleteBoundedPopulation('AUDITORIAS_REMESA', remittanceAudits)
  assertCompleteBoundedPopulation('RECIBOS_REMESA', receiptRows)
  assertCompleteBoundedPopulation('LINEAS_RECIBO_REMESA', receiptLineRows)
  if (coverageRows.length > 1) throw new Error('B7_READ_COBERTURA_INEXACTA')
  const invoices: CanonicalInvoiceInput[] = invoiceRows.map((row) => ({
    id: row.id, sourceTotalText: row.sourceTotalText, b2Economic: row.b2Economic === true,
    numFactura: row.numFactura, cliente: row.cliente, fechaISO: dateISO(row.fechaISO),
    fechaVencimientoISO: dateISO(row.fechaVencimientoISO), facturaISPId: row.facturaISPId,
  }))
  return calculateBankInvoicing({
    invoices,
    directDocumentLines: directRows.map(docLine),
    differenceLines: differenceRows.map(differenceLine),
    explicitRemittances: remittancesFromRows(memberRows, remittanceLines, refundRows, remittanceAudits, receiptRows, receiptLineRows),
    bankCoverage: coverage(coverageRows[0]),
  })
}

/**
 * Original paged B7 contract.  It deliberately derives filters, page and summary
 * from one immutable calculated population; no query-dependent financial SELECT
 * and no page aggregate are introduced by the extraction above.
 */
export async function readBankInvoicing(
  db: B7ReadDatabase,
  options: B7ReaderOptions,
  rawQuery: URLSearchParams | B7GetQuery = new URLSearchParams(),
): Promise<B7ReadResponse> {
  const calculated = await readBankInvoicingPopulation(db, options)
  const query = rawQuery instanceof URLSearchParams ? parseB7GetQuery(rawQuery) : rawQuery
  const matching = sortInvoicesB7(calculated.invoices.filter((invoice) => invoiceMatchesB7Query(invoice, query)))
  const items = matching.slice(query.offset, query.offset + query.limit)
  // Bank-only differences have no FI filter key. A month/q/state subset cannot
  // claim their total belongs to that subset; publish unknown rather than 0 or a
  // page-derived allocation. The unfiltered whole population keeps its exact value.
  const isWholePopulation = query.q === null && query.mes === null && query.estado === null
  const summary = summarizeBankInvoicing(
    matching,
    isWholePopulation ? calculated.summary.diferenciasCaja.sinAtribuir.cents : null,
  )

  return {
    recurso: 'facturacionBancoB7', query, pagination: { limit: query.limit, offset: query.offset, total: matching.length },
    summary, bankCoverage: calculated.bankCoverage, items, calculationBasis: calculated.calculationBasis,
    diagnostics: {
      canonicalPopulation: 'FACTURAS_EMITIDAS_TODAS',
      ispIdentity: 'FACTURA_EMITIDA_FACTURA_ISP_ID_EXPLICITA_SOLO_METADATA',
      b4Proof: 'ACTIVO__OPERACION_APLICADA_NO_REVERTIDA__JUSTIFICADO__CIERRE_FISICO_EXACTO',
      b6Proof: 'FACTURA_REMESA_ID__AUDITORIA_HUMANA__FI_MAPA_COMPLETO__FUENTE_EXACTA',
      ispPaymentFieldsRead: false, mutations: false,
    },
  }
}

/** B5 FACTURAS_EMITIDAS_SIN_COBRO reuses this result; null remains null, never 0. */
export function pendingEmittedInvoicesForB5(dto: B7ReadDto) {
  return dto.items.filter((invoice) => invoice.paymentState !== 'COBRADA_CALCULADA').map((invoice) => ({
    ...invoice,
    importePendienteCentimos: invoice.remainingCents,
  }))
}
