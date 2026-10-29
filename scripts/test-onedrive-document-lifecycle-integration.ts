import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { DocumentLifecyclePlan, DocumentObservation, DocumentPrivateMetadata, StoredDocumentVersion } from '../lib/finanzas/finance-document-lifecycle-core'
import type { DuplicatePlan } from '../lib/finanzas/finance-content-duplicates-core'
import { PrismaOneDriveDocumentLifecycle, type OneDriveDocumentLifecyclePort, type OneDriveLifecycleApplyInput, type OneDriveLifecycleApplyResult } from '../lib/finanzas/sync-jobs/providers/onedrive/document-lifecycle'
import {
  decideOneDriveContentRead,
  observationFromOneDriveContent,
  oneDriveInventoryFingerprint,
  prepareOneDrivePrivateArchive,
  privateMetadataFromOneDriveOcr,
} from '../lib/finanzas/sync-jobs/providers/onedrive/document-lifecycle'
import { FakeOcrPort, FakeOneDriveDomainPort, FakeOneDriveReadPort } from '../lib/finanzas/sync-jobs/providers/onedrive/fake-provider'
import { FACTURAS_BASE_PATH, OneDriveSyncProvider, type ExistingSource } from '../lib/finanzas/sync-jobs/providers/onedrive/provider'
import type { GraphFile } from '../lib/finanzas/sync-jobs/providers/onedrive/graph-read'

const DRIVE = 'drive-synthetic'
const FOLDER = `${FACTURAS_BASE_PATH}/2. Pendiente de contabilizar o revisar 2026`
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
const LIFECYCLE_ID = '11111111-1111-4111-8111-111111111111'
const SNAPSHOT_ID = '22222222-2222-4222-8222-222222222222'
const ocr = {
  proveedor: 'Synthetic Vendor', cif: 'B12345678', numFactura: 'S-1', fecha: '2026-10-01', fechaProvenancia: 'DOCUMENTO',
  base: 100, tipoIva: 21, importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121, confianza: 0.99,
  lineas: [{ importeNeto: 100 }], tipoDocumento: 'RECTIFICATIVA', referenciaFacturaOriginal: 'ORIGINAL-1', moneda: 'EUR',
}
const valid = { ok: true as const, identidad: 'CIF:B12345678|NUM:S-1' }
const metadata: DocumentPrivateMetadata = {
  originalFileName: 'synthetic.pdf', documentNumber: 'S-0', documentDate: '2026-09-01', totalCents: 100,
  invoiceFiscalIdentity: 'CIF:B12345678|NUM:S-0', partyRole: 'PROVEEDOR', documentClass: 'FACTURA_RECIBIDA',
  referencedOriginalReference: null, currencyCode: 'EUR', upstreamVersionRef: 'version-old',
}

function file(overrides: Partial<GraphFile> = {}): GraphFile {
  return {
    id: 'item-synthetic', name: 'synthetic.pdf', size: pdf.byteLength, eTag: 'etag-1', cTag: 'ctag-1', sourceVersion: 'version-1',
    file: { mimeType: 'application/pdf', hashes: { quickXorHash: 'quick-1' } }, lastModifiedDateTime: '2026-10-01T00:00:00Z',
    relativeFolderPath: FOLDER, folderPath: FOLDER, fullPath: `${FOLDER}/synthetic.pdf`, ...overrides,
  }
}

function stored(fingerprint: StoredDocumentVersion['fingerprint']): StoredDocumentVersion {
  return {
    identity: { source: 'ONEDRIVE', sourceItemKey: `${DRIVE}:item-synthetic` }, versionNumber: 1,
    fingerprint, privateMetadata: metadata, privateLocatorHandle: null, capturedAt: null,
  }
}

function sqlText(query: Prisma.Sql): string { return query.strings.join('?') }

