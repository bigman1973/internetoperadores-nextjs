/**
 * Bloque 3c/B5 — lector de rectificativas para facturas recibidas pendientes.
 *
 * Sólo proyecta campos aditivos: no modifica B4, saldos B5, enlaces de versión ni
 * confirmaciones humanas. Una relación sin la tupla documental completa queda en
 * revisión; en particular, una propuesta nunca reduce por sí misma el pendiente.
 */
import { createHash } from 'node:crypto'
import {
  calculateCreditNoteSettlements,
  type CanonicalCreditNoteDocument,
  type CreditNoteB4PaymentEvidence,
  type CreditNoteVersionLink,
} from './finance-credit-note-core'
import {
  applyCreditNotesToPendingInvoiceProjection,
  type CreditNotePendingInvoiceProjection,
  type PendingInvoiceProjection,
} from './finance-credit-note-pending'

const CREDIT_NOTE_PENDING_READ_MAX_ROWS = 25_000
const CREDIT_NOTE_PENDING_READ_LIMIT = CREDIT_NOTE_PENDING_READ_MAX_ROWS + 1
const ONEDRIVE_SOURCE_KEY_SQL = "^[A-Za-z0-9!_.~-]{4,220}:[A-Za-z0-9!_.~-]{4,220}$"

/** The B5 caller supplies its already-open REPEATABLE READ transaction/read client. */
export interface PendingCreditNoteReadDatabase {
  $queryRawUnsafe<T>(sql: string): Promise<T>
}

export type PendingReceivedInvoiceProjection = PendingInvoiceProjection & {
  tipo: 'FACTURA_RECIBIDA'
}

type ReceivedCreditDocumentRow = {
  documentId: unknown
  source: unknown
  sourceItemKey: unknown
  lifecycleState: unknown
  sourceMetadataExact: unknown
  currentVersionId: unknown
  documentReference: unknown
  referencedOriginalReference: unknown
  counterpartyFiscalIdentity: unknown
  counterpartyCanonicalIdentity: unknown
  signedTotalCents: unknown
  currencyCode: unknown
  partyRole: unknown
  documentClass: unknown
}

type ReceivedCreditLinkRow = {
  linkId: unknown
  originalDocumentId: unknown
  creditNoteDocumentId: unknown
  originalVersionId: unknown
  creditNoteVersionId: unknown
  originalCanonicalIdentity: unknown
  creditNoteCanonicalIdentity: unknown
  originalDocumentReference: unknown
  referencedOriginalReference: unknown
  exactReferenceHash: unknown
  counterpartyFiscalIdentity: unknown
  counterpartyCanonicalIdentity: unknown
  current: unknown
  deleted: unknown
}

type ReceivedB4PaymentRow = {
  evidenceId: unknown
  originalDocumentId: unknown
  signedCents: unknown
  active: unknown
  documentActive: unknown
  operationApplied: unknown
  operationReverted: unknown
  movementJustified: unknown
  wrapperTargetCents: unknown
  physicalBankCents: unknown
  sumAllActiveCents: unknown
  activeDocumentLineCount: unknown
  allActiveLinesApplied: unknown
}

/* Same persisted canonical identity as claveCanonicaFactura: only CIF separators and
 * invoice-number spaces are formatting. The join additionally requires the exact
 * persisted <driveId>:<itemId> lifecycle key; it is not guessed from a name/amount. */
const FACTURA_RECIBIDA_FISCAL_IDENTITY_SQL = `
  ('CIF:' || regexp_replace(upper(fr.cif), '[[:space:]._/\\-]+', '', 'g') ||
    '|NUM:' || regexp_replace(upper(fr.num_factura), '[[:space:]]+', '', 'g'))
`
// Counterparty identity deliberately excludes the document number. The full
// number-bearing fiscal identity remains part of sourceMetadataExact above;
// links need the shared fiscal party identity of original and rectificativa.
const FACTURA_RECIBIDA_COUNTERPARTY_FISCAL_SQL = `
  ('CIF:' || regexp_replace(upper(fr.cif), '[[:space:]._/\\-]+', '', 'g'))
`

