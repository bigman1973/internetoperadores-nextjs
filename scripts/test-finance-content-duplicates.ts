/* Synthetic-only tests: no Prisma, database, Graph, OCR, network, build or tsc. */
import assert from 'node:assert/strict'
import {
  planContentDuplicate,
  selectCanonicalDocument,
  type DuplicateDocument,
} from '../lib/finanzas/finance-content-duplicates-core'
import {
  DOCUMENT_VERSION_DUPLICATE_LOOKUP_SQL,
  contentDuplicateLookupQuery,
  observeContentDuplicate,
  type DocumentVersionDuplicateStore,
} from '../lib/finanzas/finance-content-duplicates-adapter'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)

function document(overrides: Partial<DuplicateDocument> = {}): DuplicateDocument {
  return {
    lifecycleId: 'lifecycle-a', snapshotId: 'snapshot-a', sourceItemKey: 'source-item-a', kind: 'RECEIVED_INVOICE',
    fingerprint: { sha256Bytes: SHA_A, quickXorHash: 'quick-xor-a', byteLength: 1234, cTag: 'ctag-a', eTag: 'etag-a' },
    fiscal: { cif: 'B-12345678', invoiceNumber: 'INV 42/2026' }, preservesActiveB4: false, firstObservedOrder: 10,
    ...overrides,
  }
}

// Same immutable bytes in a different remote item/folder becomes a soft link only.
const canonical = document({ lifecycleId: 'lifecycle-canonical', snapshotId: 'snapshot-canonical', sourceItemKey: 'folder-a-item', preservesActiveB4: true, firstObservedOrder: 20 })
const duplicate = document({ lifecycleId: 'lifecycle-copy', snapshotId: 'snapshot-copy', sourceItemKey: 'folder-b-item', firstObservedOrder: 1, fingerprint: { sha256Bytes: SHA_A, quickXorHash: 'quick-xor-a', byteLength: 1234, eTag: 'different-etag' } })
const exact = planContentDuplicate(duplicate, [canonical])
assert.equal(exact.kind, 'SOFT_CANONICAL_LINK')
assert.equal(exact.evidence, 'SHA256_BYTES')
assert.equal(exact.canonicalLifecycleId, 'lifecycle-canonical', 'active B4 document wins even when newer')
assert.equal(exact.duplicateLifecycleId, 'lifecycle-copy')
assert.equal(exact.linkMode, 'SOFT_CANONICAL')
assert.equal(exact.requiresHumanConfirmation, false)
assert.equal(exact.autoApproval, false)
assert.equal(exact.mergeDocuments, false)
assert.equal(exact.deleteDocuments, false)
assert.equal(exact.b4Directive, 'PRESERVE_UNCHANGED')

// Without bytes, a matching provider quickXorHash is usable content evidence;
// different eTags remain irrelevant to identity.
const quickOnly = planContentDuplicate(document({
  lifecycleId: 'lifecycle-quick-copy', snapshotId: 'snapshot-quick-copy', sourceItemKey: 'folder-quick-copy',
  fingerprint: { quickXorHash: 'quick-xor-a', byteLength: 1234, eTag: 'etag-new' },
}), [document({
  lifecycleId: 'lifecycle-quick-canonical', snapshotId: 'snapshot-quick-canonical', sourceItemKey: 'folder-quick-canonical',
  fingerprint: { quickXorHash: 'quick-xor-a', byteLength: 1234, eTag: 'etag-old' },
})])
assert.equal(quickOnly.kind, 'SOFT_CANONICAL_LINK')
assert.equal(quickOnly.evidence, 'QUICK_XOR_HASH')

// Equal content with different fiscal CIF/number is never merged blindly.
const conflict = planContentDuplicate(duplicate, [document({ lifecycleId: 'lifecycle-conflict', snapshotId: 'snapshot-conflict', sourceItemKey: 'folder-c-item', fiscal: { cif: 'B87654321', invoiceNumber: 'OTHER-99' } })])
assert.equal(conflict.kind, 'REVIEW_FISCAL_METADATA_CONFLICT')
assert.equal(conflict.requiresHumanConfirmation, true)
assert.equal(conflict.linkMode, 'NONE')
assert.equal(conflict.mergeDocuments, false)
assert.equal(conflict.deleteDocuments, false)
assert.equal(conflict.b4Directive, 'PRESERVE_UNCHANGED')

// The same remote lifecycle with changed bytes is a new version/review, not a copy.
const changed = planContentDuplicate(document({ lifecycleId: 'same-lifecycle', snapshotId: 'new-snapshot', sourceItemKey: 'same-item', fingerprint: { sha256Bytes: SHA_B, quickXorHash: 'quick-xor-b', byteLength: 4321 } }), [
  document({ lifecycleId: 'same-lifecycle', snapshotId: 'old-snapshot', sourceItemKey: 'same-item', fingerprint: { sha256Bytes: SHA_A, quickXorHash: 'quick-xor-a', byteLength: 1234 }, preservesActiveB4: true }),
])
assert.equal(changed.kind, 'REVIEW_VERSION_CHANGED')
assert.equal(changed.requiresHumanConfirmation, true)
assert.equal(changed.canonicalLifecycleId, null)
assert.equal(changed.b4Directive, 'PRESERVE_UNCHANGED')

