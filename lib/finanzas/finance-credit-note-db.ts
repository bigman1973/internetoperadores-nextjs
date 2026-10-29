/*
 * Bloque 3c — lector SQL de rectificativas para la proyección B7.
 *
 * Sólo lectura. No abre transacciones, no crea/edita B4, no toca FacturaEmitida,
 * versiones ni enlaces. `source_item_key` se conserva como la identidad estable
 * del proveedor (`<driveId>:<itemId>`), nunca se deriva de una FI.
 *
 * FacturaEmitida no tiene un FK hacia el ciclo documental. Por ello el único
 * puente admitido aquí es la identidad documental completa ya persistida:
 * número literal + identidad fiscal canónica + total en céntimos + rol CLIENTE.
 * Nunca se busca por importe, diferencia, nombre de cliente o texto aproximado.
 */
import { createHash } from 'node:crypto'
import type { B4DocumentLineInput, InvoiceSettlement } from './bank-invoicing-core'
import { applyCreditNotesToIssuedBankProjection, type CreditNoteIssuedBankProjection } from './finance-credit-note-bank-invoicing'
import {
  calculateCreditNoteSettlements,
  type CanonicalCreditNoteDocument,
  type CreditNoteB4PaymentEvidence,
  type CreditNoteVersionLink,
} from './finance-credit-note-core'

const CREDIT_NOTE_READ_MAX_ROWS = 25_000
const CREDIT_NOTE_READ_LIMIT = CREDIT_NOTE_READ_MAX_ROWS + 1
const ONEDRIVE_SOURCE_KEY_SQL = "^[A-Za-z0-9!_.~-]{4,220}:[A-Za-z0-9!_.~-]{4,220}$"

/** The caller supplies its existing Prisma transaction/read client. */
export interface CreditNoteReadDatabase {
  $queryRawUnsafe<T>(sql: string): Promise<T>
}

