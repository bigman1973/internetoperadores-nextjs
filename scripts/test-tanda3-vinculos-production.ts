import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test, { after, beforeEach } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import * as registry from '../lib/area4/section-registry'
import * as policy from '../lib/area4/policy'
import * as requestPolicy from '../lib/area4/request-policy'
import * as staging from '../lib/area4/crm-staging-import'
import * as production from '../lib/area4/crm-vinculos-production'
import * as gates from '../lib/area1-puertas-produccion'
import * as audit from '../lib/area4/audit'
import * as renderSurface from '../lib/admin-render-surface'
import * as highRisk from '../lib/high-risk-api-policy'
import * as alta from '../lib/altas/contrato-access'
import * as easyCore from '../lib/finanzas/easy-access-core'
import * as m365 from '../lib/m365-legacy-policy'
import * as importCore from '../lib/crm-isp-import-core'

// All actual proxy/handler/native helpers execute in a VM with memory-only I/O.
// Synthetic Railway password: NEVER connect. No process env changes; VM env only.
const API = production.AREA4_VINCULOS_BLOQUE_API, PAGE = production.AREA4_VINCULOS_BLOQUE_PAGE
const HASH = 'a'.repeat(64), ORIGIN = 'https://area4.example.test'
const PROD: Record<string, string | undefined> = {
  AREA4_OWNER_USER_ID: '3', VERCEL_ENV: 'production', AREA1_VINCULOS_BLOQUE_PRODUCCION: '1',
  DATABASE_URL: 'postgresql://postgres:synthetic@yamanote.proxy.rlwy.net:34880/railway',
  FINANCE_STAGING_SANDBOX: '0', FINANCE_DEPLOYMENT_READ_ONLY: '0', IO_PRODUCTION_READ_ONLY: '0',
  FINANCE_EXTERNAL_ACTIONS_DISABLED: '1', FINANCE_MODEL_PRODUCTION_ENABLED: '0',
  FINANCE_BACKGROUND_SYNC_ENABLED: '0', FINANCE_ONEDRIVE_SYNC_ENABLED: '0', FINANCE_ISP_SYNC_ENABLED: '0',
  AREA1_IMPORTACIONES_PRODUCCION: undefined,
}
let env: Record<string, string | undefined> = { ...PROD }
let principal: any, token: any, state: any, inTx = false
let dbFailure = false, auditFailure: 'none' | 'attempt' | 'inside' | 'always' = 'none', lateFailure = false
let businessReads = 0, mutations = 0, dispatches = 0, checks = 0, originalBodies = 0, ownerChecks = 0
let forbiddenIoAttempts = 0
const forbiddenIo = () => { forbiddenIoAttempts++; throw new Error('EXTERNAL_IO_FORBIDDEN') }
const entries: any[] = [], txOptions: any[] = [], caps: any[] = []
const match = (row: any, where: any = {}) => Object.entries(where).every(([key, value]: any) => {
  if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key])
  if (value && typeof value === 'object' && 'not' in value) return row[key] !== value.not
  return row[key] === value
})
function seed() {
  const rows: any[] = [], clients: any[] = [], companies: any[] = []
  for (let i = 1; i <= 3; i++) {
    clients.push({ id: `r${i}`, codigo: `C${i}`, nombre: `Synthetic ${i} SL`, docNormalizado: 'B00000001', crmEmpresaId: null, crmContactoId: null, clienteWebId: 100 + i, contracts: 2 })
    companies.push({ id: `e${i}`, nombre: i === 3 ? 'Different SL' : `SYNTHETIC ${i}, S.L.`, activo: true })
    rows.push({ id: `v${i}`, ispClienteRowId: `r${i}`, destinoId: `e${i}`, tipo: 'CRM_EMPRESA', confianza: 'ALTA', motivo: 'NIF', estado: 'PENDIENTE' })
  }
  return { rows, clients, companies, links: [] }
}
const client = (id: string) => state.clients.find((c: any) => c.id === id)
const database: any = {
  usuarioAdmin: { findUnique: async ({ where }: any) => {
    if (dbFailure) throw new Error('SYNTHETIC_DB_FAILURE')
    return principal && where.id === principal.id ? { ...principal, permisosArea4Vivos: false, permisos: [] } : null
  } },
  auditoriaPermisosArea4: { create: async ({ data }: any) => {
    if (auditFailure === 'always' || (auditFailure === 'inside' && inTx && data.operacion === 'CRM_IMPORTACION_ISP')
      || (auditFailure === 'attempt' && data.operacion === 'CONFIRMACION_SOLICITADA')) throw new Error('SYNTHETIC_AUDIT_FAILURE')
    entries.push(structuredClone(data)); return data
  } },
  ispVinculoArea1: {
    findMany: async ({ where }: any) => { businessReads++; return state.rows.filter((r: any) => match(r, where)).map((r: any) => ({ ...r, cliente: { ...client(r.ispClienteRowId), _count: { contratos: client(r.ispClienteRowId).contracts } } })) },
    groupBy: async ({ where }: any) => {
      businessReads++; const counts = new Map<string, number>()
      for (const r of state.rows.filter((r: any) => match(r, where))) counts.set(r.destinoId, (counts.get(r.destinoId) || 0) + 1)
      return [...counts].map(([destinoId, count]) => ({ destinoId, _count: { _all: count } }))
    },
    findUnique: async ({ where }: any) => { businessReads++; const row = state.rows.find((r: any) => r.id === where.id); return row ? { ...row, cliente: { ...client(row.ispClienteRowId) } } : null },
    update: async ({ where, data }: any) => {
      mutations++; if (lateFailure && where.id === 'v2') throw Object.assign(new Error('RAW_PRIVATE_EMAIL@fixture.invalid'), { code: 'P2034' })
      Object.assign(state.rows.find((r: any) => r.id === where.id), data); return {}
    },
    updateMany: async ({ where, data }: any) => { mutations++; const rows = state.rows.filter((r: any) => match(r, where)); rows.forEach((r: any) => Object.assign(r, data)); return { count: rows.length } },
  },
  ispClienteArea1: {
    count: async () => { businessReads++; return state.clients.length },
    update: async ({ where, data }: any) => { mutations++; Object.assign(client(where.id), data); return {} },
    findFirst: async () => null,
  },
  crmEmpresa: {
    findMany: async ({ where }: any) => { businessReads++; return state.companies.filter((r: any) => where.id.in.includes(r.id)) },
    findFirst: async ({ where }: any) => state.companies.find((r: any) => match(r, where)) || null,
    create: () => { throw new Error('CREATE_FICHA_FORBIDDEN') },
  },
  crmRegistroHubspot: { create: () => { throw new Error('CREATE_CONTACT_FORBIDDEN') } },
  crmEmpresaContacto: { create: () => { throw new Error('CREATE_CONTACT_LINK_FORBIDDEN') } },
  crmEmpresaCliente: {
    count: async ({ where }: any) => { businessReads++; return state.links.filter((r: any) => where.clienteId.in.includes(r.clienteId)).length },
    findUnique: async ({ where }: any) => state.links.find((r: any) => r.clienteId === where.clienteId) || null,
    create: async ({ data }: any) => { mutations++; state.links.push(data); return data },
  },
  $transaction: async (fn: any, options?: any) => {
    txOptions.push(options); const backup = structuredClone(state), count = entries.length; inTx = true
    try { return await fn(database) } catch (e) { state = backup; entries.length = count; throw e } finally { inTx = false }
  },
}
function load(file: string, extra = '') {
  const module: any = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: resolve,
    process: { get env() { return env } }, console: { error() {}, info() {}, warn() {} },
    Headers, URL, URLSearchParams, performance, TextDecoder, TextEncoder, Request, Response, FormData, Blob,
    ReadableStream, Buffer, Uint8Array, ArrayBuffer, JSON, atob, Date, Set, Map, fetch: forbiddenIo }, { filename: file })
  return module.exports
}
const shared: Record<string, any> = {
  'next/server': { NextRequest, NextResponse }, 'next-auth/jwt': { getToken: async () => token },
  'next-auth': { getServerSession: async () => token ? { user: { ...token }, impersonation: token.impersonation } : null },
  '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { default: database },
  '@/lib/area4/section-registry': registry, './section-registry': registry,
  '@/lib/area4/policy': { ...policy, isArea4Owner: (p: any) => policy.isArea4Owner(p, env),
    evaluateArea4Capability: (input: any) => { caps.push(input.capability); return policy.evaluateArea4Capability({ ...input, ownerId: policy.configuredArea4OwnerId(env) }) } },
  '@/lib/area4/audit': audit, './audit': audit,
  '@/lib/area4/request-policy': requestPolicy,
  '@/lib/area4/crm-staging-import': staging,
  '@/lib/area4/crm-vinculos-production': { ...production, area4VinculosBloqueProductionEnabled: () => production.area4VinculosBloqueProductionEnabled(env) },
  '@/lib/area1-puertas-produccion': { ...gates, importacionesCrmCerradas: () => gates.importacionesCrmCerradas(env) },
  './lib/admin-render-surface': renderSurface, './lib/high-risk-api-policy': highRisk,
  './lib/altas/contrato-access': alta, './lib/m365-legacy-policy': m365,
  './lib/finanzas/conciliar-runtime': { conciliarRuntimeConfigured: () => null },
  '@/lib/impersonation': { readImpersonationClaims: () => null },
  '@/lib/area1-m365': { bloqueoActuacion: (s: any) => s?.impersonation != null ? 'No disponible durante actuación' : null },
  '@/lib/area4/surface-access': { readArea4SurfaceAccessUser: async () => null },
  '@/lib/finanzas/easy-access-profile': { isEasyOnlyFinanceUser: async () => false }, '@/lib/finanzas/easy-access-core': easyCore,
  'node:crypto': { randomUUID, createHash }, '@/lib/crm-isp-import-core': importCore,
  '@/lib/brevo-config': { getBrevoApiKey: forbiddenIo },
  '@/lib/brevo-fetch': { brevoFetch: forbiddenIo },
}
function resolve(name: string) { if (!(name in shared)) throw new Error(`UNEXPECTED_DEPENDENCY ${name}`); return shared[name] }
shared['./policy'] = shared['@/lib/area4/policy']
shared['@/lib/area4/live-admin'] = load('lib/area4/live-admin.ts')
shared['@/lib/area1-import-recibo'] = load('lib/area1-import-recibo.ts')
const realOwner = shared['@/lib/area1-import-recibo'].propietarioImportacion
shared['@/lib/area1-import-recibo'].propietarioImportacion = (...args: any[]) => { ownerChecks++; return realOwner(...args) }
shared['@/lib/crm-isp-auth'] = load('lib/crm-isp-auth.ts')
shared['@/lib/crm-isp-import'] = load('lib/crm-isp-import.ts')
shared['@/lib/area1-isp-bloque'] = load('lib/area1-isp-bloque.ts')
const handler = load('app/api/admin/crm/isp/vinculos/bloque/route.ts')
const manualHandler = load('app/api/admin/crm/isp/vinculos/route.ts')
const proxy = load('proxy.js', '\nmodule.exports.boundary = area4RegisteredAdminApiBoundary;')

