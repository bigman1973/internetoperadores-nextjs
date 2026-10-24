/*
 * Automatización restringida — integración PostgreSQL staging con rollback total.
 *
 * Ejecutar sólo DESPUÉS de aplicar, en este orden, las migraciones P1 y
 * 20261024_easy_restricted_automation:
 * FINANCE_STAGING_SANDBOX=1 VERCEL_ENV=preview FINANCE_EXTERNAL_ACTIONS_DISABLED=1 \
 * FINANCE_EASY_AUTO_ROLLBACK_TEST=1 FINANCE_EASY_AUTO_ACTOR_FILE=/ruta/actor-0600 \
 * npx tsx scripts/test-finance-easy-auto-postgres.ts
 *
 * No hay red, Azure, correo, ISP ni OneDrive. Todas las filas fixture y todos
 * los recibos B4/P1 se insertan en una única transacción SERIALIZABLE que acaba
 * en ROLLBACK. La población real de staging se lee sólo como baseline: los
 * candidatos fixture se fabrican delante de ella en el orden de fingerprint.
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, lstatSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { assertPrototypeStaging } from '../lib/finanzas/prototype-staging'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'
import { canManageEasyAutomationStage } from '../lib/finanzas/easy-access-profile'
import {
  selectBilateralTransfers,
  selectPureBankCommissions,
  type EasyAutoMovement,
} from '../lib/finanzas/easy-auto-core'
import {
  deshacerAutoPairTx,
  executeEasyAutomationTx,
  previewEasyAutomationTx,
} from '../lib/finanzas/easy-auto-db'

const TAG = `EASY-AUTO-ROLLBACK-${randomUUID()}`
const FIXTURE_LIMIT = 2
// Equal to the maximum exact signed-cent range accepted by the core. This puts
// fixtures ahead of every lower-value staging candidate; UUID retries settle the
// deterministic fingerprint tie if a staging candidate already has this amount.
const FIXTURE_CENTS = 2_147_483_600
const FIXTURE_AMOUNT = FIXTURE_CENTS / 100
class RollbackOnly extends Error { constructor() { super('EASY_AUTO_ROLLBACK_ONLY') } }
class MidPackageFailure extends Error { constructor() { super('EASY_AUTO_MID_PACKAGE_FAILURE') } }
type Tx = any
type FixtureIds = Readonly<{ transferOut: string; transferIn: string; commission: string }>
let phase = 'inicio'

function actorId(): number {
  const file = process.env.FINANCE_EASY_AUTO_ACTOR_FILE
  assert(file, 'FINANCE_EASY_AUTO_ACTOR_FILE es obligatorio')
  const stat = lstatSync(file)
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600 && stat.uid === process.getuid?.(), 'El fichero de actor debe ser regular, privado 0600 y del usuario actual')
  const actor = Number(readFileSync(file, 'utf8').trim())
  assert(Number.isSafeInteger(actor) && actor > 0, 'El actor privado no es válido')
  return actor
}

async function tableCount(table: string): Promise<number> {
  assert(/^[a-z0-9_]+$/.test(table), 'Tabla no permitida')
  const rows = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}"`) as Array<{ n: number }>
  return Number(rows[0]?.n ?? 0)
}
async function counts() {
  const tables = [
    'cuentas_bancarias', 'movimientos_bancarios', 'estado_justificacion_movimientos', 'operaciones_justificacion_b4',
    'eventos_justificacion_b4', 'decisiones_tercero_modo_facil', 'politicas_auto_modo_facil',
    'atestaciones_cuenta_auto_modo_facil', 'terceros_banco_auto_modo_facil', 'ejecuciones_auto_modo_facil',
    'recibos_auto_modo_facil', 'patas_recibo_auto_modo_facil', 'reversiones_auto_modo_facil', 'patas_reversion_auto_modo_facil',
  ]
  return Object.fromEntries(await Promise.all(tables.map(async table => [table, await tableCount(table)])))
}

function movementShape(id: string, cuentaId: string, fecha: string, importeCentimos: number, concepto: string, bancoCuenta: string): EasyAutoMovement {
  return { id, cuentaId, fecha, importeCentimos, versionB4: 1, concepto, referencia: null, infoAdicional: null, tercero: null, bancoCuenta }
}

/**
 * Existing staging candidates are a read-only baseline. We choose synthetic IDs
 * whose maximum exact amount is first by design and whose SHA-256 fingerprints
 * settle only a possible equal-amount tie before the first baseline candidate.
 * Thus the fixed API limit of two selects exactly the transfer and commission
 * fixtures, without a test-only production API or applying real-staging items.
 */
