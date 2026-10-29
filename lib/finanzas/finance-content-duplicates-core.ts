import { createHash } from 'node:crypto'

/**
 * Duplicate-content decisions for the document-version lifecycle.
 *
 * This module is intentionally pure: it neither downloads files nor runs OCR,
 * touches Prisma, mutates B4, deletes a document, or changes VAT treatment.
 * Its only positive result is a reversible, non-financial canonical *link*.
 */
export const FINANCE_CONTENT_DUPLICATES_SCHEMA = 'FINANCE_CONTENT_DUPLICATES_V1' as const

export type DocumentDuplicateKind = 'RECEIVED_INVOICE' | 'CONFIRMING' | 'PAYROLL' | 'OTHER'
export type DuplicateEvidence = 'SHA256_BYTES' | 'QUICK_XOR_HASH'
export type DuplicatePlanKind =
  | 'NO_ACTION'
  | 'SOFT_CANONICAL_LINK'
  | 'REVIEW_FISCAL_METADATA_CONFLICT'
  | 'REVIEW_HASH_COLLISION'
  | 'REVIEW_VERSION_CHANGED'
  | 'REVIEW_INSUFFICIENT_CONTENT_EVIDENCE'

export type ContentFingerprint = Readonly<{
  /** SHA-256 calculated from actual bytes, never an eTag. */
  sha256Bytes?: string | null
  /** Provider quickXorHash calculated from content; opaque but stable. */
  quickXorHash?: string | null
  /** Byte length helps reject impossible equality where available. */
  byteLength?: number | null
  /** cTag/eTag are observations only and cannot establish identity. */
  cTag?: string | null
  eTag?: string | null
}>

export type FiscalMetadata = Readonly<{
  cif: string | null
  invoiceNumber: string | null
}>

export type DuplicateDocument = Readonly<{
  /** Opaque lifecycle identifier; never log it from this module. */
  lifecycleId: string
  /** Opaque immutable snapshot identifier; never log it from this module. */
  snapshotId: string
  /** A source/item key is stable across a version of the same remote item. */
  sourceItemKey: string
  kind: DocumentDuplicateKind
  fingerprint: ContentFingerprint
  fiscal: FiscalMetadata
  /** The document behind an active B4 link must win every deterministic tie. */
  preservesActiveB4: boolean
  /** Immutable ordering supplied by the store; lower is older. */
  firstObservedOrder: number
}>

export type DuplicatePlan = Readonly<{
  schema: typeof FINANCE_CONTENT_DUPLICATES_SCHEMA
  kind: DuplicatePlanKind
  evidence: DuplicateEvidence | null
  canonicalLifecycleId: string | null
  duplicateLifecycleId: string | null
  /** The duplicate record remains independently visible and immutable. */
  linkMode: 'NONE' | 'SOFT_CANONICAL'
  requiresHumanConfirmation: boolean
  /** Always preserve B4 state, links, versions, and audit ledger. */
  b4Directive: 'PRESERVE_UNCHANGED'
  /** Confirming/payroll are never classified as VAT evidence by this feature. */
  vatDirective: 'UNCHANGED_OUT_OF_SCOPE' | 'UNCHANGED_NOT_APPLICABLE'
  /** No plan in this module can approve, merge, delete, or reconcile anything. */
  autoApproval: false
  mergeDocuments: false
  deleteDocuments: false
  operationKey: string
}>

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code)
}

function normalizedOpaque(value: string, field: string): string {
  const normalized = value.normalize('NFKC').trim()
  invariant(normalized.length > 0 && normalized.length <= 512 && !/[\u0000-\u001f\u007f]/.test(normalized), `DUPLICATE_${field}_INVALID`)
  return normalized
}

function normalizedHash(value: string | null | undefined, field: string, max: number): string | null {
  if (value === null || value === undefined) return null
  const normalized = value.normalize('NFKC').trim()
  invariant(normalized.length > 0 && normalized.length <= max && !/[\u0000-\u001f\u007f\s]/.test(normalized), `DUPLICATE_${field}_INVALID`)
  return normalized
}

function sha256(value: string | null | undefined): string | null {
  const normalized = normalizedHash(value, 'SHA256', 64)
  if (!normalized) return null
  invariant(/^[a-fA-F0-9]{64}$/.test(normalized), 'DUPLICATE_SHA256_INVALID')
  return normalized.toLowerCase()
}

function quickXor(value: string | null | undefined): string | null {
  return normalizedHash(value, 'QUICK_XOR_HASH', 512)
}