/**
 * Current received-invoice snapshots only. `source_item_key` remains the raw
 * provider identity `<driveId>:<itemId>` (without a synthetic `onedrive:` prefix).
 * The source key plus literal reference/CIF/amount/role is the required complete
 * tuple; the adapter below turns the OCR document total into its expense-oriented
 * signed amount exactly once, while preserving exact cents.
 */
const RECEIVED_CREDIT_DOCUMENTS_SQL = `
  SELECT
    fr.id::text AS "documentId",
    l.source AS source,
    l.source_item_key AS "sourceItemKey",
    l.state::text AS "lifecycleState",
    (
      s.document_number = fr.num_factura
      AND s.total_cents = b4_importe_bancario_centimos(fr.total)
      AND s.invoice_fiscal_identity = ${FACTURA_RECIBIDA_FISCAL_IDENTITY_SQL}
      AND s.party_role = 'PROVEEDOR'
      AND NULLIF(btrim(s.document_class), '') IS NOT NULL
      AND NULLIF(btrim(s.currency_code), '') IS NOT NULL
    ) AS "sourceMetadataExact",
    s.id::text AS "currentVersionId",
    s.document_number AS "documentReference",
    s.referenced_original_reference AS "referencedOriginalReference",
    ${FACTURA_RECIBIDA_COUNTERPARTY_FISCAL_SQL} AS "counterpartyFiscalIdentity",
    fr.proveedor AS "counterpartyCanonicalIdentity",
    s.total_cents::bigint AS "signedTotalCents",
    s.currency_code AS "currencyCode",
    s.party_role AS "partyRole",
    s.document_class AS "documentClass"
  FROM facturas_recibidas fr
  JOIN document_version_lifecycle l
    ON l.source = 'ONEDRIVE'
   AND l.source_item_key = (fr.onedrive_drive_id || ':' || fr.onedrive_item_id)
  JOIN document_version_snapshots s
    ON s.lifecycle_id = l.id
   AND s.version_number = l.current_version
  WHERE l.source_item_key ~ '${ONEDRIVE_SOURCE_KEY_SQL}'
    AND l.state = 'ACTIVE'::"DocumentVersionLifecycleState"
    AND l.current_version >= 1
    AND NOT EXISTS (
      SELECT 1 FROM document_version_tombstones t
      WHERE t.lifecycle_id = l.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM document_version_incidents i
      WHERE i.lifecycle_id = l.id
        AND i.state = 'OPEN'::"DocumentVersionIncidentState"
    )
  ORDER BY fr.id ASC, l.id ASC
  LIMIT ${CREDIT_NOTE_PENDING_READ_LIMIT} OFFSET 0
`

/**
 * Retains every stored relationship rooted in an eligible original. `current` is
 * true only for a pre-existing human CONFIRMED action and two complete eligible
 * tuples. PROPOSED and invalidated sources stay visible to the pure core as review
 * conditions and never become a confirmation here.
 */
