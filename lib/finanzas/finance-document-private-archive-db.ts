/*
 * Archivo privado PostgreSQL para bytes originales de versiones documentales.
 *
 * No abre conexiones, no llama a Graph/OCR/e-mail, no usa filesystem/Blob ni
 * registra bytes. Sólo funciona sobre una transacción del llamador y sus dos
 * callbacks de autorización. No toca B4, movimientos, facturas ni cobros.
 */
import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import type {
  ArchivedOriginalFormat,
  LifecycleActor,
  PreparedPrivateArtifact,
  PrivateBytePreservation,
  PrivateDocumentArchivePort,
} from './finance-document-lifecycle-adapter'
import type { StoredDocumentVersion } from './finance-document-lifecycle-core'

export const DOCUMENT_PRIVATE_ARCHIVE_DB_SCHEMA = 'DOCUMENT_PRIVATE_ARCHIVE_DB_V1' as const
export const MAX_PRIVATE_DOCUMENT_ARCHIVE_BYTES = 20 * 1024 * 1024

/** The minimal raw-SQL transaction surface; the caller keeps transaction ownership. */
export type PrivateDocumentArchivePrismaTx = Pick<Prisma.TransactionClient, '$queryRaw'>
export type AssertEffectiveFinanceWriteAccess<Tx = PrivateDocumentArchivePrismaTx> = (tx: Tx, actorId: number) => Promise<boolean>

/**
 * This must be bound by the server route/job to its already-authenticated context.
 * It is deliberately required for every byte read, before the archive is queried.
 */
export type AuthorizePrivateDocumentArchiveRead<Tx = PrivateDocumentArchivePrismaTx> = (
  tx: Tx,
  request: Readonly<{ lifecycleId: string; versionNumber: number; contentSha256: string }>,
) => Promise<boolean>

export type PrivateDocumentArchiveReadRequest = Readonly<{
  lifecycleId: string
  versionNumber: number
  contentSha256: string
}>

export type PostgresPrivateDocumentArchiveConfig<Tx = PrivateDocumentArchivePrismaTx> = Readonly<{
  /** Bound per server request/job; never supplied by an untrusted client. */
  actor: LifecycleActor
  assertEffectiveFinanceWriteAccess: AssertEffectiveFinanceWriteAccess<Tx>
  authorizeServerRead: AuthorizePrivateDocumentArchiveRead<Tx>
}>

type ArtifactRow = Readonly<{
  id: string
  sha256: string
  byteLength: number | bigint
  format: string
  contentBytes: Uint8Array
  createdAt: Date
}>

type VersionArtifactRow = Readonly<{
  snapshotSha256: string | null
  snapshotByteLength: number | bigint | null
  artifactState: string
  privateStorageHandle: string | null
  artifactId: string | null
  sha256: string | null
  byteLength: number | bigint | null
  format: string | null
  contentBytes: Uint8Array | null
  capturedAt: Date
}>

export class PrivateDocumentArchiveDbError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'PrivateDocumentArchiveDbError'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/
const FORMATS: ReadonlySet<string> = new Set(['PDF', 'XLS', 'XLSX'])

function fail(code: string): never { throw new PrivateDocumentArchiveDbError(code) }
function checkedUuid(value: string, code: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code)
  return value.toLowerCase()
}
function checkedHash(value: string, code: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code)
  return value
}
function checkedVersionNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) fail('DOCUMENT_PRIVATE_ARCHIVE_VERSION_INVALID')
  return value
}
function checkedActor(actor: LifecycleActor): number {
  if (!Number.isSafeInteger(actor?.actorId) || actor.actorId === null || actor.actorId < 1) {
    fail('DOCUMENT_PRIVATE_ARCHIVE_ACTOR_REQUIRED')
  }
  return actor.actorId
}
function isUrlOrToken(value: string): boolean {
  return /https?:\/\//i.test(value) || /(?:sig|token|access_token)=/i.test(value)
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
function archiveMetadataChecksum(format: ArchivedOriginalFormat, byteLength: number, contentSha256: string): string {
  return createHash('sha256').update(JSON.stringify({
    schema: 'DOCUMENT_LIFECYCLE_ARCHIVE_V1',
    format,
    byteLength,
    contentSha256,
  })).digest('hex')
}
function expectedSignature(format: ArchivedOriginalFormat, bytes: Uint8Array): boolean {
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value)
  return format === 'PDF' ? starts(0x25, 0x50, 0x44, 0x46, 0x2d)
    : format === 'XLS' ? starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)
      : format === 'XLSX' ? starts(0x50, 0x4b, 0x03, 0x04) : false
}
function asSafeLength(value: number | bigint, code: string): number {
  const numberValue = Number(value)
  if (!Number.isSafeInteger(numberValue) || numberValue < 1 || numberValue > MAX_PRIVATE_DOCUMENT_ARCHIVE_BYTES) fail(code)
  return numberValue
}
function asBytes(value: Uint8Array | null, code: string): Uint8Array {
  if (!(value instanceof Uint8Array)) fail(code)
  return new Uint8Array(value)
}

