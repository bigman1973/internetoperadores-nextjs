/*
 * Ciclo de vida documental financiero — núcleo puro.
 *
 * No importa Prisma, no lee entorno, no accede a Graph ni modifica B4. Las claves
 * y metadatos son valores privados de runtime/DB; este módulo nunca los registra
 * ni admite URL, token o credencial como localizador persistente.
 */
import { createHash } from 'node:crypto'

export const DOCUMENT_LIFECYCLE_SCHEMA_VERSION = 'DOCUMENT_LIFECYCLE_V1'
export const AMBAR_DOCUMENTO_CAMBIADO = 'AMBAR_DOCUMENTO_CAMBIADO' as const
const SHA256 = /^[0-9a-f]{64}$/i
const CONTROL = /[\u0000-\u001F\u007F]/

export class DocumentLifecycleError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'DocumentLifecycleError'
  }
}

export type DocumentLifecycleIdentity = Readonly<{
  /** Stable provider family, persisted only in the private lifecycle database. */
  source: string
  /** Stable private provider key (for Graph: drive + item); never a download URL. */
  sourceItemKey: string
}>

/** Persisted only in the private database/archive, never emitted to logs or reports. */
export type DocumentPrivateMetadata = Readonly<{
  originalFileName: string | null
  documentNumber: string | null
  documentDate: string | null
  totalCents: number | null
  /** Private canonical fiscal identity; never emitted to logs or reports. */
  invoiceFiscalIdentity: string | null
  /** Parsed source role used by rectificativa readers; no financial settlement follows. */
  partyRole: 'CLIENTE' | 'PROVEEDOR' | null
  /** Source classification retained only for the private historical reader. */
  documentClass: string | null
  /** Literal source reference to the original in a credit note; comparison is exact. */
  referencedOriginalReference: string | null
  currencyCode: string | null
  /** Stable provider version/ref, never a signed URL or bearer token. */
  upstreamVersionRef: string | null
}>

export type DocumentContentFingerprint = Readonly<{
  contentSha256?: string | null
  byteLength?: number | null
  quickXorHash?: string | null
  cTag?: string | null
  eTag?: string | null
  graphVersion?: string | null
  /** SHA-256 of a canonical document-number representation; never the number itself. */
  numberFingerprint?: string | null
  /** SHA-256 of a canonical signed-cents representation; never an amount itself. */
  amountFingerprint?: string | null
}>

export type StoredDocumentVersion = Readonly<{
  identity: DocumentLifecycleIdentity
  versionNumber: number
  fingerprint: DocumentContentFingerprint
  privateMetadata?: DocumentPrivateMetadata | null
  capturedAt?: string | null
  /** Opaque private handle, not an URL. Its absence must not be treated as an archived file. */
  privateLocatorHandle?: string | null
}>

export type DocumentObservation = Readonly<{
  identity: DocumentLifecycleIdentity
  fingerprint: DocumentContentFingerprint
  privateMetadata?: DocumentPrivateMetadata | null
  /** An observation time is audit metadata only and is excluded from idempotency. */
  observedAt?: string | null
}>

export type ReconciliationProtection = Readonly<{
  /** CONFIRMED means an existing B4 justification already relies on this document. */
  status: 'NONE' | 'PENDING' | 'CONFIRMED'
  /** Opaque hash/reference for an audit adapter; never an operation ID in logs. */
  b4ReferenceHash?: string | null
}>

export type ObservationAssessment = Readonly<{
  kind: 'CREATE_BASELINE' | 'UNCHANGED' | 'NEW_VERSION' | 'METADATA_ONLY' | 'INSUFFICIENT_EVIDENCE'
  evidence: 'CONTENT_SHA256' | 'QUICK_XOR_HASH' | 'CTAG' | 'ETAG_ONLY' | 'NONE'
  reason: string
}>

export type PreservationPlan = Readonly<{
  requiredBeforeReplacement: boolean
  previousBytesKnownAvailable: boolean
  /** Explicitly prevents callers from promising an absent historical file. */
  doesNotPromiseHistoricalFile: true
}>

export type DocumentChangeIncident = Readonly<{
  code: typeof AMBAR_DOCUMENTO_CAMBIADO
  color: 'AMBAR'
  requiresHumanConfirmation: true
  b4Preserved: true
  originalVersionPreserved: true
  /** A content-only change is never amber by itself; only number/total changes qualify. */
  reasons: readonly ('NUMBER_CHANGED' | 'AMOUNT_CHANGED')[]
}>

