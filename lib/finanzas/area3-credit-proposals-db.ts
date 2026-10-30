/*
 * Área 3c — acceso PostgreSQL para propuestas finitas de abonos recibidos.
 *
 * El cliente/tx es inyectado: este archivo nunca abre conexión, transacción ni
 * commit. Así el orquestador puede encerrar lectura, huellas y apply en el mismo
 * SERIALIZABLE. No llama Graph/OCR, no toca facturas/B4 ni decide humanos.
 */
import {
  AREA3_ONEDRIVE_SOURCE,
  AREA3_PANEL_RECEIVED_SOURCE,
  area3ExactReferenceHash,
  area3MetadataOnlySeed,
  area3StableHash,
  decideArea3ReceivedCreditProposals,
  type Area3CreditProposalDecision,
  type Area3CreditSeedMetadata,
  type Area3ReceivedIdentity,
  type Area3ReceivedSource,
} from './area3-credit-proposals-core'

export const AREA3_CREDIT_PROPOSAL_PAGE_SIZE = 200
export const AREA3_CREDIT_PROPOSAL_MAX_DOCUMENTS = 5_000

type QueryResult<T> = Readonly<{ rows: T[]; rowCount?: number | null }>
export interface Area3CreditProposalDb {
  query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>
}

type SourceRow = Readonly<{
  invoiceId: unknown
  eligibleForProposal: unknown
  provider: unknown
  cif: unknown
  invoiceFiscalIdentity: unknown
  documentReference: unknown
  documentDate: unknown
  totalText: unknown
  ocrText: unknown
  oneDriveDriveId: unknown
  oneDriveItemId: unknown
  currencyCode: unknown
}>

type LifecycleRow = Readonly<{ lifecycleId: unknown; currentVersion: unknown; lifecycleState: unknown }>
type SnapshotRow = Readonly<{
  lifecycleId: unknown
  lifecycleState: unknown
  currentVersion: unknown
  documentNumber: unknown
  totalCents: unknown
  invoiceFiscalIdentity: unknown
  partyRole: unknown
  documentClass: unknown
  referencedOriginalReference: unknown
  currencyCode: unknown
}>
type ExistingLinkRow = Readonly<{ effectiveState: unknown }>

export type Area3CreditProposalPlan = Readonly<{
  decisions: readonly Area3CreditProposalDecision[]
  aggregate: Readonly<{
    scannedDocuments: number
    candidateDocuments: number
    proposed: number
    ignored: number
    reviewByReason: Readonly<Record<string, number>>
    onedriveIdentityCandidates: number
    panelReceivedIdentityCandidates: number
  }>
}>

export type Area3CreditProposalApplyResult = Readonly<{
  metadataSeedsCreated: number
  metadataSeedsAlreadyPresent: number
  proposalsCreated: number
  proposalsAlreadyPresent: number
  skippedByExistingHumanState: Readonly<Record<'CONFIRMED' | 'REJECTED', number>>
  reviewByReason: Readonly<Record<string, number>>
}>

function string(value: unknown): string | null { return typeof value === 'string' ? value : null }
function int(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'bigint' && value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}
function nullableText(value: unknown): string | null { return typeof value === 'string' ? value : null }

/** Parses only an exact decimal PostgreSQL textual rendering into signed cents. */
export function area3CentsFromDatabaseText(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [whole, fraction = ''] = unsigned.split('.')
  try {
    const cents = BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2))
    const signed = negative ? -cents : cents
    return signed >= -BigInt(2_147_483_648) && signed <= BigInt(2_147_483_647) ? Number(signed) : null
  } catch { return null }
}

function source(row: SourceRow): Area3ReceivedSource {
  return {
    invoiceId: string(row.invoiceId) ?? '',
    eligibleForProposal: row.eligibleForProposal === true,
    provider: nullableText(row.provider),
    cif: nullableText(row.cif),
    invoiceFiscalIdentity: nullableText(row.invoiceFiscalIdentity),
    documentReference: nullableText(row.documentReference),
    documentDate: nullableText(row.documentDate),
    totalCents: area3CentsFromDatabaseText(row.totalText),
    ocrText: nullableText(row.ocrText),
    oneDriveDriveId: nullableText(row.oneDriveDriveId),
    oneDriveItemId: nullableText(row.oneDriveItemId),
    // The received table has no currency column. This value can only come from
    // one exact, active current snapshot; OCR JSON is intentionally not a
    // fallback because an absent extraction is not documentary currency proof.
    currencyCode: typeof row.currencyCode === 'string' && /^[A-Z]{3}$/.test(row.currencyCode) ? row.currencyCode : null,
  }
}

