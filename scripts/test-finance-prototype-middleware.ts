import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source=readFileSync(new URL('../middleware.js',import.meta.url),'utf8')
const start=source.indexOf('function financeAreas(pathname) {')
const end=source.indexOf('\nexport async function middleware',start)
assert.ok(start>=0&&end>start)
const areas=new Function(`${source.slice(start,end)};return financeAreas`)() as (path:string)=>string[]
for(const path of ['/api/admin/finanzas/modo-facil','/api/admin/finanzas/modo-facil/foto','/api/admin/finanzas/modo-facil/documentos/fixture/archivo','/api/admin/finanzas/analitica-cliente'])assert.deepEqual(areas(path),['admin.finanzas.conciliacion'])
assert.deepEqual(areas('/api/admin/finanzas/desconocido'),[])
assert.deepEqual(areas('/api/admin/finanzas/conciliacion-v2'),['admin.finanzas.conciliacion'])
const allowedStart=source.indexOf('const allowed = ')
const allowedEnd=source.indexOf(';',allowedStart)
const allowed=new Function('path','request','isAuthorizedP2Path',`return ${source.slice(allowedStart+'const allowed = '.length,allowedEnd)}`) as (path:string,request:{method:string},p2:(path:string)=>boolean)=>boolean
for(const path of ['/api/admin/finanzas/modo-facil','/api/admin/finanzas/modo-facil/foto','/api/admin/finanzas/modo-facil/deshacer','/api/admin/finanzas/modo-facil/reglas']){
 assert.equal(allowed(path,{method:'POST'},()=>false),true)
 for(const method of ['PUT','PATCH','DELETE'])assert.equal(allowed(path,{method},()=>false),false)
}
for(const path of ['/api/admin/finanzas/modo-facil/auto','/api/admin/finanzas/analitica-cliente','/api/admin/finanzas/conciliacion/auto','/api/admin/finanzas/enviar-correo','/api/cron/finance-sync-worker'])assert.equal(allowed(path,{method:'POST'},()=>false),false)
assert.ok(source.includes('ALWAYS_BLOCKED_AUTOMATIC_RECONCILIATION_POSTS.has(path)'))
assert.ok(source.includes('FINANCE_AUTOMATIC_LINKS_DISABLED'))
assert.ok(source.includes('const areas = financeAreas(request.nextUrl.pathname)'))
assert.ok(source.includes("if (!areas.length) return NextResponse.json({ error: 'Área financiera no registrada'"))
console.log('test-finance-prototype-middleware: OK (permiso existente, cuatro POST humanos y ningún automatismo nuevo)')
