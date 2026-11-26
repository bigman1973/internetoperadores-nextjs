/** Future operator CLI. Never loads dotenv, lib/prisma or a general PG wrapper.
 * Default: simulate, SERIALIZABLE READ ONLY. This candidate has NOT been run on Production.
 * The local operator assertion is NOT an authenticated web session and cannot confirm the block.
 */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BLOQUE48_APPROVAL, Bloque48Error, executeBloque48, guardBloque48, parseBloque48Dataset,
  type Bloque48Request,
} from '../lib/area1-bloque48-carga'

const HELP = `Candidata futura Tanda3 bloque48. Ninguna autorización implícita.
Uso: tsx scripts/tanda3-bloque48-production.ts
  --input-file /ruta/privada/fuera/del/repo.json
  --dsn-env NOMBRE_VARIABLE_EXPLICITA --principal-id 3
  --principal-role SUPER_ADMIN --no-acting SI
  [--mode simulate|apply|down]
Escrituras futuras: además --execute SI --approval TEXTO_LITERAL
  --execution-id UUIDv4 --backup-file /ruta/privada/copia
  --expected-backup-sha256 SHA256
  --backup-restored "COPIA VERIFICADA POR RESTAURACION"
Apply: --expected-plan-sha256 SHA256_DE_SIMULACION
Las dos variables de solo lectura deben ser explícitamente 0; owner canónico 3.
No confirma propuestas. No abre flags. No imprime DSN ni datos personales.
La afirmación del operador local no equivale a sesión nativa Claude/Víctor.
`
const OPTIONS = new Set(['input-file', 'dsn-env', 'principal-id', 'principal-role', 'no-acting', 'mode', 'execute', 'approval', 'execution-id', 'backup-file', 'expected-backup-sha256', 'backup-restored', 'expected-plan-sha256'])
function args(argv: readonly string[]) {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '')
    if (!argv[i]?.startsWith('--') || !OPTIONS.has(key) || out[key] !== undefined || argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Bloque48Error('CLI_ARGUMENTS_INVALID')
    out[key] = argv[i + 1]
  }
  return out
}
function privateFile(path: string | undefined, repo: string) {
  if (!path || !isAbsolute(path)) throw new Bloque48Error('PRIVATE_ABSOLUTE_FILE_REQUIRED')
  const real = realpathSync(path), rel = relative(repo, real), info = statSync(real)
  if (!rel.startsWith('..' + '/') && rel !== '..' || !info.isFile() || info.mode & 0o077) throw new Bloque48Error('PRIVATE_FILE_OUTSIDE_REPO_MODE600_REQUIRED')
  return real
}
export async function runBloque48Cli(argv: readonly string[], environment: NodeJS.ProcessEnv = process.env) {
  if (argv.length === 1 && argv[0] === '--help') { console.log(HELP); return }
  const a = args(argv), repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
  const input = privateFile(a['input-file'], repo)
  const dataset = parseBloque48Dataset(readFileSync(input))
  const action = a.mode ?? 'simulate'
  if (!['simulate', 'apply', 'down'].includes(action)) throw new Bloque48Error('ACTION_INVALID')
  const dsnEnv = a['dsn-env']
  if (!dsnEnv || !/^[A-Z][A-Z0-9_]*$/.test(dsnEnv) || !environment[dsnEnv]) throw new Bloque48Error('EXPLICIT_DSN_ENV_REQUIRED')
  if (a['no-acting'] !== 'SI') throw new Bloque48Error('NO_ACTING_ASSERTION_REQUIRED')
  if (action === 'simulate' && ['execute', 'approval', 'execution-id', 'backup-file', 'expected-backup-sha256', 'backup-restored', 'expected-plan-sha256'].some(k => a[k] !== undefined)) throw new Bloque48Error('SIMULATION_WRITE_OPTIONS_FORBIDDEN')
  let backupHash: string | undefined
  if (action !== 'simulate') {
    if (a.execute !== 'SI' || a.approval !== BLOQUE48_APPROVAL[action as 'apply' | 'down'] || a['backup-restored'] !== 'COPIA VERIFICADA POR RESTAURACION') throw new Bloque48Error('EXPLICIT_WRITE_RESTORATION_APPROVAL_REQUIRED')
    const backup = privateFile(a['backup-file'], repo)
    if (backup === input || statSync(backup).size === 0) throw new Bloque48Error('BACKUP_ARTIFACT_INVALID')
    backupHash = createHash('sha256').update(readFileSync(backup)).digest('hex')
    if (backupHash !== a['expected-backup-sha256']) throw new Bloque48Error('BACKUP_ARTIFACT_HASH_CHANGED')
  }
  const request: Bloque48Request = {
    action: action as Bloque48Request['action'],
    env: { ...environment, DATABASE_URL: environment[dsnEnv] },
    authority: { principalId: Number(a['principal-id']), principalRole: a['principal-role'], acting: false },
    executionId: a['execution-id'], expectedPlanHash: a['expected-plan-sha256'], approval: a.approval,
    backupHash, backupVerified: action !== 'simulate',
  }
  // All local validation occurs before dynamically loading the driver or connecting.
  guardBloque48(request)
  const { Client } = await import('pg')
  const client = new Client({ connectionString: environment[dsnEnv], ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000, statement_timeout: 120000, application_name: 'tanda3-bloque48-future-selective' })
  try { await client.connect(); console.log(JSON.stringify(await executeBloque48(client, dataset, request))) }
  finally { await client.end() }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runBloque48Cli(process.argv.slice(2)).catch(e => {
    console.error(JSON.stringify({ ok: false, code: e instanceof Bloque48Error ? e.code : 'CLI_FAILED_PRIVATE_DETAILS_SUPPRESSED' }))
    process.exitCode = 1
  })
}
