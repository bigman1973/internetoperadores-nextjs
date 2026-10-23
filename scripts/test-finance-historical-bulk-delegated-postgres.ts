import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync,writeFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { confirmHistoricalBulkTx,undoHistoricalBulkTx,readHistoricalBulkPreviewTx } from '../lib/finanzas/historical-bulk-db'
import {sha256Canonical} from '../lib/finanzas/historical-b4-core'
import { B4ServiceError } from '../lib/finanzas/reconciliation-db'
const marker='HB-DELEGATED-ROLLBACK-'+randomUUID();const delegation={ejecutor:'Manus',instruccionDe:'Víctor Giró',fechaInstruccion:'2026-10-23',modo:'EJECUCION_DELEGADA_EXPLICITA',referenciaAutorizacion:'test-delegado-sintetico-staging-20261023'}
class Rollback extends Error{}
const tables=['movimientos_bancarios','facturas_recibidas','facturas_emitidas','documentos_conciliables','estado_justificacion_movimientos','vinculos_movimiento_documento','operaciones_justificacion_b4','eventos_justificacion_b4','legado_conciliacion_b4','recibos_eleccion_centro_b8','auditorias_centro_coste_finanzas_b8']
async function snapshot(){const out:any={};for(const table of tables){const found=await prisma.$queryRaw<any[]>`SELECT to_regclass(${table})::text AS name LIMIT 1`;if(!found[0].name)continue;out[table]=(await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS hash FROM "${table}" t`))[0]}return out}
async function main(){
 process.env.NEXTAUTH_SECRET='HISTORICAL-ROLLBACK-SYNTHETIC-SECRET-NOT-FOR-DEPLOY';
 const u=new URL(process.env.DATABASE_URL||'');assert.equal(u.pathname,'/io_staging_finanzas');assert.equal(process.env.FINANCE_STAGING_SANDBOX,'1')
 const identity=(await prisma.$queryRaw<any[]>`SELECT current_database() AS db,current_user AS role LIMIT 1`)[0];assert.deepEqual(identity,{db:'io_staging_finanzas',role:'io_staging_finanzas'})
 const actor=Number(readFileSync(process.env.FINANCE_HISTORICAL_B4_ACTOR_FILE!,'utf8').trim());const before=await snapshot();let finished=false
 try{await prisma.$transaction(async(base)=>{const tx=base as any
  const account=await tx.cuentaBancaria.findFirst({select:{id:true}});assert(account)
  const date=new Date('2042-01-01T00:00:00Z'),bank=new Date('2042-01-02T00:00:00Z')
  async function fixture(total:number,parts=[total]){
   const movementId=randomUUID();await tx.movimientoBancario.create({data:{id:movementId,cuentaId:account.id,fechaOperacion:bank,fechaValor:bank,concepto:marker,importe:-total,hashUnico:marker+randomUUID()}})
   const documents=[];let first:any
   for(const part of parts){const id=randomUUID(),num=marker+'-'+randomUUID();const source=await tx.facturaRecibida.create({data:{id,proveedor:'Proveedor sintético',numFactura:num,fecha:date,base:part,total:part,tipoIva:0,importeIva:0,tipoIrpf:0,importeIrpf:0,calidad:'VALIDA',estado:'PENDIENTE_REVISION',oneDriveDriveId:'drive-sintetico-controlado',oneDriveItemId:'item-sintetico-'+randomUUID()}});first??=source;documents.push({tipo:'FACTURA_RECIBIDA',sourceId:id,referencia:'Factura recibida '+num,importeObjetivoCentimos:-part*100,documentoConciliableId:null,archivoDisponible:true,stale:true})}
   const snapshotLegacy={movimiento:{fecha_operacion:bank.toISOString(),importe:-total},facturaRecibida:{fecha:date.toISOString(),num_factura:first.numFactura}};const sourceHash=sha256Canonical({algorithm:'SHA-256',version:1,snapshotLegacy,importeBancoExactoTexto:String(-total)});
   const historicalId=randomUUID();await tx.legadoConciliacionB4.create({data:{movimientoId:movementId,id:historicalId,lote:marker,clasificacion:'PROPUESTA',procedencia:'DESCONOCIDO',motivos:['PROCEDENCIA_DESCONOCIDA'],documentos:documents,snapshotLegacy,sourceHash,importeBancoCentimos:-total*100,creadoPorId:actor}})
   return {movementId,historicalId,source:first}
  }
  const a=await fixture(100),b=await fixture(75)
  const beforeRead={documents:await tx.documentoConciliable.count(),operations:await tx.operacionJustificacionB4.count()}
  const preview=await readHistoricalBulkPreviewTx(tx,{q:marker},actor);assert.equal(preview.totalExactas,2);assert.equal(preview.items.length,2)
  assert.equal(await tx.documentoConciliable.count(),beforeRead.documents);assert.equal(await tx.operacionJustificacionB4.count(),beforeRead.operations)
  const request={action:'confirmar_exactas',confirmacion:true,idempotencyKey:randomUUID(),previewToken:preview.previewToken,items:preview.items.map(({historicoId,movimientoId,fingerprint})=>({historicoId,movimientoId,fingerprint}))}
  await tx.$executeRawUnsafe('SAVEPOINT invalid_selection')
  await assert.rejects(()=>confirmHistoricalBulkTx(tx,actor,{...request,items:request.items.map((item,index)=>index?{...item,fingerprint:'f'.repeat(64)}:item)}),(e:any)=>e instanceof B4ServiceError&&['HISTORICAL_SELECTION_CHANGED','HISTORICAL_PREVIEW_EXPIRED'].includes(e.code))
  assert.equal(await tx.operacionJustificacionB4.count(),beforeRead.operations);assert.equal(await tx.documentoConciliable.count(),beforeRead.documents)
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT invalid_selection')
  await tx.$executeRawUnsafe('SAVEPOINT failure_mid_batch')
  await tx.$executeRawUnsafe(`CREATE FUNCTION pg_temp.hb_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.movimiento_id='${[a.movementId,b.movementId].sort()[1]}' AND NEW.detalle->>'bulkKind'='CONFIRMACION' THEN RAISE EXCEPTION 'SYNTHETIC_BATCH_FAIL' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$`)
  await tx.$executeRawUnsafe('CREATE TRIGGER hb_synthetic_fail BEFORE INSERT ON eventos_justificacion_b4 FOR EACH ROW EXECUTE FUNCTION pg_temp.hb_fail_second()')
  await assert.rejects(()=>confirmHistoricalBulkTx(tx,actor,request,delegation))
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT failure_mid_batch')
  assert.equal(await tx.operacionJustificacionB4.count(),beforeRead.operations);assert.equal(await tx.documentoConciliable.count(),beforeRead.documents)
  const applied=await confirmHistoricalBulkTx(tx,actor,request,delegation);assert.equal(applied.confirmadas,2);assert.equal(applied.idempotente,false)
  assert.equal((await confirmHistoricalBulkTx(tx,actor,request,delegation)).idempotente,true)
  const ids=[a.movementId,b.movementId]
  assert.equal(await tx.estadoJustificacionMovimientoB4.count({where:{movimientoId:{in:ids},estado:'JUSTIFICADO'}}),2)
  const audits=await tx.eventoJustificacionB4.findMany({where:{movimientoId:{in:ids},actorId:actor}});assert.equal(audits.length,8);assert(audits.every((e:any)=>e.createdAt instanceof Date));assert.equal(audits.filter((e:any)=>e.detalle.bulkKind==='CONFIRMACION').length,2);assert(audits.filter((e:any)=>e.detalle.bulkKind==='CONFIRMACION').every((e:any)=>e.detalle.ejecutor==='Manus'&&e.detalle.instruccionDe==='Víctor Giró'&&e.detalle.fechaInstruccion==='2026-10-23'&&e.detalle.referenciaAutorizacion===delegation.referenciaAutorizacion))
  assert.equal(await tx.legadoConciliacionB4.count({where:{movimientoId:{in:ids},clasificacion:'PROPUESTA'}}),2)
  await tx.$executeRawUnsafe('SAVEPOINT idempotency_conflict')
  await assert.rejects(()=>confirmHistoricalBulkTx(tx,actor,{...request,items:request.items.slice(0,1)}),(e:any)=>e instanceof B4ServiceError&&e.code==='IDEMPOTENCY_PAYLOAD_MISMATCH')
  await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT idempotency_conflict')
  const undo={action:'deshacer_bloque',confirmacion:true,idempotencyKey:randomUUID(),bloqueId:applied.bloqueId}
  assert.equal((await undoHistoricalBulkTx(tx,actor,undo)).revertidas,2)
  assert.equal((await undoHistoricalBulkTx(tx,actor,undo)).idempotente,true)
  assert.equal(await tx.estadoJustificacionMovimientoB4.count({where:{movimientoId:{in:ids},estado:'SIN_DOCUMENTO',version:3}}),2)
  assert.equal(await tx.vinculoMovimientoDocumento.count({where:{movimientoId:{in:ids},activo:true}}),0)
  const replay=await confirmHistoricalBulkTx(tx,actor,request,delegation);assert.equal(replay.idempotente,true);assert.equal((replay as any).revertidas,2)
  const legacyMovements=await tx.movimientoBancario.findMany({where:{id:{in:ids}},select:{conciliado:true,facturaId:true}});assert(legacyMovements.every((m:any)=>!m.conciliado&&m.facturaId===null))
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');finished=true;throw new Rollback()
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:180000,maxWait:10000})}catch(e){if(!(e instanceof Rollback))throw e}
 assert(finished);assert.deepEqual(await snapshot(),before)
 const receipt={passed:true,rollback:true,previewSinDml:true,atomicidad:true,auditoriaB4ActorFecha:true,idempotencia:true,reversionCompleta:true,legacySinCambios:true,registrosSinteticosPersistidos:0,at:new Date().toISOString()}
 writeFileSync('/home/ubuntu/finanzas-confirmacion-20261023/rollback-delegado-staging-verificado.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt))
}
main().catch(e=>{console.error('HISTORICAL_BULK_ROLLBACK_FAILED',e instanceof Error?e.message.slice(0,250):'');process.exitCode=1}).finally(()=>prisma.$disconnect())
