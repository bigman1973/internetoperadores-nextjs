import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { easyOnlyRequestAllowed } from '../lib/finanzas/easy-access-core'
import { impersonationRouteDecision, targetHasLiveRoutePermission } from '../lib/impersonation-policy'
const source = readFileSync('middleware.js', 'utf8')
const start = source.indexOf('function financeAreas(pathname) {')
const end = source.indexOf('\nexport async function middleware(', start)
assert.ok(start >= 0 && end > start)
const code = source.slice(start, end) + '\nfinanceAreas'
function areas(path: string, sandbox?: string): string[] { return Array.from(runInNewContext(code, { process: { env: { FINANCE_STAGING_SANDBOX: sandbox } } })(path)) }
const route = '/api/admin/finanzas/duplicados-documentos'
const previous = process.env.FINANCE_STAGING_SANDBOX
try {
 process.env.FINANCE_STAGING_SANDBOX = '1'
 assert.deepEqual(areas(route, '1'), ['admin.finanzas.conciliacion'])
 for (const verb of ['GET','HEAD','OPTIONS']) {
  assert.equal(easyOnlyRequestAllowed(route, verb), true)
  const decision=impersonationRouteDecision(route,verb)
  assert.equal(decision.allowed,true)
  if(!decision.allowed || !decision.permission)throw new Error('LIVE_PERMISSION_REQUIRED')
  assert.deepEqual(decision.permission.areas,['admin.finanzas.conciliacion'])
  assert.equal(decision.permission.required,'lectura')
  assert.equal(targetHasLiveRoutePermission({target:{activo:true,rol:'VISOR',permisos:[{area:'admin.finanzas.conciliacion',lectura:true,escritura:false}]},requirement:decision.permission,activeAreas:['admin.finanzas.conciliacion']}),true)
  assert.equal(targetHasLiveRoutePermission({target:{activo:true,rol:'VISOR',permisos:[]},requirement:decision.permission,activeAreas:['admin.finanzas.conciliacion']}),false)
 }
 for (const verb of ['POST','PUT','PATCH','DELETE']) {assert.equal(easyOnlyRequestAllowed(route, verb), false);assert.equal(impersonationRouteDecision(route,verb).allowed,false)}
 for (const suffix of ['/','/fusionar','-otro']) {assert.deepEqual(areas(route+suffix,'1'),[]);assert.equal(easyOnlyRequestAllowed(route+suffix,'GET'),false);assert.equal(impersonationRouteDecision(route+suffix,'GET').allowed,false)}
 for (const value of [undefined,'0','true']) {if(value===undefined)delete process.env.FINANCE_STAGING_SANDBOX;else process.env.FINANCE_STAGING_SANDBOX=value;assert.deepEqual(areas(route,value),[]);assert.equal(easyOnlyRequestAllowed(route,'GET'),false)}
 assert.deepEqual(areas('/api/admin/finanzas/rectificativas','1'),['admin.finanzas.conciliacion'])
} finally {if(previous===undefined)delete process.env.FINANCE_STAGING_SANDBOX;else process.env.FINANCE_STAGING_SANDBOX=previous}
console.log('PASS: avisos ruta exacta, lectura de Conciliar bajo actuación, escritura y rutas vecinas denegadas; permisos efectivos vivos.')
