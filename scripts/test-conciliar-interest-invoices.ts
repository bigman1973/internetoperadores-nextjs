/* C10 interest-invoice pure contract. No Prisma, DB, network, PDFs or PII. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isManualInterestInvoiceEvidence,
  normalizeInterestInvoiceIssuer,
  normalizeInterestInvoiceReference,
  parseApplyDocumentedConfirmingInterestInvoiceSupport,
} from '../lib/finanzas/conciliar-confirming'

const LOT = '11111111-1111-4111-8111-111111111111'
const KEY = '22222222-2222-4222-8222-222222222222'
const invoice = { facturaInteresId: 'bank-invoice-synthetic', referenciaDocumental: 'BANK-9001', emisorBanco: 'BBVA S.A.', fechaFactura: '2026-10-12', importeDecimal: '4.00' }
function proof(overrides: Partial<Parameters<typeof isManualInterestInvoiceEvidence>[0]> = {}) {
  return { importeInteresCentimos: 400, fechaConfirming: '2026-10-10', referenciaHumana: 'LIQUIDACION OCTUBRE', emisorHumano: 'Banco Bilbao Vizcaya Argentaria', factura: invoice, ...overrides }
}

test('importe exacto y fecha posterior son obligatorios', () => {
  assert.equal(isManualInterestInvoiceEvidence(proof()), true)
  assert.equal(isManualInterestInvoiceEvidence(proof({ importeInteresCentimos: 399 })), false)
  assert.equal(isManualInterestInvoiceEvidence(proof({ factura: { ...invoice, fechaFactura: '2026-10-09' } })), false)
})
test('referencia humana no se infiere ni compara con los números propios de los documentos', () => {
  assert.equal(normalizeInterestInvoiceReference('LIQUIDACION OCTUBRE'), 'LIQUIDACION OCTUBRE')
  assert.equal(normalizeInterestInvoiceReference(''), null)
  assert.equal(isManualInterestInvoiceEvidence(proof({ referenciaHumana: '' })), false)
  assert.equal(isManualInterestInvoiceEvidence(proof({ factura: { ...invoice, referenciaDocumental: 'OTRO-NUMERO-BANCARIO' } })), true)
})
test('emisor normaliza BBVA y CaixaBank; nunca usa banco depositario', () => {
  assert.equal(normalizeInterestInvoiceIssuer('BBVA S.A.'), 'BBVA')
  assert.equal(normalizeInterestInvoiceIssuer('CaixaBank SA'), 'CAIXABANK')
  assert.equal(isManualInterestInvoiceEvidence(proof({ emisorHumano: 'Santander' })), false)
})
test('un payload cerrado requiere confirmar=true y no admite campos de factura inventados', () => {
  const valid = { action: 'vincular_factura_interes', confirmar: true, loteId: LOT, facturaInteresId: 'bank-invoice-synthetic', referenciaDocumental: 'LIQUIDACION OCTUBRE', emisorBanco: 'BBVA S.A.', idempotencyKey: KEY }
  assert.equal(parseApplyDocumentedConfirmingInterestInvoiceSupport(valid).confirmar, true)
  assert.throws(() => parseApplyDocumentedConfirmingInterestInvoiceSupport({ ...valid, confirmar: false }), { code: 'CONFIRMACION_HUMANA_REQUERIDA' })
  assert.throws(() => parseApplyDocumentedConfirmingInterestInvoiceSupport({ ...valid, importe: 400 }), { code: 'VALIDATION_ERROR' })
})
