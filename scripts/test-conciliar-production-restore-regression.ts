/*
 * Golden Conciliar verifier for a newly restored local production copy.
 *
 * This verifier never opens a production connection, browser or API. It accepts
 * only a parent-owned new Golden fixture plus its immutable original, a private restore receipt, a
 * candidate-rebuild receipt and a private local PG-client descriptor.
 * It starts one REPEATABLE READ + READ ONLY transaction and always rolls back.
 *
 * Usage (parent-owned private inputs):
 *   ./node_modules/.bin/tsx scripts/test-conciliar-production-restore-regression.ts \
 *     --profile PROD_NEW_RESTORE \
 *     --input-file /private/conciliar-release-regression-production-amended.json \
 *     --original-golden-file /private/immutable/conciliar-release-regression-20261029.json \
 *     --client-file /private/pg-produccion-client.json \
 *     --restore-receipt /private/respaldo-verificado.json \
 *     --clone-receipt /private/clone-produccion-verified.json \
 *     --candidate-rebuild-receipt /private/candidate-rebuild.json
 */
import { Client } from 'pg'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateCase, type ConciliarReleaseRegressionCase } from './areas/conciliar/case-core'
import { evaluateGlobalRegression } from './areas/conciliar/global-core'
import { readReleaseRegressionAdapter } from './areas/conciliar/adapter'
import { ORIGINAL_PRODUCTION_GOLDEN_SHA256, productionGoldenIsAuthorizedDerivative } from './areas/conciliar/stage-profile-core'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE = 'PROD_NEW_RESTORE'
const MAX_PRIVATE_BYTES = 256 * 1024
const EXPECTED_CASE_IDS = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9',
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
] as const
const CP_CASE_IDS = new Set<string>(EXPECTED_CASE_IDS.filter(id => id.startsWith('C') || id.startsWith('P')))
const G_CASE_IDS = new Set(EXPECTED_CASE_IDS.filter(id => id.startsWith('G')))
const SUPPLEMENTAL_IDS = new Set(['C30', 'P31', 'P32', 'P33', 'P34', 'P35'])

type Cli = Readonly<{ profile: typeof PROFILE; inputFile: string; originalGoldenFile: string; clientFile: string; restoreReceipt: string; cloneReceipt: string; candidateRebuildReceipt: string }>
type PrivateCaseSpec = Readonly<{ schema: string; cases: readonly Record<string, unknown>[]; supplementalCases?: readonly ConciliarReleaseRegressionCase[] }>
type FixtureReceipt = Readonly<{ allVerified?: unknown; backupComplete?: unknown; restoreExecuted?: unknown; dataMatch?: unknown; columnsMatch?: unknown; constraintsMatch?: unknown; indexesMatch?: unknown; triggersMatch?: unknown; viewsMatch?: unknown; functionsMatch?: unknown; enumsMatch?: unknown; extensionsMatch?: unknown; sequencesMatch?: unknown; mismatchedTableCount?: unknown; productionWrites?: unknown; sha256?: unknown }>
type CloneReceipt = Readonly<{ ok?: unknown; source?: unknown; localOnly?: unknown; allSourceDataHashesMatch?: unknown; readOnlyVerification?: unknown; remoteWrites?: unknown; financialDataChanges?: unknown; freshBackupSha256?: unknown }>
type CandidateRebuildReceipt = Readonly<{ schema?: unknown; candidateCommit?: unknown; projectionRebuilt?: unknown; localOnly?: unknown; productionWrites?: unknown; projectionRebuiltAt?: unknown }>
type LocalPgClient = Readonly<{ host: string; port: number; database: string; user: string; password: string; ssl: false }>
type SafeOutcome = Readonly<{ caseId: string; pass: boolean; reasons: readonly string[] }>

