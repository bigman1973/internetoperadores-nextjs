import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test, { after, beforeEach } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as registry from '../lib/area4/section-registry'
import * as policy from '../lib/area4/policy'
import * as requestPolicy from '../lib/area4/request-policy'
import * as imports from '../lib/area4/crm-staging-import'
import * as audit from '../lib/area4/audit'
import * as renderSurface from '../lib/admin-render-surface'
import * as highRisk from '../lib/high-risk-api-policy'
import * as alta from '../lib/altas/contrato-access'
import * as easyCore from '../lib/finanzas/easy-access-core'
import * as m365 from '../lib/m365-legacy-policy'
import * as importCore from '../lib/crm-isp-import-core'

// Actual proxy, native live-owner/auth helpers, native manual resolver and handler.
// Every I/O is synthetic and unexpected dependencies throw; no HTTP/network/DB.
const MANUAL = '/api/admin/crm/isp/vinculos'
const BLOCK = `${MANUAL}/bloque`
const HASH = 'a'.repeat(64)
const STAGE: Record<string, string | undefined> = {
  AREA4_OWNER_USER_ID: '3', FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'staging', DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@127.0.0.1:1/io_staging_finanzas',
  FINANCE_DEPLOYMENT_READ_ONLY: '0', IO_PRODUCTION_READ_ONLY: '0', FINANCE_EXTERNAL_ACTIONS_DISABLED: '1',
  FINANCE_BACKGROUND_SYNC_ENABLED: '0', FINANCE_ONEDRIVE_SYNC_ENABLED: '0', FINANCE_ISP_SYNC_ENABLED: '0', FINANCE_MODEL_PRODUCTION_ENABLED: '0',
}
const saved = Object.fromEntries(Object.keys(STAGE).map(k => [k, process.env[k]]))
function environment(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...STAGE, ...overrides })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value
  }
}
let principal: any, token: any, state: any
let auditFailure: 'none' | 'inside' | 'always' = 'none'
let databaseFailure = false, lateFailure = false, easyOnly = false
let inTx = false, ownerAuthCalls = 0, middlewareDispatches = 0, checks = 0, originalBodies = 0
let nativeResolutionReads = 0
const entries: any[] = [], commands: any[] = [], txOptions: any[] = []
const database: any = {
  usuarioAdmin: { findUnique: async ({ where }: any) => {
    if (databaseFailure) throw new Error('SYNTHETIC_DATABASE_FAILURE')
    return principal && where.id === principal.id ? { ...principal, permisosArea4Vivos: false, permisos: [] } : null
  } },
  auditoriaPermisosArea4: { create: async ({ data }: any) => {
    if (auditFailure === 'always' || (auditFailure === 'inside' && inTx)) throw new Error('SYNTHETIC_AUDIT_FAILURE')
    entries.push(structuredClone(data)); return data
  } },
  ispVinculoArea1: {
    findUnique: async ({ where }: any) => { nativeResolutionReads++; const row = state.rows.find((r: any) => r.id === where.id); return row ? { ...row, cliente: { ...state.client } } : null },
    update: async ({ where, data }: any) => {
      if (lateFailure) throw new Error('RAW_PRIVATE_PERSON@fixture.test')
      Object.assign(state.rows.find((r: any) => r.id === where.id), data); return {}
    },
    updateMany: async () => ({ count: 0 }),
  },
  ispClienteArea1: { update: async ({ data }: any) => { Object.assign(state.client, data); return {} } },
  crmRegistroHubspot: { create: async () => { state.created++; return { id: 'synthetic-contact' } } },
  $transaction: async (fn: any, options?: any) => {
    txOptions.push(options); const backup = structuredClone(state), auditCount = entries.length; inTx = true
    try { return await fn(database) } catch (e) { state = backup; entries.length = auditCount; throw e } finally { inTx = false }
  },
}
function load(file: string, extra: string, resolve: (name: string) => any) {
  const module: any = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    module, exports: module.exports, require: resolve, process: { env: process.env },
    console: { error() {}, info() {}, warn() {} }, Headers, URL, URLSearchParams, performance,
    TextDecoder, TextEncoder, Request, Response, FormData, Blob, ReadableStream, Buffer, Uint8Array, ArrayBuffer, JSON, atob,
    Date, Set, Map,
  }, { filename: file })
  return module.exports
}
const shared: Record<string, any> = {
  'next/server': { NextRequest, NextResponse }, 'next-auth/jwt': { getToken: async () => token },
  'next-auth': { getServerSession: async () => token ? { user: { ...token, id: token.id }, impersonation: token.impersonation } : null },
  '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { default: database },
  '@/lib/area4/section-registry': registry, './section-registry': registry,
  '@/lib/area4/policy': policy, './policy': policy,
  '@/lib/area4/crm-staging-import': imports,
  '@/lib/area4/audit': audit, './audit': audit,
  '@/lib/area4/request-policy': { ...requestPolicy, area4RequestCapabilities(input: any) {
    const capabilities = requestPolicy.area4RequestCapabilities(input); commands.push({ input, capabilities }); return capabilities
  } },
  './lib/admin-render-surface': renderSurface, './lib/high-risk-api-policy': highRisk,
  './lib/altas/contrato-access': alta, './lib/m365-legacy-policy': m365,
  './lib/finanzas/conciliar-runtime': { conciliarRuntimeConfigured: () => null },
  '@/lib/finanzas/easy-access-profile': { isEasyOnlyFinanceUser: async () => easyOnly },
  '@/lib/finanzas/easy-access-core': easyCore, '@/lib/impersonation': { readImpersonationClaims: () => null },
  '@/lib/area4/surface-access': { readArea4SurfaceAccessUser: async () => null },
  '@/lib/area1-puertas-produccion': { importacionesCrmCerradas: () => process.env.VERCEL_ENV === 'production' },
  'node:crypto': { randomUUID }, '@/lib/crm-isp-import-core': importCore,
  '@/lib/brevo-config': { getBrevoApiKey: () => { throw new Error('PROVIDER_FORBIDDEN') } },
  '@/lib/brevo-fetch': { brevoFetch: () => { throw new Error('NETWORK_FORBIDDEN') } },
}
function resolve(name: string) {
  if (!(name in shared)) throw new Error(`Unexpected native fixture dependency: ${name}`)
  return shared[name]
}
shared['@/lib/area4/live-admin'] = load('lib/area4/live-admin.ts', '', resolve)
shared['@/lib/area1-import-recibo'] = load('lib/area1-import-recibo.ts', '', resolve)
const realOwner = shared['@/lib/area1-import-recibo'].propietarioImportacion
shared['@/lib/area1-import-recibo'].propietarioImportacion = (...args: any[]) => { ownerAuthCalls++; return realOwner(...args) }
shared['@/lib/crm-isp-auth'] = load('lib/crm-isp-auth.ts', '', resolve)
shared['@/lib/crm-isp-import'] = load('lib/crm-isp-import.ts', '', resolve)
const manualHandler = load('app/api/admin/crm/isp/vinculos/route.ts', '', resolve)
const proxy = load('proxy.js', '\nmodule.exports.boundary = area4RegisteredAdminApiBoundary;', resolve)