const RECEIVED_CREDIT_LINKS_SQL = `
  SELECT
    cl.id::text AS "linkId",
    original_fr.id::text AS "originalDocumentId",
    credit_fr.id::text AS "creditNoteDocumentId",
    original_s.id::text AS "originalVersionId",
    credit_s.id::text AS "creditNoteVersionId",
    (original_l.source || ':' || original_l.source_item_key) AS "originalCanonicalIdentity",
    (credit_l.source || ':' || credit_l.source_item_key) AS "creditNoteCanonicalIdentity",
    original_s.document_number AS "originalDocumentReference",
    cl.exact_reference AS "referencedOriginalReference",
    cl.exact_reference_hash AS "exactReferenceHash",
    ${FACTURA_RECIBIDA_COUNTERPARTY_FISCAL_SQL.replaceAll('fr.', 'original_fr.')} AS "counterpartyFiscalIdentity",
    original_fr.proveedor AS "counterpartyCanonicalIdentity",
    (
      cl.state = 'CONFIRMED'::"DocumentVersionCreditLinkState"
      AND cl.confirmed_by_id IS NOT NULL
      AND cl.confirmed_at IS NOT NULL
      AND original_l.source = 'ONEDRIVE'
      AND original_l.source_item_key ~ '${ONEDRIVE_SOURCE_KEY_SQL}'
      AND credit_l.source = 'ONEDRIVE'
      AND credit_l.source_item_key ~ '${ONEDRIVE_SOURCE_KEY_SQL}'
      AND original_l.state = 'ACTIVE'::"DocumentVersionLifecycleState"
      AND credit_l.state = 'ACTIVE'::"DocumentVersionLifecycleState"
      AND original_l.current_version >= 1
      AND credit_l.current_version >= 1
      AND NOT EXISTS (SELECT 1 FROM document_version_tombstones t WHERE t.lifecycle_id = original_l.id)
      AND NOT EXISTS (SELECT 1 FROM document_version_tombstones t WHERE t.lifecycle_id = credit_l.id)
      AND NOT EXISTS (
        SELECT 1 FROM document_version_incidents i
        WHERE i.lifecycle_id = original_l.id
          AND i.state = 'OPEN'::"DocumentVersionIncidentState"
      )
      AND NOT EXISTS (
        SELECT 1 FROM document_version_incidents i
        WHERE i.lifecycle_id = credit_l.id
          AND i.state = 'OPEN'::"DocumentVersionIncidentState"
      )
      AND original_s.document_number = original_fr.num_factura
      AND original_s.total_cents = b4_importe_bancario_centimos(original_fr.total)
      AND original_s.invoice_fiscal_identity = ${FACTURA_RECIBIDA_FISCAL_IDENTITY_SQL.replaceAll('fr.', 'original_fr.')}
      AND original_s.party_role = 'PROVEEDOR'
      AND NULLIF(btrim(original_s.document_class), '') IS NOT NULL
      AND NULLIF(btrim(original_s.currency_code), '') IS NOT NULL
      AND credit_s.document_number = credit_fr.num_factura
      AND credit_s.total_cents = b4_importe_bancario_centimos(credit_fr.total)
      AND credit_s.invoice_fiscal_identity = ${FACTURA_RECIBIDA_FISCAL_IDENTITY_SQL.replaceAll('fr.', 'credit_fr.')}
      AND credit_s.party_role = 'PROVEEDOR'
      AND NULLIF(btrim(credit_s.document_class), '') IS NOT NULL
      AND NULLIF(btrim(credit_s.currency_code), '') IS NOT NULL
    ) AS current,
    (cl.state = 'REJECTED'::"DocumentVersionCreditLinkState") AS deleted
  FROM document_version_credit_links cl
  JOIN document_version_lifecycle original_l ON original_l.id = cl.original_lifecycle_id
  JOIN document_version_snapshots original_s
    ON original_s.lifecycle_id = original_l.id
   AND original_s.version_number = original_l.current_version
  JOIN facturas_recibidas original_fr
    ON original_l.source = 'ONEDRIVE'
   AND original_l.source_item_key = (original_fr.onedrive_drive_id || ':' || original_fr.onedrive_item_id)
  JOIN document_version_lifecycle credit_l ON credit_l.id = cl.credit_lifecycle_id
  LEFT JOIN document_version_snapshots credit_s
    ON credit_s.lifecycle_id = credit_l.id
   AND credit_s.version_number = credit_l.current_version
  LEFT JOIN facturas_recibidas credit_fr
    ON credit_l.source = 'ONEDRIVE'
   AND credit_l.source_item_key = (credit_fr.onedrive_drive_id || ':' || credit_fr.onedrive_item_id)
  WHERE original_l.source = 'ONEDRIVE'
    AND original_l.source_item_key ~ '${ONEDRIVE_SOURCE_KEY_SQL}'
    AND original_l.state = 'ACTIVE'::"DocumentVersionLifecycleState"
    AND original_l.current_version >= 1
    AND NOT EXISTS (
      SELECT 1 FROM document_version_tombstones t
      WHERE t.lifecycle_id = original_l.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM document_version_incidents i
      WHERE i.lifecycle_id = original_l.id
        AND i.state = 'OPEN'::"DocumentVersionIncidentState"
    )
  ORDER BY cl.id ASC
  LIMIT ${CREDIT_NOTE_PENDING_READ_LIMIT} OFFSET 0
`