function byteLength(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  invariant(Number.isSafeInteger(value) && value >= 0, 'DUPLICATE_BYTE_LENGTH_INVALID')
  return value
}

function normalizedCif(value: string | null): string | null {
  if (value === null) return null
  const normalized = value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '')
  invariant(normalized.length > 0 && normalized.length <= 32, 'DUPLICATE_CIF_INVALID')
  return normalized
}

function normalizedInvoiceNumber(value: string | null): string | null {
  if (value === null) return null
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()
  invariant(normalized.length > 0 && normalized.length <= 256 && !/[\u0000-\u001f\u007f]/.test(normalized), 'DUPLICATE_INVOICE_NUMBER_INVALID')
  return normalized
}

function stableDocument(document: DuplicateDocument): DuplicateDocument {
  invariant(Number.isSafeInteger(document.firstObservedOrder) && document.firstObservedOrder >= 0, 'DUPLICATE_OBSERVED_ORDER_INVALID')
  return {
    ...document,
    lifecycleId: normalizedOpaque(document.lifecycleId, 'LIFECYCLE_ID'),
    snapshotId: normalizedOpaque(document.snapshotId, 'SNAPSHOT_ID'),
    sourceItemKey: normalizedOpaque(document.sourceItemKey, 'SOURCE_ITEM_KEY'),
    fingerprint: {
      sha256Bytes: sha256(document.fingerprint.sha256Bytes),
      quickXorHash: quickXor(document.fingerprint.quickXorHash),
      byteLength: byteLength(document.fingerprint.byteLength),
      // Kept as observation. Neither is read by identity comparison below.
      cTag: document.fingerprint.cTag === undefined || document.fingerprint.cTag === null ? null : normalizedOpaque(document.fingerprint.cTag, 'CTAG'),
      eTag: document.fingerprint.eTag === undefined || document.fingerprint.eTag === null ? null : normalizedOpaque(document.fingerprint.eTag, 'ETAG'),
    },
    fiscal: { cif: normalizedCif(document.fiscal.cif), invoiceNumber: normalizedInvoiceNumber(document.fiscal.invoiceNumber) },
  }
}

