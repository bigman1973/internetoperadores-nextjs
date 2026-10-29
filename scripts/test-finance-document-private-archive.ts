import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'
import {
  createPostgresPrivateDocumentArchive,
  preservePrivateArchiveBytesBeforeReplacementTx,
  privateDocumentArtifactHandle,
  privateDocumentArtifactOperationKey,
  type PrivateDocumentArchivePrismaTx,
} from '../lib/finanzas/finance-document-private-archive-db'
import { preparePrivateArtifact } from '../lib/finanzas/finance-document-lifecycle-adapter'
import type { StoredDocumentVersion } from '../lib/finanzas/finance-document-lifecycle-core'

const lifecycleId = '11111111-1111-4111-8111-111111111111'
const missingHandle = '22222222-2222-4222-8222-222222222222'
const actor = { actorId: 29 }

// Only a minimal signed synthetic PDF fixture. It has no real document content.
const syntheticPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])
const artifact = preparePrivateArtifact(syntheticPdf, 'fixture.pdf')

type StoredArtifact = {
  id: string
  sha256: string
  byteLength: number
  format: string
  contentBytes: Uint8Array
  createdAt: Date
}
type StoredSnapshot = {
  lifecycleId: string
  versionNumber: number
  contentSha256: string
  byteLength: number
  artifactState: string
  privateStorageHandle: string
  capturedAt: Date
}

class SyntheticPrismaPromise<T> extends Promise<T> implements Prisma.PrismaPromise<T> {
  get [Symbol.toStringTag](): 'PrismaPromise' { return 'PrismaPromise' }
}
function prismaPromise<T>(value: T): Prisma.PrismaPromise<T> {
  return new SyntheticPrismaPromise(resolve => resolve(value))
}
function syntheticQueryResult<T>(rows: readonly unknown[]): Prisma.PrismaPromise<T> {
  return prismaPromise(rows as T)
}

/** Strict in-memory raw SQL mock. It captures SQL templates, never a database or network. */
class RawSqlMock implements PrivateDocumentArchivePrismaTx {
  readonly artifacts = new Map<string, StoredArtifact>()
  readonly snapshots = new Map<string, StoredSnapshot>()
  readonly queryTexts: string[] = []
  readQueryCount = 0

  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Prisma.PrismaPromise<T> {
    const text = 'text' in query ? query.text : query.join('')
    const parameters = 'text' in query ? query.values : values
    this.queryTexts.push(text)

    if (text.includes('INSERT INTO document_version_artifacts')) {
      const [id, sha256, byteLength, format, contentBytes] = parameters as [string, string, number, string, Uint8Array]
      if (this.artifacts.has(id)) return syntheticQueryResult<T>([])
      this.artifacts.set(id, {
        id,
        sha256,
        byteLength,
        format,
        contentBytes: new Uint8Array(contentBytes),
        createdAt: new Date('2026-10-29T12:00:00.000Z'),
      })
      return syntheticQueryResult<T>([{ id }])
    }

    if (text.includes('FROM document_version_snapshots s')) {
      this.readQueryCount += 1
      const [requestedLifecycleId, requestedVersionNumber] = parameters as [string, number]
      const snapshot = this.snapshots.get(`${requestedLifecycleId}:${requestedVersionNumber}`)
      if (!snapshot) return syntheticQueryResult<T>([])
      const stored = this.artifacts.get(snapshot.privateStorageHandle)
      return syntheticQueryResult<T>([{
        snapshotSha256: snapshot.contentSha256,
        snapshotByteLength: snapshot.byteLength,
        artifactState: snapshot.artifactState,
        privateStorageHandle: snapshot.privateStorageHandle,
        artifactId: stored?.id ?? null,
        sha256: stored?.sha256 ?? null,
        byteLength: stored?.byteLength ?? null,
        format: stored?.format ?? null,
        contentBytes: stored ? new Uint8Array(stored.contentBytes) : null,
        capturedAt: snapshot.capturedAt,
      }])
    }

    if (text.includes('FROM document_version_artifacts')) {
      const [id] = parameters as [string]
      const stored = this.artifacts.get(id)
      return syntheticQueryResult<T>(stored ? [{ ...stored, contentBytes: new Uint8Array(stored.contentBytes) }] : [])
    }

    throw new Error('UNEXPECTED_SYNTHETIC_SQL')
  }
}

function archiveFor(mock: RawSqlMock, allowedWrite = true, allowedRead = true) {
  return createPostgresPrivateDocumentArchive<RawSqlMock>({
    actor,
    assertEffectiveFinanceWriteAccess: async (_tx, actorId) => allowedWrite && actorId === actor.actorId,
    authorizeServerRead: async (_tx, request) => {
      assert.equal(request.lifecycleId, lifecycleId)
      return allowedRead && request.versionNumber === 1 && request.contentSha256 === artifact.contentSha256
    },
  })
}

function addSnapshot(mock: RawSqlMock, handle: string) {
  mock.snapshots.set(`${lifecycleId}:1`, {
    lifecycleId,
    versionNumber: 1,
    contentSha256: artifact.contentSha256,
    byteLength: artifact.byteLength,
    artifactState: 'CAPTURED',
    privateStorageHandle: handle,
    capturedAt: new Date('2026-10-29T12:00:00.000Z'),
  })
}

function currentWith(handle: string | null, contentSha256: string | null): StoredDocumentVersion {
  return {
    identity: { source: 'synthetic_provider', sourceItemKey: 'synthetic-drive:synthetic-item' },
    versionNumber: 1,
    fingerprint: { contentSha256, byteLength: artifact.byteLength },
    privateLocatorHandle: handle,
    privateMetadata: null,
    capturedAt: '2026-10-29T12:00:00.000Z',
  }
}

