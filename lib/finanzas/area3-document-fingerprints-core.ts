import { createHash } from 'node:crypto'

/**
 * Area 3 records metadata about bytes that were already read from an authorized
 * existing source. It never opens a URL/path or treats filenames, suppliers,
 * invoice numbers, amounts, eTags/cTags or item IDs as content identity.
 */
export const AREA3_RECEIVED_DOCUMENT_FINGERPRINT_SCHEMA = 'AREA3_RECEIVED_DOCUMENT_FINGERPRINT_V1' as const
/** Exact private hand-off schema from the separately authorized preview reader. */
export const AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA = 'AREA3_EXISTING_DOCUMENT_BYTES_V1' as const
export const AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN = 'AREA3_PREVIEW_EXISTING_FILE_V1' as const
export const AREA3_STAGING_DATABASE = 'io_staging_finanzas' as const
export const AREA3_MAX_DOCUMENT_BYTES = 20 * 1024 * 1024

export type Area3FingerprintSourceKind = 'LOCAL_VERIFIED_MANIFEST' | 'PREVIEW_EXISTING_FILE_MANIFEST'
export type Area3ReadStatus = 'HASHED' | 'UNREADABLE'

export type Area3FingerprintSource = Readonly<{
  kind: Area3FingerprintSourceKind
  /** Controlled label only; never a browser URL, path, filename, eTag or number. */
  observationRef: string
  /** Exact stored item key; private traceability metadata, never content identity or UI output. */
  sourceItemId: string
  /** Stored drive key when known; private traceability metadata, never UI output. */
  sourceDriveId: string | null
  /** Provider/source observation time supplied by the delegated reader. */
  sourceUpdatedAt: string | null
  /** Time the authorized reader completed its byte observation. */
  sourceReadAt: string
  /** Deterministic trace of the exact stored source/version observation, not content identity. */
  sourceVersionFingerprint: string
}>

export type Area3ByteFingerprint = Readonly<{
  contentSha256: string
  byteLength: number
}>

export type Area3ReceivedDocumentHashObservation = Readonly<{
  schema: typeof AREA3_RECEIVED_DOCUMENT_FINGERPRINT_SCHEMA
  facturaRecibidaId: string
  fingerprint: Area3ByteFingerprint
  source: Area3FingerprintSource
  /** Idempotence covers invoice, actual byte hash and controlled source observation. */
  idempotencyKey: string
}>

/**
 * Private hand-off from the delegated reader. The reader calculated sha256 from
 * in-memory response bytes. No entry carries bytes, URL, filename, supplier,
 * invoice number, eTag or cTag.
 */
export type Area3ExistingDocumentBytesManifestEntry = Readonly<{
  invoiceId: string
  sourceItemId: string
  sourceDriveId: string | null
  sourceUpdatedAt: string
  readOrigin: typeof AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN
  readAt: string
  status: Area3ReadStatus
  sha256?: string
  byteLength?: number
  reason?: string
}>

export type Area3ExistingDocumentBytesManifest = Readonly<{
  schema: typeof AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA
  database: typeof AREA3_STAGING_DATABASE
  complete: true
  entries: readonly Area3ExistingDocumentBytesManifestEntry[]
}>

export type Area3ManifestCoverage = Readonly<{
  total: number
  readable: number
  hashed: number
  unreadable: number
  errors: number
  blocked: number
}>

export type Area3StagingRuntimeInput = Readonly<{
  stagingSandbox?: string
  vercelEnvironment?: string
  databaseUrl?: string
  easyProductionEnabled?: string
  modelProductionEnabled?: string
  conciliarProductionEnabled?: string
  publicConciliarProductionEnabled?: string
}>

export class Area3DocumentFingerprintError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'Area3DocumentFingerprintError'
  }
}

const SHA256 = /^[a-f0-9]{64}$/
const CONTROL = /[\u0000-\u001f\u007f]/

function fail(code: string): never { throw new Area3DocumentFingerprintError(code) }

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') fail('AREA3_STABLE_VALUE_INVALID')
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
}

function cleanText(value: unknown, max: number, code: string): string {
  if (typeof value !== 'string') fail(code)
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > max || CONTROL.test(normalized)) fail(code)
  return normalized
}

function sha256Text(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }

