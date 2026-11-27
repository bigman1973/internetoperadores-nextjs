import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { NextResponse } from 'next/server'
import * as crypto from 'node:crypto'

const nativeRequire = createRequire(import.meta.url)
const root = new URL('../', import.meta.url)
const clone = (value: any) => structuredClone(value)
function load(file: string, dependencies: Record<string, any>, globals: any = {}) {
  const module: any = { exports: {} }
  const compiled = ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  }, reportDiagnostics: true })
  assert.equal(compiled.diagnostics?.length || 0, 0, `syntax ${file}`)
  vm.runInNewContext(compiled.outputText, { module, exports: module.exports,
    require: (name: string) => {
      if (name in dependencies) return dependencies[name]
      if (name.startsWith('node:')) return nativeRequire(name)
      throw new Error(`UNEXPECTED_DEPENDENCY:${name}`)
    }, Buffer, Date, URL, URLSearchParams, Set, Map, Request, Response, Headers, AbortSignal,
    process: { env: {} }, console: { log() {}, error() {}, warn() {} },
    fetch: () => { throw new Error('NETWORK_FORBIDDEN') }, ...globals,
  }, { filename: file })
  return module.exports
}
function matches(row: any, where: any): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((branch: any) => matches(row, branch))
    if (key === 'AND') return value.every((branch: any) => matches(row, branch))
    if (key === 'empresaId_clienteId' || key === 'codigoCliente_anio_mes') return matches(row, value)
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key])
      if ('not' in value) return row[key] !== value.not
      if ('equals' in value) return value.mode === 'insensitive' ? String(row[key]).toLowerCase() === String(value.equals).toLowerCase() : row[key] === value.equals
      return matches(row[key] || {}, value)
    }
    return row[key] === value
  })
}
const models = ['clienteWeb', 'ispClienteArea1', 'ispContratoArea1', 'ispFacturacionMensualArea1', 'ispVinculoArea1', 'ispImportacionArea1',
  'crmEmpresa', 'crmEmpresaCliente', 'crmEmpresaContacto', 'crmRegistroHubspot', 'crmActividad', 'crmTarea', 'area1CrmNegocio',
  'factura', 'facturaEmitida', 'remesa', 'notificacionCliente', 'identidadFacturaISPEventoB7', 'documentoConciliable', 'crmSincronizacionHubspot', 'contratoServicio']
