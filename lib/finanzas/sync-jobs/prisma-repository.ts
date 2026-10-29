import { Prisma, type PrismaClient } from '@prisma/client'
import {
  isActiveStatus,
  outcomeSafeError,
  sourceItemMatches,
  summary,
  type ApplyCallbackResult,
  type AtomicApplyResult,
  type DailyEnqueueResult,
  type FinanceSyncRepository,
  type ItemClaim,
  type LeaseClaim,
  type ManualCreateInput,
  type ManualCreateResult,
} from './repository'
import type { JobSummary, SyncDeltaDispatch, SyncItemRecord, SyncJobRecord, SyncOutcome, SyncSource, SyncSourceItem } from './types'

/** PostgreSQL P2 adapter. All state changes use serializable transactions. */
const READ_LIMIT = 100
const MAX_BOUND = 100
const MAX_CANCEL_SERIALIZATION_ATTEMPTS = 3

type Row = Record<string, unknown>
type ReceiptRow = { source: string; requestHash: string; jobId: string | null }

const jobColumns = Prisma.sql`
  j.id, j.source::text AS source, j.trigger::text AS trigger, j.status::text AS status,
  j.phase::text AS phase, j.scope, j.checkpoint, j.total, j.processed, j.nuevas,
  j.actualizadas, j.errores, j.unchanged, j.cancelled,
  j.requested_by_id AS "actorId", j.recoveries,
  j.cancel_requested_at AS "cancelRequestedAt", j.lease_token AS "leaseToken",
  j.lease_until AS "leaseUntil", j.last_error AS "lastError", j.created_at AS "createdAt",
  j.started_at AS "startedAt", j.finished_at AS "finishedAt",
  COALESCE(r.idempotency_key, CASE WHEN d.date_utc IS NOT NULL
    THEN 'daily:' || d.date_utc || ':' || j.source::text ELSE 'job:' || j.id::text END) AS "idempotencyKey",
  COALESCE(r.request_hash, CASE WHEN d.date_utc IS NOT NULL
    THEN d.date_utc || ':' || j.source::text ELSE '' END) AS "requestHash"
`
const receiptJoins = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT idempotency_key, request_hash FROM finance_sync_requests_p2
    WHERE job_id=j.id ORDER BY created_at ASC LIMIT 1
  ) r ON TRUE
  LEFT JOIN LATERAL (
    SELECT date_utc FROM finance_sync_daily_receipts_p2
    WHERE job_id=j.id ORDER BY created_at ASC LIMIT 1
  ) d ON TRUE
`
const itemColumns = Prisma.sql`
  i.id, i.job_id AS "jobId", j.source::text AS source, i.source_key AS "sourceKey",
  i.type::text AS tipo, i.source_data AS data, i.sequence, i.status::text AS status,
  i.outcome::text AS outcome, i.attempts, i.retry_at AS "retryAt",
  i.lease_token AS "leaseToken", i.lease_until AS "leaseUntil",
  i.confirmed_at AS "confirmedAt", i.last_error AS "lastError", i.created_at AS "createdAt",
  i.processed_at AS "processedAt"
