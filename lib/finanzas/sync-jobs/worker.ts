import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { Clock, FinanceSyncRepository } from './repository'
import { safeError, systemClock } from './repository'
import type { SyncProviderFactory } from './types'

export type Logger = Pick<Console, 'info' | 'warn' | 'error'>

export type WorkerOptions = {
  /** Per-invocation execution time. It is capped at Vercel-safe 240 seconds. */
  budgetMs: number
  /** Maximum items prepared in this invocation, independently of time. */
  itemLimit: number
  inventoryPageLimit?: number
  /** Bounded attempts per item. */
  maxItemAttempts?: number
  /** Bounded job recovery attempts after dead leases. */
  maxRecoveries?: number
  /** Hard limit for prepare/OCR. Must not exceed 120 seconds. */
  prepareTimeoutMs?: number
}

export type WorkerResult = {
  claimedJobId: string | null
  inventoryCalls: number
  preparedItems: number
  appliedItems: number
  retriedItems: number
  cancelled: boolean
  finalized: boolean
  exhaustedBudget: boolean
}

const MAX_BUDGET_MS = 240_000
const MAX_PREPARE_TIMEOUT_MS = 120_000

function sleepTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('PREPARE_TIMEOUT')), milliseconds)
  })
  return Promise.race([operation, timeout]).finally(() => { if (timer) clearTimeout(timer) })
}

/**
 * One serverless invocation. It makes no self-call and starts no background work.
 * Provider inventory/prepare happens outside database transactions. The repository
 * re-checks fence, cancellation, and deadline inside the apply transaction.
 */
export class FinanceSyncWorker<Tx> {
  constructor(private readonly deps: {
    repository: FinanceSyncRepository<Tx>
    providerFactory: SyncProviderFactory
    clock?: Clock
    logger?: Logger
    authorizeInTx?: (input: { actorId: number | null; source: 'ONEDRIVE' | 'ISP'; operation: 'apply' }, tx: Tx) => Promise<void>
  }) {}