/** Stable internal operation key; it is never a URL, a provider locator or document data. */
export function privateDocumentArtifactOperationKey(input: Readonly<{
  lifecycleId: string
  versionNumber: number
  contentSha256: string
}>): string {
  const lifecycleId = checkedUuid(input?.lifecycleId, 'DOCUMENT_PRIVATE_ARCHIVE_LIFECYCLE_ID_INVALID')
  const versionNumber = checkedVersionNumber(input?.versionNumber)
  const contentSha256 = checkedHash(input?.contentSha256, 'DOCUMENT_PRIVATE_ARCHIVE_CONTENT_HASH_INVALID')
  return createHash('sha256').update(JSON.stringify({
    schema: DOCUMENT_PRIVATE_ARCHIVE_DB_SCHEMA,
    kind: 'ARTIFACT',
    lifecycleId,
    versionNumber,
    contentSha256,
  })).digest('hex')
}

/**
 * A UUID is deterministically derived from the operation key, making the returned
 * private handle stable on replays without sharing a mutable object or a URL.
 */
export function privateDocumentArtifactHandle(input: Readonly<{
  lifecycleId: string
  versionNumber: number
  contentSha256: string
}>): string {
  const operationKey = privateDocumentArtifactOperationKey(input)
  const hex = operationKey.split('')
  hex[12] = '5'
  hex[16] = String(8 + (Number.parseInt(hex[16], 16) & 0x03))
  const uuid = hex.join('')
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20, 32)}`
}

function checkedPreparedArtifact(artifact: PreparedPrivateArtifact): Readonly<{
  format: ArchivedOriginalFormat
  bytes: Uint8Array
  byteLength: number
  contentSha256: string
}> {
  if (!artifact || !FORMATS.has(artifact.format)) fail('DOCUMENT_PRIVATE_ARCHIVE_FORMAT_INVALID')
  const bytes = asBytes(artifact.bytes, 'DOCUMENT_PRIVATE_ARCHIVE_BYTES_INVALID')
  const byteLength = asSafeLength(artifact.byteLength, 'DOCUMENT_PRIVATE_ARCHIVE_SIZE_INVALID')
  const contentSha256 = checkedHash(artifact.contentSha256, 'DOCUMENT_PRIVATE_ARCHIVE_CONTENT_HASH_INVALID')
  const metadataChecksum = checkedHash(artifact.metadataChecksum, 'DOCUMENT_PRIVATE_ARCHIVE_METADATA_CHECKSUM_INVALID')
  if (bytes.byteLength !== byteLength || sha256(bytes) !== contentSha256) fail('DOCUMENT_PRIVATE_ARCHIVE_CONTENT_HASH_MISMATCH')
  if (!expectedSignature(artifact.format, bytes)) fail('DOCUMENT_PRIVATE_ARCHIVE_FORMAT_OR_SIGNATURE_INVALID')
  if (archiveMetadataChecksum(artifact.format, byteLength, contentSha256) !== metadataChecksum) {
    fail('DOCUMENT_PRIVATE_ARCHIVE_METADATA_CHECKSUM_MISMATCH')
  }
  return { format: artifact.format, bytes, byteLength, contentSha256 }
}

function verifyArtifactRow(row: ArtifactRow, expected: Readonly<{ id: string; contentSha256: string }> | null = null): void {
  const id = checkedUuid(row?.id, 'DOCUMENT_PRIVATE_ARCHIVE_ROW_ID_INVALID')
  const contentSha256 = checkedHash(row?.sha256, 'DOCUMENT_PRIVATE_ARCHIVE_ROW_HASH_INVALID')
  const byteLength = asSafeLength(row?.byteLength, 'DOCUMENT_PRIVATE_ARCHIVE_ROW_SIZE_INVALID')
  if (!FORMATS.has(row?.format) || !expectedSignature(row.format as ArchivedOriginalFormat, asBytes(row?.contentBytes, 'DOCUMENT_PRIVATE_ARCHIVE_ROW_BYTES_INVALID'))) {
    fail('DOCUMENT_PRIVATE_ARCHIVE_ROW_FORMAT_OR_SIGNATURE_INVALID')
  }
  const bytes = asBytes(row.contentBytes, 'DOCUMENT_PRIVATE_ARCHIVE_ROW_BYTES_INVALID')
  if (bytes.byteLength !== byteLength || sha256(bytes) !== contentSha256) fail('DOCUMENT_PRIVATE_ARCHIVE_ROW_HASH_MISMATCH')
  if (expected && (id !== expected.id || contentSha256 !== expected.contentSha256)) fail('DOCUMENT_PRIVATE_ARCHIVE_REPLAY_CONFLICT')
}

async function requireWrite<Tx>(tx: Tx, config: Pick<PostgresPrivateDocumentArchiveConfig<Tx>, 'actor' | 'assertEffectiveFinanceWriteAccess'>): Promise<number> {
  const actorId = checkedActor(config.actor)
  if (!await config.assertEffectiveFinanceWriteAccess(tx, actorId)) fail('DOCUMENT_PRIVATE_ARCHIVE_ACCESS_DENIED')
  return actorId
}

async function readArtifactByHandleTx<Tx extends PrivateDocumentArchivePrismaTx>(tx: Tx, handle: string): Promise<ArtifactRow | null> {
  const rows = await tx.$queryRaw<ArtifactRow[]>(Prisma.sql`
    SELECT id::text AS "id",sha256 AS "sha256",byte_length AS "byteLength",format::text AS "format",content_bytes AS "contentBytes",created_at AS "createdAt"
    FROM document_version_artifacts
    WHERE id=CAST(${handle} AS uuid)
    LIMIT 2
  `)
  if (rows.length > 1) fail('DOCUMENT_PRIVATE_ARCHIVE_ROW_AMBIGUOUS')
  return rows[0] ?? null
}

/**
 * Concrete implementation of PrivateDocumentArchivePort. Writes require effective
 * finance access. Reads require the separately bound authorized server callback.
 */
export function createPostgresPrivateDocumentArchive<Tx extends PrivateDocumentArchivePrismaTx>(
  config: PostgresPrivateDocumentArchiveConfig<Tx>,
): PrivateDocumentArchivePort<Tx> {
  return {
    async archiveIncomingImmutable(tx, input) {
      const actorId = await requireWrite(tx, config)
      const lifecycleId = checkedUuid(input?.lifecycleId, 'DOCUMENT_PRIVATE_ARCHIVE_LIFECYCLE_ID_INVALID')
      const versionNumber = checkedVersionNumber(input?.versionNumber)
      if (input?.upstreamVersionRef !== null && input?.upstreamVersionRef !== undefined && isUrlOrToken(input.upstreamVersionRef)) {
        fail('DOCUMENT_PRIVATE_ARCHIVE_UPSTREAM_URL_FORBIDDEN')
      }
      const artifact = checkedPreparedArtifact(input?.artifact)
      const handle = privateDocumentArtifactHandle({ lifecycleId, versionNumber, contentSha256: artifact.contentSha256 })

      const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO document_version_artifacts
          (id,sha256,byte_length,format,content_bytes,created_by_id,created_at)
        VALUES
          (CAST(${handle} AS uuid),${artifact.contentSha256},${artifact.byteLength},${artifact.format}::"DocumentVersionOriginalFormat",${Buffer.from(artifact.bytes)},${actorId},CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO NOTHING
        RETURNING id::text AS "id"
      `)
      if (inserted.length > 1) fail('DOCUMENT_PRIVATE_ARCHIVE_INSERT_AMBIGUOUS')
      if (!inserted.length) {
        const existing = await readArtifactByHandleTx(tx, handle)
        if (!existing) fail('DOCUMENT_PRIVATE_ARCHIVE_REPLAY_MISSING')
        verifyArtifactRow(existing, { id: handle, contentSha256: artifact.contentSha256 })
      }
      return { privateStorageHandle: handle }
    },

    async readImmutableVersion(tx, input) {
      const lifecycleId = checkedUuid(input?.lifecycleId, 'DOCUMENT_PRIVATE_ARCHIVE_LIFECYCLE_ID_INVALID')
      const versionNumber = checkedVersionNumber(input?.versionNumber)
      const contentSha256 = checkedHash(input?.contentSha256, 'DOCUMENT_PRIVATE_ARCHIVE_CONTENT_HASH_INVALID')
      const request: PrivateDocumentArchiveReadRequest = { lifecycleId, versionNumber, contentSha256 }
      if (!await config.authorizeServerRead(tx, request)) fail('DOCUMENT_PRIVATE_ARCHIVE_READ_DENIED')

      const rows = await tx.$queryRaw<VersionArtifactRow[]>(Prisma.sql`
        SELECT s.content_sha256 AS "snapshotSha256",s.byte_length AS "snapshotByteLength",s.artifact_state::text AS "artifactState",s.private_storage_handle::text AS "privateStorageHandle",
          a.id::text AS "artifactId",a.sha256 AS "sha256",a.byte_length AS "byteLength",a.format::text AS "format",a.content_bytes AS "contentBytes",s.captured_at AS "capturedAt"
        FROM document_version_snapshots s
        LEFT JOIN document_version_artifacts a ON a.id=s.private_storage_handle
        WHERE s.lifecycle_id=CAST(${lifecycleId} AS uuid) AND s.version_number=${versionNumber}
        LIMIT 2
      `)
      if (rows.length > 1) fail('DOCUMENT_PRIVATE_ARCHIVE_VERSION_AMBIGUOUS')
      const row = rows[0]
      if (!row) return null
      if (row.snapshotSha256 !== contentSha256 || row.artifactState !== 'CAPTURED') fail('DOCUMENT_PRIVATE_ARCHIVE_SNAPSHOT_INTEGRITY_INVALID')
      const handle = checkedUuid(row.privateStorageHandle ?? '', 'DOCUMENT_PRIVATE_ARCHIVE_SNAPSHOT_HANDLE_INVALID')
      const artifactId = checkedUuid(row.artifactId ?? '', 'DOCUMENT_PRIVATE_ARCHIVE_ARTIFACT_MISSING')
      const snapshotLength = asSafeLength(row.snapshotByteLength ?? 0, 'DOCUMENT_PRIVATE_ARCHIVE_SNAPSHOT_SIZE_INVALID')
      if (handle !== artifactId) fail('DOCUMENT_PRIVATE_ARCHIVE_SNAPSHOT_HANDLE_MISMATCH')
      const contentBytes = asBytes(row.contentBytes, 'DOCUMENT_PRIVATE_ARCHIVE_ROW_BYTES_INVALID')
      const artifact: ArtifactRow = {
        id: artifactId,
        sha256: row.sha256 ?? '',
        byteLength: row.byteLength ?? 0,
        format: row.format ?? '',
        contentBytes,
        createdAt: row.capturedAt,
      }
      verifyArtifactRow(artifact, { id: handle, contentSha256 })
      if (asSafeLength(artifact.byteLength, 'DOCUMENT_PRIVATE_ARCHIVE_ROW_SIZE_INVALID') !== snapshotLength) {
        fail('DOCUMENT_PRIVATE_ARCHIVE_SNAPSHOT_SIZE_MISMATCH')
      }
      if (!(row.capturedAt instanceof Date) || Number.isNaN(row.capturedAt.getTime())) fail('DOCUMENT_PRIVATE_ARCHIVE_CAPTURED_AT_INVALID')
      return { bytes: new Uint8Array(contentBytes), capturedAt: row.capturedAt }
    },
  }
}

