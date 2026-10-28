/* Identidad fiscal de cliente en COBROS: pruebas puras. Sin BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { collectionClientIdentityMatches, type CollectionClientIdentityProfile } from '../lib/finanzas/conciliar-db'

function profile(overrides: Partial<CollectionClientIdentityProfile> = {}): CollectionClientIdentityProfile {
  return {
    proposalId: 'proposal-test', movimientoId: 'movement-test',
    compositionCount: 1, compositionInvoiceIdCount: 1, invoiceCount: 1, distinctInvoiceCount: 1,
    invoiceCifs: ['B-12345678'], invoiceNames: ['Cliente Prueba, S.L.'],
    entityCif: 'B12345678', entityType: 'CLIENTE', entityActive: true,
    entityBoundToMovement: true, entityLegalName: 'Cliente Prueba S.L.', entityCommercialName: 'Cliente Prueba, S.L.',
    ...overrides,
  }
}

test('acepta sólo la presentación de puntuación legal respaldada por el mismo CIF fiscal registrado', () => {
  assert.equal(collectionClientIdentityMatches(profile()), true)
})

test('rechaza una diferencia de token aunque el CIF coincida: no es una búsqueda difusa', () => {
  assert.equal(collectionClientIdentityMatches(profile({ invoiceNames: ['Cliente Pruebas, S.L.'] })), false)
  assert.equal(collectionClientIdentityMatches(profile({ invoiceNames: ['Prueba Cliente, S.L.'] })), false)
})

test('rechaza CIF ausente, distinto o tarjeta no activa/no cliente', () => {
  assert.equal(collectionClientIdentityMatches(profile({ invoiceCifs: [null] })), false)
  assert.equal(collectionClientIdentityMatches(profile({ invoiceCifs: ['B12345679'] })), false)
  assert.equal(collectionClientIdentityMatches(profile({ entityActive: false })), false)
  assert.equal(collectionClientIdentityMatches(profile({ entityType: 'PROVEEDOR' })), false)
})

test('exige una composición íntegra uno-a-uno: no usa etiquetas ni importes como identidad', () => {
  assert.equal(collectionClientIdentityMatches(profile({ compositionInvoiceIdCount: 0, invoiceCount: 0, distinctInvoiceCount: 0, invoiceCifs: [], invoiceNames: [] })), false)
  assert.equal(collectionClientIdentityMatches(profile({ compositionCount: 2, compositionInvoiceIdCount: 2, invoiceCount: 2, distinctInvoiceCount: 1, invoiceCifs: ['B12345678', 'B12345678'], invoiceNames: ['Cliente Prueba S.L.', 'Cliente Prueba S.L.'] })), false)
})

test('sin FK bancaria exige además el nombre literal de la única ficha fiscal registrada', () => {
  const candidate = profile({entityBoundToMovement:false})
  assert.equal(collectionClientIdentityMatches(candidate),false)
  assert.equal(collectionClientIdentityMatches(candidate,['Cliente Prueba S.L.']),true)
  assert.equal(collectionClientIdentityMatches(candidate,['Otro Cliente']),false)
})

test('sigla registrada: sólo expansión literal cerrada con prefijo, sufijo y CIF comprobados', () => {
  const candidate = profile({entityBoundToMovement:false,invoiceNames:['Compañía ECS S.A.U.'],entityLegalName:'Compañía ECS SAU',entityCommercialName:null})
  assert.equal(collectionClientIdentityMatches(candidate,['Compañía Enterprise Computing Solutions SAU']),true)
  assert.equal(collectionClientIdentityMatches(candidate,['Compañía Electronic Computing Services SAU']),false)
  assert.equal(collectionClientIdentityMatches(candidate,['Otra Enterprise Computing Solutions SAU']),false)
  assert.equal(collectionClientIdentityMatches(candidate,['Compañía Enterprise Computing Solutions SL']),false)
  assert.equal(collectionClientIdentityMatches({...candidate,invoiceCifs:['B99999999']},['Compañía Enterprise Computing Solutions SAU']),false)
})

console.log('OK: identidad cliente CIF exacta y presentación legal limitada a puntuación verificadas sin BD ni red.')
