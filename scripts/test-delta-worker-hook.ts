/* Prueba mock del hook Delta del worker: sin red, OCR, Prisma ni DML. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { FinanceSyncWorker } from '../lib/finanzas/sync-jobs/worker'
import type { FinanceSyncRepository } from '../lib/finanzas/sync-jobs/repository'
import type { SyncJobRecord, SyncProvider } from '../lib/finanzas/sync-jobs/types'

const now = new Date('2026-10-29T12:00:00.000Z')
function job(phase: 'INVENTORY' | 'PROCESSING' = 'INVENTORY'): SyncJobRecord {
  return {
    id: 'hook-job', source: 'ONEDRIVE', status: 'RUNNING', phase, trigger: 'MANUAL', idempotencyKey: 'hook-key', requestHash: '',
    scope: {}, checkpoint: {}, actorId: 9, attempts: 0, recoveries: 0, cancelRequestedAt: null,
    leaseToken: 'hook-lease', leaseUntil: new Date('2026-10-29T13:00:00.000Z'), lastError: null,
    total: phase === 'PROCESSING' ? 0 : null, processed: 0, nuevas: 0, actualizadas: 0, errores: 0, unchanged: 0, cancelled: 0,
    createdAt: now, startedAt: now, finishedAt: null,
  }
}

function repository(phase: 'INVENTORY' | 'PROCESSING', counts: { inventory: number }): FinanceSyncRepository<object> {
  let claimed = false
  return {
    createManual: async () => { throw new Error('unused') }, enqueueDaily: async () => ({ kind: 'replay', job: null }),
    getJob: async () => job(phase), getJobs: async () => [], getActiveJob: async () => null, getLastJob: async () => null,
    requestCancel: async () => null,
    claimNextJob: async () => claimed ? null : (claimed = true, { job: job(phase), token: 'hook-lease' }),
    releaseJob: async () => undefined,
    persistInventory: async () => { counts.inventory++; return 'ok' },
    claimNextItem: async () => null,
    failPreparedItem: async () => 'final_error', applyClaimedItem: async () => ({ kind: 'lost_lease' }),
    finalizeIfDone: async () => null, finalizeCancellation: async () => null,
    toSummary: (value) => value,
  }
}

function provider(events: string[], reject = false, projectionInvalidated = false): SyncProvider {
  return {
    beforeInventory: async (input) => {
      events.push(`hook:${input.source}:${input.actorId}:${input.leaseToken}`)
      if (reject) throw Object.assign(new Error('denied'), { code: 'DELTA_ACTOR_FORBIDDEN' })
      return projectionInvalidated ? { projectionInvalidated: true } : undefined
    },
    inventory: async () => { events.push('inventory'); return { items: [], checkpoint: { done: true }, complete: true } },
    prepare: async () => ({}),
    apply: async () => 'SIN_CAMBIOS',
  }
}

test('beforeInventory corre una vez con el lease reclamado antes del inventario nativo', async () => {
  const events: string[] = []
  const counts = { inventory: 0 }
  const worker = new FinanceSyncWorker({
    repository: repository('INVENTORY', counts), providerFactory: () => provider(events), clock: { now: () => now },
  })
  await worker.run({ budgetMs: 1_000, itemLimit: 1, inventoryPageLimit: 1 })
  assert.equal(events.length, 2)
  assert.match(events[0], /^hook:ONEDRIVE:9:[0-9a-f-]{36}$/)
  assert.equal(events[1], 'inventory')
  assert.equal(counts.inventory, 1)
})

test('denegación del hook falla antes de inventario y no persiste checkpoint', async () => {
  const events: string[] = []
  const counts = { inventory: 0 }
  const worker = new FinanceSyncWorker({
    repository: repository('INVENTORY', counts), providerFactory: () => provider(events, true), clock: { now: () => now },
  })
  await assert.rejects(() => worker.run({ budgetMs: 1_000, itemLimit: 1 }), /denied/)
  assert.equal(events.length, 1)
  assert.match(events[0], /^hook:ONEDRIVE:9:[0-9a-f-]{36}$/)
  assert.equal(counts.inventory, 0)
})

test('un job ya en procesamiento no vuelve a consultar Delta', async () => {
  const events: string[] = []
  const counts = { inventory: 0 }
  const worker = new FinanceSyncWorker({
    repository: repository('PROCESSING', counts), providerFactory: () => provider(events), clock: { now: () => now },
  })
  await worker.run({ budgetMs: 1_000, itemLimit: 1 })
  assert.deepEqual(events, [])
  assert.equal(counts.inventory, 0)
})

test('el worker propaga sólo la señal durable del hook sin crear otro refresh ni otra sincronización', async () => {
  const events: string[] = []
  const counts = { inventory: 0 }
  const worker = new FinanceSyncWorker({
    repository: repository('INVENTORY', counts), providerFactory: () => provider(events, false, true), clock: { now: () => now },
  })
  const result = await worker.run({ budgetMs: 1_000, itemLimit: 1, inventoryPageLimit: 1 })
  assert.equal(result.projectionInvalidated, true)
  assert.deepEqual(events.length, 2)
  assert.equal(counts.inventory, 1, 'el contrato no sustituye ni vuelve a arrancar inventario')
})

console.log('OK worker Delta hook: preinventario, denial fail-closed y fase processing con mocks; sin Graph/OCR/BD.')
