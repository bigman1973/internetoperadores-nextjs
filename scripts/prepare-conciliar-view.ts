/** Finite full-view read-side preparation. Production requires an explicit
 * manual command plus the unchanged runtime gates and live actor 3 SUPER_ADMIN.
 * No migrations, import, restore, JWT override, confirmation or undo. */
import { constants, lstatSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse } from 'dotenv'
import { signPreparationCheckpoint, validatePreparationCheckpoint, type PreparationCheckpoint } from '../lib/finanzas/conciliar-preparation-core'

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024
function fail(code: string): never { throw new Error(code) }
function privateFile(path: string, maximum: number): string {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size > maximum) fail('CONCILIAR_PREPARATION_PRIVATE_FILE_REQUIRED')
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try { return readFileSync(fd, 'utf8') } finally { closeSync(fd) }
}
function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) fail('CONCILIAR_PREPARATION_PRIVATE_DIRECTORY_REQUIRED')
}
export async function saveConciliarPreparationArtifact(path: string, c: PreparationCheckpoint): Promise<void> {
  privateDirectory(dirname(path))
  try { privateFile(path, MAX_ARTIFACT_BYTES) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const body = JSON.stringify(signPreparationCheckpoint(c)) + '\n'
  if (Buffer.byteLength(body) > MAX_ARTIFACT_BYTES) fail('CONCILIAR_PREPARATION_ARTIFACT_LIMIT')
  const temporary = `${path}.${process.pid}.tmp`
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try { writeFileSync(fd, body, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
  try { renameSync(temporary, path) } catch (error) { unlinkSync(temporary); throw error }
  const directory = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY)
  try { fsyncSync(directory) } finally { closeSync(directory) }
}
export function parsePreparationCli(argv: readonly string[]) {
  const flags = new Map<string, string>(), allowed = new Set(['--env-file', '--checkpoint', '--actor-id', '--mode', '--batch-size'])
  let apply = false, productionPredeploy = false
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--apply') { if (apply) fail('CONCILIAR_PREPARATION_ARGUMENT_INVALID'); apply = true; continue }
    if (key === '--production-predeploy') { if (productionPredeploy) fail('CONCILIAR_PREPARATION_ARGUMENT_INVALID'); productionPredeploy = true; continue }
    if (!allowed.has(key) || flags.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) fail('CONCILIAR_PREPARATION_ARGUMENT_INVALID')
    flags.set(key, argv[++i])
  }
  const actorId = Number(flags.get('--actor-id')), batchSize = Number(flags.get('--batch-size') ?? 20), mode = flags.get('--mode') ?? 'projection'
  if (!flags.get('--env-file') || !flags.get('--checkpoint') || !Number.isSafeInteger(actorId) || actorId < 1
    || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100 || !['metadata', 'projection'].includes(mode)
    || (productionPredeploy && (actorId !== 3 || mode !== 'projection'))) fail('CONCILIAR_PREPARATION_ARGUMENT_INVALID')
  return { envFile: resolve(flags.get('--env-file')!), checkpointPath: resolve(flags.get('--checkpoint')!), actorId, batchSize, mode: mode as 'metadata' | 'projection', apply, productionPredeploy }
}
export function validatePreparationEnvironment(values: Record<string, string>, productionPredeploy: boolean) {
  const url = new URL(values.DATABASE_URL ?? '')
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || values.IO_PRODUCTION_READ_ONLY === '1') fail('CONCILIAR_PREPARATION_TARGET_REQUIRED')
  if (productionPredeploy) {
    // Exact reviewed Railway target, not --allow-production or arbitrary URL.
    if (url.hostname !== 'yamanote.proxy.rlwy.net' || url.port !== '34880' || url.pathname !== '/railway'
      || decodeURIComponent(url.username) !== 'postgres' || ![undefined, '0'].includes(values.FINANCE_STAGING_SANDBOX)
      || values.VERCEL_ENV !== 'production' || values.FINANCE_EASY_PRODUCTION_ENABLED !== '1'
      || values.FINANCE_MODEL_PRODUCTION_ENABLED !== '1' || values.FINANCE_AUTOMATIC_LINKS_DISABLED !== '1'
      || values.FINANCE_CONCILIAR_PRODUCTION_ENABLED !== '1' || values.NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED !== '1') fail('CONCILIAR_PREPARATION_PRODUCTION_TARGET_REQUIRED')
  } else if (url.pathname !== '/io_staging_finanzas' || decodeURIComponent(url.username) !== 'io_staging_finanzas'
    || values.FINANCE_STAGING_SANDBOX !== '1' || values.VERCEL_ENV === 'production'
    || ![undefined, '0'].includes(values.FINANCE_EASY_PRODUCTION_ENABLED)
    || ![undefined, '0'].includes(values.FINANCE_MODEL_PRODUCTION_ENABLED)) fail('CONCILIAR_PREPARATION_STAGING_TARGET_REQUIRED')
}
function installPreparationEnvironment(path: string, productionPredeploy: boolean) {
  const values = parse(privateFile(path, 32 * 1024))
  validatePreparationEnvironment(values, productionPredeploy)
  // The normal runtime ALSO verifies current_database/current_user every TX.
  for (const key of ['DATABASE_URL', 'FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'IO_PRODUCTION_READ_ONLY', 'FINANCE_EASY_PRODUCTION_ENABLED', 'FINANCE_MODEL_PRODUCTION_ENABLED', 'FINANCE_AUTOMATIC_LINKS_DISABLED', 'FINANCE_CONCILIAR_PRODUCTION_ENABLED', 'NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED', 'SHAREPOINT_DRIVE_ID', 'DRIVE_ID']) {
    if (process.env[key] !== undefined && process.env[key] !== values[key]) fail('CONCILIAR_PREPARATION_ENV_MISMATCH')
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value
}
export async function mainPreparationCli(argv = process.argv.slice(2)) {
  const cli = parsePreparationCli(argv)
  installPreparationEnvironment(cli.envFile, cli.productionPredeploy)
  privateDirectory(dirname(cli.checkpointPath))
  let checkpoint: PreparationCheckpoint | undefined
  try { checkpoint = validatePreparationCheckpoint(JSON.parse(privateFile(cli.checkpointPath, MAX_ARTIFACT_BYTES))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const [{ default: client }, { createConciliarPreparationPlan, prepareConciliarProjection }] = await Promise.all([
    import('../lib/prisma'), import('../lib/finanzas/conciliar-preparation'),
  ])
  const options = { client, actorId: cli.actorId, mode: cli.mode, batchSize: cli.batchSize, productionPredeploy: cli.productionPredeploy,
    checkpoint, save: (c: PreparationCheckpoint) => saveConciliarPreparationArtifact(cli.checkpointPath, c),
    progress: (event: unknown) => console.log(JSON.stringify(event)) }
  try {
    if (!cli.apply) {
      if (checkpoint) { console.log(JSON.stringify({ mode: 'CHECKPOINT_EXISTS', completed: checkpoint.completed, guardCursor: checkpoint.guardCursor, sealCursor: checkpoint.sealCursor, applyCursor: checkpoint.applyCursor })); return }
      const planned = await createConciliarPreparationPlan(options)
      await options.save(planned)
      console.log(JSON.stringify({ mode: 'PLAN_ONLY', prepared: false, batches: planned.plan.batches.length, rows: planned.plan.mode === 'metadata' ? planned.plan.prior.length : planned.plan.rows.length, databaseWrites: 0 }))
    } else console.log(JSON.stringify(await prepareConciliarProjection(options)))
  } finally { await client.$disconnect() }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  mainPreparationCli().catch(error => {
    const message = error instanceof Error && /^CONCILIAR_PREPARATION_[A-Z_]+$/.test(error.message) ? error.message : 'CONCILIAR_PREPARATION_FAILED_PRIVATE_DETAILS_OMITTED'
    console.error(JSON.stringify({ error: message, databaseChangesMayBeCommitted: true, resumeCheckpointRequired: true }))
    process.exitCode = 1
  })
}
