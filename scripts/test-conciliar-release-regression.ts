/*
 * Private, read-only release regression runner for Conciliar.
 *
 * Usage (private files stay outside this repository):
 *   set -a; source /path/regression-db.env; set +a
 *   npx tsx scripts/test-conciliar-release-regression.ts \
 *     --input-file /path/cases.json --env-file /path/regression-db.env
 *
 * The fixture receipt is checked before opening PostgreSQL. The runner begins a
 * single READ ONLY transaction, verifies the local isolated role/database, and
 * emits only case IDs, pass/fail flags, and static diagnostic codes.
 */
import { Client } from 'pg'
import { parse as parseDotenv } from 'dotenv'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateCase, type ConciliarReleaseRegressionCase } from '../lib/finanzas/conciliar-release-regression-core'
import { evaluateGlobalRegression } from '../lib/finanzas/conciliar-release-regression-global'
import { readReleaseRegressionAdapter } from './tests/conciliar-release-regression-adapter'

const ROOT = '/home/ubuntu/internetoperadores-nextjs-margin'
const RECEIPT = '/home/ubuntu/conciliar-cierre-20261029/pruebas/fixture-verificado.json'
const STAGING_FLAG = 'CONCILIAR_RELEASE_REGRESSION_STAGING'
const PRODUCTION_READONLY_FLAG = 'CONCILIAR_RELEASE_REGRESSION_PRODUCTION_READONLY'
const FIXTURE_FLAG = 'CONCILIAR_RELEASE_REGRESSION_ISOLATED_FIXTURE'
const MAX_PRIVATE_BYTES = 256 * 1024
const EXPECTED_CASE_IDS = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9',
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
] as const
const CP_CASE_IDS = new Set<string>(EXPECTED_CASE_IDS.filter(id => id.startsWith('C') || id.startsWith('P')))
const G_CASE_IDS = new Set(EXPECTED_CASE_IDS.filter(id => id.startsWith('G')))

type Cli = Readonly<{ inputFile: string; envFile: string }>
type PrivateCaseSpec = Readonly<{ schema: string; cases: readonly Record<string, unknown>[]; supplementalCases?: readonly ConciliarReleaseRegressionCase[] }>
type SafeOutcome = Readonly<{ caseId: string; pass: boolean; reasons: readonly string[] }>
type FixtureReceipt = Readonly<{ restoreVerified?: unknown; isolatedLocal?: unknown; fixtureUsable?: unknown; noProductionWrites?: unknown; allTablesMatch?: unknown }>

