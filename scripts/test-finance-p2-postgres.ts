import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

// Ensayo del repositorio real P2, sólo en staging y con rollback obligatorio.
import prisma from '../lib/prisma'
import { PrismaFinanceSyncRepository } from '../lib/finanzas/sync-jobs/prisma-repository'
import { FinanceSyncService, SyncServiceError } from '../lib/finanzas/sync-jobs/service'
import { parseSyncJobsState } from '../components/finanzas/sync-jobs/sync-job-types'

/**
 * P2 PostgreSQL acceptance proof.  It is deliberately not a normal test-runner
 * test: every P2 row, the two temporary admin fixtures, and the only synthetic
 * domain projection exist within one outer SERIALIZABLE transaction and are
 * unconditionally rolled back.
 *
 * Execute only after the P2 DDL/guards and adapter have been integrated:
 *   FINANCE_P2_ROLLBACK_TEST=1 npx tsx \
 *     scripts/test-finance-p2-postgres.ts
 *
 * No provider network/OCR, production datasource, Git, or deployment is used.
 */

const TAG = `P2-${randomUUID()}`
const TEST_DATE = '2099-12-30'
const COALESCE_DATE = '2099-12-31'
const PRIVATE_DIAGNOSTIC = process.env.FINANCE_P2_PRIVATE_DIAGNOSTIC || '/tmp/finance-p2-postgres-private-diagnostic.json'
type Tx = any
type Source = 'ONEDRIVE' | 'ISP'
type Outcome = 'NUEVA' | 'ACTUALIZADA' | 'SIN_CAMBIOS' | 'REVISAR' | 'ERROR'
type Item = { key: string; tipo: 'ONEDRIVE_FACTURA' | 'ONEDRIVE_CONFIRMING_SOPORTE' | 'ISP_FACTURA'; data: any }
type TableHash = { count: string; fingerprint: string }
type Baseline = Record<string, TableHash>

class RollbackSentinel extends Error {
  constructor() { super('FINANCE_P2_ROLLBACK_ONLY') }
}

function equal<T>(actual: T, expected: T, message?: string): asserts actual is T {
  assert.equal(actual, expected, message)
}

function currentTime() { return new Date() }
function after(milliseconds: number) { return new Date(currentTime().getTime() + milliseconds) }
function ispItem(key: string): Item { return { key, tipo: 'ISP_FACTURA', data: { fixture: 'test', key } } }
function driveItem(key: string): Item { return { key, tipo: 'ONEDRIVE_FACTURA', data: { fixture: 'test', key } } }

/** No output includes row contents: only count + one-way aggregate hashes are compared. */
async function originalFinancialBaseline(): Promise<Baseline> {
  const tables = await (prisma as any).$queryRawUnsafe(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname NOT LIKE 'finance_sync_%'
      AND c.relname <> '_prisma_migrations'
    ORDER BY c.relname ASC
  `) as Array<{ name: string }>
  assert(tables.length > 0, 'No se localizaron tablas financieras originales para el baseline')
  const result: Baseline = {}
  for (const row of tables) {
    // Relation names come only from pg_catalog and are quoted before dynamic SQL.
    const relation = `"public"."${row.name.replace(/"/g, '""')}"`
    const hash = await (prisma as any).$queryRawUnsafe(`
      SELECT count(*)::text AS count,
             md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS fingerprint
      FROM ${relation} t
    `) as Array<TableHash>
    equal(hash.length, 1, 'Baseline de tabla original incompleto')
    result[row.name] = { count: String(hash[0]?.count ?? ''), fingerprint: String(hash[0]?.fingerprint ?? '') }
  }
  return result
}

async function p2SchemaAndGuardsPresent() {
  const rows = await (prisma as any).$queryRawUnsafe(`
    SELECT
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname IN (
         'finance_sync_jobs_p2', 'finance_sync_items_p2',
         'finance_sync_requests_p2', 'finance_sync_daily_receipts_p2'
       )) AS tables,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN (
         'finance_sync_p2_assert_apply_guard', 'finance_sync_p2_recover_expired_items'
       )) AS guards
  `) as Array<{ tables: number | string; guards: number | string }>
  equal(Number(rows[0]?.tables ?? 0), 4, 'El DDL P2 no está aplicado íntegramente')
  equal(Number(rows[0]?.guards ?? 0), 2, 'Las guardas SQL P2 no están aplicadas')
}

/** A deterministic, in-process provider. Its only DML target is a TEMP table. */
class SyntheticProvider {
  inventoryCalls = 0
  prepares = 0
  applies = 0
  inventoryComplete = false
  readonly appliedByKey = new Map<string, number>()
  readonly seenActorIds: Array<number | null> = []

