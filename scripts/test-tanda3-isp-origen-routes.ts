import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { AsyncLocalStorage } from 'node:async_hooks'
import ts from 'typescript'
import { Prisma, SegmentoCrm } from '@prisma/client'

/** Real POST handlers + real singleton middleware/core, only synthetic rollback DB. No network/.env/clock/SQL. */
const clone = (value: any) => JSON.parse(JSON.stringify(value))
const env: Record<string, string> = {}
let session: any, secondSession: any, authCalls = 0, deniedArea = '', revoked = false
let failingReads = false, lateConflict = false, providerError: any = null, remesasCompleted = false
let checks = 0
const rawTrace: string[] = []
const effects: string[] = []
const initial: Record<string, any[]> = {
  UsuarioAdmin: [{ id: 7, activo: true, rol: 'VENTAS', nombre: 'Synthetic', email: 'synthetic@example.invalid' }],
  ClienteWeb: [
    { id: 1, ispGestionId: '321', clienteIdIsp: '321', nombre: 'Legacy stale', nif: 'B12345678', cif: null },
    { id: 2, ispGestionId: 'manual-5f61da65-bc6c-451b-9044-54ac4b72e0b2', clienteIdIsp: null, nombre: 'Manual' },
    { id: 3, ispGestionId: 'uncertain', nombre: 'Unknown' },
    { id: 4, ispGestionId: '654', nombre: 'Legacy exact', nif: 'B87654321', cif: null },
  ],
  IspClienteArea1: [{ id: 'native-source-321', ispClienteId: '321', clienteWebId: null, crmEmpresaId: null, nombre: 'Native exact', cif: 'B12345678', nif: null, docNormalizado: 'B12345678' }],
  CrmEmpresa: [], CrmEmpresaCliente: [], CrmEmpresaContacto: [], CrmRegistroHubspot: [{ id: 'c123456789012345', objectTypeId: '0-1', nombre: 'Contact' }],
  IspVinculoArea1: [], PermisoUsuario: [],
}
function matches(row: any, where: any): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((w: any) => matches(row, w))
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((w: any) => matches(row, w))
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key])
      if ('not' in value) return row[key] !== value.not
      if ('equals' in value) return String(row[key] || '').toLowerCase() === String(value.equals).toLowerCase()
      return matches(row, value)
    }
    return row[key] === value
  })
}
class SyntheticPrisma {
  middleware: any[] = []; rows = clone(initial); transactionOptions: any
  constructor() { Object.assign(this, this.makeDelegates(false)) }
  $use(fn: any) { this.middleware.push(fn) }
  makeDelegates(tx: boolean) {
    const delegates: any = {}
    for (const model of Prisma.dmmf.datamodel.models.map(m => m.name)) {
      delegates[model[0].toLowerCase() + model.slice(1)] = new Proxy({}, { get: (_, action: string) => (args: any) => this.call({ model, action, args, runInTransaction: tx }) })
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
      const sql = typeof p.args[0] === 'string' ? p.args[0] : p.args[0].text || p.args[0].sql
      rawTrace.push(sql)
      if (/crm_registros_hubspot/.test(sql)) return [{ id: 'c123456789012345' }]
      return []
    }
    const rows = this.rows[p.model] ?? (this.rows[p.model] = [])
    const hits = rows.filter((row: any) => matches(row, p.args?.where))
    if (p.action.startsWith('find')) {
      if (failingReads && ['ClienteWeb', 'IspClienteArea1'].includes(p.model)) throw Error('PRIVATE_SOURCE_DETAILS')
      if (p.model === 'ClienteWeb') rawTrace.push('READ_CLIENT')
      if (lateConflict && p.model === 'CrmEmpresaCliente' && effects.includes('CrmEmpresaCliente.create')) return { empresaId: 'other' }
      const out = hits.slice(0, p.args?.take ?? rows.length).map((row: any) => p.args?.select ? Object.fromEntries(Object.keys(p.args.select).map(key => [key, row[key]])) : clone(row))
      return p.action === 'findMany' ? out : out[0] ?? null
    }
    if (p.action === 'count') return hits.length
    if (p.action === 'create') {
      effects.push(`${p.model}.create`)
      const data = clone(p.args.data)
      const created = { id: data.id ?? `cnew${rows.length + 100}synthetic`, activo: true, ...data }
      if (p.model === 'CrmEmpresa' && data.contactos?.create) {
        this.rows.CrmEmpresaContacto.push({ empresaId: created.id, ...data.contactos.create }); delete created.contactos
      }
      rows.push(created); return clone(created)
    }
    throw Error(`UNEXPECTED_ACTION:${p.model}:${p.action}`)
  }
  async $transaction(input: any, options: any): Promise<any> {
    this.transactionOptions = options
    const before = clone(this.rows)
    const tx: any = { ...this.makeDelegates(true),
      $queryRaw: (strings: any, ...values: any[]) => this.call({ action: 'queryRaw', args: [Prisma.sql(strings, ...values)], runInTransaction: true }),
      $queryRawUnsafe: (sql: string, ...values: any[]) => this.call({ action: 'queryRaw', args: [sql, ...values], runInTransaction: true }),
    }
    try { return await input(tx) } catch (error) { this.rows = before; throw error }
  }
}
class AuditError extends Error {}
class FileError extends Error { codigo = 'INVALID_FILE' }
const cache = new Map<string, any>()
const FixedDate = class extends Date { constructor(...args: any[]) { super(args.length ? args[0] : '2026-11-24T00:00:00.000Z') }; static now(): number { throw Error('CLOCK_FORBIDDEN') } }
async function getSession() { authCalls++; return authCalls > 2 && secondSession ? secondSession : session }
async function permission(_id: number, area: string, _role: string, tx?: any) { return { lectura: deniedArea !== area, escritura: deniedArea !== area && !(revoked && tx) } }
function load(path: string): any {
  const file = resolve(path)
  if (cache.has(file)) return cache.get(file)
  const module = { exports: {} as any }; cache.set(file, module.exports)
  const sync = async () => { if (providerError) throw providerError; return { count: 1 } }
  const mocks: any = {
    'node:async_hooks': { AsyncLocalStorage }, '@prisma/client': { Prisma, SegmentoCrm, PrismaClient: SyntheticPrisma },
    'node:crypto': { randomUUID: () => '5f61da65-bc6c-451b-9044-54ac4b72e0b2' },
    'next/server': { NextResponse: { json: (body: any, init: any = {}) => ({ body, status: init.status ?? 200 }) } },
    'next-auth': { getServerSession: getSession }, '@/lib/auth': { authOptions: {} },
    '@/lib/permisos': { verificarPermisoServer: permission }, '../../../lib/permisos': { verificarPermisoServer: permission },
    '../../../lib/auth': { authOptions: {} },
    '@/lib/area1-m365': { bloqueoActuacion: (s: any) => s?.impersonation ? 'ACTING' : null },
    '@/lib/impersonation-context': { trustedImpersonationContextResolutionFromRequest: async () => ({ status: 'absent' }) },
    '@/lib/impersonation-policy': { impersonationEnabled: () => false, impersonationActorListed: () => false, impersonationRequestAllowed: () => false },
    '@/lib/finanzas/conciliar-runtime': { conciliarRuntimeConfigured: () => null },
    '@/lib/finanzas/conciliar-recovery-lock-sql': { REVIEWED_CONCILIAR_RECOVERY_LOCK_SQL: new Set() },
    '../../../lib/ispgestion/service': { syncClients: sync, syncContratos: sync },
    '@/lib/ispgestion/sync-facturas': { syncFacturasBatch: sync, syncRemesasBatch: async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); remesasCompleted = true; return { count: 2 } } },
    '@/lib/area1-puertas-produccion': { importacionesCrmCerradas: () => false },
    '@/lib/crm-isp-auth': { autorizarSuperadminIsp: async () => ({ status: 200, actor: { id: 7, email: 'synthetic@example.invalid' } }) },
    '@/lib/crm-isp-import-core': { ErrorFicheroIsp: FileError, leerFicheroIsp: () => ({ hash: 'hash', bytes: 1 }) },
    '@/lib/crm-isp-import': { obtenerBajas: async () => { if (providerError) throw providerError; return {} }, planificarImportacion: async () => ({ resumen: {} }), aplicarImportacion: sync },
    '@/lib/area1-import-recibo': { ErrorImportacionNoAuditada: AuditError, propietarioImportacion: async () => ({ ok: true, actorId: 7 }), aplicarIspConRecibo: sync },
  }
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, Error, Date: FixedDate, Buffer, URL, URLSearchParams, console: { ...console, error: () => {} }, process: { env }, globalThis: {}, require: (name: string) => {
      if (name in mocks) return mocks[name]
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts')
      if (name.startsWith('.')) return load(resolve(file, '..', name + '.ts'))
      throw Error(`UNEXPECTED_IMPORT:${name}`)
    } }, { filename: file })
  cache.set(file, module.exports); return module.exports
}
const core = load('lib/prisma.ts')
const server = load('lib/isp-origen-server.ts')
const db: any = core.prisma
const companies = load('app/api/admin/crm/empresas/route.ts')
function reset() {
  db.rows = clone(initial); session = { user: { id: '7', userType: 'admin', role: 'VENTAS' } }; secondSession = null
  authCalls = 0; deniedArea = ''; revoked = false; failingReads = false; lateConflict = false; providerError = null; remesasCompleted = false
  effects.length = 0; rawTrace.length = 0; for (const key of Object.keys(env)) delete env[key]
}
const payload = (extra: any = {}) => ({ nombre: 'Panel local', sector: 'Panel sector', nombreComercial: 'Panel commercial', ...extra })
const request = (body: any) => ({ headers: { get: () => null }, json: async () => body })
async function expectNoEffects(body: any, status: number) {
  const before = JSON.stringify(db.rows)
  const response = await companies.POST(request(body))
  assert.equal(response.status, status); assert.equal(JSON.stringify(db.rows), before)
  assert(!JSON.stringify(response).includes('PRIVATE_SOURCE_DETAILS')); checks += 3
  return response
}
async function main() {
  assert.equal(typeof server.acquireIspOrigenFenceTx, 'function', 'Require the REAL core fence export, no final stub')
  reset()
  let r = await companies.POST(request(payload({ clienteId: 2 })))
  assert.equal(r.status, 201); assert.equal(db.rows.CrmEmpresaCliente[0].clienteId, 2); assert(!db.rows.CrmEmpresa[0].clientes)
  assert.equal(db.transactionOptions.isolationLevel, 'Serializable'); checks += 4
  const fence = rawTrace.findIndex(sql => sql.includes('hashtextextended'))
  assert(fence >= 0 && fence < rawTrace.indexOf('READ_CLIENT')); checks++
  reset()
  r = await companies.POST(request(payload({ clienteId: 1, nombre: 'Native exact', nif: 'B12345678' })))
  assert.equal(r.status, 201); assert.equal(r.body.identidadOrigen, 'ISP'); assert.equal(db.rows.CrmEmpresa[0].nombre, 'Native exact')
  assert.equal(db.rows.CrmEmpresa[0].nombreComercial, 'Panel commercial'); assert.equal(db.rows.CrmEmpresa[0].sector, 'Panel sector')
  assert.equal(db.rows.IspClienteArea1[0].crmEmpresaId, null); assert.equal(db.rows.ClienteWeb[0].nombre, 'Legacy stale'); checks += 7
  reset()
  r = await companies.POST(request(payload({ clienteId: 4, nombre: 'Legacy exact', nif: 'B87654321' })))
  assert.equal(r.status, 201); checks++
  reset()
  r = await companies.POST(request(payload({ tipo: 'AUTONOMO', titularNuevo: { nombre: 'New holder', email: 'holder@example.invalid' } })))
  assert.equal(r.status, 201); assert.equal(db.rows.CrmRegistroHubspot.length, 2); assert.equal(db.rows.CrmEmpresaContacto[0].papel, 'TITULAR'); checks += 3
  reset()
  r = await companies.POST(request(payload({ tipo: 'AUTONOMO', contactoId: 'c123456789012345' })))
  assert.equal(r.status, 201); assert.equal(db.rows.CrmEmpresaContacto[0].contactoId, 'c123456789012345'); checks += 2
  for (const bad of [payload({ clientes: { create: { clienteId: 1 } } }), payload({ origen: 'ISP', clienteId: 1 })]) {
    reset(); await expectNoEffects(bad, 400); assert.equal(effects.length, 0); checks++
  }
  for (const body of [payload({ clienteId: 1, nif: 'B12345678' }), payload({ clienteId: 1, nombre: 'Native exact', nif: 'B00000000' }), payload({ clienteId: 3 })]) {
    reset(); await expectNoEffects(body, 409); assert.equal(effects.length, 0); checks++
  }
  reset(); db.rows.CrmEmpresaCliente.push({ empresaId: 'existing', clienteId: 2 })
  await expectNoEffects(payload({ clienteId: 2, tipo: 'AUTONOMO', titularNuevo: { nombre: 'Must not create' } }), 409); assert.equal(effects.length, 0); checks++
  reset(); db.rows.IspClienteArea1.push({ ...db.rows.IspClienteArea1[0], id: 'other', nombre: 'Other raw' })
  await expectNoEffects(payload({ clienteId: 1, nombre: 'Native exact', nif: 'B12345678' }), 409)
  reset(); db.rows.IspClienteArea1[0].ispClienteId = '999'; db.rows.IspClienteArea1[0].clienteWebId = 1
  await expectNoEffects(payload({ clienteId: 1, nombre: 'Native exact', nif: 'B12345678' }), 409)
  reset(); db.rows.IspClienteArea1[0].nif = 'B00000000'
  await expectNoEffects(payload({ clienteId: 1, nombre: 'Native exact', nif: 'B12345678' }), 409)
  reset(); db.rows.IspClienteArea1[0].crmEmpresaId = 'other-company'
  await expectNoEffects(payload({ clienteId: 1, nombre: 'Native exact', nif: 'B12345678' }), 409)
  reset(); db.rows.UsuarioAdmin[0].activo = false; await expectNoEffects(payload(), 401)
  reset(); secondSession = { user: { id: '7', userType: 'admin' }, impersonation: {} }; await expectNoEffects(payload(), 403)
  reset(); lateConflict = true
  await expectNoEffects(payload({ clienteId: 2, tipo: 'AUTONOMO', titularNuevo: { nombre: 'Rollback holder' } }), 409)
  for (const area of ['admin.crm.empresas', 'admin.clientes', 'admin.crm.contactos']) {
    reset(); deniedArea = area
    await expectNoEffects(payload({ clienteId: 2, tipo: 'AUTONOMO', titularNuevo: { nombre: 'Denied holder' } }), 403)
  }
  reset(); revoked = true; await expectNoEffects(payload(), 403)
  reset(); session.impersonation = {}; await expectNoEffects(payload(), 403)
  reset(); secondSession = { user: { id: '8', userType: 'admin' } }; await expectNoEffects(payload(), 403)
  for (const flag of ['IO_PRODUCTION_READ_ONLY', 'FINANCE_DEPLOYMENT_READ_ONLY']) { reset(); env[flag] = '1'; await expectNoEffects(payload(), 403) }
  reset(); failingReads = true; await expectNoEffects(payload({ clienteId: 1 }), 409)
  // Direct actual middleware nested regression remains closed; positive route does not weaken it.
  reset(); await assert.rejects(() => db.$transaction((tx: any) => tx.crmEmpresa.create({ data: { nombre: 'Spoof', clientes: { create: { clienteId: 2 } } } })), (e: any) => e.code === 'ISP_ORIGEN_NO_EDITABLE'); checks++
  const routes = ['app/api/sync/route.ts', 'app/api/sync-contratos/route.ts', 'app/api/sync-facturas/route.ts', 'app/api/admin/crm/isp/importar/route.ts']
  const multipart = { headers: { get: () => null }, formData: async () => ({ get: (key: string) => ({ fichero: { name: 'synthetic.xlsx', arrayBuffer: async () => new ArrayBuffer(1) }, modo: 'simular' } as any)[key] ?? null }) }
  for (const path of routes) {
    const handler = load(path)
    reset(); const successful = await handler.POST(multipart); assert.equal(successful.status, 200); assert.notEqual(successful.body.success, false); checks += 2
    for (const [code, status] of [['ISP_ORIGEN_NO_EDITABLE', 409], ['ISP_SYNC_UNAUTHORIZED', 403], ['ISP_SYNC_READ_ONLY', 403], ['ISP_READ_ONLY', 403], ['ISP_SNAPSHOT_INVALID', 409], ['ISP_SNAPSHOT_INCOMPLETE', 409], ['UNKNOWN', 500]] as const) {
      reset(); providerError = Object.assign(new Error('PRIVATE_PROVIDER_DETAILS'), { code })
      const result = await handler.POST(multipart)
      assert.equal(result.status, status); assert.notEqual(result.body.success, true); assert(!JSON.stringify(result).includes('PRIVATE_PROVIDER_DETAILS'))
      if (code !== 'UNKNOWN') assert.equal(result.body.code, code)
      if (path.includes('sync-facturas')) { assert(remesasCompleted); assert(result.body.error.includes('facturas/remesas')); assert(!result.body.error.includes('no se ha guardado nada')) }
      checks += 3
    }
  }
  reset(); providerError = Object.assign(new AuditError('PRIVATE_RECEIPT'), { code: 'ISP_ORIGEN_NO_EDITABLE' })
  r = await load(routes[3]).POST(multipart); assert.equal(r.status, 500); assert.equal(r.body.auditoria, 'NO_REGISTRADA'); checks += 2
  console.log(JSON.stringify({ passed: true, checks, actualPostHandlers: true, actualMiddleware: true, realCoreFence: true, rollbackSyntheticDb: true, liveDatabase: false, network: false, clock: false }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
