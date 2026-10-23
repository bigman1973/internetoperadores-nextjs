import assert from 'node:assert/strict'
import { PrismaFinanceSyncRepository } from '../lib/finanzas/sync-jobs/prisma-repository'
import { outcomeSafeError, type ApplyCallbackResult, type FinanceSyncRepository } from '../lib/finanzas/sync-jobs/repository'
import { FinanceSyncWorker } from '../lib/finanzas/sync-jobs/worker'
import type { SyncItemRecord, SyncJobRecord, SyncProvider, SyncSourceItem } from '../lib/finanzas/sync-jobs/types'

/**
 * Focused P2 tests: mocked Prisma only. This script opens no database connection,
 * invokes no provider network, and does not import the application assembly.
 *
 *   npx tsx scripts/test-finance-sync-errors-cancel.ts
 */

const now = new Date('2026-10-23T00:00:00.000Z')
const future = new Date('2026-10-23T01:00:00.000Z')
const sourceItem: SyncSourceItem = { key: 'test:invoice:1', tipo: 'ISP_FACTURA', data: { fixture: true } }

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111', source: 'ISP', trigger: 'MANUAL', status: 'RUNNING', phase: 'PROCESSING',
    scope: {}, checkpoint: {}, total: 1, processed: 0, nuevas: 0, actualizadas: 0, errores: 0, unchanged: 0, cancelled: 0,
    actorId: 7, recoveries: 0, cancelRequestedAt: null, leaseToken: 'lease-token', leaseUntil: future, lastError: null,
    createdAt: now, startedAt: now, finishedAt: null, idempotencyKey: 'job:11111111-1111-4111-8111-111111111111', requestHash: '',
    ...overrides,
  }
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222', jobId: '11111111-1111-4111-8111-111111111111', source: 'ISP',
    sourceKey: sourceItem.key, tipo: sourceItem.tipo, data: sourceItem.data, sequence: 1, status: 'PROCESSING', outcome: null,
    attempts: 1, retryAt: null, leaseToken: 'lease-token', leaseUntil: future, confirmedAt: null, lastError: null,
    createdAt: now, processedAt: null,
    ...overrides,
  }
}

function textOf(statement: unknown): string {
  const sql = statement as { strings?: readonly string[] }
  return Array.isArray(sql?.strings) ? sql.strings.join('?') : String(statement)
}

function p2034(): Error & { code: string } {
  return Object.assign(new Error('serialization conflict'), { code: 'P2034' })
}

async function testOutcomeCodesAndAtomicApply() {
  assert.equal(outcomeSafeError('NUEVA', 'SHOULD_CLEAR'), null)
  assert.equal(outcomeSafeError('ERROR', null), 'OUTCOME_REQUIRES_REVIEW')
  assert.equal(outcomeSafeError('REVISAR', 'lowercase unsafe'), 'OUTCOME_REQUIRES_REVIEW')
  assert.equal(outcomeSafeError('REVISAR', 'ISP_SOURCE_REQUIRES_REVIEW'), 'ISP_SOURCE_REQUIRES_REVIEW')

  const executed: Array<{ statement: unknown; values: unknown[] }> = []
  const tx = {
    $executeRaw: async (statement: unknown, ...values: unknown[]) => { executed.push({ statement, values }); return 1 },
    $queryRaw: async (statement: unknown) => {
      const text = textOf(statement)
      if (text.includes('clock_timestamp() AS now')) return [{ now }]
      if (text.includes('FROM finance_sync_items_p2 i JOIN')) return [itemRow()]
      if (text.includes('FROM finance_sync_jobs_p2 j')) return [jobRow()]
      return []
    },
  }
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) }
  const repository = new PrismaFinanceSyncRepository(prisma as never)
  const result = await repository.applyClaimedItem({
    jobId: String(jobRow().id), itemId: String(itemRow().id), token: 'lease-token', now, deadline: future, actorId: 7,
    safeError: 'not a safe code', apply: async () => 'REVISAR',
  })
  assert.equal(result.kind, 'applied')
  if (result.kind === 'applied') assert.equal(result.outcome, 'REVISAR')
  const itemUpdate = executed.find((entry) => textOf(entry.statement).includes('UPDATE finance_sync_items_p2 SET outcome='))
  assert(itemUpdate, 'No se ejecutó el acknowledgement de item')
  assert(itemUpdate.values.includes('OUTCOME_REQUIRES_REVIEW'), 'El item no guardó el fallback seguro')
  const counterUpdate = executed.find((entry) => textOf(entry.statement).includes('last_error=COALESCE((SELECT i.last_error'))
  assert(counterUpdate, 'Los contadores no propagan el último código seguro al job')
}