  async run(options: WorkerOptions): Promise<WorkerResult> {
    const clock = this.deps.clock ?? systemClock
    const budgetMs = Math.max(1, Math.min(options.budgetMs, MAX_BUDGET_MS))
    const prepareTimeoutMs = Math.max(1, Math.min(options.prepareTimeoutMs ?? MAX_PREPARE_TIMEOUT_MS, MAX_PREPARE_TIMEOUT_MS))
    const maxItemAttempts = options.maxItemAttempts ?? 3
    const maxRecoveries = options.maxRecoveries ?? 3
    const start = clock.now()
    const deadline = new Date(start.getTime() + budgetMs)
    // No refresh timer: a claimed execution owns a fence for its full budget plus
    // the maximum OCR timeout, as required even if prepare is currently running.
    const leaseUntil = new Date(start.getTime() + budgetMs + MAX_PREPARE_TIMEOUT_MS)
    const token = randomUUID()
    const result: WorkerResult = { claimedJobId: null, inventoryCalls: 0, preparedItems: 0, appliedItems: 0, retriedItems: 0, cancelled: false, finalized: false, exhaustedBudget: false }

    const claim = await this.deps.repository.claimNextJob({ now: start, leaseUntil, maxRecoveries, token })
    if (!claim) return result
    result.claimedJobId = claim.job.id

    try {
      if (claim.job.status === 'CANCEL_REQUESTED' || claim.job.cancelRequestedAt) {
        result.cancelled = !!await this.deps.repository.finalizeCancellation({ jobId: claim.job.id, token, now: clock.now() })
        return result
      }

      const provider = this.deps.providerFactory(claim.job.source)
      let job = claim.job
      const inventoryPageLimit=Math.max(1,Math.min(options.inventoryPageLimit ?? 1,32));
      while (job.phase === 'INVENTORY' && result.inventoryCalls<inventoryPageLimit && clock.now()<deadline) {
        // Provider network must be outside tx. The barrier is persisted atomically
        // with page items, and only `complete` unlocks PROCESSING.
        result.inventoryCalls++
        const previousCheckpoint=JSON.stringify(job.checkpoint);
        const inventory = await sleepTimeout(provider.inventory(job.checkpoint), Math.min(MAX_PREPARE_TIMEOUT_MS,Math.max(1,deadline.getTime()-clock.now().getTime())))
        if (!inventory.complete && !inventory.items.length && JSON.stringify(inventory.checkpoint)===previousCheckpoint) throw new Error('INVENTORY_NO_PROGRESS')
        const inventoryWrite = await this.deps.repository.persistInventory({
          jobId: job.id, token, now: clock.now(), deadline, checkpoint: inventory.checkpoint,
          complete: inventory.complete, items: inventory.items,
        })
        if (inventoryWrite === 'cancelled') {
          result.cancelled = !!await this.deps.repository.finalizeCancellation({ jobId: job.id, token, now: clock.now() })
          return result
        }
        if (inventoryWrite !== 'ok') { result.exhaustedBudget = inventoryWrite === 'deadline_exceeded'; return result }
        job = (await this.deps.repository.getJob(job.id)) ?? job
      }

      if(job.phase==='INVENTORY') return result

      let madeProgress = true
      while (madeProgress && result.preparedItems < options.itemLimit && clock.now() < deadline) {
        madeProgress = false
        const itemLeaseUntil = leaseUntil
        const itemClaim = await this.deps.repository.claimNextItem({
          jobId: job.id, token, now: clock.now(), leaseUntil: itemLeaseUntil, maxAttempts: maxItemAttempts,
        })
        if (!itemClaim) break
        madeProgress = true
        result.preparedItems++

        let prepared: unknown
        try {
          const remaining = deadline.getTime() - clock.now().getTime()
          if (remaining <= 0) throw new Error('DEADLINE_EXCEEDED')
          prepared = await sleepTimeout(provider.prepare(itemClaim.item.item), Math.min(prepareTimeoutMs, remaining))
        } catch (error) {
          const outcome = await this.deps.repository.failPreparedItem({
            jobId: job.id, itemId: itemClaim.item.id, token, now: clock.now(), safeError: safeError(error), maxAttempts: maxItemAttempts,
          })
          if (outcome === 'retry') result.retriedItems++
          if (outcome === 'cancelled') {
            result.cancelled = !!await this.deps.repository.finalizeCancellation({ jobId: job.id, token, now: clock.now() })
            return result
          }
          continue
        }

        const applied = await this.deps.repository.applyClaimedItem({
          jobId: job.id, itemId: itemClaim.item.id, token, now: clock.now(), deadline, actorId: job.actorId,
          authorizeInTx: this.deps.authorizeInTx
            ? (tx) => this.deps.authorizeInTx!({ actorId: job.actorId, source: job.source, operation: 'apply' }, tx)
            : undefined,
          // Both apply and its optional descriptor are invoked by the repository
          // while its single transaction is open. Descriptor errors are
          // deliberately non-fatal: the domain outcome remains authoritative.
          apply: async (tx, item, actorId) => {
            const outcome = await provider.apply(tx as Prisma.TransactionClient, item, prepared, actorId)
            try {
              const description = provider.describeOutcome?.({ item, prepared, outcome })
              return { outcome, safeError: description?.safeError }
            } catch {
              this.deps.logger?.warn('FINANCE_SYNC_OUTCOME_DESCRIPTION_FAILED')
              return { outcome }
            }
          },
        })
        if (applied.kind === 'applied') result.appliedItems++
        if (applied.kind === 'cancelled') {
          result.cancelled = !!await this.deps.repository.finalizeCancellation({ jobId: job.id, token, now: clock.now() })
          return result
        }
        if (applied.kind === 'deadline_exceeded') { result.exhaustedBudget = true; return result }
      }

      const cancellation = await this.deps.repository.getJob(job.id)
      if (cancellation?.cancelRequestedAt || cancellation?.status === 'CANCEL_REQUESTED') {
        result.cancelled = !!await this.deps.repository.finalizeCancellation({ jobId: job.id, token, now: clock.now() })
      } else {
        result.finalized = !!await this.deps.repository.finalizeIfDone({ jobId: job.id, token, now: clock.now() })
      }
      result.exhaustedBudget ||= clock.now() >= deadline
      return result
    } catch(error) {
      await this.deps.repository.recordWorkerFailure?.({jobId:claim.job.id,token,safeError:safeError(error),maxRecoveries})
      throw error
    } finally {
      await this.deps.repository.releaseJob({ jobId: claim.job.id, token, now: clock.now() })
    }
  }
}
