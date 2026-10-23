import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { readHistoricalBulkMaterialTx } from '../lib/finanzas/historical-bulk-db'
import { exactHistoricalPopulation } from '../lib/finanzas/historical-bulk-core'
import { readSelectedRows,planRow } from './backfill-historical-b4'
async function main(){
 const production=process.argv.includes('--production-virtual')
 const expected=production?{db:'railway',role:'postgres'}:{db:'io_staging_finanzas',role:'io_staging_finanzas'}
 const url=new URL(process.env.DATABASE_URL||'')
 if(url.pathname!=='/'+expected.db||decodeURIComponent(url.username)!==expected.role)throw Error('COUNT_TARGET_MISMATCH')
 if(production&&(process.env.VERCEL_ENV!=='production'||process.env.FINANCE_AUTOMATIC_LINKS_DISABLED!=='1'))throw Error('COUNT_PRODUCTION_GUARD')
 const result=await prisma.$transaction(async(tx)=>{
  await tx.$executeRaw`SET TRANSACTION READ ONLY`
  const identity=(await tx.$queryRaw<Array<{db:string;role:string}>>`SELECT current_database() AS db,current_user AS role LIMIT 1`)[0]
  if(identity.db!==expected.db||identity.role!==expected.role)throw Error('COUNT_IDENTITY_MISMATCH')
  let virtual:any[]|undefined
  if(production){
   const source=await readSelectedRows({query:async(sql:string)=>({rows:await tx.$queryRawUnsafe<any[]>(sql),rowCount:null})} as any)
   virtual=source.map(planRow).map(plan=>({id:randomUUID(),movimiento_id:plan.movimientoId,clasificacion:plan.clasificacion,documentos:plan.documentos,source_hash:plan.sourceHash,importe_banco_centimos:plan.importeBancoCentimos,snapshot_legacy:JSON.parse(plan.snapshotLegacyText),lote:'VIRTUAL_READ_ONLY'}))
  }
  const rows=await readHistoricalBulkMaterialTx(tx,virtual),population=exactHistoricalPopulation(rows)
  return {target:production?'production':'staging',readOnly:true,propuestas:rows.length,exactas:population.items.length,...population.excluidasPorMotivo && {excluidasPorMotivo:population.excluidasPorMotivo},totalCargosCentimos:population.totalCargosCentimos,totalCobrosCentimos:population.totalCobrosCentimos,at:new Date().toISOString()}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:120000,maxWait:10000})
 const output=process.env.FINANCE_HISTORICAL_BULK_COUNT_FILE
 if(output)writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify(result))
}
main().catch(e=>{console.error(e instanceof Error&&/^[A-Z0-9_]+$/.test(e.message)?e.message:'HISTORICAL_BULK_COUNT_FAILED');process.exitCode=1}).finally(()=>prisma.$disconnect())
