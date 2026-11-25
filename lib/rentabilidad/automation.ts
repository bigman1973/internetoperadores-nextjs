import { readInputs, appendRun, importInitial, saveRule, assertRentabilidadConfiguration } from './store';
import { ispAvailability, readConfiguredLineExport, readIspContracts, createIspReadTransport } from './isp';
import { rebuildRentabilidadReport, checkedMonth } from './report';
import { normalize, shiftMonth } from './engine';
import { RentabilidadError, type ImportPayload } from './types';

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
/** Explicit empty masters are mandatory: importInitial otherwise installs initial defaults. */
export function remoteSyncPayload(payload:ImportPayload):ImportPayload {
  return {source:payload.source??'ISP_REMOTE_SYNC',contracts:payload.contracts??[],lines:payload.lines??[],costs:[],references:[],products:[],rules:[]};
}
/** Only an already accredited ID/code association can link these two distinct identities. */
export function accreditedContractCodes(contracts:ReadonlyArray<Record<string,any>>):Map<string,string> {
  const map=new Map<string,string>(),codes=new Set<string>();
  for(const row of contracts){
    if(row.ispGestionContratoId==null||row.ispIdentityVerified!==true)continue;
    const id=String(row.ispGestionContratoId),code=row.codigoContratoIsp??row.contractCode;
    if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id))||typeof code!=='string'||!code||code!==code.trim())throw new RentabilidadError('ISP_CONTRACT_IDENTITY_CONFLICT');
    if(map.has(id)||codes.has(code))throw new RentabilidadError('ISP_CONTRACT_IDENTITY_CONFLICT');
    map.set(id,code);codes.add(code);
  }
  return map;
}
export type SyncDependencies = {
  env?:Record<string,string|undefined>;
  readInputs?:typeof readInputs;
  contracts?:(codes:ReadonlyMap<string,string>)=>Promise<ImportPayload>;
  lines?:()=>ReturnType<typeof readConfiguredLineExport>;
  importPayload?:typeof importInitial;
  append?:typeof appendRun;
};
function safeSourceFailure(error:unknown) {return error instanceof RentabilidadError?error.code:'ISP_SOURCE_READ_FAILED';}
export async function synchronizeRentabilidad(actorId:number,dependencies:SyncDependencies={}) {
  const env=dependencies.env??process.env;assertAutomationEnabled(env);
  const availability=ispAvailability(env),append=dependencies.append??appendRun;
  const alternative='Exportación HTTPS explícita de líneas y mapeo acreditado ID/código contractual; CSV inicial conservado, sin inventar listado299 ni proveedor/periodicidad.';
  if(env.RENTABILIDAD_SYNC_APPROVED!=='1'){
    const result={actorId,process:'ISP_DAILY',estado:'BLOQUEADO',reason:'SYNC_EXPLICIT_APPROVAL_REQUIRED',rows:0,availability,alternative};await append(result);return result;
  }
  const sources={...availability.sources},missingFields=new Set<string>();let payload:ImportPayload={source:'ISP_REMOTE_SYNC',contracts:[],lines:[]};
  if(sources.contracts.configured){
    try{
      const inputs=await (dependencies.readInputs??readInputs)();
      const codes=accreditedContractCodes(inputs.contracts);
      const contracts=await (dependencies.contracts??(mapping=>readIspContracts(createIspReadTransport(env),mapping)))(codes);
      payload.contracts=contracts.contracts??[];
      sources.contracts={estado:'DISPONIBLE',reason:'ISP_CONTRACT_READ_VERIFIED_IDENTITY_REQUIRED',configured:true};
      if(payload.contracts.some(row=>row.periodicidadMeses==null))missingFields.add('CONTRACT_PERIODICITY_NOT_SUPPLIED');
      if(payload.contracts.some(row=>!row.proveedor&&!row.provider))missingFields.add('CONTRACT_PROVIDER_NOT_SUPPLIED');
      if(payload.contracts.some(row=>row.precioPeriodo==null))missingFields.add('CONTRACT_PRICE_NOT_SUPPLIED');
    }catch(error){sources.contracts={estado:'ERROR',reason:safeSourceFailure(error),configured:true};}
  }
  if(sources.lines.configured){
    try{
      const exported=await (dependencies.lines??(()=>readConfiguredLineExport(env)))();payload.lines=exported.payload.lines??[];
      for(const field of exported.missingFields)missingFields.add(field);
      sources.lines={estado:'DISPONIBLE',reason:'ISP_LINE_EXPORT_READ_VERIFIED_FIELDS_MAY_BE_PARTIAL',configured:true};
    }catch(error){sources.lines={estado:'ERROR',reason:safeSourceFailure(error),configured:true};}
  }
  const observed=ispAvailability(env,sources);const anyRead=Object.values(sources).some(source=>source.estado==='DISPONIBLE');
  if(!anyRead){
    const failed=Object.values(sources).some(source=>source.estado==='ERROR');
    const result={actorId,process:'ISP_DAILY',estado:failed?'ERROR':'BLOQUEADO',reason:failed?'ISP_SOURCE_READ_FAILED':observed.reason,rows:0,availability:observed,alternative};await append(result);return result;
  }
  // These reads never write ISP/financial sources; append-only analytical store performs identity/conflict checks.
  try{
    const report=await (dependencies.importPayload??importInitial)(remoteSyncPayload(payload),actorId);
    const partial=observed.estado!=='DISPONIBLE'||missingFields.size>0;
    const result={actorId,process:'ISP_DAILY',estado:report.rechazadas?'REVISION':partial?'PARCIAL':'COMPLETADO',rows:report.leidas,inserted:report.insertadas,updated:report.actualizadas,unchanged:report.sinCambios,rejected:report.rechazadas,sourceHash:report.sourceHash,availability:observed,missingFields:[...missingFields].sort(),collections:report.byCollection};await append(result);return result;
  }catch(error){const result={actorId,process:'ISP_DAILY',estado:'ERROR',reason:safeSourceFailure(error),rows:0,availability:observed};await append(result);return result;}
}
export type DailyDependencies={env?:Record<string,string|undefined>;sync?:typeof synchronizeRentabilidad;external?:typeof proposeExternalCosts;rebuild?:typeof rebuildRentabilidadReport;append?:typeof appendRun};
export async function runRentabilidadDaily(actorId:number,date=new Date(),dependencies:DailyDependencies={}) {
  const env=dependencies.env??process.env;assertAutomationEnabled(env);const now=madridDate(date),month=shiftMonth(now.month,-1),append=dependencies.append??appendRun;
  const scheduler=env.RENTABILIDAD_SCHEDULER==='MANUS_SCHEDULE'?'MANUS_SCHEDULE':'MANUAL_ONLY';
  await append({actorId,process:'DAILY_START',estado:'INICIADO',month,currentMonth:now.month,scheduler});
  try{
    const isp=await (dependencies.sync??synchronizeRentabilidad)(actorId),external=await (dependencies.external??proposeExternalCosts)(now.month,actorId);
    const rebuild=dependencies.rebuild??rebuildRentabilidadReport;
    // Current-month incoming invoices and alerts must not wait until the next closure.
    const current=await rebuild(now.month,actorId),projection=await rebuild(month,actorId);
    await append({actorId,process:'INVOICES_AND_ALERTS',estado:current.summary.month.pending?'PROVISIONAL':'COMPLETADO',month:now.month,alerts:current.alerts.length,sourceHash:current.controls.sourceHash,projectionVersion:current.snapshot.version});
    let close:any=null;if(now.day===5){const report=await rebuild(month,actorId,'CIERRE');close=report.snapshot;}
    const estado=isp.estado!=='COMPLETADO'?'PARCIAL':current.summary.month.pending||projection.summary.month.pending?'PROVISIONAL':'COMPLETADO';
    await append({actorId,process:'DAILY_END',estado,month,currentMonth:now.month,scheduler,ispEstado:isp.estado,rows:isp.rows,externalProposed:external.proposed,alerts:current.alerts.length,closed:close!==null});
    return {month,currentMonth:now.month,isp,external,projection:projection.snapshot,currentProjection:current.snapshot,alerts:current.alerts.length,close,notifications:'PANEL_ONLY',scheduler,estado};
  }catch(error){await append({actorId,process:'DAILY_END',estado:'ERROR',month,currentMonth:now.month,scheduler,reason:error instanceof RentabilidadError?error.code:'RENTABILIDAD_DAILY_FAILED'});throw error;}
}
