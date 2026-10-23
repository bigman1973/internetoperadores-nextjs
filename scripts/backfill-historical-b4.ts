/*
 * Historical B4 recovery — deliberately proposal-only.
 *
 * Run from the application checkout with tsx, without copying secrets into a
 * command line or source file:
 *   pnpm exec tsx scripts/backfill-historical-b4.ts
 *
 * Modes:
 *   default       read-only dry run (no actor and no DML)
 *   --rollback    performs the insert path and always ROLLBACKs (actor required)
 *   --apply       commits only with FINANCE_HISTORICAL_B4_APPLY=1 (actor required)
 *   --revert-lote <lote> --motivo <10..2000 chars>
 *                 inserts the immutable functional suppression receipt; it
 *                 never deletes/updates historical rows.
 *
 * The script never creates B4 states, B4 lines, B4 operations or wrappers. It
 * never calls an external API. All legacy provenance is DESCONOCIDO: regardless
 * of an amount coincidence, a legacy FK can only become a PROPUESTA.
 */
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { archivoRecibidaControlado, bibliotecaFinancieraConfigurada } from '../lib/finanzas/archivo-fuente-controlada'
import {
  decimalTextToCentimos,
  planHistoricalProposal,
  sha256Canonical,
  type HistoricalDocumentDto,
} from '../lib/finanzas/historical-b4-core'

const APP_ROOT = process.env.FINANCE_APP_ROOT || fileURLToPath(new URL('../', import.meta.url))
const DEFAULT_LOTE = 'HISTORICAL_B4_20261023_V1'
const LOCK_NAME = 'FINANCE_HISTORICAL_B4_RECOVERY_V1'
const SELECTED_WHERE = `(m.conciliado OR m.factura_id IS NOT NULL OR m.factura_emitida_id IS NOT NULL OR m.nomina_id IS NOT NULL OR m.gasto_id IS NOT NULL OR m.traspaso_relacionado_id IS NOT NULL OR m.entrega_a_cuenta_empleado_id IS NOT NULL)`
const SOURCE_TABLES: ReadonlyArray<readonly [string, string, string]> = [
  ['movimientos_bancarios', 'id', 'movimientos'],
  ['facturas_recibidas', 'id', 'facturas_recibidas'],
  ['facturas_emitidas', 'id', 'facturas_emitidas'],
  ['nominas', 'id', 'nominas'],
  ['gastos', 'id', 'gastos'],
  ['empleados', 'id', 'empleados'],
  ['cuentas_bancarias', 'id', 'cuentas_bancarias'],
  ['estado_justificacion_movimientos', 'movimiento_id', 'estados_b4'],
  ['documentos_conciliables', 'id', 'documentos_b4'],
  ['vinculos_movimiento_documento', 'id', 'lineas_b4'],
  ['operaciones_justificacion_b4', 'id', 'operaciones_b4'],
]

/** Reader integration must suppress a reverted batch instead of deleting history. */
export const ACTIVE_LEGADO_B4_WHERE = `NOT EXISTS (
  SELECT 1 FROM reversiones_legado_b4 r WHERE r.lote = legado_conciliacion_b4.lote
)`

type PgClient = {
  connect(): Promise<void>
  end(): Promise<void>
  query<T = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number | null }>
}
type RawRow = {
  id: string
  conciliado: boolean
  importe_text: string | null
  recibida_total_text: string | null
  emitida_total_text: string | null
  nomina_neto_text: string | null
  gasto_importe_text: string | null
  factura_id: string | null
  factura_emitida_id: string | null
  nomina_id: string | null
  gasto_id: string | null
  traspaso_relacionado_id: string | null
  entrega_a_cuenta_empleado_id: string | null
  b4_estado: string | null
  movimiento_json: string
  factura_recibida_json: string | null
  factura_emitida_json: string | null
  nomina_json: string | null
  gasto_json: string | null
  empleado_json: string | null
  cuenta_json: string | null
  traspaso_json: string | null
  factura_recibida_wrappers: string
  factura_emitida_wrappers: string
  nomina_wrappers: string
  gasto_wrappers: string
  snapshot_legacy_text: string
}
type PlanRow = {
  movimientoId: string
  sourceHash: string
  snapshotLegacyText: string
  clasificacion: 'PROPUESTA' | 'YA_B4'
  procedencia: 'DESCONOCIDO'
  motivos: readonly string[]
  documentos: readonly HistoricalDocumentDto[]
  importeBancoCentimos: number | null
}
type Mode = 'DRY_RUN' | 'ROLLBACK' | 'APPLY' | 'REVERT'
type Cli = Readonly<{ mode: Mode; lote: string; motivo: string | null }>

