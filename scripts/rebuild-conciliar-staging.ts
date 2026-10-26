/*
 * Reconstrucción manual de la proyección Conciliar, exclusivamente en staging.
 *
 * Ensayo (por defecto, siempre rollback):
 *   npx tsx scripts/rebuild-conciliar-staging.ts
 *
 * Aplicación (ejecuta primero el mismo ensayo y sólo después aplica):
 *   npx tsx scripts/rebuild-conciliar-staging.ts --apply
 *
 * Carga únicamente /home/ubuntu/finanzas-b1-20261022/staging-private.env.
 * Contrasta la URL de .env con la copia externa; usa sólo sus flags de runtime.
 * No llama Graph, no registra tareas y no imprime secretos ni IDs.
 */
import { Prisma } from '@prisma/client'
import { parse } from 'dotenv'
import { lstatSync, readFileSync } from 'node:fs'
import { URL } from 'node:url'

const ENV_FILE = '/home/ubuntu/finanzas-b1-20261022/staging-private.env'
const MAX_ENV_BYTES = 32 * 1024
const MAX_REBUILD_ROWS = 25_000
const ALLOWED_ARGUMENTS = new Set(['--apply'])

class DryRunRollback extends Error {
  constructor(readonly result: { rows: number; emitted: number; rebuiltAt: string }) { super('CONCILIAR_DRY_RUN_ROLLBACK') }
}

function fail(code: string): never { throw new Error(code) }
function parseCli(argv: readonly string[]): { apply: boolean } {
  if (argv.some(argument => !ALLOWED_ARGUMENTS.has(argument)) || argv.filter(argument => argument === '--apply').length > 1) fail('CONCILIAR_REBUILD_ARGUMENT_INVALID')
  return { apply: argv.includes('--apply') }
}
function privateExternalEnvironment(): Record<string, string> {
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(ENV_FILE) } catch { fail('CONCILIAR_STAGING_ENV_UNAVAILABLE') }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > MAX_ENV_BYTES) {
    fail('CONCILIAR_STAGING_ENV_UNSAFE')
  }
  let values: Record<string, string>
  try { values = parse(readFileSync(ENV_FILE, 'utf8')) } catch { fail('CONCILIAR_STAGING_ENV_UNREADABLE') }
  // El respaldo B1 conserva la URL, no necesariamente los flags de runtime.
  // Nunca se sustituye su destino: ambos ficheros deben señalar la misma URL.
  const runtime = parse(readFileSync('/home/ubuntu/internetoperadores-nextjs-margin/.env', 'utf8'))
  if (!values.DATABASE_URL || runtime.DATABASE_URL !== values.DATABASE_URL) fail('CONCILIAR_STAGING_ENV_TARGET_MISMATCH')
  values = { ...runtime, ...values }
  const databaseUrl = values.DATABASE_URL
  if (values.FINANCE_STAGING_SANDBOX !== '1' || !databaseUrl || values.VERCEL_ENV === 'production' || values.IO_PRODUCTION_READ_ONLY === '1'
    || ![undefined, '0'].includes(values.FINANCE_EASY_PRODUCTION_ENABLED) || ![undefined, '0'].includes(values.FINANCE_MODEL_PRODUCTION_ENABLED)) {
    fail('CONCILIAR_STAGING_ENV_INVALID')
  }
  let url: URL
  try { url = new URL(databaseUrl) } catch { fail('CONCILIAR_STAGING_ENV_INVALID') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/io_staging_finanzas' || decodeURIComponent(url.username) !== 'io_staging_finanzas') {
    fail('CONCILIAR_STAGING_ENV_INVALID')
  }
  // A caller cannot replace the private target with a shell setting. Matching
  // values are allowed so an explicit staging shell remains usable.
  for (const key of ['DATABASE_URL', 'FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'IO_PRODUCTION_READ_ONLY', 'FINANCE_EASY_PRODUCTION_ENABLED', 'FINANCE_MODEL_PRODUCTION_ENABLED'] as const) {
    if (process.env[key] !== undefined && process.env[key] !== values[key]) fail('CONCILIAR_STAGING_ENV_MISMATCH')
  }
  return values
}
function installExternalEnvironment(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) process.env[key] = value
}
function concise(mode: 'DRY_RUN' | 'APPLY', result: { rows: number; emitted: number }, writes: number) {
  return JSON.stringify({ mode, rows: result.rows, emitted: result.emitted, maxRows: MAX_REBUILD_ROWS, writes, source: 'CONCILIAR_PROJECTION', externalActions: 0 })
}

async function main() {
  const cli = parseCli(process.argv.slice(2))
  installExternalEnvironment(privateExternalEnvironment())
  // Dynamic imports are deliberately after the external env verification so no
  // Prisma client can be constructed from a repository .env or caller override.
  const [{ default: prisma }, { assertPrototypeStaging }, { rebuildConciliarProjectionTx }] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/finanzas/prototype-staging'),
    import('../lib/finanzas/conciliar-db'),
  ])
  try {
    await assertPrototypeStaging()
    const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
    if (identity.length !== 1 || identity[0]?.db !== 'io_staging_finanzas' || identity[0]?.role !== 'io_staging_finanzas') fail('CONCILIAR_STAGING_IDENTITY_REQUIRED')

    let rehearsal: { rows: number; emitted: number; rebuiltAt: string } | null = null
    try {
      await prisma.$transaction(async tx => {
        const result = await rebuildConciliarProjectionTx(tx, null)
        throw new DryRunRollback(result)
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 })
    } catch (error) {
      if (error instanceof DryRunRollback) rehearsal = error.result
      else throw error
    }
    if (!rehearsal || rehearsal.rows > MAX_REBUILD_ROWS) fail('CONCILIAR_REBUILD_ROW_LIMIT')
    if (!cli.apply) {
      console.log(concise('DRY_RUN', rehearsal, 0))
      return
    }
    // The apply path never chooses candidates independently: it uses the same
    // rebuild function and only follows a successful bounded rehearsal.
    const applied = await prisma.$transaction(tx => rebuildConciliarProjectionTx(tx, null), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000,
    })
    if (applied.rows > MAX_REBUILD_ROWS) fail('CONCILIAR_REBUILD_ROW_LIMIT')
    console.log(concise('APPLY', applied, 1))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  const code = error instanceof Error ? error.message : ''
  console.error(/^CONCILIAR_[A-Z0-9_]+$/.test(code) ? code : 'CONCILIAR_REBUILD_FAILED')
  process.exitCode = 1
})