function vatDirective(kind: DocumentDuplicateKind): DuplicatePlan['vatDirective'] {
  return kind === 'CONFIRMING' || kind === 'PAYROLL' ? 'UNCHANGED_OUT_OF_SCOPE' : 'UNCHANGED_NOT_APPLICABLE'
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  invariant(Boolean(value) && typeof value === 'object', 'DUPLICATE_OPERATION_KEY_INVALID')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

function operationKey(kind: DuplicatePlanKind, incoming: DuplicateDocument, canonical: DuplicateDocument | null, evidence: DuplicateEvidence | null): string {
  return createHash('sha256').update(stableJson({
    schema: FINANCE_CONTENT_DUPLICATES_SCHEMA,
    kind,
    incoming: incoming.lifecycleId,
    snapshot: incoming.snapshotId,
    canonical: canonical?.lifecycleId ?? null,
    canonicalSnapshot: canonical?.snapshotId ?? null,
    evidence,
    sha256: incoming.fingerprint.sha256Bytes ?? null,
    quickXorHash: incoming.fingerprint.quickXorHash ?? null,
  }), 'utf8').digest('hex')
}

function plan(kind: DuplicatePlanKind, incoming: DuplicateDocument, canonical: DuplicateDocument | null, evidence: DuplicateEvidence | null): DuplicatePlan {
  const softLink = kind === 'SOFT_CANONICAL_LINK'
  const needsHuman = kind !== 'NO_ACTION' && !softLink
  return {
    schema: FINANCE_CONTENT_DUPLICATES_SCHEMA,
    kind,
    evidence,
    canonicalLifecycleId: softLink ? canonical!.lifecycleId : null,
    duplicateLifecycleId: softLink ? incoming.lifecycleId : null,
    linkMode: softLink ? 'SOFT_CANONICAL' : 'NONE',
    requiresHumanConfirmation: needsHuman,
    b4Directive: 'PRESERVE_UNCHANGED',
    vatDirective: vatDirective(incoming.kind),
    autoApproval: false,
    mergeDocuments: false,
    deleteDocuments: false,
    operationKey: operationKey(kind, incoming, canonical, evidence),
  }
}

function evidenceFor(left: DuplicateDocument, right: DuplicateDocument): { evidence: DuplicateEvidence | null; collision: boolean } {
  const leftSha = left.fingerprint.sha256Bytes
  const rightSha = right.fingerprint.sha256Bytes
  const leftQuick = left.fingerprint.quickXorHash
  const rightQuick = right.fingerprint.quickXorHash
  const lengthConflict = left.fingerprint.byteLength !== null && right.fingerprint.byteLength !== null && left.fingerprint.byteLength !== right.fingerprint.byteLength
  // Two independently calculated SHA-256 values disagreeing is decisive, even if
  // a provider quick hash happens to collide. A differing length is also decisive.
  if (lengthConflict || (leftSha && rightSha && leftSha !== rightSha)) return { evidence: null, collision: true }
  if (leftSha && rightSha && leftSha === rightSha) return { evidence: 'SHA256_BYTES', collision: false }
  if (leftQuick && rightQuick && leftQuick === rightQuick) return { evidence: 'QUICK_XOR_HASH', collision: false }
  return { evidence: null, collision: false }
}

function fiscalRelationship(left: FiscalMetadata, right: FiscalMetadata): 'EQUAL' | 'INCOMPLETE' | 'CONFLICT' {
  if (!left.cif || !left.invoiceNumber || !right.cif || !right.invoiceNumber) return 'INCOMPLETE'
  return left.cif === right.cif && left.invoiceNumber === right.invoiceNumber ? 'EQUAL' : 'CONFLICT'
}

/**
 * A deterministic winner preserves a document already participating in active B4.
 * It deliberately does not inspect or mutate the ledger; the boolean is supplied
 * by the parent projection. Remaining ties use immutable order then opaque IDs.
 */
export function selectCanonicalDocument(candidates: readonly DuplicateDocument[]): DuplicateDocument | null {
  if (!candidates.length) return null
  return candidates.map(stableDocument).sort((left, right) =>
    Number(right.preservesActiveB4) - Number(left.preservesActiveB4)
    || left.firstObservedOrder - right.firstObservedOrder
    || left.lifecycleId.localeCompare(right.lifecycleId)
    || left.snapshotId.localeCompare(right.snapshotId),
  )[0] ?? null
}

/**
 * Plans a content-only duplicate observation. eTag and cTag are intentionally not
 * used to claim identical bytes. A matching hash with incompatible CIF+number is
 * routed to review, never merged or auto-approved.
 */
export function planContentDuplicate(incomingInput: DuplicateDocument, candidatesInput: readonly DuplicateDocument[]): DuplicatePlan {
  const incoming = stableDocument(incomingInput)
  const candidates = candidatesInput.map(stableDocument)
  const otherSources = candidates.filter(candidate => candidate.lifecycleId !== incoming.lifecycleId)

  const sameSource = candidates.filter(candidate => candidate.lifecycleId === incoming.lifecycleId)
  if (sameSource.length) {
    const current = selectCanonicalDocument(sameSource)!
    const sameSourceEvidence = evidenceFor(incoming, current)
    if (sameSourceEvidence.collision) return plan('REVIEW_VERSION_CHANGED', incoming, current, null)
    if (sameSourceEvidence.evidence) return plan('NO_ACTION', incoming, current, sameSourceEvidence.evidence)
    return plan('REVIEW_VERSION_CHANGED', incoming, current, null)
  }

  if (!incoming.fingerprint.sha256Bytes && !incoming.fingerprint.quickXorHash) {
    return plan('REVIEW_INSUFFICIENT_CONTENT_EVIDENCE', incoming, null, null)
  }

  const contentMatches: Array<{ candidate: DuplicateDocument; evidence: DuplicateEvidence }> = []
  for (const candidate of otherSources) {
    const assessment = evidenceFor(incoming, candidate)
    if (assessment.collision) return plan('REVIEW_HASH_COLLISION', incoming, candidate, null)
    if (assessment.evidence) contentMatches.push({ candidate, evidence: assessment.evidence })
  }
  if (!contentMatches.length) return plan('NO_ACTION', incoming, null, null)

  const matchedCandidates = contentMatches.map(match => match.candidate)
  const canonical = selectCanonicalDocument(matchedCandidates)
  invariant(canonical, 'DUPLICATE_CANONICAL_REQUIRED')
  const canonicalMatch = contentMatches.find(match => match.candidate.lifecycleId === canonical.lifecycleId && match.candidate.snapshotId === canonical.snapshotId)
  invariant(canonicalMatch, 'DUPLICATE_CANONICAL_MATCH_REQUIRED')
  const relationship = fiscalRelationship(incoming.fiscal, canonical.fiscal)
  if (relationship !== 'EQUAL') return plan('REVIEW_FISCAL_METADATA_CONFLICT', incoming, canonical, canonicalMatch.evidence)
  return plan('SOFT_CANONICAL_LINK', incoming, canonical, canonicalMatch.evidence)
}
