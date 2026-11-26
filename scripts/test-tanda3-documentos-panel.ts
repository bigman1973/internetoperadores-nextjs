/** Offline only: no Prisma runtime, no env config, no real SQL, Graph or OpenAI. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { createTanda3PdfFixture } from './fixtures/tanda3-pdf-fixture'
import * as core from '../lib/finanzas/documentos-panel-core'
import * as runtimePolicy from '../lib/finanzas/documentos-panel-runtime'
const requireReal = createRequire(import.meta.url)
function execute(file: string, imports: Record<string, unknown>, env: Record<string,string> = {}) {
  const module = { exports: {} as any }
  const js = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  runInNewContext(js, { module, exports: module.exports, Date, Buffer, URL, Request, Response, Headers, TextDecoder, TextEncoder, Uint8Array, AbortSignal, console, process: { env }, require: (name: string) => {
    if (!(name in imports)) throw new Error(`UNEXPECTED_IMPORT:${name}`)
    return imports[name]
  } }, { filename: file })
  return module.exports
}
const storageModule = execute('lib/finanzas/documentos-panel-storage.ts', { './microsoft-graph': {}, './descarga-privada-graph': {}, './documentos-panel-core': core, './documentos-panel-runtime': runtimePolicy, './documentos-production-selected': { createDocumentosProductionTransport: () => { throw Error('UNEXPECTED_LIVE_SELECTED_TRANSPORT') } } })
const centsMetadata = { fecha: '2026-11-26', proveedor: 'Proveedor de prueba', cif: 'B12345678', numFactura: 'F/2026-01', base: 100, tipoIva: 21, importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121 }
async function pdfFixture(text = true) {
  const lines = text ? ['Proveedor: Proveedor de prueba','CIF: B12345678','Numero factura: F/2026-01','Fecha: 2026-11-26','Base: 100.00','Tipo IVA: 21.00','Importe IVA: 21.00','Tipo IRPF: 0.00','Importe IRPF: 0.00','Total: 121.00'] : []
  return createTanda3PdfFixture(lines.map((line,index) => ({ text: line, x: 40, y: 750 - index * 25, size: 14 })),600,800)
}
function file(bytes = Buffer.from('%PDF-1.7\nfixture'), tipo: core.DocumentType = 'FACTURA_RECIBIDA') { return core.validateFile(bytes,'original.pdf','application/pdf',tipo,randomUUID()) }
function fakeDb() {
  const state: { revisiones: any[]; facturas: any[]; audits: any[]; histories: any[] } = { revisiones: [], facturas: [], audits: [], histories: [] }
  let chain = Promise.resolve(); let failArchiveCommit = false, failUploadCommit = false; let serialFailures = 0; let serialAfterUpload = false, serialAfterArchive = false
  const matches = (row: any, where: any) => Object.entries(where ?? {}).every(([key,value]: any) => value && typeof value === 'object' ? value.contains !== undefined ? String(row[key] ?? '').includes(value.contains) : value.in ? value.in.includes(row[key]) : false : row[key] === value)
  const model = (key: keyof typeof state) => ({
    findMany: async ({ where, skip = 0, take = 100000, orderBy }: any) => { let rows = state[key].filter(row => matches(row,where)); if (orderBy) rows = [...rows].reverse(); return structuredClone(rows.slice(skip,skip + take)) },
    findUnique: async ({ where }: any) => structuredClone(state[key].find(row => matches(row,where)) ?? null),
    create: async ({ data }: any) => {
      // B2 exact partial predicate: neither action nor revision belongs to the key.
      if (key === 'audits' && data.actorId != null && data.solicitudId != null && state.audits.some(a => a.actorId === data.actorId && a.solicitudId === data.solicitudId)) throw Object.assign(Error('auditoria_calidad_facturas_actor_id_solicitud_id_key'), { code: 'P2002' })
      const row = { id: randomUUID(), version: 1, createdAt: new Date(), ...structuredClone(data) }; state[key].push(row); return structuredClone(row)
    },
    updateMany: async ({ where, data }: any) => { const rows = state[key].filter(row => matches(row,where)); for (const row of rows) for (const [key,raw] of Object.entries(data)) { const value = raw as any; row[key] = value && typeof value === 'object' && value.increment !== undefined ? row[key] + value.increment : structuredClone(value) } return { count: rows.length } },
    update: async ({ where, data }: any) => { const row = state[key].find(row => matches(row,where)); if (!row) throw Error('NOT_FOUND'); Object.assign(row,structuredClone(data)); return structuredClone(row) },
  })
  const tx = { revisionLecturaFacturaRecibida: model('revisiones'), facturaRecibida: model('facturas'), auditoriaCalidadFactura: model('audits'), historialUbicacionFacturaRecibida: model('histories') }
  const db = { ...tx, async $transaction(fn: any, options: any) {
    assert.equal(options.isolationLevel,'Serializable')
    const run = chain.then(async () => { const before = structuredClone(state); try {
      const out = await fn(tx)
      const uploadCompleted = state.audits.some(a => a.accion === 'DOCUMENTOS_PANEL_ORIGINAL_VERIFICADO' && !before.audits.some(b => b.id === a.id))
      const archiveCompleted = state.histories.length > before.histories.length
      if (serialFailures > 0 || (serialAfterUpload && uploadCompleted) || (serialAfterArchive && archiveCompleted)) {
        if (serialFailures > 0) serialFailures--; serialAfterUpload = false; serialAfterArchive = false
        throw Object.assign(Error('SIMULATED_SERIALIZATION_ABORT'), { code: 'P2034' })
      }
      if (failUploadCommit && uploadCompleted) { failUploadCommit = false; throw Error('SIMULATED_UPLOAD_DB_COMMIT_FAILURE') }
      if (failArchiveCommit && archiveCompleted) { failArchiveCommit = false; throw Error('SIMULATED_DB_COMMIT_FAILURE') }
      return out
    } catch (error) { Object.assign(state,before); throw error } })
    chain = run.then(() => undefined,() => undefined); return run
  } }
  return { db, state, failArchiveCommit: () => { failArchiveCommit = true }, failUploadCommit: () => { failUploadCommit = true }, abortSerial: (count = 1) => { serialFailures = count }, abortUploadFinal: () => { serialAfterUpload = true }, abortArchiveFinal: () => { serialAfterArchive = true } }
}
function harness(root = core.DOCUMENTOS_PANEL_ROOT) {
  const database = fakeDb(); let write = true, confirm = true, runtime = true; let actor = 7; let uploadFail = false, archiveFail = false; let now = 1800000000000
  let afterUpload: (() => Promise<void> | void) | undefined, afterArchive: (() => Promise<void> | void) | undefined
  const files = new Map<string,{ location: core.Location; bytes: Buffer }>(); const calls = { upload: 0, archive: 0, created: 0, moved: 0, download: 0, guards: [] as any[], locks: [] as string[] }
  const provider = {
    upload: async (input: core.FileInput, name: string) => {
      calls.upload++; if (uploadFail) throw Error('SIMULATED_UPLOAD_GRAPH_FAILURE')
      const location = { driveId: 'drive-fixture', itemId: `item-${input.hash}`, parentId: 'pending-fixture', nombre: name, ruta: `${root}/Pendientes/${name}`, hash: input.hash }
      if (!files.has(location.itemId)) { calls.created++; files.set(location.itemId,{ location, bytes: input.bytes }) }
      const saved = files.get(location.itemId)!; assert.equal(core.hashBytes(saved.bytes),input.hash); assert.deepEqual(saved.location,location)
      await afterUpload?.(); return structuredClone(saved.location)
    },
    original: async (location: core.Location) => { calls.download++; return files.get(location.itemId)!.bytes },
    archive: async (saved: core.Location, name: string) => { calls.archive++; if (archiveFail) throw Error('SIMULATED_GRAPH_FAILURE'); const previous = files.get(saved.itemId)!; const location = { ...previous.location, nombre: name, parentId: 'archive-fixture', ruta: `${root}/Archivadas/${name}` }; if (previous.location.ruta !== location.ruta) calls.moved++; files.set(saved.itemId,{ ...previous, location }); await afterArchive?.(); return structuredClone(location) },
  }
  const service = core.createDocumentosPanelService({ root, db: database.db, provider, guard: async (w,c,tx) => { calls.guards.push({ w,c,tx: !!tx }); if (!runtime) core.fail(404,'STAGE_DISABLED','not stage'); if (w && !write) core.fail(403,'WRITE_DENIED','write'); if (c && !confirm) core.fail(403,'CONFIRM_DENIED','confirm'); return actor }, lock: async (_tx,key) => { calls.locks.push(key) }, canonical: async (tx,key) => { calls.locks.push(key); return tx.facturaRecibida.findMany({ where: { canonKey: key } }) }, now: () => now })
  return { ...database, service, calls, files, actor: (id: number) => { actor = id }, afterUpload: (hook?: typeof afterUpload) => { afterUpload = hook }, afterArchive: (hook?: typeof afterArchive) => { afterArchive = hook }, denyWrite: () => { write = false }, allowWrite: () => { write = true }, denyConfirm: () => { confirm = false }, denyRuntime: () => { runtime = false }, failUpload: () => { uploadFail = true }, allowUpload: () => { uploadFail = false }, failArchive: () => { archiveFail = true }, allowArchive: () => { archiveFail = false }, advance: () => { now += 180000 } }
}
const body = (documento: any, action = 'VALIDAR', extra: any = {}) => ({ action, version: documento.version, solicitudId: randomUUID(), confirmacionHumana: true, campos: centsMetadata, ...extra })
const archiveBody = (documento: any) => ({ action: 'ARCHIVAR', version: documento.version, solicitudId: randomUUID(), confirmacionHumana: true })
async function validated(h: ReturnType<typeof harness>) { const d = await h.service.upload(file(await pdfFixture())); return h.service.action(d.id,body(d)) }

test('PDF fixture real local: texto + sugerencias nullable; nunca inventa importes/fecha', async () => {
  const parsed = await core.parseLocalDocument(file(await pdfFixture()))
  assert.match(parsed.texto,/Proveedor de prueba/); assert.equal(parsed.campos.fecha,'2026-11-26'); assert.equal(parsed.campos.total,121); assert.match(parsed.aviso,/NO fiables/)
  const blank = await core.parseLocalDocument(file(await pdfFixture(false))); assert.equal(blank.texto,''); assert.deepEqual(blank.campos,core.emptyMetadata()); assert.match(blank.aviso,/manual requerida/)
  const corrupt = await core.parseLocalDocument(file()); assert.equal(corrupt.campos.total,null); assert.match(corrupt.aviso,/manual requerida/)
})
test('imágenes sin OCR externo devuelven todos los campos null', async () => {
  const png = core.validateFile(Buffer.from([137,80,78,71,13,10,26,10,1]),'original.png','image/png','OTRO',randomUUID())
  assert.deepEqual((await core.parseLocalDocument(png)).campos,core.emptyMetadata())
})
test('firma/extensión/MIME, path y NOMINA rechazados', () => {
  assert.throws(() => core.validateFile(Buffer.from('%PDF-'),'x.jpg','application/pdf','FACTURA_RECIBIDA',randomUUID()),(e: any) => e.code === 'FILE_SIGNATURE')
  for (const name of ['../a.pdf','a\\b.pdf','a%2fb.pdf','a\u0000.pdf']) assert.throws(() => core.safeOriginalName(name))
  assert.throws(() => file(undefined,'NOMINA'),(e: any) => e.code === 'NOMINA_CANAL_PROTEGIDO')
})
test('bound stream corta JSON 16 KiB y multipart >4 MiB sin Content-Length', async () => {
  assert.equal(core.MAX_FILE_BYTES,4 * 1024 * 1024)
  assert.equal(core.MAX_UPLOAD_BYTES,4 * 1024 * 1024 + 16 * 1024)
  const exact = Buffer.alloc(core.MAX_FILE_BYTES); exact.write('%PDF-')
  assert.equal(file(exact).bytes.length,core.MAX_FILE_BYTES)
  const over = Buffer.alloc(core.MAX_FILE_BYTES + 1); over.write('%PDF-')
  assert.throws(() => file(over),(e: any) => e.code === 'FILE_LIMIT' && e.status === 413)
  let cancelled = false
  const req: any = { headers: new Headers({ 'content-type':'application/json' }), body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(17000)) }, cancel() { cancelled = true } }) }
  await assert.rejects(() => core.readPanelJson(req),(e: any) => e.status === 413); assert.equal(cancelled,true)
  const excessive: any = { headers: new Headers(), body: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(core.MAX_UPLOAD_BYTES + 1)) } }) }
  await assert.rejects(() => core.readBoundedBytes(excessive,core.MAX_UPLOAD_BYTES),(e: any) => e.status === 413)
})
test('multipart real acotado rechaza campos duplicados y desconocidos', async () => {
  const form = new FormData(); form.append('archivo',new Blob([await pdfFixture()],{type:'application/pdf'}),'test.pdf'); form.append('tipo','FACTURA_RECIBIDA'); form.append('solicitudId',randomUUID()); form.append('confirmacionHumana','true')
  const input = await core.readPanelMultipart(new Request('http://offline.local',{method:'POST',body:form})); assert.equal(input.extension,'pdf')
  form.append('tipo','OTRO'); await assert.rejects(() => core.readPanelMultipart(new Request('http://offline.local',{method:'POST',body:form})),(e: any) => e.code === 'MULTIPART_FIELDS')
})
test('lectura/lista no provider: original sólo explícito, hash verificado', async () => {
  const h = harness(); const d = await h.service.upload(file(await pdfFixture())); const before = { ...h.calls }
  assert.equal((await h.service.list()).documentos.length,1); assert.equal((await h.service.get(d.id) as any).hash,d.hash)
  assert.equal(h.calls.download,before.download); assert.equal(h.calls.upload,before.upload)
  const original = await h.service.get(d.id,true) as any; assert.equal(core.hashBytes(original.bytes),d.hash)
  h.files.get(`item-${d.hash}`)!.bytes = Buffer.from('changed')
  await assert.rejects(() => h.service.get(d.id,true),(e: any) => e.code === 'HASH_CONFLICT')
})
test('full manual mínimo real: draft, corrections, VALIDADA/VALIDA, ARCHIVADA + historia/audit sin efectos ajenos', async () => {
  const h = harness(); const d = await h.service.upload(file(await pdfFixture()))
  assert.equal(d.estado,'PENDIENTE_REVISION'); assert.equal(h.state.facturas.length,0); assert.match(d.nombreActual!,/^[a-f0-9]{64}\.pdf$/)
  const saved = await h.service.action(d.id,body(d,'GUARDAR',{campos:{...centsMetadata,proveedor:'Proveedor revisado'}})); assert.equal(h.state.facturas.length,0)
  const request = body(saved); const validated = await h.service.action(d.id,request)
  assert.equal(validated.estado,'VALIDADA_PENDIENTE_ARCHIVO'); assert.equal(h.state.facturas.length,1)
  const invoice = h.state.facturas[0]; assert.equal(invoice.estado,'VALIDADA'); assert.equal(invoice.calidad,'VALIDA'); assert.equal(invoice.canonKey,'CIF:B12345678|NUM:F/2026-01'); assert.equal(invoice.imputacion,undefined); assert.equal(invoice.ocrCompletado,false)
  const again = await h.service.action(d.id,request); assert.equal(again.facturaId,validated.facturaId); assert.equal(h.state.facturas.length,1)
  const ar = archiveBody(validated); const archived = await h.service.action(d.id,ar)
  assert.equal(archived.estado,'ARCHIVADA'); assert.match(archived.nombreActual!,/^2026-11-26_Proveedor-de-prueba_F-2026-01_[a-f0-9]{16}\.pdf$/)
  assert.equal(h.state.histories.length,1); assert.ok(h.state.audits.some(a => a.accion === 'DOCUMENTOS_PANEL_ARCHIVADA'))
  assert.equal((await h.service.action(d.id,ar)).estado,'ARCHIVADA'); assert.equal(h.calls.archive,1)
  const snapshot = core.snapshotOf(h.state.revisiones[0]); assert.match(snapshot.original!.ruta,/\/Pendientes\//); assert.match(snapshot.actual!.ruta,/\/Archivadas\//)
})
test('hash repetido warn/reuse, incluyendo concurrencia, jamás crea factura2', async () => {
  const h = harness(); const f = file(await pdfFixture()); const d = await h.service.upload(f)
  const repeated = await h.service.upload({ ...f, solicitudId: randomUUID(), nombreOriginal:'otra-copia.pdf' }); assert.equal(repeated.id,d.id); assert.equal(repeated.repetido,true); assert.equal(h.calls.upload,1); assert.equal(h.state.revisiones.length,1)
  const [a,b] = await Promise.all([h.service.upload({...f,solicitudId:randomUUID()}),h.service.upload({...f,solicitudId:randomUUID()})]); assert.equal(a.id,b.id); assert.equal(h.state.revisiones.length,1); assert.equal(h.state.facturas.length,0)
})
test('validación rechaza falta campo, defaults, cuadre, V/E/C y confirma explícito', async () => {
  const h = harness(); const d = await h.service.upload(file(await pdfFixture()))
  for (const campos of [{...centsMetadata,total:null},{...centsMetadata,tipoIva:null},{...centsMetadata,fecha:''},{...centsMetadata,total:120.99},{...centsMetadata,base:100.001}]) await assert.rejects(() => h.service.action(d.id,body(d,'VALIDAR',{campos})))
  await assert.rejects(() => h.service.action(d.id,body(d,'VALIDAR',{confirmacionHumana:false})),(e: any) => e.code === 'CONFIRMACION_REQUERIDA')
  h.denyConfirm(); await assert.rejects(() => h.service.action(d.id,body(d)),(e: any) => e.code === 'CONFIRM_DENIED')
  assert.equal(h.state.facturas.length,0); assert.equal(h.calls.archive,0)
})
test('409 versión stale / identidad canonical / UUID reusado con payload cambiado', async () => {
  const h = harness(); const d = await h.service.upload(file(await pdfFixture()))
  const save = body(d,'GUARDAR'); const corrected = await h.service.action(d.id,save)
  await assert.rejects(() => h.service.action(d.id,body(d)),(e: any) => e.code === 'VERSION_CONFLICT')
  await assert.rejects(() => h.service.action(d.id,{...save,campos:{...centsMetadata,total:122}}),(e: any) => e.code === 'IDEMPOTENCY_CONFLICT')
  h.state.facturas.push({id:randomUUID(),canonKey:'CIF:B12345678|NUM:F/2026-01'})
  await assert.rejects(() => h.service.action(d.id,body(corrected)),(e: any) => e.code === 'IDENTIDAD_EXISTENTE'); assert.equal(h.state.facturas.length,1)
})
test('confirming/otros pendientes no convierten ni archivan factura', async () => {
  for (const tipo of ['CONFIRMING','OTRO'] as const) { const h = harness(); const d = await h.service.upload(file(await pdfFixture(),tipo)); await assert.rejects(() => h.service.action(d.id,body(d)),(e: any) => e.code === 'TIPO_NO_FACTURA'); await assert.rejects(() => h.service.action(d.id,archiveBody(d))); assert.equal(h.state.facturas.length,0); assert.equal(h.calls.archive,0) }
})
test('Graph falla: conserva VALIDADA_PENDIENTE_ARCHIVO y reintento seguro', async () => {
  const h = harness(); const d = await validated(h); const action = archiveBody(d); h.failArchive()
  await assert.rejects(() => h.service.action(d.id,action)); const pending = await h.service.get(d.id) as any
  assert.equal(pending.estado,'VALIDADA_PENDIENTE_ARCHIVO'); assert.equal(h.state.histories.length,0); assert.equal(h.state.facturas[0].estadoCarpeta,'VALIDADA_PENDIENTE_ARCHIVO')
  h.allowArchive(); const completed = await h.service.action(d.id,action); assert.equal(completed.estado,'ARCHIVADA'); assert.equal(h.state.facturas.length,1); assert.equal(h.state.histories.length,1)
})
test('Graph movió pero DB commit falló: no falso archivado; mismo itemID reintenta', async () => {
  const h = harness(); const d = await validated(h); const action = archiveBody(d); h.failArchiveCommit()
  await assert.rejects(() => h.service.action(d.id,action)); assert.equal(core.snapshotOf(h.state.revisiones[0]).estado,'VALIDADA_PENDIENTE_ARCHIVO'); assert.equal(h.state.histories.length,0)
  assert.match(h.files.get(`item-${d.hash}`)!.location.ruta,/\/Archivadas\//)
  assert.equal((await h.service.action(d.id,action)).estado,'ARCHIVADA'); assert.equal(h.state.histories.length,1); assert.equal(h.state.facturas.length,1)
})
test('Runtime/write denegado antes de proveedor/DB y ARCHIVAR no permite campos o pointer externo', async () => {
  const h = harness(); h.denyRuntime(); await assert.rejects(() => h.service.upload(file())); assert.equal(h.calls.upload,0); assert.equal(h.state.revisiones.length,0)
  const h2 = harness(); h2.denyWrite(); await assert.rejects(() => h2.service.upload(file())); assert.equal(h2.calls.upload,0)
  const h3 = harness(); const d = await validated(h3); await assert.rejects(() => h3.service.action(d.id,{...archiveBody(d),itemId:'attacker'}),(e: any) => e.code === 'ACTION_INVALIDA'); await assert.rejects(() => h3.service.action(d.id,{...archiveBody(d),campos:centsMetadata}),(e: any) => e.code === 'ARCHIVO_METADATA')
})
function graphFake(bytes: Buffer) {
  const folders = new Map<string,any>(); const items = new Map<string,any>(); const requests: any[] = []; let occupied: any = null
  const driveId = 'drive-fixture'; let sequence = 0
  const response = (body: any, status = 200) => Response.json(body,{status})
  const transport = {
    siteDrive: async () => ({siteId:'site-fixture',driveId}), download: async (_drive: string,itemId: string) => { assert.ok(items.has(itemId)); return bytes },
    request: async (path: string, init: any = {}) => {
      requests.push({path,...init}); const method = init.method ?? 'GET'
      if (path.startsWith('/sites/')) return response({id:driveId,parentReference:{siteId:'site-fixture'}})
      const withoutQuery = decodeURIComponent(path.split('?')[0]); const component = withoutQuery.match(/\/items\/([^/:]+)(?::\/([^:]+))?(?::\/content)?$/)
      if (method === 'POST') { const payload = JSON.parse(init.body); const parentId = withoutQuery.match(/\/items\/([^/]+)\/children$/)?.[1] ?? null; const item = {id:`folder-${++sequence}`,name:payload.name,folder:{},parentReference:{id:parentId,driveId}}; folders.set(`${parentId}:${payload.name}`,item); return response(item,201) }
      if (method === 'PUT') {
        assert.equal(init.headers['if-none-match'],'*'); assert.match(path,/conflictBehavior=fail/)
        const parentId = component![1], nombre = component![2]; const item = {id:'item-fixture',name:nombre,file:{},size:bytes.length,eTag:'etag-1',parentReference:{id:parentId,driveId}}; items.set(item.id,item); return response(item,201)
      }
      if (method === 'PATCH') { const item = items.get(component![1]); assert.equal(init.headers['if-match'],item.eTag); const payload = JSON.parse(init.body); assert.equal(payload['@microsoft.graph.conflictBehavior'],'fail'); Object.assign(item,{name:payload.name,parentReference:{id:payload.parentReference.id,driveId}}); return response(item) }
      const rootName = withoutQuery.match(/\/root:\/(.+)$/)?.[1]
      if (rootName) return folders.has(`null:${rootName}`) ? response(folders.get(`null:${rootName}`)) : response({},404)
      if (component && component[2]) { const parentId = component[1], nombre = component[2]; const folder = folders.get(`${parentId}:${nombre}`); if (folder) return response(folder); if (occupied?.parentReference.id === parentId && occupied.name === nombre) return response(occupied); const item = [...items.values()].find(i => i.parentReference.id === parentId && i.name === nombre); return item ? response(item) : response({},404) }
      if (component && items.has(component[1])) return response(items.get(component[1]))
      throw Error(`UNEXPECTED_GRAPH_REQUEST:${method}:${path}`)
    },
  }
  return {transport,requests,items,occupy:(targetName: string) => { const archived = [...folders.values()].find(f => f.name === 'Archivadas'); occupied = {id:'other-item',name:targetName,file:{},size:bytes.length,parentReference:{id:archived.id,driveId}} }}
}
test('storage Graph fake: exclusive namespace, no overwrite, verify SHA256, retries same item', async () => {
  const input = file(await pdfFixture()); const graph = graphFake(input.bytes); let guards = 0
  const storage = storageModule.createDocumentosPanelStorage(async () => { guards++; return 7 },graph.transport)
  const loc = await storage.upload(input,`${input.hash}.pdf`); assert.equal(loc.hash,input.hash); assert.match(loc.ruta,/STAGING_FINANZAS_NO_CONTABILIZAR\/DocumentosPanel\/Pendientes\//)
  const target = core.standardizedName(centsMetadata,'pdf',input.hash); const archived = await storage.archive(loc,target,input)
  assert.equal(archived.itemId,loc.itemId); assert.match(archived.ruta,/\/Archivadas\//); assert.equal((await storage.archive(loc,target,input)).itemId,loc.itemId)
  assert.equal(graph.requests.filter(r => r.method === 'PATCH').length,1); assert.ok(guards > graph.requests.length)
  assert.ok(graph.requests.every(r => !/Facturas recibidas|downloadUrl|createLink/.test(r.path)))
})
test('storage destino existente fails sin PATCH ni DELETE; pointer fuera namespace rechazado', async () => {
  const input = file(await pdfFixture()); const graph = graphFake(input.bytes); const storage = storageModule.createDocumentosPanelStorage(async () => 7,graph.transport)
  const loc = await storage.upload(input,`${input.hash}.pdf`); const target = core.standardizedName(centsMetadata,'pdf',input.hash); graph.occupy(target)
  await assert.rejects(() => storage.archive(loc,target,input),(e: any) => e.code === 'DESTINO_EXISTENTE'); assert.equal(graph.requests.filter(r => r.method === 'PATCH').length,0)
  graph.items.get(loc.itemId).parentReference.id = 'production-folder'
  await assert.rejects(() => storage.original(loc,input),(e: any) => e.code === 'GRAPH_NAMESPACE')
})
test('provider dev/prod/readonly/ambiguous pins all fail closed without calling Graph', () => {
  const good = { NODE_ENV:'production', FINANCE_STAGING_SANDBOX:'1', VERCEL_ENV:'preview', SHAREPOINT_SITE_ID:'site', SHAREPOINT_DRIVE_ID:'drive' }
  storageModule.assertDocumentosPanelProviderEnvironment(good)
  for (const change of [{NODE_ENV:'development'},{VERCEL_ENV:'production'},{FINANCE_STAGING_SANDBOX:'0'},{IO_PRODUCTION_READ_ONLY:'1'},{FINANCE_DEPLOYMENT_READ_ONLY:'1'},{DRIVE_ID:'different'},{SHAREPOINT_SITE_ID:''}]) assert.throws(() => storageModule.assertDocumentosPanelProviderEnvironment({...good,...change}))
})
test('API auth contract offline: exact origin, noacting, live V/E/C, strict Stage before provider', async () => {
  let impersonation: unknown = undefined, userImpersonation: unknown = undefined, facturasConfirm = true, b4Confirm = true, runtime = 'staging'; let calls = 0
  const env = {DATABASE_URL:'postgresql://io_staging_finanzas:fake@offline/io_staging_finanzas',FINANCE_STAGING_SANDBOX:'1',VERCEL_ENV:'preview',FINANCE_EASY_PRODUCTION_ENABLED:'0',FINANCE_MODEL_PRODUCTION_ENABLED:'0'}
  const module = execute('lib/finanzas/documentos-panel.ts', {
    '@prisma/client':{Prisma:{sql:()=>({})}}, '@/lib/prisma':{__esModule:true,default:{}}, '@/lib/permisos':{verificarPermisoServer:async (_actor: any,area: string) => ({lectura:true,escritura:true,confirmar:area === 'facturas' ? facturasConfirm : b4Confirm})},
    '@/lib/area4/live-admin':{requireArea4Capability:async()=>({ok:true,principal:{id:7},session:{impersonation,user:{impersonation:userImpersonation}}})},
    './documentos-panel-runtime':{...runtimePolicy,assertDocumentosPanelRuntime:(write:boolean)=>runtimePolicy.assertDocumentosPanelRuntime(write,env)},
    './invoice-quality-db':{AREA_FACTURAS_B2:'facturas',requireFacturaAccess:async()=>({userId:7,session:{impersonation,user:{impersonation:userImpersonation}}}),buscarIdentidadBloqueada:async()=>[],jsonPrivado:(v:any,s=200)=>Response.json(v,{status:s})},
    './reconciliation-auth':{B4_CONCILIACION_AREA:'b4',requireB4ActorAccess:async()=>({ok:true})},
    './prototype-staging':{assertPrototypeStaging:async()=>{calls++},assertFinanceEasyRuntime:async()=>({runtime})}, './finance-runtime-safety':{assertFinanceRuntimeReady:async()=>{calls++}},
    './documentos-panel-core':core,'./documentos-panel-storage':{createDocumentosPanelStorage:()=>({})},
    './documentos-production-selected':{assertDocumentosProductionTransportConfigured:()=>{throw Error('UNEXPECTED_PRODUCTION_BINDING')}},
  },env)
  const req: any = {headers:new Headers({origin:'https://stage.example','sec-fetch-site':'same-origin'}),nextUrl:new URL('https://stage.example/api/admin/finanzas/documentos')}
  module.assertDocumentosPanelRequest(req,true)
  assert.throws(() => module.assertDocumentosPanelRequest({...req,headers:new Headers({origin:'https://evil.example'})},true),(e: any)=>e.code==='ORIGIN_INVALIDO')
  assert.throws(() => module.assertDocumentosPanelRequest({...req,headers:new Headers({'x-io-acting-session':'x'})}),(e:any)=>e.code==='ACTING_NOT_ALLOWED')
  assert.throws(() => module.assertDocumentosPanelRequest({...req,headers:new Headers({'x-io-acting-session':''})}),(e:any)=>e.code==='ACTING_NOT_ALLOWED')
  for (const headers of [new Headers(),new Headers({origin:'https://stage.example'}),new Headers({'sec-fetch-site':'same-origin'}),new Headers({origin:'https://stage.example','sec-fetch-site':'cross-site'}),new Headers({origin:'https://stage.example','sec-fetch-site':'same-site'}),new Headers({origin:'null','sec-fetch-site':'same-origin'})]) assert.throws(()=>module.assertDocumentosPanelRequest({...req,headers},true),(e:any)=>e.code==='ORIGIN_INVALIDO')
  assert.throws(()=>module.assertDocumentosPanelRequest({nextUrl:new URL('http://stage.example'),headers:new Headers({origin:'http://stage.example','sec-fetch-site':'same-origin'})},true),(e:any)=>e.code==='ORIGIN_INVALIDO')
  module.assertDocumentosPanelRequest({...req,headers:new Headers()},false)
  const valid = await module.createDocumentosPanelForRequest(req,true,true); assert.ok(valid.service); assert.ok(calls >= 2)
  for (const claim of [{},false,0,'']) { impersonation=claim; await assert.rejects(()=>module.createDocumentosPanelForRequest(req),(e:any)=>e.code==='ACTING_NOT_ALLOWED') }
  impersonation=undefined
  for (const claim of [{},false,0,'']) { userImpersonation=claim; await assert.rejects(()=>module.createDocumentosPanelForRequest(req),(e:any)=>e.code==='ACTING_NOT_ALLOWED') }
  userImpersonation=undefined
  facturasConfirm=false; await assert.rejects(()=>module.createDocumentosPanelForRequest(req,true,true),(e:any)=>e.code==='PERMISO_V_E_C'); facturasConfirm=true
  b4Confirm=false; await assert.rejects(()=>module.createDocumentosPanelForRequest(req,true,true),(e:any)=>e.code==='PERMISO_V_E_C'); b4Confirm=true
  runtime='production'; await assert.rejects(()=>module.createDocumentosPanelForRequest(req),(e:any)=>e.code==='DOCUMENTOS_PANEL_STAGE_ONLY')
})
test('UI inert mount and source restrictions: only authorized new paths; no external OCR, auth/config/native edits', () => {
  const ui = readFileSync('components/finanzas/conciliar-unificado/DocumentosPanel.tsx','utf8'); assert.doesNotMatch(ui,/useEffect|value="NOMINA"/); assert.match(ui,/original=true/); assert.match(ui,/Copiar SHA256/)
  const source = ['lib/finanzas/documentos-panel-core.ts','lib/finanzas/documentos-panel-storage.ts','lib/finanzas/documentos-panel.ts'].map(f=>readFileSync(f,'utf8')).join('\n')
  assert.doesNotMatch(source,/from ['"].*(?:openai|ocr-facturas|onedrive-tickets|native-engine|sync-jobs)/); assert.doesNotMatch(source,/\.(?:delete|deleteMany)\(/)
  assert.match(source,/FINANCE_DEPLOYMENT_READ_ONLY/); assert.match(source,/IO_PRODUCTION_READ_ONLY/); assert.match(source,/assertPrototypeStaging/); assert.match(source,/requireArea4Capability/)
})

test('misma saga fake en raíz Production: hash idempotente, validación humana, Graph movido + fallo DB recuperable', async () => {
  const h = harness(core.DOCUMENTOS_PRODUCTION_ROOT); const d = await validated(h); const action = archiveBody(d); h.failArchiveCommit()
  await assert.rejects(() => h.service.action(d.id, action)); assert.equal(core.snapshotOf(h.state.revisiones[0]).estado, 'VALIDADA_PENDIENTE_ARCHIVO')
  assert.equal((await h.service.action(d.id, action)).estado, 'ARCHIVADA'); assert.equal(h.state.histories.length, 1); assert.equal(h.state.facturas.length, 1)
  assert.match(h.state.facturas[0].archivoOneDrive, /^DocumentosPanelProduccion\/Archivadas\//)
  const same = core.createDocumentosPanelService({ db: h.db, provider: {} as any, guard: async () => 7, lock: async () => {}, canonical: async () => [] })
  await assert.rejects(() => same.get(d.id), (e:any) => e.code === 'DOCUMENTOS_NAMESPACE_MISMATCH')
})

function assertReceipt(h: ReturnType<typeof harness>, solicitudId: string, actorId = 7) {
  const receipts = h.state.audits.filter(a => a.actorId === actorId && a.solicitudId === solicitudId)
  assert.equal(receipts.length,1)
  for (const audit of h.state.audits.filter(a => a.actorId === actorId && a.detalle.solicitudId === solicitudId)) {
    const expected = core.hashBytes(Buffer.from(JSON.stringify({ schema: core.DOCUMENTOS_PANEL_SCHEMA, root: audit.detalle.root, comando: audit.detalle.comando, huella: audit.detalle.huella, fase: audit.solicitudId === null ? audit.detalle.fase : 'COMANDO' })))
    assert.equal(audit.huellaSolicitud,expected)
    assert.equal(audit.detalle.actorId,undefined)
  }
  return receipts[0]
}
test('fake reproduce índice parcial B2 exacto: global por actor/UUID y múltiples null permitidos', async () => {
  const h = fakeDb(); const solicitudId = randomUUID(); const create = (actorId: number | null, solicitud: string | null, accion = 'UNO') => h.db.auditoriaCalidadFactura.create({ data: { actorId, solicitudId: solicitud, accion, revisionId: randomUUID() } })
  assert.match(readFileSync('prisma/migrations/20261022_b2_invoice_quality/migration.sql','utf8'),/CREATE UNIQUE INDEX "auditoria_calidad_facturas_actor_id_solicitud_id_key" ON "auditoria_calidad_facturas"\("actor_id", "solicitud_id"\) WHERE "actor_id" IS NOT NULL AND "solicitud_id" IS NOT NULL/)
  await create(7,solicitudId)
  await assert.rejects(() => create(7,solicitudId,'OTRA_REVISION_Y_ACCION'),(e: any) => e.code === 'P2002')
  await create(8,solicitudId); await create(7,null); await create(7,null); await create(null,solicitudId); await create(null,solicitudId)
  assert.equal(h.state.audits.length,6)
})
test('subida mismo UUID replay sin duplicar recibos, eventos, versión ni provider', async () => {
  const h = harness(); const input = file(); const d = await h.service.upload(input); const before = structuredClone(h.state)
  assert.equal((await h.service.upload(input)).id,d.id); assert.deepEqual(h.state,before); assert.equal(h.calls.upload,1); assert.equal(h.calls.created,1)
  const receipt = assertReceipt(h,input.solicitudId)
  const original = h.state.audits.find(a => a.accion === 'DOCUMENTOS_PANEL_ORIGINAL_VERIFICADO')!
  assert.equal(original.solicitudId,null); assert.equal(original.detalle.solicitudId,input.solicitudId); assert.notEqual(original.huellaSolicitud,receipt.huellaSolicitud)
})
test('subida UUID reutilizado con bytes/tipo/nombre diferentes: conflicto antes de segundo proveedor', async () => {
  const h = harness(); const input = file(); await h.service.upload(input)
  for (const changed of [{...input,bytes:Buffer.from('%PDF-1.7\nchanged')},{...input,tipo:'OTRO' as const},{...input,nombreOriginal:'cambio.pdf'}]) await assert.rejects(() => h.service.upload(changed),(e: any) => e.code === 'IDEMPOTENCY_CONFLICT')
  assert.equal(h.calls.upload,1); assert.equal(h.state.revisiones.length,1); assertReceipt(h,input.solicitudId)
})
test('recibo global B2 rechaza UUID entre fases y documentos antes de escritura', async () => {
  const h = harness(); const input = file(); const d = await h.service.upload(input)
  await assert.rejects(() => h.service.action(d.id,body(d,'GUARDAR',{solicitudId:input.solicitudId})),(e: any) => e.code === 'IDEMPOTENCY_CONFLICT')
  const save = body(d,'GUARDAR'); const saved = await h.service.action(d.id,save)
  await assert.rejects(() => h.service.action(d.id,body(saved,'VALIDAR',{solicitudId:save.solicitudId})),(e: any) => e.code === 'IDEMPOTENCY_CONFLICT')
  const other = await h.service.upload(file(Buffer.from('%PDF-1.7\nother')))
  await assert.rejects(() => h.service.action(other.id,body(other,'GUARDAR',{solicitudId:save.solicitudId})),(e: any) => e.code === 'IDEMPOTENCY_CONFLICT')
  assert.equal(h.state.facturas.length,0); assertReceipt(h,save.solicitudId)
})
test('recibo guardar: metadata normalizada y versión pedida pertenecen a huella determinista', async () => {
  const h = harness(); const d = await h.service.upload(file()); const request = body(d,'GUARDAR'); const saved = await h.service.action(d.id,request)
  const before = structuredClone(h.state); const normalized = {...request,campos:{...centsMetadata,proveedor:'  Proveedor de prueba  '}}
  assert.equal((await h.service.action(d.id,normalized)).version,saved.version); assert.deepEqual(h.state,before)
  await assert.rejects(() => h.service.action(d.id,{...request,version:saved.version}),(e: any) => e.code === 'IDEMPOTENCY_CONFLICT')
  assertReceipt(h,request.solicitudId)
})
test('huella no es identificador personal: mismos datos/comando y UUID compartido por actores distintos', async () => {
  const h = harness(); const input = file(); await h.service.upload(input); h.actor(8); await h.service.upload(input)
  const first = assertReceipt(h,input.solicitudId,7), second = assertReceipt(h,input.solicitudId,8)
  assert.equal(first.detalle.huella,second.detalle.huella); assert.equal(first.huellaSolicitud,second.huellaSolicitud); assert.equal(h.calls.upload,1)
})
for (const root of [core.DOCUMENTOS_PANEL_ROOT,core.DOCUMENTOS_PRODUCTION_ROOT]) {
  test(`subida Graph hecha + commit SQL falla, retry misma solicitud/item/bytes y sin falso éxito (${root})`, async () => {
    const h = harness(root); const input = file(); h.failUploadCommit()
    await assert.rejects(() => h.service.upload(input),/SIMULATED_UPLOAD_DB_COMMIT_FAILURE/)
    const pending = await h.service.get(h.state.revisiones[0].id) as any
    assert.equal(pending.estado,'SUBIDA_RESERVADA'); assert.equal(pending.originalDisponible,false); assert.equal(h.state.facturas.length,0); assert.equal(h.calls.created,1)
    assert.equal(h.state.audits.filter(a => a.accion === 'DOCUMENTOS_PANEL_ORIGINAL_VERIFICADO').length,0)
    await assert.rejects(() => h.service.get(pending.id,true),(e: any) => e.code === 'ORIGINAL_NO_DISPONIBLE')
    const same = await h.service.upload(input); assert.equal(same.id,pending.id); assert.equal(same.estado,'PENDIENTE_REVISION'); assert.equal(h.calls.created,1)
    assert.equal((await h.service.upload(input)).version,same.version); assert.equal(h.calls.upload,2); assert.equal(h.state.revisiones.length,1); assertReceipt(h,input.solicitudId)
  })
  test(`archivo dos fallos SQL tras Graph y retry/doblearchivo: 1 historia, 1 factura, 1 move (${root})`, async () => {
    const h = harness(root); const d = await validated(h); const request = archiveBody(d)
    for (let attempt = 0; attempt < 2; attempt++) {
      h.failArchiveCommit(); await assert.rejects(() => h.service.action(d.id,request),/SIMULATED_DB_COMMIT_FAILURE/)
      assert.equal((await h.service.get(d.id) as any).estado,'VALIDADA_PENDIENTE_ARCHIVO'); assert.equal(h.state.histories.length,0); assert.equal(h.state.facturas[0].estadoCarpeta,'VALIDADA_PENDIENTE_ARCHIVO')
      assert.equal(h.state.audits.filter(a => a.accion === 'DOCUMENTOS_PANEL_ARCHIVADA').length,0); assertReceipt(h,request.solicitudId)
    }
    const archived = await h.service.action(d.id,request); assert.equal(archived.estado,'ARCHIVADA'); const before = structuredClone(h.state)
    assert.equal((await h.service.action(d.id,request)).estado,'ARCHIVADA'); assert.deepEqual(h.state,before)
    const second = archiveBody(archived); assert.equal((await h.service.action(d.id,second)).estado,'ARCHIVADA'); assert.equal((await h.service.action(d.id,second)).estado,'ARCHIVADA')
    assert.equal(h.calls.archive,3); assert.equal(h.calls.moved,1); assert.equal(h.state.facturas.length,1); assert.equal(h.state.histories.length,1)
    assertReceipt(h,request.solicitudId); assertReceipt(h,second.solicitudId)
    const events = h.state.audits.filter(a => a.detalle.solicitudId === request.solicitudId && a.accion === 'DOCUMENTOS_PANEL_ARCHIVO_FALLO')
    assert.equal(events.length,2); assert.equal(events[0].huellaSolicitud,events[1].huellaSolicitud); assert.equal(events[0].solicitudId,null)
  })
}
test('subida Graph falla: mismo UUID recupera reserva; otro UUID no fabrica original', async () => {
  const h = harness(); const input = file(); h.failUpload(); await assert.rejects(() => h.service.upload(input),/SIMULATED_UPLOAD_GRAPH_FAILURE/)
  const second = {...input,solicitudId:randomUUID()}; const pending = await h.service.upload(second)
  assert.equal(pending.estado,'SUBIDA_RESERVADA'); assert.equal(pending.originalDisponible,false); assert.equal(h.calls.upload,1)
  h.allowUpload(); const d = await h.service.upload(input); assert.equal(d.id,pending.id); assert.equal(d.estado,'PENDIENTE_REVISION'); assert.equal(h.calls.created,1)
  const before = structuredClone(h.state); await h.service.upload(second); assert.deepEqual(h.state,before); assertReceipt(h,input.solicitudId); assertReceipt(h,second.solicitudId)
})
test('subida concurrente misma solicitud reserva lease; segunda no ejecuta IO', async () => {
  const h = harness(); const input = file(); let release!: () => void, entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), wait = new Promise<void>(resolve => { release = resolve })
  h.afterUpload(async () => { entered(); await wait })
  const first = h.service.upload(input); await ready
  await assert.rejects(() => h.service.upload(input),(e: any) => e.code === 'SUBIDA_EN_CURSO')
  assert.equal(h.calls.upload,1); release(); const d = await first; assert.equal(d.estado,'PENDIENTE_REVISION'); assertReceipt(h,input.solicitudId)
})
test('archive concurrente mismo UUID y otro UUID no ejecuta segundo IO ni roba reserva', async () => {
  const h = harness(); const d = await validated(h); const request = archiveBody(d); let release!: () => void, entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve }), wait = new Promise<void>(resolve => { release = resolve })
  h.afterArchive(async () => { entered(); await wait }); const first = h.service.action(d.id,request); await ready
  await assert.rejects(() => h.service.action(d.id,request),(e: any) => e.code === 'ARCHIVO_EN_CURSO')
  await assert.rejects(() => h.service.action(d.id,archiveBody(d)),(e: any) => e.code === 'RESERVA_CONFLICT')
  assert.equal(h.calls.archive,1); release(); assert.equal((await first).estado,'ARCHIVADA'); assert.equal(h.state.histories.length,1); assertReceipt(h,request.solicitudId)
})
test('archivo fallido no acepta UUID sustituto ni actor diferente aunque expire lease', async () => {
  const h = harness(); const d = await validated(h); const request = archiveBody(d); h.failArchive(); await assert.rejects(() => h.service.action(d.id,request)); h.advance(); h.allowArchive()
  const pending = await h.service.get(d.id) as any
  await assert.rejects(() => h.service.action(d.id,archiveBody(pending)),(e: any) => e.code === 'RESERVA_CONFLICT')
  h.actor(8); await assert.rejects(() => h.service.action(d.id,request),(e: any) => e.code === 'RESERVA_CONFLICT'); h.actor(7)
  assert.equal(h.calls.archive,1); assert.equal((await h.service.action(d.id,request)).estado,'ARCHIVADA'); assert.equal(h.state.histories.length,1)
})
test('finalización subida token cambiado durante Graph: no original ni éxito, retry recupera mismo item', async () => {
  const h = harness(); const input = file(); h.afterUpload(() => {
    const row = h.state.revisiones[0], snapshot = core.snapshotOf(row); snapshot.subida!.token = randomUUID(); snapshot.subida!.leaseUntil = 0; row.datosOcrRaw = JSON.stringify(snapshot); row.version++
  })
  await assert.rejects(() => h.service.upload(input),(e: any) => e.code === 'RESERVA_CONFLICT')
  assert.equal(core.snapshotOf(h.state.revisiones[0]).original,null); assert.equal(h.state.audits.filter(a => a.accion === 'DOCUMENTOS_PANEL_ORIGINAL_VERIFICADO').length,0)
  h.afterUpload(); assert.equal((await h.service.upload(input)).estado,'PENDIENTE_REVISION'); assert.equal(h.calls.created,1)
})
test('finalización archivo token cambiado durante Graph: no historia/factura actualizada ni falso éxito', async () => {
  const h = harness(); const d = await validated(h); const request = archiveBody(d); h.afterArchive(() => {
    const row = h.state.revisiones[0], snapshot = core.snapshotOf(row); snapshot.archivo!.token = randomUUID(); snapshot.archivo!.leaseUntil = 0; row.datosOcrRaw = JSON.stringify(snapshot); row.version++
  })
  await assert.rejects(() => h.service.action(d.id,request),(e: any) => e.code === 'RESERVA_CONFLICT')
  assert.equal((await h.service.get(d.id) as any).estado,'VALIDADA_PENDIENTE_ARCHIVO'); assert.equal(h.state.histories.length,0); assert.equal(h.state.facturas[0].estadoCarpeta,'VALIDADA_PENDIENTE_ARCHIVO')
  h.afterArchive(); assert.equal((await h.service.action(d.id,request)).estado,'ARCHIVADA'); assert.equal(h.calls.moved,1)
})
test('revocación de escritura durante Graph preserva reserva pendiente y lease; retry autorizado recupera', async () => {
  const h = harness(); const input = file(); h.afterUpload(() => h.denyWrite())
  await assert.rejects(() => h.service.upload(input),(e: any) => e.code === 'WRITE_DENIED'); assert.equal(core.snapshotOf(h.state.revisiones[0]).estado,'SUBIDA_RESERVADA')
  h.allowWrite(); h.afterUpload(); h.advance(); assert.equal((await h.service.upload(input)).estado,'PENDIENTE_REVISION'); assert.equal(h.calls.created,1)
})
test('actor cambia durante Graph: no commit ni recibo auxiliar bajo otra persona', async () => {
  const h = harness(); const d = await validated(h); const request = archiveBody(d); h.afterArchive(() => h.actor(8))
  await assert.rejects(() => h.service.action(d.id,request),(e: any) => e.code === 'ACTOR_CHANGED')
  assert.equal(h.state.histories.length,0); assert.equal(h.state.audits.some(a => a.actorId === 8),false)
  h.actor(7); h.afterArchive(); h.advance(); assert.equal((await h.service.action(d.id,request)).estado,'ARCHIVADA'); assert.equal(h.calls.moved,1)
})
test('serialización SQL abortada se reintenta limitada sin repetir Graph, factura o historia', async () => {
  const h = harness(); const input = file(); h.abortUploadFinal(); const d = await h.service.upload(input)
  assert.equal(h.calls.upload,1); assertReceipt(h,input.solicitudId)
  h.abortSerial(2); const request = body(d); const v = await h.service.action(d.id,request); assert.equal(h.state.facturas.length,1); assertReceipt(h,request.solicitudId)
  h.abortArchiveFinal(); const ar = archiveBody(v); assert.equal((await h.service.action(d.id,ar)).estado,'ARCHIVADA'); assert.equal(h.calls.archive,1); assert.equal(h.state.histories.length,1); assertReceipt(h,ar.solicitudId)
})
test('serialización persistente falla cerrada y deja retry explícito, no contador de éxito', async () => {
  const h = harness(); const input = file(); h.abortSerial(3)
  await assert.rejects(() => h.service.upload(input),(e: any) => e.code === 'P2034'); assert.equal(h.state.revisiones.length,0); assert.equal(h.state.audits.length,0); assert.equal(h.calls.upload,0)
  assert.equal((await h.service.upload(input)).estado,'PENDIENTE_REVISION'); assert.equal(h.state.revisiones.length,1); assertReceipt(h,input.solicitudId)
})

test('subida provider devuelve hash/item incompleto: no receipt de verificación ni estado completo', async () => {
  const h = harness(); const input = file(); h.afterUpload(() => { h.files.get(`item-${input.hash}`)!.location.parentId = '' })
  await assert.rejects(() => h.service.upload(input),(e: any) => e.code === 'UPLOAD_NO_VERIFICADO')
  assert.equal(core.snapshotOf(h.state.revisiones[0]).estado,'SUBIDA_RESERVADA'); assert.equal(core.snapshotOf(h.state.revisiones[0]).original,null)
  assert.equal(h.state.audits.some(a => a.accion === 'DOCUMENTOS_PANEL_ORIGINAL_VERIFICADO'),false); assertReceipt(h,input.solicitudId)
})
test('archive provider devuelve otro item: no cambia invoice/historial ni fabrica ARCHIVADA', async () => {
  const h = harness(); const d = await validated(h); const request = archiveBody(d)
  h.afterArchive(() => { h.files.get(`item-${d.hash}`)!.location.itemId = 'foreign-item' })
  await assert.rejects(() => h.service.action(d.id,request),(e: any) => e.code === 'ARCHIVO_NO_VERIFICADO')
  assert.equal((await h.service.get(d.id) as any).estado,'VALIDADA_PENDIENTE_ARCHIVO'); assert.equal(h.state.histories.length,0); assert.equal(h.state.facturas[0].estadoCarpeta,'VALIDADA_PENDIENTE_ARCHIVO')
  assert.equal(h.state.audits.some(a => a.accion === 'DOCUMENTOS_PANEL_ARCHIVADA'),false); assertReceipt(h,request.solicitudId)
  h.afterArchive(); h.files.get(`item-${d.hash}`)!.location.itemId = `item-${d.hash}`
  assert.equal((await h.service.action(d.id,request)).estado,'ARCHIVADA'); assert.equal(h.state.histories.length,1); assert.equal(h.state.facturas.length,1)
})
test('receipt de otro circuito B2 o formato previo nunca se interpreta como éxito del panel', async () => {
  const h = harness(); const input = file(); h.state.audits.push({id:randomUUID(),actorId:7,solicitudId:input.solicitudId,accion:'VALIDAR_FACTURA_B2',huellaSolicitud:'legacy',detalle:{}})
  await assert.rejects(() => h.service.upload(input),(e: any) => e.code === 'IDEMPOTENCY_CONFLICT'); assert.equal(h.calls.upload,0); assert.equal(h.state.revisiones.length,0)
})
test('ARCHIVADA persistida con actual distinto del original: replay falla cerrado sin provider', async () => {
  const h = harness(); const d = await validated(h); const request = archiveBody(d); await h.service.action(d.id,request)
  const row = h.state.revisiones[0], snapshot = core.snapshotOf(row); snapshot.actual!.itemId = 'foreign-item'; row.datosOcrRaw = JSON.stringify(snapshot)
  await assert.rejects(() => h.service.action(d.id,request),(e: any) => e.code === 'ARCHIVO_NO_VERIFICADO'); assert.equal(h.calls.archive,1); assert.equal(h.state.histories.length,1)
})