function fail(code: string): never { throw new Error(code) }
function safeCode(code: string): string { return /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : 'RUNNER_FAILED' }
function privateFile(path: string): string {
  const file = resolve(path)
  if (file.startsWith(`${ROOT}/`)) fail('PRIVATE_FILE_IN_REPOSITORY')
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(file) } catch { fail('PRIVATE_FILE_UNAVAILABLE') }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > MAX_PRIVATE_BYTES) fail('PRIVATE_FILE_UNSAFE')
  return file
}
function parseCli(argv: readonly string[]): Cli {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    if ((key !== '--input-file' && key !== '--env-file') || typeof value !== 'string' || values.has(key)) fail('RUNNER_ARGUMENTS_INVALID')
    values.set(key, value)
  }
  if (argv.length !== 4 || !values.get('--input-file') || !values.get('--env-file')) fail('RUNNER_ARGUMENTS_REQUIRED')
  return { inputFile: privateFile(values.get('--input-file')!), envFile: privateFile(values.get('--env-file')!) }
}
function verifiedFixtureReceipt(): void {
  let value: FixtureReceipt
  try { value = JSON.parse(readFileSync(RECEIPT, 'utf8')) as FixtureReceipt } catch { fail('FIXTURE_RECEIPT_REQUIRED') }
  if (value.restoreVerified !== true || value.isolatedLocal !== true || value.fixtureUsable !== true || value.noProductionWrites !== true || value.allTablesMatch !== true) fail('FIXTURE_RECEIPT_REQUIRED')
}
function privateEnv(file: string): Record<string, string> {
  let values: Record<string, string>
  try { values = parseDotenv(readFileSync(file, 'utf8')) } catch { fail('PRIVATE_ENV_UNREADABLE') }
  const databaseUrl = values.DATABASE_URL
  if (!databaseUrl) fail('PRIVATE_ENV_DATABASE_URL_REQUIRED')
  let target: URL
  try { target = new URL(databaseUrl) } catch { fail('PRIVATE_ENV_DATABASE_URL_INVALID') }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.hostname !== '127.0.0.1' || target.port !== '55440'
    || target.pathname !== '/io_staging_finanzas' || decodeURIComponent(target.username) !== 'io_staging_finanzas') fail('PRIVATE_ENV_TARGET_REJECTED')
  if (values.VERCEL_ENV === 'production' || values.IO_PRODUCTION_READ_ONLY === '1' || values[FIXTURE_FLAG] !== '1'
    || values[STAGING_FLAG] !== '1' || values[PRODUCTION_READONLY_FLAG] !== '1') fail('PRIVATE_ENV_ISOLATION_REQUIRED')
  for (const key of [STAGING_FLAG, PRODUCTION_READONLY_FLAG, FIXTURE_FLAG, 'DATABASE_URL'] as const) {
    if (process.env[key] !== values[key]) fail('RUNNER_READONLY_FLAGS_REQUIRED')
  }
  return values
}
function readCaseSpec(file: string): PrivateCaseSpec {
  let parsed: unknown
  try { parsed = JSON.parse(readFileSync(file, 'utf8')) } catch { fail('CASE_SPEC_UNREADABLE') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('CASE_SPEC_INVALID')
  const spec = parsed as PrivateCaseSpec
  if (spec.schema !== 'CONCILIAR_RELEASE_REGRESSION_V1' || !Array.isArray(spec.cases)) fail('CASE_SPEC_INVALID')
  const ids = spec.cases.map(row => typeof row.caseId === 'string' ? row.caseId : '')
  if (ids.length !== EXPECTED_CASE_IDS.length || new Set(ids).size !== EXPECTED_CASE_IDS.length || EXPECTED_CASE_IDS.some(id => !ids.includes(id))) fail('CASE_SPEC_COVERAGE_INVALID')
  const historicalC3=spec.cases.find(row=>row.caseId==='C3'&&row.mode==='ABSENT_CONFIRMED')
  const supplemental = spec.supplementalCases ?? []
  if (!Array.isArray(supplemental) || supplemental.some(item => !item || typeof item !== 'object' || !item.expect || !item.selector)) fail('SUPPLEMENTAL_CASE_COVERAGE_INVALID')
  const supplementalIds = supplemental.map(item => item.caseId)
  const allowedSupplemental = new Set(['C30', 'P31', 'P32', 'P33', 'P34', 'P35'])
  if (new Set(supplementalIds).size !== supplementalIds.length || supplementalIds.some(id => !allowedSupplemental.has(id))) fail('SUPPLEMENTAL_CASE_COVERAGE_INVALID')
  const bbva = supplemental.find(item => item.caseId === 'C30')
  if (historicalC3 && (!bbva || bbva.mode !== 'EXACT' || bbva.expect.color !== 'VERDE' || !bbva.expect.confirmingEquation)) fail('PENDING_BBVA_DETAIL_SAMPLE_REQUIRED')
  const cards = supplemental.filter(item => item.caseId !== 'C30')
  if (cards.length && (cards.length !== 5 || cards.some(item => item.expect.group !== 'TARJETA' && !(item.mode === 'ABSENT_CONFIRMED' && item.expect.b4Confirmed === true && item.expect.absentAllTabs === true)))) fail('SUPPLEMENTAL_CARD_COVERAGE_INVALID')
  return spec
}
function cpCases(spec: PrivateCaseSpec): ConciliarReleaseRegressionCase[] {
  const cases = spec.cases.filter(row => CP_CASE_IDS.has(String(row.caseId))) as unknown as ConciliarReleaseRegressionCase[]
  if (cases.length !== CP_CASE_IDS.size) fail('CASE_SPEC_CP_COVERAGE_INVALID')
  return cases
}
function staticReasons(value: unknown, fallback: string): readonly string[] {
  const codes = Array.isArray(value) ? value.filter(code => typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(code)) : []
  return codes.length ? codes : [fallback]
}
function globalOutcomes(dataset: unknown): SafeOutcome[] {
  try {
    const evaluated = evaluateGlobalRegression(dataset as Parameters<typeof evaluateGlobalRegression>[0])
    if (!Array.isArray(evaluated.results) || evaluated.results.length !== G_CASE_IDS.size) throw new Error('GLOBAL_RESULT_INVALID')
    const outcomes = evaluated.results.map(item => ({ caseId: item.id, pass: item.passed === true, reasons: staticReasons(item.codes, 'GLOBAL_RESULT_INVALID') }))
    if (new Set(outcomes.map(item => item.caseId)).size !== G_CASE_IDS.size || [...G_CASE_IDS].some(id => !outcomes.some(item => item.caseId === id))) throw new Error('GLOBAL_RESULT_INVALID')
    return outcomes
  } catch {
    return [...G_CASE_IDS].map(caseId => ({ caseId, pass: false, reasons: ['GLOBAL_MODULE_UNAVAILABLE'] }))
  }
}
function emit(outcomes: readonly SafeOutcome[], supplemental: readonly SafeOutcome[]): void {
  const ordered = [...outcomes].sort((left, right) => left.caseId.localeCompare(right.caseId))
  const passing = ordered.filter(item => item.pass).length
  console.log(JSON.stringify({ ok: passing === EXPECTED_CASE_IDS.length&&supplemental.every(item=>item.pass), total: EXPECTED_CASE_IDS.length, passing, failures: ordered.filter(item => !item.pass), supplemental }))
}
async function readAndEvaluate(databaseUrl: string, spec: PrivateCaseSpec): Promise<{outcomes:SafeOutcome[];supplemental:SafeOutcome[]}> {
  const client = new Client({ connectionString: databaseUrl, statement_timeout: 120_000, query_timeout: 120_000 })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const identity = await client.query<{ db: string; role: string; readOnly: string }>("SELECT current_database() AS db,current_user AS role,current_setting('transaction_read_only') AS \"readOnly\" LIMIT 1")
    if (identity.rows.length !== 1 || identity.rows[0]?.db !== 'io_staging_finanzas' || identity.rows[0]?.role !== 'io_staging_finanzas' || identity.rows[0]?.readOnly !== 'on') fail('READONLY_IDENTITY_REJECTED')
    // Canonical readers legitimately fan out independent SELECTs. node-postgres
    // itself allows only one pending query per client, so retain one immutable
    // snapshot transaction while queuing every adapter SELECT in submission order.
    let queue: Promise<void> = Promise.resolve()
    const readonlyAdapterClient = {
      query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
        const task = queue.then(() => client.query<T>(sql, values as unknown[] | undefined))
        queue = task.then(() => undefined, () => undefined)
        return task
      },
    }
    const adapter = await readReleaseRegressionAdapter(readonlyAdapterClient)
    const outcomes: SafeOutcome[] = cpCases(spec).map(item => evaluateCase(item, adapter.cpDataset))
    const supplemental:SafeOutcome[]=(spec.supplementalCases??[]).map(item=>evaluateCase(item,adapter.cpDataset))
    if(supplemental.some(item=>item.caseId === 'C30' && !item.pass)){
      const index=outcomes.findIndex(item=>item.caseId==='C3')
      if(index<0)fail('CASE_SPEC_CP_COVERAGE_INVALID')
      outcomes[index]={caseId:'C3',pass:false,reasons:[...outcomes[index]!.reasons,'PENDING_BBVA_DETAIL_SAMPLE_FAILED']}
    }
    outcomes.push(...globalOutcomes(adapter.globalDataset))
    if (outcomes.length !== EXPECTED_CASE_IDS.length) fail('RUNNER_COVERAGE_INVALID')
    await client.query('ROLLBACK')
    return {outcomes,supplemental}
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* connection/transaction already closed */ }
    throw error
  } finally { await client.end() }
}
async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2))
  verifiedFixtureReceipt()
  const env = privateEnv(cli.envFile)
  const spec = readCaseSpec(cli.inputFile)
  const {outcomes,supplemental} = await readAndEvaluate(env.DATABASE_URL!, spec)
  emit(outcomes,supplemental)
  if (outcomes.some(item => !item.pass)) process.exitCode = 1
}

main().catch(error => {
  const code = error instanceof Error ? safeCode(error.message) : 'RUNNER_FAILED'
  console.error(code)
  process.exitCode = 1
})
