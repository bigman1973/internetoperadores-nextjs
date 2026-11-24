import { createHash } from 'node:crypto';

export function normalize(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Monetary ties round away from zero, including credit notes. */
export function money(value: unknown): number {
  const n = Number(value); if (!Number.isFinite(n)) return 0;
  const scaled = Math.abs(n) * 100;
  const rounded = Math.round(scaled + Number.EPSILON * Math.max(1, scaled)) / 100;
  return rounded === 0 ? 0 : Math.sign(n) * rounded;
}
export function cents(value: unknown): number { return Math.round(money(value) * 100); }
export function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export const PRODUCT_LABELS = ['Red propia', 'Telefónica', 'Draxton telecomunicaciones', 'Aire Networks', 'Comisiones Aire', 'Cablemóvil/Xfera', 'Comisiones Xfera', 'Hotspot', 'Wildix', 'Wildix Borges', 'Google Workspace', 'Cloud 101', 'Acens', 'Starlink', 'Adamo', 'Dacast', 'Dominios', 'Zoom', 'Sheetgo', 'Servicios IO sin coste de proveedor', 'Servicios IT', 'Otros'];

export function canonicalProduct(value: unknown): string {
  const n = normalize(value);
  const ids:Record<string,string>={red_propia:'Red propia',telefonica:'Telefónica',draxton_teleco:'Draxton telecomunicaciones',aire:'Aire Networks',comisiones_aire:'Comisiones Aire',xfera:'Cablemóvil/Xfera',comisiones_xfera:'Comisiones Xfera',hotspot:'Hotspot',wildix:'Wildix',google_workspace:'Google Workspace',cloud_101:'Cloud 101',acens:'Acens',starlink:'Starlink',adamo:'Adamo',dacast:'Dacast',dominios:'Dominios',zoom:'Zoom',sheetgo:'Sheetgo',io_sin_coste:'Servicios IO sin coste de proveedor',servicios_it:'Servicios IT',otros:'Otros'};
  if(ids[String(value).toLowerCase()])return ids[String(value).toLowerCase()];
  const exact = PRODUCT_LABELS.find(p => normalize(p) === n); if (exact) return exact;
  if (/comision.*aire|aire.*comision/.test(n)) return 'Comisiones Aire';
  if (/comision.*xfera|xfera.*comision|comision.*cable/.test(n)) return 'Comisiones Xfera';
  if (/draxton/.test(n)) return 'Draxton telecomunicaciones';
  if (/borges/.test(n) && /wildix/.test(n)) return 'Wildix Borges';
  if (/red propia|cogent|templus|xoc|ripe|de cix|volibri|perdiu/.test(n)) return 'Red propia';
  if (/acens|microsoft|panda|telefonica soluciones/.test(n)) return 'Acens';
  if (/telefonica|movistar/.test(n)) return 'Telefónica';
  if (/aire|canario/.test(n)) return 'Aire Networks';
  if (/hotspot|htsp/.test(n)) return 'Hotspot';
  if (/xfera|cablemovil|masorange|lifetel/.test(n)) return 'Cablemóvil/Xfera';
  if (/wildix/.test(n)) return 'Wildix';
  if (/workspace|google/.test(n)) return 'Google Workspace';
  if (/cloud 101/.test(n)) return 'Cloud 101';
  if (/nominalia|dominio/.test(n)) return 'Dominios';
  if (/west telco|zoom/.test(n)) return 'Zoom';
  if (/servicios it|personal|mantenimiento informatico/.test(n)) return 'Servicios IT';
  for (const p of ['Starlink','Adamo','Dacast','Sheetgo']) if (n.includes(normalize(p))) return p;
  if (/servicios io|io sin coste/.test(n)) return 'Servicios IO sin coste de proveedor';
  return 'Otros';
}
export type IncomeNature = 'RECURRENTE' | 'SERVICIOS_IT' | 'INSTALACION_PUNTUAL';
export const INCOME_NATURES: readonly IncomeNature[] = ['RECURRENTE', 'SERVICIOS_IT', 'INSTALACION_PUNTUAL'];
/**
 * Naturaleza del ingreso de una línea facturada, solo a partir de su concepto y tarifa (lo facturado es la realidad).
 * - INSTALACION_PUNTUAL: cuotas únicas, compras de equipo, altas, instalaciones, migraciones y cargos puntuales. Solo cuenta si
 *   el concepto EMPIEZA así: «PUESTA EN MARCHA» dentro de una cuota mensual (p. ej. IO BACKUP) sigue siendo recurrente.
 * - SERVICIOS_IT: externalización IT, bolsas de horas y mantenimiento informático.
 * - RECURRENTE: todo lo demás (cuotas mensuales de servicio).
 */
export function classifyIncomeLine(concept: unknown, tariff?: unknown, product?: unknown): IncomeNature {
  const c = normalize(concept), t = normalize(tariff);
  if (/\bcuota unica\b|\bunico pago\b|\bpago unico\b|\balta unica\b/.test(c)) return 'INSTALACION_PUNTUAL';
  if (/^(puesta en marcha|instalacion|alta |cargo por|migracion|desplazamiento|configuracion inicial|setup)/.test(c)) return 'INSTALACION_PUNTUAL';
  if (/servicios? de externalizacion it|servicio de horas mensuales|recurso it|bolsa horas|mantenimiento informatico/.test(`${c} ${t}`)) return 'SERVICIOS_IT';
  if (product === 'Servicios IT') return 'SERVICIOS_IT';
  return 'RECURRENTE';
}
export function periodicity(value: unknown): number | null {
  if ([1,3,6,12].includes(Number(value))) return Number(value);
  const n = normalize(value); if (/mensual|^mes$/.test(n)) return 1; if (/trimes/.test(n)) return 3; if (/semes/.test(n)) return 6; if (/anual|ano/.test(n)) return 12;
  return null;
}
export function activeInMonth(contract: any, month: string) {
  const start = String(contract.startDate || contract.fechaAlta || '').slice(0,10);
  const end = String(contract.endDate || contract.fechaBaja || '').slice(0,10);
  const last = new Date(Date.UTC(Number(month.slice(0,4)), Number(month.slice(5,7)), 0)).toISOString().slice(0,10);
  return (!start || start <= last) && (!end || end >= `${month}-01`) && (contract.active !== false || !!end);
}
export function shiftMonth(month: string, shift: number): string {
  const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth()+shift); return d.toISOString().slice(0,7);
}
export function classifyContract(contract: any, rules: any[] = []): { provider: string | null; product: string; origin: string; pending: boolean } {
  const tariff = String(contract.tariff || contract.tarifa || ''); const name = normalize(`${contract.clientName || ''} ${contract.description || ''} ${tariff}`);
  if (/mantenimiento informatico|servicio.*externalizacion|servicios it/.test(normalize(tariff))) return {provider:contract.provider||'IO',product:'Servicios IT',origin:'tipología IT del contrato',pending:false};
  if (name.includes('draxton') && /conexion internet draxton/.test(normalize(tariff))) return {provider:contract.provider||null,product:'Draxton telecomunicaciones',origin:'contrato Draxton de telecomunicaciones',pending:!contract.provider};
  if (normalize(contract.provider)==='io') {
    if (contract.product) { const product=canonicalProduct(contract.product); return {provider:contract.provider,product,origin:contract.source||'producto propio acreditado en carga inicial',pending:product==='Otros'}; }
    if (/volibri|perdiu|radio|transito|transit/.test(normalize(tariff))) return {provider:contract.provider,product:'Red propia',origin:'tipología acreditada de red propia',pending:false};
    return {provider:contract.provider,product:'Otros',origin:'servicio propio sin producto acreditado; no se presume coste cero',pending:true};
  }
  if (contract.product) return { provider: contract.provider || null, product: canonicalProduct(contract.product), origin: contract.source || 'metadato', pending: false };
  if (contract.provider && normalize(contract.provider) !== 'otros' && normalize(contract.provider) !== 'sin proveedor') {
    let product = canonicalProduct(contract.provider);
    if (name.includes('draxton') && product === 'Telefónica') product = 'Draxton telecomunicaciones';
    if (/htsp|hotspot/.test(normalize(tariff))) product = 'Hotspot';
    if (product === 'Wildix' && name.includes('borges')) product = 'Wildix Borges';
    return { provider: contract.provider, product, origin: 'proveedor del contrato', pending: product === 'Otros' };
  }
  const candidates = rules.filter(r => r.active !== false && (r.kind === 'TARIFA' || r.type === 'tariff' || r.type === 'tariffRule' || r.tipo === 'TARIFA')).filter(r => {
    const pattern = String(r.pattern || r.patron || ''); const mode = r.match || r.matchType || 'contains';
    if (!pattern) return false;
    return (mode === 'startsWith' || mode === 'PREFIX') ? normalize(tariff).startsWith(normalize(pattern)) : (mode === 'exact' || mode === 'EXACT') ? normalize(tariff) === normalize(pattern) : normalize(tariff).includes(normalize(pattern));
  }).sort((a,b) => Number(b.priority || 0)-Number(a.priority || 0));
  if (candidates.length) {
    const r = candidates[0]; return { provider: r.provider || r.proveedor || null, product: canonicalProduct(r.product || r.productoId || r.provider || r.proveedor), origin: `regla ${r.ruleKey || r.id || r.pattern}`, pending: false };
  }
  return { provider: null, product: 'Otros', origin: 'pendiente de regla', pending: true };
}
/** Largest remainder apportionment. Credit notes retain their sign. Every cent is conserved. */
export function allocate(total: number, items: Array<{ key: string; weight: number }>): Array<{key:string;amount:number}> {
  const valid = items.filter(i => Number.isFinite(i.weight) && i.weight > 0).sort((a,b)=>a.key.localeCompare(b.key));
  const sum = valid.reduce((s,i)=>s+i.weight,0); if (!sum) return [];
  const amount = cents(total); const sign = amount < 0 ? -1 : 1; const absolute = Math.abs(amount);
  const rows = valid.map(i=>{const exact=absolute*i.weight/sum;return {key:i.key,base:Math.floor(exact),rest:exact-Math.floor(exact)};});
  let left = absolute-rows.reduce((s,i)=>s+i.base,0);
  const ranking=[...rows].sort((a,b)=>b.rest-a.rest||a.key.localeCompare(b.key));
  for(let i=0;i<left;i++)ranking[i%ranking.length].base++;
  return rows.map(r=>({key:r.key,amount:sign*r.base/100}));
}
/** Recognize a complete documented year, with inclusive or exclusive end date. */
function annualDocumentMonths(text: string): string[] | null {
  const matches = [...text.matchAll(/\b([12]\d{3})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[\/-](\d{1,2})[\/-]([12]\d{3})\b/g)];
  const dates = matches.map(m => {
    const year = Number(m[1] || m[6]), month = Number(m[2] || m[5]), day = Number(m[3] || m[4]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  });
  for (let i = 0; i < dates.length - 1; i++) {
    const start = dates[i], end = dates[i + 1]; if (!start || !end) continue;
    const anniversary = new Date(start);
    anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
    // A leap-day anniversary is the last valid day in the following February.
    if (anniversary.getUTCMonth() !== start.getUTCMonth()) anniversary.setUTCDate(0);
    const distance = anniversary.getTime() - end.getTime();
    if (distance !== 0 && distance !== 24 * 60 * 60 * 1000) continue;
    const month = start.toISOString().slice(0, 7);
    return Array.from({length:12}, (_, offset) => shiftMonth(month, offset));
  }
  return null;
}
/** Resolve literal periods; YEAR retains the historical fallback for callers using only months. */
export function serviceMonths(invoiceDate: string, text: string, period: 'MONTH'|'BIMONTH'|'YEAR'): string[] | null {
  const month=invoiceDate.slice(0,7);
  if(period==='MONTH')return [month];
  if(period==='YEAR')return annualDocumentMonths(text) || Array.from({length:12},(_,i)=>shiftMonth(month,i));
  const matches=[...text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}|\d{2}))?\b/g)];
  if(matches.length<2)return null;
  const first=matches[0]; const last=matches[1];
  if([first,last].some(m=>Number(m[2])<1||Number(m[2])>12||Number(m[1])<1||Number(m[1])>31))return null;
  const y=(v:string|undefined)=>v?Number(v.length===2?'20'+v:v):Number(month.slice(0,4));
  let start=`${y(first[3])}-${String(Number(first[2])).padStart(2,'0')}`;
  let end=`${y(last[3])}-${String(Number(last[2])).padStart(2,'0')}`;
  if(start>end&&!first[3])start=`${Number(start.slice(0,4))-1}${start.slice(4)}`;
  if(!first[3]&&!last[3]&&end>month){start=shiftMonth(start,-12);end=shiftMonth(end,-12);}
  for(const [m,match] of [[start,first],[end,last]] as const){const mon=Number(match[2]),day=Number(match[1]);if(mon<1||mon>12||day<1||day>new Date(Date.UTC(Number(m.slice(0,4)),mon,0)).getUTCDate())return null;}
  if(shiftMonth(start,1)!==end)return null;
  return [start,end];
}
/** Invoice month is not evidence of annual service coverage unless an approved rule opts in. */
export function servicePeriod(invoiceDate: string, text: string, period: 'MONTH'|'BIMONTH'|'YEAR', periodAnchor?: string): {months:string[]|null;status:'REAL'|'ESTIMADO';periodBasis:string} {
  if (period === 'YEAR') {
    const documented = annualDocumentMonths(text);
    if (documented) return {months:documented,status:'REAL',periodBasis:'DOCUMENT_PERIOD'};
    return {
      months:serviceMonths(invoiceDate, '', period),
      status:periodAnchor === 'INVOICE_MONTH' ? 'REAL' : 'ESTIMADO',
      periodBasis:periodAnchor === 'INVOICE_MONTH' ? 'RULE_INVOICE_MONTH' : 'INVOICE_MONTH_UNVERIFIED',
    };
  }
  return {months:serviceMonths(invoiceDate,text,period),status:'REAL',periodBasis:period === 'BIMONTH' ? 'DOCUMENT_PERIOD' : 'INVOICE_MONTH'};
}
export function splitPeriod(amount: number, months: string[]): Array<{month:string;amount:number}> {
  return allocate(amount,months.map(month=>({key:month,weight:1}))).map(r=>({month:r.key,amount:r.amount}));
}
export function parseLines(value: unknown): any[] {
  if(Array.isArray(value))return value;
  if(typeof value==='string'){try{const v=JSON.parse(value);return Array.isArray(v)?v:[];}catch{return [];}}
  return [];
}

