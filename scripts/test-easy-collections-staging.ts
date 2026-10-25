import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { assertFinanceEasyRuntime } from '../lib/finanzas/prototype-staging'
import { easyCollectionFingerprint } from '../lib/finanzas/easy-collections-core'
import { readEasyCollectionsPreviewTx, runEasyCollectionsActionTx } from '../lib/finanzas/easy-collections-db'

type Tx = Prisma.TransactionClient & Record<string, any>
class RollbackOnly extends Error { constructor() { super('EASY_COLLECTIONS_ROLLBACK_ONLY') } }
const TAG = `EASY-COLLECTIONS-ROLLBACK-${randomUUID()}`
process.env.NEXTAUTH_SECRET ??= 'test-secret-only-for-easy-collections-staging-rollback-0123456789'
function actorId(): number {
  const value = Number(readFileSync('/home/ubuntu/finanzas-b4-20261022/actor-private', 'utf8').trim())
  assert(Number.isSafeInteger(value) && value > 0, 'El actor privado de staging no es válido.')
  return value
}
function fingerprint(input: Parameters<typeof easyCollectionFingerprint>[0]) { return easyCollectionFingerprint(input) }

async function candidates(tx: Tx) {
  const rows = await tx.$queryRaw<Array<{ movimientoId: string; facturaId: string; importeCentimos: number; transferId: string; transferPairId: string; transferImporteCentimos: number }>>(Prisma.sql`
    WITH pendientes AS (
      SELECT m.id,m.cuenta_id,b4_importe_bancario_centimos(m.importe) AS importe_centimos
      FROM movimientos_bancarios m
      LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
      WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' AND b4_importe_bancario_centimos(m.importe)>0
    ), facturas AS (
      SELECT f.id,b4_importe_bancario_centimos(f.total) AS importe_centimos
      FROM facturas_emitidas f
      WHERE NOT EXISTS (
        SELECT 1 FROM documentos_conciliables d
        JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo
        WHERE d.factura_emitida_id=f.id
      )
    ), justificados AS (
      SELECT p.id AS "movimientoId",f.id AS "facturaId",p.importe_centimos AS "importeCentimos",
        row_number() OVER (PARTITION BY p.id ORDER BY f.id) AS movimiento_orden,
        row_number() OVER (PARTITION BY f.id ORDER BY p.id) AS factura_orden
      FROM pendientes p JOIN facturas f ON f.importe_centimos=p.importe_centimos
    ), transferencias AS (
      SELECT a.id AS "transferId",b.id AS "transferPairId",a.importe_centimos AS "transferImporteCentimos",
        row_number() OVER (ORDER BY a.id,b.id) AS orden
      FROM pendientes a
      JOIN movimientos_bancarios b ON b.id<>a.id AND b.cuenta_id<>a.cuenta_id
      LEFT JOIN estado_justificacion_movimientos be ON be.movimiento_id=b.id
      WHERE b4_importe_bancario_centimos(b.importe)=-a.importe_centimos
        AND COALESCE(be.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
    )
    SELECT j1."movimientoId",j1."facturaId",j1."importeCentimos",t."transferId",t."transferPairId",t."transferImporteCentimos"
    FROM justificados j1
    JOIN justificados j2 ON j2.movimiento_orden=1 AND j2.factura_orden=1
    JOIN transferencias t ON t.orden=1
    WHERE j1.movimiento_orden=1 AND j1.factura_orden=1
      AND j1."movimientoId" NOT IN (t."transferId",t."transferPairId")
      AND j2."movimientoId" NOT IN (j1."movimientoId",t."transferId",t."transferPairId")
    ORDER BY j1."movimientoId"
    LIMIT 1
  `)
  // La segunda coincidencia se resuelve de forma separada para conservar fuentes distintas.
  const first = rows[0]
  assert(first, 'No hay movimientos reales suficientes para la prueba reversible.')
  const second = await tx.$queryRaw<Array<{ movimientoId: string; facturaId: string; importeCentimos: number }>>(Prisma.sql`
    WITH pendientes AS (
      SELECT m.id,b4_importe_bancario_centimos(m.importe) AS importe_centimos
      FROM movimientos_bancarios m LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
      WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO' AND b4_importe_bancario_centimos(m.importe)>0 AND m.id<>${first.movimientoId}
    )
    SELECT p.id AS "movimientoId",f.id AS "facturaId",p.importe_centimos AS "importeCentimos"
    FROM pendientes p JOIN facturas_emitidas f ON b4_importe_bancario_centimos(f.total)=p.importe_centimos
    WHERE p.id NOT IN (${first.transferId},${first.transferPairId})
      AND NOT EXISTS (SELECT 1 FROM documentos_conciliables d JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo WHERE d.factura_emitida_id=f.id)
      AND f.id<>${first.facturaId}
    ORDER BY p.id,f.id LIMIT 1
  `)
  assert(second[0], 'No hay una segunda pareja documental independiente para la prueba reversible.')
  return { first, second: second[0] }
}

