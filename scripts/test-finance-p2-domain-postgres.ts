import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { prisma } from '../lib/prisma'
import { createPrismaOneDriveDomain } from '../lib/finanzas/sync-jobs/providers/onedrive/prisma-domain'

async function main(){
  assert.equal(process.env.FINANCE_P2_ROLLBACK_TEST,'1')
  const [db]=await prisma.$queryRaw<Array<{db:string;usuario:string}>>`SELECT current_database() db,current_user usuario LIMIT 1`
  assert.equal(db.db,'io_staging_finanzas');assert.equal(db.usuario,'io_staging_finanzas')
  const sentinel=new Error('ROLLBACK_P2_DOMAIN')
  const counts=async()=>Promise.all([prisma.facturaRecibida.count(),prisma.documentoConciliable.count(),prisma.revisionLecturaFacturaRecibida.count(),prisma.vinculoMovimientoDocumento.count()])
  const before=await counts()
  const tag=`P2-FIXTURE-${randomUUID()}`
  try{
    await prisma.$transaction(async tx=>{
      const actor=await tx.usuarioAdmin.create({data:{nombre:tag,email:`${tag}@example.invalid`,passwordHash:'TEST-NONLOGIN',rol:'SUPER_ADMIN',activo:true}})
      const domain=createPrismaOneDriveDomain(prisma)
      const location={carpetaOrigen:'4. Trimestre 1 2026',oneDriveDriveId:'p2-test-only',oneDriveRutaActual:`test:${tag}`,archivoOneDrive:`test:${tag}`,estadoCarpeta:'CONTABILIZADA',etiquetaMateriales:false}
      await domain.lockSource(tx,tag)
      await domain.createInvoice(tx,{
        itemId:tag,identity:`CIF:TEST${tag}|NUM:TEST`,location,
        ocr:{proveedor:'Proveedor sintético',cif:'TEST1234',numFactura:tag,fecha:'2026-01-01',base:100,tipoIva:21,importeIva:21,tipoIrpf:0,importeIrpf:0,total:121,confianza:99},
        ocrRaw:JSON.stringify({fixture:true}),dedupe:{canonicalId:null,conflict:false},
      },actor.id)
      const invoice=await tx.facturaRecibida.findUniqueOrThrow({where:{oneDriveItemId:tag}})
      assert.equal(invoice.total,121)
      assert.equal(await tx.documentoConciliable.count({where:{facturaRecibidaId:invoice.id}}),1)
      const source=await domain.lockSource(tx,tag)
      assert(source)
      assert.equal(await domain.updateLocation(tx,source,{...location,carpetaOrigen:'5. Trimestre 2 2026'},actor.id),true)
      assert.equal((await tx.facturaRecibida.findUniqueOrThrow({where:{id:invoice.id}})).total,121)
      await domain.createReview(tx,{itemId:tag+'-review',location,ocr:{},ocrRaw:JSON.stringify({fixture:true}),reason:'OCR_INVALIDO'},actor.id)
      assert.equal(await tx.revisionLecturaFacturaRecibida.count({where:{oneDriveItemId:tag+'-review'}}),1)
      assert.equal(await tx.vinculoMovimientoDocumento.count(),before[3])
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      throw sentinel
    },{timeout:60000})
  }catch(e){if(e!==sentinel)throw e}
  assert.deepEqual(await counts(),before)
  console.log('P2 dominio OneDrive SQL: alta, referencia sin banco, ubicación, cuarentena y rollback correctos.')
}
main().catch(()=>{console.error('P2_DOMAIN_ROLLBACK_FAILED');process.exitCode=1}).finally(()=>prisma.$disconnect())
