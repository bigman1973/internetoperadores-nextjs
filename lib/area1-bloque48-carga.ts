/** FUTURE CANDIDATE ONLY. No I/O at import, no provider, no general ISP apply.
 * The input is private; never log it. Synthetic tests substitute the pinned hash in a VM.
 * Deliberately requires an EMPTY Area1 baseline; does not merge/upsert existing data.
 */
import { createHash, randomUUID } from 'node:crypto'
import { appendArea4Audit } from './area4/audit'
import { financeEnvironment } from './finanzas/finance-environment'

export const BLOQUE48_DATASET_SHA256 = '829bd8b82c00a9464d7b39d37e3ce22eedbd0d61e8cab9d3867efd25b5f690d8'
export const BLOQUE48_COUNTS = Object.freeze({ clientes: 48, contratos: 239, mensual: 451, propuestas: 48, webs: 46 })
export const BLOQUE48_ORIGIN = 'crm.isp.tanda3.bloque48.carga.v1'
export const BLOQUE48_APPROVAL = Object.freeze({ apply: 'AUTORIZO CARGA SELECTIVA TANDA3 BLOQUE48 PRODUCTION', down: 'AUTORIZO DOWN SELECTIVO TANDA3 BLOQUE48 PRODUCTION' })
const RECEIPT_SCHEMA = 'TANDA3_BLOQUE48_RECEIPT_V1'
const TABLES = Object.freeze(['area1_isp_clientes', 'area1_isp_contratos', 'area1_isp_facturacion_mensual', 'area1_isp_vinculos'] as const)
type Table = typeof TABLES[number]
const validatedDatasets = new WeakSet<object>()
type Row = Record<string, any>
export interface Bloque48Pg { query(sql: string, values?: readonly unknown[]): Promise<{ rows: Row[]; rowCount?: number | null }> }
export type Bloque48Authority = Readonly<{ principalId: number; principalRole: string; acting: boolean }>
export type Bloque48Request = Readonly<{
  action: 'simulate' | 'apply' | 'down'; env: Record<string, string | undefined>; authority: Bloque48Authority;
  executionId?: string; expectedPlanHash?: string; approval?: string; backupHash?: string; backupVerified?: boolean
}>
export type Bloque48Dataset = Readonly<{ hash: string; clientes: readonly Row[]; contratos: readonly Row[]; mensual: readonly Row[] }>
export class Bloque48Error extends Error { constructor(public readonly code: string) { super(code); this.name = 'Bloque48Error' } }
const fail = (code: string): never => { throw new Bloque48Error(code) }
const check = (ok: unknown, code: string) => { if (!ok) fail(code) }
const isHash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const isId = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
function canonical(v: any): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
  return JSON.stringify(v)
}
export const bloque48Hash = (v: any) => createHash('sha256').update(canonical(v)).digest('hex')
function freeze<T>(v: T): T { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v) }; return v }
export const documentoBloque48 = (v: unknown) => { let s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (s.startsWith('ES') && s.length === 11) s = s.slice(2); return s }
/** Exactly nombreBloque in the native service, not the looser commercial-name matcher. */
export const nombreBloque48 = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const codigoBloque48 = (v: unknown) => String(v ?? '').trim().replace(/^0+(?=\d)/, '')
export function documentoValidoBloque48(v: unknown): boolean {
  const s = documentoBloque48(v), letters = 'TRWAGMYFPDXBNJZSQVHLCKE'
  if (/^\d{8}[A-Z]$/.test(s)) return letters[Number(s.slice(0, 8)) % 23] === s[8]
  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) return letters[Number(String('XYZ'.indexOf(s[0])) + s.slice(1, 8)) % 23] === s[8]
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) return false
  const digits = [...s.slice(1, 8)].map(Number)
  const total = digits.reduce((a, n, i) => a + (i % 2 ? n : Math.floor(n * 2 / 10) + n * 2 % 10), 0)
  const control = (10 - total % 10) % 10, digit = String(control), letter = 'JABCDEFGHI'[control]
  return /^[ABEH]/.test(s) ? s[8] === digit : /^[PQSW]/.test(s) ? s[8] === letter : s[8] === digit || s[8] === letter
}
function unique(rows: readonly Row[], key: (r: Row) => unknown) { const keys = rows.map(key); check(new Set(keys).size === keys.length, 'DATASET_DUPLICATE') }
function text(v: unknown) { return typeof v === 'string' && v.trim().length > 0 }
function date(v: unknown) { return v === null || typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v.slice(0, 10) }
function decimal(v: unknown, scale: number) { return typeof v === 'string' && new RegExp(`^-?\\d{1,${14 - scale}}(?:\\.\\d{1,${scale}})?$`).test(v) }
function keys(row: Row, names: string) { check(row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).sort().join(',') === names.split(' ').sort().join(','), 'DATASET_SHAPE') }
/** Hash is fixed, not an operator-provided override. No input data included in errors. */
export function parseBloque48Dataset(bytes: Buffer): Bloque48Dataset {
  const hash = createHash('sha256').update(bytes).digest('hex')
  check(hash === BLOQUE48_DATASET_SHA256, 'DATASET_HASH_CHANGED')
  let d: Row; try { d = JSON.parse(bytes.toString('utf8')) } catch { return fail('DATASET_JSON') }
  keys(d, 'schema source sourceConfirmedAt applyAllowed productionConfirmAllowed clientes contratos mensual')
  check(d.schema === 'TANDA3_BLOQUE48_PREPARACION_V1' && d.source === 'staging' && d.sourceConfirmedAt === '2026-11-26T20:19:36.095Z' && d.applyAllowed === false && d.productionConfirmAllowed === false, 'MANIFEST_CHANGED')
  check(Array.isArray(d.clientes) && d.clientes.length === 48 && Array.isArray(d.contratos) && d.contratos.length === 239 && Array.isArray(d.mensual) && d.mensual.length === 451, 'DATASET_COUNTS')
  for (const c of d.clientes) {
    keys(c, 'id isp_cliente_id codigo nombre doc_normalizado persona_fisica segmento_crm cliente_web_id huella empresa_id empresa_nombre nif_normalizado propuesta_id tipo destino_id motivo confianza')
    check(['id', 'isp_cliente_id', 'codigo', 'nombre', 'empresa_id', 'empresa_nombre', 'propuesta_id', 'destino_id'].every(k => text(c[k])) && typeof c.persona_fisica === 'boolean' && isHash(c.huella), 'CLIENT_SHAPE')
    check(documentoValidoBloque48(c.doc_normalizado) && documentoBloque48(c.doc_normalizado) === documentoBloque48(c.nif_normalizado), 'IDENTITY_INVALID')
    check(nombreBloque48(c.nombre) !== '' && nombreBloque48(c.nombre) === nombreBloque48(c.empresa_nombre), 'STRICT_NAME_CHANGED')
    check(c.segmento_crm === 'EMPRESA' && c.tipo === 'CRM_EMPRESA' && c.motivo === 'NIF' && c.confianza === 'ALTA' && c.destino_id === c.empresa_id, 'NATIVE_CRITERIA')
    check(c.cliente_web_id === null || Number.isSafeInteger(c.cliente_web_id) && c.cliente_web_id > 0, 'WEB_SHAPE')
  }
  for (const k of ['id', 'isp_cliente_id', 'propuesta_id', 'empresa_id']) unique(d.clientes, c => c[k])
  unique(d.clientes, c => codigoBloque48(c.codigo)); unique(d.clientes, c => documentoBloque48(c.doc_normalizado))
  const webs = d.clientes.filter((c: Row) => c.cliente_web_id !== null); check(webs.length === 46, 'WEB_COUNTS'); unique(webs, c => c.cliente_web_id)
  const clients = new Map<string, Row>(d.clientes.map((c: Row) => [c.id, c]))
  for (const c of d.contratos) {
    keys(c, 'id isp_contrato_id codigo_contrato_isp isp_cliente_row_id asignacion_cliente cliente_nombre_fichero doc_normalizado estado activo tarifa descripcion importe_sin_iva fecha_alta fecha_baja permanencia_hasta permanencia_texto periodicidad forma_pago contrato_servicio_id huella')
    const parent = clients.get(c.isp_cliente_row_id)
    check(parent && Number.isSafeInteger(c.isp_contrato_id) && c.isp_contrato_id > 0 && text(c.id) && text(c.codigo_contrato_isp) && c.asignacion_cliente === 'NIF' && text(c.cliente_nombre_fichero) && documentoBloque48(c.doc_normalizado) === documentoBloque48(parent.doc_normalizado) && text(c.estado) && typeof c.activo === 'boolean' && isHash(c.huella), 'CONTRACT_SCOPE')
    check(decimal(c.importe_sin_iva, 4) && ['fecha_alta', 'fecha_baja', 'permanencia_hasta'].every(k => date(c[k])) && ['tarifa', 'descripcion', 'permanencia_texto', 'periodicidad', 'forma_pago'].every(k => c[k] === null || typeof c[k] === 'string') && (c.contrato_servicio_id === null || Number.isSafeInteger(c.contrato_servicio_id) && c.contrato_servicio_id > 0), 'CONTRACT_SHAPE')
  }
  unique(d.contratos, c => c.id); unique(d.contratos, c => c.isp_contrato_id); unique(d.contratos, c => c.codigo_contrato_isp)
  // Full scope does not imply every master has contracts; the pinned export includes empty accounts.
  const codes = new Set(d.clientes.map((c: Row) => codigoBloque48(c.codigo)))
  for (const m of d.mensual) {
    keys(m, 'codigo_cliente anio mes importe_base')
    check(codes.has(codigoBloque48(m.codigo_cliente)) && Number.isSafeInteger(m.anio) && m.anio >= 2000 && m.anio <= 2100 && Number.isSafeInteger(m.mes) && m.mes >= 1 && m.mes <= 12 && decimal(m.importe_base, 2), 'MONTHLY_SCOPE')
  }
  unique(d.mensual, m => `${codigoBloque48(m.codigo_cliente)}|${m.anio}|${m.mes}`)
  // Monthly rows must all belong to the block, but absent billing is not invented.
  const validated = freeze({ hash, clientes: d.clientes, contratos: d.contratos, mensual: d.mensual })
  validatedDatasets.add(validated)
  return validated
}

