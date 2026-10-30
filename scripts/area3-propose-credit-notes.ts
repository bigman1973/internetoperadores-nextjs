/*
 * Área 3c — recorrido manual, finito y explícito de propuestas de rectificativas.
 *
 * Uso (lectura staging):
 *   set -a; source /ruta/privada/staging-readonly.env; set +a
 *   node node_modules/tsx/dist/cli.mjs scripts/area3-propose-credit-notes.ts
 *
 * --apply jamás confirma enlaces: sólo inserta PROPOSED metadata-only. En staging
 * requiere AREA3_CREDIT_PROPOSALS_STAGING_APPLY=1. Para ensayo local exige además
 * --local-rollback y AREA3_CREDIT_PROPOSALS_LOCAL_ROLLBACK=1, y siempre ROLLBACK.
 */
import { Client } from 'pg'
import {
  applyArea3CreditProposalsTx,
  area3ProposalSummary,
  planArea3ReceivedCreditProposals,
  readArea3ReceivedCreditSourcesTx,
  type Area3CreditProposalDb,
} from '../lib/finanzas/area3-credit-proposals-db'

const STAGING_HOST = 'yamanote.proxy.rlwy.net'
const STAGING_PORT = '34880'
const STAGING_DATABASE = 'io_staging_finanzas'
const STAGING_ROLE = 'io_staging_finanzas'
const LOCAL_RESTORE_DATABASE = /^io_restore_area3_\d{8}_\d{4}$/

type Mode = 'DRY_RUN' | 'STAGING_APPLY' | 'LOCAL_ROLLBACK_REHEARSAL'
type Identity = Readonly<{ db: string; role: string; host: string | null }>

function fail(code: string): never { throw new Error(code) }
function parseArgs(args: readonly string[]): Readonly<{ apply: boolean; localRollback: boolean }> {
  const allowed = new Set(['--dry-run', '--apply', '--local-rollback'])
  if (args.some((argument) => !allowed.has(argument))) fail('AREA3_ARGUMENT_INVALID')
  const apply = args.includes('--apply')
  const localRollback = args.includes('--local-rollback')
  if (localRollback && !apply) fail('AREA3_LOCAL_ROLLBACK_REQUIRES_APPLY')
  if (args.filter((argument) => argument === '--apply').length > 1 || args.filter((argument) => argument === '--local-rollback').length > 1) fail('AREA3_ARGUMENT_DUPLICATE')
  return { apply, localRollback }
}
function databaseUrl(): URL {
  const raw = process.env.DATABASE_URL
  if (!raw) fail('AREA3_DATABASE_URL_REQUIRED')
  try { return new URL(raw) } catch { return fail('AREA3_DATABASE_URL_INVALID') }
}
function isLoopbackHost(host: string): boolean { return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '' }
function selectMode(options: Readonly<{ apply: boolean; localRollback: boolean }>, target: URL): Mode {
  const role = decodeURIComponent(target.username)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) fail('AREA3_DATABASE_PROTOCOL_INVALID')
  if (target.pathname === '/railway' || process.env.VERCEL_ENV === 'production' || process.env.FINANCE_MODEL_PRODUCTION_ENABLED === '1') fail('AREA3_PRODUCTION_FORBIDDEN')
  if (options.localRollback) {
    if (process.env.AREA3_CREDIT_PROPOSALS_LOCAL_ROLLBACK !== '1') fail('AREA3_LOCAL_ROLLBACK_OPT_IN_REQUIRED')
    if (!isLoopbackHost(target.hostname) || !LOCAL_RESTORE_DATABASE.test(target.pathname.slice(1)) || !role) fail('AREA3_LOCAL_TARGET_INVALID')
    return 'LOCAL_ROLLBACK_REHEARSAL'
  }
  if (target.hostname !== STAGING_HOST || target.port !== STAGING_PORT || target.pathname !== `/${STAGING_DATABASE}` || role !== STAGING_ROLE) fail('AREA3_STAGING_TARGET_INVALID')
  if (process.env.FINANCE_STAGING_SANDBOX !== '1' || process.env.VERCEL_ENV === 'production') fail('AREA3_STAGING_ENV_INVALID')
  if (options.apply) {
    if (process.env.AREA3_CREDIT_PROPOSALS_STAGING_APPLY !== '1') fail('AREA3_STAGING_APPLY_OPT_IN_REQUIRED')
    return 'STAGING_APPLY'
  }
  return 'DRY_RUN'
}
async function assertIdentity(client: Client, mode: Mode): Promise<Identity> {
  const result = await client.query<Identity>('SELECT current_database() AS db,current_user AS role,inet_server_addr()::text AS host')
  if (result.rows.length !== 1) fail('AREA3_DATABASE_IDENTITY_INVALID')
  const identity = result.rows[0]!
  if (mode === 'LOCAL_ROLLBACK_REHEARSAL') {
    if (!LOCAL_RESTORE_DATABASE.test(identity.db)) fail('AREA3_LOCAL_IDENTITY_INVALID')
  } else if (identity.db !== STAGING_DATABASE || identity.role !== STAGING_ROLE) {
    fail('AREA3_STAGING_IDENTITY_INVALID')
  }
  return identity
}
async function assertSchema(client: Client): Promise<void> {
  const result = await client.query<{ name: string; found: string | null }>(`
    SELECT name,to_regclass(name)::text AS found
    FROM unnest($1::text[]) AS required(name)
    ORDER BY name ASC
    LIMIT 5
  `, [[
    'facturas_recibidas',
    'document_version_lifecycle',
    'document_version_snapshots',
    'document_version_credit_links',
    'document_version_credit_link_decisions',
  ]])
  if (result.rows.length !== 5 || result.rows.some((row) => row.found === null)) fail('AREA3_SCHEMA_REQUIRED_UNAVAILABLE')
}
function publicError(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return /^AREA3_[A-Z0-9_]+$/.test(code) ? code : 'AREA3_PROPOSAL_RUN_FAILED'
}

