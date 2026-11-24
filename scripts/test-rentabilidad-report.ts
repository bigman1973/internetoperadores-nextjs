import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateReport } from '../lib/rentabilidad/report';
import { serviceMonths, imputeInvoices } from '../lib/rentabilidad/engine';
import { INITIAL_COST_RULES } from '../lib/rentabilidad/defaults';
import { amount } from '../app/admin/rentabilidad/view-model';
const base=()=>({contracts:[{contractCode:'1',clientCode:'A',clientName:'Cliente de prueba',provider:'Aire Networks',tariff:'CANARIO',price:'60',discount:'-10',periodMonths:1,active:true,startDate:'2026-01-01',source:'LORENA'}],lines:[{contractCode:'1',clientCode:'A',date:'2026-10-01',concept:'Cuota',baseAmount:'55',month:'2026-10'}],costs:[],rules:INITIAL_COST_RULES,references:[],decisions:[]});
const result=(input:any,extra:any={})=>calculateReport(input,'2026-10','real',extra);
test('cuatro decimales se suman antes del redondeo',()=>{const i=base();i.lines=[{...i.lines[0],baseAmount:'0.0049'},{...i.lines[0],concept:'otra',baseAmount:'0.0049'}];assert.equal(result(i).products.find((p:any)=>p.product==='Aire Networks').income,0.01);});
test('descuento con signo y periodicidad contractual',()=>{const i=base();Object.assign(i.contracts[0],{price:'180',discount:'-30',periodMonths:3});assert.equal(result(i).contracts[0].contractedIncome,50);});
test('importe mensual neto del normalizado prevalece',()=>{const i=base();Object.assign(i.contracts[0],{contractedMonthlyAmount:'47.1234'});assert.equal(result(i).contracts[0].contractedIncome,47.1234);});
test('baja no se reactiva desde la referencia recurrente',()=>{const i=base();Object.assign(i.contracts[0],{active:false,endDate:'2026-09-30'});i.lines=[];assert.equal(result(i).contracts.length,0);});
test('coste inicial por fecha de factura es contraste, no coste de servicio',()=>{const i:any=base();i.costs=[{month:'2026-10',product:'Aire Networks',provider:'Aire',amount:'100',status:'REAL',payer:'IO',source:'COSTES_XLSX_INITIAL'}];const r=result(i);assert.equal(r.summary.month.cost,0);assert.equal(r.initialCostByInvoiceMonth.length,1);assert.equal(r.summary.month.pending,true);});
test('externo estimado nunca se convierte a real',()=>{const i:any=base();i.costs=[{key:'externo',month:'2026-10',product:'Aire Networks',provider:'Aire',amount:'40',status:'ESTIMADO',payer:'Vola',source:'COSTES_XLSX_INITIAL'}];const r=result(i);assert.equal(r.summary.month.cost,0);assert.equal(r.summary.month.estimatedCost,40);});
test('externo observado se suma una vez y no desde references',()=>{const i:any=base();const c={month:'2026-10',product:'Aire Networks',provider:'Aire',amount:'40',status:'REAL',payer:'Vola',source:'COSTES_XLSX_INITIAL'};i.costs=[c];i.references=[{...c,kind:'EXTERNAL_INITIAL_REFERENCE'}];assert.equal(result(i).summary.month.cost,40);});
test('filtro contratado cambia datos y no solo la etiqueta',()=>{const i=base();const real=result(i),signed=calculateReport(i,'2026-10','contratado');assert.equal(real.products[0].income,55);assert.equal(signed.products[0].income,50);assert.equal(signed.summary.month.income,50);});
test('autofacturas de varias series no se excluyen entre sí',()=>{const r=result(base(),{series:[{month:'2026-10',serie:'F260001',amount:'20',rows:1},{month:'2026-10',serie:'F260002',amount:'30',rows:1}]});assert.equal(r.products.find((p:any)=>p.product==='Comisiones Xfera').income,50);});
test('hash fuente no depende del histórico de ejecuciones',()=>{const i:any=base();const a=result(i).controls.sourceHash;i.runs=[{process:'X',createdAt:'2026-10-31'}];assert.equal(result(i).controls.sourceHash,a);});
test('hash fuente sí cambia con una serie de facturas',()=>{assert.notEqual(result(base(),{series:[]}).controls.sourceHash,result(base(),{series:[{amount:'1'}]}).controls.sourceHash);});
test('servicios IT usan nómina del mes sin desplazamientos, no promedio',()=>{const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'MANTENIMIENTO INFORMÁTICO GENERAL',description:'ORDEN TEST-IT',price:'1000'});i.lines[0].baseAmount='1000';const g={id:'g',codigoContrato:'TEST-IT',titulo:'Servicios IT',personalAsignado:[{id:'p',empleadoId:'e',activo:true,fechaInicio:'2026-01-01',porcentajeDedicacion:50,empleado:{nominas:[{anio:2026,mes:10,costeTotalEmpresa:'3000',gastosDesplazamiento:'200'}]}}]};const r=result(i,{ggcc:[g]});assert.equal(r.products.find((p:any)=>p.product==='Servicios IT').cost,1400);assert.equal(r.contracts[0].personalCost,1400);});
test('sin nómina del mes se marca pendiente sin usar una anterior como real',()=>{const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'MANTENIMIENTO INFORMÁTICO GENERAL',description:'ORDEN TEST-IT'});const g={id:'g',codigoContrato:'TEST-IT',titulo:'Servicios IT',personalAsignado:[{id:'p',empleadoId:'e',activo:true,porcentajeDedicacion:50,empleado:{nominas:[{anio:2026,mes:9,costeTotalEmpresa:'3000'}]}}]};const r=result(i,{ggcc:[g]});assert.equal(r.contracts[0].cost,0);assert.equal(r.contracts[0].pendingCost,true);assert(r.alerts.some((a:any)=>a.type==='NOMINA_PENDIENTE'));});
test('directo documental asigna por sede y CEX queda coste común',()=>{const i:any=base();i.contracts=[{...i.contracts[0],provider:'Telefónica',tariff:'CONEXIÓN INTERNET DRAXTON',clientName:'DRAXTON',description:'Fonolleres',price:'500'}];i.lines[0].baseAmount='500';const invoices=[{id:'f',provider:'Telefónica de España',number:'TD1',date:'2026-10-01',base:120,lineasDetalle:[{descripcion:'FTTO',cliente:'Fonolleres',importeNeto:100},{descripcion:'CEX PREMIUM',cliente:'Madrid',importeNeto:20}]}];const r=result(i,{invoices});const p=r.products.find((p:any)=>p.product==='Draxton telecomunicaciones');assert.equal(p.cost,120);assert.equal(p.commonCost,20);assert.equal(p.unallocatedCost,0);assert.equal(r.contracts[0].cost,100);});
test('detalle OCR es fuente de líneas si no hay detalle estructurado',()=>{const r=imputeInvoices([{id:'f',provider:'Wildix',number:'2703',date:'2026-07-31',base:120,datosOcrRaw:JSON.stringify({lineas:[{descripcion:'1 year',cliente:'Borges',importeNeto:120}]})}],INITIAL_COST_RULES);assert.equal(r.costs.length,12);assert.equal(r.costs.reduce((s,c)=>s+c.amount,0),120);});
test('bimestral enero reconoce noviembre-diciembre vencidos',()=>{assert.deepEqual(serviceMonths('2026-01-10','01-11 a 31-12','BIMONTH'),['2025-11','2025-12']);assert.equal(serviceMonths('2026-03-01','31-02 a 31-03','BIMONTH'),null);assert.equal(serviceMonths('2026-03-01','01-99 a 31-00','BIMONTH'),null);});