beforeEach(() => {
  environment(); principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [], email: 'owner@fixture.test' }
  token = { id: '3', userType: 'admin', role: 'SUPER_ADMIN' }
  state = { rows: [{ id: 'v1', tipo: 'CREAR_CONTACTO', destinoId: 'NUEVO', estado: 'PENDIENTE', ispClienteRowId: 'r1' }],
    client: { id: 'r1', nombre: 'Synthetic', codigo: 'C1', crmContactoId: null, clienteWebId: null }, created: 0 }
  auditFailure = 'none'; databaseFailure = false; lateFailure = false; easyOnly = false; inTx = false
  nativeResolutionReads = 0; ownerAuthCalls = 0; entries.length = 0; commands.length = 0; txOptions.length = 0
})
after(() => {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  console.log(JSON.stringify({ checks, middlewareDispatches, originalBodies, actualProxy: true, nativeManualHandler: true,
    nativeResolver: true, syntheticDatabaseOnly: true, realOperations: false, networkRequests: 0, productionOpened: false }))
})
const manual = (accion = 'CONFIRMAR', ids: unknown = ['v1']) => ({ accion, ids })
const block = (hashEsperado = HASH) => ({ confirmacion: 'CONFIRMAR_BLOQUE', hashEsperado })
function req(path: string, body: unknown, options: { raw?: boolean; method?: string; headers?: Record<string, string>; bytes?: Uint8Array } = {}) {
  const method = options.method ?? 'POST'
  const bytes = options.bytes ?? (body === undefined ? undefined : Buffer.from(options.raw ? String(body) : JSON.stringify(body)))
  return { request: new NextRequest(`https://area4.example.test${path}`, { method,
    headers: { origin: 'https://area4.example.test', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...options.headers },
    ...(bytes ? { body: new Uint8Array(bytes) } : {}) }), bytes }
}
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('UNCONSUMED_CLONE_TIMEOUT')), 3000) })]) }
  finally { if (timer) clearTimeout(timer) }
}
async function invoke(path: string, body: unknown, options: Parameters<typeof req>[2] & { boundaryOnly?: boolean } = {}) {
  const { request, bytes } = req(path, body, options)
  const response = await bounded<NextResponse | null>(options.boundaryOnly ? proxy.boundary(request) : proxy.proxy(request))
  assert.equal(request.bodyUsed, false, 'original body must remain untouched before handler dispatch')
  if (bytes) { assert.deepEqual(Buffer.from(await request.arrayBuffer()), Buffer.from(bytes)); originalBodies++ }
  checks++
  if (response?.headers.get('x-middleware-next') === '1') middlewareDispatches++ // Synthetic terminal only; no business operation.
  return response as NextResponse | null
}
function continued(response: NextResponse | null) {
  assert.ok(response); assert.equal(response.status, 200); assert.equal(response.headers.get('x-middleware-next'), '1')
}
function denied(response: NextResponse | null, status: number) {
  assert.ok(response); assert.equal(response.status, status); assert.notEqual(response.headers.get('x-middleware-next'), '1')
}
function attempt(path: string) {
  assert.equal(entries.length, 1); const a = entries[0]
  assert.equal(a.actorId, 3); assert.equal(a.origen, path); assert.equal(a.operacion, 'CONFIRMACION_SOLICITADA')
  assert.deepEqual(a.despues, { fase: 'ANTES_DEL_HANDLER', resultado: 'INTENTO', metodo: 'POST', capacidad: 'confirmar' })
  assert.doesNotMatch(JSON.stringify(a), /hashEsperado|CONFIRMAR_BLOQUE|v1|owner@|EXITO/)
}