export function invoiceRule(invoice: any, rules: any[]): any | null {
  const supplier=normalize(invoice.provider || invoice.proveedor); const cif=normalize(invoice.cif); const concept=normalize(`${invoice.number || invoice.numFactura || ''} ${invoice.concept || invoice.concepto || ''}`);
  return rules.filter(r=>r.active!==false&&(r.kind==='COSTE'||r.type==='cost'||r.type==='costRule')).filter(r=>{
    const supplierPattern=normalize(r.provider || r.proveedor || r.proveedorNombre || r.supplier || ''); const cifPattern=normalize(r.cif || r.proveedorCif || ''); const pattern=normalize(r.pattern || r.conceptPattern || '');const numberPattern=normalize(r.invoicePattern || '');
    return ((cifPattern&&cif===cifPattern)||(!cifPattern&&supplierPattern&&supplier.includes(supplierPattern)))&&(!pattern||concept.includes(pattern))&&(!numberPattern||normalize(invoice.number||invoice.numFactura).startsWith(numberPattern));
  }).sort((a,b)=>Number(b.priority||0)-Number(a.priority||0))[0]||null;
}
const noDetailFallbackOf=(direct:boolean,lines:any[],ruleProduct:string)=>direct&&!lines.length&&ruleProduct!=='Draxton telecomunicaciones';
export function imputeInvoices(invoices: any[], rules: any[]): { costs: any[]; alerts: any[]; commissions: any[] } {
  const costs:any[]=[]; const alerts:any[]=[]; const commissions:any[]=[];
  for(const invoice of invoices){
    const number=String(invoice.number || invoice.numFactura || invoice.num_factura || ''); const provider=String(invoice.provider || invoice.proveedor || ''); const date=String(invoice.date || invoice.fecha || '').slice(0,10);
    const base=Number(invoice.base); if(!Number.isFinite(base)||!date)continue;
    if((/^AF/i.test(number)&&canonicalProduct(provider)==='Aire Networks')||(/^F26/i.test(number)&&canonicalProduct(provider)==='Cablemóvil/Xfera')){
      commissions.push({month:date.slice(0,7),product:/^AF/i.test(number)?'Comisiones Aire':'Comisiones Xfera',amount:money(base),provider,source:`factura:${invoice.id}`,status:'REAL'});continue;
    }
    const rule=invoiceRule({...invoice,number,provider,concept:invoice.concepto},rules);
    if(!rule){alerts.push({key:`factura:${invoice.id}`,type:'FACTURA_SIN_REGLA',sourceId:invoice.id,title:`Factura ${number} de ${provider}: pendiente de regla`,provider,amount:money(base),suggestedProduct:canonicalProduct(provider)});continue;}
    if(rule.method==='EXCLUIR'||rule.allocation==='EXCLUDE')continue;
    let ocr:any={};try{ocr=typeof invoice.datosOcrRaw==='string'?JSON.parse(invoice.datosOcrRaw):invoice.datosOcrRaw||{};}catch{}
    const lines=parseLines(invoice.lineasDetalle || invoice.lineas_detalle || invoice.lines).length?parseLines(invoice.lineasDetalle || invoice.lineas_detalle || invoice.lines):parseLines(ocr.lineas);
    const period=({MES:'MONTH',BIMESTRAL_VENCIDO:'BIMONTH',ANUAL:'YEAR'} as any)[rule.period]||rule.period||rule.periodType||'MONTH'; const allocation=({DIRECTA:'DIRECT',INGRESO:'REVENUE',MB:'MB'} as any)[rule.method]||rule.allocation || 'REVENUE';
    const direct=allocation==='DIRECT';
    const ruleProduct=canonicalProduct(rule.product||rule.productoId||provider);
    const detail=(direct&&!noDetailFallbackOf(direct,lines,ruleProduct))||period==='BIMONTH'||period==='YEAR'||ruleProduct==='Acens'||lines.some(l=>/1 year|12 month/.test(normalize(l.descripcion||l.description)));
    let pieces:any[]=detail&&lines.length?lines:[{descripcion:invoice.concepto || invoice.concept || '',importeNeto:base}];
    // Sin líneas, la factura de un proveedor «directo» no se puede repartir por cliente, pero SÍ es coste real del producto:
    // se imputa el total al producto (reparto por ingreso) y la falta de detalle queda como excepción para el superadmin.
    const noDetailFallback=direct&&!lines.length&&ruleProduct!=='Draxton telecomunicaciones';
    if(direct&&!lines.length){alerts.push({key:`detalle:${invoice.id}`,type:'FALTA_DETALLE',sourceId:invoice.id,title:`Factura ${number}: falta el detalle por cliente; el total se imputa al producto sin repartir por cliente`,provider,amount:base,noDetailFallback});if(!noDetailFallback)continue;}
    const lineAmounts=pieces.map(l=>Number(l.importeNeto??l.netAmount??l.importe??l.amount));
    if(lineAmounts.some(x=>!Number.isFinite(x))){alerts.push({key:`importe:${invoice.id}`,type:'DETALLE_NO_CUADRA',title:`Factura ${number}: hay líneas sin importe neto`,provider});continue;}
    const sum=lineAmounts.reduce((s,n)=>s+n,0);
    // A global invoice discount is applied proportionally, never billed twice.
    if(detail&&Math.abs(sum)>0.005&&Math.abs(base-sum)>0.02){
      const sameSign=base*sum>0;
      const documentedDiscount=Number(invoice.globalDiscountAmount??ocr.descuentoGlobalImporte??NaN);
      if(!sameSign||Math.abs(base)>Math.abs(sum)+0.02||!Number.isFinite(documentedDiscount)||Math.abs(Math.abs(sum-base)-Math.abs(documentedDiscount))>0.01){alerts.push({key:`cuadre:${invoice.id}`,type:'DETALLE_NO_CUADRA',title:`Factura ${number}: las líneas no explican la base y no consta un descuento global que cierre`,provider,amount:base});continue;}
      pieces=pieces.map((l,i)=>({...l,importeNeto:base*lineAmounts[i]/sum}));
    }
    let allocated=0;
    pieces.forEach((line,i)=>{
      const amount=i===pieces.length-1?money(base-allocated):money(Number(line.importeNeto??line.netAmount??line.importe??line.amount));allocated=money(allocated+amount);
      const text=String(line.descripcion || line.description || '');
      const annual=normalize(text).includes('12 month')||normalize(text).includes('1 year');const monthly=normalize(text).includes('1 month');
      const linePeriod=ruleProduct==='Acens'&&lines.length?(normalize(text).includes('panda')?'YEAR':'MONTH'):annual?'YEAR':monthly?'MONTH':period;
      const periodText=linePeriod==='YEAR'?`${text} ${invoice.servicePeriod || invoice.periodoServicio || invoice.concepto || invoice.concept || ''}`:text;
      const coverage=servicePeriod(date,periodText,linePeriod,rule.periodAnchor);
      const months=coverage.months;
      if(!months){alerts.push({key:`periodo:${invoice.id}:${i}`,type:'PERIODO_PENDIENTE',title:`Factura ${number}: no se identifica el periodo bimestral`,provider,sourceId:invoice.id});return;}
      const client=line.clienteNombreBd||line.cliente||line.clientName||rule.directClient;
      const directContract=line.directContract||line.contractId||line.codigoContrato||line.contratoCodigo||rule.directContract||null;
      const directSite=line.directSite||line.sede||line.site||line.ubicacion||null;
      const clientIdentity=line.clientIdentity||line.clientId||line.codigoCliente||line.clienteCodigo||line.cifCliente||line.clienteCif||null;
      const lineId=line.lineId||line.lineIdentifier||line.identificadorLinea||line.numeroLinea||line.telefono||line.serviceId||null;
      let product=canonicalProduct(rule.product || rule.productoId || provider);
      if(product==='Wildix'&&normalize(client).includes('borges'))product='Wildix Borges';
      const oneOff=/penalizacion/.test(normalize(`${text} ${invoice.concepto||invoice.concept||''}`))||product==='Starlink'&&/entregas? intracomunitarias? de bienes|\bhardware\b|\bkit\b/.test(normalize(`${text} ${invoice.concepto||invoice.concept||''}`));
      const commonCost=product=='Draxton telecomunicaciones'&&/cex premium|gestion personalizada|circuitos internacionales|cuota periodica bimestral|int190|orbinet/.test(normalize(`${text} ${invoice.concepto||invoice.concept||''}`));
      const revenueFallback=noDetailFallback||direct&&oneOff&&!commonCost&&!client&&!directContract&&!directSite&&!clientIdentity&&!lineId;
      if(direct&&!revenueFallback&&!commonCost&&!client&&!directContract&&!directSite&&!clientIdentity&&!lineId){alerts.push({key:`cliente:${invoice.id}:${i}`,type:'CLIENTE_PENDIENTE',title:`Factura ${number}: una línea no identifica cliente, sede, contrato o línea`,provider,amount});return;}
      if(coverage.status==='ESTIMADO')alerts.push({key:`periodo-anual:${invoice.id}:${i}`,type:'PERIODO_ANUAL_PENDIENTE',title:`Factura ${number}: reparto anual estimado, falta confirmar la cobertura o el anclaje de la regla`,provider,sourceId:invoice.id,amount});
      for(const portion of splitPeriod(amount,months))costs.push({month:portion.month,amount:portion.amount,provider,product,status:coverage.status,periodBasis:coverage.periodBasis,allocation:revenueFallback?'REVENUE':allocation,oneOff:oneOff||undefined,nonRecurrent:oneOff||undefined,directClient:commonCost?null:client||null,directContract:commonCost?null:directContract,directSite:commonCost?null:directSite,clientIdentity:commonCost?null:clientIdentity,lineId,commonCost,description:text,source:`factura:${invoice.id}:linea:${i}`,sourceId:invoice.id,ruleId:rule.ruleKey||rule.id,sourceDate:date,payer:'IO'});
    });
  }
  return {costs,alerts,commissions};
}
