/** Offline policy provider: no process env changes, SQL, real auth, or Graph calls. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as core from '../lib/finanzas/documentos-panel-core'
import * as runtime from '../lib/finanzas/documentos-panel-runtime'
import * as comparison from '../lib/finanzas/documentos-panel-comparacion'
function load(file: string, imports: Record<string, unknown>) {
  const module = { exports: {} as any }
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, Buffer, URL, URLSearchParams, Response, Headers, Uint8Array, AbortSignal, Date, console, process: { env: {} }, fetch: () => { throw Error('LIVE_FETCH_FORBIDDEN') }, require: (name: string) => { if (!(name in imports)) throw Error(`UNEXPECTED_IMPORT:${name}`); return imports[name] } })
  return module.exports
}
const selected = load('lib/finanzas/documentos-production-selected.ts', { 'server-only': {}, './documentos-panel-core': core, './documentos-panel-runtime': runtime })
const productionComparison = load('lib/finanzas/documentos-production-comparacion.ts', { 'server-only': {}, 'node:crypto': require('node:crypto'), './documentos-panel-core': core, './documentos-panel-runtime': runtime, './documentos-panel-comparacion': comparison, './documentos-production-selected': selected })
const storageModule = load('lib/finanzas/documentos-panel-storage.ts', { './microsoft-graph': { getAccessToken: () => { throw Error('GENERIC_TOKEN_FORBIDDEN') } }, './descarga-privada-graph': {}, './documentos-panel-core': core, './documentos-panel-runtime': runtime, './documentos-production-selected': selected })
const tenant = '11111111-1111-4111-8111-111111111111', writeApp = '22222222-2222-4222-8222-222222222222', readApp = '33333333-3333-4333-8333-333333333333'
const LEGACY = '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026'
const pins = { driveId: 'production-drive', folderItemId: 'production-panel' }
const sourceRoot = { driveId: pins.driveId, folderItemId: 'legacy-folder', relativeLabel: LEGACY }
const env = { FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: pins.driveId, FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID: pins.folderItemId,
  FINANCE_DOCUMENTOS_GRAPH_TENANT_ID: tenant, FINANCE_DOCUMENTOS_GRAPH_CLIENT_ID: writeApp, FINANCE_DOCUMENTOS_GRAPH_CLIENT_SECRET: 'OFFLINE_SYNTHETIC_WRITE_SECRET',
  FINANCE_DOCUMENTOS_COMPARACION_GRAPH_TENANT_ID: tenant, FINANCE_DOCUMENTOS_COMPARACION_GRAPH_CLIENT_ID: readApp, FINANCE_DOCUMENTOS_COMPARACION_GRAPH_CLIENT_SECRET: 'OFFLINE_SYNTHETIC_READ_SECRET',
  FINANCE_DOCUMENTOS_COMPARACION_SELECTED_ROOTS: JSON.stringify([sourceRoot]) }
const credential = selected.selectedCredential(env,'FINANCE_DOCUMENTOS_GRAPH')
function jwt(app = writeApp, changes: any = {}) {
  const claims = { aud: '00000003-0000-0000-c000-000000000000', tid: tenant, appid: app, iss: `https://sts.windows.net/${tenant}/`, roles: ['Files.SelectedOperations.Selected'], exp: Math.floor(Date.now()/1000)+3600, ...changes }
  return `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.c3ludGhldGlj`
}
const bytes = Buffer.from('%PDF-1.7\nSYNTHETIC_NATIVE_SELECTED')
function provider(options: { missingGrant?: boolean; secondPageError?: boolean; badNext?: string; wrongChildDrive?: boolean; rootName?: string; redirect?: string } = {}) {
  const items = new Map<string, any>()
  const folder = (id: string,name: string,parent: string) => ({ id,name,folder:{},parentReference:{id:parent,driveId:pins.driveId} })
  const file = (id: string,name: string,parent: string) => ({id,name,file:{},size:bytes.length,eTag:'etag-1',lastModifiedDateTime:'2026-12-01T00:00:00Z',parentReference:{id:parent,driveId:pins.driveId}})
  items.set(pins.folderItemId,folder(pins.folderItemId,options.rootName ?? 'DocumentosPanelProduccion','unit-root'))
  items.set('pending-folder',folder('pending-folder','Pendientes',pins.folderItemId))
  items.set('archive-folder',folder('archive-folder','Archivadas',pins.folderItemId))
  items.set(sourceRoot.folderItemId,folder(sourceRoot.folderItemId,'2026','legacy-parent'))
  items.set('source-nested',folder('source-nested','Subcarpeta',sourceRoot.folderItemId))
  items.set('legacy-file',file('legacy-file','a.pdf',sourceRoot.folderItemId))
  items.set('nested-file',file('nested-file','b.pdf','source-nested'))
  items.set('unrelated-file',file('unrelated-file','SECRET_OUTSIDE.pdf','outside-root'))
  const calls: Array<{ url: URL; method: string; headers: Headers }> = []
  const ancestor = (item: any, root: string): boolean => item?.id === root || !!(item?.parentReference?.id && items.has(item.parentReference.id) && ancestor(items.get(item.parentReference.id),root))
  const fetchFake = async (urlValue: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(urlValue)), method = init.method ?? 'GET', headers = new Headers(init.headers)
    calls.push({url,method,headers})
    if (url.hostname === 'login.microsoftonline.com') {
      assert.equal(url.href,`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`); assert.equal(method,'POST'); assert.equal(init.redirect,'error')
      const body = new URLSearchParams(init.body as string); assert.equal(body.get('scope'),'https://graph.microsoft.com/.default'); assert.equal(body.get('grant_type'),'client_credentials')
      return Response.json({token_type:'Bearer',access_token:jwt(body.get('client_id')!)})
    }
    if (url.hostname !== 'graph.microsoft.com') { assert.equal(headers.has('authorization'),false); assert.equal(init.redirect,'error'); return new Response(bytes) }
    assert.ok(url.pathname.startsWith(`/v1.0/drives/${pins.driveId}/items/`)); assert.doesNotMatch(url.pathname,/\/root|\/sites\/|\/users\/|\/permissions|createLink/)
    const token = headers.get('authorization')!.slice(7), claims = JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString())
    assert.deepEqual(claims.roles,['Files.SelectedOperations.Selected'])
    const root = claims.appid === writeApp ? pins.folderItemId : claims.appid === readApp ? sourceRoot.folderItemId : 'FORBIDDEN'
    const clean = decodeURIComponent(url.pathname)
    const match = clean.match(/\/items\/([^/:]+)(?::\/([^:]+))?(?:(:\/content)|\/(children|content))?$/)!
    const id = match[1], child = match[2], resource = match[4], item = items.get(id)
    // Grant check is provider-side, not a permissive fake. Even a valid Selected
    // token cannot read another root, ancestors, or a disjoint scope.
    if (options.missingGrant || !ancestor(item,root)) return Response.json({error:'grant denied'},{status:403})
    if (claims.appid === readApp && method !== 'GET') return Response.json({error:'read grant'},{status:403})
    if (method === 'PUT') { assert.equal(id,'pending-folder'); assert.equal(headers.get('if-none-match'),'*'); const value = file('uploaded-item',child,id); items.set(value.id,value); return Response.json(value,{status:201}) }
    if (method === 'PATCH') { const body = JSON.parse(init.body as string); assert.ok(ancestor(items.get(body.parentReference.id),root)); Object.assign(item,{name:body.name,parentReference:{id:body.parentReference.id,driveId:pins.driveId}}); return Response.json(item) }
    if (resource === 'content') return options.redirect ? new Response(null,{status:302,headers:{location:options.redirect}}) : new Response(bytes)
    if (resource === 'children') {
      if (url.searchParams.has('$skiptoken') && options.secondPageError) return Response.json({error:'page two failure'},{status:503})
      const all = [...items.values()].filter(value => value.parentReference.id === id)
      const first = !url.searchParams.has('$skiptoken')
      const paged = id === sourceRoot.folderItemId && first ? all.slice(0,1) : id === sourceRoot.folderItemId ? all.slice(1) : all
      const value = paged.map(x => options.wrongChildDrive ? {...x,parentReference:{...x.parentReference,driveId:'wrong-drive'}} : x)
      return Response.json({ value, ...(id === sourceRoot.folderItemId && first ? {'@odata.nextLink': options.badNext ?? `${url.origin}${url.pathname}?$select=${url.searchParams.get('$select')}&$top=200&$skiptoken=PAGE2`} : {}) })
    }
    if (child) { const found = [...items.values()].find(x => x.parentReference.id === id && x.name === child); return found ? Response.json(found) : Response.json({}, {status:404}) }
    return Response.json(item)
  }
  return {fetch:fetchFake as typeof fetch,calls,items}
}
const root = { ...pins,relativeLabel:'DocumentosPanelProduccion' }
const guard = async () => {}
const rejectsCode = (code: string) => (error: any) => error.code === code

test('dedicated auth default CLOSED, exact tenant UUID endpoint and no generic fallback', async () => {
  for (const change of [{FINANCE_DOCUMENTOS_GRAPH_TENANT_ID:''},{FINANCE_DOCUMENTOS_GRAPH_TENANT_ID:'common'},{FINANCE_DOCUMENTOS_GRAPH_TENANT_ID:'organizations'},{FINANCE_DOCUMENTOS_GRAPH_TENANT_ID:'../evil'},{FINANCE_DOCUMENTOS_GRAPH_CLIENT_ID:'alias'},{FINANCE_DOCUMENTOS_GRAPH_CLIENT_SECRET:''}]) assert.throws(()=>selected.selectedCredential({...env,...change},'FINANCE_DOCUMENTOS_GRAPH'),rejectsCode('DOCUMENTOS_SELECTED_AUTH_MISSING'))
  assert.throws(()=>selected.selectedCredential({MICROSOFT_GRAPH_TENANT_ID:tenant,MICROSOFT_GRAPH_CLIENT_ID:writeApp,MICROSOFT_GRAPH_CLIENT_SECRET:'GENERIC'},'FINANCE_DOCUMENTOS_GRAPH'),rejectsCode('DOCUMENTOS_SELECTED_AUTH_MISSING'))
  const fake = provider(), transport = selected.createDocumentosProductionTransport(pins,guard,env,{fetch:fake.fetch})
  await transport.listRoot(root)
  assert.equal(fake.calls.filter(c=>c.url.hostname==='login.microsoftonline.com').length,1)
  assert.equal(fake.calls.filter(c=>c.url.hostname==='graph.microsoft.com').length,4)
})
test('Selected roles exact only: missing/All/broad/delegated/foreign/expired rejected before Graph',async()=>{
  for (const change of [{roles:[]},{roles:['Files.Read.All']},{roles:['Files.SelectedOperations.Selected','Files.ReadWrite.All']},{roles:['Sites.Read.All']},{roles:['Sites.Selected']},{roles:['ListItems.SelectedOperations.Selected']},{roles:['Files.SelectedOperations.Selected','Mail.Read']},{scp:'Files.Read'},{tid:readApp},{appid:readApp},{aud:'https://evil.test'},{iss:'https://evil.test'},{exp:1}]) {
    const fake=provider(), transport=selected.createSelectedTransport(credential,[root],false,{guard,fetch:fake.fetch,tokenProvider:async()=>jwt(writeApp,change)})
    await assert.rejects(()=>transport.listRoot(root)); assert.equal(fake.calls.length,0)
  }
})
test('unknown/outside IDs, roots/site discovery and wrong paths rejected with zero fetch',async()=>{
  const fake=provider(), transport=selected.createSelectedTransport(credential,[root],false,{guard,fetch:fake.fetch,tokenProvider:async()=>jwt()})
  for(const path of ['/drives/production-drive/root/children','/sites/any/drives','/drives/other-drive/items/production-panel','/drives/production-drive/items/unrelated-file','/drives/production-drive/items/production-panel/permissions','//evil.test/foo','/drives/production-drive/items/production-panel?%24select=id,webUrl']) await assert.rejects(()=>transport.request(path))
  assert.equal(fake.calls.length,0)
  // Provider proves two grants are disjoint independently from local policy.
  assert.equal((await fake.fetch(`https://graph.microsoft.com/v1.0/drives/${pins.driveId}/items/${sourceRoot.folderItemId}`,{headers:{authorization:`Bearer ${jwt()}`}})).status,403)
  assert.equal((await fake.fetch(`https://graph.microsoft.com/v1.0/drives/${pins.driveId}/items/${pins.folderItemId}`,{headers:{authorization:`Bearer ${jwt(readApp)}`}})).status,403)
})
test('native transport exercises upload/original/archive saga provider with exact hash and same ID',async()=>{
  const fake=provider(), transport=selected.createDocumentosProductionTransport(pins,guard,env,{fetch:fake.fetch,tokenProvider:async()=>jwt()})
  const storage=storageModule.createDocumentosPanelStorage(async()=>7,transport,pins)
  const file=core.validateFile(bytes,'native.pdf','application/pdf','FACTURA_RECIBIDA','00000000-0000-4000-8000-000000000001')
  const saved=await storage.upload(file,`${file.hash}.pdf`)
  assert.equal(core.hashBytes(await storage.original(saved,file)),file.hash)
  const archived=await storage.archive(saved,'manual-validada.pdf',file); assert.equal(archived.itemId,saved.itemId)
  await storage.archive(saved,'manual-validada.pdf',file)
  assert.equal(fake.calls.filter(c=>c.method==='PUT').length,1); assert.equal(fake.calls.filter(c=>c.method==='PATCH').length,1)
  const freshFake=fake, fresh=selected.createDocumentosProductionTransport(pins,guard,env,{fetch:freshFake.fetch,tokenProvider:async()=>jwt()})
  const reread=storageModule.createDocumentosPanelStorage(async()=>7,fresh,pins)
  assert.equal(core.hashBytes(await reread.original(saved,file)),file.hash)
  const before=fake.calls.length
  await assert.rejects(()=>reread.original({...saved,itemId:'unrelated-file'},file),rejectsCode('DOCUMENTOS_SELECTED_OUTSIDE_ROOT'))
  assert.ok(!fake.calls.slice(before).some(c=>c.url.pathname.includes('unrelated-file')))
})
test('real missing grants/wrong root name/child drive prevent mutations, not global fake pending',async()=>{
  for(const changes of [{missingGrant:true},{rootName:'WrongName'},{wrongChildDrive:true}]){
    const fake=provider(changes), transport=selected.createDocumentosProductionTransport(pins,guard,env,{fetch:fake.fetch,tokenProvider:async()=>jwt()})
    await assert.rejects(()=>transport.listRoot(root)); assert.equal(fake.calls.filter(c=>c.method!=='GET').length,0)
  }
})
test('legacy pinned ID traversal exhausts >one page and nested descendants, source is read-only',async()=>{
  const fake=provider(), readCredential=selected.selectedCredential(env,'FINANCE_DOCUMENTOS_COMPARACION_GRAPH')
  const transport=selected.createSelectedTransport(readCredential,[sourceRoot],true,{guard,fetch:fake.fetch,tokenProvider:async()=>jwt(readApp)})
  const files=await transport.listRoot(sourceRoot)
  assert.deepEqual(Array.from(files.map((x:any)=>x.id)).sort(),['legacy-file','nested-file'])
  assert.equal(files.find((x:any)=>x.id==='nested-file').fullPath,`${LEGACY}/Subcarpeta/b.pdf`)
  assert.ok(fake.calls.some(c=>c.url.searchParams.has('$skiptoken')))
  const before=fake.calls.length
  await assert.rejects(()=>transport.request(`/drives/${pins.driveId}/items/legacy-file`,{method:'PATCH',body:'{}'}),rejectsCode('DOCUMENTOS_SELECTED_READ_ONLY'))
  assert.equal(fake.calls.length,before)
})
test('later page/descendant error or cross-parent/cross-drive nextLink propagates without partial success',async()=>{
  for(const changes of [{secondPageError:true},{badNext:`https://graph.microsoft.com/v1.0/drives/${pins.driveId}/items/production-panel/children?$skiptoken=x`},{badNext:'https://evil.test/page'},{badNext:`https://graph.microsoft.com/beta/drives/${pins.driveId}/items/legacy-folder/children?$skiptoken=x`}]) {
    const fake=provider(changes), transport=selected.createSelectedTransport(selected.selectedCredential(env,'FINANCE_DOCUMENTOS_COMPARACION_GRAPH'),[sourceRoot],true,{guard,fetch:fake.fetch,tokenProvider:async()=>jwt(readApp)})
    await assert.rejects(()=>transport.listRoot(sourceRoot))
  }
})
test('typed server roots: no pointers/unknown labels/root aliases/overlap/shared write app',async()=>{
  for(const roots of [[],[{...sourceRoot,folderItemId:'root'}],[{...sourceRoot,relativeLabel:'4. Recursos Humanos/Nóminas'}],[{...sourceRoot,url:'https://evil.test'}],[sourceRoot,sourceRoot],[sourceRoot,{...sourceRoot,folderItemId:'different-root',relativeLabel:`${LEGACY}/Sub`}],[{...sourceRoot,folderItemId:pins.folderItemId}]]) assert.throws(()=>selected.parseSelectedSourceRoots({...env,FINANCE_DOCUMENTOS_COMPARACION_SELECTED_ROOTS:JSON.stringify(roots)},LEGACY,pins))
  const api=productionComparison.crearComparacionProductionSelected({knownLegacyRoot:LEGACY,guard,scopeReady:()=>true,env:{...env,FINANCE_DOCUMENTOS_COMPARACION_GRAPH_CLIENT_ID:writeApp}})
  const result=await api.providers[0].read(comparison.parseRangoComparacion())
  assert.equal(result.completo,false); assert.match(result.incidencias[0],/DOCUMENTOS_SELECTED_SOURCE_APP_NOT_SEPARATE/)
})
test('Production comparison valid config reports actual complete declared scope; missing auth/page fails INCOMPLETO',async()=>{
  const fake=provider(), opts={knownLegacyRoot:LEGACY,guard,scopeReady:()=>true,env,destinationDependencies:{fetch:fake.fetch,tokenProvider:async()=>jwt()},sourceDependencies:{fetch:fake.fetch,tokenProvider:async()=>jwt(readApp)}}
  const api=productionComparison.crearComparacionProductionSelected(opts), range=comparison.parseRangoComparacion()
  const emptyPanel={key:'panel',scope:'native',read:async()=>({key:'panel',scope:'native',completo:true,truncado:false,documentos:[],incidencias:[]})}
  const result=await comparison.ejecutarComparacionDocumental(range,[emptyPanel as any,...api.providers])
  assert.equal(result.resultado.inventarioCompleto,true); assert.equal(result.resultado.hashesCompletos,true); assert.equal(result.resultado.estado,'DIFERENCIAS'); assert.equal(result.resultado.semanaCompleta,false)
  assert.equal(result.inventarios.find(x=>x.key==='carpetas')!.documentos.length,2)
  assert.ok(result.inventarios.find(x=>x.key==='carpetas')!.documentos.every(x=>x.hashProvenancia==='BYTES_GRAPH'))
  assert.equal((await api.readBytes(pins.driveId,'legacy-file',core.MAX_FILE_BYTES)).toString(),bytes.toString())
  const before=fake.calls.length; await assert.rejects(()=>api.readBytes(pins.driveId,'unrelated-file',core.MAX_FILE_BYTES),rejectsCode('DOCUMENTOS_SELECTED_OUTSIDE_ROOT')); assert.equal(fake.calls.length,before)
  for(const bad of [productionComparison.crearComparacionProductionSelected({...opts,env:{...env,FINANCE_DOCUMENTOS_COMPARACION_GRAPH_CLIENT_SECRET:''}}),productionComparison.crearComparacionProductionSelected({...opts,sourceDependencies:{fetch:provider({secondPageError:true}).fetch,tokenProvider:async()=>jwt(readApp)}})]) {
    const out=await comparison.ejecutarComparacionDocumental(range,[emptyPanel as any,...bad.providers]); assert.equal(out.resultado.estado,'INCOMPLETO'); assert.equal(out.inventarios[1].documentos.length,0)
    await assert.rejects(()=>bad.readBytes(pins.driveId,'legacy-file',core.MAX_FILE_BYTES))
  }
})
test('native panel scope incomplete blocks Graph before auth and guard revocation blocks response',async()=>{
  const fake=provider(), api=productionComparison.crearComparacionProductionSelected({knownLegacyRoot:LEGACY,guard,scopeReady:()=>false,env,destinationDependencies:{fetch:fake.fetch},sourceDependencies:{fetch:fake.fetch}})
  for(const p of api.providers) await assert.rejects(()=>p.read(comparison.parseRangoComparacion()),rejectsCode('FINANCE_SCOPE_NOT_VERIFIED'))
  assert.equal(fake.calls.length,0)
  let count=0
  const transport=selected.createSelectedTransport(credential,[root],false,{guard:async()=>{if(++count>=4) core.fail(403,'REVOKED','revoked')},fetch:fake.fetch,tokenProvider:async()=>jwt()})
  await assert.rejects(()=>transport.listRoot(root),rejectsCode('REVOKED'))
})
test('private content: single fixed-provider redirect, bearer stripped; hostile redirect/stream cap rejected',async()=>{
  for(const redirect of ['https://tenant.sharepoint.com/preauthenticated','https://evil.test/file','http://tenant.sharepoint.com/file','https://tenant.sharepoint.com.evil.test/file','https://user:pass@tenant.sharepoint.com/file']){
    const fake=provider({redirect}), transport=selected.createSelectedTransport(selected.selectedCredential(env,'FINANCE_DOCUMENTOS_COMPARACION_GRAPH'),[sourceRoot],true,{guard,fetch:fake.fetch,tokenProvider:async()=>jwt(readApp)})
    await transport.listRoot(sourceRoot)
    if(redirect==='https://tenant.sharepoint.com/preauthenticated') assert.equal((await transport.download(pins.driveId,'legacy-file')).toString(),bytes.toString())
    else await assert.rejects(()=>transport.download(pins.driveId,'legacy-file'),rejectsCode('DOCUMENTOS_SELECTED_REDIRECT_INVALID'))
  }
  await assert.rejects(()=>selected.boundedSelectedBytes(new Response(Buffer.alloc(1025)),1024),rejectsCode('ARCHIVO_FUERA_DE_LIMITE'))
  await assert.rejects(()=>selected.boundedSelectedBytes(new Response('x',{headers:{'content-length':'9000'}}),1024),rejectsCode('ARCHIVO_FUERA_DE_LIMITE'))
})

test('disjoint scopes enforced on physical ancestry, no counterfeit labels or inherited cross-root children',async()=>{
  const fake=provider()
  fake.items.get('legacy-folder').parentReference.id=pins.folderItemId
  const transport=selected.createSelectedTransport(credential,[root],true,{guard,fetch:fake.fetch,tokenProvider:async()=>jwt()},[sourceRoot])
  await assert.rejects(()=>transport.listRoot(root),rejectsCode('DOCUMENTOS_SELECTED_SCOPES_OVERLAP'))
  await assert.rejects(()=>transport.listRoot({...root,relativeLabel:'Counterfeit'}),rejectsCode('DOCUMENTOS_SELECTED_OUTSIDE_ROOT'))
  const fresh=provider(), source=selected.createSelectedTransport(selected.selectedCredential(env,'FINANCE_DOCUMENTOS_COMPARACION_GRAPH'),[sourceRoot],true,{guard,fetch:fresh.fetch,tokenProvider:async()=>jwt(readApp)})
  await source.listRoot(sourceRoot)
  fresh.items.get('source-nested').parentReference.id='outside-root'
  const before=fresh.calls.length
  await assert.rejects(()=>source.download(pins.driveId,'nested-file'))
  assert.ok(!fresh.calls.slice(before).some(c=>c.url.pathname.endsWith('/content')))
})
test('paging cap and byte-hash cap are real incomplete evidence, never silently successful',async()=>{
  const base=provider(), readCredential=selected.selectedCredential(env,'FINANCE_DOCUMENTOS_COMPARACION_GRAPH')
  let pages=0
  const endless=async(urlValue:any,init:any)=>{
    const url=new URL(String(urlValue))
    if(url.pathname.endsWith('/children')) {
      pages+=1
      return Response.json({value:[], '@odata.nextLink':`${url.origin}${url.pathname}?$select=${url.searchParams.get('$select')}&$top=200&$skiptoken=PAGE${pages}`})
    }
    return base.fetch(url,init)
  }
  const transport=selected.createSelectedTransport(readCredential,[sourceRoot],true,{guard,fetch:endless,tokenProvider:async()=>jwt(readApp)})
  await assert.rejects(()=>transport.listRoot(sourceRoot),rejectsCode('DOCUMENTOS_SELECTED_PAGE_CAP'))
  assert.equal(pages,selected.SELECTED_LIMITS.pages)
  const fake=provider(); fake.items.delete('source-nested'); fake.items.delete('legacy-file'); fake.items.delete('nested-file')
  for(let n=0;n<41;n++) fake.items.set(`hash-file-${n}`,{id:`hash-file-${n}`,name:`h${n}.pdf`,file:{},size:bytes.length,eTag:'e',lastModifiedDateTime:'2026-12-01T00:00:00Z',parentReference:{id:sourceRoot.folderItemId,driveId:pins.driveId}})
  const api=productionComparison.crearComparacionProductionSelected({knownLegacyRoot:LEGACY,guard,scopeReady:()=>true,env,sourceDependencies:{fetch:fake.fetch,tokenProvider:async()=>jwt(readApp)},destinationDependencies:{fetch:fake.fetch,tokenProvider:async()=>jwt()}})
  const inventory=await api.providers[0].read(comparison.parseRangoComparacion())
  assert.equal(inventory.completo,true); assert.equal(inventory.documentos.length,41)
  assert.equal(inventory.documentos.filter((x:any)=>x.sha256).length,40)
  assert.match(inventory.documentos[40].incidencias[0],/HASH_CAP/)
  assert.equal(comparison.compararInventariosDocumentales(comparison.parseRangoComparacion(),[inventory],new Date().toISOString()).estado,'INCOMPLETO')
})
