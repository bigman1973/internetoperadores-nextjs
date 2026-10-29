/*
 * Ensayo PostgreSQL local y reversible para el despacho durable Graph Delta -> P2.
 *
 * Uso intencionadamente restringido:
 *   FINANCE_DELTA_DISPATCH_ROLLBACK_TEST=1 node_modules/.bin/tsx \
 *     scripts/test-graph-delta-dispatch-postgres.ts
 *
 * Requiere el socket privado local autorizado. No usa DATABASE_URL, Graph, OCR,
 * red de proveedor, flags de aplicación, ni fuentes financieras reales. El DDL,
 * grants temporales y fixtures opacos viven en una única transacción SERIALIZABLE
 * que termina siempre con ROLLBACK. El recibo sólo contiene agregados sanos.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { Prisma } from '@prisma/client'
import { PrismaGraphDeltaDispatchReader } from '../lib/finanzas/graph-delta-dispatch'
import { PrismaFinanceSyncRepository } from '../lib/finanzas/sync-jobs/prisma-repository'
import { FACTURAS_BASE_PATH } from '../lib/finanzas/sync-jobs/providers/onedrive/provider'

const ROOT = resolve(__dirname, '..')
const PRIVATE_CONFIG = '/home/ubuntu/conciliar-cierre-20261029/privado/local-admin-db.json'
const RECEIPT_PATH = '/home/ubuntu/conciliar-documentos-20261029/equipos/f/recibo-sql-real.json'
const MIGRATION_PATH = resolve(ROOT, 'prisma/migrations/20261029_graph_delta_dispatch/migration.sql')
const SESSION_LOCK = 'documental-candidate-db-tests'
const SERVICE_ROLE = 'io_staging_finanzas'
const EXPECTED_DATABASE = 'io_staging_finanzas'
const EXPECTED_PORT = 55440
const PRIVATE_SOCKET_PREFIX = '/home/ubuntu/conciliar-cierre-20261029/privado/'

type PrivateConfig = Readonly<{
  host: string
  port: number
  user: string
  database: string
  password?: string
  ssl?: boolean
}>
type PgResultRow = Record<string, unknown>
type PgTx = {
  $queryRaw<T = unknown>(input: unknown, ...values: unknown[]): Promise<T>
  $executeRaw(input: unknown, ...values: unknown[]): Promise<number>
  $queryRawUnsafe<T = unknown>(text: string, ...values: unknown[]): Promise<T>
  $executeRawUnsafe(text: string, ...values: unknown[]): Promise<number>
}
type Scope = Readonly<{ sourceKey: string; driveId: string; invoiceRootPath: string }>
type CreatedClaim = Readonly<{ id: string; token: string }>
type AggregateFingerprint = Readonly<{ count: string; fingerprint: string }>

class ScenarioRollback extends Error {
  constructor() { super('DELTA_DISPATCH_SCENARIO_ROLLBACK') }
}

function invariant(value: unknown, code: string): asserts value {
  assert.ok(value, code)
}

function equal<T>(actual: T, expected: T, code: string): asserts actual is T {
  assert.equal(actual, expected, code)
}

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function future(milliseconds: number): Date {
  return new Date(Date.now() + milliseconds)
}

function config(): PrivateConfig {
  const parsed = JSON.parse(readFileSync(PRIVATE_CONFIG, 'utf8')) as Partial<PrivateConfig>
  invariant(typeof parsed.host === 'string' && parsed.host.startsWith(PRIVATE_SOCKET_PREFIX), 'DELTA_SQL_SOCKET_REJECTED')
  equal(parsed.port, EXPECTED_PORT, 'DELTA_SQL_PORT_REJECTED')
  equal(parsed.database, EXPECTED_DATABASE, 'DELTA_SQL_DATABASE_REJECTED')
  invariant(typeof parsed.user === 'string' && parsed.user.length > 0, 'DELTA_SQL_USER_REJECTED')
  return {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    database: parsed.database,
    password: typeof parsed.password === 'string' ? parsed.password : '',
    ssl: false,
  }
}

/** Converts only Prisma tagged SQL / explicit Prisma.Sql values into pg queries. */
function pgStatement(input: unknown, values: readonly unknown[]): Readonly<{ text: string; values: readonly unknown[] }> {
  const sql = Array.isArray(input) && Object.prototype.hasOwnProperty.call(input, 'raw')
    ? Prisma.sql(input as unknown as TemplateStringsArray, ...values)
    : input
  invariant(!!sql && typeof sql === 'object', 'DELTA_SQL_STATEMENT_INVALID')
  const candidate = sql as { text?: unknown; values?: unknown }
  invariant(typeof candidate.text === 'string' && Array.isArray(candidate.values), 'DELTA_SQL_STATEMENT_INVALID')
  return { text: candidate.text, values: candidate.values }
}