/** Raw-SQL mock for one v1 snapshot; no database, archive service or network. */
class DurableSnapshotTx {
  readonly events: string[] = []
  readonly seenTransactions: object[] = []

  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ..._values: unknown[]): Prisma.PrismaPromise<T> {
    const result = (async (): Promise<T> => {
    const text = 'text' in query ? sqlText(query) : query.join('?')
    this.seenTransactions.push(this)
    if (text.includes('FROM document_version_lifecycle l')) {
      this.events.push('lifecycle-lock')
      return [{
        lifecycleId: LIFECYCLE_ID, state: 'ACTIVE', currentVersion: 0,
        versionNumber: null, contentSha256: null, byteLength: null,
        quickXorHash: null, cTag: null, eTag: null, graphVersion: null,
        numberFingerprint: null, amountFingerprint: null, privateStorageHandle: null,
        originalFileName: null, documentNumber: null, documentDate: null,
        totalCents: null, invoiceFiscalIdentity: null, partyRole: null,
        documentClass: null, referencedOriginalReference: null, currencyCode: null,
        upstreamVersionRef: null, capturedAt: null,
      }] as T
    }
    if (text.includes('INSERT INTO document_version_artifacts')) {
      this.events.push('archive-insert')
      return [{ id: 'archive-synthetic' }] as T
    }
    if (text.includes('INSERT INTO document_version_snapshots')) {
      this.events.push('snapshot-insert')
      return [{ id: SNAPSHOT_ID }] as T
    }
    if (text.includes('UPDATE document_version_lifecycle SET current_version')) {
      this.events.push('lifecycle-advance')
      return [] as T
    }
    if (text.includes('SELECT id::text AS "snapshotId",version_number AS "versionNumber"')) {
      this.events.push('snapshot-reread')
      return [{ snapshotId: SNAPSHOT_ID, versionNumber: 1 }] as T
    }
    if (text.includes('FROM document_version_snapshots s')) {
      this.events.push('duplicate-observation')
      return [] as T
    }
    throw new Error('UNEXPECTED_SYNTHETIC_SQL')
    })()
    // Only brands the in-memory Promise; it never executes Prisma or SQL.
    return Object.defineProperty(result, Symbol.toStringTag, { value: 'PrismaPromise' }) as Prisma.PrismaPromise<T>
  }
}

function lifecycleApplyInput(): OneDriveLifecycleApplyInput {
  const observation = observationFromOneDriveContent({
    identity: { source: 'ONEDRIVE', sourceItemKey: `${DRIVE}:item-synthetic` },
    inventory: { byteLength: pdf.byteLength, quickXorHash: 'quick-synthetic', cTag: 'ctag-synthetic', eTag: 'etag-synthetic', sourceVersion: 'version-synthetic' },
    bytes: pdf,
    privateMetadata: metadata,
  })
  return {
    identity: observation.identity,
    observation,
    reconciliation: { status: 'NONE' },
    actorId: 7,
    archive: prepareOneDrivePrivateArchive(pdf, 'synthetic.pdf'),
    legacyPreviousMetadata: null,
  }
}

class LifecycleMock implements OneDriveDocumentLifecyclePort<object> {
  applyCalls: OneDriveLifecycleApplyInput[] = []
  verifyCalls = 0
  constructor(
    readonly current: StoredDocumentVersion | null,
    private readonly verify: 'CURRENT' | 'REQUIRES_CONTENT' | 'REQUIRES_REVIEW' = 'CURRENT',
    private readonly result: Partial<OneDriveLifecycleApplyResult> = {},
  ) {}
  async readCurrent(): Promise<StoredDocumentVersion | null> { return this.current }
  async verifyCurrent(): Promise<'CURRENT' | 'REQUIRES_CONTENT' | 'REQUIRES_REVIEW'> { this.verifyCalls += 1; return this.verify }
  async apply(_tx: object, input: OneDriveLifecycleApplyInput): Promise<OneDriveLifecycleApplyResult> {
    this.applyCalls.push(input)
    return {
      outcome: 'CREATED', plan: { requiresHumanConfirmation: false } as DocumentLifecyclePlan,
      lifecycleId: 'lifecycle-synthetic', snapshotId: null, versionNumber: null,
      metadataUnavailable: false, duplicate: null, ...this.result,
    }
  }
}