function isoInstant(value: unknown, code: string): string {
  const normalized = cleanText(value, 64, code)
  const time = Date.parse(normalized)
  if (!Number.isFinite(time) || !/^\d{4}-\d{2}-\d{2}T/.test(normalized)) fail(code)
  return new Date(time).toISOString()
}

function optionalIsoInstant(value: unknown, code: string): string | null {
  return value === null || value === undefined ? null : isoInstant(value, code)
}

/**
 * `sourceReadAt` is preserved on the append-only observation for audit, but a
 * repeat read of unchanged bytes and source version must replay the same row.
 * The source-version fingerprint already binds the exact controlled locator and
 * its observed version; it is therefore the locator/version input to the key.
 */
function area3ObservationIdempotencyKey(input: Readonly<{
  facturaRecibidaId: string
  fingerprint: Area3ByteFingerprint
  source: Pick<Area3FingerprintSource, 'kind' | 'sourceVersionFingerprint'>
}>): string {
  return sha256Text(stableJson({
    schema: AREA3_RECEIVED_DOCUMENT_FINGERPRINT_SCHEMA,
    facturaRecibidaId: input.facturaRecibidaId,
    contentSha256: input.fingerprint.contentSha256,
    byteLength: input.fingerprint.byteLength,
    sourceKind: input.source.kind,
    sourceVersionFingerprint: input.source.sourceVersionFingerprint,
  }))
}

function validSourceKind(value: unknown): value is Area3FingerprintSourceKind {
  return value === 'LOCAL_VERIFIED_MANIFEST' || value === 'PREVIEW_EXISTING_FILE_MANIFEST'
}

export function isArea3Sha256(value: unknown): value is string { return typeof value === 'string' && SHA256.test(value) }

/**
 * Area 3 is staging-only. This pure guard rejects production before opening a
 * connection and pins the known staging database identity, including host/port.
 */
export function area3StagingRuntimeAllowed(input: Area3StagingRuntimeInput): boolean {
  if (input.stagingSandbox !== '1' || input.vercelEnvironment === 'production') return false
  if ([input.easyProductionEnabled, input.modelProductionEnabled, input.conciliarProductionEnabled, input.publicConciliarProductionEnabled].some(value => value === '1')) return false
  let url: URL
  try { url = new URL(input.databaseUrl ?? '') } catch { return false }
  return ['postgres:', 'postgresql:'].includes(url.protocol)
    && url.hostname === 'yamanote.proxy.rlwy.net'
    && url.port === '34880'
    && decodeURIComponent(url.username) === 'io_staging_finanzas'
    && url.pathname === '/io_staging_finanzas'
}

/** SHA-256 is calculated from supplied bytes, never source metadata. */
export function fingerprintArea3DocumentBytes(bytes: Uint8Array): Area3ByteFingerprint {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > AREA3_MAX_DOCUMENT_BYTES) fail('AREA3_DOCUMENT_BYTES_OUT_OF_RANGE')
  return { contentSha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength }
}

/**
 * Hashes an exact source/version observation without retaining a private locator.
 * `contentSha256` remains the sole content identity and comes only from bytes.
 */
export function area3SourceVersionFingerprint(input: Readonly<{
  kind: Area3FingerprintSourceKind
  facturaRecibidaId: string
  exactSourceId: string
  observationVersion?: string | null
}>): string {
  const facturaRecibidaId = cleanText(input.facturaRecibidaId, 128, 'AREA3_FACTURA_ID_INVALID')
  const exactSourceId = cleanText(input.exactSourceId, 1024, 'AREA3_SOURCE_ID_INVALID')
  const observationVersion = input.observationVersion === null || input.observationVersion === undefined
    ? null : cleanText(input.observationVersion, 1024, 'AREA3_SOURCE_VERSION_INVALID')
  if (!validSourceKind(input.kind)) fail('AREA3_SOURCE_KIND_INVALID')
  return sha256Text(stableJson({ schema: AREA3_RECEIVED_DOCUMENT_FINGERPRINT_SCHEMA, kind: input.kind, facturaRecibidaId, exactSourceId, observationVersion }))
}

