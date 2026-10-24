import assert from 'node:assert/strict'
import {
  EASY_MODE,
  EasyReconciliationValidationError,
  centsFromSqlText,
  isExactSuggestion,
  parseEasyReadInput,
  parseEasyRuleInput,
  parseEasyWriteInput,
  stableSuggestionId,
  type StableSuggestionSeed,
} from '../lib/finanzas/easy-reconciliation-core'

const UUID = '11111111-1111-4111-8111-111111111111'
const source: StableSuggestionSeed = {
  movimientoId: 'movimiento-opaco-1', importeMovimientoCentimos: -1234, fechaBanco: '2026-10-08',
  tipo: 'FACTURA_RECIBIDA', sourceId: 'fuente-canónica-1', documentoConciliableId: null,
  sourceTargetCentimos: -1234, asignadoActivoCentimos: 0, fechaDocumento: '2026-10-07',
  referencia: 'FR-2026-1', tercero: 'Proveedor válido', archivoDisponible: true,
}
function code(work: () => unknown) {
  try { work() } catch (error) { return error instanceof EasyReconciliationValidationError ? error.code : String(error) }
  return null
}

// Read DTO accepts exactly documented filter domain and dates.
assert.deepEqual(parseEasyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS', tarjeta: '9029', q: 'Proveedor' }), {
  desde: '2026-01-01', hasta: '2026-10-08', limit: 25, offset: 0, sentido: 'TODOS', tarjeta: '9029', q: 'Proveedor',
})
assert.equal(code(() => parseEasyReadInput({ desde: '2026-10-09', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '101', offset: '0', sentido: 'TODOS' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'CARGOS', tarjeta: '2390' })), 'VALIDATION_ERROR')

// SQL decimal text converts without rounding and rejects Float-like residue.
assert.equal(centsFromSqlText('-12.34'), -1234)
assert.equal(centsFromSqlText('12.3'), 1230)
assert.equal(code(() => centsFromSqlText('12.345')), 'IMPORTE_FUENTE_NO_EXACTO')
assert.equal(code(() => centsFromSqlText('1e2')), 'IMPORTE_FUENTE_NO_EXACTO')

// Exact, signed, dated capacity is mandatory. Math.abs-equivalent values never pass.
assert.equal(isExactSuggestion(source), true)
assert.equal(isExactSuggestion({ ...source, importeMovimientoCentimos: 1234 }), false)
assert.equal(isExactSuggestion({ ...source, asignadoActivoCentimos: -100 }), false)
assert.equal(isExactSuggestion({ ...source, fechaDocumento: '2026-10-09' }), false)
assert.equal(isExactSuggestion({ ...source, archivoDisponible: false }), false)
assert.equal(isExactSuggestion({ ...source, sourceTargetCentimos: -1233 }), false)

// The stable ID is source based: creating the legal wrapper at click time does not
// convert the visible choice into a new client-selected source.
assert.equal(stableSuggestionId(source), stableSuggestionId({ ...source, documentoConciliableId: '22222222-2222-4222-8222-222222222222' }))
assert.notEqual(stableSuggestionId(source), stableSuggestionId({ ...source, asignadoActivoCentimos: -1 }))
assert.match(stableSuggestionId(source), /^mf1_[a-f0-9]{64}$/)

// POST contract is exact and cannot smuggle client amount/document/source data.
assert.deepEqual(parseEasyWriteInput({ action: 'confirmar_factura', movimientoId: 'movimiento-opaco-1', version: 1, sugerenciaId: stableSuggestionId(source), idempotencyKey: UUID, confirmacion: true }), {
  action: 'confirmar_factura', movimientoId: 'movimiento-opaco-1', version: 1, sugerenciaId: stableSuggestionId(source), idempotencyKey: UUID, confirmacion: true,
})
assert.equal(code(() => parseEasyWriteInput({ action: 'confirmar_factura', movimientoId: 'm', version: 1, sugerenciaId: stableSuggestionId(source), idempotencyKey: UUID, confirmacion: true, importeCentimos: -1234 })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyWriteInput({ action: 'no_requiere', movimientoId: 'm', version: 1, motivoNoRequiere: 'OTRO', idempotencyKey: UUID, confirmacion: true })), 'VALIDATION_ERROR')
assert.equal(code(() => parseEasyWriteInput({ action: 'no_requiere', movimientoId: 'm', version: 1, motivoNoRequiere: 'COMISION_BANCARIA', idempotencyKey: UUID, confirmacion: false })), 'CONFIRMACION_REQUERIDA')

// Rules admit only a previously confirmed operation and are permanently proposal-only.
assert.deepEqual(parseEasyRuleInput({ action: 'crear', operacionId: '22222222-2222-4222-8222-222222222222', modo: EASY_MODE, confirmacion: true }), {
  action: 'crear', operacionId: '22222222-2222-4222-8222-222222222222', modo: 'SOLO_PROPONER', confirmacion: true,
})
assert.equal(code(() => parseEasyRuleInput({ action: 'crear', operacionId: '22222222-2222-4222-8222-222222222222', modo: 'AUTO_CONFIRMAR', confirmacion: true })), 'CONFIRMACION_REQUERIDA')
assert.equal(code(() => parseEasyRuleInput({ action: 'crear', operacionId: '22222222-2222-4222-8222-222222222222', modo: EASY_MODE, confirmacion: true, documentoConciliableId: 'futuro' })), 'VALIDATION_ERROR')

console.log('Modo Fácil core: 22 aserciones de contrato, exactitud y proposal-only verificadas.')
