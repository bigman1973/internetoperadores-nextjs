/*
 * Real staging API-to-DB release gate for Conciliar.
 *
 * The browser owner writes the private API photo beforehand. This runner never
 * requests HTTP, never opens a browser, never writes, and emits only static
 * codes plus aggregate counts. The API/DB equivalence gate must pass before
 * the existing 30 C/P cases, six supplements and G1–G6 are evaluated.
 *
 * Usage:
 * FINANCE_STAGING_SANDBOX=1 npx tsx scripts/test-conciliar-staging-api-regression.ts \
 *   --profile STAGE \
 *   --snapshot-file /private/api-snapshot.json --input-file /private/cases.json \
 *   --env-file /private/staging-readonly.env
 */
import { Client } from 'pg'
import { parse as parseDotenv } from 'dotenv'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { evaluateCase, type ConciliarReleaseRegressionCase } from './case-core'
import { evaluateGlobalRegression } from './global-core'
import { readReleaseRegressionAdapter } from './adapter'
import { evaluateConciliarStagingApiSnapshot, type ApiGateStaticCode } from './api-core'
import {
  C4_REMITTANCE_MODE,
  ORIGINAL_PRODUCTION_GOLDEN_SHA256,
  PRODUCTION_GOLDEN_AMENDMENT_IDS,
  STAGE_OVERRIDE_IDS,
  productionGoldenIsAuthorizedDerivative,
  stageProfileIsExactDerivative,
} from './stage-profile-core'

const ROOT = resolve(process.cwd())
const EXPECTED_CASE_IDS = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9',
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
] as const
const CP_CASE_IDS = new Set<string>(EXPECTED_CASE_IDS.filter(id => id.startsWith('C') || id.startsWith('P')))
const G_CASE_IDS = new Set<string>(EXPECTED_CASE_IDS.filter(id => id.startsWith('G')))
const SUPPLEMENTAL_IDS = new Set(['C30', 'P31', 'P32', 'P33', 'P34', 'P35'])
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024
const MAX_CASE_SPEC_BYTES = 256 * 1024
const MAX_ENV_BYTES = 32 * 1024
const PROFILE = 'STAGE'

type Cli = Readonly<{ profile: typeof PROFILE; snapshotFile: string; inputFile: string; manifestFile: string; envFile: string }>
type PrivateCaseSpec = Readonly<{ schema: string; cases: readonly Record<string, unknown>[]; supplementalCases?: readonly ConciliarReleaseRegressionCase[] }>
type StageProfileManifest = Readonly<{ schema?: unknown; profile?: unknown; originalGolden?: unknown; productionGolden?: unknown; derivative?: unknown; authorization?: unknown }>
type SafeOutcome = Readonly<{ caseId: string; pass: boolean; reasons: readonly string[] }>
type RunOutput = Readonly<{
  ok: boolean
  apiGate: Readonly<{ pass: boolean; reasons: readonly string[]; coverage: Readonly<{ dbRows: number; apiRows: number; scopes: number; pages: number }> }>
  evaluationsRun: boolean
  total: number
  passing: number
  failures: readonly SafeOutcome[]
  supplemental: readonly SafeOutcome[]
}>

