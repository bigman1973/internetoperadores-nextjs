import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import * as nodePath from 'node:path'
import * as nodeUrl from 'node:url'
import { appendArea4Audit } from '../lib/area4/audit'
import { financeEnvironment } from '../lib/finanzas/finance-environment'

// ALL IDENTITIES AND ROWS BELOW ARE SYNTHETIC. NEVER loads a real dataset/DSN/PG.
// Core executes unmodified except its pin, substituted ONLY in VM to test synthetic bytes.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const coreSource = readFileSync(resolve(repo, 'lib/area1-bloque48-carga.ts'), 'utf8')
const cliSource = readFileSync(resolve(repo, 'scripts/tanda3-bloque48-production.ts'), 'utf8')
const TABLES = ['area1_isp_clientes', 'area1_isp_contratos', 'area1_isp_facturacion_mensual', 'area1_isp_vinculos']
type Row = Record<string, any>
function cif(i: number) {
  const digits = String(i).padStart(7, '0'), total = [...digits].map(Number).reduce((a, n, j) => a + (j % 2 ? n : Math.floor(n * 2 / 10) + n * 2 % 10), 0)
  return `B${digits}${(10 - total % 10) % 10}`
}
function fixture() {
  const clientes: Row[] = [], contratos: Row[] = [], mensual: Row[] = []
  for (let i = 0; i < 48; i++) {
    const doc = cif(i + 100), nombre = `SYNTHETIC COMPANY ${i} SL`, codigo = String(i + 1000)
    clientes.push({ id: `stage-only-client-${i}`, isp_cliente_id: `synthetic-isp-${i}`, codigo, nombre, doc_normalizado: doc, persona_fisica: false, segmento_crm: 'EMPRESA', cliente_web_id: i < 46 ? i + 1 : null, huella: 'a'.repeat(64), empresa_id: `stage-company-${i}`, empresa_nombre: nombre, nif_normalizado: doc, propuesta_id: `stage-only-proposal-${i}`, tipo: 'CRM_EMPRESA', destino_id: `stage-company-${i}`, motivo: 'NIF', confianza: 'ALTA' })
  }
  for (let i = 0; i < 239; i++) {
    const c = clientes[i % 48]
    contratos.push({ id: `stage-only-contract-${i}`, isp_contrato_id: i + 1, codigo_contrato_isp: `SYNTHETIC-CONTRACT-${i}`, isp_cliente_row_id: c.id, asignacion_cliente: 'NIF', cliente_nombre_fichero: c.nombre, doc_normalizado: c.doc_normalizado, estado: 'ACTIVO', activo: true, tarifa: 'SYNTHETIC', descripcion: null, importe_sin_iva: '12.3400', fecha_alta: '2026-01-01T00:00:00.000Z', fecha_baja: null, permanencia_hasta: null, permanencia_texto: null, periodicidad: 'MENSUAL', forma_pago: 'SYNTHETIC', contrato_servicio_id: 999000 + i, huella: 'b'.repeat(64) })
  }
  for (let i = 0; i < 451; i++) mensual.push({ codigo_cliente: clientes[i % 48].codigo, anio: 2026, mes: Math.floor(i / 48) + 1, importe_base: '34.56' })
  return { schema: 'TANDA3_BLOQUE48_PREPARACION_V1', source: 'staging', sourceConfirmedAt: '2026-11-26T20:19:36.095Z', applyAllowed: false, productionConfirmAllowed: false, clientes, contratos, mensual }
}
function moduleFor(d = fixture()) {
  const bytes = Buffer.from(JSON.stringify(d) + '\n'), hash = createHash('sha256').update(bytes).digest('hex')
  const source = coreSource.replace(/export const BLOQUE48_DATASET_SHA256 = '[a-f0-9]{64}'/, `export const BLOQUE48_DATASET_SHA256 = '${hash}'`)
  const sandbox: any = { exports: {}, Buffer, URL, console, require: (id: string) => {
    if (id === 'node:crypto') return { createHash, randomUUID }
    if (id === './area4/audit') return { appendArea4Audit }
    if (id === './finanzas/finance-environment') return { financeEnvironment }
    throw new Error('NO_NETWORK_MODULE_ALLOWED')
  } }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox)
  return { core: sandbox.exports, bytes, raw: d }
}
class MemoryPg {
  state: Row; initial: Row; calls: string[] = []; mutationCount = 0; inTx = false; readonly = false; backup?: Row
  failAudit = false; failAuditRead = false; failInsert = false; corruptInsert = false; badDeleteCount = false
  constructor(d: ReturnType<typeof fixture>) {
    const refs = [TABLES[1], TABLES[3]].map(source_table => ({ schema_name: 'public', source_table, source_column: 'isp_cliente_row_id', target_schema: 'public', target_table: TABLES[0], target_column: 'id', width: 1, delete_action: source_table === TABLES[1] ? 'n' : 'c' }))
    this.state = { companies: d.clientes.map((c, i) => ({ id: `production-company-${i}`, nombre: c.empresa_nombre, nif_normalizado: c.doc_normalizado, activo: true })), webs: d.clientes.filter(c => c.cliente_web_id !== null).map((c, i) => ({ id: 10001 + i, codigo: `000${c.codigo}` })), links: [], owner: { id: 3, activo: true, rol: 'SUPER_ADMIN' }, refs, receipts: [], tables: Object.fromEntries(TABLES.map(t => [t, []])) }
    this.initial = structuredClone(this.state)
  }
  async query(sql: string, values: readonly any[] = []): Promise<{ rows: Row[]; rowCount?: number }> {
    this.calls.push(sql)
    const tag = sql.match(/\/\*b48:([^*]+)\*\//)?.[1]
    assert.ok(tag, 'All SQL must be explicit')
    const result = (rows: Row[], rowCount = rows.length) => ({ rows: structuredClone(rows), rowCount })
    const mutate = () => { assert.equal(this.inTx, true); assert.equal(this.readonly, false); this.mutationCount++ }
    const page = (rows: Row[]) => { assert.ok(sql.includes('LIMIT $')); const [limit, offset] = values.slice(-2); return result(rows.slice(offset, offset + limit)) }
    if (tag === 'begin') { assert.equal(this.inTx, false); this.backup = structuredClone(this.state); this.inTx = true; this.readonly = sql.endsWith('READ ONLY'); assert.ok(sql.includes('SERIALIZABLE')); return result([]) }
    if (tag === 'commit') { this.inTx = false; this.backup = undefined; return result([]) }
    if (tag === 'rollback') { this.state = this.backup!; this.inTx = false; this.backup = undefined; return result([]) }
    assert.equal(this.inTx, true)
    if (tag!.startsWith('lock-')) { assert.equal(this.readonly, false); return result([]) }
    if (tag === 'owner') return result([this.state.owner])
    if (tag === 'companies') return page(this.state.companies)
    if (tag === 'webs') return page(this.state.webs)
    if (tag === 'links') return page(this.state.links)
    if (tag === 'references') return page(this.state.refs)
    if (tag === 'receipts') return page(this.state.receipts)
    if (tag!.startsWith('snapshot:')) return page(this.state.tables[tag!.slice('snapshot:'.length)].map((snapshot: Row) => ({ snapshot })))
    if (tag!.startsWith('insert:')) {
      mutate(); if (this.failInsert && this.mutationCount === 100) throw new Error('PRIVATE_FAKE_PII_NOT_ALLOWED_IN_ERRORS')
      const table = tag!.slice('insert:'.length), columns = sql.match(/\(([^)]+)\) VALUES/)![1].split(',')
      const row = Object.fromEntries(columns.map((k, i) => [k, values[i]]))
      Object.assign(row, { created_at: '2026-11-26T21:00:00', updated_at: '2026-11-26T21:00:00' })
      if (this.corruptInsert) row.nombre = 'ALTERED BY SYNTHETIC TRIGGER'
      this.state.tables[table].push(row); return result([{ id: row.id, snapshot: row }], 1)
    }
    if (tag === 'audit-insert') {
      mutate(); if (this.failAudit) throw new Error('PRIVATE_FAKE_RECEIPT_FAILURE')
      assert.equal(values[2], 'CRM_IMPORTACION_ISP'); assert.equal(values[6], 'crm.isp.tanda3.bloque48.carga.v1')
      const row = { id: randomUUID(), despues: JSON.parse(values[5]) }; this.state.receipts.push(row); return result([row], 1)
    }
    if (tag === 'audit-read') return result(this.failAuditRead ? [] : this.state.receipts.filter((r: Row) => r.id === values[0]))
    if (tag!.startsWith('delete:')) {
      mutate(); const table = tag!.slice('delete:'.length), ids = values[0]
      const removed = this.state.tables[table].filter((r: Row) => ids.includes(r.id))
      // Model the two local FKs. Down must delete dependent rows first, not cascade.
      if (table === TABLES[0]) assert.ok([TABLES[1], TABLES[3]].every(t => !this.state.tables[t].some((r: Row) => ids.includes(r.isp_cliente_row_id))))
      this.state.tables[table] = this.state.tables[table].filter((r: Row) => !ids.includes(r.id)); return result(removed.map((r: Row) => ({ id: r.id })), this.badDeleteCount ? 0 : removed.length)
    }
    throw new Error(`UNSUPPORTED_SYNTHETIC_SQL:${tag}`)
  }
}
const env = { DATABASE_URL: 'postgresql://postgres:synthetic-not-a-real-password@yamanote.proxy.rlwy.net:34880/railway', VERCEL_ENV: 'production', AREA4_OWNER_USER_ID: '3', FINANCE_STAGING_SANDBOX: '0', FINANCE_DEPLOYMENT_READ_ONLY: '0', IO_PRODUCTION_READ_ONLY: '0' }
const authority = { principalId: 3, principalRole: 'SUPER_ADMIN', acting: false }
function setup() { const m = moduleFor(); return { ...m, dataset: m.core.parseBloque48Dataset(m.bytes), pg: new MemoryPg(m.raw) } }
const simReq = () => ({ action: 'simulate', env: { ...env }, authority: { ...authority } })
function writeReq(core: any, action: 'apply' | 'down', executionId: string, hash?: string) { return { ...simReq(), action, executionId, expectedPlanHash: hash, approval: core.BLOQUE48_APPROVAL[action], backupHash: 'c'.repeat(64), backupVerified: true } }
async function rejected(fn: () => Promise<any> | any, code: string) { await assert.rejects(async () => fn(), (e: any) => { assert.equal(e.code, code); assert.equal(e.message, code); return true }) }

