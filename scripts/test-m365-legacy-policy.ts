import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as legacy from '../lib/m365-legacy-policy'
import * as registry from '../lib/area4/section-registry'
import * as policy from '../lib/area4/policy'
import * as requestPolicy from '../lib/area4/request-policy'
import * as renderSurface from '../lib/admin-render-surface'
import * as highRisk from '../lib/high-risk-api-policy'
import * as alta from '../lib/altas/contrato-access'
import * as imports from '../lib/area4/crm-staging-import'
import * as easy from '../lib/finanzas/easy-access-core'
import * as empresaActivity from '../lib/crm-empresa-actividad-core'

const STAGE: Record<string,string|undefined> = {
  AREA4_OWNER_USER_ID:'3', FINANCE_STAGING_SANDBOX:'1', VERCEL_ENV:'preview', VERCEL_GIT_COMMIT_REF:'staging',
  DATABASE_URL:'postgresql://io_staging_finanzas@127.0.0.1:9/io_staging_finanzas',
  FINANCE_DEPLOYMENT_READ_ONLY:'0', IO_PRODUCTION_READ_ONLY:'0', FINANCE_EXTERNAL_ACTIONS_DISABLED:'1',
  FINANCE_MODEL_PRODUCTION_ENABLED:'0', NODE_ENV:'test',
}
const keys=Object.keys(legacy.M365_LEGACY_FLAGS) as legacy.M365LegacyRoute[]
for (const key of keys) {
  test(`${key}: ausente y valores no autorizados cierran`,()=>{
    for(const value of [undefined,'','0','true','yes','1 ',' 1','2']) assert.equal(legacy.m365LegacyEnabled(key,{[legacy.M365_LEGACY_FLAGS[key]]:value}),false)
  })
  test(`${key}: literal 1 sólo reabre su propia puerta`,()=>{
    const env={[legacy.M365_LEGACY_FLAGS[key]]:'1'}
    for(const other of keys) assert.equal(legacy.m365LegacyEnabled(other,env),other===key)
  })
}
test('Mensaje informativo exacto, sin éxito ficticio',()=>{
  const body=legacy.m365LegacyPendingBody()
  assert.equal(body.message,'Envio pendiente de activar (se hara desde Mi Outlook)')
  assert.equal(body.success,false)
  assert.equal(legacy.isM365LegacyPending(body),true)
  for(const value of [null,{},'M365_LEGACY_PENDING',{code:'OTHER'}]) assert.equal(legacy.isM365LegacyPending(value),false)
})
test('Sólo cuerpos locales estrictos; texto/número/truthy Outlook nunca se aceptan',()=>{
  for(const type of ['NOTA','LLAMADA','TAREA','REUNION','WHATSAPP','LINKEDIN','SMS','CORREO_POSTAL']) {
    assert.equal(legacy.isM365LegacyLocalActivity({type}),true)
    assert.equal(legacy.isM365LegacyLocalActivity({type,syncOutlook:false,viaOutlook:false}),true)
    for(const syncOutlook of [true,'false','true',0,1,null,{},[]]) assert.equal(legacy.isM365LegacyLocalActivity({type,syncOutlook}),false)
    for(const prepareExternalChannel of [true,'false',0,1,null,{},[]]) assert.equal(legacy.isM365LegacyLocalActivity({type,prepareExternalChannel}),false)
  }
  for(const value of [null,[],{}, {type:'CORREO'},{type:['NOTA']},{type:'NOTA',viaOutlook:true}]) assert.equal(legacy.isM365LegacyLocalActivity(value),false)
})
test('Escape local sólo en staging aislado y nunca readonly',()=>{
  assert.equal(legacy.m365LegacyLocalSandboxEnabled(STAGE),true)
  for(const override of [{VERCEL_ENV:'production'},{VERCEL_GIT_COMMIT_REF:'area1-crm'},{FINANCE_STAGING_SANDBOX:'0'},
    {DATABASE_URL:'postgresql://postgres@127.0.0.1:9/railway'},{DATABASE_URL:undefined},
    {FINANCE_DEPLOYMENT_READ_ONLY:'1'},{IO_PRODUCTION_READ_ONLY:'1'}]) assert.equal(legacy.m365LegacyLocalSandboxEnabled({...STAGE,...override}),false)
})
test('Clasificación de mensajes no incluye Peticiones, Mi Día o rutas vecinas',()=>{
  assert.equal(legacy.m365LegacyMailRouteFromPath('/api/admin/leads/42/enviar-email'),'leads')
  assert.equal(legacy.m365LegacyMailRouteFromPath('/api/admin/leads-mantenimiento/42/enviar-email'),'mantenimiento')
  assert.equal(legacy.m365LegacyMailRouteFromPath('/api/altas/42/enviar-contrato'),'altas')
  for(const path of ['/api/admin/peticiones','/api/admin/crm/contactos/42/actividades','/api/admin/leads/42/enviar-email/extra','/api/auth/magic-link']) assert.equal(legacy.m365LegacyMailRouteFromPath(path),null)
})