function fail(code: string): never { throw new Error(code) }
function safeCode(code: string): string { return /^[A-Z][A-Z0-9_]{2,80}$/.test(code) ? code : 'API_GATE_RUNNER_FAILED' }
function safeReasons(value: unknown, fallback: string): readonly string[] {
  const codes = Array.isArray(value) ? value.filter(code => typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(code)) : []
  return codes.length ? codes : [fallback]
}
function privateFile(path: string, maximum: number): string {
  const file = resolve(path)
  if (file.startsWith(`${ROOT}/`)) fail('PRIVATE_FILE_IN_REPOSITORY')
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(file) } catch { fail('PRIVATE_FILE_UNAVAILABLE') }
  const permission = stat.mode & 0o777
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || ![0o400, 0o600].includes(permission) || stat.size < 1 || stat.size > maximum) fail('PRIVATE_FILE_UNSAFE')
  return file
}
function parseCli(argv: readonly string[]): Cli {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    if (!['--profile', '--snapshot-file', '--input-file', '--manifest-file', '--env-file'].includes(String(key)) || typeof value !== 'string' || values.has(key!)) fail('API_GATE_ARGUMENTS_INVALID')
    values.set(key!, value)
  }
  if (argv.length !== 10 || values.get('--profile') !== PROFILE || !values.get('--snapshot-file') || !values.get('--input-file') || !values.get('--manifest-file') || !values.get('--env-file')) fail('API_GATE_STAGE_PROFILE_REQUIRED')
  return {
    profile: PROFILE,
    snapshotFile: privateFile(values.get('--snapshot-file')!, MAX_SNAPSHOT_BYTES), inputFile: privateFile(values.get('--input-file')!, MAX_CASE_SPEC_BYTES),
    manifestFile: privateFile(values.get('--manifest-file')!, MAX_CASE_SPEC_BYTES),
    envFile: privateFile(values.get('--env-file')!, MAX_ENV_BYTES),
  }
}
function privateEnv(file: string): Record<string, string> {
  let values: Record<string, string>
  try { values = parseDotenv(readFileSync(file, 'utf8')) } catch { fail('PRIVATE_ENV_UNREADABLE') }
  const databaseUrl = values.DATABASE_URL
  if (!databaseUrl) fail('PRIVATE_ENV_DATABASE_URL_REQUIRED')
  let target: URL
  try { target = new URL(databaseUrl) } catch { fail('PRIVATE_ENV_DATABASE_URL_INVALID') }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.pathname !== '/io_staging_finanzas'
    || decodeURIComponent(target.username) !== 'io_staging_finanzas' || values.FINANCE_STAGING_SANDBOX !== '1'
    || values.VERCEL_ENV === 'production' || values.IO_PRODUCTION_READ_ONLY === '1'
    || ![undefined, '0'].includes(values.FINANCE_EASY_PRODUCTION_ENABLED)
    || ![undefined, '0'].includes(values.FINANCE_MODEL_PRODUCTION_ENABLED)
    || values.CONCILIAR_RELEASE_PROFILE !== PROFILE) fail('PRIVATE_ENV_ISOLATION_REQUIRED')
  // Never install or compare secret values beyond the connection used by this
  // process. The explicit process flag makes accidental direct invocation fail.
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') fail('FINANCE_STAGING_SANDBOX_REQUIRED')
  return values
}
function readJson(file: string, code: string): unknown {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { fail(code) }
}
function sha256(value: Buffer): string { return createHash('sha256').update(value).digest('hex') }
function readCaseSpec(file: string, manifestFile: string): PrivateCaseSpec {
  const source = readFileSync(file)
  let parsed: unknown
  try { parsed = JSON.parse(source.toString('utf8')) } catch { fail('CASE_SPEC_UNREADABLE') }
  const manifest = readJson(manifestFile, 'STAGE_PROFILE_MANIFEST_UNREADABLE') as StageProfileManifest
  const originalMeta = manifest?.originalGolden as Record<string, unknown> | undefined
  const productionMeta = manifest?.productionGolden as Record<string, unknown> | undefined
  const derivative = manifest?.derivative as Record<string, unknown> | undefined
  const authorization = manifest?.authorization as Record<string, unknown> | undefined
  if (manifest?.schema !== 'CONCILIAR_RELEASE_REGRESSION_STAGING_PROFILE_MANIFEST_V2' || manifest?.profile !== PROFILE
    || originalMeta?.sha256 !== ORIGINAL_PRODUCTION_GOLDEN_SHA256 || originalMeta?.unchanged !== true
    || derivative?.sha256 !== sha256(source) || derivative?.caseChanges !== STAGE_OVERRIDE_IDS.length
    || JSON.stringify(derivative?.stageOverrideIds) !== JSON.stringify(STAGE_OVERRIDE_IDS)
    || authorization?.issuer !== 'Claude' || typeof authorization?.receivedAt !== 'string'
    || JSON.stringify(authorization?.productionAmendmentIds) !== JSON.stringify(PRODUCTION_GOLDEN_AMENDMENT_IDS)
    || JSON.stringify(authorization?.stageOverrideIds) !== JSON.stringify(STAGE_OVERRIDE_IDS)
    || productionMeta?.baseSha256 !== ORIGINAL_PRODUCTION_GOLDEN_SHA256
    || JSON.stringify(productionMeta?.amendmentIds) !== JSON.stringify(PRODUCTION_GOLDEN_AMENDMENT_IDS)
    || typeof productionMeta?.sha256 !== 'string') fail('STAGE_PROFILE_MANIFEST_INVALID')
  if (typeof originalMeta?.immutableCopyPath !== 'string' || typeof productionMeta?.path !== 'string') fail('STAGE_PROFILE_GOLDEN_SOURCE_REQUIRED')
  const originalBytes = readFileSync(privateFile(originalMeta.immutableCopyPath, MAX_CASE_SPEC_BYTES))
  const productionBytes = readFileSync(privateFile(productionMeta.path, MAX_CASE_SPEC_BYTES))
  if (sha256(originalBytes) !== ORIGINAL_PRODUCTION_GOLDEN_SHA256 || sha256(productionBytes) !== productionMeta.sha256) fail('GOLDEN_HASH_MISMATCH')
  let original: unknown, production: unknown
  try {
    original = JSON.parse(originalBytes.toString('utf8'))
    production = JSON.parse(productionBytes.toString('utf8'))
  } catch { fail('CASE_SPEC_UNREADABLE') }
  if (!productionGoldenIsAuthorizedDerivative(original, production)) fail('PRODUCTION_GOLDEN_NOT_AUTHORIZED_DERIVATIVE')
  if (!stageProfileIsExactDerivative(original, production, parsed)) fail('STAGE_PROFILE_NOT_EXACT_DERIVATIVE')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('CASE_SPEC_INVALID')
  const spec = parsed as PrivateCaseSpec
  if (spec.schema !== 'CONCILIAR_RELEASE_REGRESSION_V1' || !Array.isArray(spec.cases)) fail('CASE_SPEC_INVALID')
  const ids = spec.cases.map(row => typeof row.caseId === 'string' ? row.caseId : '')
  if (ids.length !== EXPECTED_CASE_IDS.length || new Set(ids).size !== EXPECTED_CASE_IDS.length || EXPECTED_CASE_IDS.some(id => !ids.includes(id))) fail('CASE_SPEC_COVERAGE_INVALID')
  const supplemental = spec.supplementalCases ?? []
  if (!Array.isArray(supplemental) || supplemental.length !== SUPPLEMENTAL_IDS.size
    || new Set(supplemental.map(item => item.caseId)).size !== SUPPLEMENTAL_IDS.size
    || supplemental.some(item => !item || typeof item !== 'object' || !SUPPLEMENTAL_IDS.has(item.caseId))) fail('SUPPLEMENTAL_CASE_COVERAGE_INVALID')
  // C1/P1 are checked only by the exact original→PROD→STAGE derivation above.
  // Do not restate generic EXACT fields here: their full private expectations,
  // including any references and numbers, must come only from the original.
  const expectedModes: Readonly<Record<string, string>> = {
    C2: 'ABSENT_CONFIRMED', C3: 'PENDING_VISIBLE', C7: 'PENDING_VISIBLE', C8: 'PENDING_VISIBLE', P7: 'PENDING_VISIBLE',
  }
  for (const [caseId, mode] of Object.entries(expectedModes)) {
    const item = spec.cases.find(row => row.caseId === caseId)
    if (!item || item.mode !== mode || !item.expect || typeof item.expect !== 'object') fail('STAGE_PROFILE_CASES_REQUIRED')
    const expect = item.expect as Record<string, unknown>
    if (mode === 'ABSENT_CONFIRMED' && (expect.b4Confirmed !== true || expect.absentAllTabs !== true)) fail('STAGE_PROFILE_CASES_REQUIRED')
    if (mode === 'PENDING_VISIBLE' && (expect.b4Confirmed !== false || expect.visible !== true || Object.hasOwn(expect, 'color') || Object.hasOwn(expect, 'allowedColors'))) fail('STAGE_PROFILE_CASES_REQUIRED')
  }
  const c4 = spec.cases.find(row => row.caseId === 'C4')
  if (!c4 || c4.mode !== 'EXACT' || !c4.expect || typeof c4.expect !== 'object'
    || (c4.expect as Record<string, unknown>).remittancePreflight !== C4_REMITTANCE_MODE) fail('STAGE_PROFILE_CASES_REQUIRED')
  const bbva = supplemental.find(item => item.caseId === 'C30')
  if (!bbva || bbva.mode !== 'EXACT' || bbva.expect.color !== 'VERDE' || !bbva.expect.confirmingEquation) fail('PENDING_BBVA_DETAIL_SAMPLE_REQUIRED')
  const p31 = supplemental.find(item => item.caseId === 'P31')
  if (!p31 || p31.mode !== 'ABSENT_CONFIRMED' || p31.expect.b4Confirmed !== true || p31.expect.absentAllTabs !== true) fail('STAGE_PROFILE_CASES_REQUIRED')
  const cards = supplemental.filter(item => !['C30', 'P31'].includes(item.caseId))
  if (cards.length !== 4 || cards.some(item => item.expect.group !== 'TARJETA')) fail('SUPPLEMENTAL_CARD_COVERAGE_INVALID')
  return spec
}
function cpCases(spec: PrivateCaseSpec): readonly ConciliarReleaseRegressionCase[] {
  const cases = spec.cases.filter(row => CP_CASE_IDS.has(String(row.caseId))) as unknown as ConciliarReleaseRegressionCase[]
  if (cases.length !== CP_CASE_IDS.size) fail('CASE_SPEC_CP_COVERAGE_INVALID')
  return cases
}
function globalOutcomes(dataset: Parameters<typeof evaluateGlobalRegression>[0]): SafeOutcome[] {
  try {
    const evaluated = evaluateGlobalRegression(dataset)
    const outcomes = evaluated.results.map(item => ({ caseId: item.id, pass: item.passed === true, reasons: safeReasons(item.codes, 'GLOBAL_RESULT_INVALID') }))
    if (outcomes.length !== G_CASE_IDS.size || new Set(outcomes.map(item => item.caseId)).size !== G_CASE_IDS.size || [...G_CASE_IDS].some(id => !outcomes.some(item => item.caseId === id))) throw new Error('GLOBAL_RESULT_INVALID')
    return outcomes
  } catch { return [...G_CASE_IDS].map(caseId => ({ caseId, pass: false, reasons: ['GLOBAL_MODULE_UNAVAILABLE'] })) }
}
function emit(value: RunOutput): void { console.log(JSON.stringify(value)) }