/**
 * Minimal Prisma-shaped client bound to the single outer pg.Client session. Its
 * $transaction implementation uses savepoints, so every repository transaction
 * remains inside the enclosing mandatory ROLLBACK and a failing scenario cannot
 * poison the rest of the acceptance proof.
 */
class RollbackTxClient implements PgTx {
  private savepoint = 0
  private tail: Promise<void> = Promise.resolve()

  constructor(private readonly client: Client) {}

  async $queryRaw<T = unknown>(input: unknown, ...values: unknown[]): Promise<T> {
    const statement = pgStatement(input, values)
    const result = await this.client.query(statement.text, [...statement.values])
    return result.rows as T
  }

  async $executeRaw(input: unknown, ...values: unknown[]): Promise<number> {
    const statement = pgStatement(input, values)
    const result = await this.client.query(statement.text, [...statement.values])
    return result.rowCount ?? 0
  }

  async $queryRawUnsafe<T = unknown>(text: string, ...values: unknown[]): Promise<T> {
    const result = await this.client.query(text, values as unknown[])
    return result.rows as T
  }

  async $executeRawUnsafe(text: string, ...values: unknown[]): Promise<number> {
    const result = await this.client.query(text, values as unknown[])
    return result.rowCount ?? 0
  }

  $transaction<T>(callback: (tx: RollbackTxClient) => Promise<T>, _options?: unknown): Promise<T> {
    const run = async (): Promise<T> => {
      const savepoint = `delta_dispatch_nested_${++this.savepoint}`
      await this.client.query(`SAVEPOINT ${savepoint}`)
      try {
        const value = await callback(this)
        await this.client.query(`RELEASE SAVEPOINT ${savepoint}`)
        return value
      } catch (error) {
        await this.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
        await this.client.query(`RELEASE SAVEPOINT ${savepoint}`)
        throw error
      }
    }
    const result = this.tail.then(run, run)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

async function sourceFingerprint(client: Client, table: 'finance_graph_delta_topology' | 'finance_graph_delta_events'): Promise<AggregateFingerprint> {
  const relation = table === 'finance_graph_delta_topology'
    ? 'public.finance_graph_delta_topology'
    : 'public.finance_graph_delta_events'
  const result = await client.query(`
    SELECT count(*)::text AS count,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS fingerprint
    FROM ${relation} t
  `)
  return { count: String(result.rows[0]?.count ?? ''), fingerprint: String(result.rows[0]?.fingerprint ?? '') }
}

async function sourceSchemaFingerprint(client: Client): Promise<string> {
  const result = await client.query(`
    SELECT md5(coalesce(string_agg(
      c.relname || ':' || a.attnum::text || ':' || a.attname || ':' || a.atttypid::text || ':' || a.attnotnull::text || ':' || a.atthasdef::text,
      '' ORDER BY c.relname,a.attnum
    ), '')) AS fingerprint
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public'
      AND c.relname IN ('finance_graph_delta_topology','finance_graph_delta_events')
      AND a.attnum>0 AND NOT a.attisdropped
  `)
  return String(result.rows[0]?.fingerprint ?? '')
}

async function sequenceFingerprint(client: Client): Promise<AggregateFingerprint> {
  const result = await client.query(`
    SELECT count(*)::text AS count,
      md5(coalesce(string_agg(
        schemaname || ':' || sequencename || ':' || coalesce(last_value::text, 'null'),
        '' ORDER BY schemaname,sequencename
      ), '')) AS fingerprint
    FROM pg_sequences
    WHERE schemaname='public'
  `)
  return { count: String(result.rows[0]?.count ?? ''), fingerprint: String(result.rows[0]?.fingerprint ?? '') }
}

async function preflight(client: Client): Promise<void> {
  const result = await client.query(`
    SELECT current_database() AS database_name,
      inet_server_addr() IS NULL AS unix_socket,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$1) AS service_role,
      to_regclass('public.finance_graph_delta_dispatches') IS NULL AS dispatch_absent,
      (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('finance_sync_p2_assert_apply_guard','finance_sync_p2_recover_expired_items'))::int AS p2_guards
  `, [SERVICE_ROLE])
  const row = result.rows[0] as { database_name?: unknown; unix_socket?: unknown; service_role?: unknown; dispatch_absent?: unknown; p2_guards?: unknown } | undefined
  equal(row?.database_name, EXPECTED_DATABASE, 'DELTA_SQL_DATABASE_RUNTIME_REJECTED')
  equal(row?.unix_socket, true, 'DELTA_SQL_NON_SOCKET_SERVER_REJECTED')
  equal(row?.service_role, true, 'DELTA_SQL_SERVICE_ROLE_MISSING')
  equal(row?.dispatch_absent, true, 'DELTA_SQL_DISPATCH_ALREADY_PRESENT')
  equal(Number(row?.p2_guards ?? 0), 2, 'DELTA_SQL_P2_GUARDS_MISSING')
}

async function migrationShape(client: Client): Promise<void> {
  const result = await client.query(`
    SELECT
      (SELECT count(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='finance_graph_delta_topology'
         AND column_name IN ('file_size','e_tag','c_tag','quick_xor_hash','mime_type','last_modified_at'))::int AS metadata_columns,
      (SELECT count(*) FROM pg_constraint c
       JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
       WHERE n.nspname='public' AND r.relname='finance_graph_delta_dispatches'
         AND c.contype='f')::int AS foreign_keys,
      (SELECT count(*) FROM pg_indexes
       WHERE schemaname='public' AND tablename='finance_graph_delta_dispatches')::int AS indexes
  `)
  const row = result.rows[0] as { metadata_columns?: unknown; foreign_keys?: unknown; indexes?: unknown } | undefined
  equal(Number(row?.metadata_columns ?? 0), 6, 'DELTA_SQL_MIGRATION_METADATA_COLUMNS')
  equal(Number(row?.foreign_keys ?? 0), 1, 'DELTA_SQL_MIGRATION_FOREIGN_KEY')
  invariant(Number(row?.indexes ?? 0) >= 3, 'DELTA_SQL_MIGRATION_INDEXES')
}

function scope(tag: string): Scope {
  return {
    sourceKey: `delta-rollback-${tag}`,
    driveId: `drive-${tag}`,
    invoiceRootPath: FACTURAS_BASE_PATH,
  }
}

async function seedSourceFixtures(client: Client, input: Readonly<{ scope: Scope; eventCount: number; seed: string }>): Promise<void> {
  const itemId = `item-${input.seed}`
  const path = `${input.scope.invoiceRootPath}/2. Pendiente de contabilizar o revisar 2026/fixture-${input.seed}.pdf`
  await client.query(`
    INSERT INTO finance_graph_delta_topology
      (source_key,drive_id,item_id,parent_item_id,item_name,is_folder,is_deleted,canonical_path,in_registered_scope,needs_location_review,
       file_size,e_tag,c_tag,quick_xor_hash,mime_type,last_modified_at,updated_at)
    VALUES ($1,$2,$3,NULL,$4,FALSE,FALSE,$5,TRUE,FALSE,1,$6,$7,$8,'application/pdf','2099-01-01T00:00:00Z',clock_timestamp())
  `, [input.scope.sourceKey, input.scope.driveId, itemId, `fixture-${input.seed}.pdf`, path, `etag-${input.seed}`, `ctag-${input.seed}`, `hash-${input.seed}`])
  for (let sequence = 0; sequence < input.eventCount; sequence++) {
    await client.query(`
      INSERT INTO finance_graph_delta_events
        (source_key,drive_id,event_key,page_key,item_id,kind,sequence,committed_at)
      VALUES ($1,$2,$3,$4,$5,'UPSERT',$6,clock_timestamp())
    `, [
      input.scope.sourceKey,
      input.scope.driveId,
      sha(`event:${input.seed}:${sequence}:${randomUUID()}`),
      sha(`page:${input.seed}:${sequence}`),
      itemId,
      sequence,
    ])
  }
}

async function grantServiceForRollbackOnly(client: Client): Promise<void> {
  await client.query(`GRANT USAGE ON SCHEMA public TO ${SERVICE_ROLE}`)
  await client.query(`GRANT SELECT, INSERT, UPDATE ON TABLE
    finance_sync_jobs_p2, finance_sync_items_p2, finance_sync_requests_p2,
    finance_graph_delta_events, finance_graph_delta_topology, finance_graph_delta_dispatches
    TO ${SERVICE_ROLE}`)
  await client.query(`GRANT USAGE ON TYPE
    "FinanceSyncSourceP2", "FinanceSyncTriggerP2", "FinanceSyncJobStatusP2", "FinanceSyncJobPhaseP2",
    "FinanceSyncItemTypeP2", "FinanceSyncItemStatusP2", "FinanceSyncOutcomeP2", "FinanceSyncRequestKindP2",
    "FinanceSyncReceiptResultP2" TO ${SERVICE_ROLE}`)
  await client.query(`GRANT EXECUTE ON FUNCTION finance_sync_p2_assert_apply_guard(uuid,uuid,text,timestamptz) TO ${SERVICE_ROLE}`)
  await client.query('CREATE TEMP TABLE delta_dispatch_apply_probe (marker text NOT NULL) ON COMMIT DROP')
  await client.query(`GRANT SELECT, INSERT ON TABLE delta_dispatch_apply_probe TO ${SERVICE_ROLE}`)
  await client.query(`SET LOCAL ROLE ${SERVICE_ROLE}`)
  const identity = await client.query('SELECT current_user AS service_user')
  equal(identity.rows[0]?.service_user, SERVICE_ROLE, 'DELTA_SQL_SERVICE_ROLE_NOT_EFFECTIVE')
}

async function createAndClaim(repository: PrismaFinanceSyncRepository, label: string): Promise<CreatedClaim> {
  const idempotencyKey = `delta-rb-${label}-${randomUUID()}`
  const created = await repository.createManual({
    actorId: null as unknown as number,
    source: 'ONEDRIVE',
    idempotencyKey,
    requestHash: sha(idempotencyKey),
    scope: { synthetic: true },
  })
  equal(created.kind, 'created', 'DELTA_SQL_JOB_CREATE')
  if (created.kind !== 'created') throw new Error('DELTA_SQL_JOB_CREATE')
  const token = `delta-lease-${randomUUID()}`
  const claim = await repository.claimNextJob({ now: new Date(), leaseUntil: future(120_000), maxRecoveries: 2, token })
  invariant(claim && claim.job.id === created.job.id, 'DELTA_SQL_JOB_CLAIM')
  return { id: created.job.id, token }
}

async function dispatchFacts(tx: PgTx, jobId: string): Promise<Readonly<{ total: number; acknowledged: number }>> {
  const rows = await tx.$queryRawUnsafe<Array<{ total: number | string; acknowledged: number | string }>>(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE acknowledged_at IS NOT NULL)::int AS acknowledged
    FROM finance_graph_delta_dispatches WHERE job_id=$1::uuid
  `, jobId)
  return { total: Number(rows[0]?.total ?? 0), acknowledged: Number(rows[0]?.acknowledged ?? 0) }
}

async function itemFacts(tx: PgTx, jobId: string): Promise<Readonly<{ total: number; confirmed: number; cancelled: number }>> {
  const rows = await tx.$queryRawUnsafe<Array<{ total: number | string; confirmed: number | string; cancelled: number | string }>>(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS confirmed,
      count(*) FILTER (WHERE status='CANCELLED')::int AS cancelled
    FROM finance_sync_items_p2 WHERE job_id=$1::uuid
  `, jobId)
  return {
    total: Number(rows[0]?.total ?? 0),
    confirmed: Number(rows[0]?.confirmed ?? 0),
    cancelled: Number(rows[0]?.cancelled ?? 0),
  }
}

async function probeCount(tx: PgTx): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ count: number | string }>>('SELECT count(*)::int AS count FROM delta_dispatch_apply_probe')
  return Number(rows[0]?.count ?? 0)
}