function memoryCli(s: ReturnType<typeof setup>) {
  const input = '/synthetic-private/input.json', backup = '/synthetic-private/backup.bin', backupBytes = Buffer.from('SYNTHETIC RESTORE TESTED BACKUP'), output: string[] = []
  const files: Record<string, { bytes: Buffer; mode: number }> = { [input]: { bytes: s.bytes, mode: 0o100600 }, [backup]: { bytes: backupBytes, mode: 0o100600 } }
  let connects = 0, driverImports = 0
  const fs = {
    realpathSync: (p: string) => p,
    statSync: (p: string) => { assert.ok(files[p], 'only fake files'); return { mode: files[p].mode, size: files[p].bytes.length, isFile: () => true } },
    readFileSync: (p: string) => { assert.ok(files[p], 'only fake files'); return files[p].bytes },
  }
  class Client {
    constructor(options: Row) { assert.equal(options.connectionString, env.DATABASE_URL); assert.equal(options.ssl.rejectUnauthorized, true) }
    async connect() { connects++ }
    async end() {}
    query(sql: string, values: readonly unknown[]) { return s.pg.query(sql, values) }
  }
  const sandbox: any = { exports: {}, Buffer, URL, process: { argv: [] }, console: { log: (v: string) => output.push(v) }, require: (id: string) => {
    if (id === 'node:crypto') return { createHash }
    if (id === 'node:fs') return fs
    if (id === 'node:path') return nodePath
    if (id === 'node:url') return nodeUrl
    if (id === '../lib/area1-bloque48-carga') return s.core
    if (id === 'pg') { driverImports++; return { Client } }
    throw new Error('NO_NETWORK_MODULE_ALLOWED')
  } }
  const source = cliSource.replaceAll('import.meta.url', JSON.stringify(nodeUrl.pathToFileURL(resolve(repo, 'scripts/tanda3-bloque48-production.ts')).href))
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, sandbox)
  const base = ['--input-file', input, '--dsn-env', 'SYNTHETIC_DSN', '--principal-id', '3', '--principal-role', 'SUPER_ADMIN', '--no-acting', 'SI']
  const environment = { ...env, SYNTHETIC_DSN: env.DATABASE_URL }
  return { run: sandbox.exports.runBloque48Cli, base, environment, output, files, input, backup, backupHash: createHash('sha256').update(backupBytes).digest('hex'), counters: () => ({ connects, driverImports }) }
}

