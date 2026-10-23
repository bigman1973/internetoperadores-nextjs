import {PrismaClient,Prisma} from '@prisma/client'
import {createIspIssuedInvoiceProvider} from '../lib/finanzas/sync-jobs/providers/isp/isp-issued-invoice-provider'
import fs from 'node:fs'
const p=new PrismaClient()
async function main(){
 const provider=createIspIssuedInvoiceProvider({request:async()=>[],allowExistingIdentityLink:false})
 const result:Record<string,number>={checked:0,SIN_CAMBIOS:0,ACTUALIZADA:0,REVISAR:0,ERROR:0,plannedMetadataWrites:0}
 await p.$transaction(async tx=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`
  for(let offset=0;offset<1000;offset+=250){
   const items=await tx.$queryRaw<Array<{key:string,data:any}>>`SELECT source_key AS key,source_data AS data FROM finance_sync_items_p2 WHERE job_id='f38c67de-200c-4615-a20c-ce2e282b12ac'::uuid AND confirmed_at IS NOT NULL ORDER BY sequence LIMIT 250 OFFSET ${offset}`
   if(!items.length)break
   const ids=items.map(i=>i.data.id).filter(Number.isInteger)
   const facturas=await tx.factura.findMany({where:{ispGestionId:{in:ids}},include:{facturaEmitidaB4:true}})
   const fi=await tx.facturaEmitida.findMany({where:{idExterno:{in:ids.map(String)}}})
   const readOnlyMock:any={
    factura:{findUnique:async({where}:any)=>facturas.find(f=>f.ispGestionId===where.ispGestionId),update:async()=>{result.plannedMetadataWrites++;return {}}},
    facturaEmitida:{findUnique:async({where}:any)=>fi.find(f=>f.idExterno===where.idExterno),update:async()=>{throw Error('UNEXPECTED_FI_MUTATION')},create:async()=>{throw Error('UNEXPECTED_FI_CREATE')}},
    identidadFacturaISPEventoB7:{create:async()=>{throw Error('UNEXPECTED_IDENTITY_LINK')}},
    documentoConciliable:{create:async()=>{throw Error('UNEXPECTED_CATALOGUE_CREATE')}}
   }
   for(const i of items){const item:any={key:i.key,tipo:'ISP_FACTURA',data:i.data};const prepared=await provider.prepare(item);const outcome=await provider.apply(readOnlyMock,item,prepared,3);result.checked++;result[outcome]=(result[outcome]||0)+1}
  }
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:45000})
 if(result.checked!==401||result.REVISAR||result.ERROR)throw Error('ISP_INCIDENT_SOURCE_STILL_REJECTED')
 console.log('ISP: comprobación sólo lectura',result)
 fs.writeFileSync('/home/ubuntu/finanzas-incidente-20261023/isp-401-corregidas-verificado.json',JSON.stringify(result)+'\n')
}
main().catch(()=>{console.error('ISP_READONLY_CHECK_FAILED');process.exitCode=1}).finally(()=>p.$disconnect())
