#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAutomationEnabled, madridDate, accreditedContractCodes, remoteSyncPayload, synchronizeRentabilidad, runRentabilidadDaily } from '../lib/rentabilidad/automation';
import { shiftMonth } from '../lib/rentabilidad/engine';
import { RentabilidadError, sourceHash, type ImportPayload, type ImportReport } from '../lib/rentabilidad/types';
const env={DATABASE_URL:'postgresql://io_staging_finanzas:unit_test_only@localhost/io_staging_finanzas',FINANCE_STAGING_SANDBOX:'1',VERCEL_ENV:'preview',RENTABILIDAD_ENABLED:'1'};
test('automatización solo con interruptor y base aislada de staging',()=>assert.doesNotThrow(()=>assertAutomationEnabled(env)));
test('interruptor apagado bloquea antes de cualquier proveedor',()=>assert.throws(()=>assertAutomationEnabled({...env,RENTABILIDAD_ENABLED:'0'}),/RENTABILIDAD_DISABLED/));
test('producción denegada aunque el interruptor esté activo',()=>assert.throws(()=>assertAutomationEnabled({...env,VERCEL_ENV:'production'}),/RENTABILIDAD_STAGING_REQUIRED/));
test('base o usuario incorrectos se deniegan',()=>assert.throws(()=>assertAutomationEnabled({...env,DATABASE_URL:'postgresql://other:unit_test_only@localhost/other'}),/RENTABILIDAD_STAGING_REQUIRED/));
test('entorno de solo lectura impide ejecuciones derivadas',()=>assert.throws(()=>assertAutomationEnabled({...env,IO_PRODUCTION_READ_ONLY:'1'}),/RENTABILIDAD_STAGING_REQUIRED/));
test('día 5 se determina en Madrid, no UTC, en invierno',()=>assert.deepEqual(madridDate(new Date('2026-11-04T23:30:00Z')),{month:'2026-11',day:5}));
test('día 5 se determina en Madrid con horario de verano',()=>assert.deepEqual(madridDate(new Date('2026-07-04T22:30:00Z')),{month:'2026-07',day:5}));
test('enero cierra diciembre del ejercicio anterior',()=>assert.equal(shiftMonth(madridDate(new Date('2027-01-05T03:00:00Z')).month,-1),'2026-12'));