export function guardBloque48(request: Bloque48Request) {
  const { env, authority, action } = request
  check(['simulate', 'apply', 'down'].includes(action), 'ACTION_INVALID')
  check(financeEnvironment({ databaseUrl: env.DATABASE_URL, vercelEnvironment: env.VERCEL_ENV, stagingSandbox: env.FINANCE_STAGING_SANDBOX, productionEnabled: '1', automaticLinksDisabled: '1' }) === 'production' && env.FINANCE_STAGING_SANDBOX !== '1', 'CANONICAL_PRODUCTION_REQUIRED')
  const url = new URL(env.DATABASE_URL!)
  check(!url.hash && [...url.searchParams.keys()].every(k => k === 'sslmode') && !['disable', 'allow', 'prefer', 'no-verify'].includes(url.searchParams.get('sslmode') || ''), 'DSN_OPTIONS_FORBIDDEN')
  check(env.AREA4_OWNER_USER_ID === '3' && authority.principalId === 3 && authority.principalRole === 'SUPER_ADMIN' && authority.acting === false, 'OWNER_PRINCIPAL_REQUIRED')
  if (action !== 'simulate') {
    check(env.FINANCE_DEPLOYMENT_READ_ONLY === '0' && env.IO_PRODUCTION_READ_ONLY === '0', 'READ_ONLY_BLOCK')
    check(request.approval === BLOQUE48_APPROVAL[action] && request.backupVerified === true && isHash(request.backupHash), 'OPERATOR_BACKUP_APPROVAL_REQUIRED')
    check(isId(request.executionId), 'EXECUTION_ID_REQUIRED')
    if (action === 'apply') check(isHash(request.expectedPlanHash), 'SIMULATION_HASH_REQUIRED')
  }
}