// Scalar validator uses the identical checksum algorithm and rejects deliberately invalid control.
test('synthetic fixture exact counts, immutable, valid identities, private pin cannot be overridden', async () => {
  const s = setup(); assert.equal(s.dataset.clientes.length, 48); assert.equal(s.dataset.contratos.length, 239); assert.equal(s.dataset.mensual.length, 451)
  assert.ok(Object.isFrozen(s.dataset) && Object.isFrozen(s.dataset.clientes[0])); assert.equal(s.core.documentoValidoBloque48(cif(123)), true)
  assert.equal(s.core.documentoValidoBloque48('B00000000X'), false)
  await rejected(() => s.core.parseBloque48Dataset(Buffer.from(s.bytes.toString() + ' ')), 'DATASET_HASH_CHANGED')
  await rejected(() => s.core.executeBloque48(s.pg, Object.freeze({ ...s.dataset }), simReq()), 'DATASET_NOT_PINNED'); assert.equal(s.pg.calls.length, 0)
})

test('default simulation READ ONLY, full paginated identity scope and no writes/audit/locks', async () => {
  const s = setup(); for (let i = 0; i < 510; i++) s.pg.state.companies.push({ id: `extra-${i}`, nombre: 'UNRELATED SYNTHETIC', nif_normalizado: null, activo: true })
  const before = structuredClone(s.pg.state), r = await s.core.executeBloque48(s.pg, s.dataset, simReq())
  assert.equal(r.status, 'SIMULATED_READ_ONLY'); assert.equal(r.created, 0); assert.match(r.planHash, /^[a-f0-9]{64}$/)
  assert.equal(s.pg.mutationCount, 0); assert.deepEqual(s.pg.state, before); assert.ok(s.pg.calls[0].endsWith('READ ONLY')); assert.equal(s.pg.calls.filter(c => c.includes('b48:companies')).length, 2)
})

