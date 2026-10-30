/* Area 3 synthetic tests only: no DB, network, Graph, build, tsc or document bytes persisted. */
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Prisma } from '@prisma/client'
import {
  AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA,
  AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN,
  AREA3_STAGING_DATABASE,
  area3ManifestCoverage,
  area3SourceVersionFingerprint,
  area3StagingRuntimeAllowed,
  createArea3ObservationFromExistingDocumentBytesEntry,
  createArea3ReceivedDocumentHashObservation,
  fingerprintArea3DocumentBytes,
  parseArea3ExistingDocumentBytesManifest,
} from '../lib/finanzas/area3-document-fingerprints-core'
import {
  AREA3_DUPLICATE_DOCUMENTS_PER_GROUP,
  applyArea3ReceivedDocumentHashObservationsTx,
  area3ReceivedDocumentHashSql,
  observationsFromArea3ManifestEntries,
  parseArea3DuplicatePage,
  readArea3ReceivedDocumentDuplicatesPage,
  validateArea3ExistingDocumentManifestSourcesTx,
} from '../lib/finanzas/area3-document-fingerprints-db'
import {
  AREA3_EXISTING_FILE_READ_CONCURRENCY,
  createArea3PreviewExistingFileFetch,
  readArea3ExistingDocumentBytes,
} from '../lib/finanzas/area3-document-fingerprints-reader'
import { parseArea3FingerprintCli } from './area3-fingerprint-existing-documents'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const UPDATED_AT = '2026-10-30T12:00:00.000Z'
const READ_AT = '2026-10-30T13:00:00.000Z'

function manifest(entries: unknown[]) {
  return {
    schema: AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA,
    database: AREA3_STAGING_DATABASE,
    complete: true,
    entries,
  }
}
function hashed(invoiceId = 'invoice-a', sourceItemId = 'item-a', sourceDriveId: string | null = 'drive-a') {
  return { invoiceId, sourceItemId, sourceDriveId, sourceUpdatedAt: UPDATED_AT, readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN, readAt: READ_AT, status: 'HASHED', sha256: SHA_A, byteLength: 321 }
}
function unreadable(invoiceId = 'invoice-b', sourceItemId = 'item-b') {
  return { invoiceId, sourceItemId, sourceDriveId: null, sourceUpdatedAt: UPDATED_AT, readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN, readAt: READ_AT, status: 'UNREADABLE', reason: 'BLOCKED_CONFIGURED_DRIVE_MISSING' }
}
function sqlText(statement: unknown): string {
  return statement && typeof statement === 'object' && Array.isArray((statement as { strings?: unknown }).strings)
    ? ((statement as { strings: readonly string[] }).strings).join('?') : String(statement)
}

function prismaPromise<T>(value: T): Prisma.PrismaPromise<T> {
  return Promise.resolve(value) as Prisma.PrismaPromise<T>
}

class FakeTx {
  queries: string[] = []
  writes: string[] = []
  constructor(private readonly rows: unknown[], private readonly insertResult = 1) {}
  $queryRaw<T = unknown>(statement: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]): Prisma.PrismaPromise<T> {
    this.queries.push(sqlText(statement))
    return prismaPromise(this.rows as T)
  }
  $executeRaw<T = unknown>(statement: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]): Prisma.PrismaPromise<number> {
    this.writes.push(sqlText(statement))
    return prismaPromise(this.insertResult)
  }
}

test('bytes reales son la única fuente de SHA-256 y el manifiesto es estricto', () => {
  const fingerprint = fingerprintArea3DocumentBytes(new TextEncoder().encode('mismos bytes'))
  assert.equal(fingerprint.contentSha256, 'c84f8000db078773615934bf1294259600265706ee36a6e25f64df56f3e9fede')
  assert.equal(fingerprint.byteLength, 12)
  const parsed = parseArea3ExistingDocumentBytesManifest(manifest([hashed(), unreadable()]))
  assert.equal(parsed.entries.length, 2)
  assert.deepEqual(area3ManifestCoverage(parsed), { total: 2, readable: 1, hashed: 1, unreadable: 1, errors: 0, blocked: 1 })
  assert.throws(() => parseArea3ExistingDocumentBytesManifest(manifest([{ ...hashed(), sha256: undefined }])), /AREA3_MANIFEST_HASHED_INVALID/)
  assert.throws(() => parseArea3ExistingDocumentBytesManifest(manifest([{ ...unreadable(), sha256: SHA_A, byteLength: 1 }])), /AREA3_MANIFEST_UNREADABLE_INVALID/)
  assert.throws(() => parseArea3ExistingDocumentBytesManifest(manifest([{ ...hashed(), sourceUpdatedAt: 'not-an-instant' }])), /AREA3_MANIFEST_SOURCE_UPDATED_AT_INVALID/)
  assert.throws(() => parseArea3ExistingDocumentBytesManifest(manifest([{ ...hashed() }, { ...hashed() }])), /AREA3_MANIFEST_INVOICE_DUPLICATE/)
})

