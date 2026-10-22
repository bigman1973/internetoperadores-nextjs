import 'dotenv/config'
import assert from 'node:assert/strict'
import prisma from '../lib/prisma'
import {assertFinanceStagingIsolated} from '../lib/finanzas/staging-safety'
import {readCentrosCosteFinanzas,leerAnaliticaCentrosCoste,leerLineasConfirmadasCentroCoste} from '../lib/finanzas/centros-coste-db'
import {createB8CurrentSourceValidator} from '../lib/finanzas/reconciliation-db'
import {prepareA3ParallelDraft} from '../lib/finanzas/a3-parallel-core'
const tables=['facturas','facturas_emitidas','facturas_recibidas','movimientos_bancarios','gastos','nominas','vinculos_movimiento_documento','operaciones_justificacion_b4','eventos_justificacion_b4','centros_coste_finanzas','auditorias_centros_coste_finanzas_b8','recibos_eleccion_centro_b8']
async function snapshot(){
 const result=[]
 for(const table of tables){
  const [row]=await prisma.$queryRawUnsafe<Array<{n:bigint;h:string}>>(`SELECT count(*)::bigint AS n,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS h FROM "${table}" t`)
  result.push({table,n:String(row.n),h:row.h})
 }
 return result
}
async function main(){
 // Next resolves server-only as a bundling marker. The CLI test substitutes only
 // that marker while loading the real DB reader; no production module is replaced.
 const Module=require('node:module'),original=Module._load
 let a3:any
 try { Module._load=function(id:string,...args:any[]){return id==='server-only'?{}:original.call(this,id,...args)};a3=require('../lib/finanzas/a3-parallel-db') }
 finally { Module._load=original }
 const {readA3ConfigMetadata,buildA3AccountConfig,readA3ParallelInput,parseA3Month,computeA3DataHash}=a3
 await assertFinanceStagingIsolated();const before=await snapshot()
 const actor=await prisma.usuarioAdmin.findFirst({where:{activo:true,rol:'SUPER_ADMIN'},select:{id:true},orderBy:{id:'asc'}});assert(actor)
 const validator=createB8CurrentSourceValidator(),start=Date.now()
 const cat=await readCentrosCosteFinanzas({actorId:actor.id,incluirInactivos:true})
 const lines=await leerLineasConfirmadasCentroCoste({actorId:actor.id,limit:2,requiredCurrentSourceValidator:validator})
 const analytic=await leerAnaliticaCentrosCoste({actorId:actor.id,requiredCurrentSourceValidator:validator})
 assert.equal(cat.recurso,'centros');assert.equal(lines.recurso,'lineas-confirmadas');assert.equal(analytic.recurso,'analitica');assert.equal(analytic.sinProrrateo,true)
 assert(lines.items.length<=2);assert(analytic.items.every(x=>Number.isSafeInteger(x.importeDocumentalConfirmadoPorCentroCentimos)))
 await prisma.$transaction(async tx=>{
  const metadata=await readA3ConfigMetadata(tx);assert(Array.isArray(metadata.profiles)&&Array.isArray(metadata.bankAccounts))
  const config=await buildA3AccountConfig({selection:'manual',explicitlySelected:false,accounts:{},bankAccountByCuentaId:{}},tx)
  const period=parseA3Month('2026-10')
  const input=await readA3ParallelInput('todo',period,config,{gastoById:{},movimientoById:{},nominaById:{}},tx)
  const draft=prepareA3ParallelDraft(input),hash=await computeA3DataHash(period,'todo',input)
  assert.equal(draft.readiness,'incomplete');assert(draft.incidences.some(i=>i.severity==='BLOQUEANTE'))
  assert(/^[a-f0-9]{64}$/.test(hash));assert.equal(draft.totals.debeCentimos,draft.totals.haberCentimos)
 },{isolationLevel:'RepeatableRead',timeout:60000})
 assert.deepEqual(await snapshot(),before)
 console.log(`B8 lectura real: catálogo, líneas, analítica y A3 sin configuración contable supuesta; ${tables.length} tablas conservadas. Duración ${Date.now()-start} ms.`)
}
main().catch(()=>{console.error('B8 lectura no completada; sin persistencia autorizada.');process.exitCode=1}).finally(()=>prisma.$disconnect())
