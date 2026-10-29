import {
  FINANCE_CONTENT_DUPLICATES_SCHEMA,
  planContentDuplicate,
  type ContentFingerprint,
  type DuplicateDocument,
  type DuplicatePlan,
} from './finance-content-duplicates-core'

/** The lifecycle owner owns these additive tables and their migration. */
export const DOCUMENT_VERSION_DUPLICATE_STORE_SCHEMA = 'DOCUMENT_VERSION_LIFECYCLE_V1' as const
export const DOCUMENT_VERSION_DUPLICATE_TABLES = [
  'document_version_lifecycle',
  'document_version_snapshots',
  'document_version_hash_duplicates',
] as const

export type DuplicatePage = Readonly<{ limit: number; offset: number }>
export type DuplicateCandidateQuery = Readonly<{
  schema: typeof DOCUMENT_VERSION_DUPLICATE_STORE_SCHEMA
  fingerprint: Pick<ContentFingerprint, 'sha256Bytes' | 'quickXorHash'>
  page: DuplicatePage
}>

export type DuplicateApplyResult = Readonly<{
  plan: DuplicatePlan
  persisted: boolean
  replay: boolean
}>

/**
 * This is a deliberately small port. It cannot expose a B4 write, document delete,
 * OCR call, Graph call, or VAT update. The parent supplies B4-protection flags as
 * part of its read projection, preserving the financial ledger by construction.
 */
export interface DocumentVersionDuplicateStore<Tx> {
  listByContentFingerprint(query: DuplicateCandidateQuery): Promise<readonly DuplicateDocument[]>
  /** Returns true only when this immutable observation/link is first recorded. */
  recordHashDuplicateObservation(tx: Tx, input: {
    schema: typeof FINANCE_CONTENT_DUPLICATES_SCHEMA
    operationKey: string
    plan: DuplicatePlan
  }): Promise<boolean>
}

export function validateDuplicatePage(input: Partial<DuplicatePage> | undefined): DuplicatePage {
  const limit = input?.limit ?? 50
  const offset = input?.offset ?? 0
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('DUPLICATE_PAGE_LIMIT_INVALID')
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new Error('DUPLICATE_PAGE_OFFSET_INVALID')
  return { limit, offset }
}

function nonEmptyHash(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > 512 || /[\u0000-\u001f\u007f\s]/.test(normalized)) throw new Error('DUPLICATE_QUERY_HASH_INVALID')
  return normalized
}

/**
 * A bounded, paged storage query contract. The lifecycle migration owns exact
 * column names; implementers must query only that schema and must bind all values.
 */
export function contentDuplicateLookupQuery(input: {
  fingerprint: Pick<ContentFingerprint, 'sha256Bytes' | 'quickXorHash'>
  page?: Partial<DuplicatePage>
}): DuplicateCandidateQuery {
  const sha256Bytes = nonEmptyHash(input.fingerprint.sha256Bytes)
  const quickXorHash = nonEmptyHash(input.fingerprint.quickXorHash)
  if (!sha256Bytes && !quickXorHash) throw new Error('DUPLICATE_QUERY_EVIDENCE_REQUIRED')
  return {
    schema: DOCUMENT_VERSION_DUPLICATE_STORE_SCHEMA,
    fingerprint: { sha256Bytes, quickXorHash },
    page: validateDuplicatePage(input.page),
  }
}

/**
 * Reference SQL shape for the parent-owned storage adapter. It is not executed by
 * this module. It uses a bound, paged query and never selects document bytes,
 * private locators, URLs, OCR raw data, or B4 records.
 */
export const DOCUMENT_VERSION_DUPLICATE_LOOKUP_SQL = `
SELECT s.id AS snapshot_id, s.lifecycle_id, s.sha256_bytes, s.quick_xor_hash,
       s.byte_length, s.fiscal_cif, s.fiscal_number, s.first_observed_order
FROM document_version_snapshots s
JOIN document_version_lifecycle l ON l.id = s.lifecycle_id
WHERE (($1::text IS NOT NULL AND s.sha256_bytes = $1)
    OR ($2::text IS NOT NULL AND s.quick_xor_hash = $2))
ORDER BY s.first_observed_order ASC, s.lifecycle_id ASC, s.id ASC
LIMIT $3 OFFSET $4
`.trim()

/**
 * Reads one bounded page and records at most one non-financial duplicate
 * observation in the caller's existing transaction. Replays are idempotent.
 */
export async function observeContentDuplicate<Tx>(input: {
  store: DocumentVersionDuplicateStore<Tx>
  tx: Tx
  incoming: DuplicateDocument
  page?: Partial<DuplicatePage>
}): Promise<DuplicateApplyResult> {
  const query = contentDuplicateLookupQuery({ fingerprint: input.incoming.fingerprint, page: input.page })
  const candidates = await input.store.listByContentFingerprint(query)
  if (candidates.length > query.page.limit) throw new Error('DUPLICATE_STORE_PAGE_UNBOUNDED')
  const plan = planContentDuplicate(input.incoming, candidates)

  // A no-op contains no observation to append and must remain a read-only replay.
  if (plan.kind === 'NO_ACTION') return { plan, persisted: false, replay: false }
  const persisted = await input.store.recordHashDuplicateObservation(input.tx, {
    schema: FINANCE_CONTENT_DUPLICATES_SCHEMA,
    operationKey: plan.operationKey,
    plan,
  })
  return { plan, persisted, replay: !persisted }
}
