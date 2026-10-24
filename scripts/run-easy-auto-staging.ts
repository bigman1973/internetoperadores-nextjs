/*
 * Runner finito de automatización restringida, exclusivamente staging.
 *
 * Dry run (no DML):
 *   FINANCE_STAGING_SANDBOX=1 VERCEL_ENV=preview FINANCE_EXTERNAL_ACTIONS_DISABLED=1 \
 *   npx tsx scripts/run-easy-auto-staging.ts
 *
 * Aplicar (requiere migraciones P1 + auto ya aplicadas, doble opt-in y ficheros
 * privados 0600 propiedad del usuario actual):
 *   FINANCE_STAGING_SANDBOX=1 VERCEL_ENV=preview FINANCE_EXTERNAL_ACTIONS_DISABLED=1 \
 *   FINANCE_EASY_AUTO_APPLY=1 npx tsx scripts/run-easy-auto-staging.ts \
 *   --apply --optin-victor-24oct --actor-file /privado/actor --authorization-file /privado/autorizacion --receipt-dir /privado/recibos
 *
 * No registra cron, callback, Azure, correo ni OneDrive. Nunca imprime IDs de
 * movimiento, recibo u operación B4; el resultado sensible queda sólo en un
 * fichero privado 0600. No usar en producción.
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import prisma from '../lib/prisma'
import { assertPrototypeStaging } from '../lib/finanzas/prototype-staging'
import { parseEasyAutoInput, type EasyAutoExecuteInput } from '../lib/finanzas/easy-auto-core'
import { mutateEasyAutomation, readEasyAutomation, previewEasyAutomation } from '../lib/finanzas/easy-auto-db'

const ALLOWED = new Set(['--apply', '--optin-victor-24oct', '--actor-file', '--authorization-file', '--receipt-dir'])
const REQUEST_SCHEMA = 'EASY_AUTO_STAGING_REQUEST_V1' as const
const RESOLUTION_SCHEMA = 'EASY_AUTO_STAGING_RESOLUTION_V1' as const

type Cli = Readonly<{ apply: boolean; actorFile: string | null; authorizationFile: string | null; receiptDir: string | null }>
type PersistedRequest = Readonly<{
  schema: typeof REQUEST_SCHEMA
  createdAt: string
  actorId: number
  authorizationHash: string
  bindingHash: string
  request: EasyAutoExecuteInput
}>

function fail(code: string): never { throw new Error(code) }
function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function errno(error: unknown, code: string): boolean { return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code }

function parseArgs(argv: readonly string[]): Cli {
  let apply = false
  let optin = false
  let actorFile: string | null = null
  let authorizationFile: string | null = null
  let receiptDir: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!ALLOWED.has(arg)) fail('EASY_AUTO_CLI_ARGUMENT_INVALID')
    if (arg === '--apply') apply = true
    else if (arg === '--optin-victor-24oct') optin = true
    else if (arg === '--actor-file') actorFile = argv[++index] ?? null
    else if (arg === '--authorization-file') authorizationFile = argv[++index] ?? null
    else if (arg === '--receipt-dir') receiptDir = argv[++index] ?? null
  }
  if (!apply) {
    if (optin || actorFile || authorizationFile || receiptDir) fail('EASY_AUTO_DRY_RUN_HAS_WRITE_ARGUMENTS')
    return { apply: false, actorFile: null, authorizationFile: null, receiptDir: null }
  }
  if (!optin || process.env.FINANCE_EASY_AUTO_APPLY !== '1') fail('EASY_AUTO_APPLY_DOUBLE_OPTIN_REQUIRED')
  if (!actorFile || !authorizationFile || !receiptDir) fail('EASY_AUTO_APPLY_PRIVATE_FILES_REQUIRED')
  return { apply: true, actorFile, authorizationFile, receiptDir }
}

/** Refuse symlinks, non-owner files, and every mode other than exactly 0600. */
function privateFile(path: string, label: string): string {
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(path) } catch { fail(`EASY_AUTO_${label}_FILE_NOT_PRIVATE`) }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600) {
    fail(`EASY_AUTO_${label}_FILE_NOT_PRIVATE`)
  }
  try { return readFileSync(path, 'utf8').trim() } catch { fail(`EASY_AUTO_${label}_FILE_NOT_PRIVATE`) }
}
function privateActor(path: string): number {
  const actor = Number(privateFile(path, 'ACTOR'))
  if (!Number.isSafeInteger(actor) || actor <= 0) fail('EASY_AUTO_ACTOR_INVALID')
  return actor
}
function privateAuthorization(path: string): string {
  const authorization = privateFile(path, 'AUTHORIZATION')
  if (authorization.length < 12 || authorization.length > 300) fail('EASY_AUTO_AUTHORIZATION_INVALID')
  return authorization
}