/**
 * Actual B4 DOCUMENTO rows, including the current physical closure proof. This is
 * evidence only; it does not use factura states or legacy payment fields and does
 * not synthesize a payment where no active line exists.
 */
const RECEIVED_B4_PAYMENT_LINES_SQL = `
  SELECT
    v.id::text AS "evidenceId",
    d.factura_recibida_id AS "originalDocumentId",
    v.importe_centimos AS "signedCents",
    v.activo AS active,
    d.activo AS "documentActive",
    (o.estado = 'APLICADA'::"EstadoOperacionB4") AS "operationApplied",
    (o.revertida_at IS NOT NULL) AS "operationReverted",
    (e.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento") AS "movementJustified",
    d.importe_objetivo_centimos AS "wrapperTargetCents",
    b4_importe_bancario_centimos(m.importe) AS "physicalBankCents",
    closure.sum_active AS "sumAllActiveCents",
    closure.document_count AS "activeDocumentLineCount",
    closure.all_active_lines_applied AS "allActiveLinesApplied"
  FROM vinculos_movimiento_documento v
  JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
  JOIN movimientos_bancarios m ON m.id = v.movimiento_id
  LEFT JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
  JOIN LATERAL (
    SELECT
      COALESCE(SUM(x.importe_centimos), 0)::bigint AS sum_active,
      COUNT(*) FILTER (WHERE x.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::integer AS document_count,
      BOOL_AND(COALESCE(ox.estado = 'APLICADA'::"EstadoOperacionB4" AND ox.revertida_at IS NULL, FALSE)) AS all_active_lines_applied
    FROM vinculos_movimiento_documento x
    LEFT JOIN operaciones_justificacion_b4 ox ON ox.id = x.operacion_creacion_id
    WHERE x.movimiento_id = v.movimiento_id AND x.activo
  ) closure ON TRUE
  WHERE v.activo
    AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
    AND d.tipo = 'FACTURA_RECIBIDA'::"TipoDocumentoConciliable"
  ORDER BY v.id ASC
  LIMIT ${CREDIT_NOTE_PENDING_READ_LIMIT} OFFSET 0
`

const CREDIT_LINK_DECISIONS_READY_SQL = `SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema='public' AND table_name='document_version_credit_link_decisions' LIMIT 1 OFFSET 0`
const LEGACY_HUMAN_CONFIRMED_SQL = `cl.state = 'CONFIRMED'::"DocumentVersionCreditLinkState"
      AND cl.confirmed_by_id IS NOT NULL
      AND cl.confirmed_at IS NOT NULL`
const LEGACY_HUMAN_REJECTED_SQL = `cl.state = 'REJECTED'::"DocumentVersionCreditLinkState"`

/** Before the additive migration exists, the legacy immutable link remains authority. */
function effectiveCreditLinksSql(decisionsReady: boolean): string {
  if (!decisionsReady) return RECEIVED_CREDIT_LINKS_SQL
  const lastState = `(SELECT d.effective_state::text FROM document_version_credit_link_decisions d WHERE d.credit_link_id=cl.id ORDER BY d.decision_sequence DESC LIMIT 1)`
  const hasDecision = `EXISTS (SELECT 1 FROM document_version_credit_link_decisions d WHERE d.credit_link_id=cl.id)`
  const confirmed = `(${lastState} = 'CONFIRMED' OR (NOT ${hasDecision} AND ${LEGACY_HUMAN_CONFIRMED_SQL}))`
  const rejected = `COALESCE(${lastState},cl.state::text) = 'REJECTED'`
  return RECEIVED_CREDIT_LINKS_SQL.replace(LEGACY_HUMAN_CONFIRMED_SQL, confirmed).replace(LEGACY_HUMAN_REJECTED_SQL, rejected)
}
async function creditLinkDecisionsReady(db: { $queryRawUnsafe<T>(sql: string): Promise<T> }): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ tableName: string | null }>>(CREDIT_LINK_DECISIONS_READY_SQL)
  return rows.length === 1 && rows[0]?.tableName === 'document_version_credit_link_decisions'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
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