async function outerSavepoint(client: Client, label: string, work: () => Promise<void>): Promise<void> {
  const savepoint = `delta_dispatch_case_${label}`
  await client.query(`SAVEPOINT ${savepoint}`)
  try {
    await work()
    await client.query(`RELEASE SAVEPOINT ${savepoint}`)
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`)
    await client.query(`RELEASE SAVEPOINT ${savepoint}`)
    throw error
  }
}

async function testReaderPersistApply(
  client: Client,
  tx: RollbackTxClient,
  repository: PrismaFinanceSyncRepository,
  reader: PrismaGraphDeltaDispatchReader,
  input: Readonly<{ scope: Scope }>,
): Promise<void> {
  const claim = await createAndClaim(repository, 'reader-persist-apply')

  // The deliberate savepoint failure proves P2 item + receipt assignment +
  // checkpoint all disappear together before the real page is persisted.
  const initial = await reader.readPage({ jobId: claim.id, scope: input.scope, checkpoint: {}, limit: 1 })
  equal(initial.items.length, 1, 'DELTA_SQL_READER_ITEM')
  equal(initial.dispatches.length, 1, 'DELTA_SQL_READER_DISPATCH')
  await assert.rejects(async () => {
    await outerSavepoint(client, 'persist_rollback', async () => {
      equal(await repository.persistInventory({
        jobId: claim.id, token: claim.token, now: new Date(), deadline: future(60_000),
        checkpoint: {}, complete: false, items: [...initial.items], deltaDispatches: initial.dispatches,
      }), 'ok', 'DELTA_SQL_PERSIST_ROLLBACK_SETUP')
      equal((await dispatchFacts(tx, claim.id)).total, 1, 'DELTA_SQL_PERSIST_ROLLBACK_RECEIPT_VISIBLE')
      equal((await itemFacts(tx, claim.id)).total, 1, 'DELTA_SQL_PERSIST_ROLLBACK_ITEM_VISIBLE')
      throw new ScenarioRollback()
    })
  }, ScenarioRollback)
  equal((await dispatchFacts(tx, claim.id)).total, 0, 'DELTA_SQL_PERSIST_ROLLBACK_RECEIPT')
  equal((await itemFacts(tx, claim.id)).total, 0, 'DELTA_SQL_PERSIST_ROLLBACK_ITEM')
  const replay = await reader.readPage({ jobId: claim.id, scope: input.scope, checkpoint: {}, limit: 1 })
  equal(replay.dispatches.length, 1, 'DELTA_SQL_READER_REPLAY_AFTER_ROLLBACK')

  equal(await repository.persistInventory({
    jobId: claim.id, token: claim.token, now: new Date(), deadline: future(60_000),
    checkpoint: {}, complete: false, items: [...replay.items], deltaDispatches: replay.dispatches,
  }), 'ok', 'DELTA_SQL_PERSIST_FIRST_PAGE')
  equal((await dispatchFacts(tx, claim.id)).total, 1, 'DELTA_SQL_PERSIST_FIRST_ASSIGNMENT')
  equal((await itemFacts(tx, claim.id)).total, 1, 'DELTA_SQL_PERSIST_FIRST_ITEM')

  const second = await reader.readPage({ jobId: claim.id, scope: input.scope, checkpoint: {}, limit: 1 })
  equal(second.dispatches.length, 1, 'DELTA_SQL_READER_SECOND_PAGE')
  equal(await repository.persistInventory({
    jobId: claim.id, token: claim.token, now: new Date(), deadline: future(60_000),
    checkpoint: {}, complete: false, items: [...second.items], deltaDispatches: second.dispatches,
  }), 'ok', 'DELTA_SQL_PERSIST_SECOND_PAGE')
  equal((await dispatchFacts(tx, claim.id)).total, 2, 'DELTA_SQL_PERSIST_TWO_RECEIPTS_ONE_ITEM')
  equal((await itemFacts(tx, claim.id)).total, 1, 'DELTA_SQL_PERSIST_DEDUPED_ITEM')

  const terminalEmptyPage = await reader.readPage({ jobId: claim.id, scope: input.scope, checkpoint: {}, limit: 1 })
  equal(terminalEmptyPage.dispatches.length, 0, 'DELTA_SQL_READER_ASSIGNED_TO_SAME_JOB_EXCLUDED')
  equal(terminalEmptyPage.complete, true, 'DELTA_SQL_READER_EMPTY_COMPLETE')
  equal(await repository.persistInventory({
    jobId: claim.id, token: claim.token, now: new Date(), deadline: future(60_000),
    checkpoint: {}, complete: true, items: [], deltaDispatches: [],
  }), 'ok', 'DELTA_SQL_CHECKPOINT_COMPLETE')
  equal((await repository.getJob(claim.id))?.phase, 'PROCESSING', 'DELTA_SQL_CHECKPOINT_PHASE')

  const item = await repository.claimNextItem({ jobId: claim.id, token: claim.token, now: new Date(), leaseUntil: future(120_000), maxAttempts: 3 })
  invariant(item, 'DELTA_SQL_ITEM_CLAIM')
  const applied = await repository.applyClaimedItem({
    jobId: claim.id,
    itemId: item.item.id,
    token: claim.token,
    now: new Date(),
    deadline: future(60_000),
    actorId: null,
    apply: async (applyTx) => {
      await (applyTx as unknown as PgTx).$executeRawUnsafe('INSERT INTO delta_dispatch_apply_probe(marker) VALUES ($1)', 'apply')
      return 'SIN_CAMBIOS'
    },
  })
  equal(applied.kind, 'applied', 'DELTA_SQL_APPLY')
  equal((await dispatchFacts(tx, claim.id)).acknowledged, 2, 'DELTA_SQL_APPLY_ACK_ALL_ITEM_RECEIPTS')
  equal((await itemFacts(tx, claim.id)).confirmed, 1, 'DELTA_SQL_APPLY_ITEM_CONFIRMED')
  equal(await probeCount(tx), 1, 'DELTA_SQL_APPLY_DOMAIN_PROBE_ONCE')

  let replayApplied = false
  const applyReplay = await repository.applyClaimedItem({
    jobId: claim.id,
    itemId: item.item.id,
    token: claim.token,
    now: new Date(),
    deadline: future(60_000),
    actorId: null,
    apply: async () => { replayApplied = true; return 'SIN_CAMBIOS' },
  })
  equal(applyReplay.kind, 'lost_lease', 'DELTA_SQL_APPLY_IDEMPOTENT_FENCE')
  equal(replayApplied, false, 'DELTA_SQL_APPLY_REPLAY_CALLBACK_BLOCKED')
  equal(await probeCount(tx), 1, 'DELTA_SQL_APPLY_REPLAY_NO_DOMAIN_DUPLICATE')
  equal((await dispatchFacts(tx, claim.id)).acknowledged, 2, 'DELTA_SQL_APPLY_REPLAY_NO_ACK_DUPLICATE')

  equal((await repository.finalizeIfDone({ jobId: claim.id, token: claim.token, now: new Date() }))?.status, 'COMPLETED', 'DELTA_SQL_FINALIZE')
  await repository.releaseJob({ jobId: claim.id, token: claim.token, now: new Date() })
}

async function testCancellationBetweenPages(
  tx: RollbackTxClient,
  repository: PrismaFinanceSyncRepository,
  reader: PrismaGraphDeltaDispatchReader,
  input: Readonly<{ scope: Scope }>,
): Promise<void> {
  const cancelled = await createAndClaim(repository, 'cancel-between-pages')
  const first = await reader.readPage({ jobId: cancelled.id, scope: input.scope, checkpoint: {}, limit: 1 })
  equal(first.dispatches.length, 1, 'DELTA_SQL_CANCEL_FIRST_PAGE_READ')
  equal(await repository.persistInventory({
    jobId: cancelled.id, token: cancelled.token, now: new Date(), deadline: future(60_000),
    checkpoint: {}, complete: false, items: [...first.items], deltaDispatches: first.dispatches,
  }), 'ok', 'DELTA_SQL_CANCEL_FIRST_PAGE_PERSIST')
  const second = await reader.readPage({ jobId: cancelled.id, scope: input.scope, checkpoint: {}, limit: 1 })
  equal(second.dispatches.length, 1, 'DELTA_SQL_CANCEL_SECOND_PAGE_READ')
  await tx.$executeRawUnsafe(`
    UPDATE finance_sync_jobs_p2
    SET status='CANCEL_REQUESTED'::"FinanceSyncJobStatusP2",cancel_requested_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=$1::uuid AND lease_token=$2
  `, cancelled.id, cancelled.token)
  // `persistInventory` fences a CANCEL_REQUESTED row through `live()` before its
  // cooperative-cancellation branch. Both results are non-writing; this exact
  // assertion proves no second page can be assigned after cancellation arrives.
  equal(await repository.persistInventory({
    jobId: cancelled.id, token: cancelled.token, now: new Date(), deadline: future(60_000),
    checkpoint: {}, complete: false, items: [...second.items], deltaDispatches: second.dispatches,
  }), 'lost_lease', 'DELTA_SQL_CANCEL_BETWEEN_PAGES_FENCED')
  equal((await dispatchFacts(tx, cancelled.id)).total, 1, 'DELTA_SQL_CANCEL_NO_SECOND_ASSIGNMENT')
  equal((await dispatchFacts(tx, cancelled.id)).acknowledged, 0, 'DELTA_SQL_CANCEL_NO_ACK')
  equal((await repository.finalizeCancellation({ jobId: cancelled.id, token: cancelled.token, now: new Date() }))?.status, 'CANCELLED', 'DELTA_SQL_CANCEL_FINALIZE')
  equal((await itemFacts(tx, cancelled.id)).cancelled, 1, 'DELTA_SQL_CANCEL_ITEM_TERMINAL')
  await repository.releaseJob({ jobId: cancelled.id, token: cancelled.token, now: new Date() })

  // An unacknowledged receipt assigned to a cancelled job is eligible for a
  // different job. The second unassigned page accompanies it and both are
  // acknowledged only after the one deduplicated P2 item confirms.
  const resumed = await createAndClaim(repository, 'cancel-resume')
  const replay = await reader.readPage({ jobId: resumed.id, scope: input.scope, checkpoint: {}, limit: 8 })
  equal(replay.dispatches.length, 2, 'DELTA_SQL_CANCEL_READER_REASSIGNS_PENDING')
  equal(replay.items.length, 1, 'DELTA_SQL_CANCEL_READER_DEDUPES_ITEM')
  equal(await repository.persistInventory({
    jobId: resumed.id, token: resumed.token, now: new Date(), deadline: future(60_000),
    checkpoint: {}, complete: true, items: [...replay.items], deltaDispatches: replay.dispatches,
  }), 'ok', 'DELTA_SQL_CANCEL_REPLAY_PERSIST')
  equal((await dispatchFacts(tx, resumed.id)).total, 2, 'DELTA_SQL_CANCEL_REASSIGNED_RECEIPTS')
  const item = await repository.claimNextItem({ jobId: resumed.id, token: resumed.token, now: new Date(), leaseUntil: future(120_000), maxAttempts: 3 })
  invariant(item, 'DELTA_SQL_CANCEL_REPLAY_ITEM_CLAIM')
  equal((await repository.applyClaimedItem({
    jobId: resumed.id, itemId: item.item.id, token: resumed.token, now: new Date(), deadline: future(60_000), actorId: null,
    apply: async () => 'SIN_CAMBIOS',
  })).kind, 'applied', 'DELTA_SQL_CANCEL_REPLAY_APPLY')
  equal((await dispatchFacts(tx, resumed.id)).acknowledged, 2, 'DELTA_SQL_CANCEL_REPLAY_ACK')
  equal((await repository.finalizeIfDone({ jobId: resumed.id, token: resumed.token, now: new Date() }))?.status, 'COMPLETED', 'DELTA_SQL_CANCEL_REPLAY_FINALIZE')
  await repository.releaseJob({ jobId: resumed.id, token: resumed.token, now: new Date() })
}

async function testLeaseGuard(
  tx: RollbackTxClient,
  repository: PrismaFinanceSyncRepository,
  reader: PrismaGraphDeltaDispatchReader,
  input: Readonly<{ scope: Scope }>,
): Promise<void> {
  const claim = await createAndClaim(repository, 'lease-guard')
  const page = await reader.readPage({ jobId: claim.id, scope: input.scope, checkpoint: {}, limit: 8 })
  equal(page.dispatches.length, 1, 'DELTA_SQL_LEASE_READER')
  equal(await repository.persistInventory({
    jobId: claim.id, token: claim.token, now: new Date(), deadline: future(60_000),
    checkpoint: {}, complete: true, items: [...page.items], deltaDispatches: page.dispatches,
  }), 'ok', 'DELTA_SQL_LEASE_PERSIST')
  const item = await repository.claimNextItem({ jobId: claim.id, token: claim.token, now: new Date(), leaseUntil: future(120_000), maxAttempts: 3 })
  invariant(item, 'DELTA_SQL_LEASE_ITEM_CLAIM')
  await tx.$executeRawUnsafe(`UPDATE finance_sync_jobs_p2 SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1::uuid`, claim.id)
  await tx.$executeRawUnsafe(`UPDATE finance_sync_items_p2 SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1::uuid`, item.item.id)
  let callbackRan = false
  const result = await repository.applyClaimedItem({
    jobId: claim.id,
    itemId: item.item.id,
    token: claim.token,
    now: new Date(),
    deadline: future(60_000),
    actorId: null,
    apply: async () => { callbackRan = true; return 'SIN_CAMBIOS' },
  })
  equal(result.kind, 'lost_lease', 'DELTA_SQL_LEASE_GUARD')
  equal(callbackRan, false, 'DELTA_SQL_LEASE_CALLBACK_BLOCKED')
  equal((await dispatchFacts(tx, claim.id)).acknowledged, 0, 'DELTA_SQL_LEASE_NO_ACK')
}

function healthyReceipt(): Record<string, unknown> {
  return {
    format: 'delta-dispatch-sql-rollback-receipt-v1',
    ok: true,
    target: 'authorized-local-socket',
    execution: 'single-serializable-transaction-rolled-back',
    migration: { ddl_exercised: true, persisted: false },
    service: { set_local_role: true, temporary_grants_rolled_back: true },
    assertions: {
      reader: true,
      persist_inventory_atomicity: true,
      multi_page_assignment: true,
      checkpoint_transition: true,
      apply_ack_and_idempotency: true,
      cancellation_between_pages: true,
      lease_guard: true,
      source_fingerprints_restored: true,
      sequence_fingerprint_restored: true,
      schema_restored: true,
    },
    external_effects: { graph: false, ocr: false, provider_network: false, application_flag_changed: false },
  }
}

async function main(): Promise<void> {
  equal(process.env.FINANCE_DELTA_DISPATCH_ROLLBACK_TEST, '1', 'DELTA_SQL_EXPLICIT_OPT_IN_REQUIRED')
  invariant(process.env.FINANCE_GRAPH_DELTA_ENABLED !== '1', 'DELTA_SQL_GRAPH_FLAG_MUST_STAY_OFF')
  invariant(process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production', 'DELTA_SQL_PRODUCTION_BLOCKED')

  const client = new Client(config())
  let locked = false
  let began = false
  let stage = 'connect'
  try {
    await client.connect()
    stage = 'preflight'
    await preflight(client)
    const before = {
      topology: await sourceFingerprint(client, 'finance_graph_delta_topology'),
      events: await sourceFingerprint(client, 'finance_graph_delta_events'),
      schema: await sourceSchemaFingerprint(client),
      sequences: await sequenceFingerprint(client),
    }

    stage = 'session-lock'
    await client.query("SELECT pg_advisory_lock(hashtextextended('documental-candidate-db-tests',0))")
    locked = true
    stage = 'begin'
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    began = true

    stage = 'migration'
    await client.query(readFileSync(MIGRATION_PATH, 'utf8'))
    await migrationShape(client)

    stage = 'fixtures'
    const firstScope = scope('ack')
    const cancellationScope = scope('cancel')
    const leaseScope = scope('lease')
    await seedSourceFixtures(client, { scope: firstScope, eventCount: 2, seed: 'ack' })
    await seedSourceFixtures(client, { scope: cancellationScope, eventCount: 2, seed: 'cancel' })
    await seedSourceFixtures(client, { scope: leaseScope, eventCount: 1, seed: 'lease' })
    await grantServiceForRollbackOnly(client)

    const tx = new RollbackTxClient(client)
    const repository = new PrismaFinanceSyncRepository(tx as unknown as any)
    const reader = new PrismaGraphDeltaDispatchReader(tx as unknown as any)

    stage = 'reader-persist-apply'
    await testReaderPersistApply(client, tx, repository, reader, { scope: firstScope })
    stage = 'cancel-between-pages'
    await testCancellationBetweenPages(tx, repository, reader, { scope: cancellationScope })
    stage = 'lease-guard'
    await testLeaseGuard(tx, repository, reader, { scope: leaseScope })

    stage = 'constraints'
    await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    stage = 'rollback'
    await client.query('ROLLBACK')
    began = false

    stage = 'post-rollback'
    const after = {
      topology: await sourceFingerprint(client, 'finance_graph_delta_topology'),
      events: await sourceFingerprint(client, 'finance_graph_delta_events'),
      schema: await sourceSchemaFingerprint(client),
      sequences: await sequenceFingerprint(client),
    }
    assert.deepEqual(after.topology, before.topology, 'DELTA_SQL_ROLLBACK_TOPOLOGY_FINGERPRINT')
    assert.deepEqual(after.events, before.events, 'DELTA_SQL_ROLLBACK_EVENT_FINGERPRINT')
    equal(after.schema, before.schema, 'DELTA_SQL_ROLLBACK_SCHEMA_FINGERPRINT')
    assert.deepEqual(after.sequences, before.sequences, 'DELTA_SQL_ROLLBACK_SEQUENCE_FINGERPRINT')
    const dispatchAbsent = await client.query("SELECT to_regclass('public.finance_graph_delta_dispatches') IS NULL AS absent")
    equal(dispatchAbsent.rows[0]?.absent, true, 'DELTA_SQL_ROLLBACK_DDL_PERSISTED')

    writeFileSync(RECEIPT_PATH, `${JSON.stringify(healthyReceipt(), null, 2)}\n`, { mode: 0o644 })
    console.log('DELTA_DISPATCH_SQL_ROLLBACK_OK')
  } catch (error) {
    // The diagnostic is private and contains no values, IDs, credentials, paths to
    // source records, or database error detail. The public output remains aggregate-only.
    const raw = error instanceof Error ? error.message : 'DELTA_SQL_UNKNOWN'
    const code = /^[A-Z0-9_]{2,96}$/.test(raw) ? raw : 'DELTA_SQL_FAILED'
    writeFileSync('/tmp/delta-dispatch-sql-private-diagnostic.json', `${JSON.stringify({ stage, code })}\n`, { mode: 0o600 })
    console.error('DELTA_DISPATCH_SQL_ROLLBACK_FAILED')
    throw error
  } finally {
    if (began) {
      try { await client.query('ROLLBACK') } catch { /* rollback best effort after failed assertion */ }
    }
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended('documental-candidate-db-tests',0))") } catch { /* disconnect also releases */ }
    }
    await client.end().catch(() => undefined)
  }
}

main().catch(() => { process.exitCode = 1 })
