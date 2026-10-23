import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { readConciliacionB4 } from '../lib/finanzas/reconciliation-db'
import { readPendientesB5, readContadoresPendientesB5, VISTAS_PENDIENTES_B5 } from '../lib/finanzas/pending-db'
import { sha256Canonical } from '../lib/finanzas/historical-b4-core'
import { parseHistoricoB4 } from '../components/finanzas/reconciliation-v2/historical-links-contract'

const dir = process.env.FINANCE_HISTORICAL_B4_PROOF_DIR
if (!dir) throw new Error('HISTORICAL_PROOF_DIR_REQUIRED')
const beforeMode = process.argv.includes('--before')
const tables = ['movimientos_bancarios','facturas_recibidas','facturas_emitidas','nominas','gastos','empleados','cuentas_bancarias','estado_justificacion_movimientos','documentos_conciliables','vinculos_movimiento_documento','operaciones_justificacion_b4']
async function snapshot() {
  const result:Record<string,string> = {}
  for (const table of tables) {
    const rows = await prisma.$queryRaw<Array<{ value:string }>>(Prisma.sql`SELECT to_jsonb(t)::text AS value FROM ${Prisma.raw('"'+table+'"')} t ORDER BY to_jsonb(t)::text`)
    result[table] = sha256Canonical(rows)
  }
  return result
}
async function main() {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(process.env.VERCEL_ENV,'production');assert.equal(process.env.FINANCE_MODEL_PRODUCTION_ENABLED,'1');assert.equal(process.env.FINANCE_AUTOMATIC_LINKS_DISABLED,'1')
  assert.equal(url.pathname, '/railway')
  assert.equal(decodeURIComponent(url.username), 'postgres')
  const identity = await prisma.$queryRaw<Array<{ db:string;role:string }>>`SELECT current_database() AS db,current_user AS role LIMIT 1`
  assert.deepEqual(identity[0], {db:'railway',role:'postgres'})
  const hashesBefore = await snapshot()
  const totals:Record<string,number> = {}
  for (const vista of VISTAS_PENDIENTES_B5) totals[vista] = (await readPendientesB5({vista,limit:1,offset:0})).total
  const counters = await readContadoresPendientesB5({})
  const justified = counters.contadores.reduce((sum,row)=>sum+BigInt(row.importeJustificadoCentimos),BigInt(0)).toString()
  const b4 = await readConciliacionB4(1,1)
  assert.deepEqual(b4.sugerencias,[])
  const shared = {hashes:hashesBefore,totals,importeJustificadoCentimos:justified,movimientosB4:b4.paginacion.movimientosTotal,documentosB4:b4.paginacion.documentosTotal}
  if (beforeMode) {
    assert.deepEqual(await snapshot(),hashesBefore)
    writeFileSync(dir+'/lectura-production-antes.json',JSON.stringify(shared,null,2)+'\n',{mode:0o600})
    console.log(JSON.stringify({modo:'BASELINE',lecturasSinEscrituras:true,totals}))
    return
  }
  const before = JSON.parse(readFileSync(dir+'/lectura-production-antes.json','utf8'))
  assert.deepEqual(shared,before)
  const counts = await prisma.$queryRaw<Array<{total:number;propuestas:number;yaB4:number;justificados:number}>>`
    SELECT count(*)::int AS total,count(*) FILTER(WHERE clasificacion='PROPUESTA')::int AS propuestas,
      count(*) FILTER(WHERE clasificacion='YA_B4')::int AS "yaB4",count(*) FILTER(WHERE clasificacion='JUSTIFICADO')::int AS justificados
    FROM legado_conciliacion_b4 l WHERE NOT EXISTS(SELECT 1 FROM reversiones_legado_b4 r WHERE r.lote=l.lote)`
  assert.deepEqual(counts[0],{total:878,propuestas:878,yaB4:0,justificados:0})
  const all = await readConciliacionB4(100,1,{heredados:'SI'})
  const proposals = await readConciliacionB4(100,1,{heredados:'PROPUESTA'})
  assert.equal(all.paginacion.movimientosTotal,878)
  assert.equal(proposals.paginacion.movimientosTotal,878)
  assert.equal(all.paginacion.documentosTotal,b4.paginacion.documentosTotal)
  assert.equal(proposals.paginacion.documentosTotal,b4.paginacion.documentosTotal)
  const ids = new Set<string>()
  for(let offset=0;offset<878;offset+=100) {
    const page = await readConciliacionB4(100,1,{heredados:'PROPUESTA',movimientosOffset:offset})
    for(const movement of page.movimientos) {
      assert(!ids.has(movement.id));ids.add(movement.id)
      assert.equal(movement.historico?.clasificacion,'PROPUESTA')
      assert.equal(parseHistoricoB4(movement.historico).ok,true)
      assert(!['sourceHash','snapshotLegacy','creadoPorId','lote','snapshot_legacy','source_hash'].some(key=>key in (movement.historico||{})))
    }
  }
  assert.equal(ids.size,878)
  const existing = await prisma.$queryRaw<Array<{id:string}>>`SELECT movimiento_id AS id FROM legado_conciliacion_b4 LIMIT 1`
  assert.equal((await readConciliacionB4(1,1,{heredados:'PROPUESTA',movimientoId:existing[0].id})).movimientos.length,1)
  assert.deepEqual(await snapshot(),hashesBefore)
  const receipt = {passed:true,legacyYB4SinCambios:true,lecturasSinEscrituras:true,propuestasNoElevanKpi:true,conteos:counts[0],filtrosYPaginacion:true,totals,at:new Date().toISOString()}
  writeFileSync(dir+'/lectura-production-verificada.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600})
  console.log(JSON.stringify(receipt))
}
main().catch(error=>{console.error(error instanceof Error ? error.message.replace(/[^A-Za-z0-9_\s]/g,'').slice(0,120):'HISTORICAL_VERIFY_FAILED');process.exitCode=1}).finally(()=>prisma.$disconnect())