test('autofactura recibida y emitida no suman dos veces',()=>{const r=result(base(),{invoices:[{id:'mirror',provider:'Aire Networks',number:'AF123',date:'2026-10-01',base:20}],series:[{month:'2026-10',serie:'AF/123/2026/',amount:'20',rows:1}]});assert.equal(r.products.find((p:any)=>p.product==='Comisiones Aire').income,20);assert(r.alerts.some((a:any)=>a.type==='AUTOfACTURA_SEGUNDA_FUENTE_EXCLUIDA'));});
test('autofactura recibida no se añade sobre ingreso CSV del mismo producto',()=>{const i:any=base();i.contracts[0].product='Comisiones Aire';const r=result(i,{invoices:[{id:'mirror',provider:'Aire Networks',number:'AF123',date:'2026-10-01',base:20}]});assert.equal(r.products.find((p:any)=>p.product==='Comisiones Aire').income,55);});
test('precisión conservada entre contratos del mismo cliente',()=>{const i:any=base();i.contracts.push({...i.contracts[0],contractCode:'2'});i.lines=[{...i.lines[0],baseAmount:'0.0049'},{...i.lines[0],contractCode:'2',baseAmount:'0.0049'}];const r=result(i);assert.equal(r.clients[0].income,0.01);assert.equal(r.summary.month.income,0.01);});
test('precisión conservada entre productos en el resumen',()=>{const i:any=base();i.contracts.push({...i.contracts[0],contractCode:'2',provider:'Adamo'});i.lines=[{...i.lines[0],baseAmount:'0.0049'},{...i.lines[0],contractCode:'2',baseAmount:'0.0049'}];assert.equal(result(i).summary.month.income,0.01);});
test('nómina nula no es coste cero completo',()=>{const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'MANTENIMIENTO INFORMÁTICO GENERAL',description:'ORDEN TEST-IT'});const g={id:'g',codigoContrato:'TEST-IT',titulo:'Servicios IT',personalAsignado:[{id:'p',empleadoId:'e',activo:true,porcentajeDedicacion:50,empleado:{nominas:[{anio:2026,mes:10,costeTotalEmpresa:null}]}}]};const r=result(i,{ggcc:[g]});assert.equal(r.summary.month.pending,true);assert.equal(r.products.find((p:any)=>p.product==='Servicios IT').marginPct,null);});
test('IT sin GGCC ni personal sigue pendiente en el resumen',()=>{const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'MANTENIMIENTO INFORMÁTICO GENERAL'});assert.equal(result(i).summary.month.pending,true);});
test('una factura válida no esconde otra sin cuadre del mismo proveedor',()=>{const invoices=[{id:'valid',provider:'Aire Networks',number:'A1',date:'2026-10-01',base:10},{id:'invalid',provider:'Aire Networks',number:'A2',date:'2026-10-01',base:20,lineasDetalle:[{descripcion:'01-08 a 30-09',importeNeto:25}]}];const i:any=base();i.rules=[...INITIAL_COST_RULES,{key:'specific',type:'costRule',provider:'Aire Networks',product:'AIRE',invoicePattern:'A2',period:'BIMONTH',priority:100}];const r=result(i,{invoices});assert.equal(r.products.find((p:any)=>p.product==='Aire Networks').pending,true);});
test('varias sedes del mismo cliente no reciben reparto directo por ingreso',()=>{const i:any=base();i.contracts=[{...i.contracts[0],provider:'Telefónica',tariff:'CONEXIÓN INTERNET DRAXTON',clientName:'DRAXTON',description:'Fonolleres'},{...i.contracts[0],contractCode:'2',provider:'Telefónica',tariff:'CONEXIÓN INTERNET DRAXTON',clientName:'DRAXTON',description:'Utrillas'}];const invoices=[{id:'f',provider:'Telefónica de España',number:'TD1',date:'2026-10-01',base:100,lineasDetalle:[{descripcion:'Circuito sin sede',cliente:'DRAXTON',importeNeto:100}]}];const r=result(i,{invoices});assert(r.contracts.every((c:any)=>c.cost===0));assert.equal(r.products.find((p:any)=>p.product==='Draxton telecomunicaciones').unallocatedCost,100);});
test('materializar excepción pendiente no cambia el hash económico',()=>{const i:any=base();const a=result(i).controls.sourceHash;i.decisions=[{kind:'exception',exceptionKey:'x',estado:'PENDIENTE',createdAt:'2026-11-24'}];assert.equal(result(i).controls.sourceHash,a);});
test('timestamps GGCC y versión de importación no cambian identidad económica',()=>{const i:any=base();const extra:any={ggcc:[{id:'g',titulo:'Sin enlace',createdAt:'2026-01-01',updatedAt:'2026-10-01',personalAsignado:[]}]};const a=result(i,extra).controls.sourceHash;i.contracts[0].version=9;extra.ggcc[0].updatedAt='2026-11-24';assert.equal(result(i,extra).controls.sourceHash,a);});
test('coste contratado ausente se mantiene desconocido, no se sustituye por real',()=>{const i:any=base();i.costs=[{month:'2026-10',product:'Aire Networks',provider:'Aire',amount:'40',status:'REAL',payer:'IO',source:'MANUAL'}];const r=calculateReport(i,'2026-10','contratado');assert.equal(r.products[0].actualCost,40);assert.equal(r.products[0].cost,null);assert.equal(r.products[0].margin,null);assert.equal(r.summary.month.pending,true);});

