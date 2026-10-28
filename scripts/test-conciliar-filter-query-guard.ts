import assert from 'node:assert/strict';
import {CONCILIAR_GROUPS,type ConciliarGetInput} from '../lib/finanzas/conciliar-contract';
import {readConciliarProjectionTx} from '../lib/finanzas/conciliar-projection-read';
import {classifyPrisma5RawSqlStatement}from'../lib/prisma';

async function main(){
 const cases:Array<Partial<ConciliarGetInput>>=[{},...CONCILIAR_GROUPS.map(grupo=>({grupo})),{orden:'CONCEPTO',direccion:'ASC'},{orden:'FECHA',direccion:'DESC'},{orden:'IMPORTE',direccion:'DESC'},{q:'fixture_literal_%_safe',estado:'ROJO'}];
 for(const values of cases){let captured:unknown;const sentinel=new Error('CAPTURE_ONLY_NO_DATABASE');const tx={$queryRaw:async(sql:unknown)=>{captured=sql;throw sentinel}};
  try{await readConciliarProjectionTx(tx as never,{tab:'PAGOS',limit:20,offset:0,...values})}catch(e){if(e!==sentinel)throw e}
  assert(captured,'the final real query must be captured');assert.equal(classifyPrisma5RawSqlStatement([captured]),'read_only',JSON.stringify(values));
 }
 console.log(JSON.stringify({ok:true,realParameterizedQueries:cases.length,databaseQueries:0,networkCalls:0}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
