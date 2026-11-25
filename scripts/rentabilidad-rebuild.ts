#!/usr/bin/env node
import { assertRentabilidadConfiguration, saveRule } from '../lib/rentabilidad/store';
import { rebuildRentabilidadReport } from '../lib/rentabilidad/report';
import { proposeExternalCosts, synchronizeRentabilidad } from '../lib/rentabilidad/automation';
import { INITIAL_COST_RULES } from '../lib/rentabilidad/defaults';
import { prisma } from '../lib/prisma';
async function main(){
 assertRentabilidadConfiguration();if(process.env.RENTABILIDAD_REBUILD_APPROVED!=='1')throw Error('REBUILD_EXPLICIT_APPROVAL_REQUIRED');
 const actorId=Number(process.env.RENTABILIDAD_SYSTEM_ACTOR_ID),months=(process.env.RENTABILIDAD_REBUILD_MONTHS||'').split(',').filter(Boolean);
 if(!months.length||months.length>24||!Number.isSafeInteger(actorId)||actorId<=0)throw Error('REBUILD_PARAMETERS_REQUIRED');
 if(process.env.RENTABILIDAD_INSTALL_COST_RULES==='1'){for(const rule of INITIAL_COST_RULES)await saveRule(rule,actorId);console.log(JSON.stringify({installedCostRules:INITIAL_COST_RULES.length}));}
 await synchronizeRentabilidad(actorId);
 for(const month of months){
  await proposeExternalCosts(month,actorId);const start=Date.now();const report=await rebuildRentabilidadReport(month,actorId);
  console.log(JSON.stringify({month,seconds:(Date.now()-start)/1000,snapshot:report.snapshot,summary:report.summary,controls:report.controls,reference:report.referenceSummary,alerts:report.alerts.length,initialCosts:report.initialCostByInvoiceMonth.length,comparison:report.comparison.map((c:any)=>({code:c.contractCode,contractedCost:c.contractedCost,actualCost:c.actualProductCost,personalPending:c.personalPending}))}));
 }
}
main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:'REBUILD_FAILED'}));process.exitCode=1;}).finally(()=>prisma.$disconnect());
