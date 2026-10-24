import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import prisma from '../lib/prisma'
import { confirmEasyReconciliationTx } from '../lib/finanzas/easy-reconciliation-db'
import { EasyUndoServiceError, undoEasyTx } from '../lib/finanzas/easy-reconciliation-undo'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'

/**
 * Private staging-only proof. It uses one outer SERIALIZABLE transaction and an
 * intentional rollback; it creates no Drive/Graph/email/sync side effect.
 *
 * Run only from the private staging runner after Modo Fácil DDL:
 * node /home/ubuntu/finanzas-20261022-2012/ejecutar_privado.cjs staging scripts/test-finance-easy-undo-postgres.ts
 */
const TAG = `MF-UNDO-ROLLBACK-${randomUUID()}`
const DAY = new Date(Date.UTC(2044, 1, 3, 10, 0, 0))
type Tx = any
class RollbackOnly extends Error { constructor() { super('MODO_FACIL_UNDO_ROLLBACK_ONLY') } }

function actorId(): number {
  const value = Number(process.env.FINANCE_P1_ACTOR_ID)
  assert(Number.isSafeInteger(value) && value > 0, 'FINANCE_P1_ACTOR_ID debe venir del runner privado')
  return value
}

async function snapshot() {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>`
    SELECT jsonb_object_agg(nombre,jsonb_build_object('count',cantidad,'hash',huella)) AS snapshot FROM (
      SELECT 'cuentas_bancarias' nombre,count(*)::text cantidad,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) huella FROM cuentas_bancarias t
      UNION ALL SELECT 'movimientos_bancarios',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM movimientos_bancarios t
      UNION ALL SELECT 'estado_justificacion_movimientos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id::text),'')) FROM estado_justificacion_movimientos t
      UNION ALL SELECT 'vinculos_movimiento_documento',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM vinculos_movimiento_documento t
      UNION ALL SELECT 'operaciones_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM operaciones_justificacion_b4 t
      UNION ALL SELECT 'eventos_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM eventos_justificacion_b4 t
      UNION ALL SELECT 'recibos_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM recibos_modo_facil t
    ) x
  `
  assert.equal(rows.length, 1, 'No se pudo tomar el snapshot global')
  return rows[0].snapshot
}

async function expectUndo(code: string, work: () => Promise<unknown>) {
  try { await work() } catch (error) {
    assert(error instanceof EasyUndoServiceError, `Se esperaba EasyUndoServiceError ${code}`)
    assert.equal(error.code, code)
    return
  }
  assert.fail(`Debía rechazar ${code}`)
}

async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.equal(process.env.VERCEL_ENV, 'preview', 'VERCEL_ENV=preview es obligatorio')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'FINANCE_EXTERNAL_ACTIONS_DISABLED=1 es obligatorio')
  const actor = actorId()
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }, 'Sólo staging aislado')
  const access = await requireB4ActorAccess(actor, 'escritura')
  assert(access.ok, 'El actor P1 debe conservar acceso B4 de escritura')
  const receiptTable = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT to_regclass('recibos_modo_facil')::text AS name`
  assert.notEqual(receiptTable[0]?.name, null, 'Aplicar antes el DDL de recibos Modo Fácil')

  const before = await snapshot()
  let completed = false
  try {
    await prisma.$transaction(async (tx: Tx) => {
      const account = await tx.cuentaBancaria.create({
        data: { id: randomUUID(), banco: `${TAG}-BANCO`, iban: `ES00${TAG.replaceAll('-', '').slice(0, 28)}`, alias: TAG, activa: true, fechaCorteExtracto: DAY },
        select: { id: true },
      })
      const movimientoId = randomUUID()
      await tx.movimientoBancario.create({ data: {
        id: movimientoId, cuentaId: account.id, fechaOperacion: DAY, fechaValor: DAY, importe: -0.01,
        concepto: `${TAG} COMISION BANCARIA DE MANTENIMIENTO`, referencia: `${TAG}-REF`, infoAdicional: TAG,
        tercero: `${TAG}-BANCO`, hashUnico: `${TAG}-${randomUUID()}`,
      } })

      const confirmed: any = await confirmEasyReconciliationTx(tx, actor, {
        action: 'no_requiere', movimientoId, version: 1, motivoNoRequiere: 'COMISION_BANCARIA',
        idempotencyKey: randomUUID(), confirmacion: true,
      })
      assert.equal(confirmed.ok, true)
      assert.equal(confirmed.reversible, true)
      const undoPayload = { action: 'deshacer' as const, confirmacion: true as const, operacionId: confirmed.operacionId, idempotencyKey: randomUUID() }
      const undone: any = await undoEasyTx(tx, actor, undoPayload)
      assert.deepEqual(undone, { ok: true, idempotente: false }, 'La reversión debe aplicar una sola vez')
      const state = await tx.estadoJustificacionMovimientoB4.findUniqueOrThrow({ where: { movimientoId } })
      assert.equal(state.estado, 'SIN_DOCUMENTO')
      assert.equal(state.version, 3)
      const replay: any = await undoEasyTx(tx, actor, undoPayload)
      assert.deepEqual(replay, { ok: true, idempotente: true }, 'Mismo actor y UUID repiten la reversión ya aplicada')
      await expectUndo('OPERACION_NO_REVERSIBLE', () => undoEasyTx(tx, actor, { ...undoPayload, idempotencyKey: randomUUID() }))
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      completed = true
      throw new RollbackOnly()
    }, { isolationLevel: 'Serializable', maxWait: 15_000, timeout: 120_000 })
  } catch (error) {
    if (!(error instanceof RollbackOnly)) throw error
  }
  assert(completed, 'No se alcanzó el rollback obligatorio')
  assert.deepEqual(await snapshot(), before, 'El rollback alteró datos preexistentes')
  console.log(JSON.stringify({ passed: true, rollback: true, confirmation: true, undo: true, replay: true, changedKeyRejected: true }))
}

run()
  .catch((error) => { console.error('MODO_FACIL_UNDO_POSTGRES_FAILED', error instanceof Error ? error.message.slice(0, 300) : 'desconocido'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