function harness(realCore = false) {
  let state: Record<string, any[]> = Object.fromEntries(models.map(model => [model, []]))
  let session: any = { user: { id: '7', userType: 'admin', role: 'SUPER_ADMIN', email: 'fixture.invalid', name: 'Fixture' } }
  let scoped: string | null = null, writes: Array<{ model: string; data: any }> = [], network = 0, audit = 0
  const policy = load('lib/isp-origen-policy.ts', {})
  const conflict = () => Object.assign(new Error('ISP_ORIGEN_NO_EDITABLE'), { code: 'ISP_ORIGEN_NO_EDITABLE', status: 409 })
  const db: any = {}
  for (const model of models) {
    const find = (where: any) => state[model].find(row => matches(row, where))
    const write = (data: any) => { writes.push({ model, data: clone(data) }); return clone(data) }
    db[model] = {
      findUnique: async ({ where }: any) => clone(find(where) ?? null), findFirst: async ({ where }: any = {}) => clone(find(where) ?? null),
      findMany: async ({ where, include }: any = {}) => clone(state[model].filter(row => matches(row, where)).map(row =>
        model === 'ispClienteArea1' && include?.contratos ? { ...row, contratos: state.ispContratoArea1.filter(k => k.ispClienteRowId === row.id) } : row)),
      count: async ({ where }: any = {}) => state[model].filter(row => matches(row, where)).length,
      create: async ({ data }: any) => { const row = { id: data.id ?? (['clienteWeb', 'factura', 'remesa', 'contratoServicio'].includes(model) ? state[model].length + 1 : `${model}-${state[model].length + 1}`), ...write(data) }; state[model].push(row); return clone(row) },
      createMany: async ({ data }: any) => { for (const row of data) state[model].push({ id: row.id ?? `${model}-${state[model].length + 1}`, ...write(row) }); return { count: data.length } },
      update: async ({ where, data }: any) => { const row = find(where); if (!row) throw new Error('ROW_NOT_FOUND'); Object.assign(row, write(data)); return clone(row) },
      updateMany: async ({ where, data }: any) => { const rows = state[model].filter(row => matches(row, where)); for (const row of rows) Object.assign(row, write(data)); return { count: rows.length } },
      delete: async ({ where }: any) => { const row = find(where); if (!row) throw new Error('ROW_NOT_FOUND'); state[model] = state[model].filter(x => x !== row); writes.push({ model, data: 'delete' }); return clone(row) },
      deleteMany: async ({ where }: any) => { const rows = state[model].filter(row => matches(row, where)); state[model] = state[model].filter(row => !matches(row, where)); writes.push({ model, data: 'deleteMany' }); return { count: rows.length } },
    }
  }
  db.usuarioAdmin = { findUnique: async () => ({ id: 7, activo: true, rol: 'SUPER_ADMIN' }) }
  db.$transaction = async (callback: any) => {
    const before = clone(state), oldWrites = writes.length
    try { return await callback(db) } catch (error) { state = before; writes.length = oldWrites; throw error }
  }
  db.$executeRaw = db.$executeRawUnsafe = db.$queryRawUnsafe = () => { throw new Error('RAW_FORBIDDEN') }
  db.$queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    if (strings.join('?').includes('FROM area1_isp_clientes')) {
      assert(strings.join('?').startsWith('SELECT id, isp_cliente_id AS "ispClienteId"'))
      assert(strings.join('?').endsWith('ORDER BY isp_cliente_id ASC LIMIT 501'))
      assert.equal(values.length, 3); assert(values.every(v => v === values[0]))
      const importCore = dependencies['@/lib/crm-isp-import-core']
      return clone(state.ispClienteArea1.filter(c => [c.docNormalizado, importCore.normalizarDocumento(c.cif), importCore.normalizarDocumento(c.nif)].includes(values[0])).sort((a, b) => a.ispClienteId.localeCompare(b.ispClienteId)))
    }
    assert.equal(strings.join('?'), 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))::text AS locked')
    assert.deepEqual(values, ['isp-origen:ownership:v1'])
    return [{ locked: '' }]
  }
  const sourceScope = {
    acquireIspOrigenFenceTx: async (tx: any) => { assert.equal(tx, db) },
    // This test double checks the real pure catalogue; common middleware/capability
    // integration is deliberately the separate policy/prisma battery, not faked here.
    runWithIspSourceWriteTx: async (writer: string, tx: any, callback: any) => {
      assert.equal(tx, db); assert.equal(scoped, null); scoped = writer
      const facade: any = {}
      for (const model of models) facade[model] = new Proxy(db[model], { get(target, operation: string) {
        if (!['create', 'createMany', 'update', 'updateMany'].includes(operation)) return target[operation]
        return async (args: any) => {
          const prismaModel = model[0].toUpperCase() + model.slice(1)
          const allowed = policy.sourceWriterFields(writer, prismaModel, operation.startsWith('create'))
          assert(allowed, `writer catalogue ${writer}/${prismaModel}`)
          for (const row of Array.isArray(args.data) ? args.data : [args.data]) for (const key of Object.keys(row)) {
            assert(key === 'id' || allowed.includes(key), `source scope forbids ${writer}/${model}.${key}`)
          }
          return target[operation](args)
        }
      } })
      try { return await callback(facade) } finally { scoped = null }
    },
    readIspEmpresaOwnership: async (_tx: any, id: string) => ({ linked: state.ispClienteArea1.some(row => row.crmEmpresaId === id) }),
  }
  const dependencies: Record<string, any> = {
    '@prisma/client': { Prisma: {}, SegmentoCrm: { EMPRESA: 'EMPRESA' } },
    'next/server': { NextResponse }, 'next-auth': { getServerSession: async () => session },
    '@/lib/auth': { authOptions: {} }, '../auth': { authOptions: {} }, '../../../../../lib/auth': { authOptions: {} }, '../../../../lib/auth': { authOptions: {} },
    '@/lib/prisma': { __esModule: true, default: db, prisma: db }, '../prisma': { prisma: db }, './prisma': { __esModule: true, default: db },
    '../../../../../lib/prisma': { __esModule: true, default: db }, '../../../../lib/prisma': { __esModule: true, default: db },
    '@/lib/isp-origen-server': sourceScope, '../isp-origen-server': sourceScope, '../../../../../lib/isp-origen-server': sourceScope,
    '@/lib/isp-origen-policy': policy, '../../../../../lib/isp-origen-policy': policy,
    '@/lib/area1-puertas-produccion': { importacionesCrmCerradas: () => false },
    '@/lib/brevo-config': { getBrevoApiKey: () => null }, '@/lib/brevo-fetch': { brevoFetch: () => { throw new Error('BREVO_FORBIDDEN') } },
    '@/lib/crm-isp-import-core': load('lib/crm-isp-import-core.ts', { xlsx: nativeRequire('xlsx') }),
    'bcryptjs': { __esModule: true, default: { hash: async () => 'HASH', compare: async () => false } },
    axios: { __esModule: true, default: { create: () => async () => { network++; throw new Error('NETWORK_FORBIDDEN') }, post: async () => { network++; throw new Error('NETWORK_FORBIDDEN') } } },
    '../../../../../lib/crm-segmentos': { esSegmentoCrm: (v: string) => ['PARTICULAR', 'EMPRESA', 'PARTNER'].includes(v) },
    '../../../../lib/crm-segmentos': { esSegmentoCrm: (v: string) => ['PARTICULAR', 'EMPRESA', 'PARTNER'].includes(v) },
    '../../../../../lib/crm-contactos': { reconciliarContactosCrmConClientes: async () => { audit++ } },
    '../../../../lib/crm-contactos': { reconciliarContactosCrmConClientes: async () => { audit++ } },
    '@/lib/api-admin-area-read': { checkAdminAreaRead: async () => null, checkAdminAreaWrite: async () => null },
    '@/lib/finanzas/finance-runtime-safety': { assertFinanceRuntimeReady: async () => undefined },
    '@/lib/finanzas/bank-invoicing-db': {}, '@/lib/finanzas/bank-invoicing-core': {},
    '@/lib/crm-empresas-auth': { authorizeCrmEmpresas: async () => ({ status: 200, user: { id: 7 } }), canAccessCrmRelated: async () => true },
  }
  if (realCore) {
    const core = load('lib/isp-origen-server.ts', { './isp-origen-policy': policy, './crm-isp-import-core': dependencies['@/lib/crm-isp-import-core'] })
    // Execute the actual guard and revocable callback facade against memory delegates.
    for (const model of models) for (const action of ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany']) {
      const original = db[model][action]
      db[model][action] = (args: any) => core.guardPrismaIspOrigenMutation({ model: model[0].toUpperCase() + model.slice(1), action, args, runInTransaction: true },
        () => original(args), { db })
    }
    const transaction = db.$transaction
    db.$transaction = (callback: any) => transaction((tx: any) => core.runWithIspPrismaTransaction(tx, () => callback(tx)))
    dependencies['@/lib/isp-origen-server'] = core
    dependencies['../isp-origen-server'] = core
    dependencies['../../../../../lib/isp-origen-server'] = core
  }
  const service = load('lib/ispgestion/service.ts', dependencies)
  dependencies['./service'] = { ...service, __esModule: true }
  dependencies['@/lib/ispgestion/service'] = service
  return { db, service, load: (file: string, extras: any = {}) => load(file, { ...dependencies, ...extras }), state: () => state,
    core: dependencies['@/lib/isp-origen-server'], importCore: dependencies['@/lib/crm-isp-import-core'],
    seed: (model: string, rows: any[]) => { state[model] = clone(rows) }, writes: () => writes, scoped: () => scoped,
    effects: () => ({ network, audit }), session: (value: any) => { session = value } }
}
const req = (body: any) => new Request('https://fixture.invalid/api', { method: 'POST', body: JSON.stringify(body) })
const panelModels = ['crmEmpresa', 'crmEmpresaCliente', 'crmEmpresaContacto', 'crmRegistroHubspot', 'crmActividad', 'crmTarea', 'area1CrmNegocio']
const seedPanel = (h: ReturnType<typeof harness>) => {
  for (const model of panelModels) h.seed(model, [{ id: `${model}-local`, sector: 'LOCAL-SECTOR', propietarioId: 'LOCAL-OWNER',
    notas: 'LOCAL-NOTE', propiedadesLocales: { email: 'panel.fixture.invalid' }, updatedAt: new Date('2020-01-01'), links: ['LOCAL-LINK'] }])
  return Object.fromEntries(panelModels.map(model => [model, clone(h.state()[model])]))
}
const assertPanel = (h: ReturnType<typeof harness>, before: any) => {
  for (const model of panelModels) assert.deepEqual(h.state()[model], before[model], `bytevalue ${model}`)
  assert.equal(h.effects().network, 0); assert.equal(h.scoped(), null)
}

test('native real snapshot writer: source changes, all panel bytevalues and local mixed/access state survive, empty snapshot never baja', async () => {
  const h = harness(), panel = seedPanel(h)
  const local = { comercial: 8, agente: null, origen: 'LOCAL-ORIGIN', passwordHash: 'LOCAL-HASH', newsletterSuscrito: true,
    segmentoCrm: 'PARTNER', segmentoCrmActualizadoAt: new Date('2020-01-01'), recibePublicidad: true, aceptoLopd: false, ultimoAcceso: new Date('2021-01-01') }
  h.seed('clienteWeb', [{ id: 1, ispGestionId: '21', clienteIdIsp: 'original-stable', nombre: 'OLD', ...local },
    { id: 2, ispGestionId: 'manual-00000000-0000-4000-8000-000000000002', nombre: 'MANUAL', activo: true }])
  const result = await h.service.applyIspClientsSnapshot(h.db, [{ id: '21', clienteid: 'different-id', nombrecompleto: 'SOURCE-NEW', email: 'source.fixture.invalid', comercial: 999, agente: 999, nombre_origen: 'SOURCE-ORIGIN' }], 'UNUSED-HASH')
  assert.equal(result.deactivated, 0); assert.equal(result.snapshotComplete, false)
  assert.equal(h.state().clienteWeb[0].nombre, 'SOURCE-NEW'); assert.equal(h.state().clienteWeb[0].clienteIdIsp, 'original-stable')
  for (const key of Object.keys(local)) assert.deepEqual(h.state().clienteWeb[0][key], (local as any)[key], key)
  const all = clone(h.state()); await h.service.applyIspClientsSnapshot(h.db, [], 'UNUSED'); assert.deepEqual(h.state(), all)
  assertPanel(h, panel); assert.equal(h.effects().audit, 0)
})