const FACTURA_RECIBIDA_FISCAL_IDENTITY_SQL = `
  ('CIF:' || regexp_replace(upper(fr.cif), '[[:space:]._/\\-]+', '', 'g') ||
    '|NUM:' || regexp_replace(upper(fr.num_factura), '[[:space:]]+', '', 'g'))
`
const ONEDRIVE_SOURCE_KEY_SQL = "^[A-Za-z0-9!_.~-]{4,220}:[A-Za-z0-9!_.~-]{4,220}$"

/**
 * Every SELECT is cursor-paginated, ordered by opaque invoice UUID text and
 * bounded. Private source fields never leave this module except to the pure
 * planner in process; callers must return the aggregate, not `documents`.
 */
export async function readArea3ReceivedCreditSourcesTx(
  db: Area3CreditProposalDb,
  options: Readonly<{ pageSize?: number; maxDocuments?: number }> = {},
): Promise<Area3ReceivedSource[]> {
  const pageSize = options.pageSize ?? AREA3_CREDIT_PROPOSAL_PAGE_SIZE
  const maxDocuments = options.maxDocuments ?? AREA3_CREDIT_PROPOSAL_MAX_DOCUMENTS
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('AREA3_PAGE_SIZE_INVALID')
  if (!Number.isSafeInteger(maxDocuments) || maxDocuments < pageSize || maxDocuments > 20_000) throw new Error('AREA3_MAX_DOCUMENTS_INVALID')
  const values: Area3ReceivedSource[] = []
  let cursor = ''
  for (;;) {
    const page = await db.query<SourceRow>(`
      SELECT
        fr.id::text AS "invoiceId",
        (
          fr.calidad='VALIDA'::"CalidadFacturaRecibida"
          AND fr.copia_de_id IS NULL
          AND fr.conflicto_identidad=false
          AND fr.duplicado_externo=false
          AND fr.naturaleza_documento='FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero"
        ) AS "eligibleForProposal",
        fr.proveedor AS provider,
        fr.cif AS cif,
        ${FACTURA_RECIBIDA_FISCAL_IDENTITY_SQL} AS "invoiceFiscalIdentity",
        fr.num_factura AS "documentReference",
        fr.fecha::date::text AS "documentDate",
        fr.total::text AS "totalText",
        /*
         * datos_ocr_raw already contains concepto/lineas when available. Joining
         * those fields again would turn one literal documentary mention into two
         * serialization copies (not two source mentions). If historic raw OCR is
         * absent, retain the separate stored text fields as the only fallback.
         */
        CASE
          WHEN NULLIF(btrim(fr.datos_ocr_raw),'') IS NOT NULL THEN fr.datos_ocr_raw
          ELSE concat_ws(E'\n',fr.concepto,fr.lineas_detalle)
        END AS "ocrText",
        fr.onedrive_drive_id AS "oneDriveDriveId",
        fr.onedrive_item_id AS "oneDriveItemId",
        canonical_snapshot."currencyCode" AS "currencyCode"
      FROM facturas_recibidas fr
      LEFT JOIN LATERAL (
        /*
         * Reuse currency only when there is exactly one active current snapshot
         * with B5's complete source tuple. A raw OCR JSON root, country, or
         * implicit EUR is never a substitute; two lifecycle namespaces are an
         * ambiguity, not a license to choose a currency.
         */
        SELECT CASE WHEN count(*) = 1 THEN max(btrim(s.currency_code)) ELSE NULL END AS "currencyCode"
        FROM document_version_lifecycle l
        JOIN document_version_snapshots s ON s.lifecycle_id=l.id AND s.version_number=l.current_version
        WHERE l.state='ACTIVE'::"DocumentVersionLifecycleState"
          AND l.current_version >= 1
          AND (
            (l.source='ONEDRIVE'
              AND l.source_item_key=(fr.onedrive_drive_id || ':' || fr.onedrive_item_id)
              AND l.source_item_key ~ '${ONEDRIVE_SOURCE_KEY_SQL}')
            OR (l.source='PANEL_RECEIVED' AND l.source_item_key=fr.id::text)
          )
          AND s.document_number=fr.num_factura
          AND s.total_cents=b4_importe_bancario_centimos(fr.total)
          AND s.invoice_fiscal_identity=${FACTURA_RECIBIDA_FISCAL_IDENTITY_SQL}
          AND s.party_role='PROVEEDOR'
          AND NULLIF(btrim(s.document_class),'') IS NOT NULL
          AND btrim(s.currency_code) ~ '^[A-Z]{3}$'
      ) canonical_snapshot ON TRUE
      WHERE fr.id::text > $1
      ORDER BY fr.id::text ASC
      LIMIT $2
    `, [cursor, pageSize])
    if (page.rows.length > pageSize) throw new Error('AREA3_SOURCE_PAGE_UNBOUNDED')
    if (page.rows.length === 0) break
    const mapped = page.rows.map(source)
    values.push(...mapped)
    if (values.length > maxDocuments) throw new Error('AREA3_SOURCE_LIMIT_EXCEEDED')
    const next = mapped.at(-1)?.invoiceId
    if (!next || next <= cursor) throw new Error('AREA3_SOURCE_CURSOR_INVALID')
    cursor = next
    if (page.rows.length < pageSize) break
  }
  return values
}