`

function num(value: unknown): number { return typeof value === 'number' ? value : Number(value ?? 0) }
function maybeDate(value: unknown): Date | null { return value == null ? null : value instanceof Date ? value : new Date(String(value)) }
function asDate(value: unknown): Date {
  const date = maybeDate(value)
  if (!date || Number.isNaN(date.getTime())) throw new Error('FINANCE_SYNC_P2_INVALID_TIMESTAMP')
  return date
}
function asJson(value: unknown): Prisma.InputJsonValue { return (value ?? {}) as Prisma.InputJsonValue }
function toJson(value: unknown): string { return JSON.stringify(value ?? {}) ?? '{}' }
function bound(value: number): number { return Math.max(1, Math.min(MAX_BOUND, Number.isFinite(value) ? Math.floor(value) : 1)) }
function storedError(value: string): string { return /^[A-Z0-9_]{2,64}$/.test(value) ? value : 'PROVIDER_PREPARE_FAILED' }
function validOutcome(value: unknown): value is SyncOutcome {
  return value === 'NUEVA' || value === 'ACTUALIZADA' || value === 'SIN_CAMBIOS' || value === 'REVISAR' || value === 'ERROR'
}
function deltaDispatchItem(item: SyncSourceItem): boolean {
  return item.tipo !== 'ISP_FACTURA' && !!item.data && typeof item.data === 'object' && !Array.isArray(item.data)
    && (item.data as Record<string, unknown>).deltaDispatch === true
}
function validDeltaDispatch(value: SyncDeltaDispatch, itemKeys: ReadonlySet<string>): SyncDeltaDispatch {
  if (!value || typeof value !== 'object') throw new Error('DELTA_DISPATCH_INVALID')
  const sourceKey = typeof value.sourceKey === 'string' ? value.sourceKey.trim() : ''
  const driveId = typeof value.driveId === 'string' ? value.driveId.trim() : ''
  const eventKey = typeof value.eventKey === 'string' ? value.eventKey.trim().toLowerCase() : ''
  const itemKey = value.itemKey === null ? null : typeof value.itemKey === 'string' ? value.itemKey : null
  if (!sourceKey || sourceKey.length > 256 || !driveId || driveId.length > 512 || !/^[0-9a-f]{64}$/.test(eventKey)) {
    throw new Error('DELTA_DISPATCH_INVALID')
  }
  if (itemKey !== null && (!itemKeys.has(itemKey) || itemKey.length > 512)) throw new Error('DELTA_DISPATCH_INVALID')
  return { sourceKey, driveId, eventKey, itemKey }
}
function isFence(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error)
  return text.includes('FINANCE_SYNC_P2_JOB_FENCE') || text.includes('FINANCE_SYNC_P2_ITEM_FENCE') || text === 'P2_APPLY_FENCE'
}
function isSerializationConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2034'
}
function job(row: Row): SyncJobRecord {
  return {
    id: String(row.id), source: String(row.source) as SyncSource,
    trigger: String(row.trigger) as SyncJobRecord['trigger'], status: String(row.status) as SyncJobRecord['status'],
    phase: String(row.phase) as SyncJobRecord['phase'], idempotencyKey: String(row.idempotencyKey),
    requestHash: String(row.requestHash), scope: asJson(row.scope), checkpoint: asJson(row.checkpoint),
    actorId: row.actorId == null ? null : num(row.actorId), attempts: 0, recoveries: num(row.recoveries),
    cancelRequestedAt: maybeDate(row.cancelRequestedAt), leaseToken: row.leaseToken == null ? null : String(row.leaseToken),
    leaseUntil: maybeDate(row.leaseUntil), lastError: row.lastError == null ? null : String(row.lastError),
    total: row.total == null ? null : num(row.total), processed: num(row.processed), nuevas: num(row.nuevas),
    actualizadas: num(row.actualizadas), errores: num(row.errores), unchanged: num(row.unchanged),
    cancelled: num(row.cancelled), createdAt: asDate(row.createdAt), startedAt: maybeDate(row.startedAt), finishedAt: maybeDate(row.finishedAt),
  }
}
function item(row: Row): SyncItemRecord {
  return {
    id: String(row.id), jobId: String(row.jobId), source: String(row.source) as SyncSource,
    item: { key: String(row.sourceKey), tipo: String(row.tipo) as SyncSourceItem['tipo'], data: asJson(row.data) },
    sequence: num(row.sequence), status: String(row.status) as SyncItemRecord['status'],
    outcome: row.outcome == null ? null : String(row.outcome) as SyncOutcome, attempts: num(row.attempts),
    retryAt: maybeDate(row.retryAt), leaseToken: row.leaseToken == null ? null : String(row.leaseToken),
    leaseUntil: maybeDate(row.leaseUntil), confirmedAt: maybeDate(row.confirmedAt),
    lastError: row.lastError == null ? null : String(row.lastError), createdAt: asDate(row.createdAt), processedAt: maybeDate(row.processedAt),
  }
}

export type PrismaFinanceSyncRepositoryOptions = {
  /** Validated by integration assembly as a live system SUPER_ADMIN. */
  dailyActorId?: number
}

/** No provider network/OCR is executed by this class. */
export class PrismaFinanceSyncRepository implements FinanceSyncRepository<Prisma.TransactionClient> {
  constructor(private readonly prisma: PrismaClient, private readonly options: PrismaFinanceSyncRepositoryOptions = {}) {}

  private serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    // Callback side effects (domain apply) cannot be safely replayed here.
    return this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 45000 })
  }
  /**
   * Cancellation is state-only and idempotent, so this is the sole transaction
   * allowed to retry a PostgreSQL serialization conflict.  In particular, do
   * not move this retry into `serial`: apply callbacks can contain domain DML.
   */
  private async serialCancel<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_CANCEL_SERIALIZATION_ATTEMPTS; attempt++) {
      try {
        return await this.serial(fn)
      } catch (error) {
        if (!isSerializationConflict(error) || attempt + 1 >= MAX_CANCEL_SERIALIZATION_ATTEMPTS) throw error
        // 10 ms then 20 ms: enough separation for the contested row to settle,
        // while keeping this narrow, bounded API operation responsive.
        await new Promise<void>((resolve) => setTimeout(resolve, 10 * (attempt + 1)))
      }
    }
    throw new Error('FINANCE_SYNC_P2_CANCEL_RETRY_EXHAUSTED')
  }
  private async lock(tx: Prisma.TransactionClient, key: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0::bigint)) LIMIT 1`
  }
  private async now(tx: Prisma.TransactionClient): Promise<Date> {
    const rows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now LIMIT 1`
    return asDate(rows[0]?.now)
  }
  private live(jobValue: SyncJobRecord, token: string, now: Date): boolean {
    return jobValue.status === 'RUNNING' && jobValue.leaseToken === token && !!jobValue.leaseUntil && jobValue.leaseUntil > now
  }
  private async getJobTx(tx: Prisma.TransactionClient, id: string, locked = false): Promise<SyncJobRecord | null> {
    const rows = await tx.$queryRaw<Row[]>`
      SELECT ${jobColumns} FROM finance_sync_jobs_p2 j ${receiptJoins}
      WHERE j.id=${id}::uuid LIMIT 1 ${locked ? Prisma.sql`FOR UPDATE OF j` : Prisma.empty}
    `
    return rows[0] ? job(rows[0]) : null
  }
  private async getItemTx(tx: Prisma.TransactionClient, id: string, locked = false): Promise<SyncItemRecord | null> {
    const rows = await tx.$queryRaw<Row[]>`
      SELECT ${itemColumns} FROM finance_sync_items_p2 i JOIN finance_sync_jobs_p2 j ON j.id=i.job_id
      WHERE i.id=${id}::uuid LIMIT 1 ${locked ? Prisma.sql`FOR UPDATE OF i` : Prisma.empty}
    `
    return rows[0] ? item(rows[0]) : null
  }
  /** Derived counters are current item facts; REVISAR deliberately contributes an error. */
  private async counters(tx: Prisma.TransactionClient, jobId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE finance_sync_jobs_p2 j SET
        processed=c.processed, nuevas=c.nuevas, actualizadas=c.actualizadas, errores=c.errores,
        unchanged=c.unchanged, cancelled=c.cancelled,
        -- Keep the latest durable per-item code; successful items never carry one.
        last_error=COALESCE((SELECT i.last_error FROM finance_sync_items_p2 i
          WHERE i.job_id=${jobId}::uuid AND i.last_error IS NOT NULL
          ORDER BY i.updated_at DESC,i.sequence DESC LIMIT 1),j.last_error),
        updated_at=clock_timestamp()
      FROM (
        SELECT COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::int processed,
          COUNT(*) FILTER (WHERE outcome='NUEVA')::int nuevas,
          COUNT(*) FILTER (WHERE outcome='ACTUALIZADA')::int actualizadas,
          COUNT(*) FILTER (WHERE outcome IN ('ERROR','REVISAR'))::int errores,
          COUNT(*) FILTER (WHERE outcome='SIN_CAMBIOS')::int unchanged,
          COUNT(*) FILTER (WHERE status='CANCELLED')::int cancelled
        FROM finance_sync_items_p2 WHERE job_id=${jobId}::uuid LIMIT 1
      ) c WHERE j.id=${jobId}::uuid
    `
  }
  private async activeLocked(tx: Prisma.TransactionClient, source: SyncSource): Promise<SyncJobRecord | null> {
    const rows = await tx.$queryRaw<Row[]>`
      SELECT ${jobColumns} FROM finance_sync_jobs_p2 j ${receiptJoins}
      WHERE j.source=${source}::"FinanceSyncSourceP2" AND j.status IN ('QUEUED','RUNNING','CANCEL_REQUESTED')
      ORDER BY j.updated_at ASC, j.created_at ASC LIMIT 1 FOR UPDATE OF j
    `
    return rows[0] ? job(rows[0]) : null
  }
  private async insertJob(tx: Prisma.TransactionClient, source: SyncSource, trigger: 'MANUAL' | 'DAILY_UTC', actorId: number | null, scope: Prisma.InputJsonValue): Promise<string> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO finance_sync_jobs_p2 (id,source,trigger,scope,checkpoint,requested_by_id,updated_at)
      VALUES (gen_random_uuid(),${source}::"FinanceSyncSourceP2",${trigger}::"FinanceSyncTriggerP2",${toJson(scope)}::jsonb,'{}'::jsonb,${actorId},clock_timestamp())
      RETURNING id
    `
    if (!rows[0]?.id) throw new Error('FINANCE_SYNC_P2_JOB_INSERT_FAILED')
    return rows[0].id
  }

  async createManual(input: ManualCreateInput, authorizeInTx?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<ManualCreateResult> {
    return this.serial(async (tx) => {
      await authorizeInTx?.(tx)
      await this.lock(tx, `finance-sync-p2:request:${input.idempotencyKey}`)
      const receipts = await tx.$queryRaw<ReceiptRow[]>`
        SELECT source::text source, request_hash "requestHash", job_id "jobId" FROM finance_sync_requests_p2
        WHERE idempotency_key=${input.idempotencyKey} LIMIT 1 FOR UPDATE
      `
      const receipt = receipts[0]
      if (receipt) {
        if (receipt.source !== input.source || receipt.requestHash !== input.requestHash || !receipt.jobId) return { kind: 'idempotency_collision' }
        const prior = await this.getJobTx(tx, receipt.jobId, true)
        return prior ? { kind: 'replay', job: prior } : { kind: 'idempotency_collision' }
      }
      await this.lock(tx, `finance-sync-p2:source:${input.source}`)
      const active = await this.activeLocked(tx, input.source)
      if (active) return { kind: 'active_job', activeJob: active }
      const jobId = await this.insertJob(tx, input.source, 'MANUAL', input.actorId, input.scope)
      await tx.$executeRaw`
        INSERT INTO finance_sync_requests_p2 (id,source,kind,idempotency_key,request_hash,actor_id,scope,result,job_id)
        VALUES (gen_random_uuid(),${input.source}::"FinanceSyncSourceP2",'MANUAL'::"FinanceSyncRequestKindP2",${input.idempotencyKey},
          ${input.requestHash},${input.actorId},${toJson(input.scope)}::jsonb,'CREATED'::"FinanceSyncReceiptResultP2",${jobId}::uuid)
      `
      const created = await this.getJobTx(tx, jobId, true)
      if (!created) throw new Error('FINANCE_SYNC_P2_JOB_MISSING_AFTER_INSERT')
      return { kind: 'created', job: created }
    })
  }

  async enqueueDaily(dateUtc: string, source: SyncSource): Promise<DailyEnqueueResult> {
    return this.serial(async (tx) => {
      await this.lock(tx, `finance-sync-p2:daily:${dateUtc}:${source}`)
      const rows = await tx.$queryRaw<{ jobId: string | null }[]>`
        SELECT job_id "jobId" FROM finance_sync_daily_receipts_p2
        WHERE date_utc=${dateUtc} AND source=${source}::"FinanceSyncSourceP2" LIMIT 1 FOR UPDATE
      `
      if (rows[0]) return { kind: 'replay', job: rows[0].jobId ? await this.getJobTx(tx, rows[0].jobId, true) : null }
      await this.lock(tx, `finance-sync-p2:source:${source}`)
      const active = await this.activeLocked(tx, source)
      if (active) {
        await tx.$executeRaw`
          INSERT INTO finance_sync_daily_receipts_p2 (id,date_utc,source,result,job_id)
          VALUES (gen_random_uuid(),${dateUtc},${source}::"FinanceSyncSourceP2",'COALESCED'::"FinanceSyncReceiptResultP2",${active.id}::uuid)
        `
        return { kind: 'coalesced', job: active }
      }
      const actorId = this.options.dailyActorId ?? null
      const jobId = await this.insertJob(tx, source, 'DAILY_UTC', actorId, {})
      await tx.$executeRaw`
        INSERT INTO finance_sync_daily_receipts_p2 (id,date_utc,source,result,job_id)
        VALUES (gen_random_uuid(),${dateUtc},${source}::"FinanceSyncSourceP2",'CREATED'::"FinanceSyncReceiptResultP2",${jobId}::uuid)
      `
      const created = await this.getJobTx(tx, jobId, true)
      if (!created) throw new Error('FINANCE_SYNC_P2_JOB_MISSING_AFTER_DAILY_INSERT')
      return { kind: 'created', job: created }
    })
  }

  async getJob(id: string): Promise<SyncJobRecord | null> { return this.serial((tx) => this.getJobTx(tx, id)) }
  async getJobs(source: SyncSource): Promise<SyncJobRecord[]> {
    return this.serial(async (tx) => {
      const rows = await tx.$queryRaw<Row[]>`
        SELECT ${jobColumns} FROM finance_sync_jobs_p2 j ${receiptJoins}
        WHERE j.source=${source}::"FinanceSyncSourceP2" ORDER BY j.updated_at DESC,j.created_at DESC LIMIT ${READ_LIMIT}
      `
      return rows.map(job)
    })
  }
  async getActiveJob(source: SyncSource): Promise<SyncJobRecord | null> {
    return this.serial(async (tx) => {
      const rows = await tx.$queryRaw<Row[]>`
        SELECT ${jobColumns} FROM finance_sync_jobs_p2 j ${receiptJoins}
        WHERE j.source=${source}::"FinanceSyncSourceP2" AND j.status IN ('QUEUED','RUNNING','CANCEL_REQUESTED')
        ORDER BY j.updated_at ASC,j.created_at ASC LIMIT 1
      `
      return rows[0] ? job(rows[0]) : null
    })
  }
  async getLastJob(source: SyncSource): Promise<SyncJobRecord | null> {
    return this.serial(async (tx) => {
      const rows = await tx.$queryRaw<Row[]>`
        SELECT ${jobColumns} FROM finance_sync_jobs_p2 j ${receiptJoins}
        WHERE j.source=${source}::"FinanceSyncSourceP2" ORDER BY j.updated_at DESC,j.created_at DESC LIMIT 1
      `
      return rows[0] ? job(rows[0]) : null
    })
  }

  async requestCancel(jobId: string, actorId: number, authorizeInTx?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<SyncJobRecord | null> {
    return this.serialCancel(async (tx) => {
      // It is intentionally within the retried callback: authorization is live
      // and must be revalidated on every serialization attempt.
      await authorizeInTx?.(tx)
      const current = await this.getJobTx(tx, jobId, true)
      if (!current) return null
      if (isActiveStatus(current.status)) await tx.$executeRaw`
        UPDATE finance_sync_jobs_p2 SET status='CANCEL_REQUESTED'::"FinanceSyncJobStatusP2",
          cancel_requested_at=COALESCE(cancel_requested_at,clock_timestamp()),cancel_requested_by_id=${actorId},updated_at=clock_timestamp()
        WHERE id=${jobId}::uuid
      `
      return this.getJobTx(tx, jobId, true)
    })
  }


  async claimNextJob(input: { now: Date; leaseUntil: Date; maxRecoveries: number; token: string }): Promise<LeaseClaim> {
    return this.serial(async (tx) => {
      const maxRecoveries = bound(input.maxRecoveries)
      // Bounded retire-and-scan prevents a corrupt/expired oldest row starving ISP or OneDrive.
      for (let pass = 0; pass < MAX_BOUND; pass++) {
        const candidates = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM finance_sync_jobs_p2
          WHERE status IN ('QUEUED','CANCEL_REQUESTED')
             OR (status='RUNNING' AND lease_until IS NOT NULL AND lease_until<clock_timestamp())
          ORDER BY updated_at ASC,created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
        `
        if (!candidates[0]) return null
        const now = await this.now(tx)
        const current = await this.getJobTx(tx, candidates[0].id, true)
        if (!current) continue
        const expired = current.status === 'RUNNING' && !!current.leaseUntil && current.leaseUntil < now
        if (expired && current.recoveries >= maxRecoveries) {
          await tx.$executeRaw`
            UPDATE finance_sync_jobs_p2 SET status='FAILED'::"FinanceSyncJobStatusP2",finished_at=${now},
              last_error='LEASE_RECOVERY_EXHAUSTED',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
            WHERE id=${current.id}::uuid
          `
          continue
        }
        if (expired) {
          await tx.$executeRaw`SELECT finance_sync_p2_recover_expired_items(${current.id}::uuid,${now}::timestamptz,${maxRecoveries}::int)`
          await this.counters(tx, current.id)
        }
        await tx.$executeRaw`
          UPDATE finance_sync_jobs_p2 SET
            status=CASE WHEN cancel_requested_at IS NOT NULL THEN 'CANCEL_REQUESTED'::"FinanceSyncJobStatusP2"
                        ELSE 'RUNNING'::"FinanceSyncJobStatusP2" END,
            recoveries=recoveries+${expired ? 1 : 0},lease_token=${input.token},lease_until=${input.leaseUntil},
            started_at=COALESCE(started_at,${now}),updated_at=clock_timestamp()
          WHERE id=${current.id}::uuid
        `
        const claimed = await this.getJobTx(tx, current.id, true)
        if (!claimed) throw new Error('FINANCE_SYNC_P2_JOB_MISSING_AFTER_CLAIM')
        return { job: claimed, token: input.token }
      }
      return null
    })
  }

  async releaseJob(input: { jobId: string; token: string; now: Date }): Promise<void> {
    await this.serial(async (tx) => {
      // Un apply fallido debe poder retomarse aunque el job se libere antes
      // de caducar. Nunca toca elementos ya confirmados ni otro fencing token.
      await tx.$executeRaw`
        UPDATE finance_sync_items_p2 SET status='RETRY'::"FinanceSyncItemStatusP2",
          lease_token=NULL,lease_until=NULL,retry_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE job_id=${input.jobId}::uuid AND lease_token=${input.token}
          AND confirmed_at IS NULL AND status='PROCESSING'::"FinanceSyncItemStatusP2"
      `
      await tx.$executeRaw`
        UPDATE finance_sync_jobs_p2 SET lease_token=NULL,lease_until=NULL,
          status=CASE WHEN status='RUNNING'::"FinanceSyncJobStatusP2" THEN 'QUEUED'::"FinanceSyncJobStatusP2" ELSE status END,
          updated_at=clock_timestamp()
        WHERE id=${input.jobId}::uuid AND lease_token=${input.token}
      `
    })
  }

  async recordWorkerFailure(input: {jobId:string;token:string;safeError:string;maxRecoveries:number}): Promise<void> {
    await this.serial(async tx => {
      await tx.$executeRaw`
        UPDATE finance_sync_jobs_p2 SET recoveries=recoveries+1,last_error=${storedError(input.safeError)},
          status=CASE WHEN recoveries+1>=${bound(input.maxRecoveries)} THEN 'FAILED'::"FinanceSyncJobStatusP2" ELSE status END,
          finished_at=CASE WHEN recoveries+1>=${bound(input.maxRecoveries)} THEN clock_timestamp() ELSE finished_at END,
          updated_at=clock_timestamp()
        WHERE id=${input.jobId}::uuid AND lease_token=${input.token}
          AND status='RUNNING'::"FinanceSyncJobStatusP2" AND cancel_requested_at IS NULL
      `
    })
  }

  async persistInventory(input: { jobId: string; token: string; now: Date; deadline: Date; checkpoint: unknown; complete: boolean; items: SyncSourceItem[]; deltaDispatches?: readonly SyncDeltaDispatch[] }): Promise<'ok' | 'cancelled' | 'lost_lease' | 'deadline_exceeded'> {
    return this.serial(async (tx) => {
      const now = await this.now(tx)
      const current = await this.getJobTx(tx, input.jobId, true)
      if (!current || !this.live(current, input.token, now)) return 'lost_lease'
      if (current.cancelRequestedAt || current.status === 'CANCEL_REQUESTED') return 'cancelled'
      if (now >= input.deadline) return 'deadline_exceeded'
      if (current.phase !== 'INVENTORY') return 'lost_lease'
      if (input.items.some((sourceItem) => !sourceItemMatches(current.source, sourceItem))) throw new Error('PROVIDER_ITEM_SOURCE_MISMATCH')
      const unique = new Map<string, SyncSourceItem>()
      for (const sourceItem of input.items) unique.set(sourceItem.key, sourceItem)
      const page = Array.from(unique.values());
      const itemKeys = new Set(page.map(sourceItem => sourceItem.key))
      const dispatches = input.deltaDispatches === undefined
        ? []
        : input.deltaDispatches.map(dispatch => validDeltaDispatch(dispatch, itemKeys))
      if (new Set(dispatches.map(dispatch => `${dispatch.sourceKey}:${dispatch.driveId}:${dispatch.eventKey}`)).size !== dispatches.length) {
        throw new Error('DELTA_DISPATCH_DUPLICATE')
      }
      const last = await tx.$queryRaw<{ sequence: number }[]>`
        SELECT sequence FROM finance_sync_items_p2 WHERE job_id=${current.id}::uuid ORDER BY sequence DESC LIMIT 1
      `
      let sequence = num(last[0]?.sequence)
      // Una página ISP puede contener miles de facturas: se escribe en lotes SQL,
      // no con una llamada remota por fila. Todo conserva el mismo checkpoint/tx.
      for (let offset=0; offset<page.length; offset+=250) {
        const tuples=page.slice(offset,offset+250).map(sourceItem => {
          sequence++;
          return Prisma.sql`(gen_random_uuid(),${current.id}::uuid,${sourceItem.key},${sourceItem.tipo}::"FinanceSyncItemTypeP2",${toJson(sourceItem.data)}::jsonb,${sequence},'QUEUED'::"FinanceSyncItemStatusP2",clock_timestamp())`;
        });
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO finance_sync_items_p2 (id,job_id,source_key,type,source_data,sequence,status,updated_at)
          VALUES ${Prisma.join(tuples)}
          ON CONFLICT (job_id,source_key) DO UPDATE SET type=EXCLUDED.type,source_data=EXCLUDED.source_data,updated_at=clock_timestamp()
          WHERE finance_sync_items_p2.confirmed_at IS NULL
        `);
      }
      // Dispatch and P2 source item/checkpoint share this transaction. A rollback
      // leaves the Delta event deliverable; an acknowledged event is never moved.
      for (const dispatch of dispatches) {
        await tx.$executeRaw`
          INSERT INTO finance_graph_delta_dispatches
            (source_key,drive_id,event_key,job_id,item_source_key,dispatched_at,acknowledged_at)
          VALUES (${dispatch.sourceKey},${dispatch.driveId},${dispatch.eventKey},${current.id}::uuid,${dispatch.itemKey},clock_timestamp(),${dispatch.itemKey === null ? Prisma.sql`clock_timestamp()` : Prisma.sql`NULL`})
          ON CONFLICT (source_key,drive_id,event_key) DO UPDATE SET
            job_id=EXCLUDED.job_id,item_source_key=EXCLUDED.item_source_key,dispatched_at=EXCLUDED.dispatched_at,
            acknowledged_at=CASE WHEN finance_graph_delta_dispatches.acknowledged_at IS NULL THEN EXCLUDED.acknowledged_at ELSE finance_graph_delta_dispatches.acknowledged_at END
          WHERE finance_graph_delta_dispatches.acknowledged_at IS NULL
        `
      }
      // Items and checkpoint are in this transaction: no advanced checkpoint after partial-page error.
      if (input.complete) {
        const count = await tx.$queryRaw<{ value: number }[]>`
          SELECT COUNT(*)::int value FROM finance_sync_items_p2 WHERE job_id=${current.id}::uuid LIMIT 1
        `
        await tx.$executeRaw`
          UPDATE finance_sync_jobs_p2 SET checkpoint=${toJson(input.checkpoint)}::jsonb,
            phase='PROCESSING'::"FinanceSyncJobPhaseP2",inventory_complete_at=${now},total=${num(count[0]?.value)},updated_at=clock_timestamp()
          WHERE id=${current.id}::uuid AND status='RUNNING'::"FinanceSyncJobStatusP2" AND lease_token=${input.token}
            AND lease_until>clock_timestamp() AND cancel_requested_at IS NULL
        `
      } else await tx.$executeRaw`
        UPDATE finance_sync_jobs_p2 SET checkpoint=${toJson(input.checkpoint)}::jsonb,updated_at=clock_timestamp()
        WHERE id=${current.id}::uuid AND status='RUNNING'::"FinanceSyncJobStatusP2" AND lease_token=${input.token}
          AND lease_until>clock_timestamp() AND cancel_requested_at IS NULL
      `
      return 'ok'
    })
  }

  async claimNextItem(input: { jobId: string; token: string; now: Date; leaseUntil: Date; maxAttempts: number }): Promise<ItemClaim> {
    return this.serial(async (tx) => {
      const maxAttempts = bound(input.maxAttempts)
      const now = await this.now(tx)
      const current = await this.getJobTx(tx, input.jobId, true)
      if (!current || !this.live(current, input.token, now) || current.cancelRequestedAt || current.phase !== 'PROCESSING') return null
      const exhausted = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM finance_sync_items_p2
        WHERE job_id=${current.id}::uuid AND confirmed_at IS NULL AND status IN ('QUEUED','RETRY') AND attempts>=${maxAttempts}
          AND (status='QUEUED' OR retry_at IS NULL OR retry_at<=${now})
        ORDER BY sequence ASC LIMIT ${MAX_BOUND} FOR UPDATE SKIP LOCKED
      `
      if (exhausted.length) {
        const ids = exhausted.map((row) => row.id)
        await tx.$executeRaw`
          UPDATE finance_sync_items_p2 SET status='FINAL_ERROR'::"FinanceSyncItemStatusP2",outcome='ERROR'::"FinanceSyncOutcomeP2",
            confirmed_at=${now},processed_at=${now},retry_at=NULL,lease_token=NULL,lease_until=NULL,last_error='RETRY_EXHAUSTED',updated_at=clock_timestamp()
          WHERE id=ANY(${ids}::uuid[]) AND job_id=${current.id}::uuid AND confirmed_at IS NULL
        `
        await this.counters(tx, current.id)
      }
      const candidates = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM finance_sync_items_p2
        WHERE job_id=${current.id}::uuid AND confirmed_at IS NULL AND attempts<${maxAttempts}
          AND (status='QUEUED'::"FinanceSyncItemStatusP2" OR (status='RETRY'::"FinanceSyncItemStatusP2" AND (retry_at IS NULL OR retry_at<=${now})))
        ORDER BY sequence ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      `
      if (!candidates[0]) return null
      await tx.$executeRaw`
        UPDATE finance_sync_items_p2 SET status='PROCESSING'::"FinanceSyncItemStatusP2",attempts=attempts+1,
          lease_token=${input.token},lease_until=${input.leaseUntil},retry_at=NULL,updated_at=clock_timestamp()
        WHERE id=${candidates[0].id}::uuid AND job_id=${current.id}::uuid AND confirmed_at IS NULL AND attempts<${maxAttempts}
          AND status IN ('QUEUED','RETRY')
      `
      const claimed = await this.getItemTx(tx, candidates[0].id, true)
      return claimed ? { item: claimed } : null
    })
  }

  async failPreparedItem(input: { jobId: string; itemId: string; token: string; now: Date; safeError: string; maxAttempts: number }): Promise<'retry' | 'final_error' | 'lost_lease' | 'cancelled'> {
    return this.serial(async (tx) => {
      const now = await this.now(tx)
      const current = await this.getJobTx(tx, input.jobId, true)
      if (!current || !this.live(current, input.token, now)) return 'lost_lease'
      if (current.cancelRequestedAt || current.status === 'CANCEL_REQUESTED') return 'cancelled'
      const sourceItem = await this.getItemTx(tx, input.itemId, true)
      if (!sourceItem || sourceItem.jobId !== current.id || sourceItem.confirmedAt || sourceItem.status !== 'PROCESSING' || sourceItem.leaseToken !== input.token || !sourceItem.leaseUntil || sourceItem.leaseUntil<=now) return 'lost_lease'
      const final = sourceItem.attempts >= bound(input.maxAttempts)
      await tx.$executeRaw`
        UPDATE finance_sync_items_p2 SET status=${final ? 'FINAL_ERROR' : 'RETRY'}::"FinanceSyncItemStatusP2",
          outcome=${final ? 'ERROR' : null}::"FinanceSyncOutcomeP2",confirmed_at=${final ? now : null},processed_at=${final ? now : null},
          retry_at=${final ? null : now},lease_token=NULL,lease_until=NULL,last_error=${storedError(input.safeError)},updated_at=clock_timestamp()
        WHERE id=${sourceItem.id}::uuid AND job_id=${current.id}::uuid AND confirmed_at IS NULL AND status='PROCESSING'::"FinanceSyncItemStatusP2"
          AND lease_token=${input.token} AND lease_until>clock_timestamp()
      `
      // A prepare failure is durable even while the item is eligible for retry.
      // A later counters refresh derives the latest remaining item failure code.
      await tx.$executeRaw`
        UPDATE finance_sync_jobs_p2 SET last_error=${storedError(input.safeError)},updated_at=clock_timestamp()
        WHERE id=${current.id}::uuid AND lease_token=${input.token}
      `
      if (final) await this.counters(tx, current.id)
      return final ? 'final_error' : 'retry'
    })
  }


  async applyClaimedItem(input: { jobId: string; itemId: string; token: string; now: Date; deadline: Date; actorId: number | null; authorizeInTx?: (tx: Prisma.TransactionClient) => Promise<void>; safeError?: string | null; apply: (tx: Prisma.TransactionClient, item: SyncSourceItem, actorId: number | null) => Promise<ApplyCallbackResult> }): Promise<AtomicApplyResult> {
    try {
      return await this.serial(async (tx) => {
        // Guard locks job then item and uses PostgreSQL's live clock, not caller time.
        await tx.$executeRaw`SELECT finance_sync_p2_assert_apply_guard(${input.jobId}::uuid,${input.itemId}::uuid,${input.token},${input.deadline})`
        const now = await this.now(tx)
        const current = await this.getJobTx(tx, input.jobId, true)
        const sourceItem = await this.getItemTx(tx, input.itemId, true)
        if (!current || !sourceItem || sourceItem.jobId!==current.id || !this.live(current,input.token,now) || current.cancelRequestedAt || now>=input.deadline || sourceItem.confirmedAt || sourceItem.status!=='PROCESSING' || sourceItem.leaseToken!==input.token || !sourceItem.leaseUntil || sourceItem.leaseUntil<=now) throw new Error('P2_APPLY_FENCE')
        await input.authorizeInTx?.(tx)
        const applied = await input.apply(tx, sourceItem.item, input.actorId)
        const outcome = typeof applied === 'string' ? applied : applied.outcome
        if (!validOutcome(outcome)) throw new Error('FINANCE_SYNC_P2_INVALID_OUTCOME')
        const safeOutcomeError = outcomeSafeError(outcome, typeof applied === 'string' ? input.safeError : applied.safeError ?? input.safeError)
        // Keep domain apply and durable item acknowledgement indivisible, with a second live guard.
        await tx.$executeRaw`SELECT finance_sync_p2_assert_apply_guard(${input.jobId}::uuid,${input.itemId}::uuid,${input.token},${input.deadline})`
        if (deltaDispatchItem(sourceItem.item)) {
          await tx.$executeRaw`
            UPDATE finance_graph_delta_dispatches
            SET acknowledged_at=COALESCE(acknowledged_at,clock_timestamp())
            WHERE job_id=${current.id}::uuid AND item_source_key=${sourceItem.item.key}
              AND acknowledged_at IS NULL
          `
        }
        const committedAt = await this.now(tx)
        await tx.$executeRaw`
          UPDATE finance_sync_items_p2 SET outcome=${outcome}::"FinanceSyncOutcomeP2",
            status=${outcome==='ERROR' ? 'FINAL_ERROR' : 'COMPLETED'}::"FinanceSyncItemStatusP2",confirmed_at=${committedAt},processed_at=${committedAt},
            retry_at=NULL,lease_token=NULL,lease_until=NULL,last_error=${safeOutcomeError},updated_at=clock_timestamp()
          WHERE id=${sourceItem.id}::uuid AND job_id=${current.id}::uuid AND confirmed_at IS NULL
            AND status='PROCESSING'::"FinanceSyncItemStatusP2" AND lease_token=${input.token}
        `
        await this.counters(tx, current.id)
        const committedJob = await this.getJobTx(tx, current.id, true)
        const committedItem = await this.getItemTx(tx, sourceItem.id, true)
        if (!committedJob || !committedItem) throw new Error('FINANCE_SYNC_P2_COMMIT_READ_FAILED')
        return { kind: 'applied', outcome, job: committedJob, item: committedItem }
      })
    } catch (error) {
      if (!isFence(error)) throw error
      const current = await this.getJob(input.jobId)
      return current?.cancelRequestedAt || current?.status==='CANCEL_REQUESTED' ? { kind: 'cancelled' } : { kind: 'lost_lease' }
    }
  }

  async finalizeIfDone(input: { jobId: string; token: string; now: Date }): Promise<SyncJobRecord | null> {
    return this.serial(async (tx) => {
      const now = await this.now(tx)
      const current = await this.getJobTx(tx, input.jobId, true)
      if (!current || !this.live(current,input.token,now) || current.cancelRequestedAt || current.phase!=='PROCESSING') return null
      const unfinished = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM finance_sync_items_p2 WHERE job_id=${current.id}::uuid AND confirmed_at IS NULL
        ORDER BY sequence ASC LIMIT 1 FOR UPDATE SKIP LOCKED
      `
      if (unfinished[0]) return null
      await this.counters(tx, current.id)
      await tx.$executeRaw`
        UPDATE finance_sync_jobs_p2 SET phase='FINALIZING'::"FinanceSyncJobPhaseP2",
          status=CASE WHEN errores>0 THEN 'COMPLETED_WITH_ERRORS'::"FinanceSyncJobStatusP2" ELSE 'COMPLETED'::"FinanceSyncJobStatusP2" END,
          finished_at=${now},updated_at=clock_timestamp()
        WHERE id=${current.id}::uuid AND status='RUNNING'::"FinanceSyncJobStatusP2" AND lease_token=${input.token}
          AND lease_until>clock_timestamp() AND cancel_requested_at IS NULL
      `
      return this.getJobTx(tx, current.id, true)
    })
  }

  async finalizeCancellation(input: { jobId: string; token: string; now: Date }): Promise<SyncJobRecord | null> {
    return this.serial(async (tx) => {
      const current = await this.getJobTx(tx, input.jobId, true)
      if (!current || current.leaseToken!==input.token || !current.cancelRequestedAt) return null
      const now = await this.now(tx)
      await tx.$executeRaw`
        UPDATE finance_sync_items_p2 SET status='CANCELLED'::"FinanceSyncItemStatusP2",lease_token=NULL,lease_until=NULL,retry_at=NULL,
          processed_at=${now},updated_at=clock_timestamp()
        WHERE job_id=${current.id}::uuid AND confirmed_at IS NULL AND status IN ('QUEUED','RETRY','PROCESSING')
      `
      await this.counters(tx, current.id)
      await tx.$executeRaw`
        UPDATE finance_sync_jobs_p2 SET phase='FINALIZING'::"FinanceSyncJobPhaseP2",status='CANCELLED'::"FinanceSyncJobStatusP2",
          finished_at=${now},lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
        WHERE id=${current.id}::uuid AND lease_token=${input.token} AND cancel_requested_at IS NOT NULL
      `
      return this.getJobTx(tx, current.id, true)
    })
  }

  toSummary(jobValue: SyncJobRecord): JobSummary { return summary(jobValue) }
}