test('XLSX actual aplicarImportacion: disjoint source data preserves marketing, links, service mapping, all CRM, decisions and receipt outside scope', async () => {
  const h = harness(), panel = seedPanel(h)
  const old = { id: 'row', ispClienteId: '21', nombre: 'OLD', estadoMarketing: 'BAJA', bajaMarketingMotivo: 'LOCAL-BAJA', bajaMarketingAt: new Date('2020-01-01'),
    clienteWebId: null, crmEmpresaId: 'company', crmContactoId: 'person' }
  h.seed('ispClienteArea1', [old]); h.seed('ispContratoArea1', [{ id: 'contract', ispContratoId: 33, contratoServicioId: 99, ispClienteRowId: 'row', asignacionCliente: 'NIF', candidatosCliente: ['human'] }])
  h.seed('ispVinculoArea1', [{ id: 'confirmed', ispClienteRowId: 'row', tipo: 'CRM_EMPRESA', destinoId: 'company', estado: 'CONFIRMADO', motivo: 'HUMAN', confianza: 'ALTA', revisadoPor: 'HUMAN', revisadoAt: new Date('2020-01-01') }])
  const decisions = clone(h.state().ispVinculoArea1)
  const lib = h.load('lib/crm-isp-import.ts')
  const plan: any = { hash: 'hash', resumen: {}, brevoVerificado: true, ausentes: { clientes: ['21'], contratos: [33] }, facturacion: [],
    clientes: [{ rowId: 'row', clase: 'ACTUALIZADO', c: { ispClienteId: '21', nombre: 'SOURCE-DISJOINT', codigo: 'SOURCE-CODE', email: 'source.fixture.invalid', emails: [], huella: 'NEW-HASH' },
      marketing: { estado: 'APTO', motivo: null }, vinculo: { clienteWebId: 777, crmContactoId: 'OTHER', crmEmpresaId: 'OTHER', propuestas: [] } }],
    contratos: [{ rowId: 'contract', clase: 'ACTUALIZADO', k: { ispContratoId: 33, codigoContratoIsp: 'SOURCE-C', clienteNombreFichero: 'SOURCE', activo: true, estado: 'ACTIVO', huella: 'NEW' },
      contratoServicioId: 888, ispClienteRowId: null, asignacion: 'HUERFANO', candidatos: [] }] }
  const result = await lib.aplicarImportacion(h.db, plan, { actorId: 7, actorEmail: 'fixture', bytes: 1, ficheroNombre: 'fixture.xlsx' }, async () => { assert.equal(h.scoped(), null) })
  assert.equal(result.vinculosDirectos, 0); assert.equal(h.state().ispClienteArea1[0].nombre, 'SOURCE-DISJOINT')
  for (const key of ['estadoMarketing', 'bajaMarketingMotivo', 'bajaMarketingAt', 'clienteWebId', 'crmEmpresaId', 'crmContactoId']) assert.deepEqual(h.state().ispClienteArea1[0][key], (old as any)[key])
  assert.equal(h.state().ispContratoArea1[0].contratoServicioId, 99); assert.equal(h.state().ispContratoArea1[0].ispClienteRowId, 'row')
  assert.deepEqual(h.state().ispVinculoArea1, decisions); assertPanel(h, panel)
  const before = clone(h.state()); await assert.rejects(() => lib.aplicarImportacion(h.db, plan, { actorId: 7, actorEmail: 'fixture', bytes: 1, ficheroNombre: 'fixture.xlsx' }, async () => { throw new Error('RECEIPT_FAIL') }))
  assert.deepEqual(h.state(), before)
})

test('legacy invoice collision with manual exact external id rejects before any source effects', async () => {
  const h = harness(), panel = seedPanel(h)
  h.seed('facturaEmitida', [{ id: 'manual-fi', idExterno: '44', origenSistema: 'Manual', cliente: 'MANUAL', total: '900' }])
  const before = clone(h.state()), lib = h.load('lib/ispgestion/sync-facturas.ts')
  await assert.rejects(() => lib.applyIspInvoiceSnapshot(h.db, [{ id: '44', fecha: '2026-01-01', id_cliente: '21', base: '100', total_impuesto: '21', total: '121', total_pendiente: '0' }]), (error: any) => error.code === 'ISP_ORIGEN_NO_EDITABLE')
  assert.deepEqual(h.state(), before); assertPanel(h, panel)
})

test('source client API rejects protected+nested mixed PUT and DELETE before notification effects; newsletter succeeds', async () => {
  const h = harness(true)
  h.seed('clienteWeb', [{ id: 1, ispGestionId: '21', nombre: 'SOURCE', email: 'SOURCE', segmentoCrm: 'EMPRESA', newsletterSuscrito: false }])
  h.seed('notificacionCliente', [{ id: 1, clienteId: 1, texto: 'LOCAL' }])
  const route = h.load('app/api/admin/clientes/[id]/route.ts'), context = { params: Promise.resolve({ id: '1' }) }, before = clone(h.state())
  for (const body of [{ nombre: 'ATTACK', newsletterSuscrito: true }, { nombre: { set: 'ATTACK' } }, { ispGestionId: 'manual-ATTACK' }]) {
    const response = await route.PUT(req(body), context); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'ISP_ORIGEN_NO_EDITABLE'); assert.deepEqual(h.state(), before)
  }
  assert.equal((await route.DELETE(req({}), context)).status, 409); assert.deepEqual(h.state(), before)
  assert.equal((await route.PUT(req({ newsletterSuscrito: true }), context)).status, 200)
  assert.equal(h.state().clienteWeb[0].newsletterSuscrito, true); assert.equal(h.state().notificacionCliente.length, 1)
})

test('manual cliente cannot spoof ISP; normal create uses server UUID', async () => {
  const h = harness(), route = h.load('app/api/admin/clientes/route.ts')
  const body = { nombre: 'MANUAL', email: 'manual@fixture.invalid', password: 'synthetic-only', personaFisica: true, segmentoCrm: 'PARTICULAR' }
  assert.equal((await route.POST(req({ ...body, ispGestionId: '21' }))).status, 409); assert.equal(h.state().clienteWeb.length, 0)
  assert.equal((await route.POST(req(body))).status, 201); assert.match(h.state().clienteWeb[0].ispGestionId, /^manual-/)
})

