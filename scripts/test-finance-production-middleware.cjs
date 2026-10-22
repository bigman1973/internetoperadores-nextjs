const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').resolve(__dirname,'../middleware.js'),'utf8').replace("import { NextResponse } from 'next/server';",'').replace('export async function middleware','async function middleware').replace('export const config','const config')+'\nthis.run=middleware;';
async function check(flags,path,method){const context={process:{env:flags},Set,NextResponse:{json:(body,options)=>({body,...options}),next:()=>({status:200})}};vm.createContext(context);vm.runInContext(source,context);return context.run({method,nextUrl:{pathname:path,hostname:'www.internetoperadores.com'},cookies:{get:()=>null},headers:{get:()=>null}});}
(async()=>{const flags={VERCEL_ENV:'production',FINANCE_DEPLOYMENT_READ_ONLY:'0',FINANCE_EXTERNAL_ACTIONS_DISABLED:'1'};
for(const [path,method] of [['/api/cron/recordatorio-wizard','GET'],['/api/sync-facturas','GET'],['/api/admin/finanzas/sincronizar-onedrive','POST'],['/api/admin/nominas/sync','GET'],['/api/admin/peticiones/enviar-email','POST']]){assert.equal((await check(flags,path,method)).status,403);}
assert.equal((await check(flags,'/api/admin/finanzas/conciliacion/auto','POST')).status,409);
for(const path of ['/api/admin/finanzas/conciliacion-remesas','/api/admin/finanzas/conciliacion-remesas/importar-pdf','/api/admin/finanzas/conciliacion-remesas/importar-devoluciones','/api/admin/finanzas/clientes/ggcc-draxton','/api/admin/finanzas/tickets/fixture-id/conciliar'])assert.equal((await check(flags,path,'POST')).status,409);

assert.equal((await check(flags,'/api/auth/session','GET')).status,200);
assert.equal((await check(flags,'/api/admin/permisos','POST')).status,200);
// No hay bloqueo financiero manual en el borde: llegaría a autorización viva.
// Al importar la política financiera el VM falla deliberadamente por no admitir I/O.
for(const path of ['/api/admin/finanzas/conciliacion-v2','/api/admin/finanzas/remesas/b6','/api/admin/finanzas/centros-coste/asignar']){
 await assert.rejects(check(flags,path,'POST'),e=>e.code==='ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING');
}
assert.equal((await check({...flags,FINANCE_DEPLOYMENT_READ_ONLY:'1'},'/api/admin/finanzas/conciliacion-v2','POST')).status,403);
console.log('Límites dinámicos y auto-vínculos legacy comprobados sin red, BD ni ejecución de acciones financieras.');
})().catch(e=>{console.error(e.name);process.exitCode=1;});