function fail(code: string): never { throw new Error(code) }
function asObject(json: string | null): Record<string, unknown> | null {
  if (json === null) return null
  try {
    const value = JSON.parse(json)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch { return null }
}
function asObjectArray(json: string): Record<string, unknown>[] {
  try {
    const value = JSON.parse(json)
    return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, unknown>[] : []
  } catch { return [] }
}
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function bool(value: unknown): boolean { return value === true }
function reference(source: Record<string, unknown>, kind: string): string {
  let value: string
  switch (kind) {
    case 'FACTURA_RECIBIDA': value = `Factura recibida ${text(source.num_factura) || source.id}`; break
    case 'FACTURA_EMITIDA': value = `Factura emitida ${text(source.num_factura) || source.id}`; break
    case 'NOMINA': value = `Nómina ${String(source.mes).padStart(2, '0')}/${source.anio}`; break
    case 'TICKET': value = `Ticket ${text(source.concepto) || source.id}`; break
    default: value = 'Referencia documental histórica'
  }
  return value.slice(0, 240)
}
function archivoDisponible(source: Record<string, unknown> | null, kind: string): boolean {
  if (!source) return false
  if (kind === 'FACTURA_RECIBIDA') return archivoRecibidaControlado({
    oneDriveItemId: text(source.onedrive_item_id),
    oneDriveDriveId: text(source.onedrive_drive_id),
    archivoOneDrive: text(source.archivo_onedrive),
  }) !== null
  if (kind === 'TICKET') return bibliotecaFinancieraConfigurada() !== null
    && /^[A-Za-z0-9!_.~-]{4,220}$/.test(text(source.onedrive_item_id_gasto) || '')
  // No se infiere archivo desde un nombre o URL sin prueba controlada.
  return false
}
function isQuarantinedCopy(source: Record<string, unknown> | null): boolean {
  if (!source) return false
  return text(source.copia_de_id) !== null || bool(source.conflicto_identidad) || bool(source.duplicado_externo)
}
function activeWrapper(wrappers: readonly Record<string, unknown>[]): Record<string, unknown> | null {
  const active = wrappers.filter(wrapper => wrapper.activo === true)
  return active.length === 1 ? active[0] : null
}

function pushDocument(
  docs: HistoricalDocumentDto[],
  motives: string[],
  kind: string,
  sourceId: string | null,
  source: Record<string, unknown> | null,
  wrappersJson: string,
  amount: number | null,
  sourceTarget: number | null,
): void {
  if (!sourceId) return
  if (!source) { motives.push(`LEGACY_FK_SIN_SOURCE_${kind}`); return }
  if (isQuarantinedCopy(source)) motives.push(`LEGACY_COPIA_CUARENTENA_${kind}`)
  const wrappers = asObjectArray(wrappersJson)
  const wrapper = activeWrapper(wrappers)
  if (!wrapper) {
    docs.push({
      tipo: kind,
      sourceId,
      documentoConciliableId: null,
      referencia: reference(source, kind),
      importeObjetivoCentimos: sourceTarget,
      archivoDisponible: archivoDisponible(source, kind),
      stale: true,
    })
    motives.push(wrappers.length === 0 ? `ACTUAL_WRAPPER_AUSENTE_${kind}` : `ACTUAL_WRAPPER_AMBIGUO_O_INACTIVO_${kind}`)
    return
  }
  const objetivo = typeof wrapper.importe_objetivo_centimos === 'number' && Number.isSafeInteger(wrapper.importe_objetivo_centimos)
    ? wrapper.importe_objetivo_centimos : null
  const available = archivoDisponible(source, kind)
  const dto: HistoricalDocumentDto = {
    tipo: kind,
    sourceId,
    documentoConciliableId: text(wrapper.id),
    referencia: reference(source, kind),
    importeObjetivoCentimos: objetivo,
    archivoDisponible: available,
    version: typeof wrapper.version === 'number' && Number.isSafeInteger(wrapper.version) ? wrapper.version : undefined,
    stale: wrapper.activo !== true || wrappers.length !== 1 || isQuarantinedCopy(source) || wrapper.tipo !== kind || sourceTarget === null || objetivo !== sourceTarget,
  }
  docs.push(dto)
  if (objetivo !== sourceTarget || sourceTarget === null) motives.push(`WRAPPER_SOURCE_AMOUNT_MISMATCH_${kind}`)
  if (!available) motives.push(`MISSING_FILE_${kind}`)
  if (amount === null) motives.push('IMPORTE_BANCO_NO_CONVERTIBLE_A_CENTIMOS')
  else if (amount === 0) motives.push('IMPORTE_BANCO_CERO')
  else if (objetivo === null) motives.push(`IMPORTE_OBJETIVO_DESCONOCIDO_${kind}`)
  else if (objetivo !== amount) motives.push(`AMOUNT_MISMATCH_FIRMADO_EXACTO_${kind}`)
}

function legacyReference(docs: HistoricalDocumentDto[], kind: string, sourceId: string, referencia: string): void {
  docs.push({ tipo: kind, sourceId, documentoConciliableId: null, referencia, importeObjetivoCentimos: null, archivoDisponible: false, stale: true })
}

function signedSourceTarget(decimal: string | null, negative: boolean): number | null {
  const cents = decimalTextToCentimos(decimal)
  // Igual que B4: nunca abs(), ni tolerancia ni redondeo.
  if (cents === null || cents <= 0) return null
  return negative ? -cents : cents
}

export function planRow(row: RawRow): PlanRow {
  // `importe_text` comes from PostgreSQL (`importe::text`); no Prisma/JS float ever decides cents.
  const amount = decimalTextToCentimos(row.importe_text)
  const docs: HistoricalDocumentDto[] = []
  const motives: string[] = []
  const fkCount = [row.factura_id, row.factura_emitida_id, row.nomina_id, row.gasto_id, row.traspaso_relacionado_id, row.entrega_a_cuenta_empleado_id]
    .filter(value => value !== null).length
  if (fkCount > 1) motives.push('MULTIPLES_FKS_LEGACY')
  if (row.conciliado && fkCount === 0) motives.push('SIN_DOCUMENTO_HISTORICO')
  pushDocument(docs, motives, 'FACTURA_RECIBIDA', row.factura_id, asObject(row.factura_recibida_json), row.factura_recibida_wrappers, amount, signedSourceTarget(row.recibida_total_text, true))
  pushDocument(docs, motives, 'FACTURA_EMITIDA', row.factura_emitida_id, asObject(row.factura_emitida_json), row.factura_emitida_wrappers, amount, signedSourceTarget(row.emitida_total_text, false))
  pushDocument(docs, motives, 'NOMINA', row.nomina_id, asObject(row.nomina_json), row.nomina_wrappers, amount, signedSourceTarget(row.nomina_neto_text, true))
  pushDocument(docs, motives, 'TICKET', row.gasto_id, asObject(row.gasto_json), row.gasto_wrappers, amount, signedSourceTarget(row.gasto_importe_text, true))
  if (row.traspaso_relacionado_id) {
    legacyReference(docs, 'REFERENCIA_TRASPASO_LEGACY', row.traspaso_relacionado_id, 'Traspaso interno histórico')
    motives.push('TRASPASO_LEGACY_SIN_DOCUMENTO')
    if (!row.traspaso_json) motives.push('LEGACY_FK_SIN_SOURCE_TRASPASO')
  }
  if (row.entrega_a_cuenta_empleado_id) {
    legacyReference(docs, 'REFERENCIA_ENTREGA_A_CUENTA_EMPLEADO', row.entrega_a_cuenta_empleado_id, 'Entrega a cuenta histórica')
    motives.push('ENTREGA_A_CUENTA_EMPLEADO_NO_ES_DOCUMENTO')
    if (!row.empleado_json) motives.push('LEGACY_FK_SIN_SOURCE_ENTREGA')
  }
  const planned = planHistoricalProposal({
    movimientoId: row.id,
    b4State: row.b4_estado,
    importeBancoCentimos: amount,
    documentos: docs,
    motivos: motives,
  })
  // The JSONB snapshot is parsed and recursively canonicalized.  The companion
  // decimal text is included verbatim, so e.g. 0.10 is never re-derived through
  // a JavaScript float before generating the SHA-256 provenance hash.
  const sourceHash = sha256Canonical({
    algorithm: 'SHA-256', version: 1,
    snapshotLegacy: asObject(row.snapshot_legacy_text) ?? { rawJsonbText: row.snapshot_legacy_text },
    importeBancoExactoTexto: row.importe_text,
  })
  return {
    movimientoId: row.id,
    sourceHash,
    snapshotLegacyText: row.snapshot_legacy_text,
    clasificacion: planned.clasificacion as 'PROPUESTA' | 'YA_B4',
    procedencia: 'DESCONOCIDO',
    motivos: planned.motivos,
    documentos: planned.documentos,
    importeBancoCentimos: planned.importeBancoCentimos,
  }
}

function parseArgs(argv: readonly string[]): Cli {
  let apply = false; let rollback = false; let revertLote: string | null = null; let lote = DEFAULT_LOTE; let motivo: string | null = null
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') apply = true
    else if (arg === '--rollback') rollback = true
    else if (arg === '--lote') lote = argv[++i] ?? ''
    else if (arg === '--revert-lote') revertLote = argv[++i] ?? ''
    else if (arg === '--motivo') motivo = argv[++i] ?? null
    else fail('HISTORICAL_B4_ARGUMENTO_INVALIDO')
  }
  if (apply && rollback) fail('HISTORICAL_B4_MODOS_INCOMPATIBLES')
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(lote)) fail('HISTORICAL_B4_LOTE_INVALIDO')
  if (revertLote !== null) {
    if (apply || rollback || !/^[A-Za-z0-9_-]{8,160}$/.test(revertLote)) fail('HISTORICAL_B4_REVERSION_ARGUMENTOS_INVALIDOS')
    if (!motivo || motivo.trim().length < 10 || motivo.trim().length > 2000) fail('HISTORICAL_B4_REVERSION_MOTIVO_INVALIDO')
    return { mode: 'REVERT', lote: revertLote, motivo: motivo.trim() }
  }
  if (apply && process.env.FINANCE_HISTORICAL_B4_APPLY !== '1') fail('HISTORICAL_B4_APPLY_CONFIRMATION_REQUIRED')
  return { mode: apply ? 'APPLY' : rollback ? 'ROLLBACK' : 'DRY_RUN', lote, motivo: null }
}