test('apply 48/239/451/48 new IDs, native pending shape, repeat no business writes, down exact baseline, double down no effect', async () => {
  const s = setup(), initial = structuredClone(s.pg.state), simulated = await s.core.executeBloque48(s.pg, s.dataset, simReq()), execution = randomUUID()
  const req = writeReq(s.core, 'apply', execution, simulated.planHash), applied = await s.core.executeBloque48(s.pg, s.dataset, req)
  assert.equal(applied.created, 786); assert.deepEqual(TABLES.map(t => s.pg.state.tables[t].length), [48, 239, 451, 48])
  const clients = s.pg.state.tables[TABLES[0]], proposals = s.pg.state.tables[TABLES[3]], contracts = s.pg.state.tables[TABLES[1]]
  assert.ok(clients.every((c: Row) => c.crm_empresa_id === null && c.crm_contacto_id === null && !c.id.startsWith('stage-')))
  assert.equal(clients.filter((c: Row) => c.cliente_web_id !== null).length, 46); assert.ok(clients.filter((c: Row) => c.cliente_web_id !== null).every((c: Row) => c.cliente_web_id >= 10001))
  assert.ok(contracts.every((c: Row) => c.contrato_servicio_id === null && clients.some((p: Row) => p.id === c.isp_cliente_row_id)))
  assert.ok(proposals.every((p: Row) => p.estado === 'PENDIENTE' && p.tipo === 'CRM_EMPRESA' && p.motivo === 'NIF' && p.confianza === 'ALTA' && p.destino_id.startsWith('production-')))
  assert.deepEqual(s.pg.state.links, []); assert.deepEqual(s.pg.state.companies, initial.companies); assert.deepEqual(s.pg.state.webs, initial.webs)
  const receipt = s.pg.state.receipts[0].despues; assert.equal(receipt.created.length, 786); assert.equal(receipt.createdCount, 786)
  const serialized = JSON.stringify(receipt); assert.ok(!serialized.includes('SYNTHETIC COMPANY') && !serialized.includes('stage-only') && !serialized.includes(cif(100)) && !serialized.includes('importe'))
  const beforeRepeat = structuredClone(s.pg.state.tables), mutations = s.pg.mutationCount
  const repeated = await s.core.executeBloque48(s.pg, s.dataset, req); assert.equal(repeated.created, 0); assert.equal(s.pg.mutationCount, mutations + 1); assert.deepEqual(s.pg.state.tables, beforeRepeat)
  assert.equal(s.pg.state.receipts[1].despues.action, 'NOOP_APPLY')
  const down = await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'down', execution)); assert.equal(down.deleted, 786); assert.deepEqual(s.pg.state.tables, initial.tables)
  assert.deepEqual({ ...s.pg.state, receipts: [] }, { ...initial, receipts: [] })
  const second = await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'down', execution)); assert.equal(second.deleted, 0); assert.equal(s.pg.state.receipts.at(-1).despues.action, 'NOOP_DOWN')
  assert.deepEqual(s.pg.state.tables, initial.tables)
})