test('FI POST mixed spoof rejects entire bulk; PUT closed schema rejects nested and fiscal+bank mix, bank edit remains', async () => {
  const h = harness(), route = h.load('app/api/admin/finanzas/facturas-emitidas/route.ts')
  const data = { cliente: 'MANUAL', numFactura: 'MAN26/1', fecha: '2026-01-01', base: 100, importeIva: 21, total: 121 }
  assert.equal((await route.POST(req({ facturas: [data, { ...data, origenSistema: 'ISPGestion', idExterno: '44' }] }))).status, 409)
  assert.equal(h.state().facturaEmitida.length, 0)
  h.seed('facturaEmitida', [{ id: 'fi', origenSistema: 'ISPGestion', idExterno: '44', cliente: 'SOURCE', estado: 'EMITIDA', importeCobrado: 0 }])
  const before = clone(h.state())
  for (const body of [{ id: 'fi', cliente: 'ATTACK', estado: 'COBRADA' }, { id: 'fi', total: { increment: 1 } }, { id: 'fi', facturaISP: { connect: { id: 44 } } }]) {
    assert.equal((await route.PUT(req(body))).status, 409); assert.deepEqual(h.state(), before)
  }
  assert.equal((await route.PUT(req({ id: 'fi', estado: 'COBRADA', importeCobrado: 121 }))).status, 200)
  assert.equal(h.state().facturaEmitida[0].importeCobrado, 121); assert.equal(h.state().facturaEmitida[0].cliente, 'SOURCE')
})

test('service and HTTP proxy read-only reject path/query/method/data attacks before transport', async () => {
  const h = harness(), route = h.load('app/api/ispgestion-proxy/route.ts')
  for (const body of [{ endpoint: 'clientes', method: 'PUT' }, { endpoint: 'clientes/login', method: 'POST' }, { endpoint: '../clientes' },
    { endpoint: 'clientes?method=PUT' }, { endpoint: '/clientes' }, { endpoint: 'clientes', data: { nombre: 'ATTACK' } }, { endpoint: 'clientes', params: { method: 'DELETE' } }]) {
    assert.equal((await route.POST(req(body))).status, 409)
    assert.throws(() => h.service.assertIspReadRequest(body.endpoint, (body as any).method ?? 'GET', (body as any).data ?? null, (body as any).params ?? null))
  }
  assert.doesNotThrow(() => h.service.assertIspReadRequest('facturacion', 'GET', null, { mostrar: 5000 }))
  assert.equal(h.effects().network, 0)
})

test('unlink actual route refuses last source evidence; manual pair association can be removed atomically', async () => {
  const h = harness(true), route = h.load('app/api/admin/crm/empresas/[id]/clientes/route.ts'), context = { params: Promise.resolve({ id: 'company' }) }
  h.seed('crmEmpresa', [{ id: 'company', activo: true }]); h.seed('clienteWeb', [{ id: 1, ispGestionId: '21' }]); h.seed('crmEmpresaCliente', [{ empresaId: 'company', clienteId: 1 }])
  const before = clone(h.state()); const rejected = await route.DELETE(req({ clienteId: 1 }), context)
  assert.equal(rejected.status, 409); assert.equal((await rejected.json()).code, 'ISP_ORIGEN_NO_EDITABLE'); assert.deepEqual(h.state(), before)
  h.seed('clienteWeb', [{ id: 1, ispGestionId: 'manual-00000000-0000-4000-8000-000000000001', clienteIdIsp: null }])
  assert.equal((await route.DELETE(req({ clienteId: 1 }), context)).status, 200); assert.equal(h.state().crmEmpresaCliente.length, 0)
})


test('real common guard + facade + native writer, existing refresh succeeds with all local bytevalues preserved', async () => {
  const h = harness(true), panel = seedPanel(h)
  h.seed('clienteWeb', [{ id: 1, ispGestionId: '21', nombre: 'OLD', passwordHash: 'LOCAL', comercial: 9, origen: 'LOCAL', segmentoCrm: 'PARTNER', newsletterSuscrito: true }])
  await h.service.applyIspClientsSnapshot(h.db, [{ id: '21', nombrecompleto: 'SOURCE-REFRESH', comercial: 999, nombre_origen: 'OTHER' }], 'UNUSED')
  assert.equal(h.state().clienteWeb[0].nombre, 'SOURCE-REFRESH'); assert.equal(h.state().clienteWeb[0].comercial, 9)
  assert.equal(h.state().clienteWeb[0].passwordHash, 'LOCAL'); assert.equal(h.state().clienteWeb[0].segmentoCrm, 'PARTNER')
  assertPanel(h, panel)
})

test('login real authorize never rewrites identity/email/CRM or provisions unknown source', async () => {
  const h = harness(), panel = seedPanel(h)
  h.seed('clienteWeb', [{ id: 1, ispGestionId: '21', nombre: 'CANONICAL-SOURCE', email: 'canonical@fixture.invalid', passwordHash: 'OLD', activo: true }])
  const auth = h.load('lib/auth.ts', {
    'next-auth/providers/credentials': { __esModule: true, default: (config: any) => config },
    'next-auth/providers/azure-ad': { __esModule: true, default: (config: any) => config },
    './ispgestion/service': { verifyClienteCredentials: async () => '21' },
    './impersonation': {},
  })
  const user = await auth.authOptions.providers[1].authorize({ userType: 'cliente', email: 'login@fixture.invalid', password: 'fixture-only' })
  assert.equal(user.name, 'CANONICAL-SOURCE'); assert.equal(user.email, 'canonical@fixture.invalid')
  assert.equal(h.state().clienteWeb[0].passwordHash, 'HASH'); assert.equal(h.state().clienteWeb[0].nombre, 'CANONICAL-SOURCE')
  assertPanel(h, panel)
  h.seed('clienteWeb', []); assert.equal(await auth.authOptions.providers[1].authorize({ userType: 'cliente', email: 'login@fixture.invalid', password: 'fixture-only' }), null)
  assert.equal(h.state().clienteWeb.length, 0)
})

test('HubSpot real importer version=0 linked preserves identity, snapshot/sector still update; absent fiscal never clears local NIF', async () => {
  const h = harness(true)
  h.seed('crmEmpresa', [{ id: 'linked', hubspotId: '1', version: 0, nombre: 'LOCAL-LINKED', nif: 'LOCAL-NIF', nifNormalizado: 'LOCAL-NIF', sector: 'OLD' },
    { id: 'prospect', hubspotId: '2', version: 0, nombre: 'LOCAL-PROSPECT', nif: 'PROSPECT-NIF', nifNormalizado: 'PROSPECT-NIF' }])
  h.seed('ispClienteArea1', [{ id: 'source', ispClienteId: '21', crmEmpresaId: 'linked' }])
  const remote = async (url: string) => {
    if (url.includes('/properties/')) throw new Error('CATALOG_UNAVAILABLE')
    if (url.includes('/associations/')) return { results: [] }
    return { results: [{ id: '1', properties: { name: 'HUBSPOT-DIFFERENT', industry: 'HUBSPOT-SECTOR' } }, { id: '2', properties: { name: 'NEW-PROSPECT' } }] }
  }
  const lib = h.load('lib/crm-empresas-import.ts', { '@/lib/hubspot-listas': { hubspotRequest: remote }, '@/lib/crm-empresas': { normalizarNif: (value: string) => value } })
  const result = await lib.importCompaniesBatch('fixture')
  assert.equal(h.state().crmEmpresa[0].nombre, 'LOCAL-LINKED'); assert.equal(h.state().crmEmpresa[0].nif, 'LOCAL-NIF')
  assert.equal(h.state().crmEmpresa[0].sector, 'HUBSPOT-SECTOR'); assert.equal(h.state().crmEmpresa[0].propiedadesHubspot.name, 'HUBSPOT-DIFFERENT')
  assert.equal(h.state().crmEmpresa[1].nombre, 'NEW-PROSPECT'); assert.equal(h.state().crmEmpresa[1].nif, 'PROSPECT-NIF')
  assert.equal(result.protectedIdentityDiscrepancies, 1); assert.equal(h.effects().network, 0)
})