test('registry exacto: NEW pendiente, GET V POST C, 16KiB y evidencia literal 439/79 intacta', () => {
  const all = registry.area4RegistrySurfaceMatches(), historic = all.filter(m => m.surface.baselineDescriptor !== undefined)
  const digest = (values: any[]) => createHash('sha256').update(JSON.stringify(values.sort())).digest('hex')
  assert.equal(historic.length, 439); assert.equal(registry.AREA4_SECTION_REGISTRY.length, 79)
  assert.equal(digest(historic.map(m => m.surface.baselineDescriptor)), registry.AREA4_BASELINE_DESCRIPTORS_SHA256)
  assert.equal(digest(registry.AREA4_SECTION_REGISTRY.map(s => s.baselineIdentity)), registry.AREA4_BASELINE_IDENTITIES_SHA256)
  for (const [path, contract] of [[MANUAL, 'isp-vinculos-v1'], [BLOCK, 'isp-vinculos-bloque-v1']]) {
    const match = registry.area4RegisteredSurface(path, 'api')!
    assert.equal(match.baseline, false); assert.equal(match.surface.request?.stagingImport, contract)
    assert.equal(match.surface.request?.commandBodyLimit, 16384)
    assert.deepEqual(match.surface.request?.requiredActions?.GET, ['V']); assert.deepEqual(match.surface.request?.requiredActions?.POST, ['C'])
    assert.deepEqual(requestPolicy.area4RequestCapabilities({ path, method: 'GET' }), ['lectura'])
    assert.deepEqual(requestPolicy.area4RequestCapabilities({ path, method: 'POST' }), ['lectura', 'escritura', 'confirmar'])
  }
})
test('owner staging 200 continúa las dos acciones manuales y bloque, INTENTO C y original íntegro', async () => {
  for (const [path, body] of [[MANUAL, manual()], [MANUAL, manual('DESCARTAR')], [BLOCK, block()], [MANUAL, { ids: ['v1'], accion: 'CONFIRMAR' }], [BLOCK, { hashEsperado: HASH, confirmacion: 'CONFIRMAR_BLOQUE' }]]) {
    entries.length = 0; continued(await invoke(path as string, body)); attempt(path as string)
    assert.deepEqual([...commands.at(-1).capabilities], ['lectura', 'escritura', 'confirmar'])
  }
})
test('GET existentes son solo V: owner continúa sin intento; no inventar POST simular ni grants automáticos', async () => {
  for (const path of [MANUAL, BLOCK]) continued(await invoke(path, undefined, { method: 'GET' }))
  assert.equal(entries.length, 0)
  principal = { id: 4, activo: true, rol: 'GERENTE', roles: [] }; token.id = '4'
  for (const path of [MANUAL, BLOCK]) denied(await invoke(path, undefined, { method: 'GET' }), 403)
  assert.equal(entries.length, 0)
})
test('producción, refs distintas, flags inválidos, DSN ajena y ambos readonly: cero dispatch completo y boundary', async () => {
  const variants: Record<string, string | undefined>[] = [
    { VERCEL_ENV: 'production' }, { VERCEL_ENV: undefined }, { VERCEL_ENV: 'development' },
    { VERCEL_GIT_COMMIT_REF: 'main' }, { VERCEL_GIT_COMMIT_REF: undefined },
    { FINANCE_STAGING_SANDBOX: undefined }, { FINANCE_STAGING_SANDBOX: '0' }, { FINANCE_STAGING_SANDBOX: 'true' },
    { FINANCE_DEPLOYMENT_READ_ONLY: '1' }, { IO_PRODUCTION_READ_ONLY: '1' },
    { DATABASE_URL: undefined }, { DATABASE_URL: 'bad' },
    { DATABASE_URL: 'postgresql://postgres:dummy@127.0.0.1:1/io_staging_finanzas' },
    { DATABASE_URL: 'postgresql://io_staging_finanzas:dummy@127.0.0.1:1/railway' },
    { DATABASE_URL: 'https://io_staging_finanzas@127.0.0.1/io_staging_finanzas' },
    { DATABASE_URL: 'postgresql://%ZZ@127.0.0.1/io_staging_finanzas' },
  ]
  const dispatchBefore = middlewareDispatches
  for (const variant of variants) {
    environment(variant)
    for (const [path, body] of [[MANUAL, manual()], [BLOCK, block()]] as const) {
      denied(await invoke(path, body), 403); denied(await invoke(path, body, { boundaryOnly: true }), 403)
    }
  }
  assert.equal(middlewareDispatches, dispatchBefore); assert.equal(entries.length, 0)
})
test('live identity/session/nonowner/secondary SA/acting deny both routes without dispatch or audit', async () => {
  const variants: [() => void, number][] = [
    [() => { token = null }, 401], [() => { token.userType = 'empleado' }, 401], [() => { token.id = 'bad' }, 401],
    [() => { principal = null }, 401], [() => { principal.activo = false }, 401],
    [() => { principal.rol = 'VISOR'; principal.roles = ['SUPER_ADMIN'] }, 403],
    [() => { principal.id = 4; token.id = '4' }, 403], [() => { principal.rol = 'GERENTE' }, 403],
    [() => { token.impersonation = {} }, 403], [() => { token.impersonation = { actorId: '3', targetId: '3' } }, 403],
    [() => { process.env.AREA4_OWNER_USER_ID = '4' }, 403], [() => { process.env.AREA4_OWNER_USER_ID = '-3' }, 403],
  ]
  const dispatchBefore = middlewareDispatches
  for (const [mutate, status] of variants) for (const [path, body] of [[MANUAL, manual()], [BLOCK, block()]] as const) {
    environment(); principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [] }; token = { id: '3', userType: 'admin' }
    mutate(); denied(await invoke(path, body), status)
  }
  assert.equal(middlewareDispatches, dispatchBefore); assert.equal(entries.length, 0)
})
test('HTTPS Origin exacto y Sec-Fetch-Site same-origin obligatorio sin fallback', async () => {
  for (const headers of [{ origin: '' }, { origin: 'null' }, { origin: 'https://other.example.test' },
    { 'sec-fetch-site': '' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'cross-site' }]) {
    for (const [path, body] of [[MANUAL, manual()], [BLOCK, block()]] as const) denied(await invoke(path, body, { headers }), 403)
  }
  const missing = req(MANUAL, manual()).request; missing.headers.delete('sec-fetch-site')
  denied(await bounded(proxy.proxy(missing)), 403)
  const insecure = new NextRequest(`http://area4.example.test${MANUAL}`, { method: 'POST', body: JSON.stringify(manual()),
    headers: { origin: 'http://area4.example.test', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' } })
  denied(await bounded(proxy.proxy(insecure)), 403); assert.equal(entries.length, 0)
})
test('manual: duplicate keys (including last valid), extras, truthy, IDs type/empty/length/count invalid', async () => {
  const bodies = [null, true, [], {}, { accion: true, ids: ['v1'] }, manual('simular'), manual('confirmar'), manual('CONFIRMAR', []),
    manual('CONFIRMAR', [1]), manual('CONFIRMAR', ['']), manual('CONFIRMAR', ['x'.repeat(65)]), manual('CONFIRMAR', Array(201).fill('v1')),
    manual('CONFIRMAR', ['\n']), { ...manual(), ownerId: 3 }, { ...manual(), confirmar: true }]
  for (const body of bodies) denied(await invoke(MANUAL, body), 400)
  for (const raw of ['{"accion":"DESCARTAR","accion":"CONFIRMAR","ids":["v1"]}', '{"accion":"CONFIRMAR","ids":["bad"],"ids":["v1"]}',
    '{"\\u0061ccion":"CONFIRMAR","ids":["v1"]}', '{broken', '{"accion":"CONFIRMAR","ids":["v1"],}', '\ufeff{"accion":"CONFIRMAR","ids":["v1"]}']) denied(await invoke(MANUAL, raw, { raw: true }), 400)
  assert.equal(entries.length, 0)
})
test('block: hash mandatory 64lowerhex, literal confirmation, duplicates/extras/truthy rejected', async () => {
  for (const body of [null, {}, { confirmacion: 'CONFIRMAR_BLOQUE' }, { hashEsperado: HASH }, { ...block(), confirmacion: true },
    { ...block(), confirmacion: 'confirmar_bloque' }, { ...block(), extra: 1 }, block('A'.repeat(64)), block('a'.repeat(63)), block('g'.repeat(64)), block('')]) denied(await invoke(BLOCK, body), 400)
  for (const raw of [`{"confirmacion":"wrong","confirmacion":"CONFIRMAR_BLOQUE","hashEsperado":"${HASH}"}`,
    `{"confirmacion":"CONFIRMAR_BLOQUE","hashEsperado":"${HASH}","hashEsperado":"${HASH}"}`]) denied(await invoke(BLOCK, raw, { raw: true }), 400)
  assert.equal(entries.length, 0)
})
test('dedicated readers real: 16384 bound exact/over, streamed over-limit, invalid UTF8/content-length, wrong type', async () => {
  for (const [path, body, reader] of [[MANUAL, manual(), imports.readArea4IspVinculosStagingCommand], [BLOCK, block(), imports.readArea4IspVinculosBloqueStagingCommand]] as const) {
    const text = JSON.stringify(body), exact = text + ' '.repeat(16384 - Buffer.byteLength(text))
    continued(await invoke(path, exact, { raw: true })); entries.length = 0
    denied(await invoke(path, exact + ' ', { raw: true }), 400)
    denied(await invoke(path, body, { headers: { 'content-type': 'text/plain' } }), 415)
    for (const length of ['', '-1', 'wrong', '16385']) denied(await invoke(path, body, { headers: { 'content-length': length } }), 400)
    denied(await invoke(path, body, { bytes: new Uint8Array([0xc3, 0x28]) }), 400)
    const original = new Request('https://fixture.test', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(exact)); controller.enqueue(Buffer.from(' ')); controller.close() } }), duplex: 'half' } as any)
    assert.equal((await bounded<{ readonly errorStatus?: 400 | 415 }>(reader(original, 16384))).errorStatus, 400)
    assert.equal(original.bodyUsed, false); assert.equal((await original.arrayBuffer()).byteLength, 16385)
    assert.equal((await reader(req(path, body).request, 16385)).errorStatus, 400)
  }
  assert.equal(entries.length, 0)
})
test('200 IDs accepted, dedup reserved to native handler; no relaxed negative oracle', async () => {
  continued(await invoke(MANUAL, manual('DESCARTAR', Array(200).fill('v1')))); attempt(MANUAL)
})
test('neighbors/noncanonical paths/wrong methods/simular/M3651-5/mail/Graph never inherit exception', async () => {
  const dispatchBefore = middlewareDispatches
  for (const path of [`${MANUAL}/`, `${BLOCK}/`, `${MANUAL}/simular`, `${BLOCK}/simular`, `${BLOCK}/vecina`,
    MANUAL.replace('vinculos', '%76inculos'), MANUAL.replace('/isp/', '/ISP/'), '/api/admin/crm/hubspot/vinculos',
    '/api/admin/crm/contactos/synthetic/m365/borrador', '/api/admin/crm/contactos/synthetic/actividades/synthetic/m365',
    '/api/admin/crm/mail', '/api/admin/crm/enviar-correo', '/api/admin/crm/sync', '/api/admin/crm/m365/vecina']) {
    assert.equal(imports.area4CrmStagingImportContract(path, 'POST'), null); denied(await invoke(path, block()), 403)
  }
  for (const path of [MANUAL, BLOCK]) {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE', 'post']) assert.equal(imports.area4CrmStagingImportContract(path, method), null)
    for (const method of ['PUT', 'PATCH', 'DELETE']) denied(await invoke(path, manual(), { method }), 403)
  }
  assert.equal(middlewareDispatches, dispatchBefore); assert.equal(entries.length, 0)
})
test('DB/INTENT audit failures and easy-only deny before dispatch; external flag remains 1', async () => {
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1')
  databaseFailure = true
  for (const [path, body] of [[MANUAL, manual()], [BLOCK, block()]] as const) denied(await invoke(path, body), 503)
  databaseFailure = false; auditFailure = 'always'
  for (const [path, body] of [[MANUAL, manual()], [BLOCK, block()]] as const) denied(await invoke(path, body), 503)
  auditFailure = 'none'; easyOnly = true
  for (const [path, body] of [[MANUAL, manual()], [BLOCK, block()]] as const) denied(await invoke(path, body), 403)
  assert.equal(entries.length, 0)
})