// Adjacent M365 APIs retain their own native gate (not an import exception).
const nativeM365 = load('lib/area1-m365.ts')
shared['@/lib/area1-m365'] = nativeM365
const forbiddenProvider = forbiddenIo
shared['openai'] = { default: forbiddenProvider }
shared['@prisma/client'] = { Prisma: {} }
shared['@/lib/permisos'] = { verificarPermisoServer: forbiddenProvider }
shared['@/lib/outlook-user-connection'] = { getOutlookUserAccessToken: forbiddenProvider }
shared['@/lib/area1-m365-graph'] = { leerEventoOutlook: forbiddenProvider, leerHiloCorreo: forbiddenProvider }
shared['@/lib/area1-m365-borrador'] = { cargarContextoBorrador: forbiddenProvider, generarBorrador: forbiddenProvider, limpiarPeticion: forbiddenProvider }
const m365DraftHandler = load('app/api/admin/crm/contactos/[id]/m365/borrador/route.ts')
const m365ActivityHandler = load('app/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365/route.ts')

shared['react/jsx-runtime'] = jsxRuntime
shared['next/link'] = { default: 'a' }
shared['next/navigation'] = { notFound: () => { throw new Error('SYNTHETIC_NOT_FOUND') } }
shared['@heroicons/react/24/outline'] = { ArrowLeftIcon: 'span' }
shared['@/lib/middleware/auth'] = { requireAuth: forbiddenProvider }
shared['@/components/admin/CrmIspImportPanel'] = { default: forbiddenProvider }
shared['@/components/admin/CrmIspVinculosBloquePanel'] = { default: 'section' }
const dedicatedPage = load('app/admin/crm/isp/vinculos-bloque/page.tsx')
const oldPage = load('app/admin/crm/isp/page.tsx')
let hookValues: any[] = [], hookIndex = 0
shared['react'] = { useState: (initial: any) => [hookValues[hookIndex++] ?? initial, () => undefined] }
const panel = load('components/admin/CrmIspVinculosBloquePanel.tsx')