/** Builds one append-only metadata observation from bytes still resident in memory. */
export function createArea3ReceivedDocumentHashObservation(input: Readonly<{
  facturaRecibidaId: string
  bytes: Uint8Array
  source: Area3FingerprintSource
}>): Area3ReceivedDocumentHashObservation {
  const facturaRecibidaId = cleanText(input.facturaRecibidaId, 128, 'AREA3_FACTURA_ID_INVALID')
  const observationRef = cleanText(input.source?.observationRef, 128, 'AREA3_SOURCE_OBSERVATION_INVALID')
  const sourceItemId = cleanText(input.source?.sourceItemId, 220, 'AREA3_SOURCE_ITEM_ID_INVALID')
  const sourceDriveId = input.source?.sourceDriveId === null || input.source?.sourceDriveId === undefined ? null : cleanText(input.source.sourceDriveId, 220, 'AREA3_SOURCE_DRIVE_ID_INVALID')
  const sourceUpdatedAt = optionalIsoInstant(input.source?.sourceUpdatedAt, 'AREA3_SOURCE_UPDATED_AT_INVALID')
  const sourceReadAt = isoInstant(input.source?.sourceReadAt, 'AREA3_SOURCE_READ_AT_INVALID')
  const sourceVersionFingerprint = cleanText(input.source?.sourceVersionFingerprint, 64, 'AREA3_SOURCE_VERSION_INVALID').toLowerCase()
  if (!SHA256.test(sourceVersionFingerprint) || !validSourceKind(input.source?.kind)) fail('AREA3_SOURCE_INVALID')
  const fingerprint = fingerprintArea3DocumentBytes(input.bytes)
  const source: Area3FingerprintSource = { kind: input.source.kind, observationRef, sourceItemId, sourceDriveId, sourceUpdatedAt, sourceReadAt, sourceVersionFingerprint }
  const idempotencyKey = area3ObservationIdempotencyKey({ facturaRecibidaId, fingerprint, source })
  return { schema: AREA3_RECEIVED_DOCUMENT_FINGERPRINT_SCHEMA, facturaRecibidaId, fingerprint, source, idempotencyKey }
}

/**
 * Injectable local-manifest adapter. The caller owns verified local file access;
 * this function opens no files and cannot fabricate a match from a manifest name.
 */
export async function fingerprintArea3VerifiedManifestEntry(input: Readonly<{
  facturaRecibidaId: string
  manifestEntryId: string
  manifestVersion?: string | null
  readVerifiedBytes: () => Promise<Uint8Array>
}>): Promise<Area3ReceivedDocumentHashObservation> {
  if (typeof input.readVerifiedBytes !== 'function') fail('AREA3_MANIFEST_READER_INVALID')
  const sourceVersionFingerprint = area3SourceVersionFingerprint({ kind: 'LOCAL_VERIFIED_MANIFEST', facturaRecibidaId: input.facturaRecibidaId, exactSourceId: input.manifestEntryId, observationVersion: input.manifestVersion })
  return createArea3ReceivedDocumentHashObservation({
    facturaRecibidaId: input.facturaRecibidaId, bytes: await input.readVerifiedBytes(),
    source: { kind: 'LOCAL_VERIFIED_MANIFEST', observationRef: 'VERIFIED_LOCAL_MANIFEST', sourceItemId: input.manifestEntryId, sourceDriveId: null, sourceUpdatedAt: null, sourceReadAt: new Date().toISOString(), sourceVersionFingerprint },
  })
}