function privateActorId(): number {
  // El runner autorizado entrega una identidad privada, no un ID elegido en CLI.
  if (process.env.FINANCE_HISTORICAL_B4_ACTOR_ID !== undefined) fail('HISTORICAL_B4_DIRECT_ACTOR_NOT_ALLOWED')
  const file = process.env.FINANCE_HISTORICAL_B4_ACTOR_FILE
  if (!file) fail('HISTORICAL_B4_ACTOR_REQUIRED')
  const stat = lstatSync(file)
  if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) fail('HISTORICAL_B4_ACTOR_FILE_NOT_PRIVATE')
  const actorId = Number(readFileSync(file, 'utf8').trim())
  if (!Number.isSafeInteger(actorId) || actorId < 1) fail('HISTORICAL_B4_ACTOR_REQUIRED')
  return actorId
}

async function requireAuthorizedActor(): Promise<number> {
  const actorId = privateActorId()
  // The app helper reloads UsuarioAdmin and delegates to verificarPermisoServer.
  const authModule = await import(pathToFileURL(join(APP_ROOT, 'lib/finanzas/reconciliation-auth.ts')).href)
  const result = await authModule.requireB4ActorAccess(actorId, 'escritura')
  if (!result?.ok) fail('HISTORICAL_B4_ACTOR_NOT_AUTHORIZED')
  return actorId
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL
  if (!value) fail('HISTORICAL_B4_DATABASE_URL_REQUIRED')
  return value
}
async function assertExactTarget(client: PgClient, urlText: string): Promise<'staging' | 'production'> {
  let url: URL
  try { url = new URL(urlText) } catch { fail('HISTORICAL_B4_TARGET_INVALID') }
  const user = decodeURIComponent(url.username)
  const staging = process.env.FINANCE_STAGING_SANDBOX === '1'
  const production = process.env.VERCEL_ENV === 'production'
    && process.env.FINANCE_MODEL_PRODUCTION_ENABLED === '1'
    && process.env.FINANCE_AUTOMATIC_LINKS_DISABLED === '1'
  let target: 'staging' | 'production'
  if (staging) {
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/io_staging_finanzas' || user !== 'io_staging_finanzas') fail('HISTORICAL_B4_TARGET_MISMATCH')
    target = 'staging'
  } else if (production) {
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'yamanote.proxy.rlwy.net' || url.port !== '34880' || url.pathname !== '/railway' || user !== 'postgres') fail('HISTORICAL_B4_TARGET_MISMATCH')
    target = 'production'
  } else fail('HISTORICAL_B4_ENVIRONMENT_NOT_ENABLED')
  const identity = await client.query<{ db: string; role: string }>('SELECT current_database() AS db, current_user AS role')
  const expected = target === 'staging'
    ? { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }
    : { db: 'railway', role: 'postgres' }
  if (identity.rows.length !== 1 || identity.rows[0].db !== expected.db || identity.rows[0].role !== expected.role) fail('HISTORICAL_B4_DATABASE_IDENTITY_MISMATCH')
  return target
}