function chooseFixtureIds(accountIds: Readonly<{ ownA: string; ownB: string; commission: string }>, baseline: readonly { fingerprint: string }[]): FixtureIds {
  const ceiling = baseline[0]?.fingerprint ?? null
  const beforeBaseline = (fingerprint: string) => ceiling === null || fingerprint.localeCompare(ceiling) < 0
  let transfer: Pick<FixtureIds, 'transferOut' | 'transferIn'> | null = null
  let commission: Pick<FixtureIds, 'commission'> | null = null
  for (let attempts = 0; attempts < 200_000 && (!transfer || !commission); attempts += 1) {
    if (!transfer) {
      const transferOut = randomUUID()
      const transferIn = randomUUID()
      const candidate = selectBilateralTransfers([
        movementShape(transferOut, accountIds.ownA, '2026-06-02', -FIXTURE_CENTS, 'TRANSFERENCIA INTERNA', 'Banco A Fixture'),
        movementShape(transferIn, accountIds.ownB, '2026-06-04', FIXTURE_CENTS, 'TRASPASO ENTRE CUENTAS', 'Banco B Fixture'),
      ])[0]
      if (candidate && beforeBaseline(candidate.fingerprint)) transfer = { transferOut, transferIn }
    }
    if (!commission) {
      const candidateId = randomUUID()
      const candidate = selectPureBankCommissions([
        movementShape(candidateId, accountIds.commission, '2026-07-01', -FIXTURE_CENTS, 'COMISIÓN BANCARIA DE MANTENIMIENTO', 'Banco Comisión Derivado'),
      ])[0]
      if (candidate && beforeBaseline(candidate.fingerprint)) commission = { commission: candidateId }
    }
  }
  assert(transfer && commission, 'No se pudieron ordenar los fixtures antes del baseline staging dentro del límite seguro')
  return { ...transfer, ...commission }
}

async function fixtureOutputCounts(tx: Tx, fixtureMovementIds: readonly string[]) {
  const rows = await tx.$queryRaw(Prisma.sql`
    SELECT
      (SELECT count(*)::int FROM patas_recibo_auto_modo_facil WHERE movimiento_id IN (${Prisma.join(fixtureMovementIds.map(id => Prisma.sql`${id}`))})) AS receipt_legs,
      (SELECT count(*)::int FROM operaciones_justificacion_b4 WHERE movimiento_id IN (${Prisma.join(fixtureMovementIds.map(id => Prisma.sql`${id}`))})) AS b4_operations,
      (SELECT count(*)::int FROM decisiones_tercero_modo_facil WHERE movimiento_id IN (${Prisma.join(fixtureMovementIds.map(id => Prisma.sql`${id}`))})) AS p1_decisions
  `) as Array<{ receipt_legs: number; b4_operations: number; p1_decisions: number }>
  return rows[0] ?? { receipt_legs: 0, b4_operations: 0, p1_decisions: 0 }
}