test('UNREADABLE nunca produce una observación ni coincidencia fingida', () => {
  const parsed = parseArea3ExistingDocumentBytesManifest(manifest([hashed(), unreadable()]))
  const observations = observationsFromArea3ManifestEntries(parsed.entries)
  assert.equal(observations.length, 1)
  assert.equal(observations[0]?.facturaRecibidaId, 'invoice-a')
  assert.equal(createArea3ObservationFromExistingDocumentBytesEntry(parsed.entries[1]!), null)
  assert.equal(observations[0]?.source.sourceItemId, 'item-a')
  assert.equal(observations[0]?.source.observationRef, AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN)
})

test('dos lecturas idénticas con distinta fecha conservan auditoría pero comparten idempotencia', () => {
  const laterReadAt = '2026-10-31T13:00:00.000Z'
  const sourceVersionFingerprint = area3SourceVersionFingerprint({
    kind: 'LOCAL_VERIFIED_MANIFEST', facturaRecibidaId: 'invoice-local', exactSourceId: 'entry-local', observationVersion: 'version-a',
  })
  const bytes = new TextEncoder().encode('mismos bytes')
  const localFirst = createArea3ReceivedDocumentHashObservation({
    facturaRecibidaId: 'invoice-local', bytes,
    source: { kind: 'LOCAL_VERIFIED_MANIFEST', observationRef: 'VERIFIED_LOCAL_MANIFEST', sourceItemId: 'entry-local', sourceDriveId: null, sourceUpdatedAt: null, sourceReadAt: READ_AT, sourceVersionFingerprint },
  })
  const localSecond = createArea3ReceivedDocumentHashObservation({
    facturaRecibidaId: 'invoice-local', bytes,
    source: { kind: 'LOCAL_VERIFIED_MANIFEST', observationRef: 'VERIFIED_LOCAL_MANIFEST', sourceItemId: 'entry-local', sourceDriveId: null, sourceUpdatedAt: null, sourceReadAt: laterReadAt, sourceVersionFingerprint },
  })
  assert.notEqual(localFirst.source.sourceReadAt, localSecond.source.sourceReadAt)
  assert.equal(localFirst.idempotencyKey, localSecond.idempotencyKey)

  const manifestFirst = parseArea3ExistingDocumentBytesManifest(manifest([hashed('invoice-a')])).entries[0]!
  const manifestSecond = parseArea3ExistingDocumentBytesManifest(manifest([{ ...hashed('invoice-a'), readAt: laterReadAt }])).entries[0]!
  const previewFirst = createArea3ObservationFromExistingDocumentBytesEntry(manifestFirst)!
  const previewSecond = createArea3ObservationFromExistingDocumentBytesEntry(manifestSecond)!
  assert.notEqual(previewFirst.source.sourceReadAt, previewSecond.source.sourceReadAt)
  assert.equal(previewFirst.idempotencyKey, previewSecond.idempotencyKey)

  const otherDrive = parseArea3ExistingDocumentBytesManifest(manifest([{ ...hashed('invoice-a', 'item-a', 'drive-b') }])).entries[0]!
  const otherDriveObservation = createArea3ObservationFromExistingDocumentBytesEntry(otherDrive)!
  assert.notEqual(previewFirst.source.sourceVersionFingerprint, otherDriveObservation.source.sourceVersionFingerprint)
  assert.notEqual(previewFirst.idempotencyKey, otherDriveObservation.idempotencyKey)
})

