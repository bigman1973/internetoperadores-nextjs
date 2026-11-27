import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { AsyncLocalStorage } from 'node:async_hooks'
import ts from 'typescript'
import { Prisma } from '@prisma/client'

/** Runs the real lib/prisma.ts $use hook, not a reimplementation. No .env, network or SQL. */
let checks = 0
let ctx: any = { status: 'absent' }
const nativeRequire = createRequire(import.meta.url)
const virtualEnv: Record<string, string> = {}
const cache = new Map<string, any>()
const initial: Record<string, any[]> = {
  CrmEmpresa: [{ id: 'linked', nombre: 'Local', nif: 'B1', nifNormalizado: 'B1', sector: 'original' }, { id: 'prospect', nombre: 'Prospect' }],
  ClienteWeb: [{ id: 1, ispGestionId: '321', clienteIdIsp: 'native', nombre: 'ISP' }, { id: 2, ispGestionId: 'manual-5f61da65-bc6c-451b-9044-54ac4b72e0b2', clienteIdIsp: null, nombre: 'Manual' }, { id: 3, ispGestionId: 'synthetic-uncertain', nombre: 'Uncertain' }],
  IspClienteArea1: [{ id: 'a1', ispClienteId: '321', codigo: '001', nombre: 'ISP', cif: 'B1', crmEmpresaId: 'linked', clienteWebId: 1, crmContactoId: 'contact-linked' }],
  CrmEmpresaCliente: [{ empresaId: 'linked', clienteId: 1 }], IspVinculoArea1: [],
  FacturaEmitida: [{ id: 'fi', origenSistema: 'ISPGestion', idExterno: '11', facturaISPId: 11, estado: 'EMITIDA', importeCobrado: 0, imputacion: null }, { id: 'fi-manual', origenSistema: 'Manual' }],
  Factura: [{ id: 11, ispGestionId: 11, remesaId: null }], IspContratoArea1: [], IspFacturacionMensualArea1: [], ContratoServicio: [], Remesa: [],
  CrmRegistroHubspot: [{ id: 'contact-linked' }, { id: 'contact-local' }], CrmActividad: [], Area1CrmNegocio: [], CrmTarea: [],
}
const clone = (value: any) => structuredClone(value)
function matches(row: any, where: any): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((w: any) => matches(row, w))
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((w: any) => matches(row, w))
    if (key === 'NOT') return !matches(row, value)
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key])
      if ('equals' in value) return row[key] === value.equals
      if ('not' in value) return row[key] !== value.not
      return matches(row, value)
    }
    return row[key] === value
  })
}
let failingReads = false
let fenceTail = Promise.resolve()
let fenceAcquisitions = 0
class SyntheticPrisma {
  middleware: any[] = []; rows = clone(initial); rawCalls: any[] = []; ownershipReads: string[] = []
  constructor() { Object.assign(this, this.makeDelegates(false)) }
  $use(fn: any) { this.middleware.push(fn) }
  async $disconnect() {}
  makeDelegates(tx: boolean) {
    const delegates: any = {}
    for (const model of Prisma.dmmf.datamodel.models.map(m => m.name)) {
      const name = model[0].toLowerCase() + model.slice(1)
      delegates[name] = new Proxy({}, { get: (_, action: string) => (args: any) => this.call({ model, action, args, runInTransaction: tx }) })
    }
    return delegates
  }
  async call(params: any): Promise<any> {
    let i = 0
    const next = async (p: any): Promise<any> => i < this.middleware.length ? this.middleware[i++](p, next) : this.finish(p)
    return next(params)
  }
  finish(p: any): any {
    if (!p.model) {
      this.rawCalls.push(p)
      const template = Array.isArray(p.args?.[0]) ? p.args[0].join('?') : p.args?.[0]
      if (template === 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))::text AS locked') {
        assert.deepEqual(p.args.slice(1), ['isp-origen:ownership:v1'])
        assert(p.ownershipTx)
        const preceding = fenceTail
        fenceTail = new Promise(resolve => { p.ownershipTx.releaseFence = resolve })
        fenceAcquisitions++
        return preceding.then(() => [{ locked: '' }])
      }
      if (typeof template === 'string' && template.includes('FROM area1_isp_clientes') && template.includes('ORDER BY isp_cliente_id ASC LIMIT 501')) {
        const values = p.args.slice(1)
        assert(values.length === 3 && values.every((v: any) => v === values[0]))
        const algorithm = load('lib/crm-isp-import-core.ts')
        return clone(this.rows.IspClienteArea1.filter((row: any) => [row.docNormalizado, algorithm.normalizarDocumento(row.cif), algorithm.normalizarDocumento(row.nif)].includes(values[0]))
          .sort((a: any, b: any) => a.ispClienteId.localeCompare(b.ispClienteId)).slice(0, 501))
      }
      return []
    }
    const rows = this.rows[p.model] ?? (this.rows[p.model] = [])
    const hits = rows.filter((row: any) => matches(row, p.args?.where))
    if (p.action.startsWith('find')) {
      this.ownershipReads.push(p.model)
      if (failingReads) throw Error('PII_MUST_NOT_ESCAPE')
      let output = hits.slice(0, p.args?.take ?? rows.length).map((row: any) => p.args?.select ? Object.fromEntries(Object.keys(p.args.select).map(key => [key, row[key]])) : clone(row))
      return p.action === 'findMany' ? output : output[0] ?? null
    }
    if (p.action.startsWith('create')) { const data = p.args.data; const created = (Array.isArray(data) ? data : [data]).map((row: any) => ({ id: row.id ?? rows.length + 100, ...clone(row) })); rows.push(...created); return p.action === 'create' ? created[0] : { count: created.length } }
    if (p.action.startsWith('update')) { hits.forEach((row: any) => Object.assign(row, clone(p.args.data))); return p.action === 'update' ? hits[0] : { count: hits.length } }
    if (p.action.startsWith('delete')) { this.rows[p.model] = rows.filter((row: any) => !hits.includes(row)); return { count: hits.length } }
    if (p.action === 'upsert') { if (hits.length) Object.assign(hits[0], clone(p.args.update)); else rows.push(clone(p.args.create)); return hits[0] ?? p.args.create }
    return []
  }
  async $transaction(input: any): Promise<any> {
    if (typeof input !== 'function') return Promise.all(input)
    const before = clone(this.rows)
    const tx: any = { ...this.makeDelegates(true), $queryRaw: (sql: TemplateStringsArray, ...values: any[]) => this.call({ action: 'queryRaw', args: [sql, ...values], runInTransaction: true, ownershipTx: tx }), $queryRawUnsafe: (sql: string, ...values: any[]) => this.call({ action: 'queryRaw', args: [sql, ...values], runInTransaction: true }), $executeRawUnsafe: (sql: string, ...values: any[]) => this.call({ action: 'executeRaw', args: [sql, ...values], runInTransaction: true }) }
    try { return await input(tx) } catch (error) { this.rows = before; throw error } finally { tx.releaseFence?.() }
  }
}
function load(path: string): any {
  const file = resolve(path)
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} as any }; cache.set(file, module.exports)
  const mocks: any = {
    'node:async_hooks': { AsyncLocalStorage }, '@prisma/client': { Prisma, PrismaClient: SyntheticPrisma },
    '@/lib/impersonation-context': { trustedImpersonationContextResolutionFromRequest: async () => ctx },
    '@/lib/impersonation-policy': { impersonationEnabled: () => false, impersonationActorListed: () => false, impersonationRequestAllowed: () => false },
    '@/lib/finanzas/conciliar-runtime': { conciliarRuntimeConfigured: () => null },
    '@/lib/finanzas/conciliar-recovery-lock-sql': { REVIEWED_CONCILIAR_RECOVERY_LOCK_SQL: new Set() },
  }
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, Date, URL, URLSearchParams, console, process: { env: virtualEnv }, globalThis: {}, require: (name: string) => {
      if (name in mocks) return mocks[name]
      if (name === 'xlsx' || name.startsWith('node:')) return nativeRequire(name)
      if (name.startsWith('.')) return load(resolve(file, '..', name + '.ts'))
      throw Error(`UNEXPECTED_IMPORT:${name}`)
    } }, { filename: file })
  cache.set(file, module.exports); return module.exports
}
const core = load('lib/prisma.ts')
const server = load('lib/isp-origen-server.ts')
const db: any = core.prisma
async function blocked(model: string, action: string, args: any) {
  const before = JSON.stringify(db.rows)
  await assert.rejects(() => db.call({ model, action, args, runInTransaction: false }), (error: any) => error.code === 'ISP_ORIGEN_NO_EDITABLE' && error.status === 409 && error.message === error.code)
  assert.equal(JSON.stringify(db.rows), before); checks += 2
}
async function allowed(model: string, action: string, args: any) { await db.call({ model, action, args, runInTransaction: false }); checks++ }
async function allowedTx(model: string, action: string, args: any) { await db.$transaction(async (tx: any) => tx[model[0].toLowerCase() + model.slice(1)][action](args)); checks++ }
async function main() {
  for (const [model, field] of [['IspClienteArea1', 'nombre'], ['IspContratoArea1', 'activo'], ['IspFacturacionMensualArea1', 'importeBase'], ['ContratoServicio', 'precio'], ['Remesa', 'nombre'], ['Factura', 'total']]) {
    await blocked(model, 'updateMany', { where: {}, data: { [field]: 'altered' } })
    await blocked(model, 'deleteMany', { where: {} })
    await blocked(model, 'createMany', { data: [{ [field]: 'spoof' }] })
  }
  await blocked('ClienteWeb', 'update', { where: { id: 1 }, data: { nombre: 'altered', newsletterSuscrito: true } })
  await blocked('ClienteWeb', 'updateMany', { where: { id: { in: [1, 2] } }, data: { nombre: 'mixed' } })
  await blocked('ClienteWeb', 'delete', { where: { id: 1 } })
  await blocked('ClienteWeb', 'update', { where: { id: 3 }, data: { nombre: 'unknown' } })
  await blocked('ClienteWeb', 'create', { data: { ispGestionId: '123', nombre: 'fake' } })
  await blocked('ClienteWeb', 'update', { where: { id: 2 }, data: { ispGestionId: '123' } })
  await blocked('CrmEmpresa', 'update', { where: { id: 'linked' }, data: { nombre: 'fake', sector: 'mixed' } })
  await blocked('CrmEmpresa', 'updateMany', { where: {}, data: { nifNormalizado: 'changed' } })
  await blocked('CrmEmpresa', 'upsert', { where: { id: 'linked' }, create: { nombre: 'new' }, update: { nif: 'spoof' } })
  await blocked('CrmEmpresa', 'deleteMany', { where: { id: 'linked' } })
  await blocked('CrmEmpresa', 'create', { data: { nombre: 'spoof', clientes: { create: { clienteId: 1 } } } })
  await blocked('CrmActividad', 'create', { data: { titulo: 'note', empresa: { update: { nif: 'nested' } } } })
  await blocked('CrmRegistroHubspot', 'delete', { where: { id: 'contact-linked' } })
  await blocked('CrmEmpresaCliente', 'delete', { where: { empresaId_clienteId: { empresaId: 'linked', clienteId: 1 } } })
  await blocked('IspClienteArea1', 'update', { where: { id: 'a1' }, data: { crmEmpresaId: null } })
  await blocked('FacturaEmitida', 'updateMany', { where: { id: 'fi' }, data: { cliente: 'fake', estado: 'COBRADA' } })
  await blocked('FacturaEmitida', 'delete', { where: { id: 'fi' } })
  await blocked('FacturaEmitida', 'create', { data: { origenSistema: 'ISPGestion', idExterno: 'fake' } })
  await blocked('CrmEmpresaCliente', 'update', { where: { clienteId: 1 }, data: { empresaId: 'prospect' } })
  await blocked('CrmRegistroHubspot', 'update', { where: { id: 'contact-linked' }, data: { id: 'bypass' } })
  db.rows.IspVinculoArea1.push({ id: 'confirmed', estado: 'CONFIRMADO', tipo: 'CREAR_EMPRESA', destinoId: 'linked', ispClienteRowId: 'a1' })
  await blocked('IspVinculoArea1', 'update', { where: { id: 'confirmed' }, data: { estado: 'DESCARTADO' } })
  await blocked('IspVinculoArea1', 'deleteMany', { where: { id: 'confirmed' } })
  const ownership = await server.readIspEmpresaOwnership(db, 'linked')
  assert.equal(ownership.linked, true); checks++
  assert(ownership.evidence.includes('VINCULO_CONFIRMADO_EFECTIVO')); checks++
  for (const sql of ['UPDATE clientes_web SET nombre=$1', 'WITH w AS (DELETE FROM area1_isp_clientes RETURNING id) SELECT * FROM w', 'INSERT INTO public."facturas"(isp_gestion_id) VALUES($1)', 'UPDATE crm_empresas SET nif=$1', 'UPDATE facturas_emitidas SET cliente=$1,estado=$2', 'UPDATE "area1_isp_clientes" SET nombre=$1', 'UPDATE /* ambiguous */ clientes_web SET nombre=$1', 'DELETE FROM crm_empresa_clientes']) {
    await assert.rejects(() => db.call({ action: 'queryRaw', args: [sql, 'PII parameter'] }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  }
  for (const sql of ['SELECT * FROM clientes_web', 'SELECT arbitrary_legacy_reader($1)', 'SELECT nombre FROM crm_empresas FOR UPDATE', 'INSERT INTO unrelated_panel(id) VALUES($1)', 'WITH w AS (UPDATE unrelated_panel SET id=$1 RETURNING id) SELECT * FROM w', 'UPDATE facturas SET remesa_id=$1 WHERE id=$2', 'UPDATE facturas_emitidas SET estado=$1,importe_cobrado=$2,fecha_cobro=$3,imputacion=$4 WHERE id=$5']) {
    await db.call({ action: 'executeRaw', args: [sql, 'bound'] }); checks++
  }
  await allowed('CrmEmpresa', 'update', { where: { id: 'linked' }, data: { sector: 'local', nombreComercial: 'Commercial' } })
  await allowedTx('CrmEmpresa', 'update', { where: { id: 'prospect' }, data: { nombre: 'Prospect editable', nif: 'local' } })
  await allowed('ClienteWeb', 'update', { where: { id: 1 }, data: { passwordHash: 'hash', newsletterSuscrito: true, ultimoAcceso: 'now' } })
  await allowedTx('ClienteWeb', 'update', { where: { id: 2 }, data: { nombre: 'Manual editable', email: 'synthetic@example.invalid' } })
  await allowed('CrmActividad', 'create', { data: { titulo: 'local note', contactos: { create: { contactoId: 'contact-local' } }, tarea: { create: { titulo: 'local task' } } } })
  await allowed('CrmRegistroHubspot', 'update', { where: { id: 'contact-local' }, data: { nombre: 'Contact local' } })
  await allowed('Area1CrmNegocio', 'create', { data: { nombre: 'Local deal', propietarioId: 1 } })
  await allowed('FacturaEmitida', 'update', { where: { id: 'fi' }, data: { estado: 'COBRADA', importeCobrado: 40, fechaCobro: 'now', imputacion: 'Bank class', facturaISPId: 11 } })
  await allowed('Factura', 'update', { where: { id: 11 }, data: { remesaId: 17 } })
  const unchangedPayload = { nombre: 'Local', nif: 'B1', nifNormalizado: 'B1', sector: 'equal raw allowed' }
  await allowedTx('CrmEmpresa', 'update', { where: { id: 'linked' }, data: unchangedPayload })
  assert.deepEqual(unchangedPayload, { sector: 'equal raw allowed' }); checks++
  await allowed('ClienteWeb', 'create', { data: { ispGestionId: 'manual-88da7c75-44f1-4dfe-b5d8-03a5d211b5fd', nombre: 'Manual new', passwordHash: 'local credential' } })
  failingReads = true
  await blocked('CrmEmpresa', 'update', { where: { id: 'prospect' }, data: { nombre: 'read failure' } })
  failingReads = false
  let escaped: any
  const panelBefore = JSON.stringify({ CrmEmpresa: db.rows.CrmEmpresa, CrmActividad: db.rows.CrmActividad, FacturaEmitida: db.rows.FacturaEmitida })
  await db.$transaction(async (tx: any) => {
    assert.equal(core.currentImpersonationTransactionClient(), tx); checks++
    await server.runWithIspSourceWriteTx('isp-clients', tx, async (writerTx: any) => {
      escaped = writerTx
      await Promise.resolve()
      await writerTx.clienteWeb.update({ where: { id: 1 }, data: { nombre: 'source refresh' } }); checks++
      await assert.rejects(() => writerTx.clienteWeb.update({ where: { id: 1 }, data: { newsletterSuscrito: false } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => tx.clienteWeb.update({ where: { id: 1 }, data: { nombre: 'original tx cannot spend capability' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => db.call({ model: 'ClienteWeb', action: 'update', args: { where: { id: 1 }, data: { nombre: 'singleton outside tx' } }, runInTransaction: false }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => tx.crmEmpresa.update({ where: { id: 'linked' }, data: { sector: 'panel prohibited' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => tx.$executeRawUnsafe('UPDATE clientes_web SET nombre=$1', 'raw'), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => server.runWithIspSourceWriteTx('isp-facturas', tx, async () => {}), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    })
    await assert.rejects(() => escaped.clienteWeb.update({ where: { id: 1 }, data: { nombre: 'escaped' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  })
  assert.equal(JSON.stringify({ CrmEmpresa: db.rows.CrmEmpresa, CrmActividad: db.rows.CrmActividad, FacturaEmitida: db.rows.FacturaEmitida }), panelBefore); checks++
  await assert.rejects(() => server.runWithIspSourceWrite('isp-clients', async () => {}), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  await db.$transaction(async (tx: any) => {
    await server.runWithIspSourceWriteTx('crm-xlsx', tx, async (w: any) => {
      await w.ispClienteArea1.createMany({ data: [{ id: 'cuid-native-1001', ispClienteId: '654', nombre: 'Native', codigo: '002', huella: 'source' }] }); checks++
      await w.ispContratoArea1.create({ data: { id: 'cuid-contract-1001', ispContratoId: 654, ispClienteRowId: null, asignacionCliente: 'HUERFANO', candidatosCliente: [], docNormalizado: null, codigoContratoIsp: 'C1', clienteNombreFichero: 'Native', estado: 'ACTIVO', activo: true, huella: 'source' } }); checks++
      await assert.rejects(() => w.ispClienteArea1.update({ where: { id: 'a1' }, data: { ispClienteId: 'new-id' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.ispContratoArea1.create({ data: { id: 'cuid-contract-1002', ispContratoId: 655, asignacionCliente: 'NIF' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.ispClienteArea1.create({ data: { id: 'cuid-client-1002', ispClienteId: '655', estadoMarketing: 'APTO' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    })
    await server.runWithIspSourceWriteTx('isp-clients', tx, async (w: any) => {
      await w.clienteWeb.create({ data: { ispGestionId: '654', nombre: 'Native', email: 'native@example.invalid', passwordHash: '$2b$10$' + 'A'.repeat(53) } }); checks++
      await assert.rejects(() => w.clienteWeb.update({ where: { id: 2 }, data: { nombre: 'loader overwrites manual' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.clienteWeb.create({ data: { ispGestionId: '655', passwordHash: '$2b$10$' + 'A'.repeat(53), comercial: 7 } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    })
    await server.runWithIspSourceWriteTx('finance-p2', tx, async (w: any) => {
      await w.factura.create({ data: { ispGestionId: 900, situacion: 'PENDIENTE', total: '12.00', totalPendiente: '12.00' } }); checks++
      await w.factura.update({ where: { id: 11 }, data: { nombreCompleto: 'header' } }); checks++
      await assert.rejects(() => w.factura.update({ where: { id: 11 }, data: { total: 9 } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.facturaEmitida.update({ where: { id: 'fi' }, data: { cliente: 'cannot refresh P2 FI' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await w.facturaEmitida.create({ data: { cliente: 'source header', origenSistema: 'ISPGestion', idExterno: '11', facturaISPId: 11, estado: 'EMITIDA', importeCobrado: 0, fechaCobro: null, tipoIrpf: 0, importeIrpf: 0 } }); checks++
      await assert.rejects(() => w.facturaEmitida.create({ data: { origenSistema: 'ISPGestion', idExterno: 'wrong', facturaISPId: 11, estado: 'EMITIDA', importeCobrado: 0, fechaCobro: null, tipoIrpf: 0, importeIrpf: 0 } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    })
    // Surviving direct evidence permits this explicit unlink, never source mutation.
    await tx.crmEmpresaCliente.delete({ where: { empresaId_clienteId: { empresaId: 'linked', clienteId: 1 } } }); checks++
    await tx.crmEmpresaCliente.create({ data: { empresaId: 'linked', clienteId: 1 } }); checks++
  })
  // Last legacy evidence remains blocked in the same callback transaction.
  db.rows.CrmEmpresa.push({ id: 'legacy-only', nombre: 'Legacy' })
  db.rows.CrmEmpresaCliente.push({ empresaId: 'legacy-only', clienteId: 101 })
  db.rows.ClienteWeb.push({ id: 101, ispGestionId: '789' })
  await db.$transaction(async (tx: any) => {
    await assert.rejects(() => tx.crmEmpresaCliente.delete({ where: { empresaId_clienteId: { empresaId: 'legacy-only', clienteId: 101 } } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  })
  // Full claimNextJob SELECT: clock_timestamp is intentionally not acting-readonly.
  const repository = readFileSync(resolve('lib/finanzas/sync-jobs/prisma-repository.ts'), 'utf8')
  const claim = repository.slice(repository.indexOf('async claimNextJob')).match(/const candidates = await tx\.\$queryRaw[^`]*`([\s\S]*?)`/)?.[1]
  assert(claim); assert.equal(core.classifyPrisma5RawSqlStatement([claim]), 'unknown'); checks += 2
  await db.call({ action: 'queryRaw', args: [claim] }); checks++
  for (const suffix of ['FOR UPDATE SKIP LOCKED', 'FOR NO KEY UPDATE OF f NOWAIT', 'FOR SHARE', 'FOR KEY SHARE OF f SKIP LOCKED']) {
    await db.call({ action: 'queryRaw', args: [`SELECT to_char(fecha,'YYYY') FROM facturas f ${suffix}`] }); checks++
    await assert.rejects(() => db.call({ action: 'queryRaw', args: [`WITH w AS (UPDATE area1_isp_clientes SET nombre=$1 RETURNING id) SELECT id FROM w ${suffix}`, 'bound'] }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  }
  await assert.rejects(() => core.guardPrismaImpersonationMutation({ action: 'queryRaw', args: [claim] }, async () => { throw Error('MUST_NOT_RUN') },
    { requestContext: { status: 'valid', context: {} }, transaction: null }), /IMPERSONATION_RAW_SQL_UNREVIEWED/); checks++
  const fiscalSource = { serieFactura: 'S', numeroDocumento: '17', documento: null, fecha: new Date('2026-11-24T00:00:00.000Z'), idCliente: 1,
    codigoCliente: '001', nombreCompleto: 'Source Fiscal', nifCif: 'B12345678', base: '100.00', totalImpuesto: '21.00', total: '121.00', situacion: 'COBRADA', totalPendiente: '0.00', ejercicio: 2026 }
  const fiscalHeader = { cliente: fiscalSource.nombreCompleto, cif: fiscalSource.nifCif, numFactura: fiscalSource.numeroDocumento, serie: fiscalSource.serieFactura,
    fecha: fiscalSource.fecha, base: 100, tipoIva: 21, importeIva: 21, total: 121, concepto: '' }
  const neutral = { origenSistema: 'ISPGestion', idExterno: '917', tipoIrpf: 0, importeIrpf: 0, estado: 'EMITIDA', importeCobrado: 0, fechaCobro: null }
  let legacyId: string, sourceId: number
  await db.$transaction(async (tx: any) => {
    const f = await server.runWithIspSourceWriteTx('isp-facturas', tx, (w: any) => w.factura.create({ data: { ispGestionId: 917, ...fiscalSource } }))
    sourceId = f.id
    const item = { facturaISPId: f.id, idExterno: '917' }
    await assert.rejects(() => server.runWithIspSourceWriteTx('isp-facturas', tx, (w: any) => w.facturaEmitida.create({ data: { ...fiscalHeader, ...neutral } })), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    await assert.rejects(() => server.runWithIspSourceWriteTx('isp-facturas', tx, (w: any) => w.facturaEmitida.create({ data: { ...fiscalHeader, ...neutral, total: 122 } }), item), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    await assert.rejects(() => server.runWithIspSourceWriteTx('isp-facturas', tx, (w: any) => w.facturaEmitida.create({ data: { ...fiscalHeader, ...neutral } }), { ...item, facturaISPId: 99999 }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    const fi = await server.runWithIspSourceWriteTx('isp-facturas', tx, (w: any) => w.facturaEmitida.create({ data: { ...fiscalHeader, ...neutral } }), item)
    fi.id = 'legacy-fiscal-917'; legacyId = fi.id; checks++
  })
  const legacy = db.rows.FacturaEmitida.find((row: any) => row.id === legacyId!)
  Object.assign(legacy, { facturaISPId: sourceId!, estado: 'COBRADA_PARCIAL', importeCobrado: 34.15, fechaCobro: new Date('2026-11-25'), imputacion: 'BANK', formaCobro: 'Confirming', remesaRef: 'REF', proyectoSingularId: 'PROY', tipoIrpf: 15, importeIrpf: 15, lineas: 'local-lines', fechaVencimiento: new Date('2026-12-25') })
  const panelKeys = ['facturaISPId', 'estado', 'importeCobrado', 'fechaCobro', 'imputacion', 'formaCobro', 'remesaRef', 'proyectoSingularId', 'tipoIrpf', 'importeIrpf', 'lineas', 'fechaVencimiento']
  const panelSnapshot = JSON.stringify(Object.fromEntries(panelKeys.map(field => [field, legacy[field]])))
  await db.$transaction(async (tx: any) => {
    const item = { facturaISPId: sourceId!, idExterno: '917' }
    const write = (data: any, where = { id: legacyId! }) => server.runWithIspSourceWriteTx('isp-facturas', tx, (w: any) => w.facturaEmitida.update({ where, data }), item)
    await write(fiscalHeader); checks++
    for (const [field, value] of [['cliente', 'arbitrary'], ['concepto', null], ['tipoIva', '21'], ['base', '100'], ['importeCobrado', 0], ['estado', 'EMITIDA'], ['imputacion', null], ['facturaISPId', sourceId!], ['tipoIrpf', 0], ['lineas', 'replace'], ['idExterno', '917']]) {
      await assert.rejects(() => write({ ...fiscalHeader, [field]: value }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    }
    await assert.rejects(() => write(fiscalHeader, { id: 'fi-manual' }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    const storedFk = legacy.facturaISPId; legacy.facturaISPId = 99999
    await assert.rejects(() => write(fiscalHeader), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    legacy.facturaISPId = storedFk
    const storedOrigin = legacy.origenSistema; legacy.origenSistema = 'Manual'
    await assert.rejects(() => write(fiscalHeader), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    legacy.origenSistema = storedOrigin
    const external = legacy.idExterno; legacy.idExterno = '918'
    await assert.rejects(() => write(fiscalHeader), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    legacy.idExterno = external
  })
  assert.equal(JSON.stringify(Object.fromEntries(panelKeys.map(field => [field, legacy[field]]))), panelSnapshot); checks++
  db.rows.IspClienteArea1.push(
    { id: 'assign-source-a', ispClienteId: '10001', codigo: 'A', nombre: 'Primero S.L.', nombreComercial: 'A Comercial', cif: 'ESB12345678', nif: null, docNormalizado: 'B12345678', crmEmpresaId: 'linked', crmContactoId: 'contact-linked', clienteWebId: 1 },
    { id: 'assign-source-b', ispClienteId: '10002', codigo: 'B', nombre: 'Segundo SL', nombreComercial: 'B Comercial', cif: null, nif: 'B12345678', docNormalizado: 'B12345678', crmEmpresaId: null, crmContactoId: null, clienteWebId: null },
    { id: 'assign-source-c', ispClienteId: '10003', codigo: 'C', nombre: 'Unico', nombreComercial: null, cif: ' B-87654321 ', nif: null, docNormalizado: 'B87654321', crmEmpresaId: null, crmContactoId: null, clienteWebId: null },
  )
  const sourceLinkBytes = JSON.stringify(db.rows.IspClienteArea1.map((row: any) => ({ id: row.id, crmEmpresaId: row.crmEmpresaId, crmContactoId: row.crmContactoId, clienteWebId: row.clienteWebId })))
  const contractBase = { ispContratoId: 1001, codigoContratoIsp: '1001', clienteNombreFichero: 'Primero SL', docNormalizado: 'B12345678', estado: 'Activo', activo: true, huella: 'source' }
  const { ispContratoId: _insertOnly, ...contractRefresh } = contractBase
  await db.$transaction(async (tx: any) => {
    await server.runWithIspSourceWriteTx('crm-xlsx', tx, async (w: any) => {
      await w.ispContratoArea1.create({ data: { id: 'assigned-contract-1001', ...contractBase, ispClienteRowId: 'assign-source-a', asignacionCliente: 'NIF_NOMBRE', candidatosCliente: [] } }); checks++
      await w.ispContratoArea1.create({ data: { id: 'assigned-contract-1002', ...contractBase, ispContratoId: 1002, clienteNombreFichero: 'Unico', docNormalizado: 'B87654321', ispClienteRowId: 'assign-source-c', asignacionCliente: 'NIF', candidatosCliente: [] } }); checks++
      await w.ispContratoArea1.create({ data: { id: 'assigned-contract-1003', ...contractBase, ispContratoId: 1003, clienteNombreFichero: 'Desconocido', ispClienteRowId: null, asignacionCliente: 'AMBIGUO', candidatosCliente: ['B', 'A'] } }); checks++
      await w.ispContratoArea1.create({ data: { id: 'assigned-contract-1004', ...contractBase, ispContratoId: 1004, docNormalizado: 'Z999', ispClienteRowId: null, asignacionCliente: 'HUERFANO', candidatosCliente: [] } }); checks++
      for (const alteration of [
        { ispClienteRowId: 'assign-source-b' }, { asignacionCliente: 'NIF' }, { candidatosCliente: ['A'] }, { contratoServicioId: 88 },
        { docNormalizado: 'B00000000' }, { clienteNombreFichero: 'Desconocido' },
      ]) {
        await assert.rejects(() => w.ispContratoArea1.create({ data: { id: 'rejected-contract-1001', ...contractBase, ispClienteRowId: 'assign-source-a', asignacionCliente: 'NIF_NOMBRE', candidatosCliente: [], ...alteration } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      }
      await assert.rejects(() => w.ispContratoArea1.update({ where: { id: 'assigned-contract-1001' }, data: { ispClienteRowId: 'assign-source-b' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.ispContratoArea1.create({ data: { id: 'partial-contract-1001', ...contractBase, clienteNombreFichero: 'Desconocido', ispClienteRowId: 'assign-source-a', asignacionCliente: 'NIF', candidatosCliente: [] } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.ispContratoArea1.update({ where: { id: 'assigned-contract-1001' }, data: { ...contractRefresh, clienteNombreFichero: 'Desconocido', ispClienteRowId: null, asignacionCliente: 'AMBIGUO', candidatosCliente: ['A', 'B'] } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.ispContratoArea1.update({ where: { id: 'assigned-contract-1001' }, data: { ...contractRefresh, docNormalizado: 'Z999', ispClienteRowId: null, asignacionCliente: 'HUERFANO', candidatosCliente: [] } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      const previousAssignment = JSON.stringify(db.rows.IspContratoArea1.find((row: any) => row.id === 'assigned-contract-1001').ispClienteRowId)
      await w.ispContratoArea1.update({ where: { id: 'assigned-contract-1001' }, data: { ...contractRefresh, clienteNombreFichero: 'Desconocido' } }); checks++
      assert.equal(JSON.stringify(db.rows.IspContratoArea1.find((row: any) => row.id === 'assigned-contract-1001').ispClienteRowId), previousAssignment); checks++
      await assert.rejects(() => w.ispContratoArea1.update({ where: { id: 'assigned-contract-1001' }, data: { ...contractRefresh, clienteNombreFichero: 'Unico', docNormalizado: 'B87654321' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await assert.rejects(() => w.ispContratoArea1.update({ where: { id: 'assigned-contract-1003' }, data: { ...contractRefresh, clienteNombreFichero: 'Desconocido' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
      await w.ispContratoArea1.update({ where: { id: 'assigned-contract-1001' }, data: { ...contractRefresh, clienteNombreFichero: 'Unico', docNormalizado: 'B87654321', ispClienteRowId: 'assign-source-c', asignacionCliente: 'NIF', candidatosCliente: [] } }); checks++
      await w.ispContratoArea1.update({ where: { id: 'assigned-contract-1001' }, data: { ultimaImportacionId: 'new-source-only' } }); checks++
    })
  })
  assert.equal(db.rows.IspContratoArea1.filter((row: any) => row.ispClienteRowId === 'assign-source-c').length, 2); checks++
  assert.equal(JSON.stringify(db.rows.IspClienteArea1.map((row: any) => ({ id: row.id, crmEmpresaId: row.crmEmpresaId, crmContactoId: row.crmContactoId, clienteWebId: row.clienteWebId }))), sourceLinkBytes); checks++
  // Limit failure never validates a truncated set, even with an apparently unique proposed FK.
  const originals = clone(db.rows.IspClienteArea1)
  db.rows.IspClienteArea1.push(...Array.from({ length: 501 }, (_, i) => ({ id: `limit-source-${i}`, ispClienteId: String(20000 + i), codigo: String(i), nombre: 'Same', docNormalizado: 'L999' })))
  await db.$transaction(async (tx: any) => {
    await assert.rejects(() => server.runWithIspSourceWriteTx('crm-xlsx', tx, (w: any) => w.ispContratoArea1.create({ data: { id: 'limit-contract-1001', ...contractBase, docNormalizado: 'L999', ispClienteRowId: 'limit-source-0', asignacionCliente: 'NIF', candidatosCliente: [] } })), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  })
  db.rows.IspClienteArea1 = originals
  const beforeRollback = JSON.stringify(db.rows)
  await assert.rejects(() => db.$transaction(async (tx: any) => {
    await server.runWithIspSourceWriteTx('isp-clients', tx, async (w: any) => { await w.clienteWeb.update({ where: { id: 1 }, data: { nombre: 'rollback source' } }) })
    await tx.crmEmpresa.update({ where: { id: 'linked' }, data: { sector: 'rollback panel' } })
    throw Error('EXPECTED_ROLLBACK')
  }), /EXPECTED_ROLLBACK/)
  assert.equal(JSON.stringify(db.rows), beforeRollback); checks += 2
  // Concurrent callbacks share the actual server ALS/fence and installed $use.
  // This memory lock queues exactly like pg_advisory_xact_lock and releases at callback completion.
  const gate = () => { let open!: () => void; const promise = new Promise<void>(resolve => { open = resolve }); return { promise, open } }
  const tick = () => new Promise<void>(resolve => setImmediate(resolve))
  await assert.rejects(() => server.acquireIspOrigenFenceTx(db), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  await db.$transaction(async (tx: any) => {
    await assert.rejects(() => server.acquireIspOrigenFenceTx({ ...tx }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    const acquisitions = fenceAcquisitions
    await Promise.all([server.acquireIspOrigenFenceTx(tx), server.acquireIspOrigenFenceTx(tx)])
    assert.equal(fenceAcquisitions, acquisitions + 1); checks++
  })
  db.rows.IspClienteArea1.push({ id: 'race-source', ispClienteId: '40001', codigo: 'RACE', nombre: 'Race', docNormalizado: 'R1', crmEmpresaId: null })
  db.rows.IspVinculoArea1.push(
    { id: 'race-proposal-A', ispClienteRowId: 'race-source', estado: 'PENDIENTE', tipo: 'CRM_EMPRESA', destinoId: 'linked' },
    { id: 'race-proposal-B', ispClienteRowId: 'race-source', estado: 'PENDIENTE', tipo: 'CRM_EMPRESA', destinoId: 'prospect' },
  )
  const firstLocked = gate(), firstCommit = gate(), events: string[] = []
  const first = db.$transaction(async (tx: any) => {
    await server.acquireIspOrigenFenceTx(tx)
    const proposal = await tx.ispVinculoArea1.findUnique({ where: { id: 'race-proposal-A' } })
    assert.equal(proposal.estado, 'PENDIENTE'); checks++
    events.push('A-read'); firstLocked.open(); await firstCommit.promise
    const assigned = await tx.ispClienteArea1.updateMany({ where: { id: 'race-source', crmEmpresaId: null }, data: { crmEmpresaId: 'linked' } })
    assert.equal(assigned.count, 1); checks++
    await tx.ispVinculoArea1.updateMany({ where: { id: 'race-proposal-A', estado: 'PENDIENTE' }, data: { estado: 'CONFIRMADO' } })
    await tx.ispVinculoArea1.updateMany({ where: { id: 'race-proposal-B', estado: 'PENDIENTE' }, data: { estado: 'OBSOLETO' } })
    events.push('A-commit')
  })
  await firstLocked.promise
  const second = db.$transaction(async (tx: any) => {
    await server.acquireIspOrigenFenceTx(tx)
    events.push('B-read')
    const proposal = await tx.ispVinculoArea1.findUnique({ where: { id: 'race-proposal-B' } })
    assert.equal(proposal.estado, 'OBSOLETO'); checks++
    await assert.rejects(() => tx.ispClienteArea1.update({ where: { id: 'race-source' }, data: { crmEmpresaId: 'prospect' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    await assert.rejects(() => tx.ispVinculoArea1.update({ where: { id: 'race-proposal-B' }, data: { estado: 'CONFIRMADO' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  })
  await tick(); assert.deepEqual(events, ['A-read']); checks++
  firstCommit.open(); await Promise.all([first, second])
  assert.deepEqual(events, ['A-read', 'A-commit', 'B-read']); checks++
  assert.equal(db.rows.IspVinculoArea1.filter((row: any) => row.ispClienteRowId === 'race-source' && row.estado === 'CONFIRMADO').length, 1); checks++
  // A source refresh starts its lock before entering scope; panel alias middleware
  // waits before its first ownership SELECT rather than deciding from a stale read.
  const refreshLocked = gate(), refreshCommit = gate()
  const refresh = db.$transaction(async (tx: any) => server.runWithIspSourceWriteTx('crm-xlsx', tx, async (w: any) => {
    await w.ispClienteArea1.update({ where: { id: 'race-source' }, data: { nombre: 'Refreshed Source' } })
    refreshLocked.open(); await refreshCommit.promise
  }))
  await refreshLocked.promise
  const readsBefore = db.ownershipReads.length
  const alias = db.$transaction(async (tx: any) => {
    await assert.rejects(() => tx.crmEmpresa.update({ where: { id: 'linked' }, data: { nombre: 'Race override' } }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  })
  await tick(); assert.equal(db.ownershipReads.length, readsBefore); checks++
  refreshCommit.open(); await Promise.all([refresh, alias])
  assert(db.ownershipReads.length > readsBefore); assert.equal(db.rows.CrmEmpresa.find((row: any) => row.id === 'linked').nombre, 'Local'); checks += 2
  // Additive association also queues before check/write, while ordinary panel fields remain unfenced.
  const panelLocked = gate(), panelCommit = gate()
  const holder = db.$transaction(async (tx: any) => {
    await server.acquireIspOrigenFenceTx(tx); panelLocked.open(); await panelCommit.promise
  })
  await panelLocked.promise
  const linksBefore = db.rows.CrmEmpresaCliente.length
  const association = db.$transaction(async (tx: any) => { await tx.crmEmpresaCliente.create({ data: { empresaId: 'prospect', clienteId: 2 } }) })
  await tick(); assert.equal(db.rows.CrmEmpresaCliente.length, linksBefore); checks++
  await allowed('CrmEmpresa', 'update', { where: { id: 'linked' }, data: { sector: 'Panel while ownership fenced' } })
  panelCommit.open(); await Promise.all([holder, association]); assert.equal(db.rows.CrmEmpresaCliente.length, linksBefore + 1); checks++
  await blocked('CrmEmpresa', 'update', { where: { id: 'prospect' }, data: { nombre: 'unfenced identity' } })
  await blocked('CrmEmpresaCliente', 'create', { data: { empresaId: 'prospect', clienteId: 1 } })
  const readsDto = fenceAcquisitions
  await server.readIspEmpresaOwnership(db, 'linked')
  assert.equal(fenceAcquisitions, readsDto); checks++
  virtualEnv.IO_PRODUCTION_READ_ONLY = '1'
  await db.$transaction(async (tx: any) => {
    await assert.rejects(() => server.acquireIspOrigenFenceTx(tx), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
    await assert.rejects(() => server.runWithIspSourceWriteTx('isp-clients', tx, async () => { throw Error('MUST_NOT_RUN') }), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  })
  delete virtualEnv.IO_PRODUCTION_READ_ONLY
  const lockArgs = ['SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS locked', 'isp-origen:ownership:v1']
  assert.equal(core.classifyPrisma5RawSqlStatement(lockArgs), 'advisory_lock'); checks++
  let lockPassed = 0, verified = 0
  await core.guardPrismaImpersonationMutation({ action: 'queryRaw', args: lockArgs }, async () => { lockPassed++ }, {
    requestContext: { status: 'valid', context: {} }, transaction: {}, verifyLiveContext: async () => { verified++; return true },
    appendSuccess: async () => { throw Error('LOCK_IS_NOT_BUSINESS_MUTATION') },
  })
  assert.equal(lockPassed, 1); assert.equal(verified, 1); checks += 2
  await assert.rejects(() => core.guardPrismaImpersonationMutation({ action: 'queryRaw', args: lockArgs }, async () => { throw Error('MUST_NOT_RUN') }, {
    requestContext: { status: 'valid', context: {} }, transaction: {}, verifyLiveContext: async () => false,
  }), /IMPERSONATION_WRITE_DENIED/); checks++
  // Guard installation is idempotent, and the impersonation contract remains live.
  core.installImpersonationPrismaGuard(db); assert.equal(db.middleware.length, 1); checks++
  ctx = { status: 'invalid' }
  await assert.rejects(() => db.call({ model: 'CrmEmpresa', action: 'update', args: { where: { id: 'linked' }, data: { sector: 'never' } } }), /IMPERSONATION_WRITE_CONTEXT_INVALID/); checks++
  ctx = { status: 'absent' }
  console.log(JSON.stringify({ passed: true, checks, actualMiddleware: true, vmSyntheticDb: true, rollback: true, liveDatabase: false, offline: true }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