export function planArea3ReceivedCreditProposals(documents: readonly Area3ReceivedSource[]): Area3CreditProposalPlan {
  const decisions = decideArea3ReceivedCreditProposals(documents)
  const reviewByReason: Record<string, number> = {}
  let proposed = 0
  let ignored = 0
  let onedriveIdentityCandidates = 0
  let panelReceivedIdentityCandidates = 0
  for (const decision of decisions) {
    if (decision.kind === 'PROPOSE') {
      proposed += 1
      for (const identity of [decision.creditIdentity, decision.originalIdentity]) {
        if (identity.source === AREA3_ONEDRIVE_SOURCE) onedriveIdentityCandidates += 1
        else panelReceivedIdentityCandidates += 1
      }
    } else if (decision.kind === 'IGNORE') {
      ignored += 1
    } else {
      reviewByReason[decision.reason] = (reviewByReason[decision.reason] ?? 0) + 1
    }
  }
  return {
    decisions,
    aggregate: {
      scannedDocuments: documents.length,
      candidateDocuments: decisions.length,
      proposed,
      ignored,
      reviewByReason,
      onedriveIdentityCandidates,
      panelReceivedIdentityCandidates,
    },
  }
}

function metadataChecksum(identity: Area3ReceivedIdentity, metadata: Area3CreditSeedMetadata): string {
  return area3StableHash({ schema: 'AREA3_CREDIT_METADATA_SEED_V1', identity, metadata, artifactState: 'UNAVAILABLE' })
}
function metadataIdempotencyKey(identity: Area3ReceivedIdentity, metadata: Area3CreditSeedMetadata): string {
  return area3StableHash({ schema: 'AREA3_CREDIT_METADATA_SEED_V1', kind: 'BASELINE', identity, metadata })
}

/**
 * Creates no artifact and no content evidence. The only permissible write is a
 * v1 baseline for an otherwise empty lifecycle; existing current versions are
 * read untouched and can never be replaced by this finite traversal.
 */
