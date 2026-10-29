import type { Prisma } from '@prisma/client'
import type {
  JobSummary,
  SyncItemRecord,
  SyncJobRecord,
  SyncOutcome,
  SyncDeltaDispatch,
  SyncSource,
  SyncSourceItem,
  SyncTrigger,
} from './types'

export type Clock = { now(): Date }

export type ManualCreateInput = {
  source: SyncSource
  actorId: number
  idempotencyKey: string
  requestHash: string
  scope: Prisma.InputJsonValue
}

export type ManualCreateResult =
  | { kind: 'created' | 'replay'; job: SyncJobRecord }
  | { kind: 'idempotency_collision' }
  | { kind: 'active_job'; activeJob: SyncJobRecord }

export type DailyEnqueueResult =
  | { kind: 'created'; job: SyncJobRecord }
  | { kind: 'replay' | 'coalesced'; job: SyncJobRecord | null }

export type LeaseClaim = { job: SyncJobRecord; token: string } | null
export type ItemClaim = { item: SyncItemRecord } | null
export type ApplyCallbackResult = SyncOutcome | { outcome: SyncOutcome; safeError?: string | null }
export type AtomicApplyResult =
  | { kind: 'applied'; outcome: SyncOutcome; job: SyncJobRecord; item: SyncItemRecord }
  | { kind: 'lost_lease' | 'cancelled' | 'deadline_exceeded' }

/**
 * A real PostgreSQL adapter must implement the critical methods with one
 * interactive Prisma transaction and `FOR UPDATE SKIP LOCKED`. The repository,
 * rather than the provider, owns all fences and state transitions.
 */
export interface FinanceSyncRepository<Tx = Prisma.TransactionClient> {
  recordWorkerFailure?(input:{jobId:string;token:string;safeError:string;maxRecoveries:number}):Promise<void>
  createManual(input: ManualCreateInput, authorizeInTx?: (tx: Tx) => Promise<void>): Promise<ManualCreateResult>
  enqueueDaily(dateUtc: string, source: SyncSource): Promise<DailyEnqueueResult>
  getJob(id: string): Promise<SyncJobRecord | null>
  getJobs(source: SyncSource): Promise<SyncJobRecord[]>
  getActiveJob(source: SyncSource): Promise<SyncJobRecord | null>
  getLastJob(source: SyncSource): Promise<SyncJobRecord | null>
  requestCancel(jobId: string, actorId: number, authorizeInTx?: (tx: Tx) => Promise<void>): Promise<SyncJobRecord | null>

  /** Claim only QUEUED, CANCEL_REQUESTED, or expired RUNNING jobs. */
  claimNextJob(input: {
    now: Date
    leaseUntil: Date
    maxRecoveries: number
    token: string
  }): Promise<LeaseClaim>
  releaseJob(input: { jobId: string; token: string; now: Date }): Promise<void>
  persistInventory(input: {
    jobId: string
    token: string
    now: Date
    deadline: Date
    checkpoint: unknown
    complete: boolean
    items: SyncSourceItem[]
    /** Sólo el consumidor Delta opt-in entrega estos recibos privados. */
    deltaDispatches?: readonly SyncDeltaDispatch[]
  }): Promise<'ok' | 'cancelled' | 'lost_lease' | 'deadline_exceeded'>
  claimNextItem(input: {
    jobId: string
    token: string
    now: Date
    leaseUntil: Date
    maxAttempts: number
  }): Promise<ItemClaim>
  failPreparedItem(input: {
    jobId: string
    itemId: string
    token: string
    now: Date
    safeError: string
    maxAttempts: number
  }): Promise<'retry' | 'final_error' | 'lost_lease' | 'cancelled'>
  applyClaimedItem(input: {
    jobId: string
    itemId: string
    token: string
    now: Date
    deadline: Date
    actorId: number | null
    authorizeInTx?: (tx: Tx) => Promise<void>
    /** Optional static annotation; callback annotations take precedence. */
    safeError?: string | null
    apply: (tx: Tx, item: SyncSourceItem, actorId: number | null) => Promise<ApplyCallbackResult>
  }): Promise<AtomicApplyResult>
  finalizeIfDone(input: { jobId: string; token: string; now: Date }): Promise<SyncJobRecord | null>
  finalizeCancellation(input: { jobId: string; token: string; now: Date }): Promise<SyncJobRecord | null>
  toSummary(job: SyncJobRecord): JobSummary
}

export function isActiveStatus(status: SyncJobRecord['status']): boolean {
  return status === 'QUEUED' || status === 'RUNNING' || status === 'CANCEL_REQUESTED'
}

export function sourceItemMatches(source: SyncSource, item: SyncSourceItem): boolean {
  return source === 'ONEDRIVE'
    ? item.tipo === 'ONEDRIVE_FACTURA' || item.tipo === 'ONEDRIVE_CONFIRMING_SOPORTE'
    : item.tipo === 'ISP_FACTURA'
}

export function safeError(error: unknown): string {
  // Do not persist provider responses, URLs, tokens, stacks, or document content.
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : ''
  if (/^[A-Z0-9_]{2,64}$/.test(code)) return code
  const message = error instanceof Error ? error.message : ''
  if (/^(PREPARE_TIMEOUT|DEADLINE_EXCEEDED|FINANCE_SYNC_DISABLED)$/.test(message)) return message
  return 'PROVIDER_PREPARE_FAILED'
}

/** Only closed, non-sensitive codes may cross a provider/repository boundary. */
export function isSafeErrorCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9_]{2,64}$/.test(value)
}

/**
 * `ERROR` and `REVISAR` must retain an actionable, closed code. Successful
 * outcomes deliberately clear any supplied annotation.
 */
export function outcomeSafeError(outcome: SyncOutcome, value: unknown): string | null {
  if (outcome !== 'ERROR' && outcome !== 'REVISAR') return null
  return isSafeErrorCode(value) ? value : 'OUTCOME_REQUIRES_REVIEW'
}

export const systemClock: Clock = { now: () => new Date() }
export function dailyIdempotencyKey(dateUtc: string, source: SyncSource) {
  return `daily:${dateUtc}:${source}`
}
export function summary(job: SyncJobRecord): JobSummary {
  const { id, source, status, phase, total, processed, nuevas, actualizadas, errores, unchanged, cancelled, createdAt, startedAt, finishedAt, lastError } = job
  return { id, source, status, phase, total, processed, nuevas, actualizadas, errores, unchanged, cancelled, createdAt, startedAt, finishedAt, lastError }
}
