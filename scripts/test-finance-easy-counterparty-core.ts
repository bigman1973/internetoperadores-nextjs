import assert from 'node:assert/strict'
import {
  EasyCounterpartyValidationError,
  classifyCounterpartyContext,
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

const contextual = (tipoTercero: 'CLIENTE' | 'PROVEEDOR' | 'BANCO' | 'CUENTA_PROPIA' | 'EMPLEADO', importeCentimos: number, concepto = '', propuestaTexto = '') =>
  classifyCounterpartyContext({ tipoTercero, importeCentimos, concepto, propuestaTexto })
assert.deepEqual(contextual('PROVEEDOR', -1_000), {
  bloque: 'ADMISIBLE', codigo: 'SIGNO_COMPATIBLE_PROVEEDOR', aviso: 'Cargo compatible con proveedor para el bloque; confirme la coincidencia exacta.',
})
assert.equal(contextual('PROVEEDOR', 1_000).codigo, 'SIGNO_INCOHERENTE_PROVEEDOR', 'Un cobro no convierte un proveedor fiscal en tercero de bloque.')
assert.deepEqual(contextual('CLIENTE', 1_000), {
  bloque: 'ADMISIBLE', codigo: 'SIGNO_COMPATIBLE_CLIENTE', aviso: 'Cobro compatible con cliente para el bloque; confirme la coincidencia exacta.',
})
assert.equal(contextual('CLIENTE', -1_000).codigo, 'SIGNO_INCOHERENTE_CLIENTE', 'Un cargo no convierte un cliente fiscal en tercero de bloque.')
assert.equal(contextual('EMPLEADO', -1_000).bloque, 'ADMISIBLE')
assert.equal(contextual('EMPLEADO', 1_000).codigo, 'SIGNO_INCOHERENTE_EMPLEADO')
assert.equal(contextual('BANCO', -1_000).bloque, 'ADMISIBLE', 'El signo aislado no inventa un rol bancario distinto.')
assert.equal(contextual('BANCO', 1_000).bloque, 'ADMISIBLE', 'Un abono bancario acreditado se revisa por identidad exacta, no por un cambio de tipo.')
assert.equal(contextual('CUENTA_PROPIA', -1_000).codigo, 'CUENTA_PROPIA_SIN_TRASPASO', 'Una cuenta propia no entra por bloque sin su prueba de traspaso.')
assert.deepEqual(contextual('CLIENTE', 1_000, 'Confirming Draxton cesión de créditos'), {
  bloque: 'ADMISIBLE', codigo: 'CONTEXTO_CONFIRMING', aviso: 'Cobro de confirming compatible con cliente existente; confirme la coincidencia exacta.',
}, 'Confirming sólo admite la ficha cliente exacta sobre un cobro.')
const confirmingProveedor = contextual('PROVEEDOR', 1_000, 'Confirming Draxton cesión de créditos')
assert.equal(confirmingProveedor.bloque, 'REVISION_INDIVIDUAL', 'Confirming no convierte una ficha proveedor en cliente.')
assert.match(confirmingProveedor.aviso, /ficha actual es proveedor.*tipo esperado.*cliente/i)
assert.deepEqual(contextual('EMPLEADO', -1_000, 'Nómina empleado Esteve'), {
  bloque: 'ADMISIBLE', codigo: 'CONTEXTO_NOMINA', aviso: 'Cargo de nómina compatible con empleado existente; confirme la coincidencia exacta.',
}, 'Nómina sólo admite la ficha empleado exacta sobre un cargo.')
const nominaCliente = contextual('CLIENTE', -1_000, 'Nómina empleado Esteve')
assert.equal(nominaCliente.bloque, 'REVISION_INDIVIDUAL', 'Nómina no convierte una ficha cliente en empleado.')
assert.match(nominaCliente.aviso, /ficha actual es cliente.*tipo esperado.*empleado/i)
const seguridadSocial = contextual('PROVEEDOR', -1_000, 'TGSS Seguridad Social')
assert.equal(seguridadSocial.codigo, 'CONTEXTO_SEGURIDAD_SOCIAL')
assert.equal(seguridadSocial.bloque, 'REVISION_INDIVIDUAL', 'Sin tipo administrativo acreditable, Seguridad Social queda para revisión manual.')
assert.match(seguridadSocial.aviso, /no hay un tipo administrativo/i)
const impuesto = contextual('CLIENTE', 1_000, 'AEAT modelo 303 impuesto')
assert.equal(impuesto.codigo, 'CONTEXTO_IMPUESTO')
assert.equal(impuesto.bloque, 'REVISION_INDIVIDUAL', 'Sin tipo administrativo acreditable, AEAT queda para revisión manual.')
assert.match(impuesto.aviso, /no hay un tipo administrativo/i)
assert.equal(contextual('BANCO', -1_000, 'Cuota préstamo financiación').bloque, 'ADMISIBLE', 'Préstamo sólo admite banco existente con coincidencia exacta.')
assert.equal(contextual('PROVEEDOR', -1_000, 'Cuota préstamo financiación').bloque, 'REVISION_INDIVIDUAL')
assert.equal(contextual('CUENTA_PROPIA', -1_000, 'Traspaso interno').codigo, 'CONTEXTO_TRASPASO')
assert.equal(contextual('PROVEEDOR', 0).codigo, 'IMPORTE_CERO_O_INVALIDO')
assert.match(contextual('CLIENTE', -1_000, 'Nómina').aviso, /no se corrige automáticamente/i, 'El aviso nunca reescribe el rol fiscal.')

console.log('test-finance-easy-counterparty-core: contrato P1, hashes opacos, idempotencia, orden y filtro contextual fail-closed verificados.')
