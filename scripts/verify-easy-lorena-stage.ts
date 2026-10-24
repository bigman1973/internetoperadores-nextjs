import prisma from '@/lib/prisma'
import {Prisma} from '@prisma/client'
import {assertPrototypeStaging} from '@/lib/finanzas/prototype-staging'
import {readFileSync,writeFileSync} from 'node:fs'
const ROOT='/home/ubuntu/finanzas-lorena-20261024/pruebas'
async function main(){
 await assertPrototypeStaging()
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
  const tables=await tx.$queryRaw<Array<{tablename:string}>>(Prisma.sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename IN ('movimientos_bancarios','facturas_emitidas','facturas_recibidas','nominas','gastos','decisiones_tercero_modo_facil') OR tablename LIKE '%justificacion%') ORDER BY tablename LIMIT 100`)
  if(tables.length===100)throw Error('BASELINE_TABLES_TRUNCATED')
  const hashes:Record<string,unknown>={}
  for(const {tablename} of tables){
   if(!/^[a-z_][a-z0-9_]*$/.test(tablename))throw Error('BASELINE_TABLE_INVALID')
   const rows=await tx.$queryRawUnsafe<Array<{count:string,hash:string}>>(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) AS hash FROM "${tablename}" x LIMIT 1`)
   hashes[tablename]=rows[0]
  }
  return {target:'staging',hashes}
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:120000})
 const check=process.argv.includes('--check')
 if(check){const before=JSON.parse(readFileSync(ROOT+'/baseline-private.json','utf8'));if(JSON.stringify(before.hashes)!==JSON.stringify(result.hashes))throw Error('EXISTING_FINANCIAL_DATA_CHANGED')}
 writeFileSync(ROOT+(check?'/conservation-final.json':'/baseline-private.json'),JSON.stringify({...result,passed:true,at:new Date().toISOString()},null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify({passed:true,stagingOnly:true,tablesVerified:Object.keys(result.hashes).length,comparison:check}))
}
main().catch(()=>{console.error('STAGING_CONSERVATION_STOPPED');process.exitCode=1}).finally(()=>prisma.$disconnect())