// Independent-review regressions: synthetic identities and amounts only.
const ownNetwork=()=>{const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'RADIO SINTÉTICA',speedMbps:100});return i;};
const syntheticCost=(provider:string,month:string,amount:number,extra:any={})=>({provider,month,amount,product:'Red propia',status:'REAL',payer:'IO',source:`SYNTH:${provider}:${month}`,allocation:'MB',...extra});
const product=(r:any,name:string)=>r.products.find((p:any)=>p.product===name);

test('R1 dos proveedores recurrentes: uno observado no acredita el otro y su estimación se propaga',()=>{
  const i=ownNetwork();i.costs=[syntheticCost('Cogent','2026-09',10),syntheticCost('Templus','2026-09',20,{payer:'Vola'}),syntheticCost('Cogent','2026-10',10)];
  const r=result(i),p=product(r,'Red propia');
  assert.equal(p.cost,10);assert.equal(p.estimatedCost,20);assert.equal(p.pending,true);
  assert(r.alerts.some((a:any)=>a.type==='FACTURA_PROVEEDOR_PENDIENTE'&&a.provider==='Templus'&&a.payer==='Vola'));
  assert.equal(r.contracts[0].estimatedCost,20);assert.equal(r.clients[0].estimatedCost,20);assert.equal(r.summary.month.pending,true);
  assert.equal(r.contracts[0].pending,true);assert.equal(r.clients[0].pending,true);
});
test('R1 Cogent IO y familias externas se comprueban separadamente: ESTIMADO nunca cubre REAL',()=>{
  const i=ownNetwork();i.costs=[syntheticCost('Cogent','2026-10',10),syntheticCost('Templus','2026-10',20,{payer:'Vola',status:'ESTIMADO'}),syntheticCost('XOC','2026-10',30,{payer:'Sotic'}),syntheticCost('RIPE','2026-10',5,{payer:'Vola'}),syntheticCost('DE-CIX','2026-10',7)];
  let r=result(i);assert(r.alerts.some((a:any)=>a.provider==='Templus'&&a.payer==='Vola'));assert.equal(product(r,'Red propia').pending,true);
  i.costs[1].status='REAL';r=result(i);assert.equal(product(r,'Red propia').pending,false);assert.equal(r.summary.month.cost,72);
  i.costs[0].payer='Vola';r=result(i);assert(r.alerts.some((a:any)=>a.provider==='Cogent'&&a.payer==='IO'));assert.equal(product(r,'Red propia').pending,true);
});
test('R1 proveedor histórico adicional no desaparece al existir otras facturas del producto',()=>{
  const i=ownNetwork();i.costs=[syntheticCost('Proveedor sintético Z','2026-09',9),...['Cogent','Templus','XOC','RIPE','DE-CIX'].map(p=>syntheticCost(p,'2026-10',1))];
  const r=result(i);assert(r.alerts.some((a:any)=>a.provider==='Proveedor sintético Z'));assert.equal(product(r,'Red propia').estimatedCost,9);
});
test('R1 familia externa dada de baja y regla inactiva o EXCLUIR no exigen recurrencia',()=>{
  const i=ownNetwork();i.rules=INITIAL_COST_RULES.map(r=>r.key==='cost-initial:templus'?{...r,active:false}:r.key==='cost-initial:xoc'?{...r,method:'EXCLUIR'}:r);
  i.costs=[syntheticCost('Templus','2026-09',20,{payer:'Vola'}),syntheticCost('XOC','2026-09',30,{payer:'Sotic'}),syntheticCost('Proveedor sintético fin','2026-09',8,{payer:'Vola',fechaBaja:'2026-09-30'}),...['Cogent','RIPE','DE-CIX'].map(p=>syntheticCost(p,'2026-10',1))];
  const r=result(i);assert.equal(product(r,'Red propia').pending,false);assert.equal(product(r,'Red propia').estimatedCost,0);
  assert(!r.alerts.some((a:any)=>['Templus','XOC','Proveedor sintético fin'].includes(a.provider)));
});
test('R1 cobertura anual documental cruza ejercicio sin exigir factura fechada en el año actual',()=>{
  const i:any=base();Object.assign(i.contracts[0],{provider:'Sheetgo',price:30});
  const invoices=[{id:'SYNTH-ANUAL',provider:'Sheetgo',number:'SYNTH-A',date:'2025-12-01',base:120,concepto:'Servicio 2025-11-01 a 2026-10-31'}];
  const r=result(i,{invoices});assert.equal(product(r,'Sheetgo').cost,10);assert.equal(product(r,'Sheetgo').pending,false);assert.equal(product(r,'Sheetgo').estimatedCost,0);
});
test('R1 servicio no recurrente no crea una exigencia mensual nueva',()=>{
  const i:any=base();i.costs=[{...syntheticCost('Proveedor sintético puntual','2026-09',100),product:'Aire Networks',recurring:false},{...syntheticCost('Aire Networks','2026-10',10),product:'Aire Networks'}];
  const r=result(i);assert.equal(product(r,'Aire Networks').pending,false);assert.equal(product(r,'Aire Networks').estimatedCost,0);
});
const signedIT=(mixed=false)=>{
  const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'MANTENIMIENTO INFORMÁTICO GENERAL',description:'ORDEN SYNTH-IT',price:100,discount:0});
  if(mixed){i.contracts.push({...i.contracts[0],contractCode:'2',provider:'IO',tariff:'SERVICIO GENERAL',product:'Servicios IO sin coste de proveedor',description:'Sin IT',price:30});i.lines.push({...i.lines[0],contractCode:'2',baseAmount:30});}
  const g={id:'SYNTH-G',codigoContrato:'SYNTH-IT',titulo:'Servicios IT sintéticos',personalAsignado:[],contratosProveedor:[{id:'SYNTH-P',proveedor:'Proveedor IT sintético',estado:'Activo',importeMensual:10,fechaInicio:'2026-01-01'}]};
  return {i,g};
};
test('R2 cliente exclusivamente IT sin personal firmado mantiene margen contratado nulo',()=>{
  const {i,g}=signedIT(),r=calculateReport(i,'2026-10','contratado',{ggcc:[g]});
  assert.equal(r.contracts[0].cost,10);assert.equal(r.contracts[0].pending,true);assert.equal(r.clients[0].pending,true);assert.equal(r.clients[0].margin,null);assert.equal(r.summary.month.margin,null);
});
test('R2 cliente mixto propaga personal IT desconocido sin sustituirlo por nómina real',()=>{
  const {i,g}:any=signedIT(true);g.personalAsignado=[{id:'SYNTH-A',activo:true,porcentajeDedicacion:100,empleado:{nominas:[{anio:2026,mes:10,costeTotalEmpresa:25}]}}];
  const r=calculateReport(i,'2026-10','contratado',{ggcc:[g]});
  assert.equal(r.clients[0].income,130);assert.equal(r.clients[0].pending,true);assert.equal(r.clients[0].margin,null);assert.equal(r.clients[0].actualCost,25);
  assert.equal(r.contracts.find((c:any)=>c.contractCode==='2').pending,false);
});
// This fixture explicitly accredits a zero-supplier-cost service; IO alone is insufficient.
const noSupplierIncome=()=>{const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'SERVICIO GENERAL',product:'Servicios IO sin coste de proveedor'});return i;};
test('R3 cuota firmada ausente permanece null en contrato producto cliente mes resumen y diciembre',()=>{
  const i=noSupplierIncome();i.contracts[0].price=null;const real=result(i),r=calculateReport(i,'2026-10','contratado');
  assert.equal(real.summary.month.income,55);assert.equal(real.summary.month.pending,false);
  for(const row of [r.contracts[0],r.products[0],r.clients[0],r.monthly[9].products[0],r.summary.month,r.summary.ytd,r.summary.december]){assert.equal(row.income,null);assert.equal(row.pending,true);assert.equal(row.margin,null);}
  assert.equal(real.products[0].contractedIncome,null);assert.equal(real.clients[0].contractedIncome,null);
});
test('R3 ingreso firmado parcialmente conocido no se presenta como total completo',()=>{
  const i=noSupplierIncome();i.contracts.push({...i.contracts[0],contractCode:'2',price:null});i.lines.push({...i.lines[0],contractCode:'2',baseAmount:15});
  const r=calculateReport(i,'2026-10','contratado');assert.equal(r.contracts[0].income,50);assert.equal(r.contracts[1].income,null);
  for(const row of [r.products[0],r.clients[0],r.summary.month]){assert.equal(row.income,null);assert.equal(row.rawIncome,null);assert.equal(row.margin,null);assert.equal(row.pending,true);}
  assert.equal(r.clients[0].actualIncome,70);
});
test('R3 precio firmado cero y coste acreditado cero son válidos, no desconocidos',()=>{
  const i=noSupplierIncome();Object.assign(i.contracts[0],{price:0,discount:0});const r=calculateReport(i,'2026-10','contratado');
  for(const row of [r.contracts[0],r.products[0],r.clients[0],r.summary.month]){assert.equal(row.income,0);assert.equal(row.cost,0);assert.equal(row.margin,0);assert.equal(row.pending,false);}
});
test('R3 precisión firmada se conserva antes de agregar entre productos y cliente',()=>{
  const i=noSupplierIncome();Object.assign(i.contracts[0],{price:0.0049,discount:0});i.contracts.push({...i.contracts[0],contractCode:'2',product:'Hotspot',provider:'Xfera'});
  const r=calculateReport(i,'2026-10','contratado');assert.equal(r.summary.month.income,0.01);assert.equal(r.clients[0].income,0.01);
});
const directInput=()=>{const i:any=base();Object.assign(i.contracts[0],{provider:'Wildix',clientName:'Cliente sintético directo',description:'Sede sintética Norte',operatorLineId:'SYNTH-LINE',cif:'SYNTH-CIF'});return i;};
const directInvoice=(evidence:any)=>({id:'SYNTH-DIRECT',provider:'Wildix',number:'SYNTH-D',date:'2026-10-01',base:10,lineasDetalle:[{descripcion:'1 month',cliente:'Cliente sintético directo',importeNeto:10,...evidence}]});
for(const [name,evidence] of [
  ['identidad de cliente contradictoria',{clientIdentity:'SYNTH-OTRO'}],
  ['sede explícita incompatible',{directSite:'Sede sintética Sur'}],
  ['línea identificada pero no acreditada',{lineId:'SYNTH-DESCONOCIDA'}],
  ['contrato explícito con cliente incompatible',{directContract:'1',clientIdentity:'SYNTH-OTRO'}],
  ['contrato explícito con sede incompatible',{directContract:'1',directSite:'Sede sintética Sur'}],
  ['contrato explícito con línea incompatible',{directContract:'1',lineId:'SYNTH-DESCONOCIDA'}],
  ['nombre directo incompatible con identidad válida',{clientIdentity:'A',cliente:'Cliente sintético ajeno'}],
] as const)test(`R4 ${name}: no atribuir por nombre ni descarte`,()=>{
  const r=result(directInput(),{invoices:[directInvoice(evidence)]});assert.equal(r.contracts[0].cost,0);assert.equal(product(r,'Wildix').unallocatedCost,10);assert.equal(r.contracts[0].pending,true);assert(r.alerts.some((a:any)=>a.type==='SEDE_CONTRATO_PENDIENTE'));
});
test('R4 identificador de línea presente exige acreditación aunque el contrato sea único',()=>{
  const i=directInput();delete i.contracts[0].operatorLineId;const r=result(i,{invoices:[directInvoice({lineId:'SYNTH-LINE',directContract:'1'})]});
  assert.equal(r.contracts[0].cost,0);assert.equal(product(r,'Wildix').pending,true);
});
test('R4 contrato cliente fiscal sede y línea únicos compatibles permiten asignar',()=>{
  const r=result(directInput(),{invoices:[directInvoice({directContract:'1',clientIdentity:'SYNTH-CIF',directSite:'Sede sintética Norte',lineId:'SYNTH-LINE'})]});
  assert.equal(r.contracts[0].cost,10);assert.equal(product(r,'Wildix').unallocatedCost,0);assert.equal(r.contracts[0].pending,false);
});
test('R4 sede no se enlaza por substring ni nombre repetido',()=>{
  const i=directInput();i.contracts.push({...i.contracts[0],contractCode:'2',description:'Sede sintética Norte anexo',operatorLineId:'SYNTH-LINE-2'});
  let r=result(i,{invoices:[directInvoice({directSite:'Norte'})]});assert(r.contracts.every((c:any)=>c.cost===0));
  i.contracts[1].description='Sede sintética Norte';r=result(i,{invoices:[directInvoice({directSite:'Sede sintética Norte'})]});assert(r.contracts.every((c:any)=>c.cost===0));
});
test('R5 real parcial más detalle rechazado estima solo el proveedor ausente, no el total previo',()=>{
  const i=ownNetwork();i.rules=[...INITIAL_COST_RULES,{key:'SYNTH-TEMPLUS',type:'costRule',provider:'Templus',product:'Red propia',period:'YEAR',priority:100}];
  const invoices=[{id:'SYNTH-C-PREV',provider:'Cogent',date:'2026-09-01',base:10},{id:'SYNTH-T-PREV',provider:'Templus',date:'2026-09-01',base:240,concepto:'Servicio 2025-10-01 a 2026-09-30'},{id:'SYNTH-C-NOW',provider:'Cogent',date:'2026-10-01',base:10},{id:'SYNTH-T-BAD',provider:'Templus',date:'2026-10-01',base:240,lineasDetalle:[{descripcion:'Servicio 2026-10-01 a 2027-09-30',importeNeto:260}]}];
  const r=result(i,{invoices}),p=product(r,'Red propia');assert.equal(p.cost,10);assert.equal(p.estimatedCost,20);assert.equal(p.rawCost+p.rawEstimatedCost,30);assert.equal(p.pending,true);
  assert.equal(r.contracts[0].estimatedCost,20);assert.equal(r.clients[0].estimatedCost,20);assert.equal(r.contracts[0].cost,10);assert.equal(r.summary.month.estimatedCost,20);
});
test('R5 componentes identificados del mismo proveedor permiten delta sin duplicar real',()=>{
  const i:any=base();i.costs=[{...syntheticCost('Aire Networks','2026-09',10),product:'Aire Networks',componentId:'SYNTH-C1'},{...syntheticCost('Aire Networks','2026-09',20),product:'Aire Networks',componentId:'SYNTH-C2'},{...syntheticCost('Aire Networks','2026-10',10),product:'Aire Networks',componentId:'SYNTH-C1'}];
  const r=result(i);assert.equal(product(r,'Aire Networks').cost,10);assert.equal(product(r,'Aire Networks').estimatedCost,20);assert.equal(r.clients[0].estimatedCost,20);
});
test('R5 detalle pendiente sin identidad de componente no copia total previo sobre real parcial',()=>{
  const i:any=base();i.rules=[...INITIAL_COST_RULES,{key:'SYNTH-DETAIL',type:'costRule',provider:'Aire Networks',product:'Aire Networks',invoicePattern:'BAD',period:'BIMONTH',priority:100}];
  const invoices=[{id:'SYNTH-PREV',provider:'Aire Networks',date:'2026-09-01',base:30},{id:'SYNTH-NOW',provider:'Aire Networks',date:'2026-10-01',base:10},{id:'SYNTH-BAD',provider:'Aire Networks',number:'BAD',date:'2026-10-01',base:20,lineasDetalle:[{descripcion:'01-08 a 30-09',importeNeto:25}]}];
  const r=result(i,{invoices});assert.equal(product(r,'Aire Networks').cost,10);assert.equal(product(r,'Aire Networks').estimatedCost,0);assert.equal(product(r,'Aire Networks').pending,true);
});
test('R5 estimación no atribuible queda explícita y pendiente sin inventar reparto por ingresos',()=>{
  const i=directInput();i.contracts.push({...i.contracts[0],contractCode:'2',description:'Sede sintética Sur'});
  i.costs=[{month:'2026-09',product:'Wildix',provider:'Wildix',amount:20,status:'REAL',payer:'IO',source:'SYNTH-HIST',allocation:'DIRECT',directClient:'Cliente sintético directo'}];
  const r=result(i);assert.equal(product(r,'Wildix').estimatedCost,20);assert.equal(product(r,'Wildix').unallocatedEstimatedCost,20);assert(r.contracts.every((c:any)=>c.pending));assert.equal(r.clients[0].pending,true);
});
test('referencias repetidas por aliases del mismo localizador no se suman dos veces',()=>{
  const i:any=base(),sourceLocator={file:'SYNTH.xlsx',sheet:'SYNTH',cell:'B2'};
  i.references=[{kind:'recurrent_product',income:100,cost:30,sourceLocator,createdAt:'2026-01-01'},{kind:'recurrent_product',income:100,cost:30,productoId:'AIRE',sourceLocator,createdAt:'2026-02-01'},{kind:'recurrent_product',income:20,cost:5,sourceLocator:{...sourceLocator,cell:'B3'}}];
  const r=result(i);assert.equal(r.referenceSummary.income,120);assert.equal(r.referenceSummary.cost,35);assert.equal(r.references.length,2);
});

