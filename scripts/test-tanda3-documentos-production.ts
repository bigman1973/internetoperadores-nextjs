/** Offline: synthetic env only, VM imports allowlisted, fetch/SQL/Graph live forbidden. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as core from '../lib/finanzas/documentos-panel-core'
import * as policy from '../lib/finanzas/documentos-panel-runtime'
const pins = policy.DOCUMENTOS_APPROVED_PRODUCTION_PINS
const production = { NODE_ENV: 'production', VERCEL_ENV: 'production', FINANCE_MODEL_PRODUCTION_ENABLED: '1', FINANCE_EASY_PRODUCTION_ENABLED: '1', FINANCE_AUTOMATIC_LINKS_DISABLED: '1', FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: '1', FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: pins.driveId, FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID: pins.folderItemId, FINANCE_DOCUMENTOS_PRODUCTION_PENDING_FOLDER_ITEM_ID: pins.pendingFolderItemId, FINANCE_DOCUMENTOS_PRODUCTION_ARCHIVED_FOLDER_ITEM_ID: pins.archivedFolderItemId, DATABASE_URL: 'postgresql://postgres:FAKE@yamanote.proxy.rlwy.net:34880/railway' }
function load(file: string, imports: Record<string, unknown>, env: Record<string, string> = {}) {
  const module = { exports: {} as any }
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module, exports: module.exports, Buffer, URL, Response, Headers, Uint8Array, AbortSignal, Date, console, process: { env }, fetch: () => { throw Error('LIVE_FETCH_FORBIDDEN') }, require: (key: string) => { if (!(key in imports)) throw Error(`UNEXPECTED_IMPORT:${key}`); return imports[key] } })
  return module.exports
}
const selectedModule = load('lib/finanzas/documentos-production-selected.ts', { 'server-only': {}, './documentos-panel-core': core, './documentos-panel-runtime': policy })
const storageModule = load('lib/finanzas/documentos-panel-storage.ts', { './microsoft-graph': {}, './descarga-privada-graph': {}, './documentos-panel-core': core, './documentos-panel-runtime': policy, './documentos-production-selected': selectedModule })
const input = core.validateFile(Buffer.from('%PDF-1.7\nSYNTHETIC'), 'test.pdf', 'application/pdf', 'FACTURA_RECIBIDA', randomUUID())
function selectedFake() {
  let panel: any = { id: pins.folderItemId, name: '10. Panel IO', folder: {}, parentReference: { id: 'unit-root', driveId: pins.driveId } }
  const folders: any[] = [{ id: pins.pendingFolderItemId, name: 'Pendientes' }, { id: pins.archivedFolderItemId, name: 'Archivadas' }].map(f => ({ ...f, folder: {}, parentReference: { id: pins.folderItemId, driveId: pins.driveId } }))
  let item: any = null; let bytes = input.bytes
  const calls: { path: string; method: string }[] = []
  const transport = {
    siteDrive: async () => { throw Error('SITE_DISCOVERY_FORBIDDEN') },
    download: async (drive: string, id: string) => { assert.equal(drive, pins.driveId); assert.equal(id, item.id); return bytes },
    request: async (path: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'; calls.push({ path, method })
      assert.doesNotMatch(path, /\/sites\/|\/root|\/permissions|createLink|\/users\/|\/children/)
      assert.ok(path.startsWith(`/drives/${pins.driveId}/items/`))
      assert.notEqual(method, 'POST'); assert.notEqual(method, 'DELETE')
      const clean = decodeURIComponent(path.split('?')[0])
      if (clean === `/drives/${pins.driveId}/items/${pins.folderItemId}`) return Response.json(panel)
      const relative = clean.match(/\/items\/([^/:]+)(?::\/([^:]+))?(?::\/content)?$/)!
      const parent = relative[1], name = relative[2]
      if (method === 'PUT') { assert.equal(parent, pins.pendingFolderItemId); item = { id: 'original-item', name, file: {}, size: bytes.length, eTag: 'etag-1', parentReference: { id: parent, driveId: pins.driveId } }; return Response.json(item, { status: 201 }) }
      if (method === 'PATCH') { assert.equal(parent, item.id); const body = JSON.parse(init.body as string); assert.equal(body.parentReference.id, pins.archivedFolderItemId); assert.equal((init.headers as any)['if-match'], 'etag-1'); Object.assign(item, { name: body.name, parentReference: { id: body.parentReference.id, driveId: pins.driveId } }); return Response.json(item) }
      const folder = folders.find(f => f.id === parent); if (folder && !name) return Response.json(folder)
      if (item && (parent === item.id || (item.parentReference.id === parent && item.name === name))) return Response.json(item)
      return Response.json({}, { status: 404 })
    },
  }
  return { transport, calls, setPanel: (value: any) => { panel = value }, setBytes: (value: Buffer) => { bytes = value }, get item() { return item }, folders }
}
test('gate CLOSED por defecto; pins completos exactos no activan sin opt-in y no alias Stage', () => {
  assert.equal(policy.documentosPanelRuntime({}), null)
  assert.equal(policy.documentosPanelProductionEnabled(production), true)
  assert.equal(core.DOCUMENTOS_PRODUCTION_ROOT, '10. Panel IO')
  for (const key of ['FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID', 'FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID', 'FINANCE_DOCUMENTOS_PRODUCTION_PENDING_FOLDER_ITEM_ID', 'FINANCE_DOCUMENTOS_PRODUCTION_ARCHIVED_FOLDER_ITEM_ID']) {
    for (const value of ['', 'root', 'foreign-item', '1. Folder']) assert.equal(policy.documentosPanelRuntime({ ...production, [key]: value }), null)
  }
  for (const change of [{ FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: '0' }, { FINANCE_STAGING_SANDBOX: '1' }, { FINANCE_STAGING_SANDBOX: 'true' }, { VERCEL_ENV: 'preview' }, { FINANCE_EASY_PRODUCTION_ENABLED: '0' }, { FINANCE_MODEL_PRODUCTION_ENABLED: '0' }, { FINANCE_AUTOMATIC_LINKS_DISABLED: '0' }, { DATABASE_URL: 'postgresql://postgres:FAKE@other:34880/railway' }, { DATABASE_URL: 'postgresql://io_staging_finanzas:FAKE@offline/io_staging_finanzas' }]) assert.equal(policy.documentosPanelRuntime({ ...production, ...change }), null)
  assert.equal(policy.documentosPanelProductionPins({ SHAREPOINT_DRIVE_ID: 'stage', DRIVE_ID: 'stage', SHAREPOINT_SITE_ID: 'site' }), null)
  assert.equal(policy.documentosPanelProductionPins({}), null)
})
test('Production readonly permite V; write bloqueado incluso opt-in+pins', () => {
  for (const flag of ['IO_PRODUCTION_READ_ONLY', 'FINANCE_DEPLOYMENT_READ_ONLY']) {
    const env = { ...production, [flag]: '1' }
    assert.equal(policy.assertDocumentosPanelRuntime(false, env).readOnly, true)
    assert.throws(() => policy.assertDocumentosPanelRuntime(true, env), (e: any) => e.code === 'DOCUMENTOS_PANEL_READ_ONLY')
  }
  assert.throws(() => selectedModule.assertDocumentosProductionTransportConfigured(production), (e: any) => e.code === 'DOCUMENTOS_SELECTED_AUTH_MISSING')
})
test('folder Selected fake usa sólo IDs exactos; upload/hash/mismo item sin discovery/lista/root/creación', async () => {
  const fake = selectedFake(); const storage = storageModule.createDocumentosPanelStorage(async () => 7, fake.transport, pins)
  const saved = await storage.upload(input, `${input.hash}.pdf`)
  assert.equal(saved.ruta, `10. Panel IO/Pendientes/${input.hash}.pdf`)
  assert.equal(saved.parentId, pins.pendingFolderItemId)
  assert.equal(core.hashBytes(await storage.original(saved, input)), input.hash)
  const target = '2026-11-30_Proveedor_F1_' + input.hash.slice(0, 16) + '.pdf'
  const archived = await storage.archive(saved, target, input)
  assert.equal(archived.itemId, saved.itemId); assert.equal(archived.parentId, pins.archivedFolderItemId); assert.equal(archived.ruta, `10. Panel IO/Archivadas/${target}`)
  await storage.archive(saved, target, input)
  assert.equal(fake.calls.filter(c => c.method === 'PATCH').length, 1)
  assert.equal(fake.calls.filter(c => c.method === 'PUT').length, 1)
})
test('missing pins/auth Production no cae en Graph genérico, ni una llamada', async () => {
  const storage = storageModule.createDocumentosPanelStorage(async () => 7, undefined, pins)
  await assert.rejects(async () => storage.upload(input, `${input.hash}.pdf`), (e: any) => e.code === 'DOCUMENTOS_SELECTED_PIN_MISMATCH')
})
test('name/drive/folder pin errado CLOSED antes de PUT; hija errada/ausente no se crea', async () => {
  for (const panel of [{ id: pins.folderItemId, name: 'Otra', folder: {}, parentReference: { driveId: pins.driveId } }, { id: pins.folderItemId, name: 'DocumentosPanelProduccion', folder: {}, parentReference: { driveId: pins.driveId } }, { id: pins.folderItemId, name: '10. Panel IO', folder: {}, parentReference: { driveId: 'other-drive' } }, { id: pins.folderItemId, name: '10. Panel IO', file: {}, parentReference: { driveId: pins.driveId } }]) {
    const fake = selectedFake(); fake.setPanel(panel)
    await assert.rejects(() => storageModule.createDocumentosPanelStorage(async () => 7, fake.transport, pins).upload(input, `${input.hash}.pdf`), (e: any) => e.code === 'GRAPH_NAMESPACE')
    assert.equal(fake.calls.filter(c => c.method !== 'GET').length, 0)
  }
  for (const change of ['parent', 'id', 'name', 'missing']) {
    const fake = selectedFake()
    if (change === 'parent') fake.folders[0].parentReference.id = 'other-folder'
    if (change === 'id') fake.folders[0].id = 'other-folder'
    if (change === 'name') fake.folders[0].name = '1. Folder'
    if (change === 'missing') fake.folders.splice(0, 1)
    await assert.rejects(() => storageModule.createDocumentosPanelStorage(async () => 7, fake.transport, pins).upload(input, `${input.hash}.pdf`))
    assert.equal(fake.calls.filter(c => c.method !== 'GET').length, 0)
  }
})
test('pointer Stage/raíz y SHA256 cambiado rechazados sin falsos recibos', async () => {
  const fake = selectedFake(); const storage = storageModule.createDocumentosPanelStorage(async () => 7, fake.transport, pins)
  const saved = await storage.upload(input, `${input.hash}.pdf`)
  for (const change of [{ itemId: 'root' }, { itemId: pins.folderItemId }, { ruta: `${core.DOCUMENTOS_PANEL_ROOT}/Pendientes/${saved.nombre}` }, { driveId: 'stage-drive' }]) await assert.rejects(() => storage.original({ ...saved, ...change }, input))
  fake.setBytes(Buffer.from('%PDF-changed'))
  await assert.rejects(() => storage.archive(saved, 'target.pdf', input), (e: any) => e.code === 'GRAPH_HASH_MISMATCH')
  assert.equal(fake.calls.filter(c => c.method === 'PATCH').length, 0)
})
test('API Production simulada: V/E/C exactas, actor estable, no acting y CSRF; sin DB/Graph real', async () => {
  let actor = 7, allowed = true, runtimeCalls = 0, acting: unknown = undefined, configured = false, deniedCapability = ''
  const capabilities: string[] = []
  const module = load('lib/finanzas/documentos-panel.ts', {
    '@prisma/client': { Prisma: { sql: () => ({}) } }, '@/lib/prisma': { __esModule: true, default: { revisionLecturaFacturaRecibida: { findMany: async () => [] } } },
    '@/lib/permisos': { verificarPermisoServer: async () => ({ lectura: true, escritura: true, confirmar: true }) },
    '@/lib/area4/live-admin': { requireArea4Capability: async (_db: any, area: string, cap: string, path: string) => { assert.equal(area, 'facturas'); assert.ok(['lectura','escritura','confirmar'].includes(cap)); capabilities.push(cap); assert.equal(path, '/api/admin/finanzas/documentos'); return allowed && cap !== deniedCapability ? { ok: true, principal: { id: actor }, session: { user: { impersonation: acting } } } : { ok: false, response: Response.json({ error: 'exact capability denied' }, { status: 403 }) } } },
    './invoice-quality-db': { AREA_FACTURAS_B2: 'facturas', jsonPrivado: Response.json, buscarIdentidadBloqueada: () => [] }, './reconciliation-auth': { B4_CONCILIACION_AREA: 'b4' },
    './prototype-staging': { assertPrototypeStaging: () => { throw Error('STAGE_GUARD_IN_PRODUCTION') }, assertFinanceEasyRuntime: () => { throw Error('PROMOTED_WRITE_GUARD_IN_READONLY') } },
    './finance-runtime-safety': { assertFinanceRuntimeReady: async () => { runtimeCalls++ } }, './documentos-panel-core': core,
    './documentos-panel-storage': { createDocumentosPanelStorage: () => ({}) }, './documentos-panel-runtime': { ...policy, assertDocumentosPanelRuntime: (w: boolean) => policy.assertDocumentosPanelRuntime(w, production), documentosPanelProductionPins: () => pins },
    './documentos-production-selected': { assertDocumentosProductionTransportConfigured: () => selectedModule.assertDocumentosProductionTransportConfigured({ ...production,
      ...(configured ? { FINANCE_DOCUMENTOS_GRAPH_TENANT_ID: '11111111-1111-4111-8111-111111111111', FINANCE_DOCUMENTOS_GRAPH_CLIENT_ID: '22222222-2222-4222-8222-222222222222', FINANCE_DOCUMENTOS_GRAPH_CLIENT_SECRET: 'OFFLINE_SYNTHETIC' } : {}) }) },
  }, production)
  const req: any = { nextUrl: new URL('https://prod.test/api/admin/finanzas/documentos'), headers: new Headers({ 'sec-fetch-site': 'same-origin' }) }
  const read = await module.createDocumentosPanelForRequest(req)
  assert.equal(read.context.environment, 'production'); assert.equal((await read.service.list()).documentos.length, 0); assert.ok(runtimeCalls >= 2)
  actor = 8; await assert.rejects(() => read.service.list(), (e: any) => e.code === 'ACTOR_CHANGED'); actor = 7
  allowed = false; await assert.rejects(() => module.createDocumentosPanelForRequest(req), (e: any) => e.status === 403); allowed = true
  acting = false; await assert.rejects(() => module.createDocumentosPanelForRequest(req), (e: any) => e.code === 'ACTING_NOT_ALLOWED'); acting = undefined
  for (const headers of [{ 'sec-fetch-site': 'same-origin' }, { origin: 'https://evil.test', 'sec-fetch-site': 'same-origin' }, { origin: 'https://prod.test', 'sec-fetch-site': 'cross-site' }]) await assert.rejects(() => module.createDocumentosPanelForRequest({ ...req, headers: new Headers(headers) }, true), (e: any) => e.code === 'ORIGIN_INVALIDO')
  for (const header of ['x-io-acting-session', 'next-action']) await assert.rejects(() => module.createDocumentosPanelForRequest({ ...req, headers: new Headers({ 'sec-fetch-site': 'same-origin', [header]: '1' }) }), (e: any) => e.code === 'ACTING_NOT_ALLOWED')
  for (const pointer of ['actingAs', 'verComo', 'actorId', 'driveId', 'itemId', 'url']) await assert.rejects(() => module.createDocumentosPanelForRequest({ ...req, nextUrl: new URL(`${req.nextUrl}?${pointer}=1`) }), (e: any) => e.code === 'ACTING_NOT_ALLOWED')
  await assert.rejects(() => module.createDocumentosPanelForRequest({ ...req, headers: new Headers({ origin: 'https://prod.test', 'sec-fetch-site': 'same-origin' }) }, true), (e: any) => e.code === 'DOCUMENTOS_SELECTED_AUTH_MISSING')
  configured = true; capabilities.length = 0
  const writeReq = { ...req, headers: new Headers({ origin: 'https://prod.test', 'sec-fetch-site': 'same-origin' }) }
  await module.createDocumentosPanelForRequest(writeReq, true, true)
  assert.deepEqual(capabilities, ['lectura','escritura','confirmar'])
  deniedCapability = 'confirmar'; await assert.rejects(() => module.createDocumentosPanelForRequest(writeReq,true,true), (e: any) => e.status === 403)
  deniedCapability = 'escritura'; await assert.rejects(() => module.createDocumentosPanelForRequest(writeReq,true), (e: any) => e.status === 403)
})