test('runtime Area 3 pincha preview staging exacto y rechaza producción o host distinto', () => {
  const staging = { stagingSandbox: '1', vercelEnvironment: 'preview', databaseUrl: 'postgresql://io_staging_finanzas@yamanote.proxy.rlwy.net:34880/io_staging_finanzas' }
  assert.equal(area3StagingRuntimeAllowed(staging), true)
  assert.equal(area3StagingRuntimeAllowed({ ...staging, vercelEnvironment: 'production' }), false)
  assert.equal(area3StagingRuntimeAllowed({ ...staging, databaseUrl: 'postgresql://io_staging_finanzas@example.invalid:34880/io_staging_finanzas' }), false)
  assert.equal(area3StagingRuntimeAllowed({ ...staging, modelProductionEnabled: '1' }), false)
})

test('el lector inyectable limita tamaño, concurrentes y conserva sólo hash/metadatos', async () => {
  let active = 0
  let maxActive = 0
  const fetchExistingFile = async ({ invoiceId }: { invoiceId: string; signal: AbortSignal }) => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setTimeout(resolve, 2))
    active -= 1
    return new Response(new TextEncoder().encode(`bytes-${invoiceId}`), { status: 200, headers: { 'content-length': String(`bytes-${invoiceId}`.length) } })
  }
  const result = await readArea3ExistingDocumentBytes({
    sources: Array.from({ length: 5 }, (_, index) => ({ invoiceId: `invoice-${index}`, sourceItemId: `item-${index}`, sourceDriveId: 'drive-a', sourceUpdatedAt: UPDATED_AT })),
    fetchExistingFile,
    now: () => new Date(READ_AT),
  })
  assert.equal(result.entries.length, 5)
  assert.equal(result.entries.every(entry => entry.status === 'HASHED' && !('bytes' in entry)), true)
  assert(maxActive <= AREA3_EXISTING_FILE_READ_CONCURRENCY)
  const tooLarge = await readArea3ExistingDocumentBytes({
    sources: [{ invoiceId: 'invoice-large', sourceItemId: 'item-large', sourceDriveId: 'drive-a', sourceUpdatedAt: UPDATED_AT }],
    fetchExistingFile: async () => new Response('x', { status: 200, headers: { 'content-length': String(20 * 1024 * 1024 + 1) } }),
    now: () => new Date(READ_AT),
  })
  assert.equal(tooLarge.entries[0]?.status, 'UNREADABLE')
  assert.equal(tooLarge.entries[0]?.reason, 'ARCHIVO_FUERA_DE_LIMITE')
})

test('fetch preview es origen exacto, GET por invoice id y rechaza redirects', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = createArea3PreviewExistingFileFetch({
    previewOrigin: 'https://preview.example/', cookie: 'admin=session',
    fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return new Response('ok') },
  })
  await fetcher({ invoiceId: 'invoice-a', signal: new AbortController().signal })
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.url, 'https://preview.example/api/admin/finanzas/facturas/invoice-a/pdf')
  assert.equal(calls[0]?.init?.redirect, 'error')
  assert.equal((calls[0]?.init?.headers as Record<string, string>).Cookie, 'admin=session')
  assert.throws(() => createArea3PreviewExistingFileFetch({ previewOrigin: 'http://preview.example/', cookie: 'x' }), /AREA3_PREVIEW_ORIGIN_OR_COOKIE_INVALID/)
})