async function nativePost(body: unknown) { return await bounded(manualHandler.POST(req(MANUAL, body).request)) as NextResponse }
function resultReceipt(outcome: 'EXITO' | 'ERROR', resolved: number) {
  const a = entries.at(-1); assert.equal(a.actorId, 3); assert.equal(a.origen, 'crm.isp.vinculos')
  assert.equal(a.operacion, 'CRM_IMPORTACION_ISP'); assert.equal(a.despues.fase, 'RESULTADO')
  assert.equal(a.despues.resultado, outcome); assert.equal(a.despues.propuestasResueltas, resolved)
  assert.doesNotMatch(JSON.stringify(a), /owner@|Synthetic|v1|fichas|creados|RAW_PRIVATE/)
}
test('native manual handler: real resolver DESCARTAR, owner helper, dedup and durable RESULT in bounded tx', async () => {
  const response = await nativePost(manual('DESCARTAR', ['v1', 'v1']))
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: 1, errores: [] })
  assert.equal(ownerAuthCalls, 1); assert.equal(nativeResolutionReads, 1); assert.equal(state.rows[0].estado, 'DESCARTADO')
  assert.equal(entries.length, 1); resultReceipt('EXITO', 1); assert.equal(txOptions[0].timeout, 30000)
})
test('native manual handler: real CONFIRMAR commits only after RESULT receipt', async () => {
  const response = await nativePost(manual())
  assert.equal(response.status, 200); assert.equal((await response.json()).ok, 1)
  assert.equal(state.rows[0].estado, 'CONFIRMADO'); assert.equal(state.created, 1); resultReceipt('EXITO', 1)
})
test('native manual handler: expected failure rollback before ERROR; result has no fictitious changes or raw errors', async () => {
  lateFailure = true; const before = structuredClone(state)
  const response = await nativePost(manual()); assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: 0, errores: [{ id: 'v1', ok: false, codigo: 'ERROR' }] })
  assert.deepEqual(state, before); assert.equal(entries.length, 1); resultReceipt('ERROR', 0)
})
test('native manual handler: expected missing proposal has safe error code and durable failure receipt', async () => {
  const response = await nativePost(manual('CONFIRMAR', ['missing']))
  assert.deepEqual(await response.json(), { ok: 0, errores: [{ id: 'missing', ok: false, codigo: 'NO_EXISTE' }] })
  assert.equal(state.created, 0); resultReceipt('ERROR', 0)
})
test('native manual handler: RESULT audit failure rolls back; ERROR receipt outside successful-operation tx', async () => {
  // Fail the first result receipt, then allow the independent ERROR transaction.
  const create = database.auditoriaPermisosArea4.create; let calls = 0
  database.auditoriaPermisosArea4.create = async (input: any) => { if (++calls === 1) throw new Error('AUDIT_FAILURE'); return create(input) }
  try {
    const response = await nativePost(manual()); assert.equal((await response.json()).ok, 0)
    assert.equal(state.created, 0); assert.equal(state.rows[0].estado, 'PENDIENTE'); resultReceipt('ERROR', 0)
  } finally { database.auditoriaPermisosArea4.create = create }
})
test('native manual handler: both receipts fail => NO_AUDITADO 500, no false total rollback/success', async () => {
  auditFailure = 'always'; const response = await nativePost(manual())
  assert.equal(response.status, 500); assert.equal((await response.json()).codigo, 'NO_AUDITADO')
  assert.equal(state.created, 0); assert.equal(state.rows[0].estado, 'PENDIENTE'); assert.equal(entries.length, 0)
})
test('native manual handler: mixed native results preserve actual committed successes with separate receipts', async () => {
  const response = await nativePost(manual('DESCARTAR', ['v1', 'missing']))
  assert.deepEqual(await response.json(), { ok: 1, errores: [{ id: 'missing', ok: false, codigo: 'NO_EXISTE' }] })
  assert.equal(state.rows[0].estado, 'DESCARTADO'); assert.deepEqual(entries.map(a => a.despues.resultado), ['EXITO', 'ERROR'])
})
test('native manual handler denies no session/inactive/nonowner/acting and malformed JSON before business reads', async () => {
  for (const [mutate, status] of [
    [() => { token = null }, 401], [() => { principal.activo = false }, 401],
    [() => { principal.id = 4; token.id = '4' }, 403], [() => { token.impersonation = {} }, 403],
  ] as [() => void, number][]) {
    principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [] }; token = { id: '3', userType: 'admin' }
    mutate(); assert.equal((await nativePost(manual())).status, status)
  }
  principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [] }; token = { id: '3', userType: 'admin' }
  assert.equal((await nativePost({ ...manual(), extra: true })).status, 400)
  assert.equal(nativeResolutionReads, 0); assert.equal(entries.length, 0)
})