const contractEnv={...env,RENTABILIDAD_SYNC_APPROVED:'1',RENTABILIDAD_ISP_ADVANCED_REACCREDITED:'1',ISPGESTION_API_URL:'https://isp.fixture.invalid/api',ISPGESTION_API_USER:'synthetic',ISPGESTION_API_HASH:'synthetic'};
const lineEnv={...env,RENTABILIDAD_SYNC_APPROVED:'1',RENTABILIDAD_EXPORT_ENABLED:'1',RENTABILIDAD_EXPORT_URL:'https://export.fixture.invalid/lines',RENTABILIDAD_EXPORT_ALLOWED_HOST:'export.fixture.invalid',RENTABILIDAD_EXPORT_TOKEN:'synthetic'};
function reportFor(payload:ImportPayload):ImportReport {const n=(payload.lines?.length??0)+(payload.contracts?.length??0);return {leidas:n,insertadas:n,actualizadas:0,sinCambios:0,rechazadas:0,errores:[],sourceHash:sourceHash(payload),byCollection:{}};}
const emptyInputs={contracts:[],lines:[],costs:[],rules:[],products:[],runs:[],decisions:[],references:[]};
test('payload remoto jamás reintroduce Lorena, costes, referencias, catálogo o reglas por omisión',()=>{
 const payload=remoteSyncPayload({source:'REMOTE',lines:[{concepto:'synthetic'}],contracts:[{codigoContratoIsp:'0007'}],products:[{key:'evil'}],rules:[{key:'evil'}],references:[{key:'evil'}],costs:[{key:'evil'}]});
 for(const key of ['costs','references','products','rules'] as const)assert.deepEqual(payload[key],[]);
 assert.equal(payload.contracts?.length,1);assert.equal(payload.lines?.length,1);
});
test('mapping contractual conserva ceros y rechaza colisiones sin inferir un código a partir de id',()=>{
 assert.equal(accreditedContractCodes([{ispGestionContratoId:7,codigoContratoIsp:'7'}]).size,0);
 assert.deepEqual([...accreditedContractCodes([{codigoContratoIsp:'0007',ispGestionContratoId:7,ispIdentityVerified:true},{codigoContratoIsp:'8'}])],[['7','0007']]);
 for(const contracts of [[{ispGestionContratoId:7,ispIdentityVerified:true}], [{ispGestionContratoId:7,ispIdentityVerified:true,codigoContratoIsp:'7'},{ispGestionContratoId:7,ispIdentityVerified:true,codigoContratoIsp:'0007'}], [{ispGestionContratoId:7,ispIdentityVerified:true,codigoContratoIsp:'7'},{ispGestionContratoId:8,ispIdentityVerified:true,codigoContratoIsp:'7'}]])assert.throws(()=>accreditedContractCodes(contracts),/IDENTITY_CONFLICT/);
});
test('aprobación explícita precede cualquier lectura y bloqueos reales registran cero filas',async()=>{
 let reads=0;const runs:any[]=[];
 const dependencies={env:lineEnv,lines:async()=>{reads++;throw Error('must not read')},append:async(row:any)=>{runs.push(row);return {} as any}};
 const blocked=await synchronizeRentabilidad(1,{...dependencies,env:{...lineEnv,RENTABILIDAD_SYNC_APPROVED:'0'}});
 assert.ok('reason' in blocked);
 assert.equal(blocked.reason,'SYNC_EXPLICIT_APPROVAL_REQUIRED');assert.equal(reads,0);
 const unavailable=await synchronizeRentabilidad(1,{...dependencies,env:{...env,RENTABILIDAD_SYNC_APPROVED:'1'}});
 assert.equal(unavailable.estado,'BLOQUEADO');assert.equal(unavailable.rows,0);assert.equal(reads,0);assert.equal(runs.length,2);
});
test('contratos fallidos no ocultan líneas verificadas, importación es sólo analítica y parcial',async()=>{
 const runs:any[]=[],payloads:ImportPayload[]=[];
 const exported={payload:{source:'LISTADO299_REMOTE_EXPORT',lines:[{codigoContratoIsp:'0007',concepto:'synthetic'}]},sourceHash:'synthetic',missingFields:['SERVICE_PERIOD_UNVERIFIED']};
 const result=await synchronizeRentabilidad(1,{env:{...contractEnv,...lineEnv},readInputs:async()=>emptyInputs,contracts:async()=>{throw new RentabilidadError('ISP_ACCESS_FORBIDDEN',503)},lines:async()=>exported,importPayload:async(payload)=>{payloads.push(payload);return reportFor(payload)},append:async(row)=>{runs.push(row);return {} as any}});
 assert.equal(result.estado,'PARCIAL');assert.equal(result.rows,1);
 assert.equal(result.availability.sources.contracts.reason,'ISP_ACCESS_FORBIDDEN');assert.equal(result.availability.sources.lines.estado,'DISPONIBLE');
 for(const key of ['costs','references','products','rules'] as const)assert.deepEqual(payloads[0][key],[]);
 assert.equal(payloads[0].contracts?.length,0);assert.equal(runs.length,1);
});
test('sólo contratos acreditados pueden actualizarse cuando faltan líneas/proveedor/periodicidad',async()=>{
 const payloads:ImportPayload[]=[];
 const result=await synchronizeRentabilidad(1,{env:contractEnv,readInputs:async()=>({...emptyInputs,contracts:[{codigoContratoIsp:'0007',ispGestionContratoId:7,ispIdentityVerified:true}]}),contracts:async(codes)=>{assert.equal(codes.get('7'),'0007');return {source:'ISP_READ',contracts:[{codigoContratoIsp:'0007',source:'ISP_READ',precioPeriodo:'5.5372'}]}},importPayload:async(payload)=>{payloads.push(payload);return reportFor(payload)},append:async()=>({}) as any});
 assert.equal(result.estado,'PARCIAL');assert.equal(result.availability.sources.lines.estado,'BLOQUEADO');
 assert.ok('missingFields' in result && result.missingFields.includes('CONTRACT_PERIODICITY_NOT_SUPPLIED'));
 assert.ok('missingFields' in result && result.missingFields.includes('CONTRACT_PROVIDER_NOT_SUPPLIED'));
 assert.equal(payloads[0].contracts![0].precioPeriodo,'5.5372');assert.deepEqual(payloads[0].rules,[]);
});
test('errores no acreditados ni respuestas sensibles escapan a historial',async()=>{
 let imports=0;const runs:any[]=[];
 const result=await synchronizeRentabilidad(1,{env:lineEnv,lines:async()=>{throw Error('Sensitive upstream message must never be recorded')},importPayload:async(payload)=>{imports++;return reportFor(payload)},append:async(row)=>{runs.push(row);return {} as any}});
 assert.equal(result.estado,'ERROR');assert.equal(imports,0);assert.equal(result.availability.sources.lines.reason,'ISP_SOURCE_READ_FAILED');
 assert.ok(!JSON.stringify(runs).includes('Sensitive'));
});
function dailyHarness(ispEstado='BLOQUEADO',pending=false){
 const runs:any[]=[],months:string[]=[],calls:string[]=[];
 const rebuild=async(month:string,_actor:number,mode?:string)=>{months.push(month);calls.push(mode??'PROYECCION');return {summary:{month:{pending}},alerts:[],controls:{sourceHash:'synthetic'},snapshot:{version:1,month,mode:mode??'PROYECCION'}} as any};
 return {runs,months,calls,dependencies:{env:{...env,RENTABILIDAD_SCHEDULER:'MANUS_SCHEDULE'},sync:async()=>({estado:ispEstado,rows:0}) as any,external:async()=>({proposed:0}),rebuild,append:async(row:any)=>{runs.push(row);return {} as any}}};
}
test('diario conserva actual/anterior/cierre día 5 Madrid y registra parcial incluso si informes terminan',async()=>{
 const h=dailyHarness();const result=await runRentabilidadDaily(1,new Date('2026-11-04T23:30:00Z'),h.dependencies);
 assert.equal(result.scheduler,'MANUS_SCHEDULE');assert.equal(result.estado,'PARCIAL');assert.equal(result.notifications,'PANEL_ONLY');
 assert.deepEqual(h.months,['2026-11','2026-10','2026-10']);assert.deepEqual(h.calls,['PROYECCION','PROYECCION','CIERRE']);
 assert.equal(h.runs[0].process,'DAILY_START');assert.equal(h.runs.at(-1).process,'DAILY_END');assert.equal(h.runs.at(-1).estado,'PARCIAL');assert.equal(h.runs.at(-1).closed,true);
});
test('diario sin cierre fuera de día 5, sin scheduler inventado y pending sigue provisional',async()=>{
 const h=dailyHarness('COMPLETADO',true);h.dependencies.env.RENTABILIDAD_SCHEDULER='UNVERIFIED';
 const result=await runRentabilidadDaily(1,new Date('2026-11-06T03:00:00Z'),h.dependencies);
 assert.equal(result.scheduler,'MANUAL_ONLY');assert.equal(result.close,null);assert.equal(result.estado,'PROVISIONAL');assert.equal(h.calls.length,2);
});
test('diario registra DAILY_END ERROR sanitizado tras fallo sin tocar fuentes',async()=>{
 const h=dailyHarness();h.dependencies.rebuild=async()=>{throw Error('Sensitive DB detail')};
 await assert.rejects(()=>runRentabilidadDaily(1,new Date('2026-11-06T03:00:00Z'),h.dependencies));
 assert.equal(h.runs.at(-1).process,'DAILY_END');assert.equal(h.runs.at(-1).estado,'ERROR');assert.equal(h.runs.at(-1).reason,'RENTABILIDAD_DAILY_FAILED');assert.ok(!JSON.stringify(h.runs).includes('Sensitive'));
});
