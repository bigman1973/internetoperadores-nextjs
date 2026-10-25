import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { readEasyCollectionsForMovements } from '../lib/finanzas/easy-collections-db'
import { verifyEasyCollectionsPreview } from '../lib/finanzas/easy-collections-preview'

process.env.NEXTAUTH_SECRET ??= 'synthetic-test-only-collection-card-secret-0123456789'

async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1')
  const identity = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
  assert.equal(identity[0]?.db, 'io_staging_finanzas')
  const actor = Number(readFileSync('/home/ubuntu/finanzas-b4-20261022/actor-private', 'utf8').trim())
  assert(Number.isSafeInteger(actor) && actor > 0)
  const rows = await prisma.$queryRaw<Array<{ movementId: string; method: string; level: string }>>(Prisma.sql`
    WITH g AS (SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1),
    samples AS (
      SELECT p.movimiento_id AS "movementId",p.metodo AS method,p.nivel AS level,
        row_number() OVER (PARTITION BY p.metodo,p.nivel ORDER BY p.importe_movimiento_centimos DESC,p.id) AS n
      FROM modo_facil_propuestas_cobro p JOIN g ON g.id=p.generacion_id
      LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=p.movimiento_id
      WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
        AND p.metodo IN ('REMESA_VENCIMIENTO','CONFIRMING_C9','REF_FACTURA')
    ) SELECT "movementId",method,level FROM samples WHERE n=1 ORDER BY method,level LIMIT 12
  `)
  assert(rows.length >= 3, 'Faltan propuestas vigentes para la prueba de tarjeta.')
  const before = await prisma.$queryRaw<Array<{ states: bigint; operations: bigint; events: bigint; proposals: bigint }>>`
    SELECT (SELECT count(*) FROM estado_justificacion_movimientos) AS states,
      (SELECT count(*) FROM operaciones_justificacion_b4) AS operations,
      (SELECT count(*) FROM eventos_justificacion_b4) AS events,
      (SELECT count(*) FROM modo_facil_propuestas_cobro) AS proposals`
  const result = await readEasyCollectionsForMovements(rows.map(row => row.movementId), actor)
  assert(result.size >= 3)
  const summary: Array<Record<string, unknown>> = []
  for (const row of rows) {
    const p = result.get(row.movementId)
    assert(p, 'La propuesta vigente debe aparecer dentro de la tarjeta.')
    assert.equal(p.rol, 'PRINCIPAL')
    assert.equal(p.metodo, row.method)
    assert.equal(p.nivel, row.level)
    assert(p.composicion.length <= 60, 'Composición acotada para evitar miles de nodos.')
    assert(p.composicionTotal >= p.composicion.length)
    assert(Number.isSafeInteger(p.importeMovimientoCentimos))
    assert(Number.isSafeInteger(p.diferenciaCentimos))
    if (p.seleccionable) {
      assert(p.previewToken)
      const selection = [{ propuestaId: p.propuestaId, movimientoId: p.movimientoId, fingerprint: p.fingerprint }]
      assert(verifyEasyCollectionsPreview(p.previewToken, actor, selection))
      assert(!verifyEasyCollectionsPreview(p.previewToken, actor + 100000, selection), 'Firma ligada al actor.')
      assert(!verifyEasyCollectionsPreview(p.previewToken, actor, [{ ...selection[0], fingerprint: '0'.repeat(64) }]), 'Rechaza huella alterada.')
    }
    summary.push({ method: p.metodo, level: p.nivel, compositionTotal: p.composicionTotal, compositionVisible: p.composicion.length, signed: !!p.previewToken })
  }
  assert.equal((await readEasyCollectionsForMovements([], actor)).size, 0)
  assert.equal((await readEasyCollectionsForMovements(['synthetic-no-movement'], actor)).size, 0)
  const after = await prisma.$queryRaw<Array<{ states: bigint; operations: bigint; events: bigint; proposals: bigint }>>`
    SELECT (SELECT count(*) FROM estado_justificacion_movimientos) AS states,
      (SELECT count(*) FROM operaciones_justificacion_b4) AS operations,
      (SELECT count(*) FROM eventos_justificacion_b4) AS events,
      (SELECT count(*) FROM modo_facil_propuestas_cobro) AS proposals`
  assert.deepEqual(after, before, 'La lectura no crea estados, operaciones, eventos ni propuestas.')
  console.log(JSON.stringify({ ok: true, writes: 0, tested: result.size, summary }))
}
run().catch(error => { console.error('EASY_COLLECTION_CARD_STAGING_FAILED', error instanceof assert.AssertionError ? error.message.split('\n')[0] : String(error?.message ?? 'Error de servicio').replace(/(?:postgres(?:ql)?:\/\/|https?:\/\/)\S+/g, '[conexión omitida]').split('\n')[0]); process.exitCode = 1 }).finally(() => prisma.$disconnect())
