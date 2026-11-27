/** Dedicated offline destination tests. No env assignment, real token/Graph/DB or generic client. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as core from '../lib/finanzas/documentos-panel-core'
import * as policy from '../lib/finanzas/documentos-panel-runtime'
const pins = policy.DOCUMENTOS_APPROVED_PRODUCTION_PINS
const tenant = '11111111-1111-4111-8111-111111111111', app = '22222222-2222-4222-8222-222222222222'
const env = { FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: pins.driveId, FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID: pins.folderItemId,
  FINANCE_DOCUMENTOS_PRODUCTION_PENDING_FOLDER_ITEM_ID: pins.pendingFolderItemId, FINANCE_DOCUMENTOS_PRODUCTION_ARCHIVED_FOLDER_ITEM_ID: pins.archivedFolderItemId,
  FINANCE_DOCUMENTOS_GRAPH_TENANT_ID: tenant, FINANCE_DOCUMENTOS_GRAPH_CLIENT_ID: app, FINANCE_DOCUMENTOS_GRAPH_CLIENT_SECRET: 'OFFLINE_ONLY_NOT_REAL' }
function load(file: string, imports: Record<string, unknown>) {
  const module = { exports: {} as any }
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, Buffer, URL, URLSearchParams, Headers, Response, Uint8Array, AbortSignal, Date, process: { env: {} },
      fetch: () => { throw Error('LIVE_NETWORK_FORBIDDEN') }, require: (key: string) => { if (!(key in imports)) throw Error(`UNEXPECTED_IMPORT:${key}`); return imports[key] } })
  return module.exports
}
const selected = load('lib/finanzas/documentos-production-selected.ts', { 'server-only': {}, './documentos-panel-core': core, './documentos-panel-runtime': policy })
const storageModule = load('lib/finanzas/documentos-panel-storage.ts', { './microsoft-graph': { getAccessToken: () => { throw Error('GENERIC_GRAPH_FORBIDDEN') } }, './descarga-privada-graph': {}, './documentos-panel-core': core, './documentos-panel-runtime': policy, './documentos-production-selected': selected })
const file = core.validateFile(Buffer.from('%PDF-1.7\nOFFLINE_APPROVED_FOLDER10'), 'test.pdf', 'application/pdf', 'FACTURA_RECIBIDA', '00000000-0000-4000-8000-000000000001')
const code = (value: string) => (error: any) => error.code === value
function jwt(roles = ['Files.SelectedOperations.Selected']) {
  return `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify({ aud: '00000003-0000-0000-c000-000000000000', tid: tenant, appid: app, iss: `https://sts.windows.net/${tenant}/`, roles, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.c3ludGhldGlj`
}
function fixture() {
  const items = new Map<string, any>(), calls: { url: URL; method: string }[] = []
  const folder = (id: string, name: string, parent: string) => ({ id, name, folder: {}, parentReference: { id: parent, driveId: pins.driveId } })
  const item = (id: string, name: string, parent: string) => ({ id, name, file: {}, size: file.bytes.length, eTag: 'version-1', parentReference: { id: parent, driveId: pins.driveId } })
  items.set(pins.folderItemId, folder(pins.folderItemId, '10. Panel IO', 'library-root'))
  items.set(pins.pendingFolderItemId, folder(pins.pendingFolderItemId, 'Pendientes', pins.folderItemId))
  items.set(pins.archivedFolderItemId, folder(pins.archivedFolderItemId, 'Archivadas', pins.folderItemId))
  for (let n = 1; n <= 9; n++) items.set(`folder-${n}`, folder(`folder-${n}`, `${n}. Existing`, 'library-root'))
  const inside = (value: any): boolean => value?.id === pins.folderItemId || !!(value?.parentReference?.id && items.has(value.parentReference.id) && inside(items.get(value.parentReference.id)))
  const fetchFake = async (urlValue: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(urlValue)), method = init.method ?? 'GET'; calls.push({ url, method })
    assert.equal(url.hostname, 'graph.microsoft.com'); assert.doesNotMatch(url.pathname, /\/sites\/|\/root|\/users\/|\/permissions|createLink/)
    const match = decodeURIComponent(url.pathname).match(/\/items\/([^/:]+)(?::\/([^:]+))?(?:(:\/content)|\/(children|content))?$/)!
    assert.ok(match)
    const parent = match[1], child = match[2], resource = match[4], value = items.get(parent)
    if (!inside(value)) return Response.json({ error: 'Selected grant denied' }, { status: 403 })
    if (method === 'PUT') {
      assert.equal(parent, pins.pendingFolderItemId); assert.equal(new Headers(init.headers).get('if-none-match'), '*')
      assert.equal(url.searchParams.get('@microsoft.graph.conflictBehavior'), 'fail')
      const existing = [...items.values()].find(v => v.parentReference.id === parent && v.name === child)
      if (existing) return Response.json({}, { status: 409 })
      const created = item('test-original', child!, parent); items.set(created.id, created); return Response.json(created, { status: 201 })
    }
    if (method === 'PATCH') {
      const body = JSON.parse(init.body as string); assert.equal(value.parentReference.id, pins.pendingFolderItemId); assert.equal(body.parentReference.id, pins.archivedFolderItemId)
      assert.equal(new Headers(init.headers).get('if-match'), value.eTag); assert.equal(body['@microsoft.graph.conflictBehavior'], 'fail')
      if ([...items.values()].some(v => v.parentReference.id === body.parentReference.id && v.name === body.name)) return Response.json({}, { status: 409 })
      Object.assign(value, { name: body.name, parentReference: { id: body.parentReference.id, driveId: pins.driveId } }); return Response.json(value)
    }
    assert.equal(method, 'GET')
    if (resource === 'content') return new Response(Uint8Array.from(file.bytes).buffer)
    if (resource === 'children') { assert.ok([pins.pendingFolderItemId, pins.archivedFolderItemId].includes(parent)); return Response.json({ value: [...items.values()].filter(v => v.parentReference.id === parent) }) }
    if (child) { const found = [...items.values()].find(v => v.parentReference.id === parent && v.name === child); return found ? Response.json(found) : Response.json({}, { status: 404 }) }
    return Response.json(value)
  }
  const transport = selected.createDocumentosProductionTransport(pins, async () => {}, env, { fetch: fetchFake, tokenProvider: async () => jwt() })
  const storage = storageModule.createDocumentosPanelStorage(async () => 7, transport, pins)
  return { items, calls, storage, transport, item, fetch: fetchFake }
}
test('IDs de aprobación exactos; config ausente o cualquiera alterado cierra sin fetch', () => {
  assert.equal(pins.driveId, 'b!dKwRKEVNVkqVTYRAofWUsDd986ugfPhAt5zF_95R9jAHPFiBlpgQQYMomvM3D6Mc')
  assert.equal(pins.folderItemId, '01OLVTNNTKKO7GOUF2HFEZBV354BP3HD6G')
  assert.equal(pins.pendingFolderItemId, '01OLVTNNVIFF7PXWJMNVGLSTLPYQGEZPUV')
  assert.equal(pins.archivedFolderItemId, '01OLVTNNWGRLAN46CBXRAIFY73LMMSCYD2')
  assert.equal(policy.documentosPanelProductionPins({}), null)
  const fake = fixture()
  for (const key of Object.keys(pins)) {
    const bad = { ...pins, [key]: 'folder-1' }
    assert.throws(() => storageModule.createDocumentosPanelStorage(async () => 7, fake.transport, bad), code('DOCUMENTOS_SELECTED_PIN_MISMATCH'))
    assert.throws(() => selected.createDocumentosProductionTransport(bad, async () => {}, env, { fetch: fake.fetch }), code('DOCUMENTOS_SELECTED_PIN_MISMATCH'))
  }
  assert.equal(fake.calls.length, 0)
})
test('writer no toca 1–9, OneDrive personal, sites, drive root ni discovery/listado root, incluso tras pins GET', async () => {
  const f = fixture()
  await f.transport.request(`/drives/${pins.driveId}/items/${pins.folderItemId}?$select=id,name,folder,parentReference`)
  const before = f.calls.length
  const paths = ['/sites/vola_finance/drives', `/drives/${pins.driveId}/root/children`, '/me/drive/root', '/users/victor/drive/root', `/drives/${pins.driveId}/items/${pins.folderItemId}/children?$select=id,name`, `/drives/${pins.driveId}/items/${pins.folderItemId}:/Pendientes`, ...Array.from({ length: 9 }, (_, i) => `/drives/${pins.driveId}/items/folder-${i + 1}?$select=id,name`)]
  for (const path of paths) await assert.rejects(() => f.transport.request(path))
  assert.equal(f.calls.length, before)
})
test('reject sitewide/Sites.Selected/Lists.Selected/All/roles adicionales antes de Graph', async () => {
  for (const roles of [['Sites.Selected'], ['Sites.ReadWrite.All'], ['Lists.SelectedOperations.Selected'], ['ListItems.SelectedOperations.Selected'], ['Files.ReadWrite.All'], ['Files.SelectedOperations.Selected', 'Sites.Selected'], ['Files.SelectedOperations.Selected', 'Mail.Read']]) {
    const f = fixture(), t = selected.createDocumentosProductionTransport(pins, async () => {}, env, { fetch: f.fetch, tokenProvider: async () => jwt(roles) })
    await assert.rejects(() => t.request(`/drives/${pins.driveId}/items/${pins.folderItemId}?$select=id,name,folder,parentReference`), code('DOCUMENTOS_SELECTED_ROLES_REJECTED'))
    assert.equal(f.calls.length, 0)
  }
})
test('lookup fijo valida id nombre padre drive: no hija alternativa ni escritura si mismatch', async () => {
  for (const change of [{ name: '1. Existing' }, { id: 'folder-1' }, { parentReference: { id: 'folder-1', driveId: pins.driveId } }, { parentReference: { id: pins.folderItemId, driveId: 'other-drive' } }]) {
    const f = fixture(); Object.assign(f.items.get(pins.pendingFolderItemId), change)
    await assert.rejects(() => f.storage.upload(file, `${file.hash}.pdf`))
    assert.equal(f.calls.filter(c => c.method !== 'GET').length, 0)
  }
})
test('same hash reusa verificado sin overwrite; colisión archive no mueve ni borra; copia 1–9 intacta', async () => {
  const f = fixture(), existing = Array.from({ length: 9 }, (_, i) => JSON.stringify(f.items.get(`folder-${i + 1}`)))
  const saved = await f.storage.upload(file, `${file.hash}.pdf`)
  const second = await f.storage.upload(file, `${file.hash}.pdf`); assert.equal(second.itemId, saved.itemId)
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1)
  f.items.set('existing-archive', f.item('existing-archive', 'duplicate.pdf', pins.archivedFolderItemId))
  await assert.rejects(() => f.storage.archive(saved, 'duplicate.pdf', file), code('DESTINO_EXISTENTE'))
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 0)
  const archived = await f.storage.archive(saved, 'human-validated.pdf', file)
  assert.equal(archived.itemId, saved.itemId); assert.equal(archived.parentId, pins.archivedFolderItemId)
  for (let n = 1; n <= 9; n++) assert.equal(JSON.stringify(f.items.get(`folder-${n}`)), existing[n - 1])
  assert.ok(!f.calls.some(c => ['POST', 'DELETE'].includes(c.method)))
})
test('writer rechaza PUT en Archivadas y PATCH inverso aun teniendo metadata conocida', async () => {
  const f = fixture(), saved = await f.storage.upload(file, `${file.hash}.pdf`)
  const before = f.calls.length
  await assert.rejects(() => f.transport.request(`/drives/${pins.driveId}/items/${pins.archivedFolderItemId}:/wrong.pdf:/content?%40microsoft.graph.conflictBehavior=fail`, { method: 'PUT', headers: { 'if-none-match': '*', 'content-length': String(file.bytes.length) }, body: new Uint8Array(file.bytes).buffer }), code('DOCUMENTOS_SELECTED_MUTATION_REJECTED'))
  await assert.rejects(() => f.transport.request(`/drives/${pins.driveId}/items/${saved.itemId}`, { method: 'PATCH', headers: { 'if-match': 'version-1' }, body: JSON.stringify({ name: 'wrong.pdf', parentReference: { id: pins.pendingFolderItemId }, '@microsoft.graph.conflictBehavior': 'fail' }) }), code('DOCUMENTOS_SELECTED_MUTATION_REJECTED'))
  assert.equal(f.calls.length, before)
})

test('readonly bloquea antes de Graph incluso con pins aprobados y configuración lista', async () => {
  const f = fixture(), storage = storageModule.createDocumentosPanelStorage(async (write: boolean) => { if (write) core.fail(403, 'DOCUMENTOS_PANEL_READ_ONLY', 'offline readonly'); return 7 }, f.transport, pins)
  await assert.rejects(() => storage.upload(file, `${file.hash}.pdf`), code('DOCUMENTOS_PANEL_READ_ONLY'))
  const saved = { driveId: pins.driveId, itemId: 'test-original', parentId: pins.pendingFolderItemId, nombre: `${file.hash}.pdf`, hash: file.hash, ruta: `10. Panel IO/Pendientes/${file.hash}.pdf` }
  await assert.rejects(() => storage.archive(saved, 'human.pdf', file), code('DOCUMENTOS_PANEL_READ_ONLY'))
  assert.equal(f.calls.length, 0)
})