export type DocumentLifecyclePlan = Readonly<{
  assessment: ObservationAssessment
  action: 'CREATE_BASELINE' | 'CREATE_VERSION' | 'NO_MUTATION' | 'REQUIRES_REVIEW'
  nextVersionNumber: number | null
  idempotencyKey: string | null
  preservation: PreservationPlan
  incident: DocumentChangeIncident | null
  /** Allows OCR/history reread of new immutable content without changing B4. */
  contentReReadRecommended: boolean
  requiresHumanConfirmation: boolean
  /** This block deliberately has no mutation authority over B4. */
  financialAction: 'NONE'
  b4Mutation: 'FORBIDDEN'
}>

export type PositiveTombstoneEvidence = Readonly<{
  kind: 'GRAPH_DELTA_TOMBSTONE' | 'COMPLETE_INVENTORY_ABSENCE'
  /** Hash of a delta cursor or complete-inventory run; raw cursor never enters logs. */
  evidenceHash: string
}>

export type TombstoneObservation = Readonly<{
  identity: DocumentLifecycleIdentity
  signal: 'TOMBSTONE' | 'NOT_FOUND' | 'ACCESS_DENIED' | 'ERROR' | 'MISSING_FROM_PARTIAL_INVENTORY'
  inventoryComplete: boolean
  evidence: PositiveTombstoneEvidence | null
}>

export type TombstonePlan = Readonly<{
  action: 'RECORD_TOMBSTONE' | 'NO_MUTATION'
  reason: 'POSITIVE_EVIDENCE' | 'INSUFFICIENT_DELETION_EVIDENCE'
  idempotencyKey: string | null
  requiresHumanConfirmation: false
  financialAction: 'NONE'
  b4Mutation: 'FORBIDDEN'
}>

export type CreditLinkProposal = Readonly<{
  creditIdentity: DocumentLifecycleIdentity
  originalIdentity: DocumentLifecycleIdentity
  /** Private literal documentary reference. It is never normalized or logged. */
  exactReference: string
  /** Hash of exactReference guards private persistence and idempotency. */
  exactReferenceHash: string
}>

export type CreditLinkPlan = Readonly<{
  action: 'PROPOSE_CREDIT_LINK' | 'REQUIRES_REVIEW'
  idempotencyKey: string | null
  requiresHumanConfirmation: true
  financialAction: 'NONE'
  b4Mutation: 'FORBIDDEN'
}>

export type HashDuplicateProposal = Readonly<{
  leftSnapshotHash: string
  rightSnapshotHash: string
  contentSha256: string
}>

export type HashDuplicatePlan = Readonly<{
  action: 'RECORD_HASH_DUPLICATE' | 'NO_MUTATION'
  idempotencyKey: string | null
  requiresHumanConfirmation: true
  financialAction: 'NONE'
  b4Mutation: 'FORBIDDEN'
}>

function fail(code: string): never { throw new DocumentLifecycleError(code) }
function text(value: string | null | undefined, label: string, max: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || value.length < 1 || value.length > max || CONTROL.test(value)) {
    fail(`DOCUMENT_LIFECYCLE_${label}_INVALID`)
  }
  return value
}
function hash(value: string | null | undefined, label: string): string | null {
  const normalized = text(value, label, 128)
  if (normalized === null) return null
  if (!SHA256.test(normalized)) fail(`DOCUMENT_LIFECYCLE_${label}_INVALID`)
  return normalized.toLowerCase()
}
function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('DOCUMENT_LIFECYCLE_CANONICAL_NON_FINITE')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  fail('DOCUMENT_LIFECYCLE_CANONICAL_UNSUPPORTED')
}
function canonicalHash(value: unknown): string { return sha256(canonicalJson(value)) }
function same(left: string | null, right: string | null): boolean { return left !== null && right !== null && left === right }
function different(left: string | null, right: string | null): boolean { return left !== null && right !== null && left !== right }