test('actual native selector accepts exactly 48 pending candidates, 46 webs and 239 contracts', async () => {
  const s = setup(), simulated = await s.core.executeBloque48(s.pg, s.dataset, simReq())
  await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', randomUUID(), simulated.planHash))
  const nativeSource = readFileSync(resolve(repo, 'lib/area1-isp-bloque.ts'), 'utf8')
  const sandbox: any = { exports: {}, require: (id: string) => {
    if (id === 'node:crypto') return { createHash }
    if (id === '@/lib/crm-isp-import') return { ErrorVinculo: class extends Error {}, resolverVinculoEnTx: () => { throw new Error('NO_CONFIRMATION_AUTHORIZED') } }
    if (id === '@/lib/isp-origen-server') return { acquireIspOrigenFenceTx: () => { throw new Error('NO_CONFIRMATION_AUTHORIZED') } }
    if (id === '@/lib/area1-import-recibo') return {}
    throw new Error('NO_IO_MODULE_ALLOWED')
  } }
  vm.runInNewContext(ts.transpileModule(nativeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox)
  const candidates = s.pg.state.tables[TABLES[3]].map((v: Row) => {
    const c = s.pg.state.tables[TABLES[0]].find((c: Row) => c.id === v.isp_cliente_row_id), e = s.pg.state.companies.find((e: Row) => e.id === v.destino_id)
    return { id: v.id, ispClienteRowId: c.id, destinoId: e.id, codigoIsp: c.codigo, doc: c.doc_normalizado, nombreIsp: c.nombre, nombreEmpresa: e.nombre, empresaActiva: e.activo, clienteYaConEmpresa: Boolean(c.crm_empresa_id), clienteWebId: c.cliente_web_id, contratos: s.pg.state.tables[TABLES[1]].filter((k: Row) => k.isp_cliente_row_id === c.id).length }
  })
  const counts = new Map(candidates.map((c: Row) => [c.destinoId, 1])), selected = sandbox.exports.seleccionarBloque(candidates, counts)
  assert.equal(selected.incluidos.length, 48); assert.equal(selected.excluidos.length, 0)
  assert.equal(selected.incluidos.filter((c: Row) => c.clienteWebId !== null).length, 46)
  assert.equal(selected.incluidos.reduce((n: number, c: Row) => n + c.contratos, 0), 239)
  counts.set(candidates[0].destinoId, 2)
  assert.equal(sandbox.exports.seleccionarBloque(candidates, counts).incluidos.length, 47)
})

test('new execution after down allowed; old double down cannot remove the new execution', async () => {
  const s = setup(), id = randomUUID(), sim = await s.core.executeBloque48(s.pg, s.dataset, simReq())
  await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', id, sim.planHash))
  await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'down', id))
  const resim = await s.core.executeBloque48(s.pg, s.dataset, simReq())
  await rejected(() => s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', id, resim.planHash)), 'EXECUTION_ALREADY_DOWN')
  const newId = randomUUID(); await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', newId, resim.planHash))
  const before = structuredClone(s.pg.state.tables), result = await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'down', id))
  assert.equal(result.deleted, 0); assert.deepEqual(s.pg.state.tables, before)
  await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'down', newId)); assert.deepEqual(s.pg.state.tables, s.pg.initial.tables)
})

test('CLI default simulation actually runs READ ONLY on memory driver with no secret/PII output', async () => {
  const s = setup(), cli = memoryCli(s); await cli.run(cli.base, cli.environment)
  assert.equal(cli.counters().connects, 1); assert.equal(s.pg.mutationCount, 0); assert.ok(s.pg.calls[0].endsWith('READ ONLY'))
  const result = JSON.parse(cli.output[0]); assert.equal(result.status, 'SIMULATED_READ_ONLY')
  assert.ok(!cli.output[0].includes('synthetic-not-a-real-password') && !cli.output[0].includes('SYNTHETIC COMPANY') && !cli.output[0].includes(cif(100)))
})

test('CLI no options/help and malformed options never load the PG driver', async () => {
  const s = setup(), cli = memoryCli(s)
  await cli.run(['--help'], cli.environment); assert.ok(cli.output[0].includes('Candidata futura'))
  await rejected(() => cli.run([], cli.environment), 'PRIVATE_ABSOLUTE_FILE_REQUIRED')
  await rejected(() => cli.run(['--unknown', 'x'], cli.environment), 'CLI_ARGUMENTS_INVALID')
  await rejected(() => cli.run([...cli.base, '--mode', 'apply'], cli.environment), 'EXPLICIT_WRITE_RESTORATION_APPROVAL_REQUIRED')
  await rejected(() => cli.run([...cli.base, '--execute', 'SI'], cli.environment), 'SIMULATION_WRITE_OPTIONS_FORBIDDEN')
  assert.equal(cli.counters().driverImports, 0); assert.equal(cli.counters().connects, 0)
})

