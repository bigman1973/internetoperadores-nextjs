import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { EasyCounterpartyServiceError, mutateEasyCounterpartyTx } from '../lib/finanzas/easy-counterparty-db'
import { counterpartySuggestionId, EasyCounterpartyValidationError } from '../lib/finanzas/easy-counterparty-core'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'

/**
 * P1 third-party ledger proof. It is intentionally NOT an ordinary test: run it
 * only through the private staging runner after the parent P1 DDL is applied.
 * Every fixture and every receipt remains inside one SERIALIZABLE transaction
 * which ends with a deliberate rollback. It changes no B4/document/legacy field.
 *
 * node /home/ubuntu/finanzas-20261022-2012/ejecutar_privado.cjs staging scripts/test-finance-easy-counterparty-postgres.ts
 */
const TAG = `P1-COUNTERPARTY-ROLLBACK-${randomUUID()}`
const DAY = new Date(Date.UTC(2044, 1, 3, 10, 0, 0))
type Tx = any
class RollbackOnly extends Error { constructor() { super('P1_COUNTERPARTY_ROLLBACK_ONLY') } }

function actorId(): number {
  const value = Number(process.env.FINANCE_P1_ACTOR_ID)
  assert(Number.isSafeInteger(value) && value > 0, 'FINANCE_P1_ACTOR_ID debe venir del runner privado')
  return value
}
async function snapshot() {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>`
    SELECT jsonb_object_agg(nombre,jsonb_build_object('count',cantidad,'hash',huella)) AS snapshot FROM (
      SELECT 'movimientos_bancarios' nombre,count(*)::text cantidad,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) huella FROM movimientos_bancarios t
      UNION ALL SELECT 'entidades_fiscales',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM entidades_fiscales t
      UNION ALL SELECT 'decisiones_tercero_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM decisiones_tercero_modo_facil t
      UNION ALL SELECT 'estado_justificacion_movimientos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id),'')) FROM estado_justificacion_movimientos t
    ) x
  `
  assert.equal(rows.length, 1)
  return rows[0].snapshot
}
async function expectP1(code: string, work: () => Promise<unknown>) {
  try { await work() } catch (error) {
    assert(error instanceof EasyCounterpartyServiceError || error instanceof EasyCounterpartyValidationError, `Se esperaba error P1 ${code}`)
    assert.equal(error.code, code)
    return
  }
  assert.fail(`Debía rechazar ${code}`)
}

