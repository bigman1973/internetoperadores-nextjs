import test from 'node:test'
import { calculateBankInvoicing } from '../lib/finanzas/bank-invoicing-core'
import { projectDashboardFinance, projectDashboardMargin } from '../lib/area4/dashboard-native-projection'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APPROVED_ROLES, approvedCodePermissions, ROLE_ENUM } from '../lib/area4/approved-roles'
import { AREA4_DASHBOARD_BLOCKS, AREA4_DASHBOARD_KPIS, AREA4_DASHBOARD_LAYOUTS, AREA4_BASELINE_DESCRIPTORS_SHA256, AREA4_BASELINE_IDENTITIES_SHA256, area4RegistrySurfaceMatches, area4RegisteredSurface, area4SectionByKey } from '../lib/area4/section-registry'
import { hasAccess } from '../components/admin/sidebar-access-evaluator'
import { loadDashboardModel, dashboardPreview, type DashboardContext, type DashboardReaders, type DashboardFinance } from '../lib/area4/dashboard-model'
import type { ApprovedRoleKey } from '../lib/area4/users-contract'
import type { ResumenCrm } from '../lib/area1-crm-resumen'
const now = new Date('2026-11-25T11:00:00Z')
const marginFixture = [43.1,45.4,45.6,48.1,41,33.5,41.3,39.9,44.8,59.2]
const fixtureFinance: DashboardFinance = { points: [{ month:'2026-01',value:12400 },{month:'2026-11',value:231}], yearTotal:12631, monthTotal:231, invoiceCount:17, monthCount:2, confirmed:121, pendingReal:100, withoutStatement:7, revisionCount:2, cutoff:'2026-10-02' }
const crm = { kpis: { leadsAbiertos:4,leadsSinContactar:2,reunionesSemana:1,ganadosMes:1,ganadosImporte:55,ponderado:55,clientesActivos:9999,clientesConFicha:9999,tareasVencidas:1 }, reunionesHoy:[{id:'fake-meeting',hora:'09:30',quien:'Cliente ficticio de la prueba',que:'Reunión guardada',contactoId:'fake-contact'}], tareas:[{id:'fake-task',grupo:'HOY',titulo:'Tarea ficticia',detalle:'Ficha ficticia',contactoId:'fake-contact'}], pipelines:[{id:'fake-pipe',nombre:'Pipeline de prueba',total:1,etapas:[{nombre:'Propuesta',n:1}],valor:123,ganados:1}], base:{empresas:9999,particulares:9999,partners:9999},brevoListasIO:9999 } as unknown as ResumenCrm
function readers() {
  const calls:string[]=[]
  const wrap=<T>(key:string,value:T)=>async()=>{calls.push(key);return value}
  const value:DashboardReaders={finance:wrap('finance',fixtureFinance),clients:wrap('clients',{total:22,empresas:11,particulares:11}),contracts:wrap('contracts',{total:33,tarifas:44}),crm:wrap('crm',crm),rentabilidad:wrap('rentabilidad',marginFixture.map((value,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,value,provisional:i===9})))}
  return {calls,value}
}
function context(key:ApprovedRoleKey, denied:string[]=[]):DashboardContext {
  const codes=[...new Set(area4RegistrySurfaceMatches().map(m=>m.section.areaCode))]
  const map=approvedCodePermissions(key,key==='contabilidad'?{clientes:'V',personal:'VEC',imputaciones:'VEC'}:{},codes)
  const principal={id:key==='superadmin'?903:904,rol:ROLE_ENUM[key],activo:true,roles:[]}
  const grants=Object.entries(map).map(([codigo,letters])=>({codigo,lectura:letters.includes('V'),escritura:letters.includes('E'),confirmar:letters.includes('C'),exportar:letters.includes('X')}))
  return {principal,name:'Persona ficticia',profile:APPROVED_ROLES.find(r=>r.key===key)!.name,owner:key==='superadmin',acting:false,now,canRead:(sectionKey,path)=>{
    if(denied.includes(sectionKey))return false
    const m=area4RegisteredSurface(path,'page')
    if(!m)return false
    return hasAccess({section:sectionKey,effectiveRole:principal.rol,isSuperAdmin:key==='superadmin',isArea4Owner:key==='superadmin',isViewingAs:false,isViewingAsUser:false,viewAsRole:null,userRoles:[],viewingUser:null,permisosGranulares:grants,tienePermisosGranulares:true,permissionsAdopted:true,surfacePermissions:[]}) && (key==='superadmin'||m.baseline)
  }}
}
for(const role of APPROVED_ROLES) test(`rol ${role.name}: disposición canónica, permiso V y datos permitidos`,async()=>{
  const r=readers(),ctx=context(role.key),model=await loadDashboardModel(ctx,r.value)
  assert.equal(model.role,role.key)
  const expected=AREA4_DASHBOARD_LAYOUTS[role.key].columns.map(ids=>ids.filter(id=>{const d=AREA4_DASHBOARD_BLOCKS.find(b=>b.id===id)!;return ctx.canRead(d.sectionKey,d.sourcePath)}))
  assert.deepEqual(model.columns.map(c=>c.map(b=>b.id)),expected)
  for(const b of model.columns.flat())assert.equal(ctx.canRead(b.sectionKey,b.href!),true)
  for(const k of model.kpis)assert.equal(ctx.canRead(k.sectionKey,k.href!),true)
  if(role.key!=='superadmin'){assert.equal(r.calls.includes('rentabilidad'),false);assert.equal(JSON.stringify(model).includes('59.2'),false)}
  if(['comercial','draxton','empleado'].includes(role.key))for(const key of ['finance','clients','contracts'])assert.equal(r.calls.includes(key),false)
  assert.equal(JSON.stringify(model).includes('9999'),false)
})
test('apartado revocado: se excluye en SSR y el lector no se ejecuta',async()=>{
  const r=readers(),m=await loadDashboardModel(context('gerente',['facturacion','clientes','contratos','crm','leads']),r.value)
  assert.deepEqual(r.calls,[])
  assert.equal(m.columns.flat().some(b=>b.id==='facturado'),false)
})
test('fallo de fuentes: sin dato, nunca se sustituye por cero ni datos inventados',async()=>{
  const r=readers();for(const key of Object.keys(r.value))r.value[key as keyof DashboardReaders]=(async()=>{throw new Error('TEST_FAILURE')}) as never
  const m=await loadDashboardModel(context('superadmin'),r.value)
  assert.equal(m.kpis.every(k=>k.value==='sin dato'),true)
  assert.equal(m.columns.flat().filter(b=>b.chart).every(b=>b.state==='unavailable'),true)
})
test('margen sale del lector: corrección de maqueta solo en fixture, octubre provisional',async()=>{
  const r=readers(),m=await loadDashboardModel(context('superadmin'),r.value)
  const margin=m.columns.flat().find(b=>b.id==='margen')!
  assert.deepEqual(margin.points?.map(p=>p.value),marginFixture)
  assert.equal(margin.points?.at(-1)?.provisional,true)
  r.value.rentabilidad=async()=>[{month:'2026-10',value:12.34,provisional:false}]
  const changed=await loadDashboardModel(context('superadmin'),r.value)
  assert.equal(changed.columns.flat().find(b=>b.id==='margen')?.points?.[0].value,12.34)
})
test('actuación: nunca llama al lector privado de Rentabilidad',async()=>{
  const ctx=context('superadmin');ctx.acting=true;ctx.owner=false;ctx.principal={...ctx.principal,rol:'GERENTE'};ctx.profile='Gerente'
  const r=readers(),m=await loadDashboardModel(ctx,r.value)
  assert.equal(m.owner,false);assert.equal(r.calls.includes('rentabilidad'),false)
})
test('Ver como: todos los roles son solo estructura sin datos ni enlaces del dueño',async()=>{
  const r=readers(),m=await loadDashboardModel(context('superadmin'),r.value)
  for(const role of APPROVED_ROLES){const preview=dashboardPreview(m,role.key);assert.equal(preview.kpis.every(k=>k.value==='sin dato'&&!k.href),true);assert.equal(preview.columns.flat().every(b=>!b.rows&&!b.points&&!b.href),true);assert.equal(JSON.stringify(preview).includes('Cliente ficticio'),false)}
})
test('metadata: fuentes reales, IDs únicos, baseline literal intacto',()=>{
  const ds=[...AREA4_DASHBOARD_BLOCKS,...AREA4_DASHBOARD_KPIS]
  for(const d of ds){const m=area4RegisteredSurface(d.sourcePath,'page');assert.ok(m,`${d.id}: ruta no registrada`);assert.equal(m.section.areaCode,area4SectionByKey(d.sectionKey)?.areaCode)}
  assert.equal(new Set(AREA4_DASHBOARD_BLOCKS.map(b=>b.id)).size,AREA4_DASHBOARD_BLOCKS.length)
  assert.equal(AREA4_BASELINE_DESCRIPTORS_SHA256,'46f6730c0eb75836ee9fbf311d6ebb38b1b5e70babedc56591f6d6c97854a92f')
  assert.equal(AREA4_BASELINE_IDENTITIES_SHA256,'1fd44a77bd14022b2e72de292e7081daf5b7590ec2f8c11c6416844afba0470c')
  for(const f of ['lib/area4/dashboard-server.ts','lib/area4/dashboard-model.ts','components/admin/dashboard/DashboardView.tsx']){
    const s=readFileSync(f,'utf8');assert.doesNotMatch(s,/\b(FACT|MARG)\s*=|59\.2|43\.1|cargarAgendaOutlook\(|rebuildRentabilidadReport\(/)
  }
})

test('preview: ninguna plantilla revela bloques sin V, aunque el dueño pueda verlos', async()=>{
  const r=readers(),m=await loadDashboardModel(context('superadmin'),r.value)
  for(const role of APPROVED_ROLES){const ctx=context(role.key),preview=dashboardPreview(m,role.key)
    for(const b of preview.columns.flat()){const d=AREA4_DASHBOARD_BLOCKS.find(d=>d.id===b.id)!;assert.equal(ctx.canRead(d.sectionKey,d.sourcePath),true)}
    for(const k of preview.kpis){const d=AREA4_DASHBOARD_KPIS.find(d=>d.id===k.id)!;assert.equal(ctx.canRead(d.sectionKey,d.sourcePath),true)}
    if(role.key==='draxton')assert.equal(preview.columns.flat().length,0)
  }
})
test('comercial con extras globales: nunca lee Clientes, Contratos, Banco ni Rentabilidad',async()=>{
  const ctx=context('comercial');ctx.canRead=()=>true;const r=readers(),m=await loadDashboardModel(ctx,r.value)
  assert.deepEqual(r.calls,['crm']);assert.equal(JSON.stringify(m).includes('9999'),false)
  assert.equal(m.kpis.filter(k=>k.id==='mis-clientes').every(k=>k.value==='sin dato'),true)
})
test('cableado real: Tarifas requiere su V y no se llama a lectores que escriben o a Graph',()=>{
  const source=readFileSync('lib/area4/dashboard-server.ts','utf8')
  assert.match(source,/canRead\('tarifas', '\/admin\/tarifas'\) \? prisma\.tarifa\.count/)
  assert.doesNotMatch(source,/\.create\(|\.update\(|\.delete\(|rebuildRentabilidadReport|cargarAgendaOutlook|fetch\(/)
})

test('ficha denegada: se elimina toda la fila, no solo su enlace',async()=>{
 const ctx=context('superadmin'),read=ctx.canRead;ctx.canRead=(key,path)=>path.includes('fake-contact')?false:read(key,path)
 const r=readers(),m=await loadDashboardModel(ctx,r.value)
 assert.equal(JSON.stringify(m).includes('Cliente ficticio de la prueba'),false)
 assert.equal(JSON.stringify(m).includes('Tarea ficticia'),false)
 assert.deepEqual(m.columns.flat().find(b=>b.id==='mi-dia')?.rows,[])
})
test('sin V de Contactos o Pipelines: no se lee el resumen amplio CRM',async()=>{
 for(const deny of ['crm.contactos','crm.pipelines']){const r=readers();await loadDashboardModel(context('superadmin',[deny]),r.value);assert.equal(r.calls.includes('crm'),false)}
})
test('B7 real: factura sin importe conserva null y cuenta identidad y revisión',()=>{
 const result=calculateBankInvoicing({invoices:[{id:'fake-unknown',sourceTotalText:null,b2Economic:true,numFactura:null,cliente:null,fechaVencimientoISO:null,facturaISPId:null,fechaISO:'2026-11-10'}]})
 const f=projectDashboardFinance(result,2026,11,'2026-11-25',true)
 assert.equal(f.yearTotal,null);assert.equal(f.monthTotal,null);assert.equal(f.confirmed,null)
 assert.equal(f.pendingReal,null);assert.equal(f.withoutStatement,null)
 assert.equal(f.invoiceCount,1);assert.equal(f.monthCount,1);assert.equal(f.revisionCount,1)
 assert.equal(f.points.at(-1)?.value,null)
})
test('B7 real: contadores y sumas usan el mismo año y corte civil, sin facturas futuras',()=>{
 const result=calculateBankInvoicing({invoices:[{id:'fake-current',sourceTotalText:'100.00',b2Economic:true,numFactura:null,cliente:null,fechaVencimientoISO:null,facturaISPId:null,fechaISO:'2026-11-10'},{id:'fake-future',sourceTotalText:'700.00',b2Economic:true,numFactura:null,cliente:null,fechaVencimientoISO:null,facturaISPId:null,fechaISO:'2026-12-01'},{id:'fake-old',sourceTotalText:'900.00',b2Economic:true,numFactura:null,cliente:null,fechaVencimientoISO:null,facturaISPId:null,fechaISO:'2025-11-10'}]})
 const f=projectDashboardFinance(result,2026,11,'2026-11-25',false)
 assert.equal(f.yearTotal,100);assert.equal(f.monthTotal,100);assert.equal(f.invoiceCount,1);assert.equal(f.monthCount,1)
 assert.equal(f.confirmed,null);assert.equal(f.pendingReal,null);assert.equal(f.revisionCount,null)
})
test('Rentabilidad real: coste o ingreso desconocido nunca pasa a 100 %',()=>{
 assert.equal(projectDashboardMargin([{income:100,rawIncome:100,cost:null,rawCost:null,pending:true}],'2026-10','2026-10').value,null)
 assert.equal(projectDashboardMargin([{income:null,rawIncome:null,cost:60,rawCost:60}],'2026-10','2026-10').value,null)
 const known=projectDashboardMargin([{income:100,rawIncome:100,cost:60,rawCost:60}],'2026-10','2026-10')
 assert.equal(known.value,40);assert.equal(known.provisional,false)
 const estimated=projectDashboardMargin([{income:100,rawIncome:100,cost:0,rawCost:0,estimatedCost:10,pending:true}],'2026-10','2026-10')
 assert.equal(estimated.value,90);assert.equal(estimated.provisional,true)
})