async function run() {
  assert.equal(process.env.EASY_COLLECTIONS_STAGING_ROLLBACK, '1', 'Define EASY_COLLECTIONS_STAGING_ROLLBACK=1 para ejecutar esta prueba.')
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio.')
  await assertFinanceEasyRuntime()
  const actor = actorId()
  const identity = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`
  assert.equal(identity[0]?.db, 'io_staging_finanzas', 'Sólo se permite io_staging_finanzas.')
  let completed = false
  try {
    await prisma.$transaction(async (tx: Tx) => {
      const source = await candidates(tx)
      const generationId = randomUUID(), p1 = randomUUID(), p2 = randomUUID(), p3 = randomUUID()
      const just = (propuestaId: string, movimientoId: string, facturaId: string, importeMovimientoCentimos: number) => {
        const lineas = [{ tipo: 'DOCUMENTO' as const, tipoDocumento: 'FACTURA_EMITIDA' as const, sourceId: facturaId, importeCentimos: importeMovimientoCentimos }]
        return { propuestaId, movimientoId, movimientoParId: null, importeMovimientoCentimos, metodo: 'REF_FACTURA' as const, nivel: 'EXACTA' as const, estadoPropuesto: 'JUSTIFICADO' as const, motivoNoRequiere: null, lineas, fingerprint: fingerprint({ v: 1, movimientoId, movimientoParId: null, importeMovimientoCentimos, metodo: 'REF_FACTURA', nivel: 'EXACTA', estadoPropuesto: 'JUSTIFICADO', motivoNoRequiere: null, lineas }) }
      }
      const a = just(p1, source.first.movimientoId, source.first.facturaId, source.first.importeCentimos)
      const b = just(p2, source.second.movimientoId, source.second.facturaId, source.second.importeCentimos)
      const tLineas: [] = []
      const c = { propuestaId: p3, movimientoId: source.first.transferId, movimientoParId: source.first.transferPairId, importeMovimientoCentimos: source.first.transferImporteCentimos, metodo: 'TRASPASO_PROPIO' as const, nivel: 'EXACTA' as const, estadoPropuesto: 'NO_REQUIERE' as const, motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO' as const, lineas: tLineas, fingerprint: fingerprint({ v: 1, movimientoId: source.first.transferId, movimientoParId: source.first.transferPairId, importeMovimientoCentimos: source.first.transferImporteCentimos, metodo: 'TRASPASO_PROPIO', nivel: 'EXACTA', estadoPropuesto: 'NO_REQUIERE', motivoNoRequiere: 'TRASPASO_INTERNO_SIN_DOCUMENTO', lineas: tLineas }) }
      await tx.$executeRaw(Prisma.sql`INSERT INTO modo_facil_generaciones_cobro (id,fuente,resumen) VALUES (CAST(${generationId} AS uuid),${TAG},'{}'::jsonb)`)
      for (const proposal of [a, b, c]) await tx.$executeRaw(Prisma.sql`
        INSERT INTO modo_facil_propuestas_cobro (id,generacion_id,movimiento_id,movimiento_par_id,importe_movimiento_centimos,metodo,nivel,estado_propuesto,motivo_no_requiere,lineas,composicion,explicacion,fingerprint)
        VALUES (CAST(${proposal.propuestaId} AS uuid),CAST(${generationId} AS uuid),${proposal.movimientoId},${proposal.movimientoParId},${proposal.importeMovimientoCentimos},${proposal.metodo},${proposal.nivel},${proposal.estadoPropuesto},${proposal.motivoNoRequiere},CAST(${JSON.stringify(proposal.lineas)} AS jsonb),'[]'::jsonb,${TAG},${proposal.fingerprint})
      `)
      const preview: any = await readEasyCollectionsPreviewTx(tx, { nivel: 'TODAS', limit: 25, offset: 0 }, actor)
      assert.equal(preview.generacion.id, generationId)
      const owned = preview.items.filter((item: any) => [p1, p2, p3].includes(item.propuestaId))
      assert.equal(owned.length, 3, 'Las tres propuestas propias deben aparecer como vigentes.')
      assert(owned.every((item: any) => item.seleccionable), 'Las propuestas sintéticas deben poder seleccionarse.')
      const command = { action: 'confirmar_bloque' as const, confirmacion: true as const, idempotencyKey: randomUUID(), previewToken: preview.previewToken, items: owned.map((item: any) => ({ propuestaId: item.propuestaId, movimientoId: item.movimientoId, fingerprint: item.fingerprint })) }
      const started = Date.now()
      const confirmed: any = await runEasyCollectionsActionTx(tx, actor, command)
      const elapsedMs = Date.now() - started
      assert.equal(confirmed.ok, true); assert.equal(confirmed.confirmadas, 3); assert.equal(confirmed.idempotente, false)
      const states = await tx.estadoJustificacionMovimientoB4.findMany({ where: { movimientoId: { in: [a.movimientoId, b.movimientoId, c.movimientoId, c.movimientoParId] } }, select: { movimientoId: true, estado: true } })
      const byMovement = new Map(states.map((row: any) => [row.movimientoId, row.estado]))
      assert.equal(byMovement.get(a.movimientoId), 'JUSTIFICADO'); assert.equal(byMovement.get(b.movimientoId), 'JUSTIFICADO')
      assert.equal(byMovement.get(c.movimientoId), 'NO_REQUIERE'); assert.equal(byMovement.get(c.movimientoParId), 'NO_REQUIERE')
      const approvals = await tx.eventoJustificacionB4.findMany({ where: { actorId: actor, accion: 'APROBACION', detalle: { path: ['bloqueId'], equals: confirmed.bloqueId } }, select: { detalle: true } })
      assert.equal(approvals.length, 4); assert(approvals.every((row: any) => row.detalle.origen === 'PROPUESTA_COBRO' && row.detalle.confirmacionHumana === true && row.detalle.bulkKind === 'COBROS_CONFIRMACION'))
      const undone: any = await runEasyCollectionsActionTx(tx, actor, { action: 'deshacer_bloque', confirmacion: true, idempotencyKey: randomUUID(), bloqueId: confirmed.bloqueId })
      assert.equal(undone.ok, true); assert.equal(undone.revertidas, 3)
      const restored = await tx.estadoJustificacionMovimientoB4.findMany({ where: { movimientoId: { in: [a.movimientoId, b.movimientoId, c.movimientoId, c.movimientoParId] } }, select: { estado: true } })
      assert(restored.every((row: any) => row.estado === 'SIN_DOCUMENTO'), 'Deshacer devuelve todos los movimientos del bloque a SIN_DOCUMENTO.')
      const reversions = await tx.eventoJustificacionB4.findMany({ where: { actorId: actor, accion: 'REVERSION', detalle: { path: ['bloqueId'], equals: confirmed.bloqueId } }, select: { detalle: true } })
      assert.equal(reversions.length, 4); assert(reversions.every((row: any) => row.detalle.bulkKind === 'COBROS_REVERSION'))
      completed = true
      console.log(JSON.stringify({ passed: true, rollback: true, propuestas: 3, estados: ['JUSTIFICADO', 'NO_REQUIERE'], undo: true, elapsedMs }))
      throw new RollbackOnly()
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 60_000 })
  } catch (error) { if (!(error instanceof RollbackOnly)) throw error }
  assert(completed, 'No se alcanzó el rollback obligatorio.')
}
run().catch(error => { console.error(`EASY_COLLECTIONS_STAGING_FAILED:${error instanceof Error ? error.message.slice(0, 400) : 'desconocido'}`); process.exitCode = 1 }).finally(() => prisma.$disconnect())