async function testCancelRetriesOnlyP2034AndReauthorizes() {
  let transactions = 0
  let authorizations = 0
  let updates = 0
  const tx = {
    $executeRaw: async (statement: unknown) => {
      if (textOf(statement).includes("status='CANCEL_REQUESTED'")) updates++
      return 1
    },
    $queryRaw: async () => [jobRow()],
  }
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      transactions++
      const value = await callback(tx)
      if (transactions < 3) throw p2034()
      return value
    },
  }
  const repository = new PrismaFinanceSyncRepository(prisma as never)
  const cancelled = await repository.requestCancel(String(jobRow().id), 7, async () => { authorizations++ })
  assert(cancelled)
  assert.equal(transactions, 3, 'La cancelación debe intentar como máximo tres serializaciones')
  assert.equal(authorizations, 3, 'El actor debe revalidarse dentro de cada intento de cancelación')
  assert.equal(updates, 3, 'Cada intento abortado vuelve a ejecutar sólo el DML de cancelación')

  let domainTransactions = 0
  let domainDml = 0
  const noRetryPrisma = {
    $transaction: async (callback: (client: {}) => Promise<unknown>) => {
      domainTransactions++
      await callback({})
      throw p2034()
    },
  }
  const noRetryRepository = new PrismaFinanceSyncRepository(noRetryPrisma as never)
  await assert.rejects(
    () => (noRetryRepository as unknown as { serial(fn: (tx: {}) => Promise<void>): Promise<void> }).serial(async () => { domainDml++ }),
    (error: unknown) => (error as { code?: string }).code === 'P2034',
  )
  assert.equal(domainTransactions, 1, 'serial global no puede reintentar DML de dominio')
  assert.equal(domainDml, 1, 'Un callback de dominio no se reproduce tras P2034')
}

function workerJob(): SyncJobRecord {
  return {
    id: 'worker-job', source: 'ISP', status: 'RUNNING', phase: 'PROCESSING', trigger: 'MANUAL', idempotencyKey: 'worker-key', requestHash: '',
    scope: {}, checkpoint: {}, actorId: 7, attempts: 0, recoveries: 0, cancelRequestedAt: null, leaseToken: 'worker-token', leaseUntil: future,
    lastError: null, total: 1, processed: 0, nuevas: 0, actualizadas: 0, errores: 0, unchanged: 0, cancelled: 0,
    createdAt: now, startedAt: now, finishedAt: null,
  }
}

function workerItem(): SyncItemRecord {
  return {
    id: 'worker-item', jobId: 'worker-job', source: 'ISP', item: sourceItem, sequence: 1, status: 'PROCESSING', outcome: null,
    attempts: 1, retryAt: null, leaseToken: 'worker-token', leaseUntil: future, confirmedAt: null, lastError: null, createdAt: now, processedAt: null,
  }
}

async function runDescriptorWorker(descriptor: SyncProvider['describeOutcome']) {
  let claimed = false
  let itemClaimed = false
  let captured: ApplyCallbackResult | undefined
  const tx = { transactionMarker: true }
  const repo: Partial<FinanceSyncRepository<typeof tx>> = {
    claimNextJob: async () => {
      if (claimed) return null
      claimed = true
      return { job: workerJob(), token: 'worker-token' }
    },
    claimNextItem: async () => {
      if (itemClaimed) return null
      itemClaimed = true
      return { item: workerItem() }
    },
    applyClaimedItem: async (input) => {
      captured = await input.apply(tx, sourceItem, 7)
      const outcome = typeof captured === 'string' ? captured : captured.outcome
      return { kind: 'applied', outcome, job: workerJob(), item: workerItem() }
    },
    getJob: async () => workerJob(),
    finalizeIfDone: async () => workerJob(),
    releaseJob: async () => undefined,
  }
  const order: string[] = []
  const provider: SyncProvider = {
    inventory: async () => ({ items: [], checkpoint: {}, complete: true }),
    prepare: async () => ({ prepared: true }),
    apply: async (applyTx) => {
      assert.equal(applyTx, tx, 'apply debe recibir el mismo tx que el callback del repositorio')
      order.push('apply')
      return 'REVISAR'
    },
    describeOutcome: descriptor,
  }
  const warnings: string[] = []
  const worker = new FinanceSyncWorker({
    repository: repo as FinanceSyncRepository<typeof tx>, providerFactory: () => provider,
    clock: { now: () => now }, logger: { info() {}, error() {}, warn(message: unknown) { warnings.push(String(message)) } },
  })
  const result = await worker.run({ budgetMs: 10_000, itemLimit: 1 })
  return { captured, order, warnings, result }
}

async function testWorkerDescriptorsStayInsideApplyCallback() {
  const described = await runDescriptorWorker(() => ({ safeError: 'ISP_SOURCE_REQUIRES_REVIEW' }))
  assert.deepEqual(described.captured, { outcome: 'REVISAR', safeError: 'ISP_SOURCE_REQUIRES_REVIEW' })
  assert.equal(described.result.appliedItems, 1)

  const descriptorFailure = await runDescriptorWorker(() => { throw new Error('provider detail must not escape') })
  assert.deepEqual(descriptorFailure.captured, { outcome: 'REVISAR' })
  assert.equal(descriptorFailure.result.appliedItems, 1, 'Un fallo de descriptor no puede sustituir el outcome de apply')
  assert.deepEqual(descriptorFailure.warnings, ['FINANCE_SYNC_OUTCOME_DESCRIPTION_FAILED'])
}

async function main() {
  await testOutcomeCodesAndAtomicApply()
  await testCancelRetriesOnlyP2034AndReauthorizes()
  await testWorkerDescriptorsStayInsideApplyCallback()
  console.log('Finance sync: códigos seguros, callback transaccional, P2034 de cancelación y no-retry de dominio verificados sin BD/red.')
}

main().catch((error: unknown) => {
  console.error('FINANCE_SYNC_ERRORS_CANCEL_TEST_FAILED')
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