// Código completo REAL del proxy. Sólo la sesión/BD es sintética; ninguna conexión.
// Las puertas, registro, ACL, clasificador, parser de clon y guardas son reales.
function fixture(overrides: Record<string,string|undefined>={}) {
  const env={...STAGE,...overrides}
  let actor:any={id:3,activo:true,rol:'SUPER_ADMIN',roles:[],permisosArea4Vivos:true,perfilAsignado:null,grants:[]}
  let token:any={id:'3',userType:'admin',role:'SUPER_ADMIN'}
  let calls=0
  const errors:string[]=[]
  const database={usuarioAdmin:{findUnique:async()=>actor?{
    ...actor,permisos:(actor.grants||[]).map((grant:any)=>({...grant,area:{codigo:grant.codigo}})),
  }:null},$transaction:async(fn:any)=>fn({auditoriaPermisosArea4:{create:async({data}:any)=>data}})}
  const source=readFileSync('proxy.js','utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const mod:any={exports:{}}
  vm.runInNewContext(code,{
    module:mod,exports:mod.exports,process:{env},console:{error(...args:any[]){errors.push(args.map(String).join(' '))},info(){},warn(){}},Headers,URL,URLSearchParams,performance,
    TextDecoder,TextEncoder,Request,Response,ReadableStream,Buffer,Uint8Array,ArrayBuffer,JSON,atob,
    fetch(){calls++;throw Error('NETWORK_FORBIDDEN')},
    require(name:string){
      if(name==='next/server')return {NextRequest,NextResponse}
      if(name==='./lib/admin-render-surface')return renderSurface
      if(name==='./lib/finanzas/conciliar-runtime')return {conciliarRuntimeConfigured:()=>null}
      if(name==='./lib/high-risk-api-policy')return highRisk
      if(name==='./lib/altas/contrato-access')return alta
      // Context env is passed explicitly: the real helper must not read host secrets.
      if(name==='./lib/m365-legacy-policy')return {...legacy,m365LegacyLocalSandboxEnabled:()=>legacy.m365LegacyLocalSandboxEnabled(env)}
      if(name==='@/lib/crm-empresa-actividad-core')return empresaActivity
      if(name==='next-auth/jwt')return {getToken:async()=>token}
      if(name==='@/lib/area4/section-registry')return registry
      if(name==='@/lib/area4/policy')return {...policy,
        configuredArea4OwnerId:()=>policy.configuredArea4OwnerId(env),
        isArea4Owner:(principal:any)=>policy.isArea4Owner(principal,env),
        evaluateArea4Capability:(input:any)=>policy.evaluateArea4Capability({...input,ownerId:policy.configuredArea4OwnerId(env)}),
      }
      if(name==='@/lib/area4/request-policy')return requestPolicy
      if(name==='@/lib/area4/crm-staging-import')return imports
      if(name==='@/lib/area4/surface-access')return {
        readArea4SurfaceAccessUser:async()=>actor,
        validateArea4NewSurfaceConsent:async()=>false,
      }
      if(name==='@/lib/area4/audit')return {appendArea4Audit:async()=>undefined}
      if(name==='@/lib/prisma')return {default:database}
      if(name==='@/lib/permisos')return {verificarPermisoServer:async (_id:any,area:string)=>Object.fromEntries(
        ['lectura','escritura','confirmar','exportar'].map(capability=>[capability,policy.evaluateArea4Capability({principal:actor,grants:actor?.grants||[],codigoArea:area,capability:capability as any,ownerId:policy.configuredArea4OwnerId(env)})])
      )}
      if(name==='@/lib/finanzas/easy-access-profile')return {isEasyOnlyFinanceUser:async()=>false}
      if(name==='@/lib/finanzas/easy-access-core')return easy
      if(name==='@/lib/impersonation')return {readImpersonationClaims:()=>null}
      throw Error(`UNEXPECTED_MODULE:${name}`)
    },
  })
  return {
    errors,
    setActor(value:any){actor=value;token=value?{id:String(value.id),userType:'admin',role:value.rol}:null},
    async request(path:string,body:any,headers:Record<string,string>={}){
      const req=new NextRequest('https://staging.example.test'+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)})
      let timer:ReturnType<typeof setTimeout>|undefined
      const response=await Promise.race([mod.exports.proxy(req),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('UNCONSUMED_CLONE_TIMEOUT')),2000)})]).finally(()=>{if(timer)clearTimeout(timer)})
      await req.body?.cancel()
      assert.equal(calls,0)
      return response
    },
  }
}
const ACT='/api/admin/crm/contactos/42/actividades'
for(const type of ['NOTA','LLAMADA','TAREA','REUNION','WHATSAPP','LINKEDIN','SMS','CORREO_POSTAL']) test(`Proxy completo: ${type} local despacha con permisos vivos`,async()=>{
  const f=fixture();const response=await f.request(ACT,{type,title:'Prueba local',syncOutlook:false,prepareExternalChannel:false})
  assert.equal(response.status,200,`${await response.clone().text()} ${f.errors.join('; ')}`)
})
for(const body of [
  {type:'CORREO',viaOutlook:false},{type:'CORREO',viaOutlook:true},{type:'CORREO'},
  {type:'REUNION',syncOutlook:true},{type:'REUNION',syncOutlook:'false'},{type:'NOTA',syncOutlook:1},
  {type:'WHATSAPP',prepareExternalChannel:true},{type:'LINKEDIN',prepareExternalChannel:true},{type:'SMS',prepareExternalChannel:true},
  {type:'CORREO_POSTAL',prepareExternalChannel:'false'},
]) test(`Proxy completo: externo o ambiguo ${JSON.stringify(body)} cerrado`,async()=>{
  const f=fixture({M365_LEGACY_CRM_EXTERNAL_ENABLED:'1',M365_STAGING_CALENDARIO:'1'});const response=await f.request(ACT,body)
  assert.equal(response.status,503);assert.equal((await response.json()).code,legacy.M365_LEGACY_PENDING_CODE)
})
test('Proxy: locales no evitan ausencia de sesión',async()=>{
  const f=fixture();f.setActor(null);assert.equal((await f.request(ACT,{type:'NOTA'})).status,401)
})
test('Proxy: locales no evitan ACL de escritura',async()=>{
  const f=fixture();f.setActor({id:7,activo:true,rol:'VISOR',roles:[],permisosArea4Vivos:true,perfilAsignado:null,grants:[]})
  const response=await f.request(ACT,{type:'NOTA'})
  assert.equal(response.status,403,`${await response.clone().text()} ${f.errors.join('; ')}`)
})
for(const overrides of [{FINANCE_DEPLOYMENT_READ_ONLY:'1'},{IO_PRODUCTION_READ_ONLY:'1'},{VERCEL_GIT_COMMIT_REF:'otra'},{DATABASE_URL:'postgresql://postgres@127.0.0.1:9/railway'}]) test(`Proxy: local no evita ${JSON.stringify(overrides)}`,async()=>{
  const f=fixture(overrides);assert.equal((await f.request(ACT,{type:'NOTA'})).status,503)
})
test('Proxy: JSON roto, cuerpo grande y ruta vecina nunca despachan',async()=>{
  const f=fixture()
  assert.equal((await f.request(ACT,'{broken')).status,503)
  assert.equal((await f.request(ACT,{type:'NOTA',padding:'x'.repeat(17*1024)})).status,503)
  assert.equal((await f.request(ACT+'/44/m365',{type:'NOTA'})).status,403)
})
for(const path of ['/api/admin/leads/42/enviar-email','/api/admin/leads-mantenimiento/42/enviar-email','/api/altas/42/enviar-contrato']) test(`Proxy: mensaje informativo y puerta global prevalente ${path}`,async()=>{
  for(const overrides of [{},{FINANCE_STAGING_SANDBOX:'0'}]) {
    const f=fixture({...overrides,...Object.fromEntries(Object.values(legacy.M365_LEGACY_FLAGS).map(flag=>[flag,'1']))})
    const response=await f.request(path,{type:'NOTA'})
    assert.equal(response.status,503);assert.equal((await response.json()).message,legacy.M365_LEGACY_PENDING_MESSAGE)
  }
})