/**
 * Certifies whether a predecessor's original bytes really remain available.
 * It never writes/copies the predecessor and never reports PRESERVED for an
 * absent handle, absent hash or failed integrity check.
 */
export async function preservePrivateArchiveBytesBeforeReplacementTx<Tx extends PrivateDocumentArchivePrismaTx>(
  tx: Tx,
  input: Readonly<{
    current: StoredDocumentVersion
    actor: LifecycleActor
    assertEffectiveFinanceWriteAccess: AssertEffectiveFinanceWriteAccess<Tx>
  }>,
): Promise<PrivateBytePreservation> {
  const actorId = checkedActor(input?.actor)
  if (!await input.assertEffectiveFinanceWriteAccess(tx, actorId)) fail('DOCUMENT_PRIVATE_ARCHIVE_ACCESS_DENIED')
  const handle = input.current?.privateLocatorHandle
  const contentSha256 = input.current?.fingerprint?.contentSha256
  if (!handle || !contentSha256) return 'NOT_AVAILABLE'
  const checkedHandle = checkedUuid(handle, 'DOCUMENT_PRIVATE_ARCHIVE_HANDLE_INVALID')
  const checkedContentSha256 = checkedHash(contentSha256, 'DOCUMENT_PRIVATE_ARCHIVE_CONTENT_HASH_INVALID')
  const artifact = await readArtifactByHandleTx(tx, checkedHandle)
  if (!artifact) return 'NOT_AVAILABLE'
  verifyArtifactRow(artifact, { id: checkedHandle, contentSha256: checkedContentSha256 })
  return 'PRESERVED'
}

/** Parent integration types only; no Prisma model client or external store is used. */
export type PrivateDocumentArchiveHook = typeof createPostgresPrivateDocumentArchive
export type PreservePrivateArchiveHook = typeof preservePrivateArchiveBytesBeforeReplacementTx
export type PrivateDocumentArchivePrismaClient = Pick<PrismaClient, '$transaction'>