  constructor(
    private readonly pages: Array<{ items: Item[]; complete: boolean }>,
    private readonly outcome: Outcome = 'SIN_CAMBIOS',
    private readonly throwApplyOnce = false,
  ) {}

  async inventory(checkpoint: unknown) {
    const pageNumber = typeof checkpoint === 'object' && checkpoint !== null && 'page' in checkpoint
      ? Number((checkpoint as { page?: unknown }).page ?? 0)
      : 0
    const page = this.pages[pageNumber] ?? { items: [], complete: true }
    this.inventoryCalls++
    this.inventoryComplete = page.complete
    return { items: page.items, complete: page.complete, checkpoint: { page: pageNumber + 1 } }
  }

  async prepare(item: Item) {
    // This is the direct inventory-barrier assertion. A worker that prepares after
    // a non-complete page fails before domain DML can occur.
    assert(this.inventoryComplete, 'El worker procesó un item antes de la barrera de inventario completa')
    this.prepares++
    return { key: item.key }
  }

  async apply(tx: Tx, item: Item, _prepared: unknown, actorId: number | null): Promise<Outcome> {
    this.applies++
    this.seenActorIds.push(actorId)
    const count = (this.appliedByKey.get(item.key) ?? 0) + 1
    this.appliedByKey.set(item.key, count)
    await tx.$executeRawUnsafe('INSERT INTO p2_test_domain(marker) VALUES ($1)', item.key)
    if (this.throwApplyOnce && count === 1) throw new Error('SYNTHETIC_APPLY_FAILURE')
    return this.outcome
  }
}

async function tempDomainCount(tx: Tx): Promise<number> {
  const rows = await tx.$queryRawUnsafe('SELECT count(*)::int AS count FROM p2_test_domain') as Array<{ count: number | string }>
  return Number(rows[0]?.count ?? 0)
}

async function itemFacts(tx: Tx, jobId: string) {
  const rows = await tx.$queryRawUnsafe(
    `SELECT
       count(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS confirmed,
       count(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
       count(*)::int AS total
     FROM finance_sync_items_p2 WHERE job_id = $1::uuid`, jobId,
  ) as Array<{ confirmed: number | string; processing: number | string; total: number | string }>
  return {
    confirmed: Number(rows[0]?.confirmed ?? 0),
    processing: Number(rows[0]?.processing ?? 0),
    total: Number(rows[0]?.total ?? 0),
  }
}

async function advanceInventoryOnly(service: FinanceSyncService<any>, repository: any, jobId: string) {
  // Current worker implementations may persist one page per slice or drain pages
  // in one slice. itemLimit=0 makes both forms prove no pre-barrier processing.
  for (let slice = 0; slice < 5; slice++) {
    const state = await repository.getJob(jobId)
    if (state?.phase === 'PROCESSING') return
    await service.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 0 })
  }
  const current = await repository.getJob(jobId)
  equal(current?.phase, 'PROCESSING', 'El inventario sintético no alcanzó la barrera completa')
}

async function setupReadyJob(repository: any, source: Source, actorId: number, key: string, item: Item) {
  const created = await repository.createManual({ actorId, source, idempotencyKey: key, requestHash: createHash('sha256').update(key).digest('hex'), scope: { testRun: TAG } })
  assert(created.kind === 'created', 'No se creó el job de setup')
  if (created.kind !== 'created') throw new Error('SETUP_CREATE_FAILED')
  const token = `setup-${randomUUID()}`
  const claim = await repository.claimNextJob({ now: currentTime(), leaseUntil: after(120_000), maxRecoveries: 2, token })
  assert(claim && claim.job.id === created.job.id, 'No se obtuvo el lease del job de setup')
  const persisted = await repository.persistInventory({
    jobId: created.job.id, token, now: currentTime(), deadline: after(60_000), checkpoint: { ready: true }, complete: true, items: [item],
  })
  equal(persisted, 'ok', 'No se persistió el inventario de setup')
  await repository.releaseJob({ jobId: created.job.id, token, now: currentTime() })
  return created.job.id
}

