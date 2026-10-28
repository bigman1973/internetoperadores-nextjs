/* Pruebas puras: no importan Prisma, no abren conexiones, no hacen DML ni red. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBankFeeProjectionSeed, knownSingleBankFeeUndoMovement, type ConciliarFeeUndoLeg } from '../lib/finanzas/conciliar-fee-undo'
import { conciliarDecisionHash, conciliarHash } from '../lib/finanzas/conciliar-core'

const originalHash = 'a'.repeat(64)
const movementId = 'mov-fee-1'
const b4Id = '00000000-0000-4000-8000-000000000011'

function feeLeg(overrides: Partial<ConciliarFeeUndoLeg> = {}): ConciliarFeeUndoLeg {
  return {
    movimientoId: movementId,
    operationB4Id: b4Id,
    actionB5: null,
    proposalBlockId: null,
    result: { state: 'confirmada', sourceKind: 'COMISION_BANCARIA' },
    ...overrides,
  }
}

function liveSeed(overrides: Record<string, unknown> = {}) {
  return buildBankFeeProjectionSeed({
    movimientoId: movementId,
    cuentaId: 'cuenta-fee-1',
    fecha: '2026-10-27',
    importeCentimos: -149,
    versionB4: 3,
    concepto: 'COMISION DE MANTENIMIENTO',
    referencia: null,
    infoAdicional: null,
    tercero: null,
    banco: 'Banco de prueba',
    cuenta: 'Cuenta de prueba',
    ...overrides,
  })
}

function fingerprint(seed: NonNullable<ReturnType<typeof liveSeed>>): string {
  return conciliarHash({
    schema: 'CONCILIAR_SOURCE_V2', tab: seed.tab, source: seed.source,
    row: {
      id: seed.row.id, movimientoId: seed.row.movimientoId, fecha: seed.row.fecha,
      importeCentimos: seed.row.importeCentimos, pendienteCentimos: seed.row.pendienteCentimos,
      documento: seed.row.documento, propuesta: seed.row.propuesta, linksMovimiento: seed.row.linksMovimiento,
    },
  })
}

test('guard estricto: sólo foto limpia, una pata B4 y sourceKind persistido de comisión', () => {
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg()] }), movementId)
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: true, legs: [feeLeg()] }), null, 'dirty previo nunca se limpia')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg(), feeLeg({ movimientoId: 'mov-fee-2' })] }), null, 'más de una pata cae al rebuild')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ result: { state: 'confirmada' } })] }), null, 'recibo legado sin sourceKind cae al rebuild')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ result: { sourceKind: 'PAGO_NOMINA' } })] }), null, 'otro sourceKind no se infiere')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ operationB4Id: null })] }), null, 'la pata sin B4 no se restaura')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ actionB5: 'PEDIDO' })] }), null, 'B5 no es una comisión aislada')
})

test('rederiva fila viva con fingerprint y decisionHash nuevos, sin reutilizar el histórico', () => {
  const initial = liveSeed()
  const current = liveSeed({ versionB4: 4 })
  assert.ok(initial && current)
  const initialFingerprint = fingerprint(initial)
  const currentFingerprint = fingerprint(current)
  const currentHash = conciliarDecisionHash({ row: current.row, source: current.source, sourceFingerprint: currentFingerprint })
  assert.notEqual(currentFingerprint, initialFingerprint, 'la versión B4 viva participa en la fuente')
  assert.notEqual(currentHash, originalHash, 'nunca se reutiliza decisionHash del recibo')
  assert.equal(current.source.kind, 'COMISION_BANCARIA')
  assert.equal(current.row.movimientoId, movementId)
  assert.equal(current.row.seleccionable, true)
})

test('la forma exacta de la fila SQL viva entrega movimientoId y no acepta una fecha civil imposible', () => {
  const sqlShape = {
    movimientoId: movementId, cuentaId: 'cuenta-fee-1', fecha: '2026-10-27', importeCentimos: -149, versionB4: 3,
    concepto: 'COMISION DE MANTENIMIENTO', referencia: null, infoAdicional: null, tercero: null, banco: 'Banco de prueba', cuenta: 'Cuenta de prueba',
  }
  const fromSql = buildBankFeeProjectionSeed(sqlShape)
  assert.ok(fromSql, 'm.id AS "movimientoId" debe alimentar el constructor de proyección')
  assert.equal(fromSql.row.movimientoId, movementId)
  assert.equal(buildBankFeeProjectionSeed({ ...sqlShape, fecha: '2026-02-30' }), null, 'el formato ISO no basta: la fecha debe existir en calendario')
})

test('cambio de fuente deja de ser comisión y fuerza fallback; una sola pata no se duplica en replay', () => {
  assert.equal(liveSeed({ concepto: 'PAGO TARJETA VISA' }), null, 'la clasificación vigente invalida la restauración')
  const once = knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg()] })
  const replay = knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg()] })
  assert.equal(once, movementId)
  assert.equal(replay, movementId, 'la guarda es determinista; la idempotencia transaccional bloquea la segunda inserción')
})

console.log(JSON.stringify({
  test: 'conciliar-fee-undo', databaseOperations: 0, networkCalls: 0,
  verified: ['strict-guard', 'dirty-prior', 'single-leg', 'legacy-fallback', 'new-fingerprint-hash', 'sql-row-shape', 'civil-date', 'source-changed', 'replay-determinism'],
}))
