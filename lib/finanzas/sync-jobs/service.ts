import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { Clock, FinanceSyncRepository } from './repository'
import { systemClock } from './repository'
import type { JobSummary, SyncJobRecord, SyncProviderFactory, SyncSource } from './types'
import { FinanceSyncWorker, type Logger, type WorkerOptions, type WorkerResult } from './worker'

export const FINANCE_SYNC_PERMISSION: Record<SyncSource, string> = {
  ONEDRIVE: 'admin.finanzas.facturas',
  ISP: 'admin.facturacion',
}

export class SyncServiceError extends Error {
  constructor(public readonly code: 'IDEMPOTENCY_COLLISION' | 'ACTIVE_JOB' | 'NOT_FOUND' | 'INVALID_IDEMPOTENCY_KEY', public readonly job?: JobSummary) {
    super(code)
  }
}

export type FinanceSyncServiceDependencies<Tx> = {
  repository: FinanceSyncRepository<Tx>
  providerFactory: SyncProviderFactory
  clock?: Clock
  logger?: Logger
  /** Live permission/state revalidation inside create/cancel/apply DB transactions. */
  authorizeInTx?: (input: { actorId: number | null; source: SyncSource; operation: 'create' | 'cancel' | 'apply' }, tx: Tx) => Promise<void>
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
}
function digest(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex') }
function validateIdempotencyKey(value: string) {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(value)) throw new SyncServiceError('INVALID_IDEMPOTENCY_KEY')
}

export class FinanceSyncService<Tx> {
  private readonly clock: Clock
  constructor(private readonly deps: FinanceSyncServiceDependencies<Tx>) { this.clock = deps.clock ?? systemClock }

  async createManualJob(input: { actorId: number; source: SyncSource; idempotencyKey: string; scope?: Prisma.InputJsonValue }): Promise<{ job: JobSummary; replay: boolean }> {
    validateIdempotencyKey(input.idempotencyKey)
    if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0) throw new Error('UNAUTHENTICATED')
    const scope = input.scope ?? {}
    const outcome = await this.deps.repository.createManual({
      source: input.source, actorId: input.actorId, idempotencyKey: input.idempotencyKey,
      requestHash: digest({ source: input.source, actorId: input.actorId, scope }), scope,
    }, this.deps.authorizeInTx ? (tx) => this.deps.authorizeInTx!({ actorId: input.actorId, source: input.source, operation: 'create' }, tx) : undefined)
    if (outcome.kind === 'idempotency_collision') throw new SyncServiceError('IDEMPOTENCY_COLLISION')
    if (outcome.kind === 'active_job') throw new SyncServiceError('ACTIVE_JOB', this.deps.repository.toSummary(outcome.activeJob))
    return { job: this.deps.repository.toSummary(outcome.job), replay: outcome.kind === 'replay' }
  }

  async cancel(input: { actorId: number; id: string }): Promise<JobSummary> {
    const existing = await this.deps.repository.getJob(input.id)
    if (!existing) throw new SyncServiceError('NOT_FOUND')
    const job = await this.deps.repository.requestCancel(input.id, input.actorId,
      this.deps.authorizeInTx ? (tx) => this.deps.authorizeInTx!({ actorId: input.actorId, source: existing.source, operation: 'cancel' }, tx) : undefined)
    if (!job) throw new SyncServiceError('NOT_FOUND')
    return this.deps.repository.toSummary(job)
  }

  async getJob(id: string): Promise<JobSummary | null> {
    const job = await this.deps.repository.getJob(id)
    return job ? this.deps.repository.toSummary(job) : null
  }

  async dashboard(source: SyncSource, flags: { enabled: boolean; canWrite: boolean }) {
    const [activeJob, lastJob] = await Promise.all([this.deps.repository.getActiveJob(source), this.deps.repository.getLastJob(source)])
    return { enabled: flags.enabled, canWrite: flags.canWrite, activeJob: activeJob && this.deps.repository.toSummary(activeJob), lastJob: lastJob && this.deps.repository.toSummary(lastJob) }
  }

  async enqueueDaily(dateUtc: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateUtc)) throw new Error('INVALID_UTC_DATE')
    return {
      ONEDRIVE: await this.deps.repository.enqueueDaily(dateUtc, 'ONEDRIVE'),
      ISP: await this.deps.repository.enqueueDaily(dateUtc, 'ISP'),
    }
  }

  async runBudgetedWorker(options: WorkerOptions): Promise<WorkerResult> {
    return new FinanceSyncWorker({ ...this.deps, clock: this.clock }).run(options)
  }
}

export function sourceForJob(job: SyncJobRecord) { return job.source }