async function main() {
  if (process.env.FINANCE_P2_ROLLBACK_TEST !== '1') throw new Error('FINANCE_P2_ROLLBACK_TEST=1 es obligatorio')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('P2_ROLLBACK_PRODUCTION_BLOCKED')

  // The runtime connection must name the isolated database and the non-production
  // sandbox role before any write-capable transaction is opened.
  const identity = await (prisma as any).$queryRawUnsafe(
    'SELECT current_database() AS db, current_user AS usuario',
  ) as Array<{ db: string; usuario: string }>
  equal(identity[0]?.db, 'io_staging_finanzas', 'La prueba sólo admite io_staging_finanzas')
  equal(identity[0]?.usuario, 'io_staging_finanzas', 'La prueba sólo admite el usuario aislado io_staging_finanzas')
  await p2SchemaAndGuardsPresent()

  const before = await originalFinancialBaseline()
  const singleton: any = prisma as any
  const realTransaction = singleton.$transaction.bind(singleton)
const createdJobIds: string[] = []
  let reachedRollback = false
  let phase = 'outer-transaction'

  try {
    await realTransaction(async (outerTx: Tx) => {
      // The repository opens interactive transactions. Route them to savepoints in
      // this one outer rollback transaction: a deliberately failing applier must
      // roll back only its inner work rather than poison the test transaction.
      let savepointSequence = 0
      const savepointTransaction = async (callback: (tx: Tx) => Promise<unknown>) => {
        const savepoint = `p2_test_sp_${++savepointSequence}`
        await outerTx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
        try {
          const value = await callback(outerTx)
          await outerTx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
          return value
        } catch (error) {
          await outerTx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          await outerTx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
          throw error
        }
      }
      // The adapter only needs $transaction at its root; every SQL call receives
      // outerTx. This avoids replacing the application's singleton and proves the
      // adapter is safe under an outer rollback harness.
      let transactionTail: Promise<unknown> = Promise.resolve()
      const nestedTransaction = (callback: (tx: Tx) => Promise<unknown>) => {
        const result = transactionTail.then(() => savepointTransaction(callback))
        transactionTail = result.then(() => undefined, () => undefined)
        return result
      }
      const shimClient = { $transaction: nestedTransaction } as any
      const repository = new PrismaFinanceSyncRepository(shimClient)

      await outerTx.$executeRawUnsafe('CREATE TEMP TABLE p2_test_domain (marker text NOT NULL) ON COMMIT DROP')
      const allowed = await outerTx.usuarioAdmin.create({
        data: {
          email: `${TAG.toLowerCase()}-allowed@example.invalid`, nombre: `${TAG}-ALLOWED`,
          passwordHash: '$2b$12$P2RollbackOnlyNoLoginHash', rol: 'SUPER_ADMIN', roles: [], activo: true,
        }, select: { id: true },
      })
      const denied = await outerTx.usuarioAdmin.create({
        data: {
          email: `${TAG.toLowerCase()}-denied@example.invalid`, nombre: `${TAG}-DENIED`,
          passwordHash: '$2b$12$P2RollbackOnlyNoLoginHash', rol: 'SUPER_ADMIN', roles: [], activo: true,
        }, select: { id: true },
      })

      let nullNightlyApplyAuthorized = 0
      const authorizeInTx = async (input: { actorId: number | null; source: Source; operation: 'create' | 'cancel' | 'apply' }, tx: Tx) => {
        // Null is allowed only for durable nightly application; it cannot create or
        // cancel a user job. A SUPER_ADMIN role by itself is not a permission bypass.
        if (input.actorId === null) {
          if (input.operation === 'apply') { nullNightlyApplyAuthorized++; return }
          throw new Error('SYNC_ACTOR_REQUIRED')
        }
        const actor = await tx.usuarioAdmin.findUnique({ where: { id: input.actorId }, select: { id: true, activo: true } })
        if (!actor?.activo || actor.id !== allowed.id) throw new Error('SYNC_PERMISSION_REVOKED')
      }
      const serviceFor = (providers: Record<Source, SyntheticProvider>) => new FinanceSyncService({
        repository, providerFactory: (source: Source) => providers[source] as any, authorizeInTx,
      })

      const inertIsp = new SyntheticProvider([{ items: [], complete: true }])
      const inertDrive = new SyntheticProvider([{ items: [], complete: true }])
      const idempotencyService = serviceFor({ ISP: inertIsp, ONEDRIVE: inertDrive })

      // Manual durable idempotency: exact replay, collision, and active source are
      // all distinguishable. The denied SUPER_ADMIN proves there is no role bypass.
      const manualKey = `p2-${TAG}-manual`
      phase = 'manual-idempotency'
      const manual = await idempotencyService.createManualJob({ actorId: allowed.id, source: 'ISP', idempotencyKey: manualKey, scope: { testRun: TAG, variant: 'A' } })
      createdJobIds.push(manual.job.id)
      const replay = await idempotencyService.createManualJob({ actorId: allowed.id, source: 'ISP', idempotencyKey: manualKey, scope: { variant: 'A', testRun: TAG } })
      equal(replay.replay, true, 'La repetición idéntica no devolvió el job durable')
      equal(replay.job.id, manual.job.id, 'La repetición idéntica creó otro job')
      await assert.rejects(
        () => idempotencyService.createManualJob({ actorId: allowed.id, source: 'ISP', idempotencyKey: manualKey, scope: { testRun: TAG, variant: 'B' } }),
        (error: unknown) => error instanceof SyncServiceError && error.code === 'IDEMPOTENCY_COLLISION',
      )
      await assert.rejects(
        () => idempotencyService.createManualJob({ actorId: allowed.id, source: 'ISP', idempotencyKey: `p2-${TAG}-active` }),
        (error: unknown) => error instanceof SyncServiceError && error.code === 'ACTIVE_JOB',
      )
      await assert.rejects(
        () => idempotencyService.createManualJob({ actorId: denied.id, source: 'ONEDRIVE', idempotencyKey: `p2-${TAG}-denied` }),
        /SYNC_PERMISSION_REVOKED/,
      )
      await idempotencyService.cancel({ actorId: allowed.id, id: manual.job.id })
      const cancelledManual = await idempotencyService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 1 })
      equal(cancelledManual.cancelled, true, 'La cancelación manual no se finalizó cooperativamente')
      equal((await repository.getJob(manual.job.id))?.status, 'CANCELLED')

      // Paged inventory first persists a non-complete page and only later unlocks
      // four items. The provider itself asserts that prepare cannot cross barrier.
      phase = 'inventory-cancel'
      const pagedIsp = new SyntheticProvider([
        { items: [ispItem(`test:${TAG}:barrier-1`), ispItem(`test:${TAG}:barrier-2`)], complete: false },
        { items: [ispItem(`test:${TAG}:barrier-3`), ispItem(`test:${TAG}:barrier-4`)], complete: true },
      ], 'NUEVA')
      const pagedService = serviceFor({ ISP: pagedIsp, ONEDRIVE: inertDrive })
      const paged = await pagedService.createManualJob({ actorId: allowed.id, source: 'ISP', idempotencyKey: `p2-${TAG}-paged` })
      createdJobIds.push(paged.job.id)
      const firstInventory = await pagedService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 0 })
      equal(firstInventory.inventoryCalls, 1, 'El primer slice debía persistir exactamente la primera página')
      const beforeBarrier = await repository.getJob(paged.job.id)
      equal(beforeBarrier?.phase, 'INVENTORY', 'Una página no completa desbloqueó procesamiento')
      equal(beforeBarrier?.total, null, 'La página no completa publicó un total')
      equal(beforeBarrier?.processed, 0, 'La página no completa procesó un item')
      equal(pagedIsp.prepares, 0, 'El worker preparó antes de completar el inventario')
      await advanceInventoryOnly(pagedService, repository, paged.job.id)
      const inventoryReady = await repository.getJob(paged.job.id)
      equal(inventoryReady?.total, 4, 'La barrera completa no materializó exactamente cuatro items')
      equal(inventoryReady?.processed, 0, 'Hubo procesamiento antes de ejecutar un slice de items')
      equal(pagedIsp.prepares, 0, 'El slice inventory-only preparó items')
      const firstProcess = await pagedService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 1 })
      equal(firstProcess.appliedItems, 1, 'El primer slice no confirmó un único item')
      const domainBeforeCancel = await tempDomainCount(outerTx)
      await pagedService.cancel({ actorId: allowed.id, id: paged.job.id })
      const cancellation = await pagedService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 4 })
      equal(cancellation.cancelled, true, 'El worker no terminó la cancelación cooperativa')
      equal(await tempDomainCount(outerTx), domainBeforeCancel, 'La cancelación aplicó un item pendiente')
      const pagedFinal = await repository.getJob(paged.job.id)
      equal(pagedFinal?.status, 'CANCELLED')
      equal(pagedFinal?.cancelled, 3, 'La cancelación no conservó los tres pendientes')
      for (const calls of pagedIsp.appliedByKey.values()) equal(calls, 1, 'Un item confirmado fue aplicado más de una vez')
      const noRepeat = await pagedService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 4 })
      equal(noRepeat.appliedItems, 0, 'Una repetición del worker re-aplicó un item confirmado')

      // Atomicity proof: apply writes only TEMP domain state and deliberately throws.
      // The nested savepoint must erase it and leave no confirmed/retried item.
      phase = 'atomic-apply'
      const atomicCreated = await repository.createManual({
        actorId: allowed.id, source: 'ISP', idempotencyKey: `p2-${TAG}-atomic`, requestHash: `hash:${TAG}:atomic`, scope: { testRun: TAG },
      })
      assert(atomicCreated.kind === 'created')
      if (atomicCreated.kind !== 'created') throw new Error('ATOMIC_JOB_CREATE_FAILED')
      createdJobIds.push(atomicCreated.job.id)
      const atomicToken = `atomic-${randomUUID()}`
      const atomicLease = await repository.claimNextJob({ now: currentTime(), leaseUntil: after(120_000), maxRecoveries: 2, token: atomicToken })
      assert(atomicLease && atomicLease.job.id === atomicCreated.job.id)
      equal(await repository.persistInventory({
        jobId: atomicCreated.job.id, token: atomicToken, now: currentTime(), deadline: after(60_000), checkpoint: { page: 1 }, complete: true,
        items: [ispItem(`test:${TAG}:atomic`)],
      }), 'ok')
      const atomicItem = await repository.claimNextItem({ jobId: atomicCreated.job.id, token: atomicToken, now: currentTime(), leaseUntil: after(120_000), maxAttempts: 3 })
      assert(atomicItem, 'No se reclamó el item atómico')
      const throwingProvider = new SyntheticProvider([{ items: [], complete: true }], 'NUEVA', true)
      const beforeFailedApplyDomain = await tempDomainCount(outerTx)
      await assert.rejects(
        () => repository.applyClaimedItem({
          jobId: atomicCreated.job.id, itemId: atomicItem!.item.id, token: atomicToken, now: currentTime(), deadline: after(60_000), actorId: allowed.id,
          authorizeInTx: (tx: Tx) => authorizeInTx({ actorId: allowed.id, source: 'ISP', operation: 'apply' }, tx),
          apply: (tx: Tx, item: Item, actorId: number | null) => throwingProvider.apply(tx, item, {}, actorId),
        }), /SYNTHETIC_APPLY_FAILURE/,
      )
      equal(await tempDomainCount(outerTx), beforeFailedApplyDomain, 'Un fallo de apply dejó DML sintético fuera del savepoint')
      const failedFacts = await itemFacts(outerTx, atomicCreated.job.id)
      equal(failedFacts.confirmed, 0, 'El item fallido quedó confirmado')
      equal(failedFacts.processing, 1, 'El rollback del savepoint no restauró el item a PROCESSING')
      await repository.requestCancel(atomicCreated.job.id, allowed.id, (tx: Tx) => authorizeInTx({ actorId: allowed.id, source: 'ISP', operation: 'cancel' }, tx))
      equal((await repository.finalizeCancellation({ jobId: atomicCreated.job.id, token: atomicToken, now: currentTime() }))?.status, 'CANCELLED')

      // Stale token must fail the PG apply guard before provider/domain code runs;
      // a new bounded recovery can reclaim only the still-unconfirmed work.
      const staleJob = await setupReadyJob(repository, 'ISP', allowed.id, `p2-${TAG}-stale`, ispItem(`test:${TAG}:stale`))
      phase = 'stale-lease'
      createdJobIds.push(staleJob)
      const staleToken = `stale-${randomUUID()}`
      const staleLease = await repository.claimNextJob({ now: currentTime(), leaseUntil: after(120_000), maxRecoveries: 2, token: staleToken })
      assert(staleLease && staleLease.job.id === staleJob)
      const staleItem = await repository.claimNextItem({ jobId: staleJob, token: staleToken, now: currentTime(), leaseUntil: after(120_000), maxAttempts: 3 })
      assert(staleItem)
      await outerTx.$executeRawUnsafe(
        `UPDATE finance_sync_jobs_p2 SET lease_until = clock_timestamp() - interval '1 second' WHERE id = $1::uuid`, staleJob,
      )
      await outerTx.$executeRawUnsafe(
        `UPDATE finance_sync_items_p2 SET lease_until = clock_timestamp() - interval '1 second' WHERE id = $1::uuid`, staleItem!.item.id,
      )
      let staleProviderCalled = false
      const staleResult = await repository.applyClaimedItem({
        jobId: staleJob, itemId: staleItem!.item.id, token: staleToken, now: currentTime(), deadline: after(60_000), actorId: allowed.id,
        authorizeInTx: (tx: Tx) => authorizeInTx({ actorId: allowed.id, source: 'ISP', operation: 'apply' }, tx),
        apply: async () => { staleProviderCalled = true; return 'NUEVA' as Outcome },
      })
      equal(staleResult.kind, 'lost_lease', 'El token obsoleto no fue vallado por la guarda SQL')
      equal(staleProviderCalled, false, 'El applier se ejecutó después de perder el lease')
      const recovered = await repository.claimNextJob({ now: currentTime(), leaseUntil: after(120_000), maxRecoveries: 2, token: `recovered-${randomUUID()}` })
      assert(recovered && recovered.job.id === staleJob && recovered.job.recoveries === 1, 'La recuperación del lease no fue acotada/atribuida')
      await repository.requestCancel(staleJob, allowed.id, (tx: Tx) => authorizeInTx({ actorId: allowed.id, source: 'ISP', operation: 'cancel' }, tx))
      await repository.finalizeCancellation({ jobId: staleJob, token: recovered!.token, now: currentTime() })

      phase = 'dead-lease-bound'
      const exhaustedCreated = await repository.createManual({
        actorId: allowed.id, source: 'ISP', idempotencyKey: `p2-${TAG}-dead`, requestHash: createHash('sha256').update(`${TAG}:dead`).digest('hex'), scope: { testRun: TAG },
      })
      assert(exhaustedCreated.kind === 'created')
      if (exhaustedCreated.kind !== 'created') throw new Error('DEAD_LEASE_CREATE_FAILED')
      createdJobIds.push(exhaustedCreated.job.id)
      const deadFirst = await repository.claimNextJob({ now: currentTime(), leaseUntil: after(120_000), maxRecoveries: 1, token: `dead-first-${randomUUID()}` })
      assert(deadFirst && deadFirst.job.id === exhaustedCreated.job.id)
      await outerTx.$executeRawUnsafe(`UPDATE finance_sync_jobs_p2 SET lease_until = clock_timestamp() - interval '1 second' WHERE id = $1::uuid`, exhaustedCreated.job.id)
      const deadRecovered = await repository.claimNextJob({ now: currentTime(), leaseUntil: after(120_000), maxRecoveries: 1, token: `dead-recovered-${randomUUID()}` })
      assert(deadRecovered && deadRecovered.job.id === exhaustedCreated.job.id && deadRecovered.job.recoveries === 1)
      await outerTx.$executeRawUnsafe(`UPDATE finance_sync_jobs_p2 SET lease_until = clock_timestamp() - interval '1 second' WHERE id = $1::uuid`, exhaustedCreated.job.id)
      const boundedClaim = await repository.claimNextJob({ now: currentTime(), leaseUntil: after(120_000), maxRecoveries: 1, token: `dead-last-${randomUUID()}` })
      equal(boundedClaim, null, 'Una recuperación de lease agotada volvió a reclamar el job')
      equal((await repository.getJob(exhaustedCreated.job.id))?.status, 'FAILED')

      // Two sources prepared independently are claimed in two bounded worker slices,
      // so an older source cannot starve the other source in the queue.
      phase = 'fair-claims'
      const fairDrive = new SyntheticProvider([{ items: [driveItem(`test:${TAG}:fair-drive`)], complete: true }], 'ACTUALIZADA')
      const fairIsp = new SyntheticProvider([{ items: [ispItem(`test:${TAG}:fair-isp`)], complete: true }], 'SIN_CAMBIOS')
      const fairService = serviceFor({ ONEDRIVE: fairDrive, ISP: fairIsp })
      const fairDriveJob = (await fairService.createManualJob({actorId:allowed.id,source:'ONEDRIVE',idempotencyKey:`p2-${TAG}-fair-drive`})).job.id
      const fairIspJob = (await fairService.createManualJob({actorId:allowed.id,source:'ISP',idempotencyKey:`p2-${TAG}-fair-isp`})).job.id
      createdJobIds.push(fairDriveJob, fairIspJob)
      await fairService.runBudgetedWorker({budgetMs:30_000,itemLimit:0})
      await fairService.runBudgetedWorker({budgetMs:30_000,itemLimit:0})
      const fairOne = await fairService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 1 })
      const fairTwo = await fairService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 1 })
      assert(fairOne.claimedJobId && fairTwo.claimedJobId && fairOne.claimedJobId !== fairTwo.claimedJobId, 'Dos slices justos no reclamaron fuentes distintas')
      assert([fairDriveJob, fairIspJob].includes(fairOne.claimedJobId) && [fairDriveJob, fairIspJob].includes(fairTwo.claimedJobId), 'El worker reclamó un job ajeno a la prueba de equidad')
      equal((await repository.getJob(fairDriveJob))?.status, 'COMPLETED')
      equal((await repository.getJob(fairIspJob))?.status, 'COMPLETED')

      // Persistence is repository-backed: a new service invocation (no UI/session
      // state) resumes an inventory-complete job and finalizes it exactly once.
      const resumeProvider = new SyntheticProvider([{ items: [ispItem(`test:${TAG}:resume`)], complete: true }], 'REVISAR')
      phase = 'durable-resume-dto'
      const resumeStarter = serviceFor({ ISP: resumeProvider, ONEDRIVE: inertDrive })
      const resume = await resumeStarter.createManualJob({ actorId: allowed.id, source: 'ISP', idempotencyKey: `p2-${TAG}-resume` })
      createdJobIds.push(resume.job.id)
      await advanceInventoryOnly(resumeStarter, repository, resume.job.id)
      const resumedInvocation = serviceFor({ ISP: resumeProvider, ONEDRIVE: inertDrive })
      const resumed = await resumedInvocation.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 1 })
      equal(resumed.claimedJobId, resume.job.id, 'La nueva invocación no leyó el checkpoint durable')
      equal((await repository.getJob(resume.job.id))?.status, 'COMPLETED_WITH_ERRORS')
      equal((await repository.getJob(resume.job.id))?.errores, 1, 'REVISAR debe contribuir al contador errores')
      equal((await repository.getJob(resume.job.id))?.processed, 1, 'Los contadores terminales no cierran processed')
      const reviewed = await repository.getJob(resume.job.id)
      equal(reviewed?.processed, (reviewed?.nuevas ?? 0) + (reviewed?.actualizadas ?? 0) + (reviewed?.errores ?? 0) + (reviewed?.unchanged ?? 0), 'processed no coincide con la suma de outcomes terminales')
      const repeatCompleted = await resumedInvocation.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 1 })
      equal(repeatCompleted.appliedItems, 0, 'Un worker repetido aplicó un item ya confirmado')
      equal(resumeProvider.appliedByKey.get(`test:${TAG}:resume`), 1, 'El ítem confirmado fue aplicado más de una vez')

      // Dashboard output is serialized exactly as the HTTP DTO and parsed by the
      // real UI parser. Its discriminated union is narrowed with ok === false.
      const dashboard = await resumedInvocation.dashboard('ISP', { enabled: true, canWrite: true })
      const parsedDashboard = parseSyncJobsState(JSON.parse(JSON.stringify(dashboard)))
      if (parsedDashboard.ok === false) assert.fail(`El DTO real del dashboard no parsea: ${parsedDashboard.error}`)
      equal(parsedDashboard.value.enabled, true)
      assert(parsedDashboard.value.lastJob !== null, 'El dashboard no expuso el último job durable')
      equal(parsedDashboard.value.lastJob?.processed, 1)

      // Nightly enqueue creates both sources once, repeats exactly, and coalesces a
      // different day onto active jobs. ONEDRIVE includes an item to prove actor
      // null is allowed only for apply, not a permission-free manual operation.
      const nightlyDrive = new SyntheticProvider([{ items: [driveItem(`test:${TAG}:nightly`)], complete: true }], 'SIN_CAMBIOS')
      phase = 'nightly'
      const nightlyIsp = new SyntheticProvider([{ items: [], complete: true }])
      const nightlyService = serviceFor({ ONEDRIVE: nightlyDrive, ISP: nightlyIsp })
      const dailyOne = await nightlyService.enqueueDaily(TEST_DATE)
      assert(dailyOne.ONEDRIVE.job && dailyOne.ISP.job)
      createdJobIds.push(dailyOne.ONEDRIVE.job!.id, dailyOne.ISP.job!.id)
      equal(dailyOne.ONEDRIVE.kind, 'created')
      equal(dailyOne.ISP.kind, 'created')
      const dailyReplay = await nightlyService.enqueueDaily(TEST_DATE)
      equal(dailyReplay.ONEDRIVE.kind, 'replay')
      equal(dailyReplay.ISP.kind, 'replay')
      const dailyCoalesced = await nightlyService.enqueueDaily(COALESCE_DATE)
      equal(dailyCoalesced.ONEDRIVE.kind, 'coalesced')
      equal(dailyCoalesced.ISP.kind, 'coalesced')
      const coalesceReplay = await nightlyService.enqueueDaily(COALESCE_DATE)
      equal(coalesceReplay.ONEDRIVE.kind, 'replay')
      equal(coalesceReplay.ISP.kind, 'replay')
      const receiptCounts = await outerTx.$queryRawUnsafe(
        `SELECT count(*)::int AS count FROM finance_sync_daily_receipts_p2
         WHERE date_utc IN ($1, $2) AND source IN ('ONEDRIVE', 'ISP')`, TEST_DATE, COALESCE_DATE,
      ) as Array<{ count: number | string }>
      equal(Number(receiptCounts[0]?.count ?? 0), 4, 'Daily replay/coalesce añadió recibos duplicados')
      for (let slice = 0; slice < 4 && (await repository.getJob(dailyOne.ONEDRIVE.job!.id))?.status !== 'COMPLETED'; slice++) {
        await nightlyService.runBudgetedWorker({ budgetMs: 30_000, itemLimit: 1 })
      }
      equal((await repository.getJob(dailyOne.ONEDRIVE.job!.id))?.actorId, null, 'El job nightly no conservó actor nulo')
      equal((await repository.getJob(dailyOne.ONEDRIVE.job!.id))?.status, 'COMPLETED')
      assert(nullNightlyApplyAuthorized > 0, 'El callback no distinguió apply nocturno con actor nulo')
      assert(nightlyDrive.seenActorIds.includes(null), 'El applier nocturno no recibió actor nulo')

      // Force any deferred constraints before the mandatory outer rollback.
      await outerTx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      // All P2 state is intentionally pending destruction with the one outer tx.
      reachedRollback = true
      throw new RollbackSentinel()
    }, { isolationLevel: 'Serializable' as any, maxWait: 20_000, timeout: 240_000 })
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) {
      const candidate = error as { code?: unknown; message?: unknown } | null
      const raw = typeof candidate?.code === 'string' ? candidate.code : typeof candidate?.message === 'string' ? candidate.message : 'P2_ROLLBACK_UNKNOWN'
      const code = /^[A-Z0-9_]{2,80}$/.test(raw) ? raw : 'P2_ROLLBACK_FAILED'
      writeFileSync(PRIVATE_DIAGNOSTIC, JSON.stringify({ phase, code, message: String(candidate?.message ?? "").slice(0, 1600) }) + '\n', { mode: 0o600 })
      throw error
    }
  }

  assert(reachedRollback, 'La transacción exterior no alcanzó el rollback obligatorio')
  const baselineAfter = await originalFinancialBaseline()
  assert.deepEqual(baselineAfter, before, 'El rollback alteró una tabla financiera original')
  const remnants = await (prisma as any).$queryRawUnsafe(
    `SELECT (
      (SELECT count(*) FROM finance_sync_jobs_p2 WHERE id = ANY($1::uuid[])) +
      (SELECT count(*) FROM finance_sync_items_p2 WHERE job_id = ANY($1::uuid[])) +
      (SELECT count(*) FROM finance_sync_requests_p2 WHERE job_id = ANY($1::uuid[])) +
      (SELECT count(*) FROM finance_sync_daily_receipts_p2 WHERE job_id = ANY($1::uuid[]))
    )::int AS count`, createdJobIds,
  ) as Array<{ count: number | string }>
  equal(Number(remnants[0]?.count ?? 0), 0, 'El rollback dejó jobs, items o receipts P2 sintéticos')
  console.log('P2 PostgreSQL rollback: aislamiento, guardas, idempotencia, barrera, atomicidad, leases, cancelación, DTO, daily y rollback verificados.')
}

main()
  .catch((error: unknown) => {
    // Do not disclose SQL, IDs, provider metadata, row values, credentials, or PII.
    try {
      const existing = (() => { try { return JSON.parse(require('node:fs').readFileSync(PRIVATE_DIAGNOSTIC, 'utf8')) as { phase?: unknown } } catch { return null } })()
      const candidate = error as { code?: unknown; message?: unknown } | null
      const raw = typeof candidate?.code === 'string' ? candidate.code : typeof candidate?.message === 'string' ? candidate.message : 'P2_ROLLBACK_UNKNOWN'
      const code = /^[A-Z0-9_]{2,80}$/.test(raw) ? raw : 'P2_ROLLBACK_FAILED'
      writeFileSync(PRIVATE_DIAGNOSTIC, JSON.stringify({ phase: typeof existing?.phase === 'string' ? existing.phase : 'preflight-or-postrollback', code }) + '\n', { mode: 0o600 })
    } catch { /* private diagnostics must never alter rollback behavior */ }
    console.error('La prueba PostgreSQL P2 no se completó; no se ha autorizado ninguna persistencia.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