async function assertRequiredTables(client: PgClient): Promise<void> {
  const names = [...SOURCE_TABLES.map(([table]) => table), 'legado_conciliacion_b4', 'reversiones_legado_b4']
  const result = await client.query<{ name: string; found: string | null }>('SELECT name, to_regclass(name)::text AS found FROM unnest($1::text[]) AS n(name)', [names])
  if (result.rows.some(row => row.found === null)) fail('HISTORICAL_B4_SCHEMA_NOT_MIGRATED')
  const triggers = await client.query<{ name:string; enabled:string }>(`SELECT tgname AS name,tgenabled::text AS enabled FROM pg_trigger WHERE tgrelid IN ('legado_conciliacion_b4'::regclass,'reversiones_legado_b4'::regclass) AND tgname = ANY($1::text[])`, [['legado_b4_append_only','reversion_legado_b4_append_only','legado_b4_operacion_ct']])
  if (triggers.rows.length !== 3 || triggers.rows.some(row => !['O','A'].includes(row.enabled))) fail('HISTORICAL_B4_IMMUTABILITY_NOT_ACTIVE')
  const constraints = await client.query<{ name:string; valid:boolean }>(`SELECT conname AS name,convalidated AS valid FROM pg_constraint WHERE conrelid IN ('legado_conciliacion_b4'::regclass,'reversiones_legado_b4'::regclass) AND conname = ANY($1::text[])`, [['legado_b4_contrato_ck','reversion_legado_b4_motivo_ck']])
  if (constraints.rows.length !== 2 || constraints.rows.some(row => !row.valid)) fail('HISTORICAL_B4_CONTRACT_NOT_ACTIVE')
}
async function lockOriginals(client: PgClient): Promise<void> {
  const tableList = SOURCE_TABLES.map(([table]) => table).join(', ')
  await client.query(`LOCK TABLE ${tableList} IN SHARE MODE`)
}
async function snapshotOriginals(client: PgClient): Promise<string> {
  const chunks: Array<readonly [string, string, string]> = []
  for (const [table, key, label] of SOURCE_TABLES) {
    const result = await client.query<{ key: string; value: string }>(`SELECT ${key}::text AS key, to_jsonb(t)::text AS value FROM ${table} t ORDER BY ${key}::text`)
    for (const row of result.rows) chunks.push([label, row.key, row.value])
  }
  return sha256Canonical(chunks)
}