/** The directory is private too: no symlink, no group/other access, current uid. */
function privateReceiptDirectory(directory: string): string {
  try { mkdirSync(directory, { recursive: true, mode: 0o700 }) } catch { fail('EASY_AUTO_RECEIPT_DIR_NOT_PRIVATE') }
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(directory) } catch { fail('EASY_AUTO_RECEIPT_DIR_NOT_PRIVATE') }
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700) {
    fail('EASY_AUTO_RECEIPT_DIR_NOT_PRIVATE')
  }
  return directory
}
function privateExistingFile(path: string, label: string): boolean {
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(path) } catch (error) {
    if (errno(error, 'ENOENT')) return false
    fail(`EASY_AUTO_${label}_FILE_NOT_PRIVATE`)
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600) {
    fail(`EASY_AUTO_${label}_FILE_NOT_PRIVATE`)
  }
  return true
}

/**
 * Publish once with a hard link after fsyncing a 0600 temporary file. The target
 * name is deterministic; a concurrent/restarted runner can only reuse it, never
 * overwrite it or replace it through a symlink.
 */
function writePrivateJsonOnce(path: string, label: string, value: unknown): boolean {
  if (privateExistingFile(path, label)) return false
  const temporary = `${path}.tmp-${randomUUID()}`
  let descriptor: number | null = null
  try {
    descriptor = openSync(temporary, 'wx', 0o600)
    fchmodSync(descriptor, 0o600)
    writeFileSync(descriptor, `${JSON.stringify(value)}\n`, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = null
    linkSync(temporary, path)
    return true
  } catch (error) {
    if (errno(error, 'EEXIST')) {
      if (!privateExistingFile(path, label)) fail(`EASY_AUTO_${label}_FILE_NOT_PRIVATE`)
      return false
    }
    fail(`EASY_AUTO_${label}_WRITE_FAILED`)
  } finally {
    if (descriptor !== null) {
      try { closeSync(descriptor) } catch { /* preserve generic failure */ }
    }
    try { unlinkSync(temporary) } catch (error) { if (!errno(error, 'ENOENT')) fail(`EASY_AUTO_${label}_WRITE_FAILED`) }
  }
}

function executeRequest(value: unknown): EasyAutoExecuteInput {
  try {
    const parsed = parseEasyAutoInput(value)
    if (parsed.action !== 'ejecutar') fail('EASY_AUTO_REQUEST_INVALID')
    return parsed
  } catch (error) {
    if (error instanceof Error && error.message === 'EASY_AUTO_REQUEST_INVALID') throw error
    fail('EASY_AUTO_REQUEST_INVALID')
  }
}
function readPersistedRequest(path: string, actorId: number, authorizationHash: string, bindingHash: string): PersistedRequest | null {
  if (!privateExistingFile(path, 'REQUEST')) return null
  let raw: unknown
  try { raw = JSON.parse(readFileSync(path, 'utf8')) } catch { fail('EASY_AUTO_REQUEST_INVALID') }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('EASY_AUTO_REQUEST_INVALID')
  const value = raw as Record<string, unknown>
  if (value.schema !== REQUEST_SCHEMA || typeof value.createdAt !== 'string' || value.actorId !== actorId
    || value.authorizationHash !== authorizationHash || value.bindingHash !== bindingHash) fail('EASY_AUTO_REQUEST_BINDING_MISMATCH')
  const request = executeRequest(value.request)
  return { schema: REQUEST_SCHEMA, createdAt: value.createdAt, actorId, authorizationHash, bindingHash, request }
}
function requestPaths(directory: string, bindingHash: string) {
  const base = `easy-auto-staging-v1-${bindingHash}`
  return { request: join(directory, `${base}-request.json`), resolution: join(directory, `${base}-resolution.json`) }
}

function concise(value: any) {
  return {
    stagingOnly: value?.stagingOnly === true,
    policyActiva: value?.policy !== null && value?.policy !== undefined,
    examinados: Number(value?.counts?.examinados ?? 0),
    traspasos: Number(value?.counts?.traspasos ?? 0),
    comisiones: Number(value?.counts?.comisiones ?? 0),
    excluidos: Number(value?.counts?.excluidos ?? 0),
    bloqueadosTitularidad: Number(value?.counts?.bloqueadosTitularidad ?? 0),
    fallosCadena: Number(value?.counts?.fallosCadena ?? 0),
  }
}

async function resolvePersistedExecution(actor: number, request: EasyAutoExecuteInput, resolutionPath: string, requestReused: boolean) {
  // executeEasyAutomationTx resolves execution idempotency before candidate preview.
  // Therefore a timeout after commit replays this same DB result and cannot choose a new receipt.
  const result: any = await mutateEasyAutomation(actor, request)
  const resolutionSaved = writePrivateJsonOnce(resolutionPath, 'RESOLUTION', {
    schema: RESOLUTION_SCHEMA,
    resolvedAt: new Date().toISOString(),
    requestKeyHash: sha256(request.idempotencyKey),
    result,
  })
  console.log(JSON.stringify({
    mode: 'APPLY', requestReused, applied: Number(result?.counts?.aplicados ?? 0), replays: Number(result?.counts?.replays ?? 0),
    requestPersisted: true, resolutionSaved, note: 'Resultado detallado privado; la misma clave se resolvió antes de toda nueva previsualización.',
  }))
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'EASY_AUTO_STAGING_FLAG_REQUIRED')
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'EASY_AUTO_PRODUCTION_FORBIDDEN')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'EASY_AUTO_EXTERNAL_ACTIONS_MUST_BE_DISABLED')
  await assertPrototypeStaging()
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }, 'EASY_AUTO_STAGING_IDENTITY_REQUIRED')
  if (!cli.apply) {
    const read = await readEasyAutomation()
    console.log(JSON.stringify({ mode: 'DRY_RUN', ...concise(read), writes: 0, note: 'No se ha registrado política, ejecutado B4/P1 ni creado recibo.' }))
    return
  }

  const actor = privateActor(cli.actorFile!)
  const authorization = privateAuthorization(cli.authorizationFile!)
  const authorizationHash = sha256(authorization)
  const bindingHash = sha256(`${REQUEST_SCHEMA}\n${actor}\n${authorizationHash}`)
  const receiptDirectory = privateReceiptDirectory(cli.receiptDir!)
  const paths = requestPaths(receiptDirectory, bindingHash)

  // A prior durable request is always resolved first. This branch intentionally
  // does not register policy, refresh preview, generate a UUID, or create a receipt.
  const persisted = readPersistedRequest(paths.request, actor, authorizationHash, bindingHash)
  if (persisted) {
    await resolvePersistedExecution(actor, persisted.request, paths.resolution, true)
    return
  }

  // Explicit authorization remains append-only and does not claim account ownership.
  await mutateEasyAutomation(actor, { action: 'registrar_politica', referenciaAutorizacion: authorization, confirmacion: true })
  const preview: any = await previewEasyAutomation({ action: 'previsualizar', desde: '2026-01-01', hasta: '2026-10-08', limite: 100 })
  const overview = concise(preview)
  if (!preview.candidates?.length || typeof preview.reviewHash !== 'string') {
    console.log(JSON.stringify({ mode: 'APPLY', ...overview, applied: 0, replays: 0, requestPersisted: false, note: 'No hay candidatos válidos; sólo se registró o reutilizó la política explícita.' }))
    return
  }

  const created: PersistedRequest = {
    schema: REQUEST_SCHEMA,
    createdAt: new Date().toISOString(),
    actorId: actor,
    authorizationHash,
    bindingHash,
    request: {
      action: 'ejecutar', desde: '2026-01-01', hasta: '2026-10-08', limite: 100,
      idempotencyKey: randomUUID(), reviewHash: preview.reviewHash, confirmacion: true,
    },
  }
  const requestCreated = writePrivateJsonOnce(paths.request, 'REQUEST', created)
  const request = requestCreated ? created : readPersistedRequest(paths.request, actor, authorizationHash, bindingHash)
  if (!request) fail('EASY_AUTO_REQUEST_NOT_PERSISTED')
  await resolvePersistedExecution(actor, request.request, paths.resolution, !requestCreated)
}

main().catch(error => {
  // Do not serialize DB diagnostics, private paths, identifiers, or authorization data.
  const candidate = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : (error instanceof Error ? error.message : '')
  console.error(/^EASY_AUTO_[A-Z0-9_]+$/.test(candidate) ? candidate : 'EASY_AUTO_RUNNER_FAILED')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