type IssuedCreditDocumentRow = {
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

type CreditLinkRow = {
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

export interface IssuedCreditNoteBankPopulation {
  invoices: readonly InvoiceSettlement[]
  /** Existing B7 direct FI B4 lines, read once from their canonical source. */
  directB4Lines: readonly B4DocumentLineInput[]
}

/*
 * The snapshot fiscal identity is the canonical form produced by
 * `claveCanonicaFactura`: CIF removes formatting separators and the literal FI
 * number removes spaces only. This is canonical identity equality, not a fuzzy
 * text match. `document_number = num_factura` remains literal as required.
 */
const FACTURA_EMITIDA_FISCAL_IDENTITY_SQL = `
  ('CIF:' || regexp_replace(upper(fe.cif), '[[:space:]._/\\-]+', '', 'g') ||
    '|NUM:' || regexp_replace(upper(fe.num_factura), '[[:space:]]+', '', 'g'))
`
// Document number stays in the exact source tuple. A rectificativa necessarily
// has another document number, so the counterpart comparison uses only the
// shared canonical CIF identity.
const FACTURA_EMITIDA_COUNTERPARTY_FISCAL_SQL = `
  ('CIF:' || regexp_replace(upper(fe.cif), '[[:space:]._/\\-]+', '', 'g'))
`

/**
 * Eligible current document snapshots only. Tombstones and open amber incidents
 * are excluded at this source; a missing eligible original becomes a visible
 * REVISION at the B7 adapter, never a zero credit. The select deliberately has
 * no data from ISP payment/status fields.
 */
const ISSUED_CREDIT_DOCUMENTS_SQL = `
  SELECT
    fe.id::text AS "documentId",
    l.source AS source,
    l.source_item_key AS "sourceItemKey",
    l.state::text AS "lifecycleState",
    (
      s.document_number = fe.num_factura
      AND s.total_cents = b4_importe_bancario_centimos(fe.total)
      AND s.invoice_fiscal_identity = ${FACTURA_EMITIDA_FISCAL_IDENTITY_SQL}
      AND s.party_role = 'CLIENTE'
      AND NULLIF(btrim(s.document_class), '') IS NOT NULL
      AND NULLIF(btrim(s.currency_code), '') IS NOT NULL
    ) AS "sourceMetadataExact",
    s.id::text AS "currentVersionId",
    s.document_number AS "documentReference",
    s.referenced_original_reference AS "referencedOriginalReference",
    ${FACTURA_EMITIDA_COUNTERPARTY_FISCAL_SQL} AS "counterpartyFiscalIdentity",
    fe.cliente AS "counterpartyCanonicalIdentity",
    s.total_cents AS "signedTotalCents",
    s.currency_code AS "currencyCode",
    s.party_role AS "partyRole",
    s.document_class AS "documentClass"
  FROM document_version_lifecycle l
  JOIN document_version_snapshots s
    ON s.lifecycle_id = l.id
   AND s.version_number = l.current_version
  JOIN facturas_emitidas fe
    ON s.document_number = fe.num_factura
  WHERE l.source = 'ONEDRIVE'
    AND l.source_item_key ~ '${ONEDRIVE_SOURCE_KEY_SQL}'
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
  ORDER BY fe.id ASC, l.id ASC
  LIMIT ${CREDIT_NOTE_READ_LIMIT} OFFSET 0
`

/**
 * All link rows rooted in an eligible original are retained for audit/review.
 * `current` is true only for an already stored CONFIRMED human action and two
 * eligible current snapshots. In particular this query never turns PROPOSED
 * into CONFIRMED. A blocked credit lifecycle is represented as `current=false`,
 * allowing the pure core to surface REVIEW rather than silently forgetting it.
 */
const ISSUED_CREDIT_LINKS_SQL = `
  SELECT
    cl.id::text AS "linkId",
    original_fe.id::text AS "originalDocumentId",
    credit_fe.id::text AS "creditNoteDocumentId",
    original_s.id::text AS "originalVersionId",
    credit_s.id::text AS "creditNoteVersionId",
    (original_l.source || ':' || original_l.source_item_key) AS "originalCanonicalIdentity",
    (credit_l.source || ':' || credit_l.source_item_key) AS "creditNoteCanonicalIdentity",
    original_s.document_number AS "originalDocumentReference",
    cl.exact_reference AS "referencedOriginalReference",
    cl.exact_reference_hash AS "exactReferenceHash",
    ${FACTURA_EMITIDA_COUNTERPARTY_FISCAL_SQL.replaceAll('fe.', 'original_fe.')} AS "counterpartyFiscalIdentity",
    original_fe.cliente AS "counterpartyCanonicalIdentity",
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
      AND original_s.document_number = original_fe.num_factura
      AND original_s.total_cents = b4_importe_bancario_centimos(original_fe.total)
      AND original_s.invoice_fiscal_identity = ${FACTURA_EMITIDA_FISCAL_IDENTITY_SQL.replaceAll('fe.', 'original_fe.')}
      AND original_s.party_role = 'CLIENTE'
      AND NULLIF(btrim(original_s.document_class), '') IS NOT NULL
      AND NULLIF(btrim(original_s.currency_code), '') IS NOT NULL
      AND credit_s.document_number = credit_fe.num_factura
      AND credit_s.total_cents = b4_importe_bancario_centimos(credit_fe.total)
      AND credit_s.invoice_fiscal_identity = ${FACTURA_EMITIDA_FISCAL_IDENTITY_SQL.replaceAll('fe.', 'credit_fe.')}
      AND credit_s.party_role = 'CLIENTE'
      AND NULLIF(btrim(credit_s.document_class), '') IS NOT NULL
      AND NULLIF(btrim(credit_s.currency_code), '') IS NOT NULL
    ) AS current,
    (cl.state = 'REJECTED'::"DocumentVersionCreditLinkState") AS deleted
  FROM document_version_credit_links cl
  JOIN document_version_lifecycle original_l ON original_l.id = cl.original_lifecycle_id
  JOIN document_version_snapshots original_s
    ON original_s.lifecycle_id = original_l.id
   AND original_s.version_number = original_l.current_version
  JOIN facturas_emitidas original_fe
    ON original_s.document_number = original_fe.num_factura
  JOIN document_version_lifecycle credit_l ON credit_l.id = cl.credit_lifecycle_id
  LEFT JOIN document_version_snapshots credit_s
    ON credit_s.lifecycle_id = credit_l.id
   AND credit_s.version_number = credit_l.current_version
  LEFT JOIN facturas_emitidas credit_fe
    ON credit_s.document_number = credit_fe.num_factura
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
  LIMIT ${CREDIT_NOTE_READ_LIMIT} OFFSET 0
`

const CREDIT_LINK_DECISIONS_READY_SQL = `SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema='public' AND table_name='document_version_credit_link_decisions' LIMIT 1 OFFSET 0`
const LEGACY_HUMAN_CONFIRMED_SQL = `cl.state = 'CONFIRMED'::"DocumentVersionCreditLinkState"
      AND cl.confirmed_by_id IS NOT NULL
      AND cl.confirmed_at IS NOT NULL`
const LEGACY_HUMAN_REJECTED_SQL = `cl.state = 'REJECTED'::"DocumentVersionCreditLinkState"`

/** Before the additive migration exists, the legacy immutable link remains authority. */
function effectiveCreditLinksSql(decisionsReady: boolean): string {
  if (!decisionsReady) return ISSUED_CREDIT_LINKS_SQL
  const lastState = `(SELECT d.effective_state::text FROM document_version_credit_link_decisions d WHERE d.credit_link_id=cl.id ORDER BY d.decision_sequence DESC LIMIT 1)`
  const hasDecision = `EXISTS (SELECT 1 FROM document_version_credit_link_decisions d WHERE d.credit_link_id=cl.id)`
  const confirmed = `(${lastState} = 'CONFIRMED' OR (NOT ${hasDecision} AND ${LEGACY_HUMAN_CONFIRMED_SQL}))`
  const rejected = `COALESCE(${lastState},cl.state::text) = 'REJECTED'`
  return ISSUED_CREDIT_LINKS_SQL.replace(LEGACY_HUMAN_CONFIRMED_SQL, confirmed).replace(LEGACY_HUMAN_REJECTED_SQL, rejected)
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

function assertBounded(label: string, rows: readonly unknown[]): void {
  if (rows.length >= CREDIT_NOTE_READ_LIMIT) throw new Error(`CREDIT_NOTE_READ_${label}_DEMASIADO_GRANDE`)
}

function issuedDocument(row: IssuedCreditDocumentRow): CanonicalCreditNoteDocument {
  return {
    // Real FacturaEmitida.id selected by the full stored documentary identity.
    documentId: asString(row.documentId),
    // Stable provider source identity, not an FI id or generated placeholder.
    canonicalIdentity: `${asString(row.source)}:${asString(row.sourceItemKey)}`,
    currentVersionId: asString(row.currentVersionId),
    kind: 'EMITIDA',
    partyRole: row.partyRole as CanonicalCreditNoteDocument['partyRole'],
    documentReference: asString(row.documentReference),
    referencedOriginalReference: asNullableString(row.referencedOriginalReference),
    counterpartyFiscalIdentity: asString(row.counterpartyFiscalIdentity),
    // The canonical FI source provides the already stored client identity.
    counterpartyCanonicalIdentity: asString(row.counterpartyCanonicalIdentity),
    signedTotalCents: asSafeInteger(row.signedTotalCents),
    currencyCode: asNullableString(row.currencyCode),
    // A partial/historical/tombstoned/amber source never arrives from documents
    // SQL. Any remaining metadata mismatch must still become visible REVISION.
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

function versionLink(row: CreditLinkRow): CreditNoteVersionLink {
  // A corrupt/missing hash cannot be repaired from any other document field.
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

function b4EvidenceFromB7(
  rows: readonly B4DocumentLineInput[],
  originalsById: ReadonlyMap<string, CanonicalCreditNoteDocument>,
): CreditNoteB4PaymentEvidence[] {
  return rows.flatMap((row) => {
    const original = row.invoiceId ? originalsById.get(row.invoiceId) : undefined
    const signedCents = row.signedCents
    const wrapperTargetCents = row.wrapperTargetCents
    const physicalBankCents = row.physicalBankCents
    const sumAllActiveCents = row.sumAllActiveCents
    const activeDocumentLineCount = row.activeDocumentLineCount
    if (!original || signedCents === null || signedCents === 0) return []
    const proofExact = row.active === true
      && row.documentActive === true
      && row.documentKind === 'FACTURA_EMITIDA'
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
      // Existing B4 link id: it is neither a B7 aggregate nor a new operation.
      evidenceId: row.lineId,
      originalDocumentId: original.documentId,
      signedCents,
      currencyCode: original.currencyCode,
      active: row.active === true,
      documentActive: row.documentActive === true,
      operationApplied: row.operationApplied === true,
      operationReverted: row.operationReverted === true,
      movementJustified: row.movementJustified === true,
      physicalClosureExact: proofExact,
    }]
  })
}

function blockedProjection(invoice: InvoiceSettlement | CreditNoteIssuedBankProjection, reason: string): CreditNoteIssuedBankProjection {
  return {
    ...invoice,
    creditNoteState: 'REVISION',
    rectificationCents: null,
    remainingAfterCreditNotesCents: null,
    creditNoteReviewReasons: [reason],
  }
}

/**
 * Executes two bounded SELECT projections: eligible current document snapshots
 * and append-only credit links. Direct B4 evidence comes from the exact B7
 * population read in this same request, avoiding a divergent aggregate/query.
 * Missing source snapshot/version is revision, never a synthetic zero.
 *
 * A B6/remittance amount cannot be decomposed from a B7 aggregate without the
 * current receipt allocation proof. This reader deliberately supplies no made-up
 * B4 line for it, so the pure B7-vs-3c equality check produces REVISION.
 */
export async function readIssuedCreditNotesForBankInvoicing(
  db: CreditNoteReadDatabase,
  calculated: IssuedCreditNoteBankPopulation,
): Promise<CreditNoteIssuedBankProjection[]> {
  const decisionsReady = await creditLinkDecisionsReady(db)
  const [documentRows, linkRows] = await Promise.all([
    db.$queryRawUnsafe<IssuedCreditDocumentRow[]>(ISSUED_CREDIT_DOCUMENTS_SQL),
    db.$queryRawUnsafe<CreditLinkRow[]>(effectiveCreditLinksSql(decisionsReady)),
  ])
  assertBounded('DOCUMENTOS_EMITIDOS', documentRows)
  assertBounded('ENLACES', linkRows)

  const documents = documentRows.map(issuedDocument)
  const originals = documents.filter((document) => document.referencedOriginalReference === null)
  const creditNotes = documents.filter((document) => document.referencedOriginalReference !== null)
  const originalsById = new Map(originals.map((document) => [document.documentId, document]))
  const settlements = calculateCreditNoteSettlements({
    originals,
    creditNotes,
    versionLinks: linkRows.map(versionLink),
    b4Payments: b4EvidenceFromB7(calculated.directB4Lines, originalsById),
  }).settlements
  const projected = applyCreditNotesToIssuedBankProjection(calculated.invoices, settlements)

  return projected.map((invoice) => {
    // A B7 FI with no complete current documentary source cannot assert that it
    // has no rectificativa. Preserve B7, but make 3c explicitly review-only.
    if (!originalsById.has(invoice.invoiceId)) {
      return blockedProjection(invoice, 'ORIGINAL_RECTIFICATIVA_SIN_VERSION_CANONICA_ELEGIBLE')
    }
    return invoice
  })
}

/** Exported only for synthetic SQL-shape tests; it is not a mutable database API. */
export const creditNoteReadSql = {
  issuedDocuments: ISSUED_CREDIT_DOCUMENTS_SQL,
  issuedLinks: ISSUED_CREDIT_LINKS_SQL,
  creditLinkDecisionsReady: CREDIT_LINK_DECISIONS_READY_SQL,
} as const
