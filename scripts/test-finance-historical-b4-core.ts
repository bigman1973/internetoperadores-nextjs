import assert from 'node:assert/strict'
import test from 'node:test'
import { decimalTextToCentimos, planHistoricalProposal, sha256Canonical } from '../lib/finanzas/historical-b4-core'

test('converts PostgreSQL decimal text exactly without JS float rounding', () => {
  assert.equal(decimalTextToCentimos('-12.34'), -1234)
  assert.equal(decimalTextToCentimos('0.1'), 10)
  assert.equal(decimalTextToCentimos('+7'), 700)
  assert.equal(decimalTextToCentimos('1.234'), null)
  assert.equal(decimalTextToCentimos('NaN'), null)
})

test('every unproven legacy relationship remains proposal-only', () => {
  const result = planHistoricalProposal({
    movimientoId: 'm-1', b4State: null, importeBancoCentimos: -10000,
    documentos: [{ tipo: 'FACTURA_RECIBIDA', sourceId: 'f-1', documentoConciliableId: 'd-1', referencia: 'F-1', importeObjetivoCentimos: -10000, archivoDisponible: true }],
    motivos: ['AMOUNT_MISMATCH_FIRMADO_EXACTO_FACTURA_RECIBIDA'],
  })
  assert.equal(result.clasificacion, 'PROPUESTA')
  assert.equal(result.procedencia, 'DESCONOCIDO')
  assert.ok(result.motivos.includes('PROCEDENCIA_DESCONOCIDA'))
})

test('current JUSTIFICADO and NO_REQUIERE B4 states are reported as YA_B4 and are never changed', () => {
  for (const b4State of ['JUSTIFICADO', 'NO_REQUIERE']) {
    const result = planHistoricalProposal({ movimientoId: 'm-1', b4State, importeBancoCentimos: 1, documentos: [], motivos: [] })
    assert.equal(result.clasificacion, 'YA_B4')
    assert.equal(result.procedencia, 'DESCONOCIDO')
  }
})

test('canonical source hash is stable across object insertion order', () => {
  assert.equal(sha256Canonical({ z: ['a', { b: 2, a: 1 }], a: true }), sha256Canonical({ a: true, z: ['a', { a: 1, b: 2 }] }))
})