beforeEach(() => {
  env = { ...PROD }; principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [], email: 'owner@fixture.invalid' }
  token = { id: '3', userType: 'admin' }; state = seed(); inTx = false; dbFailure = false; auditFailure = 'none'; lateFailure = false
  businessReads = 0; mutations = 0; ownerChecks = 0; entries.length = 0; txOptions.length = 0; caps.length = 0
})
after(() => {
  assert.equal(forbiddenIoAttempts, 0)
  console.log(JSON.stringify({ checks, dispatches, originalBodies, actualProxy: true, actualBlockHandler: true,
    actualNativeBlock: true, actualNativeResolver: true, memoryOnly: true, forbiddenIoAttempts,
    networkRequests: 0, databaseConnections: 0, realEnvModified: false, productionOpened: false }))
})
function req(path = API, body?: unknown, options: { raw?: boolean; method?: string; headers?: Record<string, string>; bytes?: Uint8Array; url?: string } = {}) {
  const method = options.method ?? (body === undefined ? 'GET' : 'POST')
  const bytes = options.bytes ?? (body === undefined ? undefined : Buffer.from(options.raw ? String(body) : JSON.stringify(body)))
  return new NextRequest(options.url ?? `${ORIGIN}${path}`, { method,
    headers: { origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...options.headers },
    ...(bytes ? { body: new Uint8Array(bytes) } : {}) })
}
function withoutOrigin(request = req()) { request.headers.delete('origin'); return request }
const block = (hashEsperado = HASH) => ({ confirmacion: 'CONFIRMAR_BLOQUE', hashEsperado })
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('CLONE_TIMEOUT')), 3000) })]) }
  finally { if (timer) clearTimeout(timer) }
}
function denied(r: NextResponse | null, status: number) { assert.ok(r); assert.equal(r.status, status); assert.notEqual(r.headers.get('x-middleware-next'), '1') }
function continued(r: NextResponse | null) { assert.ok(r); assert.equal(r.headers.get('x-middleware-next'), '1') }
async function boundary(request: NextRequest, full = true) {
  const copy = request.body ? Buffer.from(await request.clone().arrayBuffer()) : null
  const response = await bounded<NextResponse | null>(full ? proxy.proxy(request) : proxy.boundary(request))
  assert.equal(request.bodyUsed, false)
  if (copy) { assert.deepEqual(Buffer.from(await request.clone().arrayBuffer()), copy); originalBodies++ }
  checks++; if (response?.headers.get('x-middleware-next') === '1') dispatches++
  return response
}
async function native(request: NextRequest) { return await bounded<NextResponse>(request.method === 'GET' ? handler.GET(request) : handler.POST(request)) }
function attempt() {
  const entry = entries[0]; assert.equal(entry.operacion, 'CONFIRMACION_SOLICITADA'); assert.equal(entry.actorId, 3)
  assert.equal(entry.origen, API); assert.deepEqual(entry.despues, { fase: 'ANTES_DEL_HANDLER', resultado: 'INTENTO', metodo: 'POST', capacidad: 'confirmar' })
  assert.doesNotMatch(JSON.stringify(entry), /hashEsperado|CONFIRMAR_BLOQUE|owner@|EXITO|v1/)
}