function setup(lifecycle: LifecycleMock, existing: ExistingSource | null = null) {
  const read = new FakeOneDriveReadPort(
    { driveId: DRIVE, siteId: 'site-synthetic', rootPath: FACTURAS_BASE_PATH },
    { [FOLDER]: { files: [file()] } },
    { 'item-synthetic': pdf },
  )
  const domain = new FakeOneDriveDomainPort()
  if (existing) domain.sources.set('item-synthetic', existing)
  const extractor = new FakeOcrPort(ocr, valid)
  const provider = new OneDriveSyncProvider({ read, domain, ocr: extractor, documentLifecycle: lifecycle, historicalLibraryConfirmedDriveId: DRIVE })
  return { read, domain, extractor, provider }
}

test('eTag-only inventory metadata does not trigger content read or version creation', () => {
  const current = stored({ contentSha256: null, byteLength: null, quickXorHash: null, cTag: null, eTag: 'etag-old' })
  const observation: DocumentObservation = {
    identity: current.identity,
    fingerprint: oneDriveInventoryFingerprint({ byteLength: 6, quickXorHash: null, cTag: null, eTag: 'etag-new', sourceVersion: 'etag-new' }),
    privateMetadata: null,
  }
  assert.equal(decideOneDriveContentRead({ sourceExists: true, current, incoming: observation }), 'NO_CONTENT')
})

test('quickXorHash/cTag change requests content, while equal cTag remains unchanged', () => {
  const identity = { source: 'ONEDRIVE', sourceItemKey: `${DRIVE}:item-synthetic` }
  const unchanged = stored({ contentSha256: null, byteLength: 6, quickXorHash: null, cTag: 'same', eTag: 'one' })
  const changed = stored({ contentSha256: null, byteLength: 6, quickXorHash: 'quick-old', cTag: null, eTag: 'one' })
  assert.equal(decideOneDriveContentRead({ sourceExists: true, current: unchanged, incoming: { identity, fingerprint: oneDriveInventoryFingerprint({ byteLength: 6, quickXorHash: null, cTag: 'same', eTag: 'two', sourceVersion: 'two' }) } }), 'NO_CONTENT')
  assert.equal(decideOneDriveContentRead({ sourceExists: true, current: changed, incoming: { identity, fingerprint: oneDriveInventoryFingerprint({ byteLength: 6, quickXorHash: 'quick-new', cTag: null, eTag: 'two', sourceVersion: 'two' }) } }), 'READ_CONTENT')
})

test('archive selection keeps image OCR and a 25 MiB PDF out of durable BYTEA without converting either to an error', () => {
  assert.deepEqual(prepareOneDrivePrivateArchive(new Uint8Array([1, 2, 3]), 'synthetic.png'), {
    artifact: null, metadataUnavailable: true, unavailableReason: 'FORMAT_NOT_ARCHIVABLE',
  })
  const hugePdf = new Uint8Array(20 * 1024 * 1024 + 1)
  hugePdf.set(pdf)
  assert.deepEqual(prepareOneDrivePrivateArchive(hugePdf, 'synthetic.pdf'), {
    artifact: null, metadataUnavailable: true, unavailableReason: 'SIZE_NOT_ARCHIVABLE',
  })
  assert.equal(prepareOneDrivePrivateArchive(pdf, 'synthetic.pdf').artifact?.format, 'PDF')
})