function negateSafe(value: unknown): number | null {
  const cents = asSafeInteger(value)
  return cents === null ? null : -cents
}

function assertBounded(label: string, rows: readonly unknown[]): void {
  if (rows.length >= CREDIT_NOTE_PENDING_READ_LIMIT) throw new Error(`CREDIT_NOTE_PENDING_READ_${label}_DEMASIADO_GRANDE`)
}

function receivedDocument(row: ReceivedCreditDocumentRow): CanonicalCreditNoteDocument {
  return {
    documentId: asString(row.documentId),
    canonicalIdentity: `${asString(row.source)}:${asString(row.sourceItemKey)}`,
    currentVersionId: asString(row.currentVersionId),
    kind: 'RECIBIDA',
    partyRole: row.partyRole as CanonicalCreditNoteDocument['partyRole'],
    documentReference: asString(row.documentReference),
    referencedOriginalReference: asNullableString(row.referencedOriginalReference),
    counterpartyFiscalIdentity: asString(row.counterpartyFiscalIdentity),
    counterpartyCanonicalIdentity: asString(row.counterpartyCanonicalIdentity),
    signedTotalCents: negateSafe(row.signedTotalCents),
    currencyCode: asNullableString(row.currencyCode),
    canonicalCurrent: row.lifecycleState === 'ACTIVE'
      && row.sourceMetadataExact === true
      && asString(row.documentClass) !== '',
  }
}

function referenceHashMatches(reference: unknown, hash: unknown): boolean {
  return typeof reference === 'string'
    && typeof hash === 'string'
    && /^[a-f0-9]{64}$/i.test(hash)
    && createHash('sha256').update(reference, 'utf8').digest('hex') === hash.toLowerCase()
}

function versionLink(row: ReceivedCreditLinkRow): CreditNoteVersionLink {
  const reference = referenceHashMatches(row.referencedOriginalReference, row.exactReferenceHash)
    ? asString(row.referencedOriginalReference)
    : ''
  return {
    linkId: asString(row.linkId),
    originalDocumentId: asString(row.originalDocumentId),
    creditNoteDocumentId: asString(row.creditNoteDocumentId),
    originalVersionId: asString(row.originalVersionId),
    creditNoteVersionId: asString(row.creditNoteVersionId),
    originalCanonicalIdentity: asString(row.originalCanonicalIdentity),
    creditNoteCanonicalIdentity: asString(row.creditNoteCanonicalIdentity),
    originalDocumentReference: asString(row.originalDocumentReference),
    referencedOriginalReference: reference,
    counterpartyFiscalIdentity: asString(row.counterpartyFiscalIdentity),
    counterpartyCanonicalIdentity: asString(row.counterpartyCanonicalIdentity),
    current: row.current === true && reference !== '',
    deleted: row.deleted === true,
  }
}

function b4Payments(
  rows: readonly ReceivedB4PaymentRow[],
  originalsById: ReadonlyMap<string, CanonicalCreditNoteDocument>,
): CreditNoteB4PaymentEvidence[] {
  return rows.flatMap((row) => {
    const original = originalsById.get(asString(row.originalDocumentId))
    if (!original) return []
    const signedCents = asSafeInteger(row.signedCents)
    const wrapperTargetCents = asSafeInteger(row.wrapperTargetCents)
    const physicalBankCents = asSafeInteger(row.physicalBankCents)
    const sumAllActiveCents = asSafeInteger(row.sumAllActiveCents)
    const activeDocumentLineCount = asSafeInteger(row.activeDocumentLineCount)
    const exact = row.active === true
      && row.documentActive === true
      && row.operationApplied === true
      && row.operationReverted !== true
      && row.movementJustified === true
      && wrapperTargetCents === original.signedTotalCents
      && physicalBankCents !== null
      && sumAllActiveCents === physicalBankCents
      && activeDocumentLineCount !== null
      && activeDocumentLineCount >= 1
      && row.allActiveLinesApplied === true
    return [{
      evidenceId: asString(row.evidenceId),
      originalDocumentId: original.documentId,
      signedCents,
      currencyCode: original.currencyCode,
      active: row.active === true,
      documentActive: row.documentActive === true,
      operationApplied: row.operationApplied === true,
      operationReverted: row.operationReverted === true,
      movementJustified: row.movementJustified === true,
      physicalClosureExact: exact,
    }]
  })
}