test('P2 actual provider + real source guard: exact new invoice defaults, documentary work outside capability, bankstate untouched', async () => {
  const h = harness(true), panel = seedPanel(h)
  const coreDependencies = {
    '../../isp-sync-errors': load('lib/finanzas/sync-jobs/isp-sync-errors.ts', {}),
    '../../isp-sync-scope': load('lib/finanzas/sync-jobs/isp-sync-scope.ts', {}),
  }
  const lib = h.load('lib/finanzas/sync-jobs/providers/isp/isp-issued-invoice-provider.ts', coreDependencies)
  const provider = lib.createIspIssuedInvoiceProvider({ request: async () => [], createB4WrapperForNewInvoices: false })
  const item = { key: 'isp-factura:44', tipo: 'ISP_FACTURA', data: { id: '44', serie_factura: 'CLL', numero_documento: '44', fecha: '2026-01-01', id_cliente: '21', codigo_cliente: 'C21', nombrecompleto: 'SOURCE', nif_cif: 'SOURCE-NIF', documento: 'SOURCE-DOC', base: '100.00', total_impuesto: '21.00', total: '121.00' } }
  const prepared = await provider.prepare(item)
  const outcome = await h.db.$transaction((tx: any) => provider.apply(tx, item, prepared, 7))
  assert.equal(outcome, 'NUEVA'); assert.equal(h.state().factura.length, 1); assert.equal(h.state().facturaEmitida.length, 1)
  const fi = h.state().facturaEmitida[0]
  assert.equal(fi.estado, 'EMITIDA'); assert.equal(fi.importeCobrado, 0); assert.equal(fi.fechaCobro, null)
  assert.equal(fi.imputacion, undefined); assert.equal(fi.formaCobro, undefined); assert.equal(h.state().identidadFacturaISPEventoB7.length, 1)
  assertPanel(h, panel)
  h.state().facturaEmitida[0].estado = 'COBRADA'; h.state().facturaEmitida[0].importeCobrado = 121
  h.state().facturaEmitida[0].fechaCobro = new Date('2026-08-01'); h.state().facturaEmitida[0].imputacion = 'LOCAL'
  h.state().factura[0].facturaEmitidaB4 = clone(h.state().facturaEmitida[0])
  const unchanged = clone(h.state())
  assert.equal(await h.db.$transaction((tx: any) => provider.apply(tx, item, prepared, 7)), 'SIN_CAMBIOS')
  assert.deepEqual(h.state(), unchanged)
  const changed = { ...item, data: { ...item.data, base: '200.00', total_impuesto: '42.00', total: '242.00' } }
  const changedPrepared = await provider.prepare(changed)
  assert.equal(await h.db.$transaction((tx: any) => provider.apply(tx, changed, changedPrepared, 7)), 'REVISAR')
  assert.deepEqual(h.state(), unchanged)
})


test('real common core permits native new source only technical credential default; never commercial CRM mixture', async () => {
  const h = harness(true), panel = seedPanel(h)
  const hash = '$2b$10$' + 'a'.repeat(53)
  await h.service.applyIspClientsSnapshot(h.db, [{ id: '21', nombrecompleto: 'SOURCE', comercial: 999, agente: 999, nombre_origen: 'REMOTE' }], hash)
  assert.equal(h.state().clienteWeb[0].ispGestionId, '21'); assert.equal(h.state().clienteWeb[0].passwordHash, hash)
  assert.equal(h.state().clienteWeb[0].comercial, undefined); assert.equal(h.state().clienteWeb[0].origen, undefined)
  assertPanel(h, panel)
})

test('real core legacy FI refresh succeeds with fiscal source header only, every panel/bank bytevalue retained', async () => {
  const h = harness(true), panel = seedPanel(h), lib = h.load('lib/ispgestion/sync-facturas.ts')
  h.seed('factura', [{ id: 1, ispGestionId: 44, nombreCompleto: 'OLD-SOURCE', total: '121', remesaId: 3 }])
  const bank = { id: 'fi', origenSistema: 'ISPGestion', idExterno: '44', cliente: 'OLD-SOURCE', total: '121', estado: 'COBRADA_PARCIAL', importeCobrado: '50.25',
    fechaCobro: new Date('2026-05-01'), imputacion: null, formaCobro: 'LOCAL-FORMA', remesaRef: 'LOCAL-REMESA', proyectoSingularId: 'LOCAL-PROJECT', facturaISPId: 1,
    lineas: '[{"human":true}]', fechaVencimiento: new Date('2027-01-01'), tipoIrpf: 15, importeIrpf: 30, createdAt: new Date('2020-01-01') }
  h.seed('facturaEmitida', [bank])
  const result = await lib.applyIspInvoiceSnapshot(h.db, [{ id: '44', fecha: '2026-01-01', id_cliente: '21', nombrecompleto: 'DISJOINT-SOURCE', serie_factura: 'NEW', numero_documento: 'NEW', base: '200', total_impuesto: '42', total: '242', situacion: 'COBRADA', total_pendiente: '0' }])
  assert.equal(result.success, true); assert.equal(result.upsertedEmitidas, 1)
  const updated = h.state().facturaEmitida[0]
  assert.equal(updated.cliente, 'DISJOINT-SOURCE'); assert.equal(updated.base, 200); assert.equal(updated.importeIva, 42); assert.equal(updated.total, 242)
  const fiscal = new Set(['cliente', 'cif', 'numFactura', 'serie', 'fecha', 'base', 'tipoIva', 'importeIva', 'total', 'concepto'])
  for (const key of Object.keys(bank)) if (!fiscal.has(key)) assert.deepEqual(updated[key], (bank as any)[key], `bytevalue FI.${key}`)
  assert.equal(h.state().factura[0].remesaId, 3); assertPanel(h, panel)
})

test('real core + XLSX existing refresh succeeds without touching any panel or link; journal/proposals remain separate', async () => {
  const h = harness(true), panel = seedPanel(h), lib = h.load('lib/crm-isp-import.ts')
  h.seed('ispClienteArea1', [{ id: 'source-row', ispClienteId: '21', nombre: 'OLD', estadoMarketing: 'BAJA', clienteWebId: 1, crmEmpresaId: 'company' }])
  const plan = { hash: 'fixture', resumen: {}, brevoVerificado: false, contratos: [], facturacion: [], ausentes: { clientes: [], contratos: [] },
    clientes: [{ rowId: 'source-row', clase: 'ACTUALIZADO', c: { ispClienteId: '21', nombre: 'NEW-SOURCE', codigo: 'NEW', emails: [] },
      marketing: { estado: 'APTO', motivo: null }, vinculo: { clienteWebId: 999, crmEmpresaId: 'OTHER', propuestas: [] } }] }
  await lib.aplicarImportacion(h.db, plan, { actorId: 7, actorEmail: 'fixture', bytes: 1, ficheroNombre: 'synthetic.xlsx' })
  assert.equal(h.state().ispClienteArea1[0].nombre, 'NEW-SOURCE'); assert.equal(h.state().ispClienteArea1[0].estadoMarketing, 'BAJA')
  assert.equal(h.state().ispClienteArea1[0].clienteWebId, 1); assert.equal(h.state().ispClienteArea1[0].crmEmpresaId, 'company')
  assertPanel(h, panel)
})