export async function runArea3CreditProposalCli(options: Readonly<{ args: readonly string[]; createClient?: (connectionString: string) => Client }> = { args: process.argv.slice(2) }): Promise<Record<string, unknown>> {
  const parsed = parseArgs(options.args)
  const target = databaseUrl()
  const mode = selectMode(parsed, target)
  const client = options.createClient ? options.createClient(target.toString()) : new Client({ connectionString: target.toString() })
  try {
    await client.connect()
    const identity = await assertIdentity(client, mode)
    await client.query(mode === 'DRY_RUN' ? 'BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ' : 'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    await assertSchema(client)
    const db: Area3CreditProposalDb = { query: (text, values) => client.query(text, values as unknown[] | undefined) }
    const documents = await readArea3ReceivedCreditSourcesTx(db)
    const plan = planArea3ReceivedCreditProposals(documents)
    if (mode === 'DRY_RUN') {
      await client.query('COMMIT')
      return { mode, transactionReadOnly: true, destination: { database: identity.db, role: identity.role, remote: true }, ...area3ProposalSummary(plan) }
    }
    const applied = await applyArea3CreditProposalsTx(db, plan)
    if (mode === 'LOCAL_ROLLBACK_REHEARSAL') {
      await client.query('ROLLBACK')
      return { mode, rolledBack: true, destination: { database: identity.db, role: identity.role, remote: false }, ...area3ProposalSummary(plan, applied) }
    }
    await client.query('COMMIT')
    return { mode, transactionReadOnly: false, destination: { database: identity.db, role: identity.role, remote: true }, ...area3ProposalSummary(plan, applied) }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* no transaction established */ }
    throw new Error(publicError(error))
  } finally {
    await client.end().catch(() => undefined)
  }
}

if (process.argv[1]?.endsWith('area3-propose-credit-notes.ts')) {
  runArea3CreditProposalCli().then(
    (result) => { console.log(JSON.stringify(result)) },
    (error) => { console.error(publicError(error)); process.exitCode = 1 },
  )
}