test('validación y apply inyectables bloquean item/drive/version cambiados y conservan idempotencia', async () => {
  const parsed = parseArea3ExistingDocumentBytesManifest(manifest([hashed('invoice-a', 'item-a', null)]))
  const tx = new FakeTx([{ invoiceId: 'invoice-a', itemId: 'item-a', driveId: null, updatedAt: new Date(UPDATED_AT) }])
  const validation = await validateArea3ExistingDocumentManifestSourcesTx({ tx, entries: parsed.entries, configuredDriveId: 'configured-drive' })
  assert.deepEqual(validation, [{ invoiceId: 'invoice-a', valid: true, code: 'VALID' }])
  const observations = observationsFromArea3ManifestEntries(parsed.entries)
  const result = await applyArea3ReceivedDocumentHashObservationsTx({ tx, entries: parsed.entries, observations, configuredDriveId: 'configured-drive' })
  assert.deepEqual(result, { requested: 1, inserted: 1, replayed: 0 })
  assert.equal(tx.writes.length, 1)
  assert.match(tx.writes[0]!, /INSERT INTO area3_received_document_hashes/)
  assert.match(tx.writes[0]!, /ON CONFLICT \(idempotency_key\) DO NOTHING/)
  const changed = new FakeTx([{ invoiceId: 'invoice-a', itemId: 'item-a', driveId: null, updatedAt: new Date('2026-10-31T12:00:00.000Z') }])
  await assert.rejects(() => applyArea3ReceivedDocumentHashObservationsTx({ tx: changed, entries: parsed.entries, observations, configuredDriveId: 'configured-drive' }), /AREA3_APPLY_SOURCE_CHANGED_OR_BLOCKED/)
  assert.equal(changed.writes.length, 0)
})

test('proyección de duplicados agrupa, pagina y nunca selecciona hashes, URLs o locators', async () => {
  const database = {
    calls: [] as string[],
    async $queryRaw<T>(statement: unknown): Promise<T> {
      const sql = sqlText(statement)
      this.calls.push(sql)
      if (sql.includes('AS "totalGroups"')) return [{ totalGroups: BigInt(2) }] as T
      return [
        { groupOrdinal: 1, documentCount: 2, visibleDocumentCount: 2, documentPosition: 1, proveedor: 'Proveedor A', numero: 'A-1', importe: '10.00' },
        { groupOrdinal: 1, documentCount: 2, visibleDocumentCount: 2, documentPosition: 2, proveedor: 'Proveedor B', numero: 'B-2', importe: '10.00' },
      ] as T
    },
  }
  const result = await readArea3ReceivedDocumentDuplicatesPage(database as any, { page: 1, limit: 10 })
  assert.equal(result.totalGroups, 2)
  assert.equal(result.groups[0]?.documents[0]?.label, 'Archivo A')
  assert.equal(result.groups[0]?.documents[1]?.label, 'Archivo B')
  const projection = sqlText(area3ReceivedDocumentHashSql.duplicateProjectionForTests({ page: 1, limit: 10 }))
  assert.match(projection, /HAVING COUNT\(DISTINCT h.factura_recibida_id\) >= 2/)
  assert.match(projection, /LIMIT \? OFFSET \?/) 
  // content_sha256 is internal-only grouping evidence inside the CTE. The final
  // SELECT carries only supplier/number/amount, and neither URL nor locator.
  for (const forbidden of ['archivo_url', 'source_item_id', 'source_drive_id', 'source_updated_at', 'document_version_snapshots']) assert.equal(projection.includes(forbidden), false, forbidden)
  assert.match(projection, /SELECT group_ordinal AS "groupOrdinal",document_count AS "documentCount"/)
  assert.equal(projection.includes('FROM area3_received_document_hashes'), true)
  assert.equal(AREA3_DUPLICATE_DOCUMENTS_PER_GROUP, 20)
  assert.throws(() => parseArea3DuplicatePage({ page: '0', limit: '10' }), /AREA3_DUPLICATE_PAGE_INVALID/)
})

test('CLI exige manifiesto, separa lectura de apply y no habilita apply accidental', () => {
  assert.deepEqual(parseArea3FingerprintCli(['--manifest', '/privado/a.json']), { apply: false, readExistingFiles: false, manifestPath: '/privado/a.json' })
  assert.deepEqual(parseArea3FingerprintCli(['--read-existing-files', '--manifest', '/privado/a.json']), { apply: false, readExistingFiles: true, manifestPath: '/privado/a.json' })
  assert.throws(() => parseArea3FingerprintCli(['--apply', '--read-existing-files', '--manifest', '/privado/a.json']), /AREA3_CLI_READ_AND_APPLY_MUST_BE_SEPARATE/)
  assert.throws(() => parseArea3FingerprintCli(['--apply']), /AREA3_CLI_MANIFEST_REQUIRED/)
})

console.log('OK: Area 3 usa bytes reales o manifiesto privado, mantiene DML append-only idempotente, limita lectura/paginación y no fusiona documentos.')