/** Strict parser for the exact no-bytes manifest supplied by the delegated reader. */
export function parseArea3ExistingDocumentBytesManifest(value: unknown): Area3ExistingDocumentBytesManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('AREA3_MANIFEST_INVALID')
  const root = value as Record<string, unknown>
  if (root.schema !== AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA || root.database !== AREA3_STAGING_DATABASE || root.complete !== true || !Array.isArray(root.entries) || root.entries.length > 10_000) fail('AREA3_MANIFEST_INVALID')
  const invoices = new Set<string>()
  const entries = root.entries.map((raw): Area3ExistingDocumentBytesManifestEntry => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('AREA3_MANIFEST_ENTRY_INVALID')
    const entry = raw as Record<string, unknown>
    const invoiceId = cleanText(entry.invoiceId, 128, 'AREA3_MANIFEST_INVOICE_ID_INVALID')
    const sourceItemId = cleanText(entry.sourceItemId, 220, 'AREA3_MANIFEST_ITEM_ID_INVALID')
    const sourceDriveId = entry.sourceDriveId === null ? null : cleanText(entry.sourceDriveId, 220, 'AREA3_MANIFEST_DRIVE_ID_INVALID')
    const sourceUpdatedAt = isoInstant(entry.sourceUpdatedAt, 'AREA3_MANIFEST_SOURCE_UPDATED_AT_INVALID')
    if (entry.readOrigin !== AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN) fail('AREA3_MANIFEST_ORIGIN_INVALID')
    const readAt = isoInstant(entry.readAt, 'AREA3_MANIFEST_READ_AT_INVALID')
    const status = entry.status
    if (status !== 'HASHED' && status !== 'UNREADABLE') fail('AREA3_MANIFEST_STATUS_INVALID')
    const sha256 = entry.sha256 === undefined ? undefined : cleanText(entry.sha256, 64, 'AREA3_MANIFEST_SHA256_INVALID').toLowerCase()
    const byteLength = typeof entry.byteLength === 'number' ? entry.byteLength : undefined
    const reason = entry.reason === undefined ? undefined : cleanText(entry.reason, 160, 'AREA3_MANIFEST_REASON_INVALID')
    if (status === 'HASHED') {
      if (!sha256 || !SHA256.test(sha256) || byteLength === undefined || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > AREA3_MAX_DOCUMENT_BYTES || reason !== undefined) fail('AREA3_MANIFEST_HASHED_INVALID')
    } else if (sha256 !== undefined || entry.byteLength !== undefined || !reason) {
      fail('AREA3_MANIFEST_UNREADABLE_INVALID')
    }
    if (invoices.has(invoiceId)) fail('AREA3_MANIFEST_INVOICE_DUPLICATE')
    invoices.add(invoiceId)
    return status === 'HASHED'
      ? { invoiceId, sourceItemId, sourceDriveId, sourceUpdatedAt, readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN, readAt, status, sha256, byteLength }
      : { invoiceId, sourceItemId, sourceDriveId, sourceUpdatedAt, readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN, readAt, status, reason: reason! }
  })
  return { schema: AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA, database: AREA3_STAGING_DATABASE, complete: true, entries }
}

/** No unreadable entry becomes a false duplicate candidate or a persisted hash. */
export function area3ManifestCoverage(manifest: Area3ExistingDocumentBytesManifest): Area3ManifestCoverage {
  const hashed = manifest.entries.filter(entry => entry.status === 'HASHED').length
  const unreadableEntries = manifest.entries.filter(entry => entry.status === 'UNREADABLE')
  // The delegated reader must label intentionally unavailable sources BLOCKED_*.
  // Any other unreadable reason remains an error, never a fabricated hash/match.
  const blocked = unreadableEntries.filter(entry => entry.reason?.startsWith('BLOCKED_')).length
  const errors = unreadableEntries.length - blocked
  return { total: manifest.entries.length, readable: hashed, hashed, unreadable: unreadableEntries.length, errors, blocked }
}

/**
 * Converts a validated delegated HASHED result to an append-only observation.
 * The delegated preview reader is the trust boundary that held real bytes.
 */
export function createArea3ObservationFromExistingDocumentBytesEntry(entry: Area3ExistingDocumentBytesManifestEntry): Area3ReceivedDocumentHashObservation | null {
  if (entry.status !== 'HASHED') return null
  // Item IDs are only unique within a drive. Hash the canonical private tuple so
  // a changed drive cannot replay/conflict with the prior source version.
  const exactSourceId = stableJson({ sourceDriveId: entry.sourceDriveId, sourceItemId: entry.sourceItemId })
  const sourceVersionFingerprint = area3SourceVersionFingerprint({ kind: 'PREVIEW_EXISTING_FILE_MANIFEST', facturaRecibidaId: entry.invoiceId, exactSourceId, observationVersion: entry.sourceUpdatedAt })
  const source: Area3FingerprintSource = {
    kind: 'PREVIEW_EXISTING_FILE_MANIFEST', observationRef: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN,
    sourceItemId: entry.sourceItemId, sourceDriveId: entry.sourceDriveId, sourceUpdatedAt: entry.sourceUpdatedAt, sourceReadAt: entry.readAt, sourceVersionFingerprint,
  }
  const fingerprint: Area3ByteFingerprint = { contentSha256: entry.sha256!, byteLength: entry.byteLength! }
  const idempotencyKey = area3ObservationIdempotencyKey({ facturaRecibidaId: entry.invoiceId, fingerprint, source })
  return { schema: AREA3_RECEIVED_DOCUMENT_FINGERPRINT_SCHEMA, facturaRecibidaId: entry.invoiceId, fingerprint, source, idempotencyKey }
}
