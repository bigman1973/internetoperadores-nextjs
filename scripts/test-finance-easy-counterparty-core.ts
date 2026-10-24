import assert from 'node:assert/strict'
import {
  EasyCounterpartyValidationError,
  compareCounterpartyMagnitude,
  counterpartyCandidateHash,
  counterpartySuggestionId,
  parseCounterpartyReadInput,
  parseCounterpartySearchInput,
  parseCounterpartyWriteInput,
} from '../lib/finanzas/easy-counterparty-core'

const UUID = '11111111-1111-4111-8111-111111111111'
const seed = { movimientoId: 'movimiento-opaco-1', tipoTercero: 'PROVEEDOR' as const, origen: 'ENTIDAD_FISCAL' as const, sourceIdentity: 'EF:opaco' }
function code(work: () => unknown) {
  try { work() } catch (error) { return error instanceof EasyCounterpartyValidationError ? error.code : String(error) }
  return null
}

assert.deepEqual(parseCounterpartyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS', tarjeta: '9029', q: 'texto permitido' }), {
  desde: '2026-01-01', hasta: '2026-10-08', limit: 25, offset: 0, sentido: 'TODOS', tarjeta: '9029', q: 'texto permitido',
})
assert.deepEqual(parseCounterpartyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS', pendientes: 'SI' }), {
  desde: '2026-01-01', hasta: '2026-10-08', limit: 25, offset: 0, sentido: 'TODOS', pendientes: true,
})
assert.equal(code(() => parseCounterpartyReadInput({ desde: '2026-10-09', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseCounterpartyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '101', offset: '0', sentido: 'TODOS' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseCounterpartyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS', pendientes: 'NO' })), 'VALIDATION_ERROR')
assert.deepEqual(parseCounterpartySearchInput({ movimientoId: 'movimiento-opaco-1', buscar: 'cliente estable', limit: '20' }), {
  movimientoId: 'movimiento-opaco-1', buscar: 'cliente estable', limit: 20,
})
assert.equal(code(() => parseCounterpartySearchInput({ movimientoId: 'm', buscar: ' ', limit: '20' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseCounterpartySearchInput({ movimientoId: 'm', buscar: 'cliente', limit: '51' })), 'VALIDATION_ERROR')

const suggestion = counterpartySuggestionId(seed)
assert.match(suggestion, /^p1_[a-f0-9]{64}$/)
assert.equal(suggestion, counterpartySuggestionId({ ...seed }))
assert.notEqual(counterpartyCandidateHash(seed), counterpartyCandidateHash({ ...seed, sourceIdentity: 'EF:otra' }))
assert.notEqual(suggestion, counterpartySuggestionId({ ...seed, movimientoId: 'movimiento-opaco-2' }))

assert.deepEqual(parseCounterpartyWriteInput({ action: 'confirmar', movimientoId: 'movimiento-opaco-1', version: 0, sugerenciaId: suggestion, idempotencyKey: UUID, confirmacion: true }), {
  action: 'confirmar', movimientoId: 'movimiento-opaco-1', version: 0, sugerenciaId: suggestion, idempotencyKey: UUID, confirmacion: true,
})
assert.equal(code(() => parseCounterpartyWriteInput({ action: 'confirmar', movimientoId: 'm', version: 0, sugerenciaId: suggestion, idempotencyKey: UUID, confirmacion: true, tipoTercero: 'PROVEEDOR' })), 'VALIDATION_ERROR')
assert.equal(code(() => parseCounterpartyWriteInput({ action: 'confirmar', movimientoId: 'm', version: 0, sugerenciaId: 'p1_nombre-texto', idempotencyKey: UUID, confirmacion: true })), 'VALIDATION_ERROR')
assert.deepEqual(parseCounterpartyWriteInput({ action: 'revertir', decisionId: '22222222-2222-4222-8222-222222222222', version: 1, idempotencyKey: UUID, confirmacion: true }), {
  action: 'revertir', decisionId: '22222222-2222-4222-8222-222222222222', version: 1, idempotencyKey: UUID, confirmacion: true,
})
assert.equal(code(() => parseCounterpartyWriteInput({ action: 'revertir', decisionId: '22222222-2222-4222-8222-222222222222', version: 1, idempotencyKey: UUID, confirmacion: false })), 'CONFIRMACION_REQUERIDA')

const ordered = [
  { id: 'p', fecha: '2026-01-03', importeCentimos: 45 },
  { id: 'n', fecha: '2026-01-02', importeCentimos: -250 },
  { id: 'z', fecha: '2026-01-04', importeCentimos: 0 },
].sort(compareCounterpartyMagnitude)
assert.deepEqual(ordered.map(item => item.id), ['n', 'p', 'z'], 'La magnitud sólo ordena; no altera signos para ningún cuadre.')

console.log('test-finance-easy-counterparty-core: contrato P1, hashes opacos, idempotencia y orden por magnitud verificados.')
