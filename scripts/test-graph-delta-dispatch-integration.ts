/*
 * Integración puramente sintética del consumo Delta durable. No abre Prisma real,
 * Graph, OCR ni red; no modifica datos financieros. Modela las mismas fronteras:
 * persistInventory asigna recibos con rollback, apply los acusa fenced y cancelar
 * deja el evento entregable para otro job.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { FinanceSyncWorker } from '../lib/finanzas/sync-jobs/worker'
import type { ApplyCallbackResult, AtomicApplyResult, FinanceSyncRepository } from '../lib/finanzas/sync-jobs/repository'
import type {
  SyncDeltaDispatch,
  SyncItemRecord,
  SyncJobRecord,
  SyncProvider,
  SyncSourceItem,
} from '../lib/finanzas/sync-jobs/types'
import { oneDriveItemFromDeltaMetadata } from '../lib/finanzas/sync-jobs/providers/onedrive/provider'
import { DeltaAwareOneDriveProvider, ONEDRIVE_DELTA_SOURCE_KEY } from '../lib/finanzas/sync-jobs/providers/onedrive/delta-lifecycle'
import type { GraphDeltaDispatchReader } from '../lib/finanzas/graph-delta-dispatch'
import type { GraphDriveRootDeltaScope } from '../lib/finanzas/graph-delta-adapter'

const now = new Date('2026-10-29T17:00:00.000Z')
const jobId = '11111111-1111-4111-8111-111111111111'
const eventKey = 'a'.repeat(64)
const scope: GraphDriveRootDeltaScope = {
  driveId: 'drive-synthetic',
  sourceKey: ONEDRIVE_DELTA_SOURCE_KEY,
  registeredPaths: [{ routeId: 'root', path: 'safe/root' }],
}

function deltaItem(): SyncSourceItem {
  const item = oneDriveItemFromDeltaMetadata({
    driveId: scope.driveId,
    itemId: 'item-synthetic',
    itemName: 'invoice.pdf',
    canonicalPath: 'safe/root/2. Pendiente de contabilizar o revisar 2026/invoice.pdf',
    byteLength: 12,
    eTag: 'etag-1',
    cTag: 'ctag-1',
    quickXorHash: 'hash-1',
    mimeType: 'application/pdf',
    lastModifiedDateTime: '2026-10-29T16:59:00Z',
  }, scope.registeredPaths[0].path)
  assert.ok(item)
  return item
}

function record(phase: 'INVENTORY' | 'PROCESSING' = 'INVENTORY'): SyncJobRecord {
  return {
    id: jobId, source: 'ONEDRIVE', status: 'RUNNING', phase, trigger: 'MANUAL', idempotencyKey: 'delta-synthetic', requestHash: '',
    scope: {}, checkpoint: {}, actorId: 9, attempts: 0, recoveries: 0, cancelRequestedAt: null,
    leaseToken: 'ignored', leaseUntil: new Date('2026-10-29T18:00:00.000Z'), lastError: null,
    total: phase === 'PROCESSING' ? 1 : null, processed: 0, nuevas: 0, actualizadas: 0, errores: 0, unchanged: 0, cancelled: 0,
    createdAt: now, startedAt: now, finishedAt: null,
  }
}

type DurableState = {
  eventAssignedTo: string | null
  eventAcknowledged: boolean
  item: SyncSourceItem | null
  b4Fingerprint: string
}

class MemoryDurableRepository implements FinanceSyncRepository<object> {
  readonly state: DurableState = { eventAssignedTo: null, eventAcknowledged: false, item: null, b4Fingerprint: 'FINANCE_UNCHANGED' }
  private job = record()
  private claimed = false
  private itemClaimed = false
  failPersistOnce = false
  cancelAtPersist = false

  createManual = async () => { throw new Error('unused') }
  enqueueDaily = async () => ({ kind: 'replay' as const, job: null })
  getJob = async () => this.job
  getJobs = async () => [this.job]
  getActiveJob = async () => this.job
  getLastJob = async () => this.job
  requestCancel = async () => null
  toSummary = (value: SyncJobRecord) => value
  recordWorkerFailure = async () => undefined
  claimNextJob = async () => {
    if (this.claimed) return null
    this.claimed = true
    return { job: this.job, token: 'fenced-token' }
  }
  releaseJob = async () => { this.claimed = false }
  persistInventory = async (input: Parameters<FinanceSyncRepository<object>['persistInventory']>[0]) => {
    if (this.cancelAtPersist) return 'cancelled' as const
    if (this.failPersistOnce) {
      this.failPersistOnce = false
      // Deliberate transactional crash before changing either P2 item or dispatch.
      throw new Error('SYNTHETIC_DELTA_PERSIST_ROLLBACK')
    }
    const dispatched = input.deltaDispatches ?? []
    const admitted = dispatched.find(dispatch => dispatch.itemKey !== null)
    assert.ok(admitted)
    assert.equal(admitted.eventKey, eventKey)
    // Commit point: P2 item + assignment + checkpoint together.
    this.state.item = input.items[0] ?? null
    this.state.eventAssignedTo = jobId
    this.job = { ...this.job, phase: input.complete ? 'PROCESSING' : 'INVENTORY', checkpoint: input.checkpoint as SyncJobRecord['checkpoint'], total: input.complete ? 1 : null }
    return 'ok' as const
  }
  claimNextItem = async () => {
    if (this.job.phase !== 'PROCESSING' || !this.state.item || this.itemClaimed) return null
    this.itemClaimed = true
    const item: SyncItemRecord = {
      id: 'item-row', jobId, source: 'ONEDRIVE', item: this.state.item, sequence: 1, status: 'PROCESSING', outcome: null,
      attempts: 1, retryAt: null, leaseToken: 'fenced-token', leaseUntil: new Date('2026-10-29T18:00:00.000Z'),
      confirmedAt: null, lastError: null, createdAt: now, processedAt: null,
    }
    return { item }
  }
  failPreparedItem = async () => 'final_error' as const
  applyClaimedItem = async (input: Parameters<FinanceSyncRepository<object>['applyClaimedItem']>[0]): Promise<AtomicApplyResult> => {
    assert.ok(this.state.item)
    const outcome: ApplyCallbackResult = await input.apply({}, this.state.item, 9)
    assert.equal(typeof outcome === 'string' ? outcome : outcome.outcome, 'SIN_CAMBIOS')
    // Same synthetic transaction: normal outcome confirmation and Delta receipt.
    assert.equal(this.state.eventAssignedTo, jobId)
    this.state.eventAcknowledged = true
    this.job = { ...this.job, processed: 1, unchanged: 1 }
    const item: SyncItemRecord = {
      id: 'item-row', jobId, source: 'ONEDRIVE', item: this.state.item, sequence: 1, status: 'COMPLETED', outcome: 'SIN_CAMBIOS' as const,
      attempts: 1, retryAt: null, leaseToken: null, leaseUntil: null, confirmedAt: now, lastError: null, createdAt: now, processedAt: now,
    }
    return { kind: 'applied', outcome: 'SIN_CAMBIOS', job: this.job, item }
  }
  finalizeIfDone = async () => this.job
  finalizeCancellation = async () => this.job
}

function deltaProvider(item: SyncSourceItem): SyncProvider {
  return {
    inventory: async () => ({
      items: [item], checkpoint: { schema: 'ONEDRIVE_DELTA_DISPATCH_V1', afterCommittedAt: '2026-10-29T17:00:00Z', afterEventKey: eventKey }, complete: true,
      deltaDispatches: [{ sourceKey: scope.sourceKey, driveId: scope.driveId, eventKey, itemKey: item.key }],
    }),
    prepare: async () => ({ synthetic: true }),
    apply: async () => 'SIN_CAMBIOS',
  }
}

test('un rollback antes de persistir conserva evento Delta y estado financiero; el replay lo consume una vez', async () => {
  const item = deltaItem()
  const repository = new MemoryDurableRepository()
  repository.failPersistOnce = true
  const worker = new FinanceSyncWorker({ repository, providerFactory: () => deltaProvider(item), clock: { now: () => now } })
  await assert.rejects(() => worker.run({ budgetMs: 1_000, itemLimit: 1 }), /SYNTHETIC_DELTA_PERSIST_ROLLBACK/)
  assert.equal(repository.state.eventAssignedTo, null)
  assert.equal(repository.state.eventAcknowledged, false)
  assert.equal(repository.state.item, null)
  assert.equal(repository.state.b4Fingerprint, 'FINANCE_UNCHANGED')

  const result = await worker.run({ budgetMs: 1_000, itemLimit: 1 })
  assert.equal(result.appliedItems, 1)
  assert.equal(repository.state.eventAssignedTo, jobId)
  assert.equal(repository.state.eventAcknowledged, true)
  assert.equal(repository.state.b4Fingerprint, 'FINANCE_UNCHANGED')
})

test('cancelación antes del commit de inventario no asigna ni acusa el evento Delta', async () => {
  const item = deltaItem()
  const repository = new MemoryDurableRepository()
  repository.cancelAtPersist = true
  const worker = new FinanceSyncWorker({ repository, providerFactory: () => deltaProvider(item), clock: { now: () => now } })
  const result = await worker.run({ budgetMs: 1_000, itemLimit: 1 })
  assert.equal(result.cancelled, true)
  assert.equal(repository.state.eventAssignedTo, null)
  assert.equal(repository.state.eventAcknowledged, false)
  assert.equal(repository.state.b4Fingerprint, 'FINANCE_UNCHANGED')
})

test('el wrapper Delta opt-in consume el lector durable y nunca delega al inventario B1', async () => {
  let legacyInventoryCalls = 0
  const item = deltaItem()
  const reader: GraphDeltaDispatchReader = {
    readPage: async () => ({
      items: [item], dispatches: [{ sourceKey: scope.sourceKey, driveId: scope.driveId, eventKey, itemKey: item.key }],
      checkpoint: {}, complete: true,
    }),
  }
  const provider = new DeltaAwareOneDriveProvider({
    delegate: {
      inventory: async () => { legacyInventoryCalls++; throw new Error('LEGACY_INVENTORY_MUST_NOT_RUN') },
      prepare: async () => ({}), apply: async () => 'SIN_CAMBIOS',
    } as any,
    prisma: {} as any,
    transport: { get: async () => { throw new Error('GRAPH_MUST_NOT_RUN') } },
    cursorCipher: { seal: value => value, open: value => value },
    resolveScope: async () => scope,
    assertEffectiveFinanceWriteAccess: async () => true,
    dispatchReader: reader,
  })
  ;(provider as any).scope = scope
  ;(provider as any).jobId = jobId
  const page = await provider.inventory({})
  assert.equal(legacyInventoryCalls, 0)
  assert.deepEqual(page.items, [item])
  assert.equal(page.deltaDispatches?.[0]?.eventKey, eventKey)
})

console.log('OK dispatch Delta: rollback/cancelación/acuse fenced y consumo incremental opt-in con mocks; sin Graph/OCR/Prisma/red.')
