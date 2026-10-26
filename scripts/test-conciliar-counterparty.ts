/* P1 documental Conciliar: pruebas sintéticas puras. Sin Prisma, DB, red ni datos reales. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  documentaryCounterpartyTypeIsCompatible,
  documentaryIdentityFromRow,
  isDocumentaryCounterpartySource,
} from '../lib/finanzas/conciliar-counterparty'

const MOVEMENT = 'movement-synthetic-001'

function source(kind: 'COBRO_PROPUESTA' | 'COBRO_CONFIRMING' | 'PAGO_FACTURA_RECIBIDA' | 'PAGO_NOMINA' | 'COMISION_BANCARIA', extra: Record<string, string> = {}) {
  return { kind, movimientoId: MOVEMENT, ...extra }
}

test('1 sólo las fuentes documentales con FK admitida pueden iniciar P1', () => {
  assert.equal(isDocumentaryCounterpartySource(source('PAGO_FACTURA_RECIBIDA', { facturaRecibidaId: 'fr-synthetic' })), true)
  assert.equal(isDocumentaryCounterpartySource(source('PAGO_NOMINA', { nominaId: 'nomina-synthetic' })), true)
  assert.equal(isDocumentaryCounterpartySource(source('COBRO_CONFIRMING', { confirmingId: 'confirming-synthetic' })), true)
  assert.equal(isDocumentaryCounterpartySource(source('COBRO_PROPUESTA', { propuestaId: '11111111-1111-4111-8111-111111111111' })), true)
  assert.equal(isDocumentaryCounterpartySource(source('COBRO_PROPUESTA')), false)
  assert.equal(isDocumentaryCounterpartySource(source('COMISION_BANCARIA')), true, 'Sólo se resolverá si el movimiento conserva un BANCO/AAPP fiscal existente')
})

test('2 nómina sólo conserva el empleado existente sobre un cargo', () => {
  const identity = documentaryIdentityFromRow({
    sourceKind: 'PAGO_NOMINA', sourceId: 'nomina-synthetic', tipo: null,
    entityId: null, employeeId: 'employee-synthetic', entityCount: null,
  })
  assert.deepEqual(identity, { type: 'EMPLEADO', origin: 'EMPLEADO', sourceIdentity: 'EMPLEADO:employee-synthetic' })
  assert.equal(documentaryCounterpartyTypeIsCompatible('PAGO_NOMINA', 'EMPLEADO', -10_000), true)
  assert.equal(documentaryCounterpartyTypeIsCompatible('PAGO_NOMINA', 'CLIENTE', -10_000), false)
  assert.equal(documentaryCounterpartyTypeIsCompatible('PAGO_NOMINA', 'EMPLEADO', 10_000), false)
})

test('3 factura recibida sólo conserva proveedor fiscal existente y signo de pago', () => {
  const identity = documentaryIdentityFromRow({
    sourceKind: 'PAGO_FACTURA_RECIBIDA', sourceId: 'fr-synthetic', tipo: 'PROVEEDOR',
    entityId: 'supplier-card-synthetic', employeeId: null, entityCount: 1,
  })
  assert.deepEqual(identity, { type: 'PROVEEDOR', origin: 'ENTIDAD_FISCAL', sourceIdentity: 'EF:supplier-card-synthetic' })
  assert.equal(documentaryCounterpartyTypeIsCompatible('PAGO_FACTURA_RECIBIDA', 'PROVEEDOR', -1), true)
  assert.equal(documentaryCounterpartyTypeIsCompatible('PAGO_FACTURA_RECIBIDA', 'PROVEEDOR', 1), false)
  assert.equal(documentaryIdentityFromRow({
    sourceKind: 'PAGO_FACTURA_RECIBIDA', sourceId: 'fr-synthetic', tipo: 'PROVEEDOR',
    entityId: null, employeeId: null, entityCount: 0,
  }), null, 'No se crea ni se infiere una ficha desde texto/OCR')
})

test('4 confirming Draxton conserva cliente fiscal de la sociedad individual, no recategoriza proveedor', () => {
  const identity = documentaryIdentityFromRow({
    sourceKind: 'COBRO_CONFIRMING', sourceId: 'confirming-synthetic', tipo: 'CLIENTE',
    entityId: 'client-card-society-a', employeeId: null, entityCount: 1,
  })
  assert.deepEqual(identity, { type: 'CLIENTE', origin: 'ENTIDAD_FISCAL', sourceIdentity: 'EF:client-card-society-a' })
  assert.equal(documentaryCounterpartyTypeIsCompatible('COBRO_CONFIRMING', 'CLIENTE', 29_575), true)
  assert.equal(documentaryCounterpartyTypeIsCompatible('COBRO_CONFIRMING', 'PROVEEDOR', 29_575), false)
  assert.equal(documentaryCounterpartyTypeIsCompatible('COBRO_CONFIRMING', 'CLIENTE', -29_575), false)
})

test('5 remesa/propuesta de varios clientes no fabrica una ficha P1', () => {
  const multiple = documentaryIdentityFromRow({
    sourceKind: 'COBRO_PROPUESTA', sourceId: 'proposal-synthetic', tipo: null,
    entityId: null, employeeId: null, entityCount: 2,
  })
  assert.equal(multiple, 'CLIENTES_MULTIPLES')
  const unique = documentaryIdentityFromRow({
    sourceKind: 'COBRO_PROPUESTA', sourceId: 'proposal-synthetic', tipo: 'CLIENTE',
    entityId: 'only-existing-client', employeeId: null, entityCount: 1,
  })
  assert.ok(unique && unique !== 'CLIENTES_MULTIPLES')
  assert.equal(unique.sourceIdentity, 'EF:only-existing-client')
  assert.equal(documentaryCounterpartyTypeIsCompatible('COBRO_PROPUESTA', 'CLIENTE', 1), true)
  assert.equal(documentaryCounterpartyTypeIsCompatible('COBRO_PROPUESTA', 'CLIENTE', -1), false)
})

test('6 una fila sin identidad documental o una ficha ambigua queda sin decisión', () => {
  assert.equal(documentaryIdentityFromRow({
    sourceKind: 'COBRO_CONFIRMING', sourceId: 'confirming-synthetic', tipo: 'CLIENTE',
    entityId: null, employeeId: null, entityCount: 2,
  }), null)
  assert.equal(documentaryCounterpartyTypeIsCompatible('PAGO_NOMINA', 'EMPLEADO', 0), false)
})

console.log('test-conciliar-counterparty: compuertas sintéticas de identidad documental, tipo, signo y cliente único verificadas.')
