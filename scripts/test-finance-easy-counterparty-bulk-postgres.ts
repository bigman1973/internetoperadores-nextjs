import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { EasyCounterpartyBulkServiceError, readEasyCounterpartyBulkPreviewTx, runEasyCounterpartyBulkTx } from '../lib/finanzas/easy-counterparty-bulk-db'
import { EasyCounterpartyBulkValidationError } from '../lib/finanzas/easy-counterparty-bulk-core'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'

/**
 * Deliberately manual staging proof. It requires reviewed DDL to have been applied
 * first, uses the private runner and always throws RollbackOnly after asserting
 * acceptance + undo. It never calls the migration, changes B4, documents or sends.
 *
 * node /home/ubuntu/finanzas-20261022-2012/ejecutar_privado.cjs staging scripts/test-finance-easy-counterparty-bulk-postgres.ts
 */
const TAG = `P1-BULK-ROLLBACK-${randomUUID()}`
const DAY = new Date(Date.UTC(2044, 1, 3, 10, 0, 0))
// The test signs only ephemeral previews inside its rollback transaction.  A
// private runner may intentionally omit application secrets, so it needs no live
// secret to prove stale/contextual selections are rejected before any save.
process.env.NEXTAUTH_SECRET ??= 'test-secret-only-for-easy-counterparty-bulk-rollback-0123456789'
type Tx = any
class RollbackOnly extends Error { constructor() { super('P1_BULK_ROLLBACK_ONLY') } }
function actorId(): number { const value = Number(process.env.FINANCE_P1_ACTOR_ID); assert(Number.isSafeInteger(value) && value > 0, 'FINANCE_P1_ACTOR_ID debe venir del runner privado'); return value }
async function expectCode(code: string, work: () => Promise<unknown>) {
  try { await work() } catch (error) {
    assert(error instanceof EasyCounterpartyBulkServiceError || error instanceof EasyCounterpartyBulkValidationError, `Se esperaba error de lote ${code}`)
    assert.equal(error.code, code)
    return
  }
  assert.fail(`Debía rechazar ${code}`)
}
async function expectDeferredReject(work: () => Promise<unknown>) {
  try { await work() } catch { return }
  assert.fail('La integridad diferida debía rechazar un lote incompleto.')
}
async function snapshot() {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>`
    SELECT jsonb_object_agg(nombre,jsonb_build_object('count',cantidad,'hash',huella)) AS snapshot FROM (
      SELECT 'movimientos_bancarios' nombre,count(*)::text cantidad,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) huella FROM movimientos_bancarios t
      UNION ALL SELECT 'entidades_fiscales',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM entidades_fiscales t
      UNION ALL SELECT 'decisiones_tercero_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM decisiones_tercero_modo_facil t
      UNION ALL SELECT 'lotes_tercero_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM lotes_tercero_modo_facil t
      UNION ALL SELECT 'patas_lote_tercero_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.lote_id::text||':'||t.ordinal),'')) FROM patas_lote_tercero_modo_facil t
      UNION ALL SELECT 'reversiones_lote_tercero_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM reversiones_lote_tercero_modo_facil t
      UNION ALL SELECT 'patas_reversion_lote_tercero_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.reversion_id::text||':'||t.ordinal),'')) FROM patas_reversion_lote_tercero_modo_facil t
      UNION ALL SELECT 'estado_justificacion_movimientos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id),'')) FROM estado_justificacion_movimientos t
    ) x
  `
  assert.equal(rows.length, 1); return rows[0].snapshot
}
async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.equal(process.env.VERCEL_ENV, 'preview', 'VERCEL_ENV=preview es obligatorio')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'Las acciones externas deben estar deshabilitadas')
  const actor = actorId()
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }, 'Sólo staging aislado')
  const access = await requireB4ActorAccess(actor, 'escritura'); assert(access.ok, 'El actor debe tener escritura B4 viva')
  const required = await prisma.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass('lotes_tercero_modo_facil')::text AS name
    UNION ALL SELECT to_regclass('patas_lote_tercero_modo_facil')::text
    UNION ALL SELECT to_regclass('reversiones_lote_tercero_modo_facil')::text
    UNION ALL SELECT to_regclass('patas_reversion_lote_tercero_modo_facil')::text
    UNION ALL SELECT to_regclass('decisiones_tercero_modo_facil')::text
  `
  assert(required.every(row => row.name !== null), 'Aplicar y revisar primero el DDL P1 y el DDL de lote propuesto')
  const before = await snapshot(); let completed = false
  try {
    await prisma.$transaction(async (tx: Tx) => {
      const accountId = randomUUID(), entityId = randomUUID(), clientEntityId = randomUUID(), bankEntityId = randomUUID(), taxEntityId = randomUUID(), ambiguousA = randomUUID(), ambiguousB = randomUUID()
      const firstId = randomUUID(), secondId = randomUUID(), confirmingClientMovement = randomUUID(), bankMovement = randomUUID(), taxMovement = randomUUID(), ambiguousMovement = randomUUID()
      await tx.cuentaBancaria.create({ data: { id: accountId, banco: `${TAG}-BANCO`, iban: `ES00${TAG.replaceAll('-', '').slice(0, 28)}`, alias: TAG, activa: true, fechaCorteExtracto: DAY } })
      await tx.entidadFiscal.createMany({ data: [
        { id: entityId, tipo: 'PROVEEDOR', razonSocial: `${TAG} PROVEEDOR`, nifCif: 'B12345674', activo: true },
        { id: clientEntityId, tipo: 'CLIENTE', razonSocial: `${TAG} CLIENTE`, nifCif: 'B87654321', activo: true },
        { id: bankEntityId, tipo: 'AAPP', razonSocial: `${TAG} SANTANDER`, nifCif: 'S1234567A', activo: true },
        { id: taxEntityId, tipo: 'AAPP', razonSocial: `${TAG} AEAT`, nifCif: 'S9876543A', activo: true },
        { id: ambiguousA, tipo: 'PROVEEDOR', razonSocial: `${TAG} AMBIGUO`, nifCif: 'B23456785', activo: true },
        { id: ambiguousB, tipo: 'PROVEEDOR', razonSocial: `${TAG} AMBIGUO`, nifCif: 'B34567896', activo: true },
      ] })
      const movement = (id: string, amount: number, tercero: string, suffix: string) => tx.movimientoBancario.create({ data: { id, cuentaId: accountId, fechaOperacion: DAY, fechaValor: DAY, importe: amount, concepto: `${TAG} ${suffix}`, referencia: `${TAG}-${suffix}`, infoAdicional: TAG, tercero, hashUnico: `${TAG}-${randomUUID()}` } })
      await movement(firstId, -12.34, `${TAG} PROVEEDOR`, 'CARGO')
      await movement(secondId, 56.78, `${TAG} PROVEEDOR`, 'COBRO')
      await movement(confirmingClientMovement, 78.9, `${TAG} CLIENTE`, 'CONFIRMING')
      await movement(bankMovement, -4.56, `${TAG} SANTANDER`, 'BANCO')
      await movement(taxMovement, -1.23, `${TAG} AEAT`, 'IMPUESTO')
      await movement(ambiguousMovement, -1.25, `${TAG} AMBIGUO`, 'AMBIGUO')
      const legacyIds = [firstId, secondId, confirmingClientMovement, bankMovement, taxMovement, ambiguousMovement]
      const legacy = await tx.movimientoBancario.findMany({ where: { id: { in: legacyIds } }, orderBy: { id: 'asc' }, select: { id: true, entidadFiscalId: true, tercero: true, facturaId: true, facturaEmitidaId: true, nominaId: true, entregaACuentaEmpleadoId: true } })
      const input = { desde: '2044-02-03', hasta: '2044-02-03', limit: 25, offset: 0, q: TAG, sentido: 'TODOS' as const }
      const preview: any = await readEasyCounterpartyBulkPreviewTx(tx, input, actor)
      assert.equal(preview.totalPropuestosTexto, 6); assert.equal(preview.totalSinCoincidencia, 1); assert(!preview.items.some((x: any) => x.movimientoId===taxMovement), 'Una AAPP fiscal no se convierte en banco'); assert.equal(preview.totalElegibles, 3); assert.equal(preview.totalAmbiguos, 1); assert.equal(preview.totalRevisionContextual, 1)
      assert(!preview.items.some((x: any) => x.movimientoId === secondId), 'Un cobro con ficha proveedor queda fuera del bloque y sigue para revisión individual.')
      const confirmingPreview = preview.items.find((item: any) => item.movimientoId === confirmingClientMovement)
      assert(confirmingPreview && confirmingPreview.tipoTercero === 'CLIENTE', 'Un confirming/cobro con cliente existente exacto sí queda disponible para confirmación humana.')
      assert.equal(preview.items.length, 3); assert(preview.previewToken, 'La previsualización debe estar firmada')
      const bankPreview = preview.items.find((item: any) => item.movimientoId === bankMovement)
      assert(bankPreview && bankPreview.tipoTercero === 'BANCO', 'AAPP fiscal existente se reutiliza como BANCO, sin inferir cuenta propia')
      assert.equal(bankPreview.concepto, `${TAG} BANCO`); assert.equal(bankPreview.banco, `${TAG}-BANCO`); assert.equal(bankPreview.alias, TAG)
      const selected = preview.items.map((item: any) => ({ movimientoId: item.movimientoId, version: item.version, sugerenciaId: item.sugerenciaId, fingerprint: item.fingerprint }))
      const acceptance = { action: 'aceptar_seleccionados' as const, confirmacion: true as const, idempotencyKey: randomUUID(), previewToken: preview.previewToken, items: selected }
      await expectCode('SELECCION_CAMBIADA', () => runEasyCounterpartyBulkTx(tx, actor, { ...acceptance, idempotencyKey: randomUUID(), items: [{ ...selected[0], version: selected[0].version + 1 }] }))
      // A signed P1 preview is not authority to rewrite a provider as the client
      // expected by confirming. The transactional re-read rejects it before save.
      await tx.movimientoBancario.update({ where: { id: firstId }, data: { concepto: `${TAG} CONFIRMING` } })
      await expectCode('SELECCION_CAMBIADA', () => runEasyCounterpartyBulkTx(tx, actor, { ...acceptance, idempotencyKey: randomUUID() }))
      await tx.movimientoBancario.update({ where: { id: firstId }, data: { concepto: `${TAG} CARGO` } })

      // The header is written first by a real acceptance. This deliberately creates
      // only that header behind a SAVEPOINT to prove the deferred guard rejects an
      // interrupted package, and ROLLBACK TO SAVEPOINT leaves the outer proof usable.
      const partialLot = randomUUID()
      await tx.$executeRawUnsafe('SAVEPOINT easy_bulk_partial')
      await tx.$executeRaw`
        INSERT INTO lotes_tercero_modo_facil (id,actor_id,idempotency_key,request_hash,preview_hash,resumen,created_at)
        VALUES (CAST(${partialLot} AS uuid),${actor},CAST(${randomUUID()} AS uuid),${'a'.repeat(64)},${'b'.repeat(64)},
          jsonb_build_object(CAST('schema' AS text),CAST('EASY_COUNTERPARTY_BULK_RECEIPT_V1' AS text),CAST('aceptados' AS text),1,CAST('totales' AS text),jsonb_build_object()),CURRENT_TIMESTAMP)
      `
      await expectDeferredReject(() => tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE'))
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT easy_bulk_partial')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
      const absentPartial = await tx.$queryRaw<Array<{ count: string }>>`SELECT count(*)::text AS count FROM lotes_tercero_modo_facil WHERE id=CAST(${partialLot} AS uuid)`
      assert.equal(absentPartial[0]?.count, '0', 'El fallo intermedio no deja encabezado ni patas parciales.')

      const applied: any = await runEasyCounterpartyBulkTx(tx, actor, acceptance)
      assert.equal(applied.ok, true); assert.equal(applied.idempotente, false); assert.equal(applied.aceptados, 3)
      const replay: any = await runEasyCounterpartyBulkTx(tx, actor, acceptance)
      assert.equal(replay.ok, true); assert.equal(replay.idempotente, true); assert.equal(replay.loteId, applied.loteId)
      await expectCode('IDEMPOTENCIA_NO_COINCIDE', () => runEasyCounterpartyBulkTx(tx, actor, { ...acceptance, items: [{ ...selected[0] }] }))
      const p1 = await tx.$queryRaw<Array<any>>`SELECT movimiento_id,accion::text,tipo_tercero::text,snapshot FROM decisiones_tercero_modo_facil WHERE movimiento_id IN (${firstId},${secondId},${confirmingClientMovement},${bankMovement}) ORDER BY movimiento_id,created_at`
      assert.equal(p1.length, 3); assert(p1.every(row => row.accion === 'CONFIRMADA' && row.snapshot.bulkId === applied.loteId), 'Cada pata conserva su lote y no crea B4.')
      assert.equal(p1.find(row => row.movimiento_id === confirmingClientMovement)?.tipo_tercero, 'CLIENTE', 'El confirming conserva el cliente fiscal existente y no modifica su tipo.')
      assert.equal(p1.find(row => row.movimiento_id === bankMovement)?.tipo_tercero, 'BANCO', 'El recibo conserva BANCO sólo desde identidad fiscal existente.')
      assert.deepEqual(await tx.movimientoBancario.findMany({ where: { id: { in: legacyIds } }, orderBy: { id: 'asc' }, select: { id: true, entidadFiscalId: true, tercero: true, facturaId: true, facturaEmitidaId: true, nominaId: true, entregaACuentaEmpleadoId: true } }), legacy, 'Aceptar no altera movimientos, fuente documental ni estado legacy')
      const b4 = await tx.estadoJustificacionMovimientoB4.findMany({ where: { movimientoId: { in: legacyIds } } })
      assert.equal(b4.length, 0, 'Aceptar no crea estado B4')

      // First deferred phase: a completed acceptance validates before an undo exists.
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
      const undo = { action: 'deshacer_lote' as const, confirmacion: true as const, idempotencyKey: randomUUID(), loteId: applied.loteId }
      const undone: any = await runEasyCounterpartyBulkTx(tx, actor, undo)
      assert.equal(undone.ok, true); assert.equal(undone.revertidos, 3)
      const undoReplay: any = await runEasyCounterpartyBulkTx(tx, actor, undo)
      assert.equal(undoReplay.idempotente, true); assert.equal(undoReplay.revertidos, 3)
      const ledger = await tx.$queryRaw<Array<{ count: string }>>`SELECT count(*)::text AS count FROM decisiones_tercero_modo_facil WHERE movimiento_id IN (${firstId},${secondId},${confirmingClientMovement},${bankMovement})`
      assert.equal(ledger[0].count, '6', 'Aceptar y deshacer son recibos append-only, dos por movimiento')

      // Second deferred phase must accept the complete undo of an otherwise complete lot.
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      await tx.$executeRaw`UPDATE usuarios_admin SET activo=false WHERE id=${actor}`
      await expectCode('SIN_PERMISO_ACTUAL', () => runEasyCounterpartyBulkTx(tx, actor, acceptance))
      await expectCode('SIN_PERMISO_ACTUAL', () => runEasyCounterpartyBulkTx(tx, actor, undo))
      await expectCode('SIN_PERMISO_ACTUAL', () => runEasyCounterpartyBulkTx(tx, actor, { action: 'deshacer_lote', confirmacion: true, idempotencyKey: randomUUID(), loteId: applied.loteId }))
      completed = true; throw new RollbackOnly()
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 60_000 })
  } catch (error) { if (!(error instanceof RollbackOnly)) throw error }
  assert(completed, 'No se alcanzó el rollback obligatorio')
  assert.deepEqual(await snapshot(), before, 'El rollback alteró datos preexistentes')
  console.log(JSON.stringify({ passed: true, rollback: true, exact: true, bankExistingOnly: true, ambiguous: true, contextualFailClosed: true, contextualRevalidatedBeforeSave: true, changedVersion: true, intermediateSavepointRollback: true, deferredTwoPhase: true, permission: true, replay: true, replayRequiresLivePermission: true, undo: true, b4Unchanged: true, sourceInvoicesUnchanged: true }))
}
run().catch(error => { console.error('P1_BULK_COUNTERPARTY_POSTGRES_FAILED', error instanceof Error ? error.message.slice(0, 300) : 'desconocido'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