const invoiceFixture = { id: '44', fecha: '2026-01-01', id_cliente: '21', nombrecompleto: 'SOURCE', nif_cif: 'SOURCE-NIF',
  serie_factura: 'CLL', numero_documento: '44', documento: 'SOURCE-DOC', base: '100.00', total_impuesto: '21.00', total: '121.00', situacion: 'COBRADA', total_pendiente: '0' }
const fiscalFixture = { cliente: 'SOURCE', cif: 'SOURCE-NIF', numFactura: '44', serie: 'CLL', fecha: new Date('2026-01-01'),
  base: 100, tipoIva: 21, importeIva: 21, total: 121, concepto: 'SOURCE-DOC' }

test('real core native FI new uses exact source result, numeric fiscal header and neutral defaults without introducing legacy FK', async () => {
  const h = harness(true), panel = seedPanel(h), lib = h.load('lib/ispgestion/sync-facturas.ts')
  const result = await lib.applyIspInvoiceSnapshot(h.db, [invoiceFixture])
  assert.equal(result.success, true); assert.equal(result.upserted, 1); assert.equal(result.upsertedEmitidas, 1)
  assert.equal(h.state().factura[0].ispGestionId, 44)
  const fi = h.state().facturaEmitida[0]
  for (const [key, value] of Object.entries(fiscalFixture)) assert.deepEqual(fi[key], value)
  assert.equal(fi.origenSistema, 'ISPGestion'); assert.equal(fi.idExterno, '44')
  assert.equal(fi.estado, 'EMITIDA'); assert.equal(fi.importeCobrado, 0); assert.equal(fi.fechaCobro, null)
  assert.equal(fi.tipoIrpf, 0); assert.equal(fi.importeIrpf, 0)
  assert.equal('facturaISPId' in fi, false); assert.equal('imputacion' in fi, false); assert.equal('formaCobro' in fi, false)
  const before = clone(h.state())
  await lib.applyIspInvoiceSnapshot(h.db, [invoiceFixture])
  assert.deepEqual(h.state(), before); assertPanel(h, panel)
})

test('real core existing legacy FI without FK stays null and retains bank bytes on fiscal refresh', async () => {
  const h = harness(true), lib = h.load('lib/ispgestion/sync-facturas.ts')
  h.seed('factura', [{ id: 1, ispGestionId: 44 }])
  h.seed('facturaEmitida', [{ id: 'legacy', origenSistema: 'ISPGestion', idExterno: '44', facturaISPId: null, estado: 'COBRADA', importeCobrado: 99, fechaCobro: new Date('2025-01-01') }])
  await lib.applyIspInvoiceSnapshot(h.db, [invoiceFixture])
  const fi = h.state().facturaEmitida[0]
  assert.equal(fi.facturaISPId, null); assert.equal(fi.estado, 'COBRADA'); assert.equal(fi.importeCobrado, 99)
  assert.deepEqual(fi.fechaCobro, new Date('2025-01-01')); assert.equal(fi.total, 121)
})

test('real core native writer rejects manual external-id and contradictory source FK with complete rollback', async () => {
  for (const fi of [
    { id: 'manual', origenSistema: 'Manual', idExterno: '44', facturaISPId: null },
    { id: 'wrong-fk', origenSistema: 'ISPGestion', idExterno: '44', facturaISPId: 999 },
  ]) {
    const h = harness(true), panel = seedPanel(h), lib = h.load('lib/ispgestion/sync-facturas.ts')
    h.seed('factura', [{ id: 1, ispGestionId: 44, nombreCompleto: 'UNCHANGED' }]); h.seed('facturaEmitida', [fi])
    const before = clone(h.state())
    await assert.rejects(() => lib.applyIspInvoiceSnapshot(h.db, [invoiceFixture]), (error: any) => error.code === 'ISP_ORIGEN_NO_EDITABLE')
    assert.deepEqual(h.state(), before); assertPanel(h, panel)
  }
})

test('real source scope cannot spoof FI source item/header/provenance, mix bank fields or use original tx ambiently', async () => {
  const h = harness(true), lib = h.load('lib/ispgestion/sync-facturas.ts')
  await lib.applyIspInvoiceSnapshot(h.db, [invoiceFixture])
  const fi = h.state().facturaEmitida[0], before = clone(h.state())
  for (const [item, data, original] of [
    [{ facturaISPId: 1, idExterno: '45' }, fiscalFixture, false],
    [{ facturaISPId: 999, idExterno: '44' }, fiscalFixture, false],
    [{ facturaISPId: 1, idExterno: '44' }, { ...fiscalFixture, cliente: 'SPOOF' }, false],
    [{ facturaISPId: 1, idExterno: '44' }, { ...fiscalFixture, estado: 'COBRADA', importeCobrado: 121 }, false],
    [{ facturaISPId: 1, idExterno: '44' }, { ...fiscalFixture, idExterno: '45' }, false],
    [{ facturaISPId: 1, idExterno: '44' }, { ...fiscalFixture, origenSistema: 'Manual' }, false],
    [undefined, fiscalFixture, false],
    [{ facturaISPId: 1, idExterno: '44' }, fiscalFixture, true],
  ] as const) {
    await assert.rejects(() => h.db.$transaction((tx: any) => h.core.runWithIspSourceWriteTx('isp-facturas', tx,
      (writerTx: any) => (original ? tx : writerTx).facturaEmitida.update({ where: { id: fi.id }, data }), item)),
    (error: any) => error.code === 'ISP_ORIGEN_NO_EDITABLE')
    assert.deepEqual(h.state(), before)
  }
})

const sourceCustomer = (id: string, name = 'SOURCE COMPANY') => ({ ispClienteId: id, codigo: `C${id}`, nombre: name, nombreComercial: null,
  cif: 'B00000001', nif: null, docNormalizado: 'B00000001', emails: [], email: null, huella: `client-${id}`, segmentoCrm: 'EMPRESA', personaFisica: false })
const sourceContract = (id: number, name = 'SOURCE COMPANY') => ({ ispContratoId: id, codigoContratoIsp: `K${id}`, serie: 'CLL',
  clienteNombreFichero: name, docNormalizado: 'B00000001', activo: true, estado: 'ACTIVO', tarifa: 'SOURCE PLAN', importeSinIva: '25.00', huella: `contract-${id}` })
const xlsxMeta = { actorId: 7, actorEmail: 'fixture', bytes: 1, ficheroNombre: 'synthetic.xlsx' }
const noBajas = { bajas: new Map(), brevoVerificado: false, brevoError: 'NO_CONSULTADO' }