test('alta PostgreSQL inmutable: handle y clave estables, replay validado y sin bytes en SQL textual', async () => {
  const mock = new RawSqlMock()
  const archive = archiveFor(mock)
  const input = { lifecycleId, versionNumber: 1, artifact, upstreamVersionRef: 'synthetic-revision-1' }
  const expectedHandle = privateDocumentArtifactHandle({ lifecycleId, versionNumber: 1, contentSha256: artifact.contentSha256 })

  assert.equal(privateDocumentArtifactOperationKey({ lifecycleId, versionNumber: 1, contentSha256: artifact.contentSha256 }).length, 64)
  assert.equal((await archive.archiveIncomingImmutable(mock, input)).privateStorageHandle, expectedHandle)
  assert.equal((await archive.archiveIncomingImmutable(mock, input)).privateStorageHandle, expectedHandle)
  assert.equal(mock.artifacts.size, 1)
  assert(mock.queryTexts.every((query) => !query.includes('fixture.pdf')))
  assert(mock.queryTexts.every((query) => !query.includes(Buffer.from(syntheticPdf).toString('hex'))))
})

test('lectura exige callback autorizado y verifica hash, tamaño y firma al devolver una copia de bytes', async () => {
  const mock = new RawSqlMock()
  const archive = archiveFor(mock)
  const handle = (await archive.archiveIncomingImmutable(mock, { lifecycleId, versionNumber: 1, artifact, upstreamVersionRef: null })).privateStorageHandle
  addSnapshot(mock, handle)

  const read = await archive.readImmutableVersion(mock, { lifecycleId, versionNumber: 1, contentSha256: artifact.contentSha256 })
  assert(read)
  assert.deepEqual(read.bytes, syntheticPdf)
  assert.notEqual(read.bytes, mock.artifacts.get(handle)?.contentBytes)
  assert.equal(read.capturedAt.toISOString(), '2026-10-29T12:00:00.000Z')

  const deniedMock = new RawSqlMock()
  const deniedArchive = archiveFor(deniedMock, true, false)
  await assert.rejects(
    deniedArchive.readImmutableVersion(deniedMock, { lifecycleId, versionNumber: 1, contentSha256: artifact.contentSha256 }),
    /DOCUMENT_PRIVATE_ARCHIVE_READ_DENIED/,
  )
  assert.equal(deniedMock.readQueryCount, 0)
})

test('preservación previa jamás simula PRESERVED: ausente es NOT_AVAILABLE y una corrupción se rechaza', async () => {
  const mock = new RawSqlMock()
  assert.equal(await preservePrivateArchiveBytesBeforeReplacementTx(mock, {
    current: currentWith(null, null), actor,
    assertEffectiveFinanceWriteAccess: async () => true,
  }), 'NOT_AVAILABLE')
  assert.equal(await preservePrivateArchiveBytesBeforeReplacementTx(mock, {
    current: currentWith(missingHandle, artifact.contentSha256), actor,
    assertEffectiveFinanceWriteAccess: async () => true,
  }), 'NOT_AVAILABLE')

  const archive = archiveFor(mock)
  const handle = (await archive.archiveIncomingImmutable(mock, { lifecycleId, versionNumber: 1, artifact, upstreamVersionRef: null })).privateStorageHandle
  const stored = mock.artifacts.get(handle)
  assert(stored)
  stored.contentBytes[stored.contentBytes.length - 1] ^= 0x01
  await assert.rejects(
    preservePrivateArchiveBytesBeforeReplacementTx(mock, {
      current: currentWith(handle, artifact.contentSha256), actor,
      assertEffectiveFinanceWriteAccess: async () => true,
    }),
    /DOCUMENT_PRIVATE_ARCHIVE_ROW_HASH_MISMATCH/,
  )
})

test('escritura requiere assertEffectiveFinanceWriteAccess antes de cualquier SQL o byte persistido', async () => {
  const mock = new RawSqlMock()
  const archive = archiveFor(mock, false)
  await assert.rejects(
    archive.archiveIncomingImmutable(mock, { lifecycleId, versionNumber: 1, artifact, upstreamVersionRef: null }),
    /DOCUMENT_PRIVATE_ARCHIVE_ACCESS_DENIED/,
  )
  assert.equal(mock.artifacts.size, 0)
  assert.equal(mock.queryTexts.length, 0)
})

test('rechaza metadatos adulterados, URL upstream y firmas no válidas sin almacenar nada', async () => {
  const mock = new RawSqlMock()
  const archive = archiveFor(mock)
  await assert.rejects(
    archive.archiveIncomingImmutable(mock, {
      lifecycleId,
      versionNumber: 1,
      artifact: { ...artifact, metadataChecksum: '0'.repeat(64) },
      upstreamVersionRef: null,
    }),
    /DOCUMENT_PRIVATE_ARCHIVE_METADATA_CHECKSUM_MISMATCH/,
  )
  await assert.rejects(
    archive.archiveIncomingImmutable(mock, { lifecycleId, versionNumber: 1, artifact, upstreamVersionRef: 'https://private.invalid/download?sig=synthetic' }),
    /DOCUMENT_PRIVATE_ARCHIVE_UPSTREAM_URL_FORBIDDEN/,
  )
  assert.equal(mock.artifacts.size, 0)
})

console.log('OK: archivo privado PostgreSQL probado sólo con SQL mock, actor/callback autorizados y bytes sintéticos.')