test('OCR-derived metadata retains rectificativa fields only when the extractor supplied them', () => {
  const parsed = privateMetadataFromOneDriveOcr({ originalFileName: 'synthetic.pdf', sourceVersion: 'revision-1', ocr })
  assert.equal(parsed.documentClass, 'RECTIFICATIVA')
  assert.equal(parsed.referencedOriginalReference, 'ORIGINAL-1')
  assert.equal(parsed.currencyCode, 'EUR')
  const absent = privateMetadataFromOneDriveOcr({ originalFileName: 'synthetic.pdf', sourceVersion: null, ocr: { ...ocr, referenciaFacturaOriginal: undefined, tipoDocumento: undefined, moneda: undefined } })
  assert.equal(absent.referencedOriginalReference, null)
  assert.equal(absent.documentClass, null)
  assert.equal(absent.currencyCode, null)
})

test('existing source with unchanged cTag skips OCR and revalidates inside apply', async () => {
  const lifecycle = new LifecycleMock(stored({ contentSha256: null, byteLength: 6, quickXorHash: null, cTag: 'ctag-1', eTag: 'etag-old' }))
  const existing: ExistingSource = { kind: 'INVOICE', id: 'invoice-synthetic', oneDriveDriveId: DRIVE, location: {
    carpetaOrigen: '2. Pendiente de contabilizar o revisar 2026', oneDriveDriveId: DRIVE, oneDriveRutaActual: `${FOLDER}/synthetic.pdf`, archivoOneDrive: `${FOLDER}/synthetic.pdf`, estadoCarpeta: 'PENDIENTE_CONTABILIZAR', etiquetaMateriales: false,
  } }
  const { provider, read, extractor } = setup(lifecycle, existing)
  const item = (await provider.inventory({})).items[0]
  const prepared = await provider.prepare(item)
  assert.equal(read.downloads, 0)
  assert.equal(extractor.calls, 0)
  assert.equal(await provider.apply({}, item, prepared, 7), 'SIN_CAMBIOS')
  assert.equal(lifecycle.verifyCalls, 1)
  assert.equal(lifecycle.applyCalls.length, 0)
})

test('confirmed B4 with changed number or total returns review after immutable lifecycle apply and never updates invoice', async () => {
  const lifecycle = new LifecycleMock(stored({ contentSha256: 'a'.repeat(64), byteLength: pdf.byteLength, quickXorHash: 'quick-old', cTag: 'ctag-old', eTag: 'etag-old' }), 'CURRENT', {
    outcome: 'CREATED',
    plan: { requiresHumanConfirmation: true, incident: { code: 'AMBAR_DOCUMENTO_CAMBIADO' } } as unknown as DocumentLifecyclePlan,
  })
  const existing: ExistingSource = { kind: 'INVOICE', id: 'invoice-synthetic', oneDriveDriveId: DRIVE, location: {
    carpetaOrigen: 'old', oneDriveDriveId: DRIVE, oneDriveRutaActual: 'old/path.pdf', archivoOneDrive: 'old/path.pdf', estadoCarpeta: 'OLD', etiquetaMateriales: false,
  } }
  const { provider, domain, extractor } = setup(lifecycle, existing)
  domain.readB4Protection = async () => ({ status: 'CONFIRMED' })
  const item = (await provider.inventory({})).items[0]
  const prepared = await provider.prepare(item)
  assert.equal(extractor.calls, 1)
  assert.equal(await provider.apply({}, item, prepared, 7), 'REVISAR')
  assert.equal(lifecycle.applyCalls.length, 1)
  assert.equal(lifecycle.applyCalls[0].reconciliation.status, 'CONFIRMED')
  assert.equal(domain.calls.location, 0)
  assert.equal(domain.calls.invoice, 0)
  assert.equal(domain.calls.review, 0)
})

