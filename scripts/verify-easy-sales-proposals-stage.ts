import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import prisma from '../lib/prisma'
import {assertPrototypeStaging} from '../lib/finanzas/prototype-staging'
import {parseEasyReadInput} from '../lib/finanzas/easy-reconciliation-core'
import {readEasyReconciliation} from '../lib/finanzas/easy-reconciliation-db'
async function main(){
 await assertPrototypeStaging()
 const data=await readEasyReconciliation(parseEasyReadInput({desde:'2026-01-01',hasta:'2026-10-08',sentido:'COBROS',q:'ARROW',limit:'25',offset:'0'}))
 const rows=data.movimientos.map(m=>({movimientoId:m.id,importeCentimos:m.importeCentimos,sugerencias:m.sugerencias.map(d=>({tipo:d.tipo,exacta:d.exacta,sourceId:d.sourceId,documentoConciliableId:d.documentoConciliableId,importeCentimos:d.importeCentimos}))}))
 const exact=rows.filter(m=>m.sugerencias.filter(d=>d.tipo==='FACTURA_EMITIDA'&&d.exacta).length===1)
 assert.equal(data.stagingOnly,true)
 const output=process.env.FINANCE_EASY_SALES_VERIFY_FILE
 if(output)writeFileSync(output,JSON.stringify({stagingOnly:true,readOnly:true,rows},null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify({stagingOnly:true,movimientosArrow:rows.length,propuestasExactasUnicas:exact.length,confirmaciones:0}))
}
main().catch(e=>{console.error('SALES_STAGE_READ_STOPPED:'+e.message);process.exitCode=1}).finally(()=>prisma.$disconnect())
