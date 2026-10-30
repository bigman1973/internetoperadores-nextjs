/*
 * Área 3 / G7 staging evidence runner.
 *
 * It consumes a browser-owner capture of every paginated Conciliar API page and
 * every REVIEW_PREVIEW response. It opens exactly one REPEATABLE READ + READ
 * ONLY database transaction, re-evaluates the same G7 cores used by projection
 * and confirmation, and never sends HTTP, writes a receipt, acknowledges a
 * warning, imports data, schedules refreshes or starts a sync.
 *
 * The optional draft is deliberately NOT a REVIEW_CONFIRM command: its ACK is
 * false, so a human Lorena acknowledgement in the dialog remains mandatory.
 *
 * Usage (parent-owned private inputs; do not execute from this task):
 * FINANCE_STAGING_SANDBOX=1 ./node_modules/.bin/tsx scripts/areas/conciliar/g7-readonly.ts \
 *   --snapshot-file /private/conciliar-api-g7.json \
 *   --actor-file /private/lorena-g7-actor.json \
 *   --env-file /private/staging.env \
 *   --draft-file /private/lorena-g7-review-draft.json
 */
import { Prisma, PrismaClient } from '@prisma/client'
import { parse as parseDotenv } from 'dotenv'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { evaluateConciliarStagingApiSnapshot, type ApiProjectionComparableRow, type ApiProjectionCoverage } from './api-core'
import { readCurrentArea3RemittanceMapPreflightsTx } from '../../../lib/finanzas/area3-remittance-map-db'
import { preflightArea3ReviewConfirmTx } from '../../../lib/finanzas/area3-review-confirm-db'
import { projectionRow, readArea3ReviewPreflightCandidatesTx } from '../../../lib/finanzas/conciliar-projection-read'
import { requireB4ActorAccess } from '../../../lib/finanzas/reconciliation-auth'

type Cli = Readonly<{ snapshotFile: string; actorFile: string; envFile: string; draftFile: string }>
type PrivateActor = Readonly<{ schema: 'AREA3_G7_ACTOR_V1'; actorId: number; actorAlias: 'LORENA' }>
type RawRow = Readonly<{ id: string; decisionHash: string; color: 'VERDE' | 'AMBAR' | 'ROJO'; seleccionable: boolean; motivo: string }>
type Snapshot = Readonly<{
  schema: 'CONCILIAR_STAGING_API_SNAPSHOT_V1'
  origin: 'https://staging.internetoperadores.com'
  renderedChecks: Readonly<{ P9?: unknown; P10?: unknown; G7_REMITTANCE?: unknown; G7_REVIEW?: unknown }>
  pages: readonly Readonly<{ response?: Readonly<{ rows?: readonly unknown[] }> }>[]
  reviewPreviews: readonly Readonly<{ id: string; decisionHash: string; response: unknown }> []
}>
type ReviewResult = Readonly<{ id: string; decisionHash: string; sourceHash: string | null; color: 'AMBAR' | 'ROJO'; code: string; canConfirm: boolean; acknowledgement: Readonly<{ schema: string; version: string; motivo: string; sourceHash: string }> | null }>
type StoredProjection = ReturnType<typeof projectionRow> & { tab: ApiProjectionComparableRow['tab'] }