const EMPRESA='/api/admin/crm/empresas/cabcdefghijklmnopqrstuvwx'
for(const type of ['NOTA','LLAMADA','TAREA','REUNION']) test(`Proxy empresa: ${type} local usa superficie baseline E`,async()=>{
  const f=fixture();const r=await f.request(EMPRESA,{action:'registrar_actividad',type,syncOutlook:false,onlineMeeting:false,inviteAttendees:false})
  assert.equal(r.status,200,`${await r.clone().text()} ${f.errors.join('; ')}`)
})
for(const body of [{action:'registrar_actividad',type:'CORREO'}, {action:'registrar_actividad',type:'REUNION',syncOutlook:true},
  {action:'registrar_actividad',type:'NOTA',syncOutlook:'false'}, {action:'registrar_actividad',type:'REUNION',onlineMeeting:true},
  {action:'registrar_actividad',type:'REUNION',inviteAttendees:1}, {action:'editar',type:'NOTA'}, {type:'NOTA'},
  {action:'registrar_actividad',accion:'confirmar',type:'NOTA'}, {action:'registrar_actividad',type:'WHATSAPP'}]) test(`Proxy empresa: contrato externo/ambiguo cerrado ${JSON.stringify(body)}`,async()=>{
  const f=fixture({M365_LEGACY_CRM_EXTERNAL_ENABLED:'1',M365_STAGING_CALENDARIO:'1'});assert.ok((await f.request(EMPRESA,body)).status>=400)
})
for(const path of ['/api/admin/crm/empresas/sync','/api/admin/crm/empresas/buscar-contactos',EMPRESA+'/contactos',EMPRESA+'/actividades']) test(`Proxy empresa: nunca abre vecino ${path}`,async()=>{
  const f=fixture();assert.ok((await f.request(path,{action:'registrar_actividad',type:'NOTA'})).status>=400)
})
for(const overrides of [{FINANCE_DEPLOYMENT_READ_ONLY:'1'},{IO_PRODUCTION_READ_ONLY:'1'},{VERCEL_GIT_COMMIT_REF:'otra'},{DATABASE_URL:'postgresql://postgres@127.0.0.1:9/railway'}]) test(`Proxy empresa: conserva readonly/destino ${JSON.stringify(overrides)}`,async()=>{
  const f=fixture(overrides);assert.ok((await f.request(EMPRESA,{action:'registrar_actividad',type:'NOTA'})).status>=400)
})
test('Proxy empresa: ausencia sesión, VISOR y JSON grande no despachan',async()=>{
  const f=fixture();f.setActor(null);assert.equal((await f.request(EMPRESA,{action:'registrar_actividad',type:'NOTA'})).status,401)
  f.setActor({id:7,activo:true,rol:'VISOR',roles:[],permisosArea4Vivos:true,perfilAsignado:null,grants:[]});assert.equal((await f.request(EMPRESA,{action:'registrar_actividad',type:'NOTA'})).status,403)
  const owner=fixture();assert.ok((await owner.request(EMPRESA,{action:'registrar_actividad',type:'NOTA',padding:'x'.repeat(17*1024)})).status>=400)
})

test('Proxy empresa: E exacta empresa permite local sin C/X ni permiso Contactos; lectura sola deniega',async()=>{
  const f=fixture()
  const actor={id:7,activo:true,rol:'VENTAS',roles:[],permisosArea4Vivos:true,perfilAsignado:null,
    grants:[{codigo:'admin.crm.empresas',lectura:true,escritura:true,confirmar:false,exportar:false}]}
  f.setActor(actor)
  const allowed=await f.request(EMPRESA,{action:'registrar_actividad',type:'NOTA'})
  assert.equal(allowed.status,200,`${await allowed.clone().text()} ${f.errors.join('; ')}`)
  f.setActor({...actor,grants:[{...actor.grants[0],escritura:false}]})
  assert.equal((await f.request(EMPRESA,{action:'registrar_actividad',type:'NOTA'})).status,403)
})