test('real plan + XLSX + guard: new customer persists before new source contract, source relation is readable without any human links', async () => {
  const h = harness(true), lib = h.load('lib/crm-isp-import.ts')
  const plan = await lib.planificarImportacion(h.db, { hash: 'fixture', clientes: [sourceCustomer('21')], contratos: [sourceContract(33)], facturacion: [], avisos: [] }, noBajas)
  const result = await lib.aplicarImportacion(h.db, plan, xlsxMeta)
  const c = h.state().ispClienteArea1[0], k = h.state().ispContratoArea1[0]
  assert.equal(c.id, plan.clientes[0].rowId); assert.equal(k.ispClienteRowId, c.id)
  assert.equal(k.asignacionCliente, 'NIF'); assert.deepEqual(k.candidatosCliente, [])
  for (const field of ['clienteWebId', 'crmEmpresaId', 'crmContactoId']) assert.equal(c[field] ?? null, null)
  assert.equal(k.contratoServicioId ?? null, null); assert.equal(result.vinculosDirectos, 0)
  assert.equal(result.resumen.asignacionesFuenteAplicadas, 1); assert.equal(result.resumen.asignacionesAutomaticasAplicadas, false)
  assert.equal(result.resumen.presenciaAplicada, false); assert.equal(result.resumen.marketingAplicado, false)
  const visible = await h.db.ispClienteArea1.findUnique({ where: { id: c.id } })
  const included = await h.db.ispClienteArea1.findMany({ where: { id: visible.id }, include: { contratos: true } })
  assert.equal(included[0].contratos.length, 1); assert.equal(included[0].contratos[0].importeSinIva, '25.00')
  // A stale/tampered in-memory proposed source FK is recomputed from persisted source.
  plan.contratos[0].ispClienteRowId = 'invented'; plan.contratos[0].asignacion = 'HUERFANO'
  const repeat = await lib.planificarImportacion(h.db, { hash: 'fixture', clientes: [sourceCustomer('21')], contratos: [sourceContract(33)], facturacion: [], avisos: [] }, noBajas)
  repeat.contratos[0].ispClienteRowId = 'invented'
  await lib.aplicarImportacion(h.db, repeat, xlsxMeta)
  assert.equal(h.state().ispContratoArea1[0].ispClienteRowId, c.id)
})

test('XLSX persisted absent source candidate prevents partial-export invented assignment; ambiguous and orphan remain unlinked', async () => {
  const h = harness(true), lib = h.load('lib/crm-isp-import.ts')
  h.seed('ispClienteArea1', [{ id: 'persisted-other', ...sourceCustomer('22', 'OTHER COMPANY'), presenteEnUltimoFichero: true }])
  const plan = await lib.planificarImportacion(h.db, { hash: 'partial', clientes: [sourceCustomer('21')], contratos: [sourceContract(33, 'NO MATCH'),
    { ...sourceContract(34), docNormalizado: null }], facturacion: [], avisos: [] }, noBajas)
  assert.equal(plan.contratos[0].asignacion, 'NIF') // incomplete planning view, rechecked during apply
  await lib.aplicarImportacion(h.db, plan, xlsxMeta)
  const [ambiguous, orphan] = h.state().ispContratoArea1
  assert.equal(ambiguous.ispClienteRowId, null); assert.equal(ambiguous.asignacionCliente, 'AMBIGUO')
  assert.deepEqual([...ambiguous.candidatosCliente].sort(), ['C21', 'C22'])
  assert.equal(orphan.ispClienteRowId, null); assert.equal(orphan.asignacionCliente, 'HUERFANO')
  assert.equal(h.state().ispClienteArea1[0].presenteEnUltimoFichero, true)
})

test('XLSX source header/document refresh recomputes contracts after persisted document info and preserves panel service mapping', async () => {
  const h = harness(true), lib = h.load('lib/crm-isp-import.ts')
  h.seed('ispClienteArea1', [{ id: 'source-row-21', ...sourceCustomer('21'), docNormalizado: 'B00000002', cif: 'B00000002', huella: 'OLD', crmEmpresaId: 'human-company' }])
  h.seed('ispContratoArea1', [{ id: 'source-contract-33', ...sourceContract(33), ispClienteRowId: null, asignacionCliente: 'HUERFANO', candidatosCliente: [], contratoServicioId: 99, presenteEnUltimoFichero: true }])
  const plan = await lib.planificarImportacion(h.db, { hash: 'doc-refresh', clientes: [sourceCustomer('21')], contratos: [sourceContract(33)], facturacion: [], avisos: [] }, noBajas)
  await lib.aplicarImportacion(h.db, plan, xlsxMeta)
  assert.equal(h.state().ispContratoArea1[0].ispClienteRowId, 'source-row-21')
  assert.equal(h.state().ispContratoArea1[0].contratoServicioId, 99)
  assert.equal(h.state().ispClienteArea1[0].crmEmpresaId, 'human-company')
})

test('synthetic interleaving: two PENDIENTE proposals on one row acquire actual fence before reads; second is stale, zero overwrites', async () => {
  const h = harness(true), core = h.core, lib = h.load('lib/crm-isp-import.ts')
  const clients = [{ id: 'source-row', ispClienteId: '21', crmEmpresaId: null, crmContactoId: null, clienteWebId: null }]
  const proposals = ['A', 'B'].map(label => ({ id: label, ispClienteRowId: 'source-row', destinoId: `company-${label}`, tipo: 'CRM_EMPRESA', estado: 'PENDIENTE' }))
  const trace: string[] = []; let writes = 0, overwrites = 0, releaseA!: () => void, enteredA!: () => void
  const entered = new Promise<void>(resolve => { enteredA = resolve })
  const pauseA = new Promise<void>(resolve => { releaseA = resolve })
  let tail = Promise.resolve()
  const context = new AsyncLocalStorage<string>()
  const makeTx = (label: string) => {
    let unlock: (() => void) | undefined
    const tx: any = {
      $queryRaw: async (strings: TemplateStringsArray, value: string) => {
        assert.equal(strings.join('?'), 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))::text AS locked')
        assert.equal(value, 'isp-origen:ownership:v1'); trace.push(`${label}:fence-wait`)
        const previous = tail; tail = new Promise<void>(resolve => { unlock = resolve }); await previous
        trace.push(`${label}:fence-acquired`); return [{ locked: '' }]
      },
      ispVinculoArea1: {
        findUnique: async ({ where }: any) => { trace.push(`${label}:proposal-read`); const row = proposals.find(p => p.id === where.id); return row ? { ...row, cliente: { ...clients[0] } } : null },
        findMany: async ({ where }: any) => clone(proposals.filter(p => matches(p, where))),
        update: async ({ where, data }: any) => { Object.assign(proposals.find(p => p.id === where.id)!, data); return {} },
        updateMany: async ({ where, data }: any) => { const rows = proposals.filter(p => matches(p, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length } },
      },
      ispClienteArea1: {
        findMany: async ({ where }: any) => clone(clients.filter(c => matches(c, where))),
        findUnique: async ({ where }: any) => clone(clients.find(c => matches(c, where)) ?? null),
        updateMany: async ({ where, data }: any) => {
          assert.equal(context.getStore(), label); const rows = clients.filter(c => matches(c, where))
          for (const row of rows) { if (row.crmEmpresaId !== null && row.crmEmpresaId !== data.crmEmpresaId) overwrites++; Object.assign(row, data); writes++ }
          return { count: rows.length }
        },
      },
      crmEmpresa: { findFirst: async ({ where }: any) => { if (label === 'A') { enteredA(); await pauseA } return { id: where.id } } },
    }
    for (const [model, actions] of [['ispClienteArea1', ['updateMany']], ['ispVinculoArea1', ['update', 'updateMany']]] as const) for (const action of actions) {
      const original = tx[model][action]
      tx[model][action] = (args: any) => core.guardPrismaIspOrigenMutation({ model: model[0].toUpperCase() + model.slice(1), action, args, runInTransaction: true }, () => original(args), { db: tx })
    }
    return { run: () => context.run(label, () => core.runWithIspPrismaTransaction(tx, async () => {
      try { return await lib.resolverVinculoEnTx(tx, label, 'CONFIRMAR', 'fixture') } finally { unlock?.() }
    })) }
  }
  const a = makeTx('A').run(); await entered
  const b = makeTx('B').run(); const rejected = assert.rejects(b, (error: any) => error.codigo === 'YA_RESUELTA')
  await new Promise(resolve => setImmediate(resolve))
  assert(trace.includes('B:fence-wait')); assert(!trace.includes('B:proposal-read'))
  releaseA(); await a; await rejected
  assert.equal(clients[0].crmEmpresaId, 'company-A'); assert.equal(writes, 1); assert.equal(overwrites, 0)
  assert.deepEqual(proposals.map(p => p.estado), ['CONFIRMADO', 'OBSOLETO'])
  assert(trace.indexOf('B:proposal-read') > trace.indexOf('B:fence-acquired'))
  const retry = makeTx('A').run()
  await assert.rejects(retry, (error: any) => error.codigo === 'YA_RESUELTA')
  assert.equal(writes, 1)
})

