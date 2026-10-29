/* Reserva global de proveedor: fixtures sintéticas puras; sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignConciliarProviderPayments,
  CONCILIAR_PROVIDER_SMALL_DIFFERENCE_CENTS,
  type ConciliarProviderInvoiceCandidate,
  type ConciliarProviderPayment,
} from '../lib/finanzas/conciliar-proveedor-asignacion'

function invoice(overrides: Partial<ConciliarProviderInvoiceCandidate> & Pick<ConciliarProviderInvoiceCandidate, 'invoiceId' | 'referencia' | 'importeDisponibleCentimos'>): ConciliarProviderInvoiceCandidate {
  return {
    fecha: '2026-05-02', vencimiento: null, providerMatch: 'EXACT',
    ...overrides,
  }
}
function payment(overrides: Partial<ConciliarProviderPayment> & Pick<ConciliarProviderPayment, 'movementId' | 'importeBancoCentimos' | 'conceptoBanco' | 'candidates'>): ConciliarProviderPayment {
  return { fecha: '2026-06-05', ...overrides }
}
function decision(input: readonly ConciliarProviderPayment[], movementId: string) {
  const item = assignConciliarProviderPayments(input).get(movementId)
  assert.ok(item, `Falta decisión para ${movementId}`)
  return item
}

test('la referencia documental exacta tiene prioridad global sobre el mismo importe sin referencia', () => {
  const shared = invoice({ invoiceId: 'invoice-shared', referencia: 'CC260000000111', importeDisponibleCentimos: -48_811 })
  const result = assignConciliarProviderPayments([
    payment({ movementId: 'charge-without-reference', importeBancoCentimos: -48_811, conceptoBanco: 'PAGO OPERADOR', candidates: [shared] }),
    payment({ movementId: 'charge-explicit-reference', importeBancoCentimos: -48_811, conceptoBanco: 'RECIBO PROVEEDOR', referenciaBanco: 'CC260000000111', candidates: [shared] }),
  ])
  assert.deepEqual(result.get('charge-explicit-reference'), {
    movementId: 'charge-explicit-reference', kind: 'EXACT_REFERENCE', reason: 'REFERENCIA_EXACTA', invoiceId: 'invoice-shared',
  })
  assert.deepEqual(result.get('charge-without-reference'), {
    movementId: 'charge-without-reference', kind: 'AMBAR', reason: 'FACTURA_EXACTA_RESERVADA',
  })
})

test('un exacto sin referencia reserva una única factura pero permanece ámbar humano', () => {
  const item = decision([
    payment({ movementId: 'charge-no-reference', importeBancoCentimos: -32_158, conceptoBanco: 'CARGO PROVEEDOR', candidates: [
      invoice({ invoiceId: 'invoice-no-reference', referencia: 'CC260000000222', importeDisponibleCentimos: -32_158 }),
    ] }),
  ], 'charge-no-reference')
  assert.deepEqual(item, {
    movementId: 'charge-no-reference', kind: 'EXACT_NO_REFERENCE', reason: 'SIN_REFERENCIA_DOCUMENTAL', invoiceId: 'invoice-no-reference',
  })
})

test('una referencia bancaria explícita inexistente queda roja y no sustituye otra factura', () => {
  const item = decision([
    payment({ movementId: 'charge-missing-reference', importeBancoCentimos: -47_093, conceptoBanco: 'RECIBO PROVEEDOR', referenciaBanco: 'CC260000009999', candidates: [
      invoice({ invoiceId: 'other-invoice', referencia: 'CC260000000333', importeDisponibleCentimos: -47_093 }),
    ] }),
  ], 'charge-missing-reference')
  assert.deepEqual(item, {
    movementId: 'charge-missing-reference', kind: 'RED', reason: 'REFERENCIA_BANCARIA_SIN_FACTURA',
  })
})

test('una diferencia grande no inventa una factura y queda roja', () => {
  const item = decision([
    payment({ movementId: 'charge-large-difference', importeBancoCentimos: -295_506, conceptoBanco: 'CARGO PROVEEDOR', candidates: [
      invoice({ invoiceId: 'far-invoice', referencia: 'CC260000000444', importeDisponibleCentimos: -100 }),
    ] }),
  ], 'charge-large-difference')
  assert.deepEqual(item, {
    movementId: 'charge-large-difference', kind: 'RED', reason: 'NINGUNA_FACTURA_DE_ESTE_IMPORTE',
  })
})

test('la revisión de diferencia pequeña sólo ocurre después de reservar exactas y nunca reutiliza una reservada', () => {
  const shared = invoice({ invoiceId: 'reserved-exact', referencia: 'CC260000000555', importeDisponibleCentimos: -47_093 })
  const result = assignConciliarProviderPayments([
    payment({ movementId: 'charge-exact-no-reference', importeBancoCentimos: -47_093, conceptoBanco: 'PAGO OPERADOR', candidates: [shared] }),
    payment({ movementId: 'charge-small-difference', importeBancoCentimos: -47_093 + CONCILIAR_PROVIDER_SMALL_DIFFERENCE_CENTS, conceptoBanco: 'RECIBO PROVEEDOR', referenciaBanco: 'CC260000000555', candidates: [shared] }),
  ])
  assert.equal(result.get('charge-exact-no-reference')?.kind, 'EXACT_NO_REFERENCE')
  assert.deepEqual(result.get('charge-small-difference'), {
    movementId: 'charge-small-difference', kind: 'RED', reason: 'REFERENCIA_BANCARIA_SIN_FACTURA',
  })
})

test('dos exactos indistinguibles no se resuelven por UUID ni orden de entrada', () => {
  const shared = invoice({ invoiceId: 'only-invoice', referencia: 'CC260000000666', importeDisponibleCentimos: -48_811 })
  const input = [
    payment({ movementId: 'charge-a', importeBancoCentimos: -48_811, conceptoBanco: 'PAGO OPERADOR', candidates: [shared] }),
    payment({ movementId: 'charge-b', importeBancoCentimos: -48_811, conceptoBanco: 'PAGO OPERADOR', candidates: [shared] }),
  ]
  for (const payments of [input, [...input].reverse()]) {
    assert.deepEqual(decision(payments, 'charge-a'), { movementId: 'charge-a', kind: 'AMBAR', reason: 'CANDIDATAS_EXACTAS_AMBIGUAS' })
    assert.deepEqual(decision(payments, 'charge-b'), { movementId: 'charge-b', kind: 'AMBAR', reason: 'CANDIDATAS_EXACTAS_AMBIGUAS' })
  }
})

test('un literal documental de proveedor nunca alcanza verde ni exacto aunque referencia e importe coincidan', () => {
  const item = decision([
    payment({ movementId: 'charge-documentary-only', importeBancoCentimos: -12_345, conceptoBanco: 'RECIBO PROVEEDOR', referenciaBanco: 'CC260000000777', candidates: [
      invoice({ invoiceId: 'documentary-only', referencia: 'CC260000000777', importeDisponibleCentimos: -12_345, providerMatch: 'DOCUMENTARY' }),
    ] }),
  ], 'charge-documentary-only')
  assert.deepEqual(item, {
    movementId: 'charge-documentary-only', kind: 'REVIEW', reason: 'PROVEEDOR_SOLO_DOCUMENTAL', invoiceId: 'documentary-only',
  })
})

test('una referencia A completa del concepto prevalece sobre un localizador ajeno incrustado', () => {
  const item = decision([
    payment({ movementId: 'charge-explicit-a', importeBancoCentimos: -48_811, conceptoBanco: 'PAGO FACTURA A/1154340 RECIBO CC260000005422', candidates: [
      invoice({ invoiceId: 'invoice-a', referencia: 'A/1154340', importeDisponibleCentimos: -48_811 }),
      invoice({ invoiceId: 'invoice-cc', referencia: 'CC260000005422', importeDisponibleCentimos: -48_811 }),
    ] }),
  ], 'charge-explicit-a')
  assert.deepEqual(item, {
    movementId: 'charge-explicit-a', kind: 'EXACT_REFERENCE', reason: 'REFERENCIA_EXACTA', invoiceId: 'invoice-a',
  })
})

test('una referencia bancaria completa exige exactamente su factura aunque el concepto cite otra', () => {
  const item = decision([
    payment({ movementId: 'charge-bank-reference-wins', importeBancoCentimos: -48_811, conceptoBanco: 'PAGO FACTURA A/1154340', referenciaBanco: 'CC260000005422', candidates: [
      invoice({ invoiceId: 'invoice-a', referencia: 'A/1154340', importeDisponibleCentimos: -48_811 }),
    ] }),
  ], 'charge-bank-reference-wins')
  assert.deepEqual(item, {
    movementId: 'charge-bank-reference-wins', kind: 'RED', reason: 'REFERENCIA_BANCARIA_SIN_FACTURA',
  })
})

test('un identificador contable sin sintaxis documental no transforma un mismo importe en verde', () => {
  const item = decision([
    payment({ movementId: 'charge-bare-locator', importeBancoCentimos: -48_811, conceptoBanco: 'PAGO OPERADOR LOTE 83921', candidates: [
      invoice({ invoiceId: 'invoice-cc', referencia: 'CC260000005422', importeDisponibleCentimos: -48_811 }),
    ] }),
  ], 'charge-bare-locator')
  assert.deepEqual(item, {
    movementId: 'charge-bare-locator', kind: 'EXACT_NO_REFERENCE', reason: 'SIN_REFERENCIA_DOCUMENTAL', invoiceId: 'invoice-cc',
  })
})

test('un número completo de serie conocida en el concepto sigue siendo obligatorio aunque falte su factura', () => {
  const item = decision([
    payment({ movementId: 'missing-compact', importeBancoCentimos: -10_000, conceptoBanco: 'RECIBO cc260000009999', candidates: [
      invoice({ invoiceId: 'not-the-cited-invoice', referencia: 'CC260000000111', importeDisponibleCentimos: -10_000 }),
    ] }),
  ], 'missing-compact')
  assert.deepEqual(item, { movementId: 'missing-compact', kind: 'RED', reason: 'REFERENCIA_BANCARIA_SIN_FACTURA' })
})

test('una aproximada no se apropia de una factura que necesita una exacta ambigua', () => {
  const shared = invoice({ invoiceId: 'unresolved-exact', referencia: 'A/998877', importeDisponibleCentimos: -10_000 })
  const result = assignConciliarProviderPayments([
    payment({ movementId: 'exact-a', importeBancoCentimos: -10_000, conceptoBanco: 'PAGO PROVEEDOR', candidates: [shared] }),
    payment({ movementId: 'exact-b', importeBancoCentimos: -10_000, conceptoBanco: 'PAGO PROVEEDOR', candidates: [shared] }),
    payment({ movementId: 'approx', importeBancoCentimos: -9_950, conceptoBanco: 'PAGO PROVEEDOR', candidates: [shared] }),
  ])
  assert.equal(result.get('exact-a')?.kind, 'AMBAR')
  assert.equal(result.get('exact-b')?.kind, 'AMBAR')
  assert.equal(result.get('approx')?.kind, 'RED')
  assert.equal(result.get('approx')?.invoiceId, undefined)
})

console.log('OK: reserva global, prioridad de referencia, ambigüedad fail-closed y revisiones sin reutilización verificadas con fixtures sintéticas.')

test('un número numérico sin serie sólo muestra revisión humana si proveedor, importe y fecha son exactos', () => {
  const candidate = invoice({ invoiceId: 'numeric-review-source', referencia: 'F987652', importeDisponibleCentimos: -12_345 })
  const result = decision([payment({ movementId: 'numeric-review-charge', importeBancoCentimos: -12_345, conceptoBanco: 'PAGO FACTURA 987651', candidates: [candidate] })], 'numeric-review-charge')
  assert.deepEqual(result, { movementId: 'numeric-review-charge', kind: 'REVIEW', reason: 'REFERENCIA_NUMERO_INCOMPLETO', invoiceId: candidate.invoiceId })
})

test('el número incompleto no admite diferencia de céntimos o fecha posterior', () => {
  for (const overrides of [{ importeDisponibleCentimos: -12_344 }, { fecha: '2026-07-01' }]) {
    const candidate = invoice({ invoiceId: 'numeric-invalid-source', referencia: 'F987652', importeDisponibleCentimos: -12_345, ...overrides })
    const result = decision([payment({ movementId: 'numeric-invalid-charge', importeBancoCentimos: -12_345, conceptoBanco: 'PAGO FACTURA 987651', candidates: [candidate] })], 'numeric-invalid-charge')
    assert.equal(result.kind, 'RED')
    assert.equal(result.invoiceId, undefined)
  }
})

test('un proveedor documental con número incompleto sólo queda en revisión humana aunque el importe sea exacto', () => {
  const candidate = invoice({ invoiceId: 'documentary-numeric-source', referencia: 'F987652', importeDisponibleCentimos: -12_345, providerMatch: 'DOCUMENTARY' })
  const result = decision([payment({ movementId: 'documentary-numeric-charge', importeBancoCentimos: -12_345, conceptoBanco: 'PAGO FACTURA 987651', candidates: [candidate] })], 'documentary-numeric-charge')
  assert.equal(result.kind, 'REVIEW')
  assert.equal(result.reason, 'REFERENCIA_NUMERO_INCOMPLETO')
})

test('la revisión de número incompleto no consume una factura reservada por una coincidencia documental exacta', () => {
  const candidate = invoice({ invoiceId: 'numeric-reserved-source', referencia: 'F/987652', importeDisponibleCentimos: -12_345 })
  const result = assignConciliarProviderPayments([
    payment({ movementId: 'complete-ref-charge', importeBancoCentimos: -12_345, conceptoBanco: 'PAGO FACTURA F/987652', candidates: [candidate] }),
    payment({ movementId: 'incomplete-ref-charge', importeBancoCentimos: -12_345, conceptoBanco: 'PAGO FACTURA 987651', candidates: [candidate] }),
  ])
  assert.equal(result.get('complete-ref-charge')?.kind, 'EXACT_REFERENCE')
  assert.equal(result.get('incomplete-ref-charge')?.invoiceId, undefined)
})

test('dos cargos de número incompleto que necesitan la misma factura quedan ambiguos y no reciben una asignación arbitraria', () => {
  const candidate = invoice({ invoiceId: 'numeric-ambiguous-source', referencia: 'F987652', importeDisponibleCentimos: -12_345 })
  const result = assignConciliarProviderPayments(['charge-1', 'charge-2'].map(movementId => payment({ movementId, importeBancoCentimos: -12_345, conceptoBanco: 'PAGO FACTURA 987651', candidates: [candidate] })))
  for (const movementId of ['charge-1','charge-2']) {
    assert.equal(result.get(movementId)?.kind, 'AMBAR')
    assert.equal(result.get(movementId)?.invoiceId, undefined)
  }
})
