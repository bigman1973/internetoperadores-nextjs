import 'dotenv/config'
import assert from 'node:assert/strict'
import {randomUUID} from 'crypto'
import {Prisma} from '@prisma/client'
import prisma from '../lib/prisma'
import {confirmSupport,revokeSupport,readConfirmingCandidates,ConfirmingSupportError} from '../lib/finanzas/confirming-draxton-db'
import {hashFuenteConfirmingDraxton} from '../lib/finanzas/confirming-draxton-core'
const ROLLBACK=new Error('C9_ROLLBACK_ONLY')
async function reject(code:string,work:()=>Promise<unknown>){await assert.rejects(work,e=>e instanceof ConfirmingSupportError&&e.code===code)}
async function main(){assert.equal(process.env.FINANCE_C9_ROLLBACK_TEST,'1');assert.equal(process.env.FINANCE_STAGING_SANDBOX,'1');const identity=await prisma.$queryRaw<any[]>`SELECT current_database() AS db,current_user AS usuario`;assert.equal(identity[0].db,'io_staging_finanzas');assert.equal(identity[0].usuario,'io_staging_finanzas');const names=['facturaRecibida','facturaEmitida','movimientoBancario','vinculoMovimientoDocumento','soporteConfirmingDraxton','auditoriaSoporteConfirmingDraxton','auditoriaClasificacionConfirmingDraxton'] as const;const baseline=await Promise.all(names.map(n=>(prisma as any)[n].count()));const original=prisma.$transaction.bind(prisma);let completed=false;try{await original(async tx=>{
 const actor=await tx.usuarioAdmin.create({data:{email:`c9-${randomUUID()}@example.invalid`,nombre:'Fixture C9 rollback',passwordHash:'FIXTURE_NO_LOGIN',rol:'SUPER_ADMIN'}});const account=await tx.cuentaBancaria.findFirst({select:{id:true}});assert(account);
 const movement=await tx.movimientoBancario.create({data:{cuentaId:account.id,fechaOperacion:new Date('2026-10-22'),fechaValor:new Date('2026-10-22'),concepto:'FIXTURE C9 abono (rollback)',importe:123.45,hashUnico:randomUUID()}});
 const source=await tx.facturaRecibida.create({data:{proveedor:'FIXTURE soporte cliente',fecha:new Date('2026-10-22'),base:100,importeIva:21,total:121,carpetaOrigen:'3. Confirming Draxton 2026',oneDriveItemId:'C9_FAKE_ITEM_'+randomUUID(),oneDriveDriveId:'C9_FAKE_DRIVE_'+randomUUID(),archivoOneDrive:'3. Confirming Draxton 2026/fixture.pdf'}});
 const input={action:'confirmar',facturaRecibidaId:source.id,movimientoId:movement.id,versionDocumento:1,fuenteHash:hashFuenteConfirmingDraxton({facturaRecibidaId:source.id,oneDriveItemId:source.oneDriveItemId,oneDriveDriveId:source.oneDriveDriveId,carpetaOrigen:source.carpetaOrigen,archivoOneDrive:source.archivoOneDrive,oneDriveRutaActual:source.oneDriveRutaActual}),idempotencyKey:randomUUID(),confirmar:true};
 const beforeLinks=await tx.vinculoMovimientoDocumento.count();const beforeIssued=await tx.facturaEmitida.count();
 (prisma as any).$transaction=async(work:any)=>work(tx);
 try{
 const read=await readConfirmingCandidates(movement.id);assert(read.candidatas.some(c=>c.id===source.id));assert.equal(await tx.soporteConfirmingDraxton.count({where:{movimientoId:movement.id}}),0);
 await reject('FUENTE_CONFIRMING_CAMBIADA',()=>confirmSupport(actor.id,{...input,fuenteHash:'0'.repeat(64)}));
 const result=await confirmSupport(actor.id,input);assert.equal(result.idempotente,false);const replay=await confirmSupport(actor.id,input);assert.equal(replay.idempotente,true);
 await reject('IDEMPOTENCY_PAYLOAD_MISMATCH',()=>confirmSupport(actor.id,{...input,fuenteHash:'1'.repeat(64)}));await reject('FUENTE_CONFIRMING_CAMBIADA',()=>confirmSupport(actor.id,{...input,idempotencyKey:randomUUID()}));
 const after=await tx.movimientoBancario.findUnique({where:{id:movement.id}});assert.deepEqual(after,movement);assert.equal(await tx.vinculoMovimientoDocumento.count(),beforeLinks);assert.equal(await tx.facturaEmitida.count(),beforeIssued);
 const classified=await tx.facturaRecibida.findUnique({where:{id:source.id}});assert.equal(classified?.naturalezaDocumento,'SOPORTE_CONFIRMING_CLIENTE');assert.equal(classified?.total,source.total);assert.equal(classified?.importeIva,source.importeIva);assert.equal(classified?.fecha.getTime(),source.fecha.getTime());
 const support=await tx.soporteConfirmingDraxton.findUnique({where:{facturaRecibidaId_movimientoId:{facturaRecibidaId:source.id,movimientoId:movement.id}}});assert(support);
 await tx.$executeRawUnsafe('SAVEPOINT audit_immutable');let blocked=false;try{await tx.auditoriaSoporteConfirmingDraxton.deleteMany({where:{soporteId:support.id}})}catch{blocked=true;await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT audit_immutable')}assert(blocked);await tx.$executeRawUnsafe('RELEASE SAVEPOINT audit_immutable');
 const revoke={action:'revocar',soporteId:support.id,version:1,idempotencyKey:randomUUID(),motivo:'Prueba sintética de revocación auditable'};await revokeSupport(actor.id,revoke);assert.equal((await revokeSupport(actor.id,revoke)).idempotente,true);assert.equal((await tx.soporteConfirmingDraxton.findUnique({where:{id:support.id}}))?.estado,'REVOCADO');assert.equal(await tx.auditoriaSoporteConfirmingDraxton.count({where:{soporteId:support.id}}),2);
 completed=true;
 }finally{(prisma as any).$transaction=original}
 throw ROLLBACK
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000})}catch(error){if(error!==ROLLBACK)throw error}finally{(prisma as any).$transaction=original}
 assert(completed);assert.deepEqual(await Promise.all(names.map(n=>(prisma as any)[n].count())),baseline);console.log('C9: servicio, lectura sin escritura, huella, replay, versiones, soporte no monetario, auditoría y revocación correctos; rollback total')}
main().catch(e=>{console.error('Test C9 incompleto:',(e as any)?.code||e.name);process.exitCode=1}).finally(()=>prisma.$disconnect())