test('CLI private mode and backup hash reject locally before PG import', async () => {
  const s = setup(), cli = memoryCli(s)
  cli.files[cli.input].mode = 0o100644
  await rejected(() => cli.run(cli.base, cli.environment), 'PRIVATE_FILE_OUTSIDE_REPO_MODE600_REQUIRED')
  cli.files[cli.input].mode = 0o100600
  const write = [...cli.base, '--mode', 'apply', '--execute', 'SI', '--approval', s.core.BLOQUE48_APPROVAL.apply, '--execution-id', randomUUID(), '--backup-file', cli.backup, '--expected-backup-sha256', '0'.repeat(64), '--backup-restored', 'COPIA VERIFICADA POR RESTAURACION', '--expected-plan-sha256', 'd'.repeat(64)]
  await rejected(() => cli.run(write, cli.environment), 'BACKUP_ARTIFACT_HASH_CHANGED'); assert.equal(cli.counters().driverImports, 0)
})

test('CLI fully approved synthetic apply/down flow uses backup artifact and literal approval', async () => {
  const s = setup(), cli = memoryCli(s); await cli.run(cli.base, cli.environment)
  const plan = JSON.parse(cli.output[0]).planHash, id = randomUUID()
  const common = ['--execute', 'SI', '--execution-id', id, '--backup-file', cli.backup, '--expected-backup-sha256', cli.backupHash, '--backup-restored', 'COPIA VERIFICADA POR RESTAURACION']
  await cli.run([...cli.base, '--mode', 'apply', ...common, '--approval', s.core.BLOQUE48_APPROVAL.apply, '--expected-plan-sha256', plan], cli.environment)
  assert.equal(JSON.parse(cli.output[1]).created, 786); assert.equal(s.pg.state.receipts[0].despues.backupHash, cli.backupHash)
  await cli.run([...cli.base, '--mode', 'down', ...common, '--approval', s.core.BLOQUE48_APPROVAL.down], cli.environment)
  assert.equal(JSON.parse(cli.output[2]).deleted, 786); assert.deepEqual(s.pg.state.tables, s.pg.initial.tables)
})

test('empty accounts are preserved without inventing contracts or billing', async () => {
  const d = fixture(); for (const k of d.contratos) if (k.isp_cliente_row_id === d.clientes[47].id) { k.isp_cliente_row_id = d.clientes[0].id; k.doc_normalizado = d.clientes[0].doc_normalizado; k.cliente_nombre_fichero = d.clientes[0].nombre }
  for (let i = 0; i < d.mensual.length; i++) if (d.mensual[i].codigo_cliente === d.clientes[47].codigo) { d.mensual[i].codigo_cliente = d.clientes[0].codigo; d.mensual[i].anio = 2027 }
  const m = moduleFor(d), dataset = m.core.parseBloque48Dataset(m.bytes), pg = new MemoryPg(d), simulation = await m.core.executeBloque48(pg, dataset, simReq())
  const result = await m.core.executeBloque48(pg, dataset, writeReq(m.core, 'apply', randomUUID(), simulation.planHash)); assert.equal(result.created, 786)
  assert.ok(pg.state.tables[TABLES[0]].some((c: Row) => c.isp_cliente_id === d.clientes[47].isp_cliente_id))
})

for (const [label, mutate, code] of [
  ['duplicate document different ID/name', (s: any) => s.pg.state.companies.push({ ...s.pg.state.companies[0], id: 'ambiguous', nombre: 'OTHER SYNTHETIC' }), 'COMPANY_IDENTITY_AMBIGUOUS_OR_MISSING'],
  ['inactive company', (s: any) => s.pg.state.companies[0].activo = false, 'COMPANY_IDENTITY_CHANGED'],
  ['strict name changed', (s: any) => s.pg.state.companies[0].nombre += ' DIFFERENT', 'COMPANY_IDENTITY_CHANGED'],
  ['duplicate web code', (s: any) => s.pg.state.webs.push({ ...s.pg.state.webs[0], id: 90000 }), 'WEB_CODE_AMBIGUOUS_OR_CHANGED'],
  ['web missing', (s: any) => s.pg.state.webs.shift(), 'WEB_CODE_AMBIGUOUS_OR_CHANGED'],
  ['preexisting company-web relation', (s: any) => s.pg.state.links.push({ empresa_id: 'OTHER', cliente_id: s.pg.state.webs[0].id, origen: 'MANUAL' }), 'PREEXISTING_COMPANY_WEB_LINK'],
  ['preexisting client', (s: any) => s.pg.state.tables[TABLES[0]].push({ id: 'preexisting' }), 'PREEXISTING_BUSINESS_DATA'],
  ['shared company pending from outside block', (s: any) => s.pg.state.tables[TABLES[3]].push({ id: 'outside', estado: 'PENDIENTE', tipo: 'CRM_EMPRESA', destino_id: s.pg.state.companies[0].id }), 'PREEXISTING_BUSINESS_DATA'],
  ['unexpected external FK', (s: any) => s.pg.state.refs.push({ source_table: 'unexpected' }), 'REFERENCE_SCHEMA_CHANGED'],
  ['owner inactive', (s: any) => s.pg.state.owner.activo = false, 'LIVE_OWNER_REQUIRED'],
  ['owner principal role demoted', (s: any) => s.pg.state.owner.rol = 'VISOR', 'LIVE_OWNER_REQUIRED'],
] as const) test(`fail closed: ${label}`, async () => {
  const s = setup(); mutate(s); const before = structuredClone(s.pg.state)
  await rejected(() => s.core.executeBloque48(s.pg, s.dataset, simReq()), code); assert.deepEqual(s.pg.state, before); assert.equal(s.pg.mutationCount, 0)
})