test('R3 periodicidad de factura no acredita una periodicidad firmada ausente',()=>{
  const i=noSupplierIncome();delete i.contracts[0].periodMonths;i.lines[0].periodicityMonths=1;
  const r=calculateReport(i,'2026-10','contratado');assert.equal(r.contracts[0].income,null);assert.equal(r.products[0].income,null);assert.equal(r.summary.month.pending,true);assert.equal(r.summary.month.actualIncome,undefined);
});
test('R3 precio vacío no constituye una cuota firmada cero',()=>{
  const i=noSupplierIncome();i.contracts[0].price='';const r=calculateReport(i,'2026-10','contratado');assert.equal(r.summary.month.income,null);assert.equal(r.contracts[0].income,null);
});
test('R1 componente anual Wildix vencido no queda cubierto por una línea mensual del mismo cliente',()=>{
  const invoices=[{id:'SYNTH-WA',provider:'Wildix',number:'2703',date:'2025-10-01',base:120,lineasDetalle:[{cliente:'Cliente sintético directo',descripcion:'1 year 2025-10-01 a 2026-09-30',importeNeto:120}]},directInvoice({})];
  const r=result(directInput(),{invoices}),p=product(r,'Wildix');assert.equal(p.pending,true);assert.equal(p.cost,10);assert.equal(p.estimatedCost,10);assert(r.alerts.some((a:any)=>a.provider==='Wildix'&&String(a.component).includes('annual')));
});
test('R5 componente estimado existente no se añade otra vez desde su histórico real',()=>{
  const i=ownNetwork();i.costs=[syntheticCost('Cogent','2026-09',10),syntheticCost('Templus','2026-09',20,{payer:'Vola'}),syntheticCost('Cogent','2026-10',10),syntheticCost('Templus','2026-10',15,{payer:'Vola',status:'ESTIMADO'})];
  const r=result(i);assert.equal(product(r,'Red propia').estimatedCost,15);assert.equal(r.contracts[0].estimatedCost,15);assert.equal(r.summary.month.cost,10);assert.equal(r.summary.month.pending,true);
});

