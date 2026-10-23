import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, lstatSync } from 'node:fs'
import { Client } from 'pg'
import prisma from '../lib/prisma'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'

async function main() {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(process.env.FINANCE_STAGING_SANDBOX,'1')
  assert.equal(url.pathname,'/io_staging_finanzas')
  assert.equal(decodeURIComponent(url.username),'io_staging_finanzas')
  const client = new Client({connectionString:process.env.DATABASE_URL})
  await client.connect()
  try {
    const identity = (await client.query('SELECT current_database() AS db,current_user AS role LIMIT 1')).rows[0]
    assert.deepEqual(identity,{db:'io_staging_finanzas',role:'io_staging_finanzas'})
    const file = process.env.FINANCE_HISTORICAL_B4_ACTOR_FILE
    assert(file)
    const stat = lstatSync(file)
    assert(stat.isFile() && !(stat.mode & 0o077) && stat.uid === process.getuid?.())
    const actor = Number(readFileSync(file,'utf8').trim())
    assert.equal((await requireB4ActorAccess(actor,'escritura')).ok,true)
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
    await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='90s'")
    const movimento = (await client.query('SELECT m.id FROM movimientos_bancarios m WHERE NOT EXISTS(SELECT 1 FROM legado_conciliacion_b4 l WHERE l.movimiento_id=m.id) LIMIT 1')).rows[0]
    assert(movimento)
    const lote = 'HISTORICAL_B4_GUARD_TEST_ROLLBACK'
    await client.query("INSERT INTO legado_conciliacion_b4(movimiento_id,id,lote,clasificacion,procedencia,motivos,documentos,snapshot_legacy,source_hash,creado_por_id) VALUES($1,$2,$3,'PROPUESTA','DESCONOCIDO','[]','[]','{}',$4,$5)",[movimento.id,randomUUID(),lote,'f'.repeat(64),actor])
    async function rejected(sql:string,params:unknown[],expected='23514') {
      await client.query('SAVEPOINT guard_test')
      let caught = false
      try { await client.query(sql,params) } catch(error) { assert.equal((error as {code:string}).code,expected);caught=true }
      await client.query('ROLLBACK TO SAVEPOINT guard_test')
      assert.equal(caught,true)
    }
    await rejected('UPDATE legado_conciliacion_b4 SET procedencia=procedencia WHERE movimiento_id=$1',[movimento.id])
    await rejected('DELETE FROM legado_conciliacion_b4 WHERE movimiento_id=$1',[movimento.id])
    const active = async() => Number((await client.query('SELECT count(*)::int AS total FROM legado_conciliacion_b4 l WHERE l.lote=$1 AND NOT EXISTS(SELECT 1 FROM reversiones_legado_b4 r WHERE r.lote=l.lote)',[lote])).rows[0].total)
    assert.equal(await active(),1)
    await client.query('INSERT INTO reversiones_legado_b4(id,lote,actor_id,motivo) VALUES($1,$2,$3,$4)',[randomUUID(),lote,actor,'Ensayo sintético de reversión dentro de rollback'])
    assert.equal(await active(),0)
    assert.equal((await client.query('SELECT count(*)::int AS total FROM legado_conciliacion_b4 WHERE lote=$1',[lote])).rows[0].total,1)
    await rejected('DELETE FROM reversiones_legado_b4 WHERE lote=$1',[lote])
    await rejected("INSERT INTO legado_conciliacion_b4(movimiento_id,id,lote,clasificacion,procedencia,motivos,documentos,snapshot_legacy,source_hash,creado_por_id) SELECT m.id,$1,$2,'JUSTIFICADO','DESCONOCIDO','[]','[]','{}',$3,$4 FROM movimientos_bancarios m WHERE NOT EXISTS(SELECT 1 FROM legado_conciliacion_b4 l WHERE l.movimiento_id=m.id) LIMIT 1",[randomUUID(),lote,'e'.repeat(64),actor])
    await client.query('SET CONSTRAINTS ALL IMMEDIATE')
    await client.query('ROLLBACK')
    assert.equal((await client.query('SELECT count(*)::int AS total FROM legado_conciliacion_b4 WHERE lote=$1',[lote])).rows[0].total,0)
    console.log(JSON.stringify({passed:true,rollback:true,inmutabilidad:true,justificacionDesconocidaBloqueada:true,reversionSuprimeSinBorrar:true,registrosPruebaPersistidos:0}))
  } finally { await client.query('ROLLBACK').catch(()=>{}); await client.end(); await prisma.$disconnect() }
}
main().catch(()=>{console.error('HISTORICAL_GUARD_TEST_FAILED');process.exitCode=1})