test('changed scope after simulation rejects apply before inserts', async () => {
  const s = setup(), simulated = await s.core.executeBloque48(s.pg, s.dataset, simReq())
  s.pg.state.companies.push({ id: 'NEW-SYNTHETIC', nombre: 'UNRELATED', nif_normalizado: null, activo: true })
  await rejected(() => s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', randomUUID(), simulated.planHash)), 'PLAN_CHANGED_RESIMULATE'); assert.equal(s.pg.mutationCount, 0)
})

for (const [flag, code] of [['failAudit', 'TRANSACTION_FAILED_PRIVATE_DETAILS_SUPPRESSED'], ['failAuditRead', 'RECEIPT_NOT_DURABLE_IN_TX'], ['failInsert', 'TRANSACTION_FAILED_PRIVATE_DETAILS_SUPPRESSED'], ['corruptInsert', 'INSERTED_VALUES_MISMATCH']] as const) test(`whole tx rollback: ${flag}`, async () => {
  const s = setup(), before = structuredClone(s.pg.state), simulated = await s.core.executeBloque48(s.pg, s.dataset, simReq()); s.pg[flag] = true
  await rejected(() => s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', randomUUID(), simulated.planHash)), code)
  assert.deepEqual(s.pg.state, before); assert.ok(s.pg.calls.at(-1)!.includes('rollback'))
})

for (const [label, mutate, code] of [
  ['confirmed proposal', (s: any) => s.pg.state.tables[TABLES[3]][0].estado = 'CONFIRMADO', 'CREATED_ROW_MODIFIED_OR_CONFIRMED'],
  ['native direct CRM link', (s: any) => s.pg.state.tables[TABLES[0]][0].crm_empresa_id = 'production-company-0', 'CREATED_ROW_MODIFIED_OR_CONFIRMED'],
  ['contract edited', (s: any) => s.pg.state.tables[TABLES[1]][0].importe_sin_iva = '99.0000', 'CREATED_ROW_MODIFIED_OR_CONFIRMED'],
  ['additional contract reference', (s: any) => s.pg.state.tables[TABLES[1]].push({ id: 'extra-reference', isp_cliente_row_id: s.pg.state.tables[TABLES[0]][0].id }), 'DOWN_EXTRA_OR_MISSING_ROWS'],
  ['receipt modified', (s: any) => s.pg.state.receipts[0].despues.created[0].hash = '0'.repeat(64), 'RECEIPT_CORRUPT'],
  ['unknown inbound reference', (s: any) => s.pg.state.refs.push({ source_table: 'extra' }), 'REFERENCE_SCHEMA_CHANGED'],
  ['native web relation created', (s: any) => s.pg.state.links.push({ empresa_id: 'production-company-0', cliente_id: 10001, origen: 'ISP_CONFIRMADO' }), 'PREEXISTING_COMPANY_WEB_LINK'],
] as const) test(`down refuses ${label}`, async () => {
  const s = setup(), sim = await s.core.executeBloque48(s.pg, s.dataset, simReq()), id = randomUUID()
  await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', id, sim.planHash)); mutate(s)
  const before = structuredClone(s.pg.state), count = s.pg.mutationCount
  await rejected(() => s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'down', id)), code); assert.deepEqual(s.pg.state, before); assert.equal(s.pg.mutationCount, count)
})

test('down receipt failure and wrong delete count roll back all deletions', async () => {
  for (const flag of ['failAudit', 'badDeleteCount'] as const) {
    const s = setup(), sim = await s.core.executeBloque48(s.pg, s.dataset, simReq()), id = randomUUID()
    await s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'apply', id, sim.planHash)); const before = structuredClone(s.pg.state); s.pg[flag] = true
    await rejected(() => s.core.executeBloque48(s.pg, s.dataset, writeReq(s.core, 'down', id)), flag === 'failAudit' ? 'TRANSACTION_FAILED_PRIVATE_DETAILS_SUPPRESSED' : 'DOWN_DELETE_COUNT_MISMATCH')
    assert.deepEqual(s.pg.state, before)
  }
})

