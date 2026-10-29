import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCreditNotesToIssuedBankProjection } from '../lib/finanzas/finance-credit-note-bank-invoicing'

const invoice = { invoiceId: 'fi-a', targetCents: 10_000, paidDocumentaryCents: 3_000, remainingCents: 7_000, paymentState: 'PENDIENTE_COBRO' }
const settlement = {
  originalDocumentId: 'fi-a', kind: 'EMITIDA' as const, currencyCode: 'EUR', originalCents: 10_000,
  validRectificationCents: 2_000, validB4PaymentCents: 3_000, pendingCents: 5_000, state: 'PARCIAL' as const, reviewReasons: [],
}

test('B7 recibe una vista de pendiente rectificado sólo con ID y evidencia B4 exactos', () => {
  const [row] = applyCreditNotesToIssuedBankProjection([invoice], [settlement])
  assert.deepEqual([row.creditNoteState, row.rectificationCents, row.remainingAfterCreditNotesCents], ['PARCIAL', 2_000, 5_000])
})

test('un desajuste de B7 o un resultado repetido no se transforma en crédito automático', () => {
  const [mismatch] = applyCreditNotesToIssuedBankProjection([{ ...invoice, paidDocumentaryCents: 2_999 }], [settlement])
  assert.deepEqual([mismatch.creditNoteState, mismatch.rectificationCents, mismatch.remainingAfterCreditNotesCents], ['REVISION', null, null])
  assert.ok(mismatch.creditNoteReviewReasons.includes('B7_Y_RECTIFICATIVA_NO_COINCIDEN_EXACTAMENTE'))

  const [duplicate] = applyCreditNotesToIssuedBankProjection([invoice], [settlement, { ...settlement }])
  assert.deepEqual([duplicate.creditNoteState, duplicate.rectificationCents, duplicate.remainingAfterCreditNotesCents], ['REVISION', null, null])
})