// Conflicting byte length/hash evidence cannot be resolved by a coincident quick hash.
const collision = planContentDuplicate(duplicate, [document({ lifecycleId: 'lifecycle-collision', snapshotId: 'snapshot-collision', sourceItemKey: 'item-collision', fingerprint: { sha256Bytes: SHA_B, quickXorHash: 'quick-xor-a', byteLength: 1234 } })])
assert.equal(collision.kind, 'REVIEW_HASH_COLLISION')
assert.equal(collision.requiresHumanConfirmation, true)

// eTag alone never supplies content identity.
const insufficient = planContentDuplicate(document({ lifecycleId: 'lifecycle-no-hash', snapshotId: 'snapshot-no-hash', sourceItemKey: 'item-no-hash', fingerprint: { eTag: 'etag-only', cTag: 'ctag-only' } }), [])
assert.equal(insufficient.kind, 'REVIEW_INSUFFICIENT_CONTENT_EVIDENCE')

// Canonical selection is deterministic and gives B4 protection precedence.
const selected = selectCanonicalDocument([
  document({ lifecycleId: 'z', snapshotId: 'z', sourceItemKey: 'z', firstObservedOrder: 1 }),
  document({ lifecycleId: 'a', snapshotId: 'a', sourceItemKey: 'a', firstObservedOrder: 99, preservesActiveB4: true }),
])
assert.equal(selected?.lifecycleId, 'a')

// Confirming/payroll retain their non-VAT scope and never turn into a financial approval.
for (const kind of ['CONFIRMING', 'PAYROLL'] as const) {
  const protectedPlan = planContentDuplicate(document({ lifecycleId: `in-${kind}`, snapshotId: `in-s-${kind}`, sourceItemKey: `in-item-${kind}`, kind }), [
    document({ lifecycleId: `old-${kind}`, snapshotId: `old-s-${kind}`, sourceItemKey: `old-item-${kind}`, kind }),
  ])
  assert.equal(protectedPlan.kind, 'SOFT_CANONICAL_LINK')
  assert.equal(protectedPlan.vatDirective, 'UNCHANGED_OUT_OF_SCOPE')
  assert.equal(protectedPlan.autoApproval, false)
  assert.equal(protectedPlan.b4Directive, 'PRESERVE_UNCHANGED')
}

class FakeDuplicateStore implements DocumentVersionDuplicateStore<object> {
  readonly observations = new Map<string, string>()
  readonly queries: unknown[] = []
  constructor(private readonly rows: readonly DuplicateDocument[]) {}
  async listByContentFingerprint(query: ReturnType<typeof contentDuplicateLookupQuery>): Promise<readonly DuplicateDocument[]> {
    this.queries.push(query)
    return this.rows.slice(0, query.page.limit)
  }
  async recordHashDuplicateObservation(_tx: object, input: { operationKey: string }): Promise<boolean> {
    if (this.observations.has(input.operationKey)) return false
    this.observations.set(input.operationKey, 'recorded')
    return true
  }
}

async function adapterIdempotenceAndLedgerIsolation() {
  const store = new FakeDuplicateStore([canonical])
  const first = await observeContentDuplicate({ store, tx: {}, incoming: duplicate, page: { limit: 1, offset: 0 } })
  const replay = await observeContentDuplicate({ store, tx: {}, incoming: duplicate, page: { limit: 1, offset: 0 } })
  assert.equal(first.plan.kind, 'SOFT_CANONICAL_LINK')
  assert.equal(first.persisted, true)
  assert.equal(first.replay, false)
  assert.equal(replay.persisted, false)
  assert.equal(replay.replay, true)
  assert.equal(store.observations.size, 1)
  assert.deepEqual(store.queries, [
    { schema: 'DOCUMENT_VERSION_LIFECYCLE_V1', fingerprint: { sha256Bytes: SHA_A, quickXorHash: 'quick-xor-a' }, page: { limit: 1, offset: 0 } },
    { schema: 'DOCUMENT_VERSION_LIFECYCLE_V1', fingerprint: { sha256Bytes: SHA_A, quickXorHash: 'quick-xor-a' }, page: { limit: 1, offset: 0 } },
  ])
}

assert.match(DOCUMENT_VERSION_DUPLICATE_LOOKUP_SQL, /LIMIT \$3 OFFSET \$4/)
assert.match(DOCUMENT_VERSION_DUPLICATE_LOOKUP_SQL, /document_version_snapshots/)
assert.throws(() => contentDuplicateLookupQuery({ fingerprint: {}, page: { limit: 10 } }), /DUPLICATE_QUERY_EVIDENCE_REQUIRED/)
assert.throws(() => contentDuplicateLookupQuery({ fingerprint: { sha256Bytes: SHA_A }, page: { limit: 101 } }), /DUPLICATE_PAGE_LIMIT_INVALID/)

adapterIdempotenceAndLedgerIsolation().then(() => {
  console.log('OK: duplicados por bytes enlazan suavemente, conflictos/versiones revisan, B4/IVA permanecen intactos e inserción es idempotente.')
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