async function readSelectedRows(client: PgClient): Promise<RawRow[]> {
  const sql = `
    SELECT m.id, m.conciliado, m.importe::text AS importe_text,
      m.factura_id, m.factura_emitida_id, m.nomina_id, m.gasto_id, m.traspaso_relacionado_id, m.entrega_a_cuenta_empleado_id,
      e.estado::text AS b4_estado,
      fr.total::text AS recibida_total_text, fi.total::text AS emitida_total_text,
      n.neto_percibir::text AS nomina_neto_text, g.importe::text AS gasto_importe_text,
      to_jsonb(m)::text AS movimiento_json, to_jsonb(fr)::text AS factura_recibida_json,
      to_jsonb(fi)::text AS factura_emitida_json, to_jsonb(n)::text AS nomina_json, to_jsonb(g)::text AS gasto_json,
      to_jsonb(emp)::text AS empleado_json, to_jsonb(c)::text AS cuenta_json, to_jsonb(tm)::text AS traspaso_json,
      COALESCE(frw.rows, '[]'::jsonb)::text AS factura_recibida_wrappers,
      COALESCE(fiw.rows, '[]'::jsonb)::text AS factura_emitida_wrappers,
      COALESCE(nw.rows, '[]'::jsonb)::text AS nomina_wrappers,
      COALESCE(gw.rows, '[]'::jsonb)::text AS gasto_wrappers,
      jsonb_build_object(
        'movimiento', to_jsonb(m), 'importeBancoExactoTexto', m.importe::text,
        'facturaRecibida', to_jsonb(fr), 'facturaEmitida', to_jsonb(fi), 'nomina', to_jsonb(n), 'gasto', to_jsonb(g),
        'importesFuenteExactosTexto', jsonb_build_object('recibida', fr.total::text, 'emitida', fi.total::text, 'nomina', n.neto_percibir::text, 'gasto', g.importe::text),
        'empleadoEntrega', to_jsonb(emp), 'cuenta', to_jsonb(c), 'traspasoRelacionado', to_jsonb(tm),
        'estadoB4', to_jsonb(e),
        'wrappersActuales', jsonb_build_object('facturaRecibida', COALESCE(frw.rows, '[]'::jsonb), 'facturaEmitida', COALESCE(fiw.rows, '[]'::jsonb), 'nomina', COALESCE(nw.rows, '[]'::jsonb), 'gasto', COALESCE(gw.rows, '[]'::jsonb))
      )::text AS snapshot_legacy_text
    FROM movimientos_bancarios m
    LEFT JOIN facturas_recibidas fr ON fr.id = m.factura_id
    LEFT JOIN facturas_emitidas fi ON fi.id = m.factura_emitida_id
    LEFT JOIN nominas n ON n.id = m.nomina_id
    LEFT JOIN gastos g ON g.id = m.gasto_id
    LEFT JOIN empleados emp ON emp.id = m.entrega_a_cuenta_empleado_id
    LEFT JOIN cuentas_bancarias c ON c.id = m.cuenta_id
    LEFT JOIN movimientos_bancarios tm ON tm.id = m.traspaso_relacionado_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = m.id
    LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) AS rows FROM documentos_conciliables d WHERE d.factura_recibida_id = m.factura_id) frw ON true
    LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) AS rows FROM documentos_conciliables d WHERE d.factura_emitida_id = m.factura_emitida_id) fiw ON true
    LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) AS rows FROM documentos_conciliables d WHERE d.nomina_id = m.nomina_id) nw ON true
    LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) AS rows FROM documentos_conciliables d WHERE d.gasto_id = m.gasto_id) gw ON true
    WHERE ${SELECTED_WHERE}
    ORDER BY m.id`
  return (await client.query<RawRow>(sql)).rows
}