async function readAndEvaluate(databaseUrl: string, snapshot: unknown, spec: PrivateCaseSpec): Promise<RunOutput> {
  const client = new Client({ connectionString: databaseUrl, statement_timeout: 120_000, query_timeout: 120_000 })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ')
    const identity = await client.query<{ db: string; role: string; readOnly: string; isolation: string }>("SELECT current_database() AS db,current_user AS role,current_setting('transaction_read_only') AS \"readOnly\",current_setting('transaction_isolation') AS isolation LIMIT 1")
    if (identity.rows.length !== 1 || identity.rows[0]?.db !== 'io_staging_finanzas' || identity.rows[0]?.role !== 'io_staging_finanzas'
      || identity.rows[0]?.readOnly !== 'on' || identity.rows[0]?.isolation !== 'repeatable read') fail('READONLY_IDENTITY_REJECTED')
    // node-postgres permits one in-flight query per connection. The adapter may
    // fan out readers but every SELECT remains serialized in this one pinned
    // repeatable-read transaction.
    let queue: Promise<void> = Promise.resolve()
    const readonlyAdapterClient = {
      query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
        const task = queue.then(() => client.query<T>(sql, values as unknown[] | undefined))
        queue = task.then(() => undefined, () => undefined)
        return task
      },
    }
    const adapter = await readReleaseRegressionAdapter(readonlyAdapterClient)
    const gate = evaluateConciliarStagingApiSnapshot(snapshot, adapter.apiProjectionCoverage)
    if (!gate.ok) {
      await client.query('ROLLBACK')
      return {
        ok: false, apiGate: { pass: false, reasons: gate.codes as readonly ApiGateStaticCode[], coverage: gate.coverage }, evaluationsRun: false,
        total: EXPECTED_CASE_IDS.length, passing: 0, failures: [], supplemental: [],
      }
    }
    const outcomes: SafeOutcome[] = cpCases(spec).map(item => evaluateCase(item, adapter.cpDataset))
    const supplemental: SafeOutcome[] = (spec.supplementalCases ?? []).map(item => evaluateCase(item, adapter.cpDataset))
    outcomes.push(...globalOutcomes(adapter.globalDataset))
    if (outcomes.length !== EXPECTED_CASE_IDS.length) fail('RUNNER_COVERAGE_INVALID')
    await client.query('ROLLBACK')
    const passing = outcomes.filter(item => item.pass).length
    return {
      ok: passing === EXPECTED_CASE_IDS.length && supplemental.every(item => item.pass),
      apiGate: { pass: true, reasons: [], coverage: gate.coverage }, evaluationsRun: true,
      total: EXPECTED_CASE_IDS.length, passing, failures: outcomes.filter(item => !item.pass), supplemental,
    }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* connection/transaction already closed */ }
    throw error
  } finally { await client.end() }
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2))
  const env = privateEnv(cli.envFile)
  const snapshot = readJson(cli.snapshotFile, 'API_SNAPSHOT_UNREADABLE')
  const spec = readCaseSpec(cli.inputFile, cli.manifestFile)
  const result = await readAndEvaluate(env.DATABASE_URL!, snapshot, spec)
  emit(result)
  if (!result.ok) process.exitCode = 1
}

main().catch(error => {
  const code = error instanceof Error ? safeCode(error.message) : 'API_GATE_RUNNER_FAILED'
  console.error(code)
  process.exitCode = 1
})
