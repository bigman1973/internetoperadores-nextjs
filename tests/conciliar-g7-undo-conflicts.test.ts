import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { restoreLiveBankFeeProjectionBatchTx } from '../lib/finanzas/conciliar-db'
import { buildBankFeeProjectionSeed } from '../lib/finanzas/conciliar-fee-undo'
import { CONCILIAR_GREEN_PRECHECK_STAMP } from '../lib/finanzas/conciliar-precheck-visual'

type Movement = {
  movimientoId: string; cuentaId: string; fecha: string; importeCentimos: number; versionB4: number
  concepto: string; referencia: null; infoAdicional: null; tercero: null; banco: string; cuenta: string
}
function movement(index: number): Movement {
  return {
    movimientoId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    cuentaId: 'cuenta-fixture', fecha: '2026-10-30', importeCentimos: -125 - index, versionB4: 2,
    concepto: 'COMISION DE MANTENIMIENTO', referencia: null, infoAdicional: null, tercero: null,
    banco: 'BANCO', cuenta: 'CUENTA',
  }
}
type Model = {
  movements: Movement[]; activeP1: string[]; projections: string[]
  // Overrides model a corrupt driver result or changed authoritative final source.
  conflictResult?: unknown[]; finalAmount?: number; finalDecimal?: string | null
  finalVersion?: number; finalState?: string; failure?: Error
}
function model(size = 1): Model {
  return { movements: Array.from({ length: size }, (_, index) => movement(index)), activeP1: [], projections: [] }
}
function fixture(state: Model) {
  const queries: string[] = [], locks: string[] = [], inserts: any[][] = []
  const tx = {
    async $queryRaw(statement: any) {
      const sql = statement.strings.join('?')
      queries.push(sql)
      assert.equal(classifyPrisma5RawSqlStatement([statement]), sql.includes('FOR UPDATE') ? 'row_lock' : 'read_only',
        'the real SQL uses the existing Prisma guard, with no grammar exception')
      if (state.failure) throw state.failure
      if (sql.includes('FOR UPDATE OF m,c')) {
        locks.push(...state.movements.map(row => `source:${row.movimientoId}`))
        return structuredClone(state.movements)
      }
      if (sql.includes('WITH active_p1 AS MATERIALIZED')) {
        assert.match(sql, /active_p1_count AS MATERIALIZED \(\s*SELECT COUNT\(\*\)::integer AS total FROM active_p1/)
        assert.match(sql, /existing_projection AS MATERIALIZED[\s\S]*CROSS JOIN active_p1_count guard/)
        assert.match(sql, /guard\.total=0 FOR UPDATE OF conciliar_proyecciones/)
        assert.match(sql, /COUNT\(\*\)::integer FROM existing_projection/)
        assert.doesNotMatch(sql, /pg_advisory|LIMIT|SKIP LOCKED|NOWAIT/)
        // This deterministic model follows the explicit full COUNT dependency:
        // all active P1 rows lock first; a nonzero count skips projection locks.
        locks.push(...state.activeP1.map(id => `p1:${id}`))
        if (state.activeP1.length === 0) locks.push(...state.projections.map(id => `projection:${id}`))
        return state.conflictResult ?? [{ activeP1Count: state.activeP1.length, existingProjectionCount: state.activeP1.length ? 0 : state.projections.length }]
      }
      assert.match(sql, /FROM movimientos_bancarios m JOIN cuentas_bancarias c/,
        'the unchanged G7 final financial read is still required before insert')
      // Match the actual financial SELECT filter; an already decided movement
      // is absent, so the existing G7 seal downgrades it rather than accepting it.
      if (state.finalState && state.finalState !== 'SIN_DOCUMENTO') return []
      return state.movements.map(row => ({
        id: row.movimientoId, version: state.finalVersion ?? row.versionB4,
        amount: state.finalAmount ?? row.importeCentimos, concepto: row.concepto,
        referencia: row.referencia, info: row.infoAdicional, tercero: row.tercero, banco: row.banco,
        decimal: state.finalDecimal === undefined ? (row.importeCentimos / 100).toFixed(2) : state.finalDecimal,
        previous: { estado: state.finalState ?? 'SIN_DOCUMENTO', motivoNoRequiere: null, version: state.finalVersion ?? row.versionB4 },
      }))
    },
    async $executeRaw(statement: any) {
      const sql = statement.strings.join('?')
      assert.equal(classifyPrisma5RawSqlStatement([statement]), 'mutating')
      assert.match(sql, /INSERT INTO conciliar_proyecciones/)
      inserts.push(JSON.parse(statement.values[0]))
      return state.movements.length
    },
  }
  return { tx: tx as never, queries, locks, inserts }
}
function legacyConflictOutcome(state: Model) {
  // Independent reference for the former two SELECTs and early-return contract.
  const locks = state.activeP1.map(id => `p1:${id}`)
  if (state.activeP1.length) return { allowed: false, locks }
  locks.push(...state.projections.map(id => `projection:${id}`))
  return { allowed: state.projections.length === 0, locks }
}

test('undo 1/20: same canonical restored rows, one fewer SELECT, final G7 retained', async () => {
  for (const size of [1, 20]) {
    const state = model(size), run = fixture(state)
    assert.equal(await restoreLiveBankFeeProjectionBatchTx(run.tx, state.movements.map(row => row.movimientoId)), true)
    assert.equal(run.queries.length, 3, 'source + coalesced conflicts + final G7; formerly four SELECTs')
    assert.equal(run.inserts.length, 1, 'one atomic canonical insert remains')
    assert.equal(run.inserts[0].length, size)
    for (const [index, inserted] of run.inserts[0].entries()) {
      const expected = buildBankFeeProjectionSeed(state.movements[index])!
      assert.equal(inserted.id, expected.row.id)
      assert.equal(inserted.tab, expected.tab)
      assert.equal(inserted.cuentaId, expected.cuentaId)
      assert.equal(inserted.importeCentimos, expected.row.importeCentimos)
      assert.equal(inserted.pendienteCentimos, expected.row.pendienteCentimos)
      assert.equal(inserted.color, expected.row.color)
      assert.equal(inserted.seleccionable, expected.row.seleccionable)
      assert.deepEqual(inserted.source, { ...expected.source, g7Precheck: CONCILIAR_GREEN_PRECHECK_STAMP })
      assert.match(inserted.sourceFingerprint, /^[a-f0-9]{64}$/)
    }
  }
})

test('coalesced conflicts equal legacy denials and fully ordered lock sets, including multiple P1 rows', async () => {
  for (const size of [1, 20]) {
    for (const [activeP1, projections] of [
      [[], []], [['p1-first', 'p1-second'], []], [[], ['projection-first', 'projection-second']],
      [['p1-first', 'p1-second'], ['projection-first', 'projection-second']],
    ] as [string[], string[]][]) {
      const state = { ...model(size), activeP1, projections }, expected = legacyConflictOutcome(state), run = fixture(state)
      assert.equal(await restoreLiveBankFeeProjectionBatchTx(run.tx, state.movements.map(row => row.movimientoId)), expected.allowed)
      assert.deepEqual(run.locks.filter(lock => !lock.startsWith('source:')), expected.locks)
      assert.equal(run.inserts.length, expected.allowed ? 1 : 0)
      if (!expected.allowed) assert.equal(run.queries.length, 2, 'a conflict never reads final G7 or inserts partially')
    }
  }
})

test('corrupt conflict driver results always return false without inserting', async () => {
  for (const conflictResult of [
    [], [{ activeP1Count: 0, existingProjectionCount: 0 }, { activeP1Count: 0, existingProjectionCount: 0 }],
    [{}], [{ activeP1Count: '0', existingProjectionCount: 0 }], [{ activeP1Count: 0, existingProjectionCount: null }],
    [{ activeP1Count: -1, existingProjectionCount: 0 }], [{ activeP1Count: 0, existingProjectionCount: Number.NaN }],
  ]) {
    const state = { ...model(), conflictResult }, run = fixture(state)
    assert.equal(await restoreLiveBankFeeProjectionBatchTx(run.tx, state.movements.map(row => row.movimientoId)), false)
    assert.equal(run.inserts.length, 0)
  }
})

test('race model: a fresh invocation sees competing P1/projection, no positive decision escapes the transaction', async () => {
  const ids = model(20).movements.map(row => row.movimientoId)
  const initial = fixture(model(20))
  assert.equal(await restoreLiveBankFeeProjectionBatchTx(initial.tx, ids), true)
  for (const competitor of [{ activeP1: ['competing-p1'] }, { projections: ['competing-projection'] }]) {
    // A competitor visible in the next SERIALIZABLE source photo must deny the
    // exact same IDs. This is a unit model, not a claim about real DB scheduling.
    const next = fixture({ ...model(20), ...competitor })
    assert.equal(await restoreLiveBankFeeProjectionBatchTx(next.tx, ids), false)
    assert.equal(next.inserts.length, 0)
    assert.equal(next.queries.length, 2)
  }
})

test('financial final revalidation is unchanged: stale cents/version/state and raw decimal downgrade, never bypass G7', async () => {
  for (const changed of [
    { finalAmount: -126 }, { finalVersion: 3 }, { finalDecimal: '-1.251' },
    { finalDecimal: null }, { finalState: 'NO_REQUIERE' },
  ]) {
    const state = { ...model(), ...changed }, run = fixture(state)
    // The existing projection seal persists an administrative amber row for a
    // known financial failure; it does not throw or fabricate a green stamp.
    assert.equal(await restoreLiveBankFeeProjectionBatchTx(run.tx, state.movements.map(row => row.movimientoId)), true)
    assert.equal(run.inserts.length, 1)
    const inserted = run.inserts[0][0]
    assert.equal(inserted.color, 'AMBAR')
    assert.equal(inserted.seleccionable, false)
    assert.equal(inserted.source.g7Precheck, undefined)
    assert.equal(inserted.motivo, 'La documentación o el movimiento ya no permiten confirmar esta fila. Actualiza la lista y revisa la propuesta.')
    assert.equal(run.queries.length, 3)
  }
})

test('source bijection, current classification, bounds and ambiguous errors retain fail-closed behavior', async () => {
  for (const movements of [[], [movement(0), movement(0)], [{ ...movement(0), movimientoId: 'unexpected' }], [{ ...movement(0), concepto: 'COMPRA TARJETA' }]]) {
    const run = fixture({ ...model(), movements })
    assert.equal(await restoreLiveBankFeeProjectionBatchTx(run.tx, [movement(0).movimientoId]), false)
    assert.equal(run.inserts.length, 0)
  }
  for (const ids of [[], [movement(0).movimientoId, movement(0).movimientoId], Array.from({ length: 101 }, (_, i) => movement(i).movimientoId)]) {
    const run = fixture(model())
    assert.equal(await restoreLiveBankFeeProjectionBatchTx(run.tx, ids), false)
    assert.equal(run.queries.length, 0)
  }
  const eof = new Error('ambiguous EOF'), run = fixture({ ...model(), failure: eof })
  await assert.rejects(restoreLiveBankFeeProjectionBatchTx(run.tx, [movement(0).movimientoId]), error => error === eof)
  assert.equal(run.inserts.length, 0)
})