const ROOT = resolve(process.cwd())
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024
const MAX_ENV_BYTES = 32 * 1024
const MAX_ACTOR_BYTES = 8 * 1024
const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function fail(code: string): never { throw new Error(code) }
function safeCode(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{2,100}$/.test(code) ? code : 'AREA3_G7_RUNNER_FAILED'
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function safePrivateFile(path: string, maximum: number): string {
  const file = resolve(path)
  if (file.startsWith(`${ROOT}/`)) fail('PRIVATE_FILE_IN_REPOSITORY')
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(file) } catch { fail('PRIVATE_FILE_UNAVAILABLE') }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > maximum) fail('PRIVATE_FILE_UNSAFE')
  return file
}
function safeDraftFile(path: string): string {
  const file = resolve(path), parent = dirname(file)
  if (file.startsWith(`${ROOT}/`)) fail('DRAFT_FILE_IN_REPOSITORY')
  let parentStat: ReturnType<typeof lstatSync>
  try { parentStat = lstatSync(parent) } catch { fail('DRAFT_DIRECTORY_UNAVAILABLE') }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || parentStat.uid !== process.getuid?.() || (parentStat.mode & 0o777) !== 0o700) fail('DRAFT_DIRECTORY_UNSAFE')
  try { lstatSync(file); fail('DRAFT_FILE_EXISTS') }
  catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT') return file
    throw error
  }
}
function json(file: string, code: string): unknown {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { fail(code) }
}
function parseCli(argv: readonly string[]): Cli {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    if (!['--snapshot-file', '--actor-file', '--env-file', '--draft-file'].includes(String(key)) || typeof value !== 'string' || values.has(key!)) fail('AREA3_G7_ARGUMENTS_INVALID')
    values.set(key!, value)
  }
  if (argv.length !== 8 || [...values.keys()].length !== 4) fail('AREA3_G7_ARGUMENTS_REQUIRED')
  return {
    snapshotFile: safePrivateFile(values.get('--snapshot-file')!, MAX_SNAPSHOT_BYTES),
    actorFile: safePrivateFile(values.get('--actor-file')!, MAX_ACTOR_BYTES),
    envFile: safePrivateFile(values.get('--env-file')!, MAX_ENV_BYTES),
    draftFile: safeDraftFile(values.get('--draft-file')!),
  }
}
function environment(file: string): string {
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
    || process.env.FINANCE_STAGING_SANDBOX !== '1') fail('PRIVATE_ENV_ISOLATION_REQUIRED')
  return databaseUrl
}
function actor(file: string): PrivateActor {
  const value = record(json(file, 'AREA3_G7_ACTOR_UNREADABLE'))
  if (!value || value.schema !== 'AREA3_G7_ACTOR_V1' || value.actorAlias !== 'LORENA' || !Number.isSafeInteger(value.actorId) || Number(value.actorId) < 1) fail('AREA3_G7_ACTOR_INVALID')
  return { schema: 'AREA3_G7_ACTOR_V1', actorAlias: 'LORENA', actorId: Number(value.actorId) }
}
function snapshot(file: string): Snapshot {
  const value = record(json(file, 'AREA3_G7_SNAPSHOT_UNREADABLE'))
  if (!value || value.schema !== 'CONCILIAR_STAGING_API_SNAPSHOT_V1' || value.origin !== 'https://staging.internetoperadores.com'
    || !Array.isArray(value.pages) || !Array.isArray(value.reviewPreviews) || !record(value.renderedChecks)) fail('AREA3_G7_SNAPSHOT_INVALID')
  const rendered = value.renderedChecks as Record<string, unknown>
  if (rendered.P9 !== true || rendered.P10 !== true || rendered.G7_REMITTANCE !== true || rendered.G7_REVIEW !== true) fail('AREA3_G7_RENDER_EVIDENCE_REQUIRED')
  return value as unknown as Snapshot
}
function apiRows(value: Snapshot): Map<string, RawRow> {
  const rows = new Map<string, RawRow>()
  for (const page of value.pages) {
    const rawRows = page?.response?.rows
    if (!Array.isArray(rawRows)) fail('AREA3_G7_API_ROWS_INVALID')
    for (const item of rawRows) {
      const row = record(item)
      if (!row || typeof row.id !== 'string' || !row.id || typeof row.decisionHash !== 'string' || !SHA256.test(row.decisionHash)
        || !['VERDE', 'AMBAR', 'ROJO'].includes(String(row.color)) || typeof row.seleccionable !== 'boolean' || typeof row.motivo !== 'string'
        || rows.has(row.id)) fail('AREA3_G7_API_ROWS_INVALID')
      rows.set(row.id, { id: row.id, decisionHash: row.decisionHash, color: row.color as RawRow['color'], seleccionable: row.seleccionable, motivo: row.motivo })
    }
  }
  return rows
}
function previewResponse(value: unknown): ReviewResult | null {
  const root = record(value), review = root ? record(root.reviewPreview) : null
  if (!root || !review || typeof review.id !== 'string' || !review.id || typeof review.decisionHash !== 'string' || !SHA256.test(review.decisionHash)
    || !['AMBAR', 'ROJO'].includes(String(review.color)) || review.confirmableGreen !== false || typeof review.puedeConfirmarRevision !== 'boolean'
    || typeof review.codigo !== 'string' || typeof review.mensaje !== 'string'
    || (review.sourceHash !== null && (typeof review.sourceHash !== 'string' || !SHA256.test(review.sourceHash)))) return null
  const rawAcknowledgement = review.acknowledgement
  const acknowledgement = rawAcknowledgement === null ? null : record(rawAcknowledgement)
  if (acknowledgement !== null && (!acknowledgement || acknowledgement.schema !== 'AREA3_REVIEW_ACK_V1' || acknowledgement.version !== '2026-10-30'
    || !['SIN_REFERENCIA_DOCUMENTAL', 'REFERENCIA_NUMERO_INCOMPLETO'].includes(String(acknowledgement.motivo))
    || typeof acknowledgement.sourceHash !== 'string' || !SHA256.test(acknowledgement.sourceHash))) return null
  const canConfirm = review.puedeConfirmarRevision === true
  if (canConfirm !== (review.codigo === 'ACK_REQUERIDO') || (canConfirm && (!acknowledgement || acknowledgement.sourceHash !== review.sourceHash || review.color !== 'AMBAR'))) return null
  return {
    id: review.id, decisionHash: review.decisionHash, sourceHash: review.sourceHash as string | null, color: review.color as 'AMBAR' | 'ROJO',
    code: review.codigo, canConfirm,
    acknowledgement: acknowledgement === null ? null : { schema: String(acknowledgement.schema), version: String(acknowledgement.version), motivo: String(acknowledgement.motivo), sourceHash: String(acknowledgement.sourceHash) },
  }
}
function previewMap(value: Snapshot): Map<string, ReviewResult> {
  const result = new Map<string, ReviewResult>()
  for (const item of value.reviewPreviews) {
    if (!item || typeof item.id !== 'string' || typeof item.decisionHash !== 'string' || !SHA256.test(item.decisionHash)) fail('AREA3_G7_PREVIEW_CAPTURE_INVALID')
    const response = previewResponse(item.response)
    if (!response || response.id !== item.id || response.decisionHash !== item.decisionHash || result.has(item.id)) fail('AREA3_G7_PREVIEW_CAPTURE_INVALID')
    result.set(item.id, response)
  }
  return result
}
function apiCoverage(rows: readonly StoredProjection[], updatedAt: string): ApiProjectionCoverage {
  const comparable: ApiProjectionComparableRow[] = rows.map(row => ({
    id: row.id, movimientoId: row.movimientoId, tab: row.tab as ApiProjectionComparableRow['tab'], fecha: row.fecha,
    color: row.color, grupo: row.grupo, documento: row.documento ? { referencia: row.documento.referencia, importeCentimos: row.documento.importeCentimos } : null,
    seleccionable: row.seleccionable, diferenciaCentimos: row.diferenciaCentimos, motivo: row.motivo, propuesta: row.propuesta, pendienteCentimos: row.pendienteCentimos,
  }))
  return { allRowsRead: true, updatedAt, rows: comparable }
}
async function pagedProjectionRows(tx: any): Promise<Readonly<{ rows: readonly StoredProjection[]; updatedAt: string }>> {
  const counted = await tx.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`SELECT COUNT(*)::bigint AS total FROM conciliar_proyecciones LIMIT 1`)
  const total = Number(counted[0]?.total)
  if (counted.length !== 1 || !Number.isSafeInteger(total) || total < 1 || total > 25_000) fail('AREA3_G7_PROJECTION_COVERAGE_INVALID')
  const state = await tx.$queryRaw<Array<{ rebuiltAt: Date | string | null }>>(Prisma.sql`
    SELECT rebuilt_at AS "rebuiltAt" FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1
  `)
  const rebuiltAt = state[0]?.rebuiltAt instanceof Date ? state[0].rebuiltAt.toISOString() : typeof state[0]?.rebuiltAt === 'string' ? new Date(state[0].rebuiltAt).toISOString() : ''
  if (state.length !== 1 || !Number.isFinite(new Date(rebuiltAt).getTime())) fail('AREA3_G7_PROJECTION_COVERAGE_INVALID')
  const result: StoredProjection[] = []
  for (let offset = 0; offset < total; offset += 100) {
    const page = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`SELECT * FROM conciliar_proyecciones ORDER BY id ASC LIMIT 100 OFFSET ${offset}`)
    if (page.length < 1 || page.length > 100) fail('AREA3_G7_PROJECTION_COVERAGE_INVALID')
    for (const raw of page) {
      const tab = raw.tab
      if (!['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'].includes(String(tab))) fail('AREA3_G7_PROJECTION_COVERAGE_INVALID')
      result.push({ ...projectionRow(raw), tab: tab as ApiProjectionComparableRow['tab'] })
    }
  }
  if (result.length !== total || new Set(result.map(row => row.id)).size !== total) fail('AREA3_G7_PROJECTION_COVERAGE_INVALID')
  return { rows: result, updatedAt: rebuiltAt }
}
function resultLine(ok: boolean, code: string, extra: Record<string, unknown> = {}) {
  return {
    schema: 'AREA3_G7_READONLY_V1', ok, state: ok ? 'VERDE' : 'AMBAR',
    warning: ok ? null : 'No se puede completar la comprobación G7; la fila permanece ámbar.',
    mode: 'READ_ONLY', writeConfirmExecuted: false, ...extra, code,
  }
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2))
  const captured = snapshot(cli.snapshotFile)
  const actorInput = actor(cli.actorFile)
  const databaseUrl = environment(cli.envFile)
  const capturedRows = apiRows(captured)
  const capturedPreviews = previewMap(captured)
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  try {
    const output = await client.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
      const identity = await tx.$queryRaw<Array<{ database: string; role: string; readOnly: string; isolation: string }>>(Prisma.sql`
        SELECT current_database() AS database,current_user AS role,current_setting('transaction_read_only') AS "readOnly",current_setting('transaction_isolation') AS isolation LIMIT 1
      `)
      if (identity.length !== 1 || identity[0]?.database !== 'io_staging_finanzas' || identity[0]?.role !== 'io_staging_finanzas'
        || identity[0]?.readOnly !== 'on' || identity[0]?.isolation !== 'repeatable read') fail('AREA3_G7_READONLY_IDENTITY_REJECTED')
      const access = await requireB4ActorAccess(actorInput.actorId, 'escritura', tx)
      if ('response' in access) fail('AREA3_G7_LORENA_WRITE_ACCESS_REJECTED')
      const actorRows = await tx.$queryRaw<Array<{ nombre: string | null }>>(Prisma.sql`SELECT nombre FROM usuarios_admin WHERE id=${actorInput.actorId} LIMIT 1`)
      if (actorRows.length !== 1 || typeof actorRows[0]?.nombre !== 'string' || !actorRows[0].nombre.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').includes('lorena')) fail('AREA3_G7_LORENA_IDENTITY_REJECTED')
      const projection = await pagedProjectionRows(tx)
      const rows = projection.rows
      const gate = evaluateConciliarStagingApiSnapshot(captured, apiCoverage(rows, projection.updatedAt))
      if (!gate.ok) fail('AREA3_G7_API_PAGINATION_MISMATCH')
      const maps = await readCurrentArea3RemittanceMapPreflightsTx(tx)
      let remittanceGreen = 0, remittanceAmber = 0
      const remittanceRows = rows.filter(row => row.source.kind === 'COBRO_PROPUESTA' && !!row.source.propuestaId && !!row.source.remesaId)
      for (const row of remittanceRows) {
        const preflight = maps.preflights.get(row.source.propuestaId!)
        if (!preflight) fail('AREA3_G7_REMITTANCE_PROJECTION_INCOMPLETE')
        const api = capturedRows.get(row.id)
        if (!api || api.decisionHash !== row.decisionHash || api.color !== row.color || api.seleccionable !== row.seleccionable || api.motivo !== row.motivo) fail('AREA3_G7_REMITTANCE_API_DECISION_MISMATCH')
        if (preflight.complete) {
          if (row.color !== 'VERDE' || row.seleccionable !== true) fail('AREA3_G7_REMITTANCE_GREEN_MISMATCH')
          remittanceGreen += 1
        } else {
          const expected = `Falta enlazar ${preflight.missingReceiptCount} recibos.`
          if (row.color !== 'AMBAR' || row.seleccionable !== false || row.motivo !== expected) fail('AREA3_G7_REMITTANCE_AMBAR_MISMATCH')
          remittanceAmber += 1
        }
      }
      const candidates = await readArea3ReviewPreflightCandidatesTx(tx)
      let reviewAck = 0, reviewAmber = 0
      let draft: Record<string, unknown> | null = null
      for (const row of candidates) {
        if (row.color !== 'AMBAR' || row.seleccionable !== false) fail('AREA3_G7_REVIEW_DTO_SELECTABLE')
        const decision = await preflightArea3ReviewConfirmTx(tx, row as any)
        const preview = capturedPreviews.get(row.id)
        if (!preview || preview.decisionHash !== row.decisionHash || preview.color !== decision.decision.color
          || preview.code !== (decision.decision.ok ? 'UNEXPECTED_OK' : decision.decision.codigo)
          || preview.sourceHash !== decision.decision.sourceHash || preview.canConfirm !== decision.puedeAbrirRevisionHumana
          || preview.canConfirm && preview.acknowledgement?.sourceHash !== decision.decision.sourceHash) fail('AREA3_G7_REVIEW_RENDER_MISMATCH')
        if (decision.puedeAbrirRevisionHumana) {
          if (decision.decision.ok || !preview.acknowledgement) fail('AREA3_G7_REVIEW_ACK_INVALID')
          reviewAck += 1
          if (!draft) {
            draft = {
              schema: 'AREA3_G7_REVIEW_CONFIRM_DRAFT_V1', actorAlias: 'LORENA', precheck: 'READ_ONLY', executable: false,
              reason: 'El ACK debe marcarlo Lorena de forma expresa en el diálogo; este fichero no puede enviarse como confirmación.',
              commandTemplate: {
                action: 'confirmar', idempotencyKey: randomUUID(), review: {
                  kind: 'REVIEW_CONFIRM', id: row.id, decisionHash: row.decisionHash,
                  acknowledgement: { ...preview.acknowledgement, advertenciaReconocida: false },
                },
              },
            }
          }
        } else reviewAmber += 1
      }
      return { gate, remittanceGreen, remittanceAmber, reviewAck, reviewAmber, draft }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 120_000 })
    const precheckPassed = output.remittanceAmber === 0 && output.reviewAmber === 0
    if (precheckPassed && output.draft) writeFileSync(cli.draftFile, `${JSON.stringify(output.draft, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    const gateCode = output.remittanceAmber > 0 ? 'G7_AMBAR_FALTA_ENLAZAR' : output.reviewAmber > 0 ? 'G7_AMBAR_REVISION_BLOQUEADA' : 'G7_PRECHECK_VALIDADO'
    console.log(JSON.stringify(resultLine(precheckPassed, gateCode, {
      actorWriteAccess: true, apiGate: output.gate.coverage, remittance: { green: output.remittanceGreen, amber: output.remittanceAmber },
      review: { acknowledgementRequired: output.reviewAck, amberBlocked: output.reviewAmber }, draftPrepared: precheckPassed && output.draft !== null,
    })))
    if (!precheckPassed) process.exitCode = 1
  } finally { await client.$disconnect() }
}

main().catch(error => {
  console.log(JSON.stringify(resultLine(false, safeCode(error))))
  process.exitCode = 1
})
