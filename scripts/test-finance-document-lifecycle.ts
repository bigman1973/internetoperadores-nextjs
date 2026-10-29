import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessDocumentObservation,
  planDocumentLifecycle,
  type DocumentLifecycleIdentity,
  type DocumentObservation,
  type StoredDocumentVersion,
} from '../lib/finanzas/finance-document-lifecycle-core'
import { hasNoAutomaticB4Acceptance, preparePrivateArtifact } from '../lib/finanzas/finance-document-lifecycle-adapter'

const sha = (letter: string) => letter.repeat(64)
const identity: DocumentLifecycleIdentity = { source: 'mock_provider', sourceItemKey: 'mock-drive:mock-item' }
const prior: StoredDocumentVersion = {
  identity,
  versionNumber: 1,
  privateLocatorHandle: 'archive-object-1',
  capturedAt: '2026-10-29T12:00:00.000Z',
  privateMetadata: { originalFileName: 'mock.pdf', documentNumber: 'DOC-OLD', documentDate: '2026-10-01', totalCents: 100, invoiceFiscalIdentity: 'mock-fiscal', partyRole: 'PROVEEDOR', documentClass: 'FACTURA', referencedOriginalReference: null, currencyCode: 'EUR', upstreamVersionRef: 'mock-version-1' },
  fingerprint: { contentSha256: sha('a'), byteLength: 10, quickXorHash: 'quick-a', cTag: 'ctag-a', eTag: 'etag-a', numberFingerprint: sha('b'), amountFingerprint: sha('c') },
}
function observation(overrides: Partial<DocumentObservation> = {}): DocumentObservation {
  return {
    identity,
    fingerprint: { contentSha256: sha('a'), byteLength: 10, quickXorHash: 'quick-a', cTag: 'ctag-a', eTag: 'etag-a', numberFingerprint: sha('b'), amountFingerprint: sha('c') },
    privateMetadata: { originalFileName: 'mock.pdf', documentNumber: 'DOC-OLD', documentDate: '2026-10-01', totalCents: 100, invoiceFiscalIdentity: 'mock-fiscal', partyRole: 'PROVEEDOR', documentClass: 'FACTURA', referencedOriginalReference: null, currencyCode: 'EUR', upstreamVersionRef: 'mock-version-1' },
    ...overrides,
  }
}

test('cTag igual mantiene la versión aunque la observación se repita', () => {
  const result = assessDocumentObservation({ ...prior, fingerprint: { ...prior.fingerprint, contentSha256: null, quickXorHash: null } }, observation({ fingerprint: { ...prior.fingerprint, contentSha256: null, quickXorHash: null } }))
  assert.deepEqual(result, { kind: 'UNCHANGED', evidence: 'CTAG', reason: 'CTAG_EQUAL' })
})

test('eTag cambiado solo es metadato y no crea versión', () => {
  const previous = { ...prior, fingerprint: { contentSha256: null, quickXorHash: null, cTag: null, eTag: 'etag-a' } }
  const incoming = observation({ fingerprint: { contentSha256: null, quickXorHash: null, cTag: null, eTag: 'etag-b' } })
  const plan = planDocumentLifecycle(previous, incoming, { status: 'CONFIRMED' })
  assert.equal(plan.assessment.kind, 'METADATA_ONLY')
  assert.equal(plan.action, 'NO_MUTATION')
  assert.equal(plan.incident, null)
  assert.equal(plan.b4Mutation, 'FORBIDDEN')
})

test('hash nuevo con mismo número/importe crea versión y permite releer sin ámbar B4', () => {
  const plan = planDocumentLifecycle(prior, observation({ fingerprint: { ...prior.fingerprint, contentSha256: sha('d'), quickXorHash: 'quick-d', cTag: 'ctag-d' } }), { status: 'CONFIRMED' })
  assert.equal(plan.assessment.kind, 'NEW_VERSION')
  assert.equal(plan.action, 'CREATE_VERSION')
  assert.equal(plan.nextVersionNumber, 2)
  assert.equal(plan.incident, null)
  assert.equal(plan.contentReReadRecommended, true)
  assert.equal(hasNoAutomaticB4Acceptance(plan), true)
})

test('nuevo número o total en conciliado genera AMBAR y conserva B4', () => {
  const plan = planDocumentLifecycle(prior, observation({
    fingerprint: { ...prior.fingerprint, contentSha256: sha('d'), quickXorHash: 'quick-d', cTag: 'ctag-d', numberFingerprint: sha('e'), amountFingerprint: sha('f') },
    privateMetadata: { originalFileName: 'mock.pdf', documentNumber: 'DOC-NEW', documentDate: '2026-10-01', totalCents: 101, invoiceFiscalIdentity: 'mock-fiscal', partyRole: 'PROVEEDOR', documentClass: 'FACTURA', referencedOriginalReference: null, currencyCode: 'EUR', upstreamVersionRef: 'mock-version-2' },
  }), { status: 'CONFIRMED' })
  assert.equal(plan.incident?.code, 'AMBAR_DOCUMENTO_CAMBIADO')
  assert.deepEqual(plan.incident?.reasons, ['NUMBER_CHANGED', 'AMOUNT_CHANGED'])
  assert.equal(plan.incident?.b4Preserved, true)
  assert.equal(plan.requiresHumanConfirmation, true)
  assert.equal(plan.financialAction, 'NONE')
  assert.equal(plan.b4Mutation, 'FORBIDDEN')
})

test('replanificación idéntica es idempotente y no acepta B4 automáticamente', () => {
  const changed = observation({ fingerprint: { ...prior.fingerprint, contentSha256: sha('d'), quickXorHash: 'quick-d', cTag: 'ctag-d' } })
  const first = planDocumentLifecycle(prior, changed, { status: 'NONE' })
  const replay = planDocumentLifecycle(prior, changed, { status: 'NONE' })
  assert.equal(first.idempotencyKey, replay.idempotencyKey)
  assert.equal(first.idempotencyKey?.length, 64)
  assert.equal(hasNoAutomaticB4Acceptance(first), true)
})

test('archivo privado exige firma/formato y no permite bytes genéricos', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
  const artifact = preparePrivateArtifact(pdf, 'mock.pdf')
  assert.equal(artifact.format, 'PDF')
  assert.equal(artifact.byteLength, pdf.byteLength)
  assert.equal(artifact.contentSha256.length, 64)
  assert.throws(() => preparePrivateArtifact(new Uint8Array([1, 2, 3]), 'mock.pdf'), /FORMAT_OR_SIGNATURE/)
})

console.log('OK: lifecycle pure tests use only synthetic metadata and bytes; no DB, Graph, OCR or B4 mutation.')