function summarize(rows: readonly PlanRow[], existing: ReadonlyMap<string, string>): Record<string, number> {
  return {
    seleccionados: rows.length,
    justificados: rows.filter(row => (row.clasificacion as string) === 'JUSTIFICADO').length,
    propuestas: rows.filter(row => row.clasificacion === 'PROPUESTA').length,
    yaB4: rows.filter(row => row.clasificacion === 'YA_B4').length,
    yaRegistradosMismoHash: rows.filter(row => existing.has(row.movimientoId)).length,
    nuevosRegistros: rows.filter(row => !existing.has(row.movimientoId)).length,
  }
}
async function rejectRevertedBatch(client: PgClient, lote: string): Promise<void> {
  const r = await client.query<{ lote: string }>('SELECT lote FROM reversiones_legado_b4 WHERE lote = $1', [lote])
  if (r.rows.length !== 0) fail('HISTORICAL_B4_LOTE_REVERTIDO')
}
async function insertRows(client: PgClient, rows: readonly PlanRow[], actorId: number, lote: string): Promise<void> {
  let processed = 0
  for (const row of rows) {
    await client.query(
      `INSERT INTO legado_conciliacion_b4
       (movimiento_id, id, origen, lote, clasificacion, procedencia, motivos, documentos, snapshot_legacy, source_hash, importe_banco_centimos, operacion_id, creado_por_id)
       VALUES ($1, $2::uuid, 'HISTORICO', $3, $4, 'DESCONOCIDO', $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, NULL, $10)`,
      [row.movimientoId, randomUUID(), lote, row.clasificacion, JSON.stringify(row.motivos), JSON.stringify(row.documentos), row.snapshotLegacyText, row.sourceHash, row.importeBancoCentimos, actorId],
    )
    if (++processed % 100 === 0) process.stderr.write(`Verificadas ${processed} propuestas del lote en la transacción.\n`)
  }
}
async function runBackfill(client: PgClient, cli: Cli, actorId: number | null): Promise<Record<string, unknown>> {
  await rejectRevertedBatch(client, cli.lote)
  const source = await readSelectedRows(client)
  const rows = source.map(planRow)
  // The only code path that could make JUSTIFICADO is synthetic/manual and is absent here.
  if (rows.some(row => (row.clasificacion as string) === 'JUSTIFICADO')) fail('HISTORICAL_B4_UNSAFE_AUTOMATIC_JUSTIFICATION')
  const ids = rows.map(row => row.movimientoId)
  const current = ids.length === 0 ? [] : (await client.query<{ movimiento_id: string; source_hash: string; revertido:boolean }>(
    'SELECT l.movimiento_id, l.source_hash, EXISTS(SELECT 1 FROM reversiones_legado_b4 r WHERE r.lote=l.lote) AS revertido FROM legado_conciliacion_b4 l WHERE l.movimiento_id = ANY($1::text[])', [ids],
  )).rows
  if (current.some(row => row.revertido)) fail('HISTORICAL_B4_MOVIMIENTO_REVERTIDO')
  const existing = new Map(current.map(row => [row.movimiento_id, row.source_hash]))
  for (const row of rows) {
    const priorHash = existing.get(row.movimientoId)
    if (priorHash !== undefined && priorHash !== row.sourceHash) fail('HISTORICAL_B4_SOURCE_HASH_CONFLICT')
  }
  const newRows = rows.filter(row => !existing.has(row.movimientoId))
  if (cli.mode !== 'DRY_RUN') {
    if (actorId === null) fail('HISTORICAL_B4_ACTOR_REQUIRED')
    await insertRows(client, newRows, actorId, cli.lote)
  }
  return { lote: cli.lote, ...summarize(rows, existing) }
}
async function runReversion(client: PgClient, cli: Cli, actorId: number): Promise<Record<string, unknown>> {
  const count = await client.query<{ total: string }>('SELECT count(*)::text AS total FROM legado_conciliacion_b4 WHERE lote = $1', [cli.lote])
  if (count.rows[0]?.total === '0') fail('HISTORICAL_B4_REVERSION_LOTE_DESCONOCIDO')
  const prior = await client.query<{ actor_id: number; motivo: string }>('SELECT actor_id, motivo FROM reversiones_legado_b4 WHERE lote = $1', [cli.lote])
  if (prior.rows.length > 0) {
    if (prior.rows[0].actor_id !== actorId || prior.rows[0].motivo !== cli.motivo) fail('HISTORICAL_B4_REVERSION_IDEMPOTENCY_CONFLICT')
    return { lote: cli.lote, reversionYaRegistrada: 1, recibosNuevos: 0 }
  }
  await client.query('INSERT INTO reversiones_legado_b4 (id, lote, actor_id, motivo) VALUES ($1::uuid, $2, $3, $4)', [randomUUID(), cli.lote, actorId, cli.motivo])
  return { lote: cli.lote, reversionYaRegistrada: 0, recibosNuevos: 1 }
}

