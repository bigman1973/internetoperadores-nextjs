import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import prisma from '../lib/prisma'
import {confirmManualCutoff, readCutoffAccounts} from '../lib/finanzas/bank-cutoffs-db'

async function main(){
 if(process.env.FINANCE_STAGING_SANDBOX!=='1'||process.env.FINANCE_CUTOFF_ROLLBACK_TEST!=='1')throw Error('ROLLBACK_OPT_IN_REQUIRED')
 const identity=await prisma.$queryRaw<Array<{db:string;u:string}>>`SELECT current_database() db,current_user u LIMIT 1`
 assert.equal(identity[0].db,'io_staging_finanzas');assert.equal(identity[0].u,'io_staging_finanzas')
 const account=(await readCutoffAccounts()).accounts.find(a=>a.activa)!
 assert.ok(account)
 const actor=await prisma.usuarioAdmin.findFirst({where:{activo:true,rol:'SUPER_ADMIN'},select:{id:true}})
 assert.ok(actor)
 const before=await prisma.corteCoberturaManualB3.count()
 const sentinel=new Error('MANDATORY_ROLLBACK')
 const original=prisma.$transaction.bind(prisma)
 try{await original(async tx=>{
  const sourceBefore=await tx.cuentaBancaria.findUnique({where:{id:account.id}})
  ;(prisma as any).$transaction=async(fn:any)=>fn(tx)
  const payload={cuentaId:account.id,fechaCorte:'2026-10-08',saldoCentimos:'-12345',motivo:'EXTRACTO_REVISADO_MANUALMENTE',nota:'Extracto sintético, prueba con rollback obligatorio.',confirmacion:true,idempotencyKey:randomUUID(),sourceVersion:account.sourceVersion}
  const first=await confirmManualCutoff(actor!.id,payload);assert.equal(first.idempotent,false);assert.equal(first.cutoff.saldoCentimos,'-12345')
  assert.equal((await confirmManualCutoff(actor!.id,payload)).idempotent,true)
  await assert.rejects(()=>confirmManualCutoff(actor!.id,{...payload,saldoCentimos:'1'}),(e:any)=>e.code==='IDEMPOTENCY_KEY_REUSED')
  await assert.rejects(()=>confirmManualCutoff(actor!.id,{...payload,idempotencyKey:randomUUID()}),(e:any)=>e.code==='SOURCE_VERSION_CONFLICT')
  await assert.rejects(()=>confirmManualCutoff(actor!.id,{...payload,idempotencyKey:randomUUID(),confirmacion:false}),(e:any)=>e.code==='CONFIRMACION_REQUERIDA')
  await tx.$executeRaw`SAVEPOINT immutable_test`
  await assert.rejects(()=>tx.corteCoberturaManualB3.update({where:{id:first.cutoff.id},data:{nota:'Cambio no permitido'}}))
  await tx.$executeRaw`ROLLBACK TO SAVEPOINT immutable_test`
  assert.deepEqual(await tx.cuentaBancaria.findUnique({where:{id:account.id}}),sourceBefore)
  throw sentinel
 },{timeout:45000})}catch(e){if(e!==sentinel)throw e}finally{(prisma as any).$transaction=original}
 assert.equal(await prisma.corteCoberturaManualB3.count(),before)
 console.log('Cortes: confirmación, idempotencia, conflicto de fuente, inmutabilidad y cuenta original intacta; rollback total.')
}
main().catch(e=>{console.error('CUTOFF_ROLLBACK_FAILED',e.code??e.name);process.exitCode=1}).finally(()=>prisma.$disconnect())