async function main() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.equal(process.env.VERCEL_ENV, 'preview', 'VERCEL_ENV=preview es obligatorio')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'FINANCE_EXTERNAL_ACTIONS_DISABLED=1 es obligatorio')
  assert.equal(process.env.FINANCE_EASY_AUTO_ROLLBACK_TEST, '1', 'FINANCE_EASY_AUTO_ROLLBACK_TEST=1 es obligatorio')
  await assertPrototypeStaging()
  const actor = actorId()
  assert(await canManageEasyAutomationStage(actor), 'El actor privado no puede gestionar automatización staging')
  const b4 = await requireB4ActorAccess(actor, 'escritura')
  assert(b4.ok, 'El actor privado no conserva escritura B4')
  const before = await counts()
  let completed = false
  try {
    await prisma.$transaction(async (tx: Tx) => {
      const activePolicies = await tx.$queryRaw(Prisma.sql`
        SELECT id::text FROM politicas_auto_modo_facil
        WHERE politica_key='MODO_FACIL_AUTO_RESTRINGIDA_STAGING_20261024' AND entorno='STAGING' AND estado='ACTIVA'
          AND datos_desde=DATE '2026-01-01' AND datos_hasta=DATE '2026-10-08'
        ORDER BY autorizada_en DESC,created_at DESC,id DESC LIMIT 1 FOR KEY SHARE
      `) as Array<{ id: string }>
      const policyId = activePolicies[0]?.id ?? randomUUID()
      if (!activePolicies.length) await tx.$executeRaw(Prisma.sql`
        INSERT INTO politicas_auto_modo_facil (id,politica_key,entorno,estado,datos_desde,datos_hasta,autorizada_en,referencia_autorizacion,creada_por_id,created_at)
        VALUES (CAST(${policyId} AS uuid),'MODO_FACIL_AUTO_RESTRINGIDA_STAGING_20261024','STAGING','ACTIVA',DATE '2026-01-01',DATE '2026-10-08',CURRENT_DATE,${`${TAG} autorización Víctor 24/10/2026`},${actor},CURRENT_TIMESTAMP)
      `)

      const baseline = await previewEasyAutomationTx(tx, { action: 'previsualizar', desde: '2026-01-01', hasta: '2026-10-08', limite: 100 })
      const account = async (id: string, bank: string, suffix: string) => tx.cuentaBancaria.create({ data: {
        id, banco: bank, iban: `ES00${TAG.replaceAll('-', '').replaceAll('_', '').slice(0, 18)}${suffix}`.slice(0, 34),
        alias: `${TAG}-${suffix}`, activa: true, fechaCorteExtracto: new Date('2026-10-08T00:00:00.000Z'),
      }, select: { id: true } })
      const ownA = await account(randomUUID(), 'Banco A Fixture', '01')
      const ownB = await account(randomUUID(), 'Banco B Fixture', '02')
      const commissionAccount = await account(randomUUID(), 'Banco Comisión Derivado', '03')
      const fixture = chooseFixtureIds({ ownA: ownA.id, ownB: ownB.id, commission: commissionAccount.id }, baseline.candidates)
      let sequence = 0
      const movement = async (id: string, cuentaId: string, day: string, amount: number, balance: number | null, label: string, concept: string) => {
        sequence += 1
        return tx.movimientoBancario.create({ data: {
          id, cuentaId, fechaOperacion: new Date(`${day}T12:00:00.000Z`), fechaValor: new Date(`${day}T12:00:00.000Z`),
          importe: amount, saldo: balance, concepto: concept, referencia: `${TAG}-${label}`, infoAdicional: null, tercero: null,
          hashUnico: `${TAG}-${label}-${sequence}-${randomUUID()}`,
        }, select: { id: true } })
      }
      // Exact local paths: each transfer leg has one predecessor and successor.
      await movement(randomUUID(), ownA.id, '2026-06-01', FIXTURE_AMOUNT, FIXTURE_AMOUNT, 'A-PRE', 'Abono previo')
      const transferOut = await movement(fixture.transferOut, ownA.id, '2026-06-02', -FIXTURE_AMOUNT, 0, 'A-TRANSFER', 'TRANSFERENCIA INTERNA')
      await movement(randomUUID(), ownA.id, '2026-06-03', 1, 1, 'A-POST', 'Movimiento posterior')
      await movement(randomUUID(), ownB.id, '2026-06-01', 0, 0, 'B-PRE', 'Abono previo')
      const transferIn = await movement(fixture.transferIn, ownB.id, '2026-06-04', FIXTURE_AMOUNT, FIXTURE_AMOUNT, 'B-TRANSFER', 'TRASPASO ENTRE CUENTAS')
      await movement(randomUUID(), ownB.id, '2026-06-05', -1, FIXTURE_AMOUNT - 1, 'B-POST', 'Movimiento posterior')
      // An intentionally distant missing balance must not veto the local paths above.
      await movement(randomUUID(), ownA.id, '2026-09-28', -1, null, 'A-DISTANT-MISSING', 'Apunte distante sin saldo')
      // No attestation or balance chain is added for this commission account.
      const commission = await movement(fixture.commission, commissionAccount.id, '2026-07-01', -FIXTURE_AMOUNT, null, 'COMMISSION', 'COMISIÓN BANCARIA DE MANTENIMIENTO')
      const fixtureMovementIds = [transferOut.id, transferIn.id, commission.id]
      for (const accountId of [ownA.id, ownB.id]) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO atestaciones_cuenta_auto_modo_facil (id,politica_id,cuenta_id,version,titular_declarado,cif_titular,referencia_evidencia,confirmacion_titularidad_io,actor_id,snapshot,created_at)
          VALUES (gen_random_uuid(),CAST(${policyId} AS uuid),${accountId},1,'Internet Operadores fixture',NULL,${`${TAG} evidencia de titularidad`},true,${actor},jsonb_build_object('schema','EASY_AUTO_ACCOUNT_ATTESTATION_V1','origen','REGLA','cuentaId',${accountId},'confirmacionTitularidadIo',true),CURRENT_TIMESTAMP)
        `)
      }

      const preview = await previewEasyAutomationTx(tx, { action: 'previsualizar', desde: '2026-01-01', hasta: '2026-10-08', limite: FIXTURE_LIMIT })
      const selectedFixtureMovementIds = preview.candidates.flatMap(candidate => candidate.movimientos.map(movement => movement.id)).sort()
      assert.deepEqual(selectedFixtureMovementIds, [...fixtureMovementIds].sort(), 'El límite cerrado debe seleccionar sólo los tres movimientos fixture, no población staging')
      assert.equal(preview.candidates.filter(candidate => candidate.clase === 'TRASPASO_PROPIO').length, 1, 'El traspaso local exacto debe sobrevivir al saldo lejano ausente')
      assert.equal(preview.candidates.filter(candidate => candidate.clase === 'COMISION_BANCARIA').length, 1, 'La comisión pura debe existir sin atestación/cadena/preregistro')
      assert.equal(preview.bloqueados.filter(candidate => candidate.movimientos.some(movement => fixtureMovementIds.includes(movement.id))).length, 0, 'Las dos cuentas propias fixture están atestadas')

      // Simulate an application failure after the first selected fixture. The
      // savepoint rollback must erase its B4, P1 and receipt legs atomically.
      const midPreview = await previewEasyAutomationTx(tx, { action: 'previsualizar', desde: '2026-01-01', hasta: '2026-10-08', limite: 1 })
      await tx.$executeRawUnsafe('SAVEPOINT easy_auto_mid_package')
      try {
        phase = 'fallo_intermedio_aplicar_una'
        const midApplied = await executeEasyAutomationTx(tx, actor, {
          action: 'ejecutar', desde: '2026-01-01', hasta: '2026-10-08', limite: 1,
          idempotencyKey: randomUUID(), reviewHash: midPreview.reviewHash, confirmacion: true as const,
        })
        assert.equal(midApplied.counts.aplicados, 1, 'La simulación debe alcanzar la primera unidad antes del fallo')
        throw new MidPackageFailure()
      } catch (error) {
        if (!(error instanceof MidPackageFailure)) throw error
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT easy_auto_mid_package')
      }
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT easy_auto_mid_package')
      assert.deepEqual(await fixtureOutputCounts(tx, fixtureMovementIds), { receipt_legs: 0, b4_operations: 0, p1_decisions: 0 }, 'El fallo intermedio no puede dejar media aplicación B4/P1/recibo')

      const execution = {
        action: 'ejecutar' as const, desde: '2026-01-01', hasta: '2026-10-08', limite: FIXTURE_LIMIT,
        idempotencyKey: randomUUID(), reviewHash: preview.reviewHash, confirmacion: true as const,
      }
      phase = 'lote_fixture_aplicar_dos'
      const applied = await executeEasyAutomationTx(tx, actor, execution)
      assert.equal(applied.counts.aplicados, 2, 'El lote fixture debe aplicar un traspaso y una comisión')
      assert.equal(applied.operations.find(operation => operation.clase === 'TRASPASO_PROPIO')?.operacionesB4.length, 2)
      assert.equal(applied.operations.find(operation => operation.clase === 'COMISION_BANCARIA')?.operacionesB4.length, 1)
      const receiptIds = applied.operations.map(operation => operation.operationId)
      const appliedLegs = await tx.$queryRaw(Prisma.sql`
        SELECT movimiento_id FROM patas_recibo_auto_modo_facil
        WHERE recibo_id IN (${Prisma.join(receiptIds.map(id => Prisma.sql`CAST(${id} AS uuid)`))})
        ORDER BY movimiento_id ASC
      `) as Array<{ movimiento_id: string }>
      assert.deepEqual(appliedLegs.map(row => row.movimiento_id), [...fixtureMovementIds].sort(), 'Las operaciones aplicadas sólo pueden contener patas fixture')

      // Same request key is the post-commit response-loss simulation: replay is
      // resolved from the durable execution before any candidate selection.
      phase = 'replay_misma_clave'
      const replay = await executeEasyAutomationTx(tx, actor, execution)
      assert.equal(replay.counts.aplicados, 0)
      assert.equal(replay.counts.replays, 2, 'La misma clave debe recuperar recibos antes de cualquier nueva selección')
      assert.deepEqual(replay.operations.map(operation => operation.operationId).sort(), [...receiptIds].sort(), 'El replay devuelve los mismos recibos, no crea otros')

      const p1 = await tx.$queryRaw(Prisma.sql`
        SELECT tipo_tercero::text AS tipo,count(*)::int AS n FROM decisiones_tercero_modo_facil
        WHERE actor_id=${actor} AND movimiento_id IN (${Prisma.join(fixtureMovementIds.map(id => Prisma.sql`${id}`))})
          AND snapshot->>'autoReceiptId' IN (${Prisma.join(receiptIds.map(id => Prisma.sql`${id}`))})
        GROUP BY tipo_tercero ORDER BY tipo_tercero
      `)
      assert.deepEqual(p1, [{ tipo: 'BANCO', n: 1 }, { tipo: 'CUENTA_PROPIA', n: 2 }], 'P1 AUTO_RECIBO debe acompañar cada pata fixture en el mismo tx')
      const bankP1Label = await tx.$queryRaw(Prisma.sql`
        SELECT d.snapshot->>'label' AS label FROM decisiones_tercero_modo_facil d
        WHERE d.actor_id=${actor} AND d.movimiento_id=${commission.id}
          AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" AND d.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
        LIMIT 1
      `) as Array<{ label: string | null }>
      assert.deepEqual(bankP1Label, [{ label: 'BANCO COMISION DERIVADO' }], 'La etiqueta P1 bancaria debe venir del tercero bancario derivado e inmutable, nunca de m.tercero')
      const ruleEvents = await tx.$queryRaw(Prisma.sql`
        SELECT count(*)::int AS n FROM eventos_justificacion_b4 e
        JOIN patas_recibo_auto_modo_facil p ON p.operacion_b4_id=e.operacion_id
        WHERE p.recibo_id IN (${Prisma.join(receiptIds.map(id => Prisma.sql`CAST(${id} AS uuid)`))})
          AND e.detalle->>'schema'='EASY_AUTO_ORIGIN_V1' AND e.detalle->>'origen'='REGLA'
      `) as Array<{ n: number }>
      assert.equal(ruleEvents[0]?.n, 3, 'Cada pata fixture debe conservar origen REGLA en B4')
      const thirdParty = await tx.$queryRaw(Prisma.sql`
        SELECT nombre_normalizado AS nombre,snapshot->>'derivadoDeCuentaBanco' AS derived
        FROM terceros_banco_auto_modo_facil WHERE politica_id=CAST(${policyId} AS uuid) AND cuenta_id=${commissionAccount.id}
      `)
      assert.deepEqual(thirdParty, [{ nombre: 'BANCO COMISION DERIVADO', derived: 'true' }], 'El banco cobrador se deriva de CuentaBancaria.banco, no de m.tercero')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      // La reversión es otra operación atómica: las guardas se evalúan cuando
      // estén presentes P1, ambas patas B4 y el recibo de reversión completo.
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')

      const transferReceipt = applied.operations.find(operation => operation.clase === 'TRASPASO_PROPIO')!
      const undo = { action: 'deshacer' as const, operationId: transferReceipt.operationId, idempotencyKey: randomUUID(), confirmacion: true as const }
      phase = 'deshacer_traspaso'
      const undone = await deshacerAutoPairTx(tx, actor, undo)
      assert.equal(undone.noop, false)
      assert.equal(undone.operacionesB4Reversion.length, 2)
      const undoReplay = await deshacerAutoPairTx(tx, actor, undo)
      assert.equal(undoReplay.noop, true, 'La misma clave de reversión no crea patas nuevas')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      const revertedP1 = await tx.$queryRaw(Prisma.sql`
        SELECT count(*)::int AS n FROM decisiones_tercero_modo_facil d
        WHERE d.actor_id=${actor} AND d.movimiento_id IN (${Prisma.join([transferOut.id, transferIn.id].map(id => Prisma.sql`${id}`))})
          AND d.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil"
          AND d.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
          AND d.snapshot->>'autoReceiptId'=${transferReceipt.operationId}
      `) as Array<{ n: number }>
      assert.equal(revertedP1[0]?.n, 2, 'Deshacer traspaso revierte las dos patas P1 en el mismo tx')
      const reversalLegs = await tx.$queryRaw(Prisma.sql`
        SELECT count(*)::int AS n FROM patas_reversion_auto_modo_facil pr
        JOIN reversiones_auto_modo_facil r ON r.id=pr.reversion_id
        WHERE r.recibo_id=CAST(${transferReceipt.operationId} AS uuid)
      `) as Array<{ n: number }>
      assert.equal(reversalLegs[0]?.n, 2, 'Deshacer traspaso revierte atómicamente las dos patas B4')
      const legacy = await tx.movimientoBancario.findMany({ where: { id: { in: fixtureMovementIds } }, select: { id: true, tercero: true, entidadFiscalId: true, traspasoRelacionadoId: true } })
      assert(legacy.every(row => row.tercero === null && row.entidadFiscalId === null && row.traspasoRelacionadoId === null), 'No se mutan campos legacy de identidad o traspaso')
      completed = true
      phase = 'rollback_final'
      throw new RollbackOnly()
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 120_000 })
  } catch (error) {
    if (!(error instanceof RollbackOnly)) throw error
  }
  assert(completed, 'No se alcanzó el rollback obligatorio')
  assert.deepEqual(await counts(), before, 'El rollback alteró alguna fila preexistente')
  console.log(JSON.stringify({ passed: true, rollback: true, stagingOnly: true, syntheticFixtures: true, stagingBaselineIsolated: true, localBalanceNeighborhoods: true, midPackageRollback: true, commissionDerivedFromAccount: true, p1Atomic: true, b4RuleOrigin: true, undoP1Atomic: true, undoB4Atomic: true, sameKeyPostCommitReplay: true, legacyUnchanged: true }))
}

main().catch(error => {
  console.error('EASY_AUTO_POSTGRES_FAILED', phase, error instanceof Error ? error.message.slice(0, 300) : 'desconocido')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
