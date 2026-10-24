import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { assertPrototypeStaging } from '@/lib/finanzas/prototype-staging'
import { readFileSync, writeFileSync } from 'node:fs'

const root = '/home/ubuntu/impersonacion-20261024/pruebas'
const tables = ['usuarios_admin', 'movimientos_bancarios', 'facturas_emitidas', 'facturas_recibidas', 'nominas', 'gastos'] as const
async function main() {
  await assertPrototypeStaging()
  const data = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    const identity = await tx.$queryRaw<Array<{db:string;role:string}>>(Prisma.sql`SELECT current_database() AS db,current_user AS role LIMIT 1`)
    if (identity[0].db !== 'io_staging_finanzas' || identity[0].role !== 'io_staging_finanzas') throw Error('STAGING_ONLY')
    const hashes: Record<string,unknown> = {}
    for (const table of tables) {
      hashes[table] = (await tx.$queryRawUnsafe<Array<{count:string;hash:string}>>(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) AS hash FROM "${table}" x LIMIT 1`))[0]
    }
    return {hashes}
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:120000})
  const check = process.argv.includes('--check')
  if (check) {
    const before = JSON.parse(readFileSync(root + '/baseline-private.json','utf8'))
    if (JSON.stringify(before.hashes) !== JSON.stringify(data.hashes)) throw Error('USERS_OR_LEGACY_CHANGED')
  }
  writeFileSync(root + (check ? '/conservation-final.json' : '/baseline-private.json'),JSON.stringify({...data,passed:true,stagingOnly:true,comparison:check,at:new Date().toISOString()},null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify({passed:true,stagingOnly:true,tablesVerified:tables.length,comparison:check}))
}
main().catch(e=>{console.error('STAGING_CONSERVATION_STOPPED',e.message);process.exitCode=1}).finally(()=>prisma.$disconnect())