async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.equal(process.env.VERCEL_ENV, 'preview', 'VERCEL_ENV=preview es obligatorio')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'Las acciones externas deben estar deshabilitadas')
  const actor = actorId()
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }, 'Sólo staging aislado')
  const access = await requireB4ActorAccess(actor, 'escritura')
  assert(access.ok, 'El actor debe tener escritura B4 viva')
  const p1 = await prisma.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass('decisiones_tercero_modo_facil')::text AS name
    UNION ALL SELECT to_regclass('perfiles_acceso_modo_facil')::text
  `
  assert(p1.every(row => row.name !== null), 'Aplicar antes DDL padre de perfiles y DDL P1')
  const before = await snapshot()
  let completed = false
  try {
    await prisma.$transaction(async (tx: Tx) => {
      const accountId = randomUUID()
      const movementId = randomUUID()
      const entityId = randomUUID()
      await tx.cuentaBancaria.create({ data: { id: accountId, banco: `${TAG}-BANCO`, iban: `ES00${TAG.replaceAll('-', '').slice(0, 28)}`, alias: TAG, activa: true, fechaCorteExtracto: DAY } })
      await tx.entidadFiscal.create({ data: { id: entityId, tipo: 'PROVEEDOR', razonSocial: `${TAG}-PROVEEDOR`, nifCif: 'B12345674', activo: true } })
      await tx.movimientoBancario.create({ data: {
        id: movementId, cuentaId: accountId, fechaOperacion: DAY, fechaValor: DAY, importe: -12.34,
        concepto: `${TAG} pago`, referencia: `${TAG}-REF`, infoAdicional: TAG, tercero: `${TAG}-TEXTO-BANCARIO`,
        entidadFiscalId: entityId, hashUnico: `${TAG}-${randomUUID()}`,
      } })
      const legacy = await tx.movimientoBancario.findUniqueOrThrow({ where: { id: movementId }, select: {
        entidadFiscalId: true, tercero: true, facturaId: true, facturaEmitidaId: true, nominaId: true, entregaACuentaEmpleadoId: true,
      } })
      const suggestion = counterpartySuggestionId({ movimientoId: movementId, tipoTercero: 'PROVEEDOR', origen: 'ENTIDAD_FISCAL', sourceIdentity: `EF:${entityId}` })
      const payload = { action: 'confirmar' as const, movimientoId: movementId, version: 0, sugerenciaId: suggestion, idempotencyKey: randomUUID(), confirmacion: true as const }

      // Explicit confirmation is required; no browser-owned type/name/source enters.
      await expectP1('CONFIRMACION_REQUERIDA', () => mutateEasyCounterpartyTx(tx, actor, { ...payload, confirmacion: false }))
      const confirmed: any = await mutateEasyCounterpartyTx(tx, actor, payload)
      assert.equal(confirmed.ok, true); assert.equal(confirmed.idempotente, false); assert.equal(confirmed.movimientoId, movementId)
      const confirmedRows = await tx.$queryRaw<Array<any>>`
        SELECT accion::text,origen::text,snapshot,actor_id FROM decisiones_tercero_modo_facil WHERE id=CAST(${confirmed.decisionId} AS uuid)
      `
      assert.equal(confirmedRows.length, 1); assert.equal(confirmedRows[0].accion, 'CONFIRMADA'); assert.equal(confirmedRows[0].origen, 'ENTIDAD_FISCAL')
      assert.equal(confirmedRows[0].snapshot.label.includes(TAG), true, 'La evidencia se conserva en snapshot, no como FK editable')
      assert.deepEqual(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: movementId }, select: {
        entidadFiscalId: true, tercero: true, facturaId: true, facturaEmitidaId: true, nominaId: true, entregaACuentaEmpleadoId: true,
      } }), legacy, 'P1 no cambia FK ni texto legacy')
      const b4 = await tx.estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: movementId } })
      assert.equal(b4, null, 'P1 no crea ni modifica estado B4')

      // Same UUID/payload returns the immutable receipt; a changed payload cannot be adopted.
      const replay: any = await mutateEasyCounterpartyTx(tx, actor, payload)
      assert.equal(replay.idempotente, true); assert.equal(replay.decisionId, confirmed.decisionId)
      await expectP1('IDEMPOTENCY_PAYLOAD_MISMATCH', () => mutateEasyCounterpartyTx(tx, actor, { ...payload, version: 1 }))
      await expectP1('REVERSION_REQUERIDA', () => mutateEasyCounterpartyTx(tx, actor, { ...payload, idempotencyKey: randomUUID(), version: 1 }))

      // Append-only undo increments the P1 ledger version (0 -> 1 confirm -> 2 revert); no active version=0 bug.
      const undoPayload = { action: 'revertir' as const, decisionId: confirmed.decisionId, version: 1, idempotencyKey: randomUUID(), confirmacion: true as const }
      const undone: any = await mutateEasyCounterpartyTx(tx, actor, undoPayload)
      assert.equal(undone.ok, true); assert.equal(undone.accion, 'REVERTIDA')
      const undoReplay: any = await mutateEasyCounterpartyTx(tx, actor, undoPayload)
      assert.equal(undoReplay.idempotente, true); assert.equal(undoReplay.decisionId, undone.decisionId)
      const version = await tx.$queryRaw<Array<{ count: string }>>`SELECT count(*)::text AS count FROM decisiones_tercero_modo_facil WHERE movimiento_id=${movementId}`
      assert.equal(version[0].count, '2', 'Confirmación y reversión son dos filas append-only')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      completed = true
      throw new RollbackOnly()
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 120_000 })
  } catch (error) { if (!(error instanceof RollbackOnly)) throw error }
  assert(completed, 'No se alcanzó el rollback obligatorio')
  assert.deepEqual(await snapshot(), before, 'El rollback alteró datos preexistentes')
  console.log(JSON.stringify({ passed: true, rollback: true, manualConfirm: true, idempotent: true, undo: true, b4Unchanged: true, legacyUnchanged: true }))
}

run().catch(error => { console.error('P1_COUNTERPARTY_POSTGRES_FAILED', error instanceof Error ? error.message.slice(0, 300) : 'desconocido'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
