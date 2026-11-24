import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { facturaEconomicaSQL } from '@/lib/finanzas/invoice-economic-filter';
import { readInputs, saveSnapshot, listSnapshots, appendRun, listRecentRuns, getRuleHistory, getExternalCostHistory, listResolvedExceptions } from './store';
import { activeInMonth, allocate, canonicalProduct, classifyContract, hash, imputeInvoices, invoiceRule, money, normalize, periodicity, PRODUCT_LABELS, shiftMonth } from './engine';
import { INITIAL_COST_RULES } from './defaults';
import { compactReportPresentation } from './presentation';
import { rentabilidadAutomationStatus } from './status';

const MONTH = /^20\d{2}-(0[1-9]|1[0-2])$/;
export function checkedMonth(value?: string): string {
  const fallback = shiftMonth(new Date().toISOString().slice(0,7), -1);
  const month = value || fallback; if (!MONTH.test(month)) throw new Error('Selecciona un mes válido.'); return month;
}
function monetary(row:any):number { return Number(row.importeBaseDecimal ?? row.importeBaseExacto ?? row.baseAmount ?? row.amount ?? row.importe ?? row.importeBase ?? row.precio ?? (row.importeBaseCentimos != null ? Number(row.importeBaseCentimos)/100 : 0)); }
function contractDTO(row:any):any {
  const state=normalize(row.state ?? row.estado ?? row.estadoOriginal);
  return {...row,contractCode:String(row.contractCode ?? row.codigoContratoIsp ?? row.codigoContrato ?? ''),clientCode:String(row.clientCode ?? row.codigoCliente ?? row.clienteId ?? ''),clientName:row.clientName ?? row.nombreCliente ?? row.clienteNombre ?? row.cliente ?? 'Cliente sin identificar',provider:row.provider ?? row.proveedor ?? null,product:row.product ?? row.producto ?? row.productoId ?? null,tariff:row.tariff ?? row.tarifa ?? '',description:row.description ?? row.descripcion ?? row.descripcionSede ?? '',speedMbps:Number(row.speedMbps ?? row.velocidadBajadaMb ?? 0),startDate:row.startDate ?? row.fechaAlta ?? row.fechaInicio,endDate:row.endDate ?? row.fechaBaja ?? row.fechaFin,active:row.active ?? row.activo ?? !state.includes('baja'),periodicityMonths:periodicity(row.periodicityMonths ?? row.periodMonths ?? row.periodicidadMeses ?? row.periodicidad),price:row.price ?? row.precioPeriodo ?? (row.cuotaPeriodoCentimos != null ? Number(row.cuotaPeriodoCentimos)/100 : null)};
}
function lineDTO(row:any):any { return {...row,contractCode:String(row.contractCode ?? row.codigoContratoIsp ?? ''),clientCode:String(row.clientCode ?? row.codigoCliente ?? ''),clientName:row.clientName ?? row.nombreCliente ?? 'Cliente sin identificar',tariff:row.tariff ?? row.tarifa ?? '',concept:row.concept ?? row.concepto ?? '',baseAmount:monetary(row),date:String(row.date ?? row.fechaFuente ?? row.fecha ?? ''),month:row.month ?? row.mesServicio ?? String(row.date ?? row.fechaFuente ?? '').slice(0,7),periodicityMonths:periodicity(row.periodicityMonths ?? row.periodMonths ?? row.periodicidadMeses ?? row.periodicidad)}; }
function costDTO(row:any):any { return {...row,month:row.month ?? row.mes,amount:monetary(row),product:canonicalProduct(row.product ?? row.producto ?? row.productoId ?? row.provider ?? row.proveedor),provider:row.provider ?? row.proveedor ?? '',status:row.status ?? row.estado ?? 'REFERENCIA',payer:row.payer ?? row.sociedadPagadora ?? 'IO',directClient:row.directClient ?? row.clienteDirecto ?? null,directContract:row.directContract ?? row.contratoDirecto ?? null,source:row.source ?? row.origen,allocation:row.allocation ?? row.tipoReparto}; }
function ruleDTO(row:any):any { return {...row,provider:row.provider ?? row.proveedor ?? row.proveedorNombre,product:row.product ?? row.productoId,cif:row.cif ?? row.proveedorCif,allocation:({DIRECTA:'DIRECT',INGRESO:'REVENUE',MB:'MB'} as any)[row.allocation ?? row.method ?? row.imputacion] ?? row.allocation,period:({MES:'MONTH',BIMESTRAL_VENCIDO:'BIMONTH',ANUAL:'YEAR'} as any)[row.period] ?? row.period}; }
const noSupplierCost=new Set(['Comisiones Aire','Comisiones Xfera','Hotspot','Servicios IO sin coste de proveedor']);
const rawField=(row:any,field:string)=>Number(row[`raw${field[0].toUpperCase()}${field.slice(1)}`] ?? row[field] ?? 0);
function totals(items:any[]) {
  const rawIncome=items.reduce((s,p)=>s+rawField(p,'income'),0),rawCost=items.reduce((s,p)=>s+rawField(p,'cost'),0),rawEstimatedCost=items.reduce((s,p)=>s+rawField(p,'estimatedCost'),0);
  const incomeUnknown=items.some(p=>p.income===null||p.rawIncome===null||p.incomePending),costUnknown=items.some(p=>p.cost===null||p.rawCost===null);
  const pending=incomeUnknown||costUnknown||items.some(p=>p.pending || p.pendingCost || rawField(p,'estimatedCost')!==0),income=incomeUnknown?null:money(rawIncome),cost=costUnknown?null:money(rawCost);
  return {income,cost,estimatedCost:money(rawEstimatedCost),margin:incomeUnknown||costUnknown||pending&&items.some(p=>p.contractedBasis)?null:money(rawIncome-rawCost),marginPct:pending||!rawIncome?null:money(100*(rawIncome-rawCost)/rawIncome),pending,incomePending:incomeUnknown,rawIncome:incomeUnknown?null:rawIncome,rawCost:costUnknown?null:rawCost,rawEstimatedCost};
}
function payrollCost(g:any,month:string) {
  const assignments=(g.personalAsignado||[]).filter((p:any)=>activeInMonth({startDate:p.fechaInicio,endDate:p.fechaFin,active:p.activo},month));
  const rows=assignments.map((p:any)=>{
    const n=p.empleado?.nominas?.find((n:any)=>`${n.anio}-${String(n.mes).padStart(2,'0')}`===month),company=n?.costeTotalEmpresa;
    const valid=company!==null&&company!==undefined&&company!==''&&Number.isFinite(Number(company));
    return {assignmentId:p.id,employeeId:p.empleadoId,percentage:Number(p.porcentajeDedicacion||0),cost:valid?(Number(company)-Number(n.gastosDesplazamiento||0))*Number(p.porcentajeDedicacion||0)/100:null};
  });
  return {rows,cost:rows.reduce((s:number,p:any)=>s+(p.cost??0),0),pending:!rows.length||rows.some((p:any)=>p.cost==null)};
}
function teleco(g:any){return /internet|teleco/.test(normalize(`${g.titulo} ${g.codigoContrato}`));}
function supplierContracts(g:any,month:string){return (g.contratosProveedor||[]).filter((p:any)=>p.estado==='Activo'&&activeInMonth({startDate:p.fechaInicioServicio||p.fechaInicio,endDate:p.fechaFin,active:true},month));}
const costActive=(c:any,m:string)=>activeInMonth({startDate:c.startDate||c.fechaAlta||c.fechaInicio,endDate:c.endDate||c.fechaBaja||c.fechaFin,active:c.active??c.activo},m);
const recurringCost=(c:any)=>c.recurring!==false&&c.recurrent!==false&&c.nonRecurrent!==true&&!/\b(one off|puntual|instalacion|setup|alta unica)\b/.test(normalize(c.description));
/** A rule states a supplier expectation, never documentary coverage or an amount. */
function supplierCoverage(product:string,month:string,costs:any[],rules:any[],invoices:Map<string,any>,hasContracts:boolean,identities:WeakMap<object,any>) {
  const applicable=(r:any)=>canonicalProduct(r.product)===product||product==='Wildix Borges'&&canonicalProduct(r.product)==='Wildix';
  const costRule=(r:any)=>r.kind==='COSTE'||r.type==='cost'||r.type==='costRule';
  const enabled=(r:any)=>r.active!==false&&r.activo!==false&&r.method!=='EXCLUIR'&&r.allocation!=='EXCLUDE'&&r.allocation!=='EXCLUIR';
  const activeRules=rules.filter(r=>costRule(r)&&enabled(r)&&applicable(r)&&costActive(r,month));
  const identity=(c:any)=>{
    const cached=identities.get(c);if(cached)return cached;
    const invoice=invoices.get(String(c.sourceId)),rule=invoice?invoiceRule(invoice,rules):null;
    const matches=rule?[]:rules.filter(r=>costRule(r)&&normalize(r.provider)&&normalize(c.provider).includes(normalize(r.provider))).sort((a,b)=>normalize(b.provider).length-normalize(a.provider).length);
    const family=normalize(rule?.provider||matches[0]?.provider||c.provider);
    let component=String(c.componentId||c.component||c.componente||c.directLineId||c.lineId||c.directContract||normalize(c.directSite||c.site)||normalize(c.directClient||c.clientIdentity)||'');
    // Annual coverage is a distinct service, not satisfied by a monthly line of that client.
    // Do not use invoice IDs/dates as recurrence identities; they change every document.
    const annual=/\b(1 year|12 month|panda)\b/.test(normalize(c.description))||c.periodBasis==='DOCUMENT_PERIOD'&&(rule?.period==='YEAR'||/20\d{2}/.test(String(c.description)));
    if(annual)component=`${component}:annual`;
    const recurrent=recurringCost(c)&&(!invoice||recurringCost(invoice))&&(!rule||recurringCost(rule));
    const value={family,component,recurrent,key:JSON.stringify([family,normalize(c.payer||'IO'),component])};identities.set(c,value);return value;
  };
  const family=(c:any)=>identity(c).family,component=(c:any)=>identity(c).component,key=(c:any)=>identity(c).key;
  const recurrent=(c:any)=>identity(c).recurrent;
  const history=costs.filter(c=>c.product===product&&c.month<=month&&recurrent(c));
  const expected=new Map<string,any>();
  for(const c of history){
    // A disabled/excluded family must not be reactivated by a historical invoice.
    const related=rules.filter(r=>costRule(r)&&applicable(r)&&normalize(r.provider)===family(c));
    if(related.length&&!related.some(r=>enabled(r)&&costActive(r,month)))continue;
    const id=key(c),previous=expected.get(id);
    if(!previous||c.month>previous.month)expected.set(id,c);
  }
  for(const [id,c] of expected)if(!costActive(c,month))expected.delete(id);
  if(hasContracts&&!noSupplierCost.has(product))for(const r of activeRules){
    // Pattern variants are required only for an evidenced service, not every invoice number.
    if(r.invoicePattern||r.conceptPattern||r.pattern||r.recurring===false||r.recurrent===false)continue;
    const f=normalize(r.provider);if(!f)continue;
    const families=[...expected.values()].filter(c=>family(c)===f);
    // External families retain their payer. Cogent is explicitly an IO component.
    if(!families.length||f==='cogent'&&!families.some(c=>normalize(c.payer||'IO')==='io')){
      const c={provider:r.provider,product,payer:r.payer||r.sociedadPagadora||'IO'};expected.set(key(c),c);
    }
  }
  const observed=costs.filter(c=>c.product===product&&c.month===month&&costActive(c,month)&&recurrent(c));
  const missing=[...expected.entries()].filter(([id])=>!observed.some(c=>c.status==='REAL'&&key(c)===id));
  // If prior detail had several anonymous pieces and only part is now documented,
  // completeness is unknown. Do not fabricate a component identity or a delta.
  for(const [id,c] of expected){
    if(component(c)||missing.some(([missingId])=>missingId===id))continue;
    const prior=history.filter(v=>key(v)===id&&v.status==='REAL'&&v.month<month).sort((a,b)=>b.month.localeCompare(a.month)),last=prior[0]?.month;
    const previousCount=prior.filter(v=>v.month===last).length,currentCount=observed.filter(v=>key(v)===id&&v.status==='REAL').length;
    if(currentCount&&currentCount<previousCount)missing.push([id,c]);
  }
  const estimates:any[]=[];
  for(const [id,c] of missing){
    // Existing estimates are kept separate; do not add the historical amount over them.
    if(observed.some(v=>key(v)===id))continue;
    const prior=history.filter(v=>v.status==='REAL'&&key(v)===id&&v.month<month&&costActive(v,month)).sort((a,b)=>b.month.localeCompare(a.month)),last=prior[0]?.month;
    if(!last)continue;
    const parts=prior.filter(v=>v.month===last);
    // Multiple undocumented components of one provider cannot be forecast as a full total.
    if(!component(c)&&observed.some(v=>family(v)===family(c)&&normalize(v.payer||'IO')===normalize(c.payer||'IO')))continue;
    for(const part of parts)estimates.push({...part,month,status:'ESTIMADO',source:`estimacion:${month}:${part.source}`,historicalMonth:last,periodBasis:'MISSING_COMPONENT_HISTORY'});
  }
  return {missing:missing.map(([id,c])=>({identity:id,provider:c.provider,payer:c.payer||'IO',component:component(c)})),estimates};
}
function directCandidates(cost:any,rows:any[]):any[] {
  let candidates=rows.filter(r=>r.product===cost.product);
  if(cost.commonCost)return [];
  if(cost.directContract)candidates=candidates.filter(r=>r.contractCode===String(cost.directContract));
  // Every supplied identity constrains the result, even with an explicit contract.
  // An unknown line ID is not permission to fall back to the only client/name.
  if(cost.directLineId||cost.lineId)candidates=candidates.filter(r=>r.operatorLineId!=null&&String(r.operatorLineId)===String(cost.directLineId||cost.lineId));
  if(cost.clientIdentity)candidates=candidates.filter(r=>r.clientCode===String(cost.clientIdentity)||!!r.clientCif&&normalize(r.clientCif)===normalize(cost.clientIdentity));
  const target=normalize(cost.directClient),site=normalize(cost.directSite||cost.site||'');
  const siteMatches=(r:any,value:string)=>[r.directSite,r.site,r.description].some(v=>!!normalize(v)&&normalize(v)===value);
  if(target){
    const isClient=(r:any)=>r.clientCode===String(cost.directClient)||normalize(r.clientName)===target;
    // Legacy invoice lines may put a literal site in `cliente`, but never a fuzzy substring.
    const namedClient=rows.some(isClient);
    candidates=candidates.filter(r=>namedClient?isClient(r):isClient(r)||siteMatches(r,target));
  }
  if(site)candidates=candidates.filter(r=>siteMatches(r,site));
  // A direct line may belong to a client with multiple sites. Never distribute it by income.
  return candidates.length===1?candidates:[];
}
function supplierSiteComparison(suppliers:any[], monthCosts:any[]) {
  const services=suppliers.flatMap((p:any)=>Array.isArray(p.serviciosJson)?p.serviciosJson.map((v:any,i:number)=>({supplier:p,index:i,service:v})):[]);
  const assigned=new Map<string,any[]>();
  for(const cost of monthCosts.filter(c=>c.status==='REAL')){
    const text=normalize(`${cost.directSite||''} ${cost.directClient||''} ${cost.description||''}`);
    const matches=services.filter((entry:any)=>{
      const location=normalize(entry.service.ubicacion||entry.service.location||'');
      const place=location.match(/fonolleres|utrillas|apatamonasterio|sant vicenc|brno|wroclaw|italia|polonia|cex premium/g)||[];
      return place.some((name:string)=>text.includes(name)) || !!cost.directSite&&location.includes(normalize(cost.directSite));
    });
    if(matches.length!==1)continue;
    const entry=matches[0],key=`${entry.supplier.id}:${entry.index}`,bucket=assigned.get(key)||[];bucket.push(cost);assigned.set(key,bucket);
  }
  return suppliers.map((p:any)=>{
    const parts=services.filter((s:any)=>s.supplier.id===p.id).map((entry:any)=>{
      const rows=assigned.get(`${p.id}:${entry.index}`)||[],actual=rows.length?rows.reduce((s:number,c:any)=>s+c.amount,0):null,signed=Number(entry.service.precioMensual??0);
      return {title:entry.service.servicio||entry.service.ubicacion,site:entry.service.ubicacion,contractedCost:signed,actualCost:actual==null?null:money(actual),difference:actual==null?null:money(actual-signed),sources:rows.map((c:any)=>({source:c.source,sourceId:c.sourceId,description:c.description,amount:c.amount})),note:actual==null?'Sin coste documental único para esta sede y mes.':'Coste enlazado por sede literal única en la línea de factura.'};
    });
    const actual=parts.length&&parts.every((v:any)=>v.actualCost!=null)?parts.reduce((s:number,v:any)=>s+v.actualCost,0):null;
    return {id:p.id,title:p.titulo,provider:p.proveedor,contractedCost:Number(p.importeMensual||0),actualCost:actual==null?null:money(actual),difference:actual==null?null:money(actual-Number(p.importeMensual||0)),services:parts,note:actual==null?'Falta una o más sedes o la factura del contrato de proveedor. No se usa la cuota firmada como real.':'Todas las sedes de este contrato tienen coste documental de este mes.'};
  });
}
/** Economic identity does not depend on materialising the derived queue or import/run timestamps. */
export function economicSourceHash(input:any,extra:any):string {
  const volatile=new Set(['version','sourceHash','createdAt','updatedAt','created_at','updated_at','importedAt','lastSeenAt','generatedAt','_id']);
  const clean=(value:any):any=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>!volatile.has(k)&&value[k]!==undefined).map(k=>[k,clean(value[k])])):value;
  const effective=(input.decisions||[]).filter((d:any)=>d.action || d.estado==='RESUELTA');
  return hash(clean({contracts:input.contracts||[],lines:input.lines||[],costs:input.costs||[],rules:input.rules||[],decisions:effective,invoices:extra.invoices||[],ggcc:extra.ggcc||[],series:extra.series||[]}));
}
/** Immutable, prepared projections. Reference invoice-date totals never feed actual service-period costs. */
export function calculateReport(input:any,month:string,mode='real',extra:any={}):any {
  if (!MONTH.test(month)) throw new Error('Mes inválido');
  const rules=(input.rules||[]).map(ruleDTO),lines=(input.lines||[]).map(lineDTO),contracts=(input.contracts||[]).map(contractDTO);
  const coverageRules=[...new Map([...INITIAL_COST_RULES.map(ruleDTO),...rules].map(r=>[r.key||r.ruleKey||hash(r),r])).values()];
  const byCode=new Map<string,any>(contracts.map((c:any)=>[c.contractCode,c])),lineMap=new Map<string,any[]>();
  for(const l of lines){const bucket=lineMap.get(l.contractCode)||[];bucket.push(l);lineMap.set(l.contractCode,bucket);if(!byCode.has(l.contractCode)){const c={contractCode:l.contractCode,clientCode:l.clientCode,clientName:l.clientName,tariff:l.tariff,provider:null,active:true,source:'ISP_LISTADO299_SIN_LORENA',unknownDates:true};contracts.push(c);byCode.set(c.contractCode,c);}}
  for(const c of contracts){
    const cl=classifyContract(c,rules);c.product=cl.product;c.provider=cl.provider;c.classification=cl.origin;c.pendingProvider=cl.pending;
    const ls=(lineMap.get(c.contractCode)||[]).sort((a,b)=>a.date.localeCompare(b.date));c.lastLine=ls.at(-1)||null;c.clientCode ||= c.lastLine?.clientCode || c.clientName;
    if(c.clientName==='Cliente sin identificar')c.clientName=c.lastLine?.clientName||c.clientName;
    const numericKnown=(v:any)=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v));
    c.signedPriceKnown=numericKnown(c.price);
    c.monthlyContracted=numericKnown(c.contractedMonthlyAmount)?Number(c.contractedMonthlyAmount):c.signedPriceKnown&&c.periodicityMonths?(Number(c.price)+Number(c.discount||0))/c.periodicityMonths:null;
    // Billed frequency is allowed for a labelled forecast, not for signed income evidence.
    c.periodicityMonths ||= c.lastLine?.periodicityMonths;
    c.monthlyForecast=c.monthlyContracted ?? (c.lastLine&&c.periodicityMonths?c.lastLine.baseAmount/c.periodicityMonths:null);
    c.ggccId=c.contratoDraxtonId||null;
    const linked=(extra.ggcc||[]).filter((g:any)=>g.codigoContrato&&normalize(c.description).includes(normalize(g.codigoContrato)));
    if(linked.length===1)c.ggccId=linked[0].id;
    if(c.contractCode==='5057'&&/transit|transito/.test(normalize(`${c.tariff} ${c.description}`))){c.speedMbps=1000;c.speedBasis='Encargo 4: tránsito STE 1Gb = 1.000Mb';}
  }
  const bill=imputeInvoices(extra.invoices||[],rules),initialCosts=(input.costs||[]).map(costDTO);
  const external=initialCosts.filter((c:any)=>c.payer!=='IO'&&c.status!=='REFERENCIA'),explicitCosts=initialCosts.filter((c:any)=>c.payer==='IO'&&c.source!=='COSTES_XLSX_INITIAL'&&c.status!=='REFERENCIA');
  const costs=[...bill.costs,...external,...explicitCosts],invoiceMap=new Map<string,any>((extra.invoices||[]).map((i:any)=>[String(i.id),i]));
  const coverageIdentities=new WeakMap<object,any>();
  const alerts:any[]=[];
  const billIssues=bill.alerts.map((a:any)=>{const id=String(a.sourceId||String(a.key).split(':')[1]||''),invoice=invoiceMap.get(id),rule=invoice?invoiceRule(invoice,rules):null;return {...a,ruleKey:rule?.key,suggestedProduct:canonicalProduct(rule?.product||rule?.productoId||invoice?.provider||invoice?.proveedor),product:a.product||canonicalProduct(rule?.product||rule?.productoId||invoice?.provider||invoice?.proveedor),invoiceMonth:String(invoice?.date||invoice?.fecha||'').slice(0,7),annual:rule?.period==='YEAR'||a.type==='PERIODO_ANUAL_PENDIENTE'};});
  alerts.push(...billIssues);
  const months=Array.from({length:12},(_,i)=>`${month.slice(0,4)}-${String(i+1).padStart(2,'0')}`);
  const monthResults=months.map(m=>{
    const rows=contracts.filter((c:any)=>activeInMonth(c,m)||(lineMap.get(c.contractCode)||[]).some((l:any)=>l.month===m)||c.ggccId).map((c:any)=>({contractCode:c.contractCode,clientCode:c.clientCode,clientName:c.clientName,product:c.product,provider:c.provider,tariff:c.tariff,description:c.description,directSite:c.directSite||c.sede||null,site:c.site||c.ubicacion||null,operatorLineId:c.operatorLineId||c.identificadorLinea||null,clientCif:c.cif||c.clienteCif||null,speedMbps:c.speedMbps||0,active:activeInMonth(c,m),income:0,contractedIncome:activeInMonth(c,m)?c.monthlyContracted:0,contractedIncomePending:activeInMonth(c,m)&&c.monthlyContracted==null,forecastIncome:activeInMonth(c,m)?c.monthlyForecast:0,contractedCost:null as number|null,contractedCostPending:true,cost:0,estimatedCost:0,costSources:[] as any[],hasCost:false,pendingCost:false,origin:c.source,ggccId:c.ggccId,pendingProvider:c.pendingProvider,datesPending:!c.startDate,personalCost:0}));
    const map=new Map<string,any>(rows.map((r:any)=>[r.contractCode,r]));
    for(const l of lines)if(l.month===m){const r=map.get(l.contractCode);if(r)r.income+=l.baseAmount;}
    const products:any[]=PRODUCT_LABELS.map(product=>({product,contracts:0,income:0,contractedIncome:0,contractedIncomePending:false,forecastIncome:0,contractedCost:null as number|null,contractedCostPending:true,cost:0,estimatedCost:0,unallocatedCost:0,unallocatedEstimatedCost:0,commission:0,pending:false,sources:[] as any[]}));
    const pm=new Map<string,any>(products.map(p=>[p.product,p]));
    for(const r of rows){const p=pm.get(r.product)!;p.contracts++;p.income+=r.income;p.contractedIncomePending ||= r.contractedIncomePending;p.contractedIncome=p.contractedIncomePending?null:p.contractedIncome+r.contractedIncome;p.forecastIncome+=r.forecastIncome||0;}
    const relevant=costs.filter((c:any)=>c.month===m&&costActive(c,m));
    const coverage=new Map(products.map(p=>[p.product,supplierCoverage(p.product,m,costs,coverageRules,invoiceMap,p.contracts>0,coverageIdentities)]));
    const inferred=[...coverage.values()].flatMap(v=>v.estimates);
    for(const cost of [...relevant,...inferred]){
      const p=pm.get(cost.product);if(!p)continue;
      const estimated=cost.status!=='REAL',field=estimated?'estimatedCost':'cost';p[field]+=cost.amount;p.sources.push({source:cost.source,sourceId:cost.sourceId,sourceDate:cost.sourceDate,description:cost.description,periodBasis:cost.periodBasis,historicalMonth:cost.historicalMonth,amount:cost.amount,provider:cost.provider,status:cost.status,payer:cost.payer,sourceCell:cost.sourceCell});
      let candidates=rows.filter((r:any)=>r.product===cost.product);
      const direct=cost.allocation==='DIRECT'||cost.allocation==='DIRECTA'||cost.directClient||cost.directContract||cost.directLineId||cost.lineId||cost.clientIdentity||cost.directSite||cost.site||cost.product==='Draxton telecomunicaciones';
      if(direct)candidates=directCandidates(cost,rows);
      const allocation=allocate(cost.amount,candidates.map((r:any)=>({key:r.contractCode,weight:direct?1:cost.product==='Red propia'?Number(r.speedMbps):Math.max(0,r.income||r.contractedIncome||0)})));
      if(!allocation.length&&(cost.amount||direct&&!cost.commonCost)){if(cost.commonCost)p[estimated?'commonEstimatedCost':'commonCost']=(p[estimated?'commonEstimatedCost':'commonCost']||0)+cost.amount;else {p[estimated?'unallocatedEstimatedCost':'unallocatedCost']+=cost.amount;p.pending=true;if(m===month)alerts.push({key:`asignacion:${m}:${cost.source}`,type:'SEDE_CONTRATO_PENDIENTE',title:`${cost.provider}: no hay un único contrato o sede acreditado para ${cost.description||cost.directClient||'la línea'}`,product:cost.product,sourceId:cost.sourceId,amount:cost.amount});}}
      for(const a of allocation){const r=map.get(a.key)!;r[field]+=a.amount;r.hasCost=true;r.costSources.push({source:cost.source,sourceId:cost.sourceId,description:cost.description,amount:a.amount,status:cost.status,method:direct?'directo documental único':cost.product==='Red propia'?'Mb contratados':'peso en ingreso del producto',provider:cost.provider,payer:cost.payer});}
    }
    for(const g of extra.ggcc||[]){
      const payroll=payrollCost(g,m),linked=rows.filter((r:any)=>r.ggccId===g.id&&r.product==='Servicios IT');
      if(!linked.length)continue;
      const p=pm.get('Servicios IT')!;p.cost+=payroll.cost;p.pending ||= payroll.pending;
      const allocation=allocate(payroll.cost,linked.map((r:any)=>({key:r.contractCode,weight:Math.max(0,r.income||r.contractedIncome||1)})));
      for(const a of allocation){const r=map.get(a.key)!;r.personalCost=a.amount;r.cost+=a.amount;r.hasCost=true;r.personalPending=payroll.pending;r.costSources.push({source:`GGCC:${g.id}:nomina:${m}`,amount:a.amount,status:payroll.pending?'PENDIENTE':'REAL',method:'personal asignado, coste empresa menos desplazamientos',assignmentIds:payroll.rows.map((p:any)=>p.assignmentId)});}
      for(const r of linked){r.personalPending=payroll.pending;const suppliers=supplierContracts(g,m);if(linked.length===1&&suppliers.length){r.contractedCost=suppliers.reduce((s:number,v:any)=>s+Number(v.importeMensual||0),0);r.contractedCostPending=false;}}
      if(payroll.pending&&m===month)alerts.push({key:`personal:${m}:${g.id}`,type:'NOMINA_PENDIENTE',title:`${g.titulo}: falta nómina del mes, coste empresa válido o asignación de personal`,ggccId:g.id,product:'Servicios IT'});
    }
    // Primary issued invoice series are the canonical autofactura source. The received mirror is never added over them or over CSV.
    const csvIncome=new Map(products.map(p=>[p.product,p.income])),seriesProducts=new Set<string>();
    for(const series of (extra.series||[]).filter((s:any)=>s.month===m)){
      const product=/^AF\//i.test(series.serie)?'Comisiones Aire':/^F26/i.test(series.serie)?'Comisiones Xfera':series.serie==='HTSP'?'Hotspot':series.serie==='ZOOM'?'Zoom':null;
      if(!product)continue;const p=pm.get(product)!;seriesProducts.add(product);
      if(csvIncome.get(product)){p.pending=true;if(m===month)alerts.push({key:`serie-solapada:${m}:${series.serie}`,type:'SERIE_REVISAR_SOLAPAMIENTO',title:`${series.serie}: ingreso por contrato y serie; segunda fuente excluida hasta acreditar identidad`,product});continue;}
      p.income+=Number(series.amount);if(product.startsWith('Comisiones'))p.commission+=Number(series.amount);
      p.sources.push({source:'ISP_FACTURAS_SERIE',serie:series.serie,amount:Number(series.amount),status:'REAL',rows:Number(series.rows)});
    }
    for(const commission of bill.commissions.filter(c=>c.month===m)){
      const p=pm.get(commission.product)!;
      if(seriesProducts.has(commission.product)||csvIncome.get(commission.product)){if(m===month)alerts.push({key:`autofactura-espejo:${m}:${commission.source}`,type:'AUTOfACTURA_SEGUNDA_FUENTE_EXCLUIDA',title:`${commission.provider}: copia recibida excluida; se usa la serie emitida o CSV, revisar identidad si difiere`,product:commission.product});continue;}
      p.income+=commission.amount;p.commission+=commission.amount;p.sources.push(commission);
    }
    for(const p of products){
      const observed=relevant.filter((c:any)=>c.product===p.product);
      const unresolved=billIssues.some(a=>a.product===p.product&&(a.invoiceMonth===m||a.annual&&a.invoiceMonth&&a.invoiceMonth<=m&&shiftMonth(a.invoiceMonth,11)>=m));
      const linkedRows=rows.filter(r=>r.product===p.product);
      const itMissing=p.product==='Servicios IT'&&linkedRows.some(r=>{const g=(extra.ggcc||[]).find((g:any)=>g.id===r.ggccId);return !g||r.personalPending||supplierContracts(g,m).some((v:any)=>!r.costSources.some((s:any)=>s.status==='REAL'&&normalize(s.provider).includes(normalize(v.proveedor))));});
      p.pending ||= unresolved||itMissing||p.estimatedCost!==0||linkedRows.some(r=>r.pendingProvider);
      const missingProviders=coverage.get(p.product)!.missing;
      p.pending ||= missingProviders.length>0;
      if(m===month)for(const missing of missingProviders)alerts.push({key:`proveedor:${m}:${p.product}:${missing.identity}`,type:'FACTURA_PROVEEDOR_PENDIENTE',title:`${missing.provider} (${missing.payer})${missing.component?` / ${missing.component}`:''}: falta cobertura REAL completa de ${p.product} en ${m}`,product:p.product,provider:missing.provider,payer:missing.payer,component:missing.component});
      if(p.contracts>0&&!noSupplierCost.has(p.product)&&!observed.some((c:any)=>c.status==='REAL')&&!(p.product==='Servicios IT'&&linkedRows.every(r=>r.ggccId&&!r.personalPending)))p.pending=true;
      if(noSupplierCost.has(p.product)){p.contractedCost=0;p.contractedCostPending=false;}
      else {
        const gs=(extra.ggcc||[]).filter((g:any)=>teleco(g)?p.product==='Draxton telecomunicaciones':p.product==='Servicios IT'&&linkedRows.some(r=>r.ggccId===g.id));
        if(gs.length&&gs.every((g:any)=>supplierContracts(g,m).length)&& (p.product==='Draxton telecomunicaciones'||linkedRows.every(r=>!!r.ggccId))){p.contractedCost=gs.reduce((s:number,g:any)=>s+supplierContracts(g,m).reduce((s:number,v:any)=>s+Number(v.importeMensual||0),0),0);p.contractedCostPending=false;}
      }
      p.rawIncome=p.income;p.rawCost=p.cost;p.rawEstimatedCost=p.estimatedCost;p.rawContractedIncome=p.contractedIncome;p.rawForecastIncome=p.forecastIncome;
      p.margin=money(p.income-p.cost);p.forecastMargin=money(p.forecastIncome-p.cost-p.estimatedCost);p.marginPct=p.pending||p.estimatedCost||!p.income?null:money(100*(p.income-p.cost)/p.income);p.status=p.pending?'PENDIENTE':p.estimatedCost?'ESTIMADO':'REAL';
      p.income=money(p.income);p.cost=money(p.cost);p.estimatedCost=money(p.estimatedCost);p.contractedIncome=p.contractedIncome==null?null:money(p.contractedIncome);p.forecastIncome=money(p.forecastIncome);
    }
    for(const r of rows){
      if(noSupplierCost.has(r.product)){r.contractedCost=0;r.contractedCostPending=false;}
      if(pm.get(r.product)?.unallocatedEstimatedCost!==0)r.estimatedCostUnallocated=true;
      r.pendingCost=r.pendingProvider||r.personalPending||(!r.hasCost&&!noSupplierCost.has(r.product))||pm.get(r.product)?.pending;r.pending=r.pendingCost;r.rawIncome=r.income;r.rawCost=r.cost;r.rawEstimatedCost=r.estimatedCost;r.rawContractedIncome=r.contractedIncome;r.margin=money(r.income-r.cost);r.marginPct=r.pendingCost||r.estimatedCost||!r.income?null:money(100*(r.income-r.cost)/r.income);
    }
    const cm=new Map<string,any>();
    for(const r of rows){let c=cm.get(r.clientCode);if(!c){c={clientCode:r.clientCode,clientName:r.clientName,income:0,cost:0,estimatedCost:0,contractedIncome:0,contractedIncomePending:false,contractedCost:0,contractedCostPending:false,pending:false,contracts:[]};cm.set(r.clientCode,c);}c.income+=r.rawIncome;c.cost+=r.rawCost;c.estimatedCost+=r.rawEstimatedCost;c.contractedIncomePending ||= r.contractedIncomePending;c.contractedIncome=c.contractedIncomePending?null:c.contractedIncome+r.contractedIncome;c.contractedCost+=r.contractedCost||0;c.contractedCostPending ||= r.contractedCostPending;c.pending ||= r.pendingCost;c.contracts.push(r);}
    const clients=[...cm.values()];for(const c of clients){c.estimatedCostUnallocated=c.contracts.some((r:any)=>r.estimatedCostUnallocated);c.rawIncome=c.income;c.rawCost=c.cost;c.rawEstimatedCost=c.estimatedCost;c.rawContractedIncome=c.contractedIncome;c.margin=money(c.income-c.cost);c.marginPct=c.pending||c.estimatedCost||!c.income?null:money(100*(c.income-c.cost)/c.income);c.income=money(c.income);c.cost=money(c.cost);c.estimatedCost=money(c.estimatedCost);}
    for(const r of rows){r.income=money(r.income);r.cost=money(r.cost);r.estimatedCost=money(r.estimatedCost);}
    clients.sort((a,b)=>b.income-a.income||a.clientCode.localeCompare(b.clientCode));
    return {month:m,products:products.filter(p=>p.contracts||p.income||p.cost||p.estimatedCost||p.pending),contracts:rows,clients};
  });
  const selected=monthResults.find(m=>m.month===month)!;
  for(const c of contracts){
    if(c.pendingProvider)alerts.push({key:`contract-provider:${c.contractCode}`,type:'CONTRATO_SIN_PROVEEDOR',title:`Contrato ${c.contractCode} de ${c.clientName}: falta proveedor confirmado`,contractCode:c.contractCode,codigoContratoIsp:c.contractCode,tariff:c.tariff,suggestedProduct:c.product});
    if(!c.periodicityMonths)alerts.push({key:`periodicidad:${c.contractCode}`,type:'PERIODICIDAD_PENDIENTE',title:`Contrato ${c.contractCode}: no consta la periodicidad`,contractCode:c.contractCode});
    if(c.active&&c.endDate&&c.endDate<`${month}-01`)alerts.push({key:`estado:${c.contractCode}`,type:'ESTADO_CONTRADICTORIO',title:`Contrato ${c.contractCode}: estado activo y fecha de baja pasada`,contractCode:c.contractCode});
  }
  for(const r of selected.contracts){const c=byCode.get(r.contractCode)!;
    if(r.active&&!r.income)alerts.push({key:`sin-factura:${month}:${r.contractCode}`,type:'CONTRATO_SIN_FACTURA',title:`Contrato ${r.contractCode}: activo sin factura en ${month}`,contractCode:r.contractCode});
    if(c.endDate&&(lineMap.get(c.contractCode)||[]).some((l:any)=>l.month===month&&l.date>c.endDate))alerts.push({key:`baja:${month}:${r.contractCode}`,type:'BAJA_FACTURADA',title:`Contrato ${r.contractCode}: factura posterior a la baja`,contractCode:r.contractCode});
    if(r.contractedIncome!=null&&Math.abs(r.rawIncome-r.contractedIncome)>1)alerts.push({key:`precio:${month}:${r.contractCode}`,type:'DIFERENCIA_PRECIO',title:`Contrato ${r.contractCode}: contratado ${money(r.contractedIncome)} €, facturado ${r.income} €`,contractCode:r.contractCode,amount:money(r.rawIncome-r.contractedIncome)});
  }
  for(const p of selected.products)if(p.pending&&!noSupplierCost.has(p.product))alerts.push({key:`coste:${month}:${p.product}`,type:'FACTURA_PROVEEDOR_PENDIENTE',title:`${p.product}: faltan facturas, nóminas o un reparto documental completo en ${month}`,product:p.product,estimatedAmount:p.estimatedCost});
  for(const c of selected.clients)if(c.margin<0)alerts.push({key:`negativo:${month}:${c.clientCode}`,type:'MARGEN_NEGATIVO',title:`${c.clientName}: margen conocido negativo (${c.margin} €)`,clientCode:c.clientCode,amount:c.margin});
  const comparison=(extra.ggcc||[]).map((g:any)=>{
    const isTeleco=teleco(g),product=isTeleco?'Draxton telecomunicaciones':'Servicios IT',linked=selected.contracts.filter((r:any)=>isTeleco?r.product===product:r.ggccId===g.id),suppliers=supplierContracts(g,month),provider=suppliers.reduce((s:number,p:any)=>s+Number(p.importeMensual||0),0),payroll=payrollCost(g,month),real=selected.products.find(p=>p.product===product);
    const supplierRows=isTeleco?supplierSiteComparison(suppliers,costs.filter(c=>c.month===month&&c.product===product)):suppliers.map((p:any)=>({id:p.id,title:p.titulo,provider:p.proveedor,contractedCost:Number(p.importeMensual||0),actualCost:null,difference:null,services:[]}));
    const attributed=isTeleco?(supplierRows.length&&supplierRows.every((r:any)=>r.actualCost!=null)?money(supplierRows.reduce((s:number,r:any)=>s+r.actualCost,0)):null):linked.length&&!linked.some(r=>r.pendingCost)?money(linked.reduce((s:number,r:any)=>s+r.rawCost-r.personalCost,0)):null;
    return {contractId:g.id,contractCode:g.codigoContrato,title:g.titulo,product,contractedIncome:Number(g.importeMensual||0),actualIncome:money(linked.reduce((s:number,r:any)=>s+r.rawIncome,0)),contractedCost:money(provider),actualContractCost:attributed,actualProductCost:real?.cost??null,difference:attributed==null?null:money(attributed-provider),personalCost:payroll.pending?null:money(payroll.cost),personalPending:!isTeleco&&payroll.pending,pending:isTeleco?real?.pending??true:!linked.length||payroll.pending,supplierContracts:supplierRows,note:isTeleco?'Firmado: ficha GGCC actual. FTTO ya 258,83 €; 243,83 € solo consta como nota histórica del Excel. No se sobrescribe ni se atribuye un agregado a una sede.':'Enlace por código de orden contractual, no por importe. Nómina real del mes sin desplazamientos; ausencia o coste empresa nulo siguen pendientes.'};
  });
  for(const cost of external.filter((c:any)=>c.month===month&&c.status==='ESTIMADO'&&c.key))alerts.push({key:`external-cost:${cost.key}`,type:'COSTE_EXTERNO_POR_CONFIRMAR',title:`${cost.provider}: ${money(cost.amount)} € de ${cost.payer} en ${month}, propuesta por confirmar`,costKey:cost.key,provider:cost.provider,product:cost.product,amount:cost.amount});
  const decisions=input.decisions||[],open=alerts.filter(a=>!decisions.some((d:any)=>d.exceptionKey===a.key&&d.estado==='RESUELTA'));
  const lorenaRows=(input.contracts||[]).filter((c:any)=>String(c.source||'').includes('LORENA')||String(c.sourceLocator?.file||'').includes('Lorena'));
  const known=new Set(lorenaRows.map((c:any)=>String(c.contractCode??c.codigoContratoIsp??''))),unknown=[...new Set(lines.filter((l:any)=>!known.has(l.contractCode)).map((l:any)=>l.contractCode))];
  const referenceMap=new Map<string,any>();
  for(const [index,r] of (input.references||[]).entries()){
    const l=r.sourceLocator,identity=l?.file&&l?.sheet&&l?.cell?JSON.stringify([r.kind,l.file,l.sheet,l.cell]):`unlocated:${index}`,previous=referenceMap.get(identity);
    if(!previous||String(r.observedAt||r.createdAt||r.created_at||'')>=String(previous.observedAt||previous.createdAt||previous.created_at||''))referenceMap.set(identity,r);
  }
  const references=[...referenceMap.values()],recurrent=references.filter((r:any)=>r.kind==='recurrent_product');
  const referenceSummary={...totals(recurrent.map((r:any)=>({income:Number(r.income),cost:Number(r.cost),estimatedCost:0,pending:false}))),status:'REFERENCIA_RECALCULADA',notice:'Foto aprobada de Excel, no realidad del mes. Incluye agregados de series, estimaciones y siete bajas Draxton; no reactiva contratos.'};
  const december=monthResults.at(-1)!,rawForecastIncome=december.products.reduce((s,p)=>s+(p.rawForecastIncome||0),0),rawForecastCost=december.products.reduce((s,p)=>s+p.rawCost+p.rawEstimatedCost,0),forecastIncome=money(rawForecastIncome),forecastCost=money(rawForecastCost),sourceHash=economicSourceHash(input,extra);
  const forecastPending=december.products.some(p=>p.pending),forecastSummary={income:forecastIncome,cost:forecastCost,margin:money(rawForecastIncome-rawForecastCost),marginPct:forecastPending||!rawForecastIncome?null:money(100*(rawForecastIncome-rawForecastCost)/rawForecastIncome),pending:forecastPending,status:'ESTIMADO'};
  const report={period:month,mode:'real',generatedAt:new Date().toISOString(),summary:{month:totals(selected.products),ytd:totals(monthResults.filter(m=>m.month<=month).flatMap(m=>m.products)),december:forecastSummary,notice:'Margen conocido, provisional si faltan facturas, nóminas o repartos. Las estimaciones no son coste real.'},products:selected.products,monthly:monthResults.map(m=>({month:m.month,products:m.products})),clients:selected.clients,contracts:selected.contracts,comparison,alerts:open,rules:input.rules||[],productCatalog:input.products||[],externalCosts:external,runs:[],snapshots:[],controls:{lines:lines.length,billedContracts:new Set(lines.map((l:any)=>l.contractCode)).size,lorenaContracts:lorenaRows.length,activeLorena:lorenaRows.filter((c:any)=>c.active===true).length,inactiveLorena:lorenaRows.filter((c:any)=>c.active===false).length,unknownBilledContracts:unknown.length,unknownRecentContracts:new Set(lines.filter((l:any)=>unknown.includes(l.contractCode)&&['2026-09','2026-10'].includes(l.month)).map((l:any)=>l.contractCode)).size,dateMin:lines.map((l:any)=>l.date).sort()[0],dateMax:lines.map((l:any)=>l.date).sort().at(-1),sourceHash},references,referenceSummary,initialCostByInvoiceMonth:initialCosts.filter((c:any)=>c.source==='COSTES_XLSX_INITIAL'),notices:['La referencia Excel y los costes iniciales por fecha de factura se muestran separados de la realidad por mes de servicio.','Las comisiones usan una fuente canónica: serie emitida, CSV o recibida de respaldo, nunca dos fuentes del mismo producto y mes.','Vola/Sotic son costes exclusivamente analíticos; ESTIMADO nunca es REAL.','La disponibilidad ISP se muestra en Estado; cabeceras de facturas no sustituyen líneas por contrato ni acreditan cobertura de servicio.','Vercel Cron no se ejecuta en previews; la programación externa de staging se acredita en Estado y conserva los fallos de fuente.','Las altas ausentes y los periodos anuales sin cobertura documental limitan la certeza; no se inventan.']};
  return applyReportMode(JSON.parse(JSON.stringify(report)),mode);
}
export function applyReportMode(report:any,mode='real'):any {
  if(mode!=='contratado')return {...report,mode:'real'};
  const map=(r:any)=>{const signed=r.contractedIncomePending?null:r.rawContractedIncome!==undefined?r.rawContractedIncome:r.contractedIncome,known=r.contractedCostPending===false&&r.contractedCost!=null,personalMissing=r.product==='Servicios IT'&&r.contractedPersonalCost==null,pending=!known||signed==null||personalMissing;return {...r,actualIncome:r.income,actualCost:r.cost,actualEstimatedCost:r.estimatedCost,actualPending:r.pending||r.pendingCost||r.estimatedCost!==0,rawIncome:signed==null?null:Number(signed),rawCost:known?Number(r.contractedCost):null,estimatedCost:0,rawEstimatedCost:0,income:signed==null?null:money(signed),incomePending:signed==null,cost:known?money(r.contractedCost):null,margin:pending?null:money(Number(signed)-Number(r.contractedCost)),marginPct:pending||!signed?null:money(100*(signed-r.contractedCost)/signed),pending,pendingCost:pending,contractedBasis:true,status:pending?'PENDIENTE':'CONTRATADO'};};
  const products=(report.products||[]).map(map),monthly=(report.monthly||[]).map((m:any)=>({...m,products:m.products.map(map)}));
  const contracts=(report.contracts||[]).map(map),contractMap=new Map<string,any>(contracts.map((r:any)=>[r.contractCode,r]));
  const clients=(report.clients||[]).map((c:any)=>{
    const children=(c.contracts||[]).map((r:any)=>contractMap.get(r.contractCode)||map(r)),aggregate=totals(children);
    return {...c,...aggregate,actualIncome:c.income,actualCost:c.cost,actualEstimatedCost:c.estimatedCost,actualPending:c.pending||c.estimatedCost!==0,contracts:children,pendingCost:aggregate.pending,contractedBasis:true,status:aggregate.pending?'PENDIENTE':'CONTRATADO'};
  });
  const decemberProducts=monthly.at(-1)?.products||[];
  return {...report,mode:'contratado',products,monthly,clients,contracts,summary:report.summary?{...report.summary,month:totals(products),ytd:totals(monthly.filter((m:any)=>m.month<=report.period).flatMap((m:any)=>m.products)),december:{...totals(decemberProducts),status:decemberProducts.some((p:any)=>p.pending)?'PENDIENTE':'CONTRATADO'},notice:'Ingreso contratado de contratos activos según fechas disponibles y coste firmado de proveedor solo donde existe contrato acreditado. Personal contratado no acreditado, coste desconocido e ingreso desconocido mantienen el margen pendiente; el real se conserva exclusivamente para contraste.'}:null};
}
async function operationalSources(month:string) {
  const invoices:any[]=[],year=Number(month.slice(0,4)),lookback=new Date(`${year-1}-01-01`),startYear=new Date(`${year}-01-01`);
  // Twelve-month lookback includes annual invoices from the previous year overlapping this exercise.
  for(let offset=0;;offset+=500){const page=await prisma.$queryRaw<any[]>(Prisma.sql`SELECT fr.id,fr.proveedor,fr.cif,fr.num_factura AS "numFactura",fr.fecha::text AS fecha,fr.base,fr.concepto,fr.lineas_detalle AS "lineasDetalle",fr.datos_ocr_raw AS "datosOcrRaw" FROM facturas_recibidas fr WHERE ${facturaEconomicaSQL('fr')} AND fr.estado::text<>'RECHAZADA' AND fr.conflicto_identidad=false AND fr.fecha>=${lookback} ORDER BY fr.fecha,fr.id LIMIT 500 OFFSET ${offset}`);invoices.push(...page);if(page.length<500)break;}
  const ggcc=await prisma.contratoDraxton.findMany({take:500,select:{
    id:true,codigoContrato:true,titulo:true,tipo:true,estado:true,importeMensual:true,
    fechaInicioServicio:true,fechaInicio:true,fechaFin:true,serviciosJson:true,
    contratosProveedor:{select:{id:true,titulo:true,proveedor:true,cifProveedor:true,importeMensual:true,estado:true,fechaInicioServicio:true,fechaInicio:true,fechaFin:true,serviciosJson:true}},
    personalAsignado:{select:{id:true,empleadoId:true,porcentajeDedicacion:true,activo:true,fechaInicio:true,fechaFin:true,
      empleado:{select:{id:true,nominas:{take:36,orderBy:[{anio:'desc'},{mes:'desc'}],select:{mes:true,anio:true,costeTotalEmpresa:true,gastosDesplazamiento:true}}}}
    }}
  }});
  const series=await prisma.$queryRaw<any[]>(Prisma.sql`SELECT to_char(fecha,'YYYY-MM') AS month,serie_factura AS serie,sum(base)::text AS amount,count(*)::int AS rows FROM facturas WHERE fecha>=${startYear} AND (serie_factura LIKE 'AF/%' OR serie_factura LIKE 'F26%' OR serie_factura IN ('HTSP','ZOOM')) GROUP BY to_char(fecha,'YYYY-MM'),serie_factura ORDER BY month,serie LIMIT 1000`);
  return {invoices:JSON.parse(JSON.stringify(invoices)),ggcc:JSON.parse(JSON.stringify(ggcc)),series};
}
export async function rebuildRentabilidadReport(month:string,actorId:number,kind='PROYECCION') {
  month=checkedMonth(month);const input=await readInputs(),extra=await operationalSources(month),report=calculateReport(input,month,'real',extra);
  const { ensureExceptions }=await import('./store');await ensureExceptions(report.alerts,actorId);
  const snapshot=await saveSnapshot(month,report,actorId,kind);await appendRun({actorId,process:kind==='CIERRE'?'MONTHLY_CLOSE':'RECALCULATE',estado:report.summary.month.pending||report.summary.month.estimatedCost?'PROVISIONAL':'COMPLETADO',month,snapshotId:snapshot.id,version:snapshot.version,idempotent:snapshot.idempotente,sourceHash:report.controls.sourceHash});return {...report,snapshot};
}
export async function getRentabilidadReport(month?:string,mode='real'):Promise<any> {
  const period=checkedMonth(month);
  const [snapshots,runs,ruleHistory,externalCostHistory,resolved]=await Promise.all([listSnapshots(period),listRecentRuns(50),getRuleHistory(undefined,100),getExternalCostHistory(undefined,100),listResolvedExceptions(100)]);
  const latest=snapshots.find((s:any)=>s.kind==='PROYECCION')||snapshots[0];
  const flatten=(rows:any[])=>rows.map(r=>({...r.payload,key:r.key,version:r.version,kind:r.kind,actorId:r.actorId,createdAt:r.createdAt,sourceHash:r.sourceHash}));
  const live={runs:runs.map(r=>({...r.payload,id:r.id,process:r.process,sourceHash:r.sourceHash,createdAt:r.createdAt})).reverse(),syncStatus:rentabilidadAutomationStatus(runs),ruleHistory:flatten(ruleHistory),externalCostHistory:flatten(externalCostHistory),resolvedExceptions:flatten(resolved),snapshots:snapshots.map((s:any)=>({id:s.id,month:s.month,version:s.version,kind:s.kind,createdAt:s.createdAt,sourceHash:s.sourceHash}))};
  if(!latest)return {period,mode,summary:null,products:[],monthly:[],clients:[],contracts:[],comparison:[],alerts:[],rules:[],externalCosts:[],controls:{},references:[],notices:['Aún no hay una proyección preparada para este mes. Recalcular solo para el superadmin.'],...live};
  return compactReportPresentation(applyReportMode({...latest.payload,period,...live},mode));
}