test('conflicting hash duplicate returns review without create or update, while identical duplicates preserve the canonical path', async () => {
  const conflictingDuplicate: DuplicatePlan = {
    schema: 'FINANCE_CONTENT_DUPLICATES_V1', kind: 'REVIEW_FISCAL_METADATA_CONFLICT', evidence: 'SHA256_BYTES',
    canonicalLifecycleId: null, duplicateLifecycleId: null, linkMode: 'NONE', requiresHumanConfirmation: true,
    b4Directive: 'PRESERVE_UNCHANGED', vatDirective: 'UNCHANGED_NOT_APPLICABLE', autoApproval: false,
    mergeDocuments: false, deleteDocuments: false, operationKey: 'duplicate-conflict',
  }
  const identicalDuplicate: DuplicatePlan = {
    schema: 'FINANCE_CONTENT_DUPLICATES_V1', kind: 'SOFT_CANONICAL_LINK', evidence: 'SHA256_BYTES',
    canonicalLifecycleId: 'canonical-lifecycle', duplicateLifecycleId: 'incoming-lifecycle', linkMode: 'SOFT_CANONICAL', requiresHumanConfirmation: false,
    b4Directive: 'PRESERVE_UNCHANGED', vatDirective: 'UNCHANGED_NOT_APPLICABLE', autoApproval: false,
    mergeDocuments: false, deleteDocuments: false, operationKey: 'duplicate-identical',
  }

  const createConflict = setup(new LifecycleMock(null, 'CURRENT', { duplicate: conflictingDuplicate }))
  const createItem = (await createConflict.provider.inventory({})).items[0]
  const createPrepared = await createConflict.provider.prepare(createItem)
  assert.equal(await createConflict.provider.apply({}, createItem, createPrepared, 7), 'REVISAR')
  assert.equal(createConflict.domain.calls.invoice, 0)
  assert.equal(createConflict.domain.calls.location, 0)

  const existing: ExistingSource = { kind: 'INVOICE', id: 'invoice-synthetic', oneDriveDriveId: DRIVE, location: {
    carpetaOrigen: 'old', oneDriveDriveId: DRIVE, oneDriveRutaActual: 'old/path.pdf', archivoOneDrive: 'old/path.pdf', estadoCarpeta: 'OLD', etiquetaMateriales: false,
  } }
  const updateConflict = setup(new LifecycleMock(stored({ contentSha256: 'a'.repeat(64), byteLength: pdf.byteLength, quickXorHash: 'quick-old', cTag: 'ctag-old', eTag: 'etag-old' }), 'CURRENT', { duplicate: conflictingDuplicate }), existing)
  updateConflict.domain.readB4Protection = async () => ({ status: 'NONE' })
  const updateItem = (await updateConflict.provider.inventory({})).items[0]
  const updatePrepared = await updateConflict.provider.prepare(updateItem)
  assert.equal(await updateConflict.provider.apply({}, updateItem, updatePrepared, 7), 'REVISAR')
  assert.equal(updateConflict.domain.calls.invoice, 0)
  assert.equal(updateConflict.domain.calls.location, 0)

  const identical = setup(new LifecycleMock(null, 'CURRENT', { duplicate: identicalDuplicate }))
  const identicalItem = (await identical.provider.inventory({})).items[0]
  const identicalPrepared = await identical.provider.prepare(identicalItem)
  assert.equal(await identical.provider.apply({}, identicalItem, identicalPrepared, 7), 'NUEVA')
  assert.equal(identical.domain.calls.invoice, 1)
  assert.equal(identical.domain.calls.location, 0)
  assert.equal(identicalDuplicate.canonicalLifecycleId, 'canonical-lifecycle')
})

