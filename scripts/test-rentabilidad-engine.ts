import assert from 'node:assert/strict';
import { allocate, activeInMonth, canonicalProduct, cents, classifyContract, imputeInvoices, money, normalize, periodicity, serviceMonths, servicePeriod, shiftMonth, splitPeriod } from '../lib/rentabilidad/engine';
let n=0;const test=(name:string,fn:()=>void)=>{fn();n++;console.log(`PASS ${name}`);};
test('normalizar sin acentos',()=>assert.equal(normalize('Telefónica de España, S.A.'),'telefonica de espana s a'));
test('periodicidades firmadas',()=>{for(const [v,e] of [['mensual',1],['trimestral',3],['semestral',6],['anual',12]])assert.equal(periodicity(v),e);assert.equal(periodicity('cada tanto'),null);});
test('reparto conserva cada céntimo',()=>{for(const amount of [0.01,1,2988, -1.01,-4394]) {const rows=allocate(amount,[{key:'a',weight:1000},{key:'b',weight:600},{key:'c',weight:450}]);assert.equal(money(rows.reduce((s,r)=>s+r.amount,0)),amount);}});
test('no inventar reparto sin Mb',()=>assert.deepEqual(allocate(10,[{key:'a',weight:0}]),[]));
test('reparto determinista',()=>assert.deepEqual(allocate(0.01,[{key:'b',weight:1},{key:'a',weight:1}]),[{key:'a',amount:.01},{key:'b',amount:0}]));
test('bimestral vencido literal',()=>assert.deepEqual(serviceMonths('2026-10-01','Periodo 01-08 a 30-09','BIMONTH'),['2026-08','2026-09']));
test('bimestral sin periodo pendiente',()=>assert.equal(serviceMonths('2026-10-01','cuota internacional','BIMONTH'),null));
test('periodo cruza año',()=>assert.deepEqual(serviceMonths('2026-02-01','01-12 a 31-01','BIMONTH'),['2025-12','2026-01']));
test('anual conserva total',()=>{const portions=splitPeriod(4394,serviceMonths('2026-07-01','','YEAR')!);assert.equal(portions.length,12);assert.equal(money(portions.reduce((s,p)=>s+p.amount,0)),4394);assert.equal(portions.at(-1)?.month,'2027-06');});
test('STe tránsito 1Gb=1000 Mb en peso',()=>assert.deepEqual(allocate(30,[{key:'STE',weight:1000},{key:'otro',weight:500}]),[{key:'otro',amount:10},{key:'STE',amount:20}]));
test('altas y bajas históricas',()=>{assert.equal(activeInMonth({startDate:'2026-04-20',endDate:'2026-09-01',active:false},'2026-03'),false);assert.equal(activeInMonth({startDate:'2026-04-20',endDate:'2026-09-01',active:false},'2026-06'),true);assert.equal(activeInMonth({endDate:'2026-09-01',active:false},'2026-10'),false);});
const rules=[{kind:'TARIFA',pattern:'CANARIO',provider:'Aire Networks',product:'Aire Networks'},{kind:'TARIFA',pattern:'CM-',match:'startsWith',provider:'Xfera',product:'Cablemóvil/Xfera'}];
test('proveedor Lorena prevalece sobre tarifa',()=>assert.equal(classifyContract({provider:'Telefónica',tariff:'CANARIO'},rules).product,'Telefónica'));
test('regla solo cuando falta proveedor',()=>assert.equal(classifyContract({tariff:'CANARIO 50'},rules).product,'Aire Networks'));
test('tarifa nueva a cola',()=>assert.equal(classifyContract({tariff:'INVENTADA'},rules).pending,true));
test('prefijo sin coincidencia en mitad',()=>assert.equal(classifyContract({tariff:'PACK CM-FIBRA'},rules).pending,true));
test('producto propio acreditado no se sustituye por coste cero',()=>{assert.equal(classifyContract({provider:'IO',tariff:'IP FIJA',product:'Red propia'}).product,'Red propia');assert.equal(classifyContract({provider:'IO',tariff:'TRENCALOS 12',product:'Red propia'}).product,'Red propia');});
test('IO sin tipología ni producto queda pendiente y nunca sin coste',()=>{const r=classifyContract({provider:'IO',tariff:'SERVICIO SINTÉTICO NO CLASIFICADO'});assert.equal(r.product,'Otros');assert.equal(r.pending,true);});
test('sin coste debe ser producto explícito y tipología IT conserva prioridad',()=>{assert.equal(classifyContract({provider:'IO',product:'Servicios IO sin coste de proveedor'}).product,'Servicios IO sin coste de proveedor');assert.equal(classifyContract({provider:'IO',tariff:'MANTENIMIENTO INFORMÁTICO GENERAL',product:'Red propia'}).product,'Servicios IT');});
test('Draxton y Borges directos',()=>{assert.equal(classifyContract({provider:'Telefónica',clientName:'Draxton'}).product,'Draxton telecomunicaciones');assert.equal(classifyContract({provider:'Wildix',clientName:'Borges'}).product,'Wildix Borges');});
test('producto hotspot separado',()=>assert.equal(classifyContract({provider:'Xfera',tariff:'HTSP'}).product,'Hotspot'));
test('factura sin regla en cola no coste cero',()=>{const r=imputeInvoices([{id:'f1',provider:'nuevo',base:10,date:'2026-01-01',number:'1'}],[]);assert.equal(r.alerts.length,1);assert.equal(r.costs.length,0);});
test('comisiones separadas del coste',()=>{const r=imputeInvoices([{id:'f1',provider:'Aire Networks',base:10,date:'2026-01-01',number:'AF1'}],[]);assert.equal(r.commissions[0].amount,10);assert.equal(r.costs.length,0);});
test('descuento proporcional Wildix',()=>{const r=imputeInvoices([{id:'f1',provider:'Wildix',base:90,globalDiscountAmount:10,date:'2026-07-01',number:'1',lines:[{cliente:'Borges',importeNeto:100,descripcion:'1 year'}]}],[{kind:'COSTE',provider:'Wildix',product:'Wildix',allocation:'DIRECT',period:'YEAR'}]);assert.equal(money(r.costs.reduce((s,c)=>s+c.amount,0)),90);assert.equal(r.costs[0].product,'Wildix Borges');});
test('directo sin cliente no se reparte',()=>{const r=imputeInvoices([{id:'f',provider:'Wildix',base:10,date:'2026-01-01',lines:[{importeNeto:10}]}],[{kind:'COSTE',provider:'Wildix',allocation:'DIRECT'}]);assert.equal(r.costs.length,0);assert.equal(r.alerts[0].type,'CLIENTE_PENDIENTE');});
test('líneas que superan base en sentido inválido a cola',()=>{const r=imputeInvoices([{id:'f',provider:'Wildix',base:110,date:'2026-01-01',lines:[{cliente:'Borges',importeNeto:100}]}],[{kind:'COSTE',provider:'Wildix',allocation:'DIRECT'}]);assert.equal(r.costs.length,0);});
test('cruce año por meses UTC',()=>assert.equal(shiftMonth('2026-12',1),'2027-01'));
test('medio céntimo negativo redondea alejándose de cero',()=>{
  for(const [input,expected] of [[-.005,-.01],[.005,.01],[-1.005,-1.01],[1.005,1.01],[-2.675,-2.68],[2.675,2.68],[-.0049,0]])assert.equal(money(input),expected);
  assert.equal(cents(-.005),-1);
  assert.deepEqual(allocate(-.005,[{key:'a',weight:1}]),[{key:'a',amount:-.01}]);
});
test('descuento inexplicado se queda en cola sin costes',()=>{
  const r=imputeInvoices([{id:'discount',provider:'Wildix',base:90,date:'2026-07-01',lines:[{cliente:'Borges',importeNeto:100,descripcion:'1 year'}]}],[{kind:'COSTE',provider:'Wildix',allocation:'DIRECT',period:'YEAR'}]);
  assert.equal(r.costs.length,0);assert.equal(r.alerts.length,1);assert.equal(r.alerts[0].type,'DETALLE_NO_CUADRA');
});
test('descuento global declarado debe cerrar la diferencia',()=>{
  const r=imputeInvoices([{id:'discount',provider:'Wildix',base:90,globalDiscountAmount:8,date:'2026-07-01',lines:[{cliente:'Borges',importeNeto:100}]}],[{kind:'COSTE',provider:'Wildix',allocation:'DIRECT'}]);
  assert.equal(r.costs.length,0);assert.equal(r.alerts[0].type,'DETALLE_NO_CUADRA');
});
test('CEX Premium Draxton sin cliente sigue siendo coste común',()=>{
  const r=imputeInvoices([{id:'cex',provider:'Telefónica',base:882.4,date:'2026-07-01',lines:[{descripcion:'CEX Premium Gestión personalizada',importeNeto:882.4}]}],[{kind:'COSTE',provider:'Telefónica',product:'Draxton telecomunicaciones',allocation:'DIRECT'}]);
  assert.equal(r.alerts.length,0);assert.equal(r.costs.length,1);
  assert.equal(r.costs[0].commonCost,true);assert.equal(r.costs[0].directClient,null);assert.equal(r.costs[0].directContract,null);assert.equal(r.costs[0].amount,882.4);
});
test('directa conserva sede identidad descripción contrato e identificador de línea',()=>{
  const r=imputeInvoices([{id:'direct',provider:'Telefónica',base:100,date:'2026-07-01',lines:[{cliente:'Draxton',sede:'Barcelona',clientIdentity:'SYNTH-CLIENT',directContract:'SYNTH-CONTRACT',lineId:'SYNTH-LINE',descripcion:'Acceso 1 Gbps Barcelona',importeNeto:100}]}],[{kind:'COSTE',provider:'Telefónica',product:'Draxton telecomunicaciones',allocation:'DIRECT'}]);
  assert.equal(r.alerts.length,0);const c=r.costs[0];assert.equal(c.allocation,'DIRECT');assert.equal(c.directSite,'Barcelona');assert.equal(c.clientIdentity,'SYNTH-CLIENT');assert.equal(c.directContract,'SYNTH-CONTRACT');assert.equal(c.lineId,'SYNTH-LINE');assert.equal(c.description,'Acceso 1 Gbps Barcelona');
});
test('directa permite evidencia de sede o contrato o línea sin nombre cliente',()=>{
  for(const evidence of [{sede:'Barcelona'},{directContract:'SYNTH-CONTRACT'},{lineId:'SYNTH-LINE'},{clientIdentity:'SYNTH-CLIENT'}]){
    const r=imputeInvoices([{id:'direct',provider:'Telefónica',base:100,date:'2026-07-01',lines:[{...evidence,descripcion:'Circuito',importeNeto:100}]}],[{kind:'COSTE',provider:'Telefónica',product:'Draxton telecomunicaciones',allocation:'DIRECT'}]);
    assert.equal(r.alerts.length,0);assert.equal(r.costs.length,1);assert.equal(r.costs[0].allocation,'DIRECT');
  }
});
test('periodo anual documental ISO prevalece sobre mes de factura',()=>{
  const r=imputeInvoices([{id:'annual',provider:'Sheetgo',base:120,date:'2026-07-01',lines:[{descripcion:'Servicio 2026-04-01 a 2027-03-31',importeNeto:120}]}],[{kind:'COSTE',provider:'Sheetgo',period:'YEAR'}]);
  assert.equal(r.alerts.length,0);assert.equal(r.costs.length,12);assert.equal(r.costs[0].month,'2026-04');assert.equal(r.costs.at(-1).month,'2027-03');
  assert.ok(r.costs.every(c=>c.status==='REAL'&&c.periodBasis==='DOCUMENT_PERIOD'));assert.equal(money(r.costs.reduce((s,c)=>s+c.amount,0)),120);
});
test('periodo anual documental dd/mm/aaaa admite fin inclusivo o exclusivo',()=>{
  for(const end of ['31/03/2027','01/04/2027']){
    const months=serviceMonths('2026-07-01',`Periodo 01/04/2026 a ${end}`,'YEAR')!;
    assert.equal(months.length,12);assert.equal(months[0],'2026-04');assert.equal(months.at(-1),'2027-03');
  }
  assert.equal(serviceMonths('2026-07-01','Periodo 01-04-2026 a 31-03-2027','YEAR')![0],'2026-04');
});
test('anual sin anclaje confirmado es ESTIMADO con alerta pendiente',()=>{
  const r=imputeInvoices([{id:'annual',provider:'Sheetgo',base:120,date:'2026-07-01'}],[{kind:'COSTE',provider:'Sheetgo',period:'YEAR'}]);
  assert.equal(r.costs.length,12);assert.equal(r.costs[0].month,'2026-07');assert.equal(r.costs.at(-1).month,'2027-06');
  assert.ok(r.costs.every(c=>c.status==='ESTIMADO'&&c.periodBasis==='INVOICE_MONTH_UNVERIFIED'));
  assert.equal(r.alerts.length,1);assert.equal(r.alerts[0].type,'PERIODO_ANUAL_PENDIENTE');assert.equal(money(r.costs.reduce((s,c)=>s+c.amount,0)),120);
});
test('anclaje anual opt-in de regla es REAL y documental sigue prevaleciendo',()=>{
  const rule={kind:'COSTE',provider:'Sheetgo',period:'YEAR',periodAnchor:'INVOICE_MONTH'};
  const r=imputeInvoices([{id:'annual',provider:'Sheetgo',base:120,date:'2026-07-01'}],[rule]);
  assert.equal(r.alerts.length,0);assert.ok(r.costs.every(c=>c.status==='REAL'&&c.periodBasis==='RULE_INVOICE_MONTH'));
  assert.equal(servicePeriod('2026-07-01','01/04/2026 a 31/03/2027','YEAR',rule.periodAnchor).months![0],'2026-04');
});
test('anual con fechas inválidas o cobertura distinta a doce meses no se verifica',()=>{
  for(const text of ['31/02/2026 a 28/02/2027','01/04/2026 a 28/02/2027','01/04/2026 a 30/04/2027','01/04/2027 a 31/03/2026']){
    const p=servicePeriod('2026-07-01',text,'YEAR');assert.equal(p.status,'ESTIMADO');assert.equal(p.periodBasis,'INVOICE_MONTH_UNVERIFIED');
  }
});
test('anual usa cobertura documental de concepto cuando no hay detalle',()=>{
  const r=imputeInvoices([{id:'annual',provider:'RIPE',base:120,date:'2026-07-01',concepto:'Cobertura 01/01/2026 al 31/12/2026'}],[{kind:'COSTE',provider:'RIPE',period:'YEAR'}]);
  assert.equal(r.alerts.length,0);assert.equal(r.costs[0].month,'2026-01');assert.equal(r.costs.at(-1).month,'2026-12');assert.equal(r.costs[0].status,'REAL');
});
test('OCR fallback conserva líneas y descuento global explícito',()=>{
  const r=imputeInvoices([{id:'ocr',provider:'Wildix',base:90,date:'2026-07-01',lineasDetalle:'[]',datosOcrRaw:JSON.stringify({descuentoGlobalImporte:10,lineas:[{cliente:'Borges',descripcion:'1 month',importeNeto:100}]})}],[{kind:'COSTE',provider:'Wildix',allocation:'DIRECT',period:'YEAR'}]);
  assert.equal(r.alerts.length,0);assert.equal(r.costs.length,1);assert.equal(r.costs[0].amount,90);assert.equal(r.costs[0].product,'Wildix Borges');assert.equal(r.costs[0].status,'REAL');
});
test('Acens mixto conserva Panda anual y Microsoft mensual',()=>{
  const r=imputeInvoices([{id:'acens',provider:'Acens',base:132,date:'2026-07-01',lines:[{descripcion:'Panda 01/04/2026 a 31/03/2027',importeNeto:120},{descripcion:'Microsoft 365',importeNeto:12}]}],[{kind:'COSTE',provider:'Acens',product:'Acens',period:'YEAR'}]);
  assert.equal(r.alerts.length,0);assert.equal(r.costs.length,13);assert.equal(r.costs.filter(c=>c.description==='Microsoft 365').length,1);assert.equal(r.costs.find(c=>c.description==='Microsoft 365').month,'2026-07');assert.equal(money(r.costs.reduce((s,c)=>s+c.amount,0)),132);
});
test('Wildix 1 month y 1 year prevalecen sobre periodo genérico',()=>{
  const r=imputeInvoices([{id:'wildix',provider:'Wildix',base:132,date:'2026-07-01',lines:[{cliente:'Borges',descripcion:'1 month',importeNeto:12},{cliente:'Borges',descripcion:'1 year',importeNeto:120}]}],[{kind:'COSTE',provider:'Wildix',allocation:'DIRECT',period:'YEAR'}]);
  assert.equal(r.costs.length,13);assert.equal(r.costs.filter(c=>c.status==='REAL').length,1);assert.equal(r.costs.filter(c=>c.status==='ESTIMADO').length,12);assert.equal(r.alerts[0].type,'PERIODO_ANUAL_PENDIENTE');
});
test('EXCLUIR no valida ni imputa detalle de estructura',()=>{
  const r=imputeInvoices([{id:'structure',provider:'estructura',base:100,date:'2026-07-01',lines:[{}]}],[{kind:'COSTE',provider:'estructura',method:'EXCLUIR'}]);
  assert.deepEqual(r,{costs:[],alerts:[],commissions:[]});
});
test('bimestral inválido queda pendiente y noviembre diciembre cruza año',()=>{
  assert.equal(serviceMonths('2026-04-01','31-02 a 31-03','BIMONTH'),null);
  assert.deepEqual(serviceMonths('2027-01-01','01-11 a 31-12','BIMONTH'),['2026-11','2026-12']);
  const r=imputeInvoices([{id:'bimonth',provider:'Telefónica',base:100,date:'2026-04-01',lines:[{descripcion:'31-02 a 31-03',importeNeto:100}]}],[{kind:'COSTE',provider:'Telefónica',period:'BIMONTH'}]);
  assert.equal(r.costs.length,0);assert.equal(r.alerts[0].type,'PERIODO_PENDIENTE');
});
console.log(`${n}/${n} pruebas puras de Rentabilidad correctas; sin BD ni correos.`);