function fail(code: string): never { throw new Error(code) }
function safeCode(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{2,100}$/.test(code) ? code : 'PROD_RESTORE_GOLDEN_RUNNER_FAILED'
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
    if (!['--profile', '--input-file', '--original-golden-file', '--client-file', '--restore-receipt', '--clone-receipt', '--candidate-rebuild-receipt'].includes(String(key)) || typeof value !== 'string' || values.has(key!)) fail('PROD_RESTORE_ARGUMENTS_INVALID')
    values.set(key!, value)
  }
  if (argv.length !== 14 || values.get('--profile') !== PROFILE || !values.get('--input-file') || !values.get('--original-golden-file') || !values.get('--client-file') || !values.get('--restore-receipt') || !values.get('--clone-receipt') || !values.get('--candidate-rebuild-receipt')) fail('PROD_RESTORE_PROFILE_REQUIRED')
  return {
    profile: PROFILE,
    inputFile: privateFile(values.get('--input-file')!, MAX_PRIVATE_BYTES),
    originalGoldenFile: privateFile(values.get('--original-golden-file')!, MAX_PRIVATE_BYTES),
    clientFile: privateFile(values.get('--client-file')!, 8 * 1024),
    restoreReceipt: privateFile(values.get('--restore-receipt')!, 64 * 1024),
    cloneReceipt: privateFile(values.get('--clone-receipt')!, 64 * 1024),
    candidateRebuildReceipt: privateFile(values.get('--candidate-rebuild-receipt')!, 64 * 1024),
  }
}
function sha256(value: Buffer): string { return createHash('sha256').update(value).digest('hex') }
function parseGolden(bytes: Buffer): PrivateCaseSpec {
  let parsed: unknown
  try { parsed = JSON.parse(bytes.toString('utf8')) } catch { fail('CASE_SPEC_UNREADABLE') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('CASE_SPEC_INVALID')
  const spec = parsed as PrivateCaseSpec
  if (spec.schema !== 'CONCILIAR_RELEASE_REGRESSION_V1' || !Array.isArray(spec.cases)) fail('CASE_SPEC_INVALID')
  const ids = spec.cases.map(row => typeof row.caseId === 'string' ? row.caseId : '')
  if (ids.length !== EXPECTED_CASE_IDS.length || new Set(ids).size !== EXPECTED_CASE_IDS.length || EXPECTED_CASE_IDS.some(id => !ids.includes(id))) fail('CASE_SPEC_COVERAGE_INVALID')
  const supplemental = spec.supplementalCases ?? []
  if (!Array.isArray(supplemental) || supplemental.length !== SUPPLEMENTAL_IDS.size || new Set(supplemental.map(item => item.caseId)).size !== SUPPLEMENTAL_IDS.size || supplemental.some(item => !SUPPLEMENTAL_IDS.has(item.caseId))) fail('SUPPLEMENTAL_CASE_COVERAGE_INVALID')
  return spec
}
function readGolden(file: string, originalFile: string): Readonly<{ spec: PrivateCaseSpec; goldenSha256: string }> {
  const original = readFileSync(originalFile)
  if (sha256(original) !== ORIGINAL_PRODUCTION_GOLDEN_SHA256) fail('GOLDEN_HASH_MISMATCH')
  const amended = readFileSync(file)
  const originalSpec = parseGolden(original)
  const amendedSpec = parseGolden(amended)
  if (!productionGoldenIsAuthorizedDerivative(originalSpec, amendedSpec)) fail('PRODUCTION_GOLDEN_NOT_AUTHORIZED_DERIVATIVE')
  return { spec: amendedSpec, goldenSha256: sha256(amended) }
}
function verifiedRestoreReceipt(file: string): string {
  let value: FixtureReceipt
  try { value = JSON.parse(readFileSync(file, 'utf8')) as FixtureReceipt } catch { fail('NEW_PROD_RESTORE_RECEIPT_INVALID') }
  if (value.allVerified !== true || value.backupComplete !== true || value.restoreExecuted !== true || value.dataMatch !== true
    || value.columnsMatch !== true || value.constraintsMatch !== true || value.indexesMatch !== true || value.triggersMatch !== true
    || value.viewsMatch !== true || value.functionsMatch !== true || value.enumsMatch !== true || value.extensionsMatch !== true
    || value.sequencesMatch !== true || value.mismatchedTableCount !== 0 || value.productionWrites !== 0
    || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)) fail('NEW_PROD_RESTORE_RECEIPT_REQUIRED')
  return value.sha256
}
function verifiedCloneReceipt(file: string): string {
  let value: CloneReceipt
  try { value = JSON.parse(readFileSync(file, 'utf8')) as CloneReceipt } catch { fail('NEW_PROD_CLONE_RECEIPT_INVALID') }
  if (value.ok !== true || value.source !== 'produccion' || value.localOnly !== true || value.allSourceDataHashesMatch !== true
    || value.readOnlyVerification !== true || value.remoteWrites !== 0 || value.financialDataChanges !== 0
    || typeof value.freshBackupSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.freshBackupSha256)) fail('NEW_PROD_CLONE_RECEIPT_REQUIRED')
  return value.freshBackupSha256
}
function candidateCommit(): string {
  const value = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()
  if (!/^[a-f0-9]{40}$/i.test(value)) fail('CANDIDATE_COMMIT_UNAVAILABLE')
  return value
}
function candidateRebuildReceipt(file: string, commit: string): string {
  let value: CandidateRebuildReceipt
  try { value = JSON.parse(readFileSync(file, 'utf8')) as CandidateRebuildReceipt } catch { fail('CANDIDATE_REBUILD_RECEIPT_INVALID') }
  if (value.schema !== 'CONCILIAR_CANDIDATE_REBUILD_LOCAL_V1' || value.candidateCommit !== commit || value.projectionRebuilt !== true
    || value.localOnly !== true || value.productionWrites !== 0 || typeof value.projectionRebuiltAt !== 'string') fail('CANDIDATE_REBUILD_RECEIPT_REQUIRED')
  const rebuiltAt = new Date(value.projectionRebuiltAt)
  if (!Number.isFinite(rebuiltAt.getTime()) || rebuiltAt.toISOString() !== value.projectionRebuiltAt) fail('CANDIDATE_REBUILD_RECEIPT_REQUIRED')
  return value.projectionRebuiltAt
}
function privateClient(file: string): LocalPgClient {
  let value: unknown
  try { value = JSON.parse(readFileSync(file, 'utf8')) } catch { fail('PRIVATE_CLIENT_UNREADABLE') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('PRIVATE_CLIENT_INVALID')
  const client = value as Record<string, unknown>
  if (Object.keys(client).length !== 6 || typeof client.host !== 'string'
    || client.host !== '/home/ubuntu/conciliar-arreglos-20261031/privado/socket-produccion'
    || client.port !== 55445 || client.database !== 'io_staging_finanzas' || client.user !== 'io_staging_finanzas'
    || typeof client.password !== 'string' || client.ssl !== false) fail('PRIVATE_CLIENT_NEW_PROD_RESTORE_REQUIRED')
  return { host: client.host, port: client.port, database: client.database, user: client.user, password: client.password, ssl: false }
}
function cpCases(spec: PrivateCaseSpec): ConciliarReleaseRegressionCase[] {
  const cases = spec.cases.filter(row => CP_CASE_IDS.has(String(row.caseId))) as unknown as ConciliarReleaseRegressionCase[]
  if (cases.length !== CP_CASE_IDS.size) fail('CASE_SPEC_CP_COVERAGE_INVALID')
  return cases
}
function staticReasons(value: unknown, fallback: string): readonly string[] {
  const codes = Array.isArray(value) ? value.filter(code => typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,100}$/.test(code)) : []
  return codes.length ? codes : [fallback]
}
function globalOutcomes(dataset: Parameters<typeof evaluateGlobalRegression>[0]): SafeOutcome[] {
  try {
    const evaluated = evaluateGlobalRegression(dataset)
    const outcomes = evaluated.results.map(item => ({ caseId: item.id, pass: item.passed === true, reasons: staticReasons(item.codes, 'GLOBAL_RESULT_INVALID') }))
    if (outcomes.length !== G_CASE_IDS.size || new Set(outcomes.map(item => item.caseId)).size !== G_CASE_IDS.size || [...G_CASE_IDS].some(id => !outcomes.some(item => item.caseId === id))) throw new Error('GLOBAL_RESULT_INVALID')
    return outcomes
  } catch {
    return [...G_CASE_IDS].map(caseId => ({ caseId, pass: false, reasons: ['GLOBAL_MODULE_UNAVAILABLE'] }))
  }
}
async function readAndEvaluate(connection: LocalPgClient, spec: PrivateCaseSpec, projectionRebuiltAt: string): Promise<Readonly<{ outcomes: SafeOutcome[]; supplemental: SafeOutcome[] }>> {
  const client = new Client({ ...connection, statement_timeout: 120_000, query_timeout: 120_000 })
  await client.connect()
  try {
    await client.query('BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ')
    const identity = await client.query<{ db: string; role: string; host: string | null; readOnly: string; isolation: string }>('SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,current_setting(\'transaction_read_only\') AS "readOnly",current_setting(\'transaction_isolation\') AS isolation LIMIT 1')
    if (identity.rows.length !== 1 || identity.rows[0]?.db !== 'io_staging_finanzas' || identity.rows[0]?.role !== 'io_staging_finanzas' || identity.rows[0]?.host !== null || identity.rows[0]?.readOnly !== 'on' || identity.rows[0]?.isolation !== 'repeatable read') fail('READONLY_IDENTITY_REJECTED')
    let queue: Promise<void> = Promise.resolve()
    const readonlyAdapterClient = {
      query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
        const task = queue.then(() => client.query<T>(sql, values as unknown[] | undefined))
        queue = task.then(() => undefined, () => undefined)
        return task
      },
    }
    const adapter = await readReleaseRegressionAdapter(readonlyAdapterClient)
    if (adapter.apiProjectionCoverage.updatedAt !== projectionRebuiltAt) fail('CANDIDATE_PROJECTION_REBUILD_STALE')
    const outcomes: SafeOutcome[] = cpCases(spec).map(item => evaluateCase(item, adapter.cpDataset))
    const supplemental: SafeOutcome[] = (spec.supplementalCases ?? []).map(item => evaluateCase(item, adapter.cpDataset))
    outcomes.push(...globalOutcomes(adapter.globalDataset))
    if (outcomes.length !== EXPECTED_CASE_IDS.length) fail('RUNNER_COVERAGE_INVALID')
    await client.query('ROLLBACK')
    return { outcomes, supplemental }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* transaction already closed */ }
    throw error
  } finally {
    await client.end()
  }
}
async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2))
  const golden = readGolden(cli.inputFile, cli.originalGoldenFile)
  const spec = golden.spec
  const restoreBackupSha256 = verifiedRestoreReceipt(cli.restoreReceipt)
  const cloneBackupSha256 = verifiedCloneReceipt(cli.cloneReceipt)
  if (cloneBackupSha256 !== restoreBackupSha256) fail('NEW_PROD_CLONE_BACKUP_MISMATCH')
  const commit = candidateCommit()
  const projectionRebuiltAt = candidateRebuildReceipt(cli.candidateRebuildReceipt, commit)
  const { outcomes, supplemental } = await readAndEvaluate(privateClient(cli.clientFile), spec, projectionRebuiltAt)
  const failures = outcomes.filter(item => !item.pass)
  const c4 = failures.find(item => item.caseId === 'C4')
  const legacyC4Conflict = Boolean(c4?.reasons.includes('REMESA_COMPOSITION_MISMATCH'))
  const c4ColorMismatch = Boolean(c4?.reasons.includes('COLOR_MISMATCH'))
  console.log(JSON.stringify({
    schema: 'CONCILIAR_GOLDEN_PROD_RESTORE_READONLY_V1', profile: PROFILE, ok: failures.length === 0 && supplemental.every(item => item.pass),
    candidateCommit: commit, cloneBackupSha256, originalGoldenSha256: ORIGINAL_PRODUCTION_GOLDEN_SHA256, goldenSha256: golden.goldenSha256, total: EXPECTED_CASE_IDS.length, passing: outcomes.length - failures.length, failures, supplemental,
    writeOperations: false, g7Rebuilt: false,
    warnings: [
      ...(c4ColorMismatch ? ['C4_COLOR_MISMATCH_REQUIRES_STOP'] : []),
      ...(legacyC4Conflict ? ['C4_LEGACY_167_CONFLICT_REQUIRES_STOP'] : []),
    ],
  }))
  if (failures.length || supplemental.some(item => !item.pass)) process.exitCode = 1
}

main().catch(error => {
  console.log(JSON.stringify({ schema: 'CONCILIAR_GOLDEN_PROD_RESTORE_READONLY_V1', profile: PROFILE, ok: false, writeOperations: false, g7Rebuilt: false, code: safeCode(error) }))
  process.exitCode = 1
})
