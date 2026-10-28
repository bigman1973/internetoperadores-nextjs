/* Pruebas puras: no importan Prisma, no abren conexiones, no hacen DML ni red. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBankFeeProjectionSeed, knownBankFeeUndoMovements, knownSingleBankFeeUndoMovement, type ConciliarFeeUndoLeg } from '../lib/finanzas/conciliar-fee-undo'
import { conciliarDecisionHash, conciliarHash } from '../lib/finanzas/conciliar-core'

const originalHash = 'a'.repeat(64)
const movementId = '00000000-0000-4000-8000-000000000001'
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

function batchFeeLeg(index: number): ConciliarFeeUndoLeg {
  return feeLeg({
    movimientoId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    operationB4Id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  })
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

test('guard estricto compartido: sólo foto limpia, B4, sourceKind persistido y una pata', () => {
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg()] }), movementId)
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: true, legs: [feeLeg()] }), null, 'dirty previo nunca se limpia')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg(), batchFeeLeg(2)] }), null, 'el selector single no convierte lote en single')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ result: { state: 'confirmada' } })] }), null, 'recibo legado sin sourceKind cae al rebuild')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ result: { sourceKind: 'PAGO_NOMINA' } })] }), null, 'otro sourceKind no se infiere')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ operationB4Id: null })] }), null, 'la pata sin B4 no se restaura')
  assert.equal(knownSingleBankFeeUndoMovement({ wasDirty: false, legs: [feeLeg({ actionB5: 'PEDIDO' })] }), null, 'B5 no es una comisión aislada')
})

test('guard de lote: acepta exactamente 1..100 sólo si todas las patas son comisiones únicas y revalidables', () => {
  const batch100 = Array.from({ length: 100 }, (_, index) => batchFeeLeg(index + 1))
  assert.deepEqual(knownBankFeeUndoMovements({ wasDirty: false, legs: batch100 }), batch100.map(leg => leg.movimientoId), 'el lote conserva el orden del recibo')
  assert.equal(knownBankFeeUndoMovements({ wasDirty: false, legs: [] }), null, 'un recibo sin patas nunca se limpia')
  assert.equal(knownBankFeeUndoMovements({ wasDirty: false, legs: [...batch100, batchFeeLeg(101)] }), null, '101 patas cae al rebuild')
  assert.equal(knownBankFeeUndoMovements({ wasDirty: true, legs: batch100 }), null, 'dirty previo nunca se limpia para lote')
  assert.equal(knownBankFeeUndoMovements({ wasDirty: false, legs: [feeLeg({ movimientoId: 'movimiento-no-uuid' })] }), null, 'un movimiento no UUID no es revalidable por fast path')
  assert.equal(knownBankFeeUndoMovements({ wasDirty: false, legs: [batchFeeLeg(1), batchFeeLeg(1)] }), null, 'movimiento duplicado evita restauración parcial')
  assert.equal(knownBankFeeUndoMovements({ wasDirty: false, legs: [batchFeeLeg(1), feeLeg({ movimientoId: '00000000-0000-4000-8000-000000000012', operationB4Id: batchFeeLeg(1).operationB4Id })] }), null, 'B4 duplicado evita restauración parcial')
  assert.equal(knownBankFeeUndoMovements({ wasDirty: false, legs: [batchFeeLeg(1), feeLeg({ movimientoId: '00000000-0000-4000-8000-000000000002', proposalBlockId: '00000000-0000-4000-8000-000000000099' })] }), null, 'cobro/propuesta mezclado cae al rebuild')
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

test('cambio de fuente deja de ser comisión y la clasificación es determinista en replay', () => {
  assert.equal(liveSeed({ concepto: 'PAGO TARJETA VISA' }), null, 'la clasificación vigente invalida la restauración')
  const once = knownBankFeeUndoMovements({ wasDirty: false, legs: [feeLeg(), batchFeeLeg(2)] })
  const replay = knownBankFeeUndoMovements({ wasDirty: false, legs: [feeLeg(), batchFeeLeg(2)] })
  assert.deepEqual(once, [movementId, '00000000-0000-4000-8000-000000000002'])
  assert.deepEqual(replay, once, 'la guarda es determinista; la idempotencia transaccional bloquea la segunda inserción')
})

console.log(JSON.stringify({
  test: 'conciliar-fee-undo', databaseOperations: 0, networkCalls: 0,
  verified: ['strict-guard', 'dirty-prior', 'single-compatible', 'batch-1-100', 'legacy-fallback', 'duplicate-b4-and-movement-fallback', 'new-fingerprint-hash', 'sql-row-shape', 'civil-date', 'source-changed', 'replay-determinism'],
}))