async function ensureMetadataOnlyLifecycleTx(
  db: Area3CreditProposalDb,
  identity: Area3ReceivedIdentity,
  metadata: Area3CreditSeedMetadata,
): Promise<Readonly<{ lifecycleId: string; seeded: boolean; present: boolean }>> {
  await db.query(`
    INSERT INTO document_version_lifecycle (id,source,source_item_key,state,current_version,created_at,updated_at)
    VALUES (gen_random_uuid(),$1,$2,'ACTIVE'::"DocumentVersionLifecycleState",0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT (source,source_item_key) DO NOTHING
  `, [identity.source, identity.sourceItemKey])
  const lifecycle = await db.query<LifecycleRow>(`
    SELECT id::text AS "lifecycleId",current_version AS "currentVersion",state::text AS "lifecycleState"
    FROM document_version_lifecycle
    WHERE source=$1 AND source_item_key=$2
    LIMIT 2
    FOR KEY SHARE
  `, [identity.source, identity.sourceItemKey])
  if (lifecycle.rows.length !== 1) throw new Error('AREA3_LIFECYCLE_AMBIGUOUS')
  const currentVersion = int(lifecycle.rows[0]?.currentVersion)
  const lifecycleId = string(lifecycle.rows[0]?.lifecycleId)
  if (!lifecycleId || currentVersion === null) throw new Error('AREA3_LIFECYCLE_INVALID')
  if (lifecycle.rows[0]?.lifecycleState !== 'ACTIVE') return { lifecycleId, seeded: false, present: false }
  if (currentVersion !== 0) return { lifecycleId, seeded: false, present: true }

  const idempotencyKey = metadataIdempotencyKey(identity, metadata)
  const inserted = await db.query(`
    INSERT INTO document_version_snapshots
      (id,lifecycle_id,version_number,content_sha256,byte_length,original_format,artifact_state,private_storage_handle,metadata_checksum,quick_xor_hash,c_tag,e_tag,graph_version,original_file_name,document_number,document_date,total_cents,invoice_fiscal_identity,party_role,document_class,referenced_original_reference,currency_code,upstream_version_ref,number_fingerprint,amount_fingerprint,idempotency_key,captured_at)
    VALUES
      (gen_random_uuid(),$1::uuid,1,NULL,NULL,NULL,'UNAVAILABLE'::"DocumentVersionArtifactState",NULL,$2,NULL,NULL,NULL,NULL,NULL,$3,$4::date,$5,$6,$7,$8,$9,$10,NULL,NULL,NULL,$11,CURRENT_TIMESTAMP)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id::text AS id
  `, [
    lifecycleId,
    metadataChecksum(identity, metadata),
    metadata.documentNumber,
    metadata.documentDate,
    metadata.totalCents,
    metadata.invoiceFiscalIdentity,
    metadata.partyRole,
    metadata.documentClass,
    metadata.referencedOriginalReference,
    metadata.currencyCode,
    idempotencyKey,
  ])
  if (inserted.rows.length === 0) return { lifecycleId, seeded: false, present: true }
  const advanced = await db.query(`
    UPDATE document_version_lifecycle
    SET current_version=1,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1::uuid AND current_version=0 AND state='ACTIVE'::"DocumentVersionLifecycleState"
    RETURNING id::text AS id
  `, [lifecycleId])
  if (advanced.rows.length !== 1) throw new Error('AREA3_METADATA_BASELINE_STALE')
  return { lifecycleId, seeded: true, present: true }
}

async function currentSnapshotTx(db: Area3CreditProposalDb, lifecycleId: string): Promise<SnapshotRow | null> {
  const result = await db.query<SnapshotRow>(`
    SELECT
      l.id::text AS "lifecycleId",l.state::text AS "lifecycleState",l.current_version AS "currentVersion",
      s.document_number AS "documentNumber",s.total_cents AS "totalCents",s.invoice_fiscal_identity AS "invoiceFiscalIdentity",
      s.party_role AS "partyRole",s.document_class AS "documentClass",s.referenced_original_reference AS "referencedOriginalReference",s.currency_code AS "currencyCode"
    FROM document_version_lifecycle l
    LEFT JOIN document_version_snapshots s ON s.lifecycle_id=l.id AND s.version_number=l.current_version
    WHERE l.id=$1::uuid
    LIMIT 2
    FOR KEY SHARE OF l
  `, [lifecycleId])
  if (result.rows.length > 1) throw new Error('AREA3_CURRENT_SNAPSHOT_AMBIGUOUS')
  return result.rows[0] ?? null
}