for (const [label, mutate, code] of [
  ['wrong canonical DSN', (r: any) => r.env.DATABASE_URL = 'postgresql://synthetic@example.invalid/not-production', 'CANONICAL_PRODUCTION_REQUIRED'],
  ['DSN options', (r: any) => r.env.DATABASE_URL += '?options=-csearch_path%3Devil', 'DSN_OPTIONS_FORBIDDEN'],
  ['readonly finance', (r: any) => r.env.FINANCE_DEPLOYMENT_READ_ONLY = '1', 'READ_ONLY_BLOCK'],
  ['readonly IO', (r: any) => r.env.IO_PRODUCTION_READ_ONLY = '1', 'READ_ONLY_BLOCK'],
  ['unset readonly', (r: any) => delete r.env.IO_PRODUCTION_READ_ONLY, 'READ_ONLY_BLOCK'],
  ['acting', (r: any) => r.authority.acting = true, 'OWNER_PRINCIPAL_REQUIRED'],
  ['wrong owner env', (r: any) => r.env.AREA4_OWNER_USER_ID = '4', 'OWNER_PRINCIPAL_REQUIRED'],
  ['secondary SA only', (r: any) => r.authority.principalRole = 'VISOR', 'OWNER_PRINCIPAL_REQUIRED'],
  ['literal approval missing', (r: any) => delete r.approval, 'OPERATOR_BACKUP_APPROVAL_REQUIRED'],
  ['backup missing', (r: any) => r.backupVerified = false, 'OPERATOR_BACKUP_APPROVAL_REQUIRED'],
  ['expected simulation missing', (r: any) => delete r.expectedPlanHash, 'SIMULATION_HASH_REQUIRED'],
] as const) test(`no SQL on guard reject: ${label}`, async () => {
  const s = setup(), req = writeReq(s.core, 'apply', randomUUID(), 'd'.repeat(64)); mutate(req)
  await rejected(() => s.core.executeBloque48(s.pg, s.dataset, req), code); assert.equal(s.pg.calls.length, 0)
})

for (const [label, mutate, code] of [
  ['counts', (d: any) => d.contratos.pop(), 'DATASET_COUNTS'],
  ['duplicate master', (d: any) => d.clientes[1].isp_cliente_id = d.clientes[0].isp_cliente_id, 'DATASET_DUPLICATE'],
  ['invalid checksum', (d: any) => { d.clientes[0].doc_normalizado = 'B00000001'; d.clientes[0].nif_normalizado = 'B00000001' }, 'IDENTITY_INVALID'],
  ['shared document', (d: any) => { d.clientes[1].doc_normalizado = d.clientes[0].doc_normalizado; d.clientes[1].nif_normalizado = d.clientes[0].nif_normalizado }, 'DATASET_DUPLICATE'],
  ['out of scope contract', (d: any) => d.contratos[0].isp_cliente_row_id = 'MISSING', 'CONTRACT_SCOPE'],
  ['out of scope month', (d: any) => d.mensual[0].codigo_cliente = 'MISSING', 'MONTHLY_SCOPE'],
  ['duplicate monthly', (d: any) => d.mensual[1] = { ...d.mensual[0] }, 'DATASET_DUPLICATE'],
  ['non-strict name', (d: any) => d.clientes[0].empresa_nombre = 'OTHER', 'STRICT_NAME_CHANGED'],
] as const) test(`manifest validation: ${label}`, async () => {
  const d = fixture(); mutate(d); const m = moduleFor(d); await rejected(() => m.core.parseBloque48Dataset(m.bytes), code)
})

test('CLI source guards: no dotenv/prisma/provider, default simulate, PG dynamic after validation', () => {
  assert.ok(cliSource.includes("a.mode ?? 'simulate'")); assert.ok(cliSource.indexOf('guardBloque48(request)') < cliSource.indexOf("await import('pg')"))
  assert.ok(!/from ['"].*(dotenv|lib\/prisma|ispgestion|hubspot)/i.test(cliSource))
  assert.ok(cliSource.includes('PRIVATE_FILE_OUTSIDE_REPO_MODE600_REQUIRED') && cliSource.includes('BACKUP_ARTIFACT_HASH_CHANGED'))
  assert.ok(!coreSource.includes('crmEmpresaCliente.create') && !coreSource.includes('ON CONFLICT') && !/UPDATE public\./.test(coreSource))
})
