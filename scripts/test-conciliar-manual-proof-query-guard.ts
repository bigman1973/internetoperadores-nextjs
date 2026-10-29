import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { readManualOwnAccountProofTx } from '../lib/finanzas/conciliar-own-account-proof-db'

async function main() {
  const queries: Prisma.Sql[]=[]
  const tx={async $queryRaw<T>(sql:Prisma.Sql):Promise<T>{
    queries.push(sql)
    return (queries.length===1?[{found:'public.declaraciones_titularidad_modo_facil'}]:[]) as T
  }}
  const result=await readManualOwnAccountProofTx(tx,['cuenta-propia-sintetica-uno','cuenta-propia-sintetica-dos'])
  assert.equal(queries.length,2)
  assert.equal(result.proof.accountIds.size,0)
  for(const sql of queries){
    assert.equal(classifyPrisma5RawSqlStatement([sql]),'read_only')
    assert.doesNotMatch(sql.sql,/\bOVER\s*\(/i)
    assert.doesNotMatch(sql.sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i)
  }
  console.log(JSON.stringify({ok:true,queries:2,realSqlGuard:true,databaseQueries:0,automaticPoliciesChanged:false}))
}
main().catch(error=>{console.error(error);process.exitCode=1})