test('real XLSX guard rejects arbitrary/incomplete source derivation and panel service mapping inside source scope', async () => {
  const h = harness(true)
  h.seed('ispClienteArea1', [{ id: 'source-row-21', ...sourceCustomer('21') }])
  const base = { id: 'source-contract-33', ...sourceContract(33), ispClienteRowId: 'source-row-21', asignacionCliente: 'NIF', candidatosCliente: [] }
  for (const data of [
    { ...base, ispClienteRowId: 'invented-source-row' },
    { ...base, asignacionCliente: 'HUERFANO' },
    { ...base, candidatosCliente: ['INVENTED'] },
    { ...base, contratoServicioId: 999 },
    (() => { const { candidatosCliente: _removed, ...incomplete } = base; return incomplete })(),
  ]) {
    const before = clone(h.state())
    await assert.rejects(() => h.db.$transaction((tx: any) => h.core.runWithIspSourceWriteTx('crm-xlsx', tx,
      (writerTx: any) => writerTx.ispContratoArea1.create({ data }))), (error: any) => error.code === 'ISP_ORIGEN_NO_EDITABLE')
    assert.deepEqual(h.state(), before)
  }
})

test('partial ambiguous XLSX refresh preserves existing source assignment, local service mapping and confirmed decision bytes', async () => {
  const h = harness(true), lib = h.load('lib/crm-isp-import.ts')
  h.seed('ispClienteArea1', [{ id: 'source-row-21', ...sourceCustomer('21'), presenteEnUltimoFichero: true },
    { id: 'source-row-22', ...sourceCustomer('22', 'OTHER COMPANY'), presenteEnUltimoFichero: true }])
  h.seed('ispContratoArea1', [{ id: 'source-contract-33', ...sourceContract(33), huella: 'OLD', ispClienteRowId: 'source-row-21', asignacionCliente: 'NIF',
    candidatosCliente: [], contratoServicioId: 99, presenteEnUltimoFichero: true }])
  const decision = { id: 'confirmed', ispClienteRowId: 'source-row-21', tipo: 'CRM_EMPRESA', destinoId: 'human', estado: 'CONFIRMADO', revisadoPor: 'HUMAN', revisadoAt: new Date('2020-01-01') }
  h.seed('ispVinculoArea1', [decision])
  const plan = await lib.planificarImportacion(h.db, { hash: 'partial-ambiguous', clientes: [sourceCustomer('21')],
    contratos: [sourceContract(33, 'NO MATCH')], facturacion: [], avisos: [] }, noBajas)
  const result = await lib.aplicarImportacion(h.db, plan, xlsxMeta)
  const k = h.state().ispContratoArea1[0]
  assert.equal(k.clienteNombreFichero, 'SOURCE COMPANY'); assert.equal(k.huella, 'OLD'); assert.equal(k.ispClienteRowId, 'source-row-21')
  assert.equal(k.asignacionCliente, 'NIF'); assert.deepEqual(k.candidatosCliente, []); assert.equal(k.contratoServicioId, 99)
  assert.deepEqual(h.state().ispVinculoArea1.find(row => row.id === 'confirmed'), decision)
  assert.equal(result.resumen.asignacionesFuenteAplicadas, 0); assert.equal(result.resumen.presenciaAplicada, false)
  assert.equal(result.resumen.contratosAsignacionPendiente, 1)
})

test('resolver CAS zero or failed postcondition rejects and never confirms proposal', async () => {
  for (const failure of ['zero', 'postcondition']) {
    const h = harness(true), lib = h.load('lib/crm-isp-import.ts')
    h.seed('ispClienteArea1', [{ id: 'source-row', ispClienteId: '21', clienteWebId: null, crmContactoId: null, crmEmpresaId: null }])
    h.seed('ispVinculoArea1', [{ id: 'proposal', ispClienteRowId: 'source-row', tipo: 'CRM_EMPRESA', destinoId: 'company', estado: 'PENDIENTE' }])
    h.seed('crmEmpresa', [{ id: 'company', activo: true }])
    const original = h.db.ispVinculoArea1.findUnique
    h.db.ispVinculoArea1.findUnique = async (args: any) => { const v = await original(args); return { ...v, cliente: clone(h.state().ispClienteArea1[0]) } }
    h.db.ispClienteArea1.updateMany = async () => ({ count: failure === 'zero' ? 0 : 1 })
    const before = clone(h.state())
    await assert.rejects(() => h.db.$transaction((tx: any) => lib.resolverVinculoEnTx(tx, 'proposal', 'CONFIRMAR', 'fixture')),
      (error: any) => error.codigo === 'YA_RESUELTA')
    assert.deepEqual(h.state(), before)
  }
})

test('real XLSX VM wiring never bypasses public auth: missing session, wrong actor and acting reject before source/receipt writes', async () => {
  for (const session of [null, { user: { id: '8', userType: 'admin' } }, { user: { id: '7', userType: 'admin' }, impersonation: {} }]) {
    const h = harness(true), lib = h.load('lib/crm-isp-import.ts')
    h.session(session)
    const before = clone(h.state()), plan = { hash: 'unauthorized', resumen: {}, brevoVerificado: false, clientes: [], contratos: [], facturacion: [], ausentes: { clientes: [], contratos: [] } }
    let receipts = 0
    await assert.rejects(() => lib.aplicarImportacion(h.db, plan, xlsxMeta, async () => { receipts++ }),
      (error: any) => error.code === 'ISP_SYNC_UNAUTHORIZED' && error.status === 403)
    assert.deepEqual(h.state(), before); assert.equal(receipts, 0); assert.equal(h.effects().network, 0)
  }
})