export async function main(argv = process.argv.slice(2)): Promise<Record<string, unknown>> {
  const cli = parseArgs(argv)
  const needsActor = cli.mode !== 'DRY_RUN'
  const appRequire = createRequire(join(APP_ROOT, 'package.json'))
  const { Client } = appRequire('pg') as { Client: new (options: { connectionString: string }) => PgClient }
  const client = new Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE'); await client.query("SET LOCAL lock_timeout='10s';SET LOCAL statement_timeout='90s'")
    if (cli.mode === 'DRY_RUN') await client.query('SET TRANSACTION READ ONLY')
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_NAME])
    const target = await assertExactTarget(client, databaseUrl())
    await assertRequiredTables(client)
    // No actor/permission query is allowed before the exact target guard.
    const actorId = needsActor ? await requireAuthorizedActor() : null
    if (cli.mode !== 'DRY_RUN') await lockOriginals(client)
    const before = await snapshotOriginals(client)
    const result = cli.mode === 'REVERT'
      ? await runReversion(client, cli, actorId as number)
      : await runBackfill(client, cli, actorId)
    const after = await snapshotOriginals(client)
    if (before !== after) fail('HISTORICAL_B4_ORIGINAL_TABLES_CHANGED')
    if (cli.mode === 'APPLY' || cli.mode === 'REVERT') await client.query('COMMIT')
    else await client.query('ROLLBACK')
    // Only aggregate counts are emitted: neither URL, actor, source JSON nor file metadata is logged.
    return { mode: cli.mode, target, originalesSinCambios: true, ...result }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* no secondary diagnostics */ }
    throw error
  } finally { await client.end() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
    const code = error instanceof Error ? error.message : 'HISTORICAL_B4_FAILED'
    process.stderr.write(`${/^[A-Z0-9_]+$/.test(code) ? code : 'HISTORICAL_B4_FAILED'}\n`)
    process.exitCode = 1
  })
}