function snapshotMatches(row: SnapshotRow | null, metadata: Area3CreditSeedMetadata): boolean {
  return row?.lifecycleState === 'ACTIVE'
    && int(row.currentVersion) !== null && int(row.currentVersion)! >= 1
    && row.documentNumber === metadata.documentNumber
    && int(row.totalCents) === metadata.totalCents
    && row.invoiceFiscalIdentity === metadata.invoiceFiscalIdentity
    && row.partyRole === 'PROVEEDOR'
    && typeof row.documentClass === 'string' && row.documentClass.length > 0
    && row.referencedOriginalReference === metadata.referencedOriginalReference
    && row.currencyCode === metadata.currencyCode
}

async function existingCreditStateTx(db: Area3CreditProposalDb, creditLifecycleId: string): Promise<'PROPOSED' | 'CONFIRMED' | 'REJECTED' | null> {
  const result = await db.query<ExistingLinkRow>(`
    SELECT COALESCE(
      (SELECT d.effective_state::text
       FROM document_version_credit_link_decisions d
       WHERE d.credit_link_id=cl.id
       ORDER BY d.decision_sequence DESC
       LIMIT 1),
      cl.state::text
    ) AS "effectiveState"
    FROM document_version_credit_links cl
    WHERE cl.credit_lifecycle_id=$1::uuid
    ORDER BY cl.created_at ASC,cl.id ASC
    LIMIT 2
    FOR KEY SHARE OF cl
  `, [creditLifecycleId])
  if (result.rows.length > 1) throw new Error('AREA3_CREDIT_ALREADY_MULTILINKED_REVIEW')
  const state = result.rows[0]?.effectiveState
  return state === 'PROPOSED' || state === 'CONFIRMED' || state === 'REJECTED' ? state : null
}

function increment(target: Record<string, number>, key: string): void { target[key] = (target[key] ?? 0) + 1 }

/**
 * Mutating half of the workflow. Caller owns transaction and commit/rollback.
 * It can only seed metadata v1/UNAVAILABLE and insert a new PROPOSED link. It
 * never writes a decision, `confirmed_*`, a received invoice, B4, artifact, hash
 * or successor version.
 */
