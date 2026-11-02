const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const baseline = process.env.AREA1_BASE_COMMIT || '7b3e70a';
const ts = require(path.join(root, 'node_modules/typescript'));
const solutionSlugs = ['moviles', 'exagrid', 'conectividad-avanzada', 'mantenimiento-it', 'comunicaciones-unificadas', 'infraestructura-red'];
const routeFiles = [...solutionSlugs.map(s => `app/api/contrata/${s}/route.ts`), 'app/api/contrata/migracion-web/route.ts', 'app/api/contrata/auditoria-web-rapida/route.ts', 'app/api/altas/crear/route.ts'];
const formFiles = [...['moviles', 'exagrid', 'migracion-web', 'conectividad-avanzada', 'mantenimiento-it', 'comunicaciones-unificadas', 'infraestructura-red'].map(s => `app/soluciones/${s}/page.tsx`), 'app/contrata/migracion-web/MigracionWebFormulario.tsx', 'app/alta-servicio/page.tsx'];
const source = f => fs.readFileSync(path.join(root, f), 'utf8');
let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const printer = ts.createPrinter({removeComments: true});
const parse = (f, s) => ts.createSourceFile(f, s, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const normalize = (node, file) => printer.printNode(ts.EmitHint.Unspecified, node, file).replace(/\s+/g, '');
function find(file, predicate) { let found; function walk(node) { if (!found && predicate(node)) found=node; if (!found) ts.forEachChild(node, walk); } walk(file); return found; }
function dataProperties(file, callee) {
  const call=find(file,n=>ts.isCallExpression(n) && n.expression.getText(file)===callee);
  assert.ok(call, callee);
  const arg=call.arguments[0];
  return arg.properties.find(p=>p.name?.getText(file)==='data').initializer.properties;
}
function normalizedProperties(file, callee, resolveDatos=false) {
  const props=dataProperties(file,callee);
  const result={};
  for(const prop of props) {
    const name=prop.name?.getText(file);
    if(name==='crmContactoId') continue;
    let node=prop;
    if(resolveDatos && name==='datos' && prop.initializer.getText(file)==='datosSolicitud') {
      const declaration=find(file,n=>ts.isVariableDeclaration(n) && n.name.getText(file)==='datosSolicitud');
      node=ts.factory.updatePropertyAssignment(prop,prop.name,declaration.initializer);
    }
    result[name]=normalize(node,file);
  }
  return result;
}

for(const f of [...routeFiles,...formFiles,'lib/payments/notifications.ts']) {
  const result=ts.transpileModule(source(f),{fileName:f,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  equal(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[],`${f}: syntax`);
}
for(const f of routeFiles) {
  const current=source(f);
  ok(!/hubspot|hubapi/i.test(current),`${f}: no removed CRM integration`);
  ok(current.includes("import { guardarCaptacionWeb } from '@/lib/crm-captacion-web'"),`${f}: shared helper imported`);
  const model=f.includes('/altas/')?'altaServicio':f.includes('migracion-web')||f.includes('auditoria-web-rapida')?'leadMigracionWeb':'leadSolucion';
  const old=parse(f,cp.execFileSync('git',['show',`${baseline}:${f}`],{cwd:root,encoding:'utf8'}));
  const now=parse(f,current);
  equal(normalizedProperties(now,`tx.${model}.create`,true),normalizedProperties(old,`prisma.${model}.create`),`${f}: every original detail property is unchanged`);
  const added=dataProperties(now,`tx.${model}.create`).find(p=>p.name?.getText(now)==='crmContactoId');
  equal(added.initializer.getText(now),'contactoId',`${f}: canonical FK`);
  // Transactional templates and email call arguments must be unchanged.
  const emailVariables = model==='altaServicio'?['htmlComercial','htmlCliente']:['emailComercialHtml','emailInteresadoHtml'];
  for(const name of emailVariables) {
    const before=find(old,n=>ts.isVariableDeclaration(n)&&n.name.getText(old)===name);
    const after=find(now,n=>ts.isVariableDeclaration(n)&&n.name.getText(now)===name);
    equal(after.initializer.getText(now),before.initializer.getText(old),`${f}: ${name} template preserved`);
  }
}
for(const f of formFiles) {
  const text=source(f);
  ok(text.includes("'Idempotency-Key': envioRef.current.key"),`${f}: explicit retry key`);
  ok(text.includes('envioRef.current.payload !== payload'),`${f}: changed payload gets a fresh key`);
  ok(!/type="checkbox" required checked=\{formData.newsletter\}/.test(text),`${f}: marketing is optional`);
}
const notifOld=cp.execFileSync('git',['show',`${baseline}:lib/payments/notifications.ts`],{cwd:root,encoding:'utf8'});
const notifNow=source('lib/payments/notifications.ts');
equal(notifNow,notifOld.replace(/^const HUBSPOT_API_KEY[^\n]*\n/m,'').slice(0,notifOld.replace(/^const HUBSPOT_API_KEY[^\n]*\n/m,'').indexOf('\n  // Añadir a lista de HubSpot'))+'}\n','notifications: only removed block and unused key');

const base={nombre:'Nombre Ficticio',email:'ficticio@example.invalid',empresa:'Empresa Ficticia',telefono:'000000000',numLineas:'20',operadorActual:'Operador ficticio',consumoDatos:'50GB',permanenciaActual:'Sin permanencia',tipoDispositivos:'Smartphone',necesidades:['Backup'],perfilUsuarios:'Profesional',comentarios:'Consulta sintética',volumenDatos:'50 TB',softwareBackup:'Veeam',entorno:'Virtual',retencion:'30 días',interesadoPOC:'No por ahora',numSedes:'2',conexionActual:'Fibra',velocidadNecesaria:'1 Gbps',servicios:['Fibra'],problemaActual:'Lentitud',tipoNegocio:'MEDIANA_GRANDE',numEquipos:'30',numServidores:'2',serviciosInteres:['Soporte'],coberturaHoraria:'24h',equipoITInterno:'Sí',produccion24h:'Sí',sistemasCriticos:'ERP',softwareEspecifico:['Software ficticio'],backupCiberseguridad:'Sí',presupuestoOrientativo:'1000',numEmpleados:'30',centralitaActual:'PBX',funcionalidades:['Llamadas'],modalidadTrabajo:'Remoto',tipoProyecto:'Nueva red',numUsuarios:'30',superficieM2:'300',numPlantas:'2',infraestructuraActual:'Cobre',fabricantePreferido:'Ninguno',nombreEmpresa:'Empresa Ficticia',contacto:'Nombre Ficticio',urlWebActual:'https://example.invalid',sector:'industria',sectorOtro:'',numPaginas:'10-50',tieneBlog:true,tieneTienda:false,tieneFormularios:true,tieneAreaPrivada:false,frustracionActual:'Lentitud',objetivos:['integrar_software'],respuestasSector:{erp_industria:'Software ficticio'},softwareActual:'Software ficticio',tieneApi:'Sí',datosIntegracion:'Productos',proveedorActual:'Proveedor ficticio',presupuesto:'6.000 - 12.000 €',fechaLimite:'Sin fecha',comoNosConocio:'recomendacion',urlWeb:'https://example.invalid',mensaje:'Consulta sintética',tipoCliente:'EMPRESA',razonSocial:'Empresa Ficticia',cif:'B00000000',nombreApoderado:'Apoderado Ficticio',dniApoderado:'00000000T',apellidos:'Apellido Ficticio',dni:'00000000T',direccionFacturacion:'Calle Ficticia',localidadFacturacion:'Localidad Ficticia',provinciaFacturacion:'Provincia Ficticia',cpFacturacion:'00000',direccionInstalacion:'Instalación Ficticia',localidadInstalacion:'Localidad Ficticia',provinciaInstalacion:'Provincia Ficticia',cpInstalacion:'00000',metodoPago:'TARJETA_VIVID',iban:'ES9121000418450200051332',tarifaId:7,esPortabilidad:true,numeroPortar:'000000000',titularLineaDiferente:true,observaciones:'Servicio sintético'};

function loadMocked(f,{repetido=false,fail=false,newsletter=false,privacidad=undefined,method='TARJETA_VIVID',type='EMPRESA',brevoFails=false}={}) {
  const calls=[];let capture;let detail;
  const tarifa={id:7,nombre:'Tarifa Ficticia',nombreComercial:'Tarifa Ficticia',precioConIva:45.5,cuotaAlta:25,permanencia:12};
  const create=async args=> { calls.push({kind:'detail',data:args.data}); if(fail) throw Error('Synthetic database failure'); detail={...args.data,id:'detalle-ficticio',token:'token-ficticio'};return detail; };
  const tx={leadSolucion:{create},leadMigracionWeb:{create},altaServicio:{create}};
  const prisma={tarifa:{findUnique:async()=>tarifa},altaServicio:{update:async args=>{calls.push({kind:'update',data:args.data});return detail}}};
  const helper=async(request,input)=>{
    calls.push({kind:'capture-start'});capture=input;
    if(repetido) return {contactoId:'contacto-ficticio',captacionId:'captacion-ficticia',registro:{id:'detalle-ficticio',token:'token-ficticio',estado:'FORMULARIO_COMPLETADO',pagoAltaUrl:'https://payment.invalid/original'},repetido:true};
    const registro=await input.persistir(tx,'contacto-ficticio');calls.push({kind:'capture-commit'});
    return {contactoId:'contacto-ficticio',captacionId:'captacion-ficticia',registro,repetido:false};
  };
  const module={exports:{}};
  const mocks={
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
    '@/lib/prisma':{...prisma,default:prisma},
    '@/lib/crm-captacion-web':{guardarCaptacionWeb:helper},
    '@/lib/payments':{initiatePayment:async input=>{calls.push({kind:'payment',input});return {paymentUrl:'https://payment.invalid/new',transactionId:'payment-ficticio'};}}
  };
  const context={module,exports:module.exports,require:name=>{assert.ok(mocks[name],`unexpected dependency ${name}`);return mocks[name];},process:{env:{}},URLSearchParams,console:{error(){},warn(){},log(){}},fetch:async(url,options)=>{calls.push({kind:'fetch',url,body:JSON.parse(options.body)});if(brevoFails)throw Error('Synthetic delivery failure');return {ok:true,status:201,json:async()=>({}),text:async()=>''};}};
  const js=ts.transpileModule(source(f),{fileName:f,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(js,context,{filename:f});
  const body={...base,metodoPago:method,tipoCliente:type};if(newsletter!==undefined)body.newsletter=newsletter;if(privacidad!==undefined)body.privacidad=privacidad;
  return {run:()=>module.exports.POST(new Request(`https://example.invalid/${f.replace(/^app\//,'').replace(/\/route.ts$/,'')}`,{method:'POST',headers:{'content-type':'application/json','idempotency-key':'synthetic-key'},body:JSON.stringify(body)})),calls,getCapture:()=>capture,getDetail:()=>detail};
}

(async()=>{
  for(const f of routeFiles) {
    for(const newsletter of [undefined,false,true,'true']) {
      const test=loadMocked(f,{newsletter});const response=await test.run();
      equal(response.status,f.includes('/altas/')?200:201,`${f}: success status`);
      equal(response.body.contactoId,'contacto-ficticio',`${f}: returns canonical identity`);
      equal(test.getCapture().newsletter,newsletter===true,`${f}: strict newsletter evidence`);
      equal(test.getCapture().privacidad,null,`${f}: unspecified privacy is null`);
      const firstExternal=test.calls.findIndex(c=>c.kind==='fetch'||c.kind==='payment');const commit=test.calls.findIndex(c=>c.kind==='capture-commit');
      ok(commit>=0&&firstExternal>commit,`${f}: committed before every external action`);
      const subscriptions=test.calls.filter(c=>c.kind==='fetch'&&c.url.endsWith('/contacts'));
      equal(subscriptions.length,newsletter===true?1:0,`${f}: no implicit marketing`);
      ok(test.calls.filter(c=>c.kind==='fetch').every(c=>c.url.startsWith('https://api.brevo.com/')),`${f}: only permitted messaging target`);
      const created=test.calls.filter(c=>c.kind==='detail');equal(created.length,1,`${f}: detail created exactly once in helper`);
      if(f.includes('/altas/')) {
        const summary=test.getCapture().datos;
        for(const secret of ['iban','dni','cif','nombreApoderado','dniApoderado','direccionFacturacion','direccionInstalacion','numeroPortar','observaciones']) ok(!(secret in summary),`alta: no duplicate ${secret}`);
        const payment=test.calls.filter(c=>c.kind==='payment');equal(payment.length,1,'alta: original card payment preserved');equal(payment[0].input.amount,25,'alta: original amount preserved');equal(response.body.pagoUrl,'https://payment.invalid/new','alta: new payment URL preserved');
        equal(created[0].data.iban,base.iban,'alta: IBAN stays in original detail');equal(created[0].data.dniApoderado,base.dniApoderado,'alta: representative stays in detail');
      }
    }
    for(const privacidad of [false,true,'true']) {
      const test=loadMocked(f,{privacidad});await test.run();equal(test.getCapture().privacidad,typeof privacidad==='boolean'?privacidad:null,`${f}: privacy evidence separate`);
    }
    const replay=loadMocked(f,{repetido:true,newsletter:true,privacidad:true});const response=await replay.run();
    equal(response.body.repetido,true,`${f}: replay indicator`);
    equal(response.body.contactoId,'contacto-ficticio',`${f}: replay identity`);
    equal(replay.calls.filter(c=>['fetch','payment','detail','update'].includes(c.kind)).length,0,`${f}: replay produces no duplicate writes or external actions`);
    if(f.includes('/altas/')) {equal(response.body.altaId,'detalle-ficticio','alta: original ID on replay');equal(response.body.token,'token-ficticio','alta: original token on replay');equal(response.body.pagoUrl,'https://payment.invalid/original','alta: original payment URL on replay');}
    const failure=loadMocked(f,{fail:true,newsletter:true});const failed=await failure.run();equal(failed.status,500,`${f}: persistence failure reported`);equal(failure.calls.filter(c=>['fetch','payment'].includes(c.kind)).length,0,`${f}: persistence failure cannot send`);
    const delivery=loadMocked(f,{brevoFails:true});const delivered=await delivery.run();equal(delivered.status,f.includes('/altas/')?200:201,`${f}: transactional delivery failure does not lose saved request`);
  }
  const sepa=loadMocked('app/api/altas/crear/route.ts',{method:'SEPA_DOMICILIACION',type:'PARTICULAR',newsletter:true});const r=await sepa.run();equal(r.status,200,'alta: original SEPA validation and response');equal(sepa.calls.filter(c=>c.kind==='payment').length,0,'alta: SEPA never starts immediate payment');equal(sepa.getCapture().segmentoCrm,'PARTICULAR','alta: particular segmentation');equal(sepa.calls.find(c=>c.kind==='fetch'&&c.url.endsWith('/contacts')).body.listIds[0],31,'alta: original particular newsletter list');
  console.log(`PASS: ${checks} isolated assertions; 19 syntax checks; 9 routes. No real database, messaging or payment access.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