test('new gate is literal 1 default off; exact Railway runtime; no dependency on general import flag', () => {
  assert.equal(gates.vinculosBloqueProduccionHabilitado({ VERCEL_ENV: 'production' }), false)
  for (const value of [undefined, '', '0', 'true', ' 1', '1 ', '01']) assert.equal(production.area4VinculosBloqueProductionEnabled({ ...PROD, AREA1_VINCULOS_BLOQUE_PRODUCCION: value }), false)
  assert.equal(production.area4VinculosBloqueProductionEnabled(PROD), true)
  assert.equal(gates.importacionesCrmCerradas(PROD), true)
  for (const changes of [{ VERCEL_ENV: 'preview' }, { VERCEL_ENV: undefined }, { FINANCE_STAGING_SANDBOX: '1' },
    { FINANCE_DEPLOYMENT_READ_ONLY: '1' }, { IO_PRODUCTION_READ_ONLY: '1' }, { DATABASE_URL: undefined }, { DATABASE_URL: 'bad' },
    { DATABASE_URL: 'postgresql://postgres:x@other.invalid:34880/railway' }, { DATABASE_URL: PROD.DATABASE_URL!.replace('34880', '34881') },
    { DATABASE_URL: PROD.DATABASE_URL!.replace('/railway', '/railway/') }, { DATABASE_URL: PROD.DATABASE_URL!.replace('postgres:', 'io_staging_finanzas:') },
    { DATABASE_URL: 'https://postgres:x@yamanote.proxy.rlwy.net:34880/railway' }, { DATABASE_URL: 'postgresql://%ZZ:x@yamanote.proxy.rlwy.net:34880/railway' }]) {
    assert.equal(production.area4VinculosBloqueProductionEnabled({ ...PROD, ...changes }), false)
  }
})
test('registry NEW page and block V/C; historical 439/79 digests unchanged, no menu or rebaseline', () => {
  const matches = registry.area4RegistrySurfaceMatches()
  const historic = matches.filter(m => m.surface.baselineDescriptor !== undefined)
  const digest = (values: any[]) => createHash('sha256').update(JSON.stringify(values.sort())).digest('hex')
  assert.equal(historic.length, 439); assert.equal(registry.AREA4_SECTION_REGISTRY.length, 79)
  assert.equal(digest(historic.map(m => m.surface.baselineDescriptor)), registry.AREA4_BASELINE_DESCRIPTORS_SHA256)
  assert.equal(digest(registry.AREA4_SECTION_REGISTRY.map(s => s.baselineIdentity)), registry.AREA4_BASELINE_IDENTITIES_SHA256)
  for (const path of [API, PAGE]) { const m = registry.area4RegisteredSurface(path, path === API ? 'api' : 'page')!; assert.equal(m.baseline, false); assert.equal(m.section.key, 'crm-isp'); assert.deepEqual(m.surface.actions, ['V', 'C']) }
  assert.equal(registry.area4RegisteredSurface(PAGE, 'page')!.surface.menu, undefined)
})
test('Production GET requires live canonical owner V only, no mutations/audit; POST V/C INTENTO before native RESULT', async () => {
  const get = req(); continued(await boundary(get)); assert.deepEqual(caps, ['lectura'])
  const before = structuredClone(state), sim = await (await native(get)).json()
  assert.equal(sim.vinculos, 2); assert.equal(sim.prerrequisito, null); assert.deepEqual(state, before)
  assert.equal(entries.length, 0); assert.equal(mutations, 0); assert.equal(ownerChecks, 1)
  caps.length = 0
  const post = req(API, block(sim.hash)); continued(await boundary(post)); assert.deepEqual(caps, ['lectura', 'confirmar']); attempt()
  const result = await native(post); assert.equal(result.status, 200); assert.equal((await result.json()).vinculos, 2)
  assert.equal(entries.length, 2); const receipt = entries[1]
  assert.equal(receipt.operacion, 'CRM_IMPORTACION_ISP'); assert.equal(receipt.origen, 'crm.isp.vinculos.bloque')
  assert.equal(receipt.despues.resultado, 'EXITO'); assert.equal(receipt.despues.hash, sim.hash); assert.equal(receipt.despues.conteos.vinculosEmpresa.actualizados, 2)
  assert.deepEqual(state.rows.map((r: any) => r.estado), ['CONFIRMADO', 'CONFIRMADO', 'PENDIENTE'])
  assert.equal(state.links.length, 2); assert.equal(txOptions.at(-1).timeout, 60000); assert.equal(txOptions.at(-1).maxWait, 10000)
  assert.doesNotMatch(JSON.stringify(receipt), /Synthetic|B00000001|owner@|RAW_PRIVATE/)
})
test('native browser-shaped GET without Origin passes full proxy plus real handler; only V, no write/audit/provider', async () => {
  const get = withoutOrigin(), before = structuredClone(state)
  assert.equal(get.method, 'GET'); assert.equal(get.headers.has('origin'), false); assert.equal(get.body, null)
  assert.equal(get.headers.get('sec-fetch-site'), 'same-origin')
  continued(await boundary(get)); assert.deepEqual(caps, ['lectura'])
  const response = await native(get); assert.equal(response.status, 200)
  const sim = await response.json(); assert.equal(sim.vinculos, 2); assert.equal(sim.prerrequisito, null)
  assert.equal(ownerChecks, 1); assert.ok(businessReads > 0)
  assert.deepEqual(state, before); assert.equal(mutations, 0); assert.equal(entries.length, 0); assert.equal(txOptions.length, 0)
  assert.equal(forbiddenIoAttempts, 0)
})
test('no master in Production => SIN_MAESTRO and zero; empty confirmation remains native 409 with no mutation/RESULT', async () => {
  state.rows = []; state.clients = []
  const get = req(); continued(await boundary(get)); const sim = await (await native(get)).json()
  assert.equal(sim.prerrequisito, 'SIN_MAESTRO'); assert.equal(sim.vinculos, 0); assert.equal(sim.contratos, 0); assert.equal(entries.length, 0)
  const post = req(API, block(sim.hash)); continued(await boundary(post)); attempt()
  const response = await native(post); assert.equal(response.status, 409); assert.equal((await response.json()).codigo, 'BLOQUE_VACIO')
  assert.equal(mutations, 0); assert.equal(entries.length, 1)
})
test('changed hash => native 409; no result receipt or writes; no Stage hash authority', async () => {
  const sim = await (await native(req())).json(); state.clients[0].clienteWebId = 999
  const post = req(API, block(sim.hash)); continued(await boundary(post)); const response = await native(post)
  assert.equal(response.status, 409); assert.equal((await response.json()).codigo, 'HASH_DISTINTO'); assert.equal(mutations, 0); assert.equal(entries.length, 1)
})
test('GET/POST runtime/DSN/readonly guards dominate proxy and direct handler with zero business reads', async () => {
  for (const change of [{ AREA1_VINCULOS_BLOQUE_PRODUCCION: undefined }, { AREA1_VINCULOS_BLOQUE_PRODUCCION: '0' }, { AREA1_VINCULOS_BLOQUE_PRODUCCION: 'true' },
    { DATABASE_URL: undefined }, { DATABASE_URL: 'bad' }, { DATABASE_URL: PROD.DATABASE_URL!.replace('railway', 'other') },
    { FINANCE_STAGING_SANDBOX: '1' }, { FINANCE_DEPLOYMENT_READ_ONLY: '1' }, { IO_PRODUCTION_READ_ONLY: '1' }]) {
    env = { ...PROD, ...change }
    for (const body of [undefined, block()]) {
      const request = req(API, body); const response = await boundary(request)
      assert.ok(response); assert.notEqual(response.headers.get('x-middleware-next'), '1')
      denied(await native(request), 404)
    }
    const nativeGet = withoutOrigin(); const response = await boundary(nativeGet)
    assert.ok(response); assert.notEqual(response.headers.get('x-middleware-next'), '1'); denied(await native(nativeGet), 404)
  }
  assert.equal(businessReads, 0); assert.equal(mutations, 0); assert.equal(entries.length, 0)
})
test('session, live activity, principal SA (not secondary), canonical owner, acting all fail closed GET/POST', async () => {
  const variants: [() => void, number][] = [
    [() => { token = null }, 401], [() => { token.userType = 'empleado' }, 401], [() => { token.id = 'bad' }, 401],
    [() => { principal = null }, 401], [() => { principal.activo = false }, 401], [() => { principal.rol = 'GERENTE' }, 403],
    [() => { principal.rol = 'VISOR'; principal.roles = ['SUPER_ADMIN'] }, 403], [() => { principal.id = 4; token.id = '4' }, 403],
    [() => { env.AREA4_OWNER_USER_ID = '4' }, 403], [() => { env.AREA4_OWNER_USER_ID = '-3' }, 403],
    [() => { token.impersonation = {} }, 403], [() => { token.impersonation = { actorId: '3', targetId: '3' } }, 403],
    [() => { token.impersonation = false }, 403], [() => { token.impersonation = 0 }, 403], [() => { token.impersonation = '' }, 403],
  ]
  for (const [change, status] of variants) for (const mode of ['GET', 'GET_NO_ORIGIN', 'POST']) {
    env = { ...PROD }; principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [], email: 'owner@fixture.invalid' }; token = { id: '3', userType: 'admin' }
    change(); const request = req(API, mode === 'POST' ? block() : undefined)
    if (mode === 'GET_NO_ORIGIN') withoutOrigin(request)
    denied(await boundary(request), status); denied(await native(request), status)
  }
  assert.equal(businessReads, 0); assert.equal(mutations, 0); assert.equal(entries.length, 0)
})
test('present wrong/null/empty/whitespace Origin rejects GET/POST, never rescued by same-origin Sec-Fetch', async () => {
  for (const headers of [{ origin: '' }, { origin: ' ' }, { origin: 'null' }, { origin: `${ORIGIN}/` },
    { origin: 'https://sibling.example.test' }, { origin: 'https://area4.example.test:444' },
    { origin: 'HTTPS://area4.example.test' }, { origin: `${ORIGIN}, ${ORIGIN}` }]) for (const body of [undefined, block()]) {
    const request = req(API, body, { headers }); denied(await boundary(request), 403); denied(await native(request), 403)
  }
  // Fetch Headers trim transport OWS; expose raw values explicitly to prove the
  // policy itself never trims a present Origin or Sec-Fetch value into authority.
  for (const rawOrigin of [` ${ORIGIN}`, `${ORIGIN} `, `\t${ORIGIN}\t`]) for (const body of [undefined, block()]) {
    const request = req(API, body), get = request.headers.get.bind(request.headers)
    request.headers.get = (name: string) => name.toLowerCase() === 'origin' ? rawOrigin : get(name)
    denied(await boundary(request), 403); denied(await native(request), 403)
  }
  assert.equal(businessReads, 0); assert.equal(entries.length, 0); assert.equal(mutations, 0)
})
test('Origin omission is GET-only; POST absent remains403; HTTPS and exact Sec-Fetch are mandatory for all modes', async () => {
  const absentPost = withoutOrigin(req(API, block()))
  denied(await boundary(absentPost), 403); denied(await native(absentPost), 403)
  for (const mode of ['GET', 'GET_NO_ORIGIN', 'POST']) {
    for (const site of [undefined, '', 'same-site', 'cross-site', 'none', 'Same-Origin', 'same-origin, same-origin']) {
      const request = req(API, mode === 'POST' ? block() : undefined)
      if (mode === 'GET_NO_ORIGIN') withoutOrigin(request)
      if (site === undefined) request.headers.delete('sec-fetch-site'); else request.headers.set('sec-fetch-site', site)
      denied(await boundary(request), 403); denied(await native(request), 403)
    }
    for (const rawSite of [' same-origin', 'same-origin ', '\tsame-origin\t']) {
      const request = req(API, mode === 'POST' ? block() : undefined), get = request.headers.get.bind(request.headers)
      if (mode === 'GET_NO_ORIGIN') withoutOrigin(request)
      request.headers.get = (name: string) => name.toLowerCase() === 'sec-fetch-site' ? rawSite : get(name)
      denied(await boundary(request), 403); denied(await native(request), 403)
    }
    const request = req(API, mode === 'POST' ? block() : undefined, { url: `http://area4.example.test${API}`, headers: { origin: 'http://area4.example.test' } })
    if (mode === 'GET_NO_ORIGIN') withoutOrigin(request)
    denied(await boundary(request), 403); denied(await native(request), 403)
  }
  for (const url of ['ftp://area4.example.test', 'http://area4.example.test', 'not-a-url']) {
    const request = { url: `${url}${API}`, method: 'GET', body: null, headers: new Headers({ 'sec-fetch-site': 'same-origin' }) } as Request
    assert.equal(production.area4VinculosBloqueProductionOriginAllowed(request), false)
  }
  assert.equal(businessReads, 0); assert.equal(entries.length, 0); assert.equal(mutations, 0)
})
test('absent Origin GET cannot authorize selectors, server actions, body-on-read, document or neighboring/method surfaces', async () => {
  for (const suffix of ['?ids=v1', '?action=simular', '?foo=1']) {
    const request = withoutOrigin(req(`${API}${suffix}`))
    denied(await boundary(request), 404); denied(await native(request), 404)
    assert.equal(production.area4VinculosBloqueProductionOriginAllowed(request), false)
  }
  const action = withoutOrigin(req(API, undefined, { headers: { 'next-action': 'forged' } }))
  denied(await boundary(action), 404); denied(await native(action), 404)
  const bodyGet = withoutOrigin()
  Object.defineProperty(bodyGet, 'body', { value: new ReadableStream({ start(c) { c.close() } }) })
  denied(await boundary(bodyGet), 404); denied(await native(bodyGet), 404)
  for (const path of [PAGE, `${API}/`, `${API}/simular`, '/api/admin/crm/isp/vinculos', '/api/admin/crm/isp/importar']) {
    assert.equal(production.area4VinculosBloqueProductionOriginAllowed(withoutOrigin(req(path))), false)
  }
  for (const method of ['HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(production.area4VinculosBloqueProductionOriginAllowed(withoutOrigin(req(API, undefined, { method }))), false)
  }
  assert.equal(businessReads, 0); assert.equal(entries.length, 0); assert.equal(mutations, 0)
})
test('closed reader shared by proxy and handler: literal confirmation/hash, extras, duplicates, escaped keys, BOM, UTF8', async () => {
  const bad = [null, {}, [], true, { confirmacion: 'CONFIRMAR_BLOQUE' }, { hashEsperado: HASH }, { ...block(), extra: 1 },
    { ...block(), ids: ['v1'] }, { ...block(), confirmacion: true }, { ...block(), confirmacion: 'simular' }, block('A'.repeat(64)), block('a'.repeat(63)), block('g'.repeat(64))]
  for (const body of bad) { const request = req(API, body); denied(await boundary(request), 400); denied(await native(request), 400) }
  for (const raw of [`{"confirmacion":"bad","confirmacion":"CONFIRMAR_BLOQUE","hashEsperado":"${HASH}"}`,
    `{"confirmacion":"CONFIRMAR_BLOQUE","hashEsperado":"${HASH}","hashEsperado":"${HASH}"}`,
    `{"\\u0063onfirmacion":"CONFIRMAR_BLOQUE","hashEsperado":"${HASH}"}`, `\ufeff${JSON.stringify(block())}`, '{bad']) {
    const request = req(API, raw, { raw: true }); denied(await boundary(request), 400); denied(await native(request), 400)
  }
  const badUtf8 = req(API, block(), { bytes: new Uint8Array([0xc3, 0x28]) }); denied(await boundary(badUtf8), 400); denied(await native(badUtf8), 400)
  assert.equal(businessReads, 0); assert.equal(entries.length, 0)
})
test('16384 actual/declared/streamed bounds; 415 type; original body remains intact', async () => {
  const text = JSON.stringify(block()), exact = text + ' '.repeat(16384 - Buffer.byteLength(text))
  continued(await boundary(req(API, exact, { raw: true }))); entries.length = 0
  for (const request of [req(API, exact + ' ', { raw: true }), ...['', '-1', 'bad', '16385'].map(length => req(API, block(), { headers: { 'content-length': length } }))]) {
    denied(await boundary(request), 400); denied(await native(request), 400)
  }
  const wrongType = req(API, block(), { headers: { 'content-type': 'text/plain' } }); denied(await boundary(wrongType), 415); denied(await native(wrongType), 415)
  const stream = new Request(`${ORIGIN}${API}`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: new ReadableStream({ start(c) { c.enqueue(Buffer.from(exact)); c.enqueue(Buffer.from(' ')); c.close() } }), duplex: 'half' } as any)
  assert.equal((await bounded(staging.readArea4IspVinculosBloqueStagingCommand(stream, 16384))).errorStatus, 400)
  assert.equal(stream.bodyUsed, false); assert.equal((await stream.arrayBuffer()).byteLength, 16385)
  assert.equal(entries.length, 0)
})
test('neighbors/manual/ISP Aplicar/HubSpot remain closed; gate does not open general imports, wrong methods or selectors', async () => {
  for (const path of ['/api/admin/crm/isp/importar', '/api/admin/crm/hubspot/historial', '/api/admin/crm/isp/vinculos',
    `${API}/`, `${API}/simular`, `${API}/vecina`, API.replace('/isp/', '/ISP/'), API.replace('vinculos', '%76inculos'),
    '/api/admin/crm/mail', '/api/admin/crm/sync']) {
    assert.equal(production.area4VinculosBloqueProductionSurface(req(path, block())), null)
    const response = await boundary(req(path, block())); assert.ok(response); assert.notEqual(response.headers.get('x-middleware-next'), '1', path)
  }
  for (const path of ['/api/admin/crm/contactos/x/m365/borrador', '/api/admin/crm/contactos/x/actividades/y/m365']) {
    assert.equal(production.area4VinculosBloqueProductionSurface(req(path, block())), null)
    assert.equal(staging.area4CrmStagingImportContract(path, 'POST'), null)
  }
  const ctx = { params: Promise.resolve({ id: 'x', actividadId: 'y' }) }
  assert.equal((await m365DraftHandler.GET(req('/api/admin/crm/contactos/x/m365/borrador'), ctx)).status, 404)
  for (const method of ['GET', 'POST']) assert.equal((await m365ActivityHandler[method](req('/api/admin/crm/contactos/x/actividades/y/m365', method === 'POST' ? block() : undefined), ctx)).status, 404)
  assert.equal(nativeM365.m365Habilitado(env), false)
  for (const method of ['PUT', 'PATCH', 'DELETE']) { denied(await boundary(req(API, block(), { method })), 404) }
  for (const suffix of ['?ids=v1', '?action=simular', '?foo=1']) for (const body of [undefined, block()]) {
    const request = req(`${API}${suffix}`, body); denied(await boundary(request), 404); denied(await native(request), 404)
  }
  const serverAction = req(API, block(), { headers: { 'next-action': 'forged' } }); denied(await boundary(serverAction), 404)
  assert.equal((await manualHandler.POST(req('/api/admin/crm/isp/vinculos', { accion: 'CONFIRMAR', ids: ['v1'] }))).status, 404)
  assert.equal(gates.importacionesCrmCerradas(env), true); assert.equal(businessReads, 0); assert.equal(mutations, 0); assert.equal(entries.length, 0)
})
test('DB or pre-handler INTENTO failure denies without native dispatch, mutations or result', async () => {
  dbFailure = true; denied(await boundary(req()), 503); denied(await boundary(withoutOrigin()), 503); denied(await boundary(req(API, block())), 503)
  dbFailure = false; auditFailure = 'attempt'; denied(await boundary(req(API, block())), 503)
  assert.equal(businessReads, 0); assert.equal(mutations, 0); assert.equal(entries.length, 0)
})
test('native late failure or receipt failure rolls back block; safe ERROR receipt only, no fictitious success', async () => {
  for (const failure of ['late', 'inside', 'always']) {
    state = seed(); entries.length = 0; auditFailure = 'none'; lateFailure = false
    const sim = await (await native(req())).json(), before = structuredClone(state), post = req(API, block(sim.hash))
    continued(await boundary(post)); attempt()
    if (failure === 'late') lateFailure = true; else auditFailure = failure as 'inside' | 'always'
    const response = await native(post); assert.equal(response.status, 500); assert.deepEqual(state, before)
    const body = await response.json(); assert.equal(body.codigo, failure === 'always' ? 'NO_AUDITADO' : 'REVERTIDO')
    assert.equal(entries.length, failure === 'always' ? 1 : 2)
    if (failure !== 'always') { const receipt = entries[1]; assert.equal(receipt.despues.resultado, 'ERROR'); assert.equal(receipt.despues.conteos.vinculosEmpresa.actualizados, 0); assert.doesNotMatch(JSON.stringify(receipt), /RAW_PRIVATE|fixture.invalid/) }
  }
})
test('staging opening remains native; general import flag cannot substitute for new block gate in Production', async () => {
  env = { ...PROD, AREA1_VINCULOS_BLOQUE_PRODUCCION: undefined, FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'staging', DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@127.0.0.1:1/io_staging_finanzas' }
  continued(await boundary(req(API, block()))); assert.equal(entries.length, 1)
  const sim = await (await native(req())).json(); assert.equal(sim.vinculos, 2); assert.equal(sim.prerrequisito, undefined)
  env = { ...PROD, AREA1_VINCULOS_BLOQUE_PRODUCCION: undefined, AREA1_IMPORTACIONES_PRODUCCION: '1' }
  denied(await boundary(req(API, block())), 403); denied(await native(req(API, block())), 404)
})
test('dedicated page gate/owner and old page Production404; UI isolated zero guard and no imported Stage hash or IDs', async () => {
  const pageSource = readFileSync('app/admin/crm/isp/vinculos-bloque/page.tsx', 'utf8')
  const panelSource = readFileSync('components/admin/CrmIspVinculosBloquePanel.tsx', 'utf8')
  assert.match(pageSource, /requireArea4Owner\(prisma\)/); assert.match(pageSource, /area4VinculosBloqueProductionEnabled\(\)/)
  assert.doesNotMatch(pageSource + panelSource, /CrmIspImportPanel|\/isp\/importar|hubspot\/historial|rebaseline|localStorage|sessionStorage/)
  assert.match(panelSource, /simulacion\.vinculos > 0/); assert.match(panelSource, /prerrequisito !== 'SIN_MAESTRO'/)
  assert.match(panelSource, /SIN_MAESTRO/); assert.match(panelSource, /BLOQUE_VACIO/); assert.match(panelSource, /hashEsperado = simulacion.hash/)
  assert.doesNotMatch(panelSource, /\b48\b|\b46\b/)
  continued(await boundary(req(PAGE))); assert.equal(businessReads, 0); assert.equal(entries.length, 0)
  env.AREA1_VINCULOS_BLOQUE_PRODUCCION = undefined; denied(await boundary(req(PAGE)), 403)
  assert.equal(gates.importacionesCrmCerradas(env), true)
  assert.match(readFileSync('app/admin/crm/isp/page.tsx', 'utf8'), /if \(importacionesCrmCerradas\(\)\) notFound\(\)/)
})

test('actual SSR pages: new owner only, defaultoff/readonly/noacting; old import still404 before auth', async () => {
  const element = await dedicatedPage.default(); assert.match(renderToStaticMarkup(element), /Simular Production/)
  await assert.rejects(oldPage.default(), /SYNTHETIC_NOT_FOUND/)
  for (const change of [{ AREA1_VINCULOS_BLOQUE_PRODUCCION: undefined }, { IO_PRODUCTION_READ_ONLY: '1' }, { FINANCE_DEPLOYMENT_READ_ONLY: '1' }]) {
    env = { ...PROD, ...change }; await assert.rejects(dedicatedPage.default(), /SYNTHETIC_NOT_FOUND/)
  }
  env = { ...PROD }; token.impersonation = {}; await assert.rejects(dedicatedPage.default(), /SYNTHETIC_NOT_FOUND/)
  token.impersonation = false; await assert.rejects(dedicatedPage.default(), /SYNTHETIC_NOT_FOUND/)
  token.impersonation = undefined; principal.rol = 'GERENTE'; await assert.rejects(dedicatedPage.default(), /SYNTHETIC_NOT_FOUND/)
  assert.equal(businessReads, 0); assert.equal(mutations, 0); assert.equal(entries.length, 0)
})

test('actual component SSR: SIN_MAESTRO or zero disable confirmation even with checked review and literal phrase', () => {
  for (const simulation of [{ hash: HASH, vinculos: 0, prerrequisito: 'SIN_MAESTRO' }, { hash: HASH, vinculos: 0, prerrequisito: null }, { hash: HASH, vinculos: 2, prerrequisito: 'SIN_MAESTRO' }]) {
    hookIndex = 0; hookValues = [{ empresas: 0, enlacesClienteWeb: 0, contratos: 0, fichasNuevas: 0,
      excluidos: { total: 0, NOMBRE_DISTINTO: 0, EMPRESA_COMPARTIDA: 0, EMPRESA_INACTIVA: 0, CLIENTE_YA_CON_EMPRESA: 0 }, ...simulation }, null, false, true, 'CONFIRMAR_BLOQUE', '']
    const html = renderToStaticMarkup(panel.default({ production: true }))
    assert.match(html, /<button[^>]*disabled=""[^>]*>Víctor: confirmar bloque revisado<\/button>/)
    if (simulation.prerrequisito === 'SIN_MAESTRO') assert.match(html, /SIN_MAESTRO/)
    if (simulation.vinculos === 0) assert.match(html, /BLOQUE_VACIO/)
  }
})
