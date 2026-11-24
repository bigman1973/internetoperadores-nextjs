import { readInputs, appendRun, importInitial, saveRule, assertRentabilidadConfiguration } from './store';
import { ispAvailability, readConfiguredLineExport } from './isp';
import { rebuildRentabilidadReport, checkedMonth } from './report';
import { normalize, shiftMonth } from './engine';

export function assertAutomationEnabled(env:Record<string,string|undefined>=process.env) {
  assertRentabilidadConfiguration(env);
  if(env.RENTABILIDAD_ENABLED!=='1')throw new Error('RENTABILIDAD_DISABLED');
}
export function madridDate(date=new Date()) {
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(key:string)=>p.find(i=>i.type===key)?.value||'';
  return {month:`${part('year')}-${part('month')}`,day:Number(part('day'))};
}
export async function proposeExternalCosts(month:string,actorId:number) {
  assertAutomationEnabled();month=checkedMonth(month);const inputs=await readInputs();
  // Approved handover: 2027 sources must be IO purchase invoices, not automatic external estimates.
  if(month>='2027-01')return {proposed:0,reason:'HANDOVER_IO_2027'};
  const existing=inputs.costs.filter(c=>(c.payer??c.sociedadPagadora)!=='IO');
  const identities=new Map<string,any[]>();
  for(const c of existing){const key=`${normalize(c.provider??c.proveedor)}:${normalize(c.product??c.productoId)}:${normalize(c.payer??c.sociedadPagadora)}`;const rows=identities.get(key)||[];rows.push(c);identities.set(key,rows);}
  let proposed=0;
  for(const [identity,rows] of identities){
    if(rows.some(c=>(c.month??c.mes)===month))continue;
    const last=rows.filter(c=>(c.month??c.mes)<month).sort((a,b)=>String(b.month??b.mes).localeCompare(String(a.month??a.mes)))[0];
    if(!last||(last.fechaBaja&&last.fechaBaja<=`${month}-01`))continue;
    const amount=last.amount??last.importe??last.baseAmount;
    if(amount==null)continue;
    await saveRule({key:`external-proposal:${identity}:${month}`,type:'externalCost',month,mes:month,provider:last.provider??last.proveedor,product:last.product??last.productoId,payer:last.payer??last.sociedadPagadora,sociedadPagadora:last.payer??last.sociedadPagadora,amount:String(amount),importe:String(amount),status:'ESTIMADO',estado:'ESTIMADO',fechaBaja:last.fechaBaja??'2027-01-01',source:'AUTO_LAST_KNOWN_EXTERNAL',previousSourceKey:last.key,note:'Propuesta automática con la última cuota conocida; no es factura real. Confirmación puntual por superadmin.'},actorId);
    proposed++;
  }
  return {proposed};
}
export async function synchronizeRentabilidad(actorId:number) {
  assertAutomationEnabled();const availability=ispAvailability();
  if(!availability.lines||process.env.RENTABILIDAD_SYNC_APPROVED!=='1'){
    const result={actorId,process:'ISP_DAILY',estado:'BLOQUEADO',reason:!availability.lines?availability.reason:'SYNC_EXPLICIT_APPROVAL_REQUIRED',rows:0,alternative:'Exportador listado299 HTTPS de host autorizado pendiente de acreditar; carga inicial CSV conservada.'};await appendRun(result);return result;
  }
  try {
    const exported=await readConfiguredLineExport();
    // Remote exports cannot reset the independently edited masters or replay initial defaults.
    const report=await importInitial({...exported.payload,contracts:[],costs:[],references:[],products:[],rules:[]},actorId);
    const result={actorId,process:'ISP_DAILY',estado:report.rechazadas?'REVISION':'COMPLETADO',rows:report.leidas,inserted:report.insertadas,unchanged:report.sinCambios,rejected:report.rechazadas,sourceHash:exported.sourceHash};await appendRun(result);return result;
  } catch(error){const result={actorId,process:'ISP_DAILY',estado:'ERROR',reason:error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'ISP_EXPORT_FAILED',rows:0};await appendRun(result);return result;}
}
export async function runRentabilidadDaily(actorId:number,date=new Date()) {
  assertAutomationEnabled();const now=madridDate(date),month=shiftMonth(now.month,-1);
  const isp=await synchronizeRentabilidad(actorId),external=await proposeExternalCosts(now.month,actorId);
  // Current-month incoming invoices and alerts must not wait until the next closure.
  const current=await rebuildRentabilidadReport(now.month,actorId),projection=await rebuildRentabilidadReport(month,actorId);
  await appendRun({actorId,process:'INVOICES_AND_ALERTS',estado:current.summary.month.pending?'PROVISIONAL':'COMPLETADO',month:now.month,alerts:current.alerts.length,sourceHash:current.controls.sourceHash,projectionVersion:current.snapshot.version});
  let close:any=null;
  if(now.day===5){const report=await rebuildRentabilidadReport(month,actorId,'CIERRE');close=report.snapshot;}
  return {month,currentMonth:now.month,isp,external,projection:projection.snapshot,currentProjection:current.snapshot,alerts:current.alerts.length,close,notifications:'PANEL_ONLY',scheduler:'PREVIEW_NOT_AUTOMATIC'};
}