function checkedIdentity(identity: DocumentLifecycleIdentity): DocumentLifecycleIdentity {
  const source = text(identity?.source, 'SOURCE', 64)
  const sourceItemKey = text(identity?.sourceItemKey, 'SOURCE_ITEM_KEY', 4096)
  if (!source || !sourceItemKey || /https?:\/\//i.test(sourceItemKey) || /[?&](?:sig|token|access_token)=/i.test(sourceItemKey)) fail('DOCUMENT_LIFECYCLE_IDENTITY_INVALID')
  return { source, sourceItemKey }
}

function checkedPrivateMetadata(input: DocumentPrivateMetadata | null | undefined): DocumentPrivateMetadata | null {
  if (input === null || input === undefined) return null
  const originalFileName = text(input.originalFileName, 'ORIGINAL_FILE_NAME', 1024)
  const documentNumber = text(input.documentNumber, 'DOCUMENT_NUMBER', 512)
  const documentDate = text(input.documentDate, 'DOCUMENT_DATE', 32)
  if (documentDate !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || Number.isNaN(Date.parse(`${documentDate}T00:00:00.000Z`)))) fail('DOCUMENT_LIFECYCLE_DOCUMENT_DATE_INVALID')
  const totalCents = input.totalCents
  if (totalCents !== null && totalCents !== undefined && (!Number.isSafeInteger(totalCents) || totalCents < -2_147_483_648 || totalCents > 2_147_483_647)) fail('DOCUMENT_LIFECYCLE_TOTAL_CENTS_INVALID')
  const invoiceFiscalIdentity = text(input.invoiceFiscalIdentity, 'INVOICE_FISCAL_IDENTITY', 256)
  const partyRole = input.partyRole === null || input.partyRole === undefined ? null : input.partyRole
  if (partyRole !== null && partyRole !== 'CLIENTE' && partyRole !== 'PROVEEDOR') fail('DOCUMENT_LIFECYCLE_PARTY_ROLE_INVALID')
  const documentClass = text(input.documentClass, 'DOCUMENT_CLASS', 64)
  const referencedOriginalReference = text(input.referencedOriginalReference, 'REFERENCED_ORIGINAL_REFERENCE', 512)
  const currencyCode = text(input.currencyCode, 'CURRENCY_CODE', 3)
  if (currencyCode !== null && !/^[A-Z]{3}$/.test(currencyCode)) fail('DOCUMENT_LIFECYCLE_CURRENCY_CODE_INVALID')
  const upstreamVersionRef = text(input.upstreamVersionRef, 'UPSTREAM_VERSION_REF', 1024)
  if (upstreamVersionRef && (/https?:\/\//i.test(upstreamVersionRef) || /(?:sig|token|access_token)=/i.test(upstreamVersionRef))) fail('DOCUMENT_LIFECYCLE_UPSTREAM_VERSION_REF_INVALID')
  return { originalFileName, documentNumber, documentDate, totalCents: totalCents ?? null, invoiceFiscalIdentity, partyRole, documentClass, referencedOriginalReference, currencyCode, upstreamVersionRef }
}

/** Normalizes metadata without serializing a raw locator, document number or cents amount. */
export function normalizeDocumentFingerprint(input: DocumentContentFingerprint): Required<DocumentContentFingerprint> {
  if (!input || typeof input !== 'object') fail('DOCUMENT_LIFECYCLE_FINGERPRINT_INVALID')
  const byteLength = input.byteLength === null || input.byteLength === undefined ? null : input.byteLength
  if (byteLength !== null && (!Number.isSafeInteger(byteLength) || byteLength < 0)) fail('DOCUMENT_LIFECYCLE_BYTE_LENGTH_INVALID')
  return {
    contentSha256: hash(input.contentSha256, 'CONTENT_SHA256'),
    byteLength,
    quickXorHash: text(input.quickXorHash, 'QUICK_XOR_HASH', 1024),
    cTag: text(input.cTag, 'CTAG', 1024),
    eTag: text(input.eTag, 'ETAG', 1024),
    graphVersion: text(input.graphVersion, 'GRAPH_VERSION', 1024),
    numberFingerprint: hash(input.numberFingerprint, 'NUMBER_FINGERPRINT'),
    amountFingerprint: hash(input.amountFingerprint, 'AMOUNT_FINGERPRINT'),
  }
}

/** Content-only SHA-256. The caller owns bytes and must not log them. */
export function fingerprintDocumentContent(bytes: Uint8Array): Readonly<{ contentSha256: string; byteLength: number }> {
  if (!(bytes instanceof Uint8Array)) fail('DOCUMENT_LIFECYCLE_BYTES_INVALID')
  return { contentSha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }
}

/** Hashes a private provider key so the lifecycle store never needs that raw key. */
export function privateSourceKeyHash(privateSourceKey: string): string {
  const key = text(privateSourceKey, 'PRIVATE_SOURCE_KEY', 4_096)
  if (!key) fail('DOCUMENT_LIFECYCLE_PRIVATE_SOURCE_KEY_INVALID')
  return sha256(key)
}

function checkedVersion(version: StoredDocumentVersion): StoredDocumentVersion {
  const identity = checkedIdentity(version?.identity)
  if (!Number.isSafeInteger(version?.versionNumber) || version.versionNumber < 1) fail('DOCUMENT_LIFECYCLE_VERSION_INVALID')
  const privateLocatorHandle = text(version.privateLocatorHandle, 'PRIVATE_LOCATOR', 512)
  return { identity, versionNumber: version.versionNumber, fingerprint: normalizeDocumentFingerprint(version.fingerprint), privateMetadata: checkedPrivateMetadata(version.privateMetadata), capturedAt: text(version.capturedAt, 'CAPTURED_AT', 64), privateLocatorHandle }
}

function matchingIdentity(left: DocumentLifecycleIdentity, right: DocumentLifecycleIdentity): boolean {
  return left.source === right.source && left.sourceItemKey === right.sourceItemKey
}

function privateStringChanged(left: string | null | undefined, right: string | null | undefined): boolean {
  return left !== null && left !== undefined && right !== null && right !== undefined && left !== right
}

function privateCentsChanged(left: number | null | undefined, right: number | null | undefined): boolean {
  return left !== null && left !== undefined && right !== null && right !== undefined && left !== right
}

/**
 * eTag only describes the DriveItem metadata revision and is never enough to
 * create a financial/document version. SHA-256, quickXorHash and cTag are
 * accepted in that order as content evidence.
 */
export function assessDocumentObservation(previousInput: StoredDocumentVersion | null, incomingInput: DocumentObservation): ObservationAssessment {
  const incoming = { identity: checkedIdentity(incomingInput?.identity), fingerprint: normalizeDocumentFingerprint(incomingInput?.fingerprint ?? {}) }
  if (!previousInput) return { kind: 'CREATE_BASELINE', evidence: 'NONE', reason: 'NO_PREVIOUS_VERSION' }
  const previous = checkedVersion(previousInput)
  if (!matchingIdentity(previous.identity, incoming.identity)) fail('DOCUMENT_LIFECYCLE_IDENTITY_MISMATCH')
  const before = previous.fingerprint
  const after = incoming.fingerprint
  if (before.contentSha256 && after.contentSha256) {
    return before.contentSha256 === after.contentSha256
      ? { kind: 'UNCHANGED', evidence: 'CONTENT_SHA256', reason: 'CONTENT_SHA256_EQUAL' }
      : { kind: 'NEW_VERSION', evidence: 'CONTENT_SHA256', reason: 'CONTENT_SHA256_CHANGED' }
  }
  if (before.quickXorHash && after.quickXorHash) {
    return before.quickXorHash === after.quickXorHash
      ? { kind: 'UNCHANGED', evidence: 'QUICK_XOR_HASH', reason: 'QUICK_XOR_HASH_EQUAL' }
      : { kind: 'NEW_VERSION', evidence: 'QUICK_XOR_HASH', reason: 'QUICK_XOR_HASH_CHANGED' }
  }
  if (before.cTag && after.cTag) {
    return before.cTag === after.cTag
      ? { kind: 'UNCHANGED', evidence: 'CTAG', reason: 'CTAG_EQUAL' }
      : { kind: 'NEW_VERSION', evidence: 'CTAG', reason: 'CTAG_CHANGED' }
  }
  if (different(before.eTag, after.eTag)) {
    return { kind: 'METADATA_ONLY', evidence: 'ETAG_ONLY', reason: 'ETAG_CHANGED_WITHOUT_CONTENT_EVIDENCE' }
  }
  return { kind: 'INSUFFICIENT_EVIDENCE', evidence: 'NONE', reason: 'CONTENT_EVIDENCE_UNAVAILABLE' }
}

function versionIdempotencyKey(previous: StoredDocumentVersion | null, observation: DocumentObservation, assessment: ObservationAssessment): string {
  return canonicalHash({
    schema: DOCUMENT_LIFECYCLE_SCHEMA_VERSION,
    kind: 'VERSION',
    previousVersion: previous?.versionNumber ?? 0,
    identity: checkedIdentity(observation.identity),
    fingerprint: normalizeDocumentFingerprint(observation.fingerprint),
    assessment: assessment.kind,
  })
}

function preservationFor(previous: StoredDocumentVersion | null, createsVersion: boolean): PreservationPlan {
  const available = Boolean(previous?.privateLocatorHandle)
  return {
    requiredBeforeReplacement: createsVersion && available,
    previousBytesKnownAvailable: available,
    doesNotPromiseHistoricalFile: true,
  }
}

/**
 * Plans storage only. It intentionally cannot accept an approval flag and always
 * forbids B4 mutation; the existing B4 confirmation remains intact for review.
 */
export function planDocumentLifecycle(
  previousInput: StoredDocumentVersion | null,
  incomingInput: DocumentObservation,
  reconciliation: ReconciliationProtection = { status: 'NONE' },
): DocumentLifecyclePlan {
  const previous = previousInput ? checkedVersion(previousInput) : null
  const incoming: DocumentObservation = {
    identity: checkedIdentity(incomingInput?.identity),
    fingerprint: normalizeDocumentFingerprint(incomingInput?.fingerprint ?? {}),
    privateMetadata: checkedPrivateMetadata(incomingInput?.privateMetadata),
    observedAt: incomingInput?.observedAt ?? null,
  }
  if (reconciliation.status !== 'NONE' && reconciliation.status !== 'PENDING' && reconciliation.status !== 'CONFIRMED') {
    fail('DOCUMENT_LIFECYCLE_RECONCILIATION_STATE_INVALID')
  }
  const assessment = assessDocumentObservation(previous, incoming)
  if (assessment.kind === 'CREATE_BASELINE') {
    const hasContentEvidence = Boolean(incoming.fingerprint.contentSha256 || incoming.fingerprint.quickXorHash || incoming.fingerprint.cTag)
    if (!hasContentEvidence) {
      return {
        assessment: { kind: 'INSUFFICIENT_EVIDENCE', evidence: 'NONE', reason: 'BASELINE_REQUIRES_CONTENT_EVIDENCE' },
        action: 'REQUIRES_REVIEW', nextVersionNumber: null, idempotencyKey: null, preservation: preservationFor(null, false), incident: null,
        requiresHumanConfirmation: true, contentReReadRecommended: false, financialAction: 'NONE', b4Mutation: 'FORBIDDEN',
      }
    }
    return {
      assessment, action: 'CREATE_BASELINE', nextVersionNumber: 1, idempotencyKey: versionIdempotencyKey(null, incoming, assessment),
      preservation: preservationFor(null, false), incident: null, requiresHumanConfirmation: false, contentReReadRecommended: true, financialAction: 'NONE', b4Mutation: 'FORBIDDEN',
    }
  }
  if (assessment.kind === 'NEW_VERSION') {
    const numberChanged = privateStringChanged(previous!.privateMetadata?.documentNumber, incoming.privateMetadata?.documentNumber)
      || different(previous!.fingerprint.numberFingerprint ?? null, incoming.fingerprint.numberFingerprint ?? null)
    const amountChanged = privateCentsChanged(previous!.privateMetadata?.totalCents, incoming.privateMetadata?.totalCents)
      || different(previous!.fingerprint.amountFingerprint ?? null, incoming.fingerprint.amountFingerprint ?? null)
    const protectedByB4 = reconciliation.status === 'CONFIRMED'
    const reasons: Array<'NUMBER_CHANGED' | 'AMOUNT_CHANGED'> = []
    if (numberChanged) reasons.push('NUMBER_CHANGED')
    if (amountChanged) reasons.push('AMOUNT_CHANGED')
    const incident: DocumentChangeIncident | null = protectedByB4 && reasons.length > 0
      ? { code: AMBAR_DOCUMENTO_CAMBIADO, color: 'AMBAR', requiresHumanConfirmation: true, b4Preserved: true, originalVersionPreserved: true, reasons }
      : null
    return {
      assessment, action: 'CREATE_VERSION', nextVersionNumber: previous!.versionNumber + 1,
      idempotencyKey: versionIdempotencyKey(previous, incoming, assessment), preservation: preservationFor(previous, true), incident,
      requiresHumanConfirmation: incident !== null, contentReReadRecommended: true, financialAction: 'NONE', b4Mutation: 'FORBIDDEN',
    }
  }
  return {
    assessment,
    action: assessment.kind === 'INSUFFICIENT_EVIDENCE' ? 'REQUIRES_REVIEW' : 'NO_MUTATION',
    nextVersionNumber: null, idempotencyKey: null, preservation: preservationFor(previous, false), incident: null,
    requiresHumanConfirmation: assessment.kind === 'INSUFFICIENT_EVIDENCE', contentReReadRecommended: false, financialAction: 'NONE', b4Mutation: 'FORBIDDEN',
  }
}

/** A deletion needs a Graph tombstone or a completed positive inventory absence; errors never qualify. */
export function planPositiveTombstone(observation: TombstoneObservation): TombstonePlan {
  const identity = checkedIdentity(observation?.identity)
  const evidence = observation?.evidence
  const positive = observation.signal === 'TOMBSTONE' && evidence !== null &&
    ((evidence.kind === 'GRAPH_DELTA_TOMBSTONE') || (evidence.kind === 'COMPLETE_INVENTORY_ABSENCE' && observation.inventoryComplete === true))
  if (!positive) {
    return { action: 'NO_MUTATION', reason: 'INSUFFICIENT_DELETION_EVIDENCE', idempotencyKey: null, requiresHumanConfirmation: false, financialAction: 'NONE', b4Mutation: 'FORBIDDEN' }
  }
  const evidenceHash = hash(evidence!.evidenceHash, 'TOMBSTONE_EVIDENCE_HASH')
  if (!evidenceHash) fail('DOCUMENT_LIFECYCLE_TOMBSTONE_EVIDENCE_HASH_INVALID')
  return {
    action: 'RECORD_TOMBSTONE', reason: 'POSITIVE_EVIDENCE',
    idempotencyKey: canonicalHash({ schema: DOCUMENT_LIFECYCLE_SCHEMA_VERSION, kind: 'TOMBSTONE', identity, evidence: { kind: evidence!.kind, evidenceHash } }),
    requiresHumanConfirmation: false, financialAction: 'NONE', b4Mutation: 'FORBIDDEN',
  }
}

/** A rectificativa link is documentary only and always waits for a human decision. */
export function planCreditLink(proposal: CreditLinkProposal): CreditLinkPlan {
  const credit = checkedIdentity(proposal?.creditIdentity)
  const original = checkedIdentity(proposal?.originalIdentity)
  const exactReference = text(proposal?.exactReference, 'CREDIT_REFERENCE', 512)
  const exactReferenceHash = hash(proposal?.exactReferenceHash, 'CREDIT_REFERENCE_HASH')
  if (!exactReference || !exactReferenceHash || sha256(exactReference) !== exactReferenceHash || matchingIdentity(credit, original)) {
    return { action: 'REQUIRES_REVIEW', idempotencyKey: null, requiresHumanConfirmation: true, financialAction: 'NONE', b4Mutation: 'FORBIDDEN' }
  }
  return {
    action: 'PROPOSE_CREDIT_LINK',
    idempotencyKey: canonicalHash({ schema: DOCUMENT_LIFECYCLE_SCHEMA_VERSION, kind: 'CREDIT_LINK', credit, original, exactReferenceHash }),
    requiresHumanConfirmation: true, financialAction: 'NONE', b4Mutation: 'FORBIDDEN',
  }
}

/** Duplicate hashes are observations for review, never an instruction to merge documents. */
export function planHashDuplicate(proposal: HashDuplicateProposal): HashDuplicatePlan {
  const left = hash(proposal?.leftSnapshotHash, 'LEFT_SNAPSHOT_HASH')
  const right = hash(proposal?.rightSnapshotHash, 'RIGHT_SNAPSHOT_HASH')
  const content = hash(proposal?.contentSha256, 'DUPLICATE_CONTENT_HASH')
  if (!left || !right || !content || left === right) {
    return { action: 'NO_MUTATION', idempotencyKey: null, requiresHumanConfirmation: true, financialAction: 'NONE', b4Mutation: 'FORBIDDEN' }
  }
  const [first, second] = [left, right].sort()
  return {
    action: 'RECORD_HASH_DUPLICATE',
    idempotencyKey: canonicalHash({ schema: DOCUMENT_LIFECYCLE_SCHEMA_VERSION, kind: 'HASH_DUPLICATE', first, second, content }),
    requiresHumanConfirmation: true, financialAction: 'NONE', b4Mutation: 'FORBIDDEN',
  }
}