function blockedProjection(
  invoice: PendingReceivedInvoiceProjection,
  reason: string,
): CreditNotePendingInvoiceProjection {
  return {
    ...invoice,
    creditNoteState: 'REVISION',
    rectificationCents: null,
    importePendienteTrasRectificativasCentimos: null,
    creditNoteReviewReasons: [reason],
  }
}

/**
 * Projects 3c only over the B5 page passed by the caller. The three bounded SELECTs
 * inspect source snapshots, append-only links and actual B4 lines in the same DB
 * snapshot; no FI/drive bridge is invented when an eligible canonical original is
 * missing. B5's original amount/assignment/pending fields are spread unchanged.
 */
export async function readReceivedCreditNotesForPendingInvoices(
  db: PendingCreditNoteReadDatabase,
  invoices: readonly PendingReceivedInvoiceProjection[],
): Promise<CreditNotePendingInvoiceProjection[]> {
  if (invoices.length === 0) return []
  const decisionsReady = await creditLinkDecisionsReady(db)
  const [documentRows, linkRows, b4Rows] = await Promise.all([
    db.$queryRawUnsafe<ReceivedCreditDocumentRow[]>(RECEIVED_CREDIT_DOCUMENTS_SQL),
    db.$queryRawUnsafe<ReceivedCreditLinkRow[]>(effectiveCreditLinksSql(decisionsReady)),
    db.$queryRawUnsafe<ReceivedB4PaymentRow[]>(RECEIVED_B4_PAYMENT_LINES_SQL),
  ])
  assertBounded('DOCUMENTOS_RECIBIDOS', documentRows)
  assertBounded('ENLACES_RECIBIDOS', linkRows)
  assertBounded('PAGOS_B4_RECIBIDOS', b4Rows)

  const documents = documentRows.map(receivedDocument)
  const originals = documents.filter((document) => document.referencedOriginalReference === null)
  const creditNotes = documents.filter((document) => document.referencedOriginalReference !== null)
  const originalsById = new Map(originals.map((document) => [document.documentId, document]))
  const settlements = calculateCreditNoteSettlements({
    originals,
    creditNotes,
    versionLinks: linkRows.map(versionLink),
    b4Payments: b4Payments(b4Rows, originalsById),
  }).settlements
  const projected = applyCreditNotesToPendingInvoiceProjection(invoices, settlements)

  return projected.map((invoice) => {
    // Without the source key and all exact tuple fields, B5 cannot assert absence
    // of a credit note. Keep original B5 cents and make the additive result review.
    if (!originalsById.has(invoice.id)) {
      return blockedProjection(invoice as PendingReceivedInvoiceProjection, 'ORIGINAL_RECTIFICATIVA_SIN_VERSION_CANONICA_ELEGIBLE')
    }
    return invoice
  })
}

/** Exported only for synthetic SQL-shape tests; this is not a mutable DB API. */
export const pendingCreditNoteReadSql = {
  receivedDocuments: RECEIVED_CREDIT_DOCUMENTS_SQL,
  receivedLinks: RECEIVED_CREDIT_LINKS_SQL,
  creditLinkDecisionsReady: CREDIT_LINK_DECISIONS_READY_SQL,
  receivedB4Payments: RECEIVED_B4_PAYMENT_LINES_SQL,
} as const