test('R5 piezas históricas anónimas parcialmente observadas no acreditan coste completo ni estimación inventada',()=>{
  const i:any=base();i.costs=[{...syntheticCost('Aire Networks','2026-09',10),product:'Aire Networks',source:'SYNTH-P1'},{...syntheticCost('Aire Networks','2026-09',20),product:'Aire Networks',source:'SYNTH-P2'},{...syntheticCost('Aire Networks','2026-10',10),product:'Aire Networks'}];
  const r=result(i),p=product(r,'Aire Networks');assert.equal(p.pending,true);assert.equal(p.estimatedCost,0);assert.equal(amount(p,'margin','real'),null);assert.equal(r.clients[0].pending,true);
});
test('porcentaje de previsión usa precisión original y queda nulo cuando la cobertura está pendiente',()=>{
  const i=noSupplierIncome();Object.assign(i.contracts[0],{price:0.0149,discount:0});i.costs=[{month:'2026-12',product:'Servicios IO sin coste de proveedor',provider:'IO',amount:0.0049,status:'REAL',payer:'IO',source:'SYNTH-DEC'}];
  const r=result(i);assert.equal(r.summary.december.margin,0.01);assert.equal(r.summary.december.marginPct,67.11);
  const pending=result(base());assert.equal(pending.summary.december.marginPct,null);
  const {i:it,g}=signedIT(true),signed=calculateReport(it,'2026-10','contratado',{ggcc:[g]});assert.equal(amount(signed.clients[0],'margin','contratado'),null);assert.equal(amount(signed.summary.month,'margin','contratado'),null);
});