/** Full paginated scope, never a Stage-ID filtered lookup. Bounds fail closed. */
async function pages(pg: Bloque48Pg, tag: string, sql: string, values: readonly unknown[] = []) {
  const all: Row[] = [], size = 500
  for (let offset = 0; offset <= 100000; offset += size) {
    const r = await pg.query(`/*b48:${tag}*/ ${sql} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, size, offset])
    all.push(...r.rows); if (r.rows.length < size) return all
  }
  return fail('SCOPE_TOO_LARGE')
}
type Scope = { companies: Row[]; webs: Row[]; links: Row[]; tables: Record<Table, Row[]>; receipts: Row[] }
async function scope(pg: Bloque48Pg): Promise<Scope> {
  const companies = await pages(pg, 'companies', 'SELECT id,nombre,nif_normalizado,activo FROM public.crm_empresas ORDER BY id')
  const webs = await pages(pg, 'webs', 'SELECT id,codigo FROM public.clientes_web ORDER BY id')
  const links = await pages(pg, 'links', 'SELECT empresa_id,cliente_id,origen FROM public.crm_empresa_clientes ORDER BY cliente_id')
  const tables = {} as Record<Table, Row[]>
  for (const t of TABLES) tables[t] = (await pages(pg, `snapshot:${t}`, `SELECT to_jsonb(t) AS snapshot FROM public.${t} t ORDER BY id`)).map(r => r.snapshot)
  const receipts = await pages(pg, 'receipts', "SELECT id,despues FROM public.auditoria_permisos_area4 WHERE origen=$1 AND operacion='CRM_IMPORTACION_ISP' AND despues->>'datasetHash'=$2 ORDER BY created_at,id", [BLOQUE48_ORIGIN, BLOQUE48_DATASET_SHA256])
  return { companies, webs, links, tables, receipts }
}
async function guardLiveOwner(pg: Bloque48Pg) {
  const r = await pg.query('/*b48:owner*/ SELECT id,activo,rol FROM public.usuarios_admin WHERE id=$1 LIMIT 1', [3])
  check(r.rows.length === 1 && r.rows[0].id === 3 && r.rows[0].activo === true && r.rows[0].rol === 'SUPER_ADMIN', 'LIVE_OWNER_REQUIRED')
}
/** Only the two locally declared inbound FKs are accepted. Unknown schema = no write. */
async function guardReferences(pg: Bloque48Pg) {
  const refs = await pages(pg, 'references', `SELECT ns.nspname AS schema_name,cl.relname AS source_table,att.attname AS source_column,nt.nspname AS target_schema,ct.relname AS target_table,at.attname AS target_column,cardinality(c.conkey) AS width,c.confdeltype AS delete_action FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace JOIN pg_class ct ON ct.oid=c.confrelid JOIN pg_namespace nt ON nt.oid=ct.relnamespace JOIN pg_attribute att ON att.attrelid=cl.oid AND att.attnum=c.conkey[1] JOIN pg_attribute at ON at.attrelid=ct.oid AND at.attnum=c.confkey[1] WHERE c.contype='f' AND ct.relname=ANY($1::text[]) ORDER BY ns.nspname,cl.relname,c.conname`, [TABLES])
  check(refs.length === 2 && refs.every(r => r.schema_name === 'public' && r.target_schema === 'public' && r.target_table === TABLES[0] && r.target_column === 'id' && r.source_column === 'isp_cliente_row_id' && r.width === 1 && (r.source_table === TABLES[1] && r.delete_action === 'n' || r.source_table === TABLES[3] && r.delete_action === 'c')), 'REFERENCE_SCHEMA_CHANGED')
  check(new Set(refs.map(r => r.source_table)).size === 2, 'REFERENCE_SCHEMA_CHANGED')
}
function mapping(dataset: Bloque48Dataset, s: Scope) {
  const mapped = dataset.clientes.map(c => {
    const doc = documentoBloque48(c.doc_normalizado)
    // Every normalized document match counts, including inactive/differently-named duplicates.
    const companies = s.companies.filter(e => documentoBloque48(e.nif_normalizado) === doc)
    check(companies.length === 1, 'COMPANY_IDENTITY_AMBIGUOUS_OR_MISSING')
    const e = companies[0]
    check(e.activo === true && documentoValidoBloque48(e.nif_normalizado) && nombreBloque48(e.nombre) === nombreBloque48(c.nombre), 'COMPANY_IDENTITY_CHANGED')
    const web = s.webs.filter(w => codigoBloque48(w.codigo) === codigoBloque48(c.codigo))
    check(c.cliente_web_id === null ? web.length === 0 : web.length === 1, 'WEB_CODE_AMBIGUOUS_OR_CHANGED')
    const webId = web[0]?.id ?? null
    check(webId === null || Number.isSafeInteger(webId) && webId > 0, 'WEB_ID_INVALID')
    // Native confirmation must still be able to create precisely 46 new links.
    check(!s.links.some(l => l.cliente_id === webId), 'PREEXISTING_COMPANY_WEB_LINK')
    return { sourceId: c.id, empresaId: e.id, webId }
  })
  unique(mapped, r => r.empresaId); unique(mapped.filter(r => r.webId !== null), r => r.webId)
  return freeze(mapped)
}
function signedReceipt(r: Row) { const { receiptHash, ...body } = r; return isHash(receiptHash) && bloque48Hash(body) === receiptHash }
function receipts(s: Scope) {
  const executions = new Map<string, Row>(), downs = new Set<string>()
  const entries = s.receipts.map(row => row.despues)
  for (const r of entries) {
    check(r && r.schema === RECEIPT_SCHEMA && r.datasetHash === BLOQUE48_DATASET_SHA256 && signedReceipt(r), 'RECEIPT_CORRUPT')
    if (r.action === 'APPLY') { check(isId(r.executionId) && !executions.has(r.executionId), 'RECEIPT_DUPLICATE'); executions.set(r.executionId, r) }
    else check(['DOWN', 'NOOP_APPLY', 'NOOP_DOWN'].includes(r.action), 'RECEIPT_ACTION_INVALID')
  }
  for (const r of entries.filter(r => r.action === 'DOWN')) {
    const applied = executions.get(r.executionId)
    check(applied && !downs.has(r.executionId) && r.applyReceiptHash === applied.receiptHash && r.snapshotHash === applied.snapshotHash && r.restoredBaselineHash === applied.baselineHash && r.deletedCount === 786 && r.createdCount === 0, 'RECEIPT_DOWN_INVALID')
    downs.add(r.executionId)
  }
  for (const r of entries.filter(r => r.action.startsWith('NOOP_'))) {
    check(executions.has(r.executionId) && r.createdCount === 0 && r.deletedCount === 0 && (r.action !== 'NOOP_DOWN' || downs.has(r.executionId)), 'RECEIPT_NOOP_INVALID')
  }
  const active = [...executions.values()].filter(r => !downs.has(r.executionId))
  check(active.length <= 1, 'RECEIPT_MULTIPLE_ACTIVE')
  return { executions, downs, active: active[0] }
}
function verifyCreated(s: Scope, r: Row) {
  check(Array.isArray(r.created) && r.created.length === 786 && isHash(r.snapshotHash) && bloque48Hash(r.created) === r.snapshotHash && r.baselineHash === bloque48Hash(Object.fromEntries(TABLES.map(t => [t, []]))), 'RECEIPT_SNAPSHOT_INVALID')
  check(r.createdCount === 786 && r.deletedCount === 0 && isHash(r.planHash) && isHash(r.identityScopeHash) && isHash(r.backupHash), 'RECEIPT_COUNTS_INVALID')
  const expectedCounts = [48, 239, 451, 48]
  for (const [index, table] of TABLES.entries()) {
    const created = r.created.filter((v: Row) => v.table === table), actual = s.tables[table]
    check(created.length === expectedCounts[index] && actual.length === created.length && new Set(created.map((v: Row) => v.id)).size === created.length, 'DOWN_EXTRA_OR_MISSING_ROWS')
    for (const v of created) {
      const row = actual.find(x => x.id === v.id)
      check(isId(v.id) && isHash(v.hash) && row && bloque48Hash(row) === v.hash, 'CREATED_ROW_MODIFIED_OR_CONFIRMED')
    }
  }
  check(r.created.every((v: Row) => TABLES.includes(v.table)), 'RECEIPT_TABLE_INVALID')
  check(s.tables[TABLES[0]].every(c => c.crm_empresa_id === null && c.crm_contacto_id === null) && s.tables[TABLES[1]].every(c => c.contrato_servicio_id === null) && s.tables[TABLES[3]].every(v => v.estado === 'PENDIENTE' && v.tipo === 'CRM_EMPRESA' && v.motivo === 'NIF' && v.confianza === 'ALTA' && v.revisado_at === null && v.revisado_por === null), 'DOWN_NATIVE_CONFIRMATION_PRESENT')
  const ids = new Set(s.tables[TABLES[0]].map(c => c.id))
  check(s.tables[TABLES[1]].every(c => ids.has(c.isp_cliente_row_id)) && s.tables[TABLES[3]].every(v => ids.has(v.isp_cliente_row_id)), 'DOWN_REFERENCE_CHANGED')
}
function validateMappedCreated(s: Scope, dataset: Bloque48Dataset, mapped: readonly Row[]) {
  for (const m of mapped) {
    const source = dataset.clientes.find(c => c.id === m.sourceId)!
    const client = s.tables[TABLES[0]].find(c => c.isp_cliente_id === source.isp_cliente_id)
    check(client && client.cliente_web_id === m.webId && client.doc_normalizado === documentoBloque48(source.doc_normalizado) && client.nombre === source.nombre, 'CREATED_MAPPING_CHANGED')
    const proposals = s.tables[TABLES[3]].filter(v => v.isp_cliente_row_id === client.id)
    check(proposals.length === 1 && proposals[0].destino_id === m.empresaId, 'CREATED_PROPOSAL_CHANGED')
  }
}
function makePlan(dataset: Bloque48Dataset, s: Scope, mapped: readonly Row[], active?: Row) {
  const body = { schema: 'TANDA3_BLOQUE48_PLAN_V1', datasetHash: dataset.hash, counts: BLOQUE48_COUNTS, baselineHash: bloque48Hash(s.tables), identityScopeHash: bloque48Hash({ companies: s.companies, webs: s.webs, links: s.links }), mappings: mapped, activeExecutionId: active?.executionId ?? null }
  return freeze({ ...body, hash: bloque48Hash(body) })
}
export type Bloque48Summary = Readonly<{ action: string; status: string; datasetHash: string; planHash?: string; executionId?: string; receiptHash?: string; snapshotHash?: string; created: number; deleted: number; counts: typeof BLOQUE48_COUNTS }>
async function audit(pg: Bloque48Pg, body: Row): Promise<Row> {
  const receipt = { schema: RECEIPT_SCHEMA, datasetHash: BLOQUE48_DATASET_SHA256, ...body }
  const signed = { ...receipt, receiptHash: bloque48Hash(receipt) }
  // Reuse appendArea4Audit, adapted to a pg transaction; no new journal/table/migration.
  const adapter: any = { auditoriaPermisosArea4: { create: async ({ data }: any) => {
    const result = await pg.query('/*b48:audit-insert*/ INSERT INTO public.auditoria_permisos_area4 (actor_id,objetivo_usuario_id,operacion,area_codigo,antes,despues,origen) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) RETURNING id,despues', [data.actorId, data.objetivoUsuarioId, data.operacion, data.areaCodigo, null, JSON.stringify(data.despues), data.origen])
    check(result.rows.length === 1 && result.rows[0].despues?.receiptHash === signed.receiptHash && signedReceipt(result.rows[0].despues), 'RECEIPT_WRITE_FAILED')
    return result.rows[0]
  } } }
  const saved = await appendArea4Audit(adapter, { actorId: 3, operacion: 'CRM_IMPORTACION_ISP', areaCodigo: 'crm.isp', origen: BLOQUE48_ORIGIN, despues: signed as any })
  const persisted = await pg.query('/*b48:audit-read*/ SELECT id,despues FROM public.auditoria_permisos_area4 WHERE id=$1 LIMIT 1', [saved.id])
  check(persisted.rows.length === 1 && bloque48Hash(persisted.rows[0].despues) === bloque48Hash(signed), 'RECEIPT_NOT_DURABLE_IN_TX')
  return signed
}
async function insert(pg: Bloque48Pg, table: Table, data: Row) {
  const columns = Object.keys(data)
  const result = await pg.query(`/*b48:insert:${table}*/ INSERT INTO public.${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id,to_jsonb(${table}) AS snapshot`, Object.values(data))
  check(result.rowCount === 1 && result.rows.length === 1 && result.rows[0].id === data.id, 'INSERT_COUNT_MISMATCH')
  const stored = result.rows[0].snapshot
  const amount = (v: unknown) => { const [whole, fraction = ''] = String(v).split('.'); return BigInt(whole) * BigInt(10000) + BigInt((fraction + '0000').slice(0, 4)) * (String(v).startsWith('-') ? -BigInt(1) : BigInt(1)) }
  check(stored && columns.every(k => ['importe_sin_iva', 'importe_base'].includes(k) ? amount(stored[k]) === amount(data[k]) : stored[k] === data[k]), 'INSERTED_VALUES_MISMATCH')
}
async function load(pg: Bloque48Pg, dataset: Bloque48Dataset, mapped: readonly Row[]) {
  const ids = new Map<string, string>(), generated = new Set<string>()
  const forbidden = new Set([...dataset.clientes.flatMap(c => [c.id, c.propuesta_id]), ...dataset.contratos.map(c => c.id)])
  const newId = () => { const id = randomUUID(); check(!forbidden.has(id) && !generated.has(id), 'GENERATED_ID_COLLISION'); generated.add(id); return id }
  for (const c of dataset.clientes) {
    const id = newId(), m = mapped.find(x => x.sourceId === c.id)!
    ids.set(c.id, id)
    await insert(pg, TABLES[0], { id, isp_cliente_id: c.isp_cliente_id, codigo: c.codigo, nombre: c.nombre, doc_normalizado: documentoBloque48(c.doc_normalizado), persona_fisica: c.persona_fisica, segmento_crm: 'EMPRESA', huella: c.huella, cliente_web_id: m.webId, crm_empresa_id: null, crm_contacto_id: null, primera_importacion_id: null, ultima_importacion_id: null })
  }
  for (const k of dataset.contratos) {
    const data: Row = { id: newId() }
    for (const key of ['isp_contrato_id', 'codigo_contrato_isp', 'asignacion_cliente', 'cliente_nombre_fichero', 'doc_normalizado', 'estado', 'activo', 'tarifa', 'descripcion', 'importe_sin_iva', 'permanencia_texto', 'periodicidad', 'forma_pago', 'huella']) data[key] = k[key]
    for (const key of ['fecha_alta', 'fecha_baja', 'permanencia_hasta']) data[key] = k[key] === null ? null : k[key].slice(0, 10)
    Object.assign(data, { isp_cliente_row_id: ids.get(k.isp_cliente_row_id), contrato_servicio_id: null, ultima_importacion_id: null })
    await insert(pg, TABLES[1], data)
  }
  for (const m of dataset.mensual) await insert(pg, TABLES[2], { id: newId(), codigo_cliente: m.codigo_cliente, anio: m.anio, mes: m.mes, importe_base: m.importe_base, ultima_importacion_id: null })
  for (const m of mapped) await insert(pg, TABLES[3], { id: newId(), isp_cliente_row_id: ids.get(m.sourceId), tipo: 'CRM_EMPRESA', destino_id: m.empresaId, motivo: 'NIF', confianza: 'ALTA', estado: 'PENDIENTE', detalle: null, revisado_por: null, revisado_at: null, ultima_importacion_id: null })
  return generated
}
/** Caller owns ONE dedicated connection; never call with a pool.query wrapper.
 * simulate performs ONLY SELECT within SERIALIZABLE READ ONLY (no audit/lock writes).
 * apply/down serialize the four tables, recheck live owner and identity, and commit receipt atomically.
 */
export async function executeBloque48(pg: Bloque48Pg, dataset: Bloque48Dataset, request: Bloque48Request): Promise<Bloque48Summary> {
  guardBloque48(request); check(validatedDatasets.has(dataset) && dataset.hash === BLOQUE48_DATASET_SHA256 && Object.isFrozen(dataset), 'DATASET_NOT_PINNED')
  const write = request.action !== 'simulate'
  await pg.query(`/*b48:begin*/ BEGIN ISOLATION LEVEL SERIALIZABLE ${write ? 'READ WRITE' : 'READ ONLY'}`)
  try {
    if (write) {
      await pg.query(`/*b48:lock-business*/ LOCK TABLE ${TABLES.map(t => `public.${t}`).join(',')} IN ACCESS EXCLUSIVE MODE`)
      await pg.query('/*b48:lock-identities*/ LOCK TABLE public.crm_empresas,public.clientes_web,public.crm_empresa_clientes,public.usuarios_admin IN SHARE MODE')
    }
    await guardLiveOwner(pg); await guardReferences(pg)
    const s = await scope(pg), history = receipts(s), mapped = mapping(dataset, s)
    if (history.active) { verifyCreated(s, history.active); validateMappedCreated(s, dataset, mapped) }
    const plan = makePlan(dataset, s, mapped, history.active)
    if (history.active) check(history.active.identityScopeHash === plan.identityScopeHash, 'IDENTITY_SCOPE_CHANGED_SINCE_APPLY')
    const summary = (status: string, extra: Row = {}): Bloque48Summary => freeze({ action: request.action, status, datasetHash: dataset.hash, planHash: plan.hash, created: 0, deleted: 0, counts: BLOQUE48_COUNTS, ...extra })
    if (request.action === 'simulate') {
      if (!history.active) check(TABLES.every(t => s.tables[t].length === 0), 'PREEXISTING_BUSINESS_DATA')
      await pg.query('/*b48:commit*/ COMMIT'); return summary(history.active ? 'ALREADY_APPLIED_READ_ONLY' : 'SIMULATED_READ_ONLY', { executionId: history.active?.executionId })
    }
    if (request.action === 'apply') {
      check(plan.hash === request.expectedPlanHash || history.active?.executionId === request.executionId && history.active?.planHash === request.expectedPlanHash, 'PLAN_CHANGED_RESIMULATE')
      check(!history.downs.has(request.executionId!), 'EXECUTION_ALREADY_DOWN')
      if (history.active) {
        const receipt = await audit(pg, { action: 'NOOP_APPLY', executionId: history.active.executionId, requestedExecutionId: request.executionId, planHash: plan.hash, backupHash: request.backupHash, createdCount: 0, deletedCount: 0 })
        await pg.query('/*b48:commit*/ COMMIT'); return summary('ALREADY_APPLIED_NO_BUSINESS_WRITES', { executionId: history.active.executionId, receiptHash: receipt.receiptHash })
      }
      check(!history.executions.has(request.executionId!), 'EXECUTION_ALREADY_USED')
      check(TABLES.every(t => s.tables[t].length === 0), 'PREEXISTING_BUSINESS_DATA')
      const generated = await load(pg, dataset, mapped), after = await scope(pg)
      check(bloque48Hash({ companies: after.companies, webs: after.webs, links: after.links }) === plan.identityScopeHash, 'IDENTITY_CHANGED_IN_TX')
      const created = TABLES.flatMap(table => after.tables[table].map(row => ({ table, id: row.id, hash: bloque48Hash(row) }))).sort((a, b) => a.table.localeCompare(b.table) || a.id.localeCompare(b.id))
      check(created.length === 786 && created.every(v => generated.has(v.id)), 'EXACT_INSERTED_SCOPE_FAILED')
      const body = { action: 'APPLY', executionId: request.executionId, planHash: plan.hash, identityScopeHash: plan.identityScopeHash, backupHash: request.backupHash, baselineHash: plan.baselineHash, created, snapshotHash: bloque48Hash(created), createdCount: 786, deletedCount: 0 }
      verifyCreated(after, body); validateMappedCreated(after, dataset, mapped)
      const receipt = await audit(pg, body)
      await pg.query('/*b48:commit*/ COMMIT'); return summary('APPLIED_PENDING_ONLY', { executionId: request.executionId, receiptHash: receipt.receiptHash, snapshotHash: receipt.snapshotHash, created: 786 })
    }
    const execution = history.executions.get(request.executionId!)
    check(execution, 'DOWN_EXECUTION_NOT_FOUND')
    if (history.downs.has(request.executionId!)) {
      const receipt = await audit(pg, { action: 'NOOP_DOWN', executionId: request.executionId, backupHash: request.backupHash, createdCount: 0, deletedCount: 0 })
      await pg.query('/*b48:commit*/ COMMIT'); return summary('ALREADY_DOWN_NO_BUSINESS_WRITES', { executionId: request.executionId, receiptHash: receipt.receiptHash })
    }
    check(history.active?.executionId === request.executionId, 'DOWN_EXECUTION_NOT_ACTIVE')
    // verifyCreated above rejects confirmation, edits, missing rows and extra refs before deletion.
    for (const table of [...TABLES].reverse()) {
      const ids = execution!.created.filter((r: Row) => r.table === table).map((r: Row) => r.id)
      const result = await pg.query(`/*b48:delete:${table}*/ DELETE FROM public.${table} WHERE id=ANY($1::text[]) RETURNING id`, [ids])
      check(result.rowCount === ids.length && result.rows.length === ids.length && result.rows.every(r => ids.includes(r.id)), 'DOWN_DELETE_COUNT_MISMATCH')
    }
    const after = await scope(pg)
    check(bloque48Hash(after.tables) === execution!.baselineHash, 'DOWN_BASELINE_NOT_RESTORED')
    check(bloque48Hash({ companies: after.companies, webs: after.webs, links: after.links }) === plan.identityScopeHash, 'DOWN_IDENTITY_SCOPE_CHANGED')
    const receipt = await audit(pg, { action: 'DOWN', executionId: request.executionId, applyReceiptHash: execution!.receiptHash, snapshotHash: execution!.snapshotHash, restoredBaselineHash: execution!.baselineHash, backupHash: request.backupHash, createdCount: 0, deletedCount: 786 })
    await pg.query('/*b48:commit*/ COMMIT'); return summary('DOWN_ONLY_CREATED_ROWS', { executionId: request.executionId, receiptHash: receipt.receiptHash, deleted: 786 })
  } catch (e) {
    try { await pg.query('/*b48:rollback*/ ROLLBACK') } catch { return fail('ROLLBACK_FAILED_CONNECTION_MUST_CLOSE') }
    if (e instanceof Bloque48Error) throw e
    return fail('TRANSACTION_FAILED_PRIVATE_DETAILS_SUPPRESSED')
  }
}