export async function applyArea3CreditProposalsTx(
  db: Area3CreditProposalDb,
  plan: Area3CreditProposalPlan,
): Promise<Area3CreditProposalApplyResult> {
  let metadataSeedsCreated = 0
  let metadataSeedsAlreadyPresent = 0
  let proposalsCreated = 0
  let proposalsAlreadyPresent = 0
  const skippedByExistingHumanState: Record<'CONFIRMED' | 'REJECTED', number> = { CONFIRMED: 0, REJECTED: 0 }
  const reviewByReason: Record<string, number> = { ...plan.aggregate.reviewByReason }

  for (const decision of plan.decisions) {
    if (decision.kind !== 'PROPOSE') continue
    const creditMetadata = area3MetadataOnlySeed(decision.credit, 'CREDIT', decision.exactReference)
    const originalMetadata = area3MetadataOnlySeed(decision.original, 'ORIGINAL', null)
    if (!creditMetadata || !originalMetadata || creditMetadata.currencyCode !== originalMetadata.currencyCode) {
      increment(reviewByReason, 'METADATOS_DOCUMENTALES_INCOMPLETOS')
      continue
    }

    // Same global ordering avoids opposite locks if two credits name each other
    // in malformed OCR. The values are opaque lifecycle identities, not names.
    const ordered = [
      { identity: decision.creditIdentity, metadata: creditMetadata, role: 'credit' as const },
      { identity: decision.originalIdentity, metadata: originalMetadata, role: 'original' as const },
    ].sort((left, right) => `${left.identity.source}\u0000${left.identity.sourceItemKey}`.localeCompare(`${right.identity.source}\u0000${right.identity.sourceItemKey}`))
    const seeded = new Map<'credit' | 'original', Awaited<ReturnType<typeof ensureMetadataOnlyLifecycleTx>>>()
    for (const item of ordered) seeded.set(item.role, await ensureMetadataOnlyLifecycleTx(db, item.identity, item.metadata))
    const creditLifecycle = seeded.get('credit')!
    const originalLifecycle = seeded.get('original')!
    metadataSeedsCreated += Number(creditLifecycle.seeded) + Number(originalLifecycle.seeded)
    metadataSeedsAlreadyPresent += Number(!creditLifecycle.seeded) + Number(!originalLifecycle.seeded)
    if (!creditLifecycle.present || !originalLifecycle.present) {
      increment(reviewByReason, 'ORIGINAL_NO_ELEGIBLE')
      continue
    }

    const creditSnapshot = await currentSnapshotTx(db, creditLifecycle.lifecycleId)
    const originalSnapshot = await currentSnapshotTx(db, originalLifecycle.lifecycleId)
    if (!snapshotMatches(creditSnapshot, creditMetadata) || !snapshotMatches(originalSnapshot, originalMetadata)) {
      increment(reviewByReason, 'METADATOS_DOCUMENTALES_INCOMPLETOS')
      continue
    }

    const existingState = await existingCreditStateTx(db, creditLifecycle.lifecycleId)
    if (existingState === 'CONFIRMED' || existingState === 'REJECTED') {
      skippedByExistingHumanState[existingState] += 1
      continue
    }
    if (existingState === 'PROPOSED') {
      proposalsAlreadyPresent += 1
      continue
    }

    const exactReferenceHash = area3ExactReferenceHash(decision.exactReference)
    const idempotencyKey = area3StableHash({
      schema: 'DOCUMENT_LIFECYCLE_V1', kind: 'CREDIT_LINK', credit: decision.creditIdentity,
      original: decision.originalIdentity, exactReferenceHash,
    })
    const inserted = await db.query(`
      INSERT INTO document_version_credit_links
        (id,credit_lifecycle_id,original_lifecycle_id,exact_reference,exact_reference_hash,state,idempotency_key,proposed_by_id,confirmed_by_id,confirmed_at,created_at)
      VALUES
        (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,'PROPOSED'::"DocumentVersionCreditLinkState",$5,NULL,NULL,NULL,CURRENT_TIMESTAMP)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id::text AS id
    `, [creditLifecycle.lifecycleId, originalLifecycle.lifecycleId, decision.exactReference, exactReferenceHash, idempotencyKey])
    if (inserted.rows.length === 1) proposalsCreated += 1
    else proposalsAlreadyPresent += 1
  }

  return { metadataSeedsCreated, metadataSeedsAlreadyPresent, proposalsCreated, proposalsAlreadyPresent, skippedByExistingHumanState, reviewByReason }
}

/** A compact, non-sensitive output for CLI/reporting. */
export function area3ProposalSummary(plan: Area3CreditProposalPlan, applied?: Area3CreditProposalApplyResult): Record<string, unknown> {
  return {
    scannedDocuments: plan.aggregate.scannedDocuments,
    candidateDocuments: plan.aggregate.candidateDocuments,
    proposalsEligible: plan.aggregate.proposed,
    candidatesIgnored: plan.aggregate.ignored,
    reviewByReason: plan.aggregate.reviewByReason,
    sourceIdentityCoverage: {
      onedrive: plan.aggregate.onedriveIdentityCandidates,
      panelReceivedWithoutDrive: plan.aggregate.panelReceivedIdentityCandidates,
    },
    ...(applied ? {
      metadataSeedsCreated: applied.metadataSeedsCreated,
      metadataSeedsAlreadyPresent: applied.metadataSeedsAlreadyPresent,
      proposalsCreated: applied.proposalsCreated,
      proposalsAlreadyPresent: applied.proposalsAlreadyPresent,
      skippedByExistingHumanState: applied.skippedByExistingHumanState,
      applyReviewByReason: applied.reviewByReason,
    } : {}),
    guarantees: [
      'Solo enlaces PROPOSED; no se confirma ninguna decisión humana.',
      'Las propuestas no actualizan facturas recibidas, importes, calidad, estado ni B4.',
      'La semilla es metadata-only v1/UNAVAILABLE sin artefacto, bytes ni hash de contenido.',
      'Una referencia requiere ocurrencia literal única y coincidencia exacta de proveedor+CIF normalizado.',
    ],
  }
}