test('R1 una factura puntual actual no acredita la recurrencia del mismo proveedor',()=>{
  const i:any=base();i.costs=[{...syntheticCost('Aire Networks','2026-09',10),product:'Aire Networks'},{...syntheticCost('Aire Networks','2026-10',5),product:'Aire Networks',recurring:false}];
  const r=result(i);assert.equal(product(r,'Aire Networks').pending,true);assert(r.alerts.some((a:any)=>a.provider==='Aire Networks'));assert.equal(product(r,'Aire Networks').cost,5);
});

test('IO no clasificado no acredita margen sin coste en producto cliente ni contratado',()=>{
  const i:any=base();Object.assign(i.contracts[0],{provider:'IO',tariff:'SERVICIO SINTÉTICO NO CLASIFICADO'});
  const real=result(i),signed=calculateReport(i,'2026-10','contratado');
  assert.equal(real.contracts[0].product,'Otros');assert.equal(real.contracts[0].pending,true);
  assert.equal(real.clients[0].pending,true);assert.equal(amount(real.clients[0],'margin','real'),null);
  assert.equal(signed.contracts[0].cost,null);assert.equal(signed.clients[0].margin,null);
  Object.assign(i.contracts[0],{product:'Red propia',tariff:'IP FIJA'});
  assert.equal(result(i).contracts[0].product,'Red propia');
});