test('historical source without lifecycle records only real canonical metadata with explicit unavailable archive and review', async () => {
  const lifecycle = new LifecycleMock(null)
  const existing: ExistingSource = { kind: 'INVOICE', id: 'invoice-synthetic', oneDriveDriveId: DRIVE, location: {
    carpetaOrigen: 'old', oneDriveDriveId: DRIVE, oneDriveRutaActual: 'old/path.pdf', archivoOneDrive: 'old/path.pdf', estadoCarpeta: 'OLD', etiquetaMateriales: false,
  } }
  const { provider, read, extractor, domain } = setup(lifecycle, existing)
  domain.readPrivateMetadata = async () => metadata
  domain.readB4Protection = async () => ({ status: 'NONE' })
  const item = (await provider.inventory({})).items[0]
  const prepared = await provider.prepare(item)
  assert.equal(read.downloads, 0)
  assert.equal(extractor.calls, 0)
  assert.equal(await provider.apply({}, item, prepared, 7), 'REVISAR')
  assert.equal(lifecycle.applyCalls.length, 1)
  assert.equal(lifecycle.applyCalls[0].archive.metadataUnavailable, true)
  assert.equal(lifecycle.applyCalls[0].archive.unavailableReason, 'LEGACY_METADATA_ONLY')
  assert.equal(lifecycle.applyCalls[0].legacyPreviousMetadata, metadata)
})

test('content observation derives SHA-256 from bytes and preserves Graph quickXorHash/cTag/sourceVersion only as metadata', () => {
  const observation = observationFromOneDriveContent({
    identity: { source: 'ONEDRIVE', sourceItemKey: `${DRIVE}:item-synthetic` },
    inventory: { byteLength: pdf.byteLength, quickXorHash: 'quick-synthetic', cTag: 'ctag-synthetic', eTag: 'etag-synthetic', sourceVersion: 'version-synthetic' },
    bytes: pdf,
    privateMetadata: metadata,
  })
  assert.equal(observation.fingerprint.contentSha256?.length, 64)
  assert.equal(observation.fingerprint.quickXorHash, 'quick-synthetic')
  assert.equal(observation.fingerprint.cTag, 'ctag-synthetic')
  assert.equal(observation.privateMetadata?.upstreamVersionRef, 'version-old')
})

test('concrete lifecycle returns only the durable snapshot reread in the same transaction after archive', async () => {
  const tx = new DurableSnapshotTx()
  const checkedTransactions: object[] = []
  const lifecycle = new PrismaOneDriveDocumentLifecycle<DurableSnapshotTx>(
    tx as unknown as Pick<PrismaClient, '$queryRaw'>,
    async (sameTx, actorId) => {
      checkedTransactions.push(sameTx)
      return sameTx === tx && actorId === 7
    },
  )

  const result = await lifecycle.apply(tx, lifecycleApplyInput())

  assert.equal(result.outcome, 'CREATED')
  assert.equal(result.lifecycleId, LIFECYCLE_ID)
  assert.equal(result.snapshotId, SNAPSHOT_ID)
  assert.equal(result.versionNumber, 1)
  assert(tx.events.indexOf('archive-insert') >= 0)
  assert(tx.events.indexOf('archive-insert') < tx.events.indexOf('snapshot-insert'))
  assert(tx.events.indexOf('snapshot-insert') < tx.events.indexOf('snapshot-reread'))
  assert(checkedTransactions.length >= 3)
  assert(checkedTransactions.every((sameTx) => sameTx === tx))
  assert(tx.seenTransactions.every((sameTx) => sameTx === tx))
})

test('concrete lifecycle rejects a revoked live actor before archive or snapshot SQL', async () => {
  const tx = new DurableSnapshotTx()
  const lifecycle = new PrismaOneDriveDocumentLifecycle<DurableSnapshotTx>(
    tx as unknown as Pick<PrismaClient, '$queryRaw'>,
    async () => false,
  )
  await assert.rejects(() => lifecycle.apply(tx, lifecycleApplyInput()), /ONEDRIVE_LIFECYCLE_ACCESS_DENIED/)
  assert.deepEqual(tx.events, [])
  assert.deepEqual(tx.seenTransactions, [])
})

console.log('OK: OneDrive lifecycle integration tests use synthetic metadata/bytes and mocks only; no DB, Graph, OCR service, B4 mutation or network.')
