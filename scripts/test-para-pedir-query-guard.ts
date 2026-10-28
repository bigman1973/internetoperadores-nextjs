import assert from 'node:assert/strict';
import {classifyPrisma5RawSqlStatement} from '../lib/prisma';
import {readParaPedirProjection} from '../lib/finanzas/para-pedir-projection-read';
import {readParaPedirRequestMetadataTx} from '../lib/finanzas/para-pedir-request-metadata';

async function main(){
 const captured:unknown[]=[];
 const tx={$queryRaw:async(q:unknown)=>{captured.push(q);return []}};
 await readParaPedirRequestMetadataTx(tx as never,['synthetic-movement']);
 assert.equal(captured.length,1);assert.equal(classifyPrisma5RawSqlStatement([captured[0]]),'read_only','Los metadatos B5 deben ser legibles con el guard real durante actuación.');
 captured.length=0;
 try{await readParaPedirProjection({estado:'TODOS',limit:50,offset:0},tx as never)}catch{/* The synthetic client deliberately has no projection bundle. */}
 assert.equal(captured.length,1);assert.equal(classifyPrisma5RawSqlStatement([captured[0]]),'read_only','La página agrupada debe ser legible durante actuación.');
 console.log(JSON.stringify({ok:true,queriesClassifiedReadOnly:2,databaseQueries:0,newSqlFunctionsAllowed:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
