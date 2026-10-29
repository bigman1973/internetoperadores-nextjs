import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCreditNotesToPendingInvoiceProjection } from '../lib/finanzas/finance-credit-note-pending'

const received = {
  id: 'fr-a', tipo: 'FACTURA_RECIBIDA' as const,
  importeObjetivoCentimos: -10_000, importeAsignadoActivoCentimos: -3_000, importePendienteCentimos: -7_000,
}
const settlement = {
  originalDocumentId: 'fr-a', kind: 'RECIBIDA' as const, currencyCode: 'EUR', originalCents: -10_000,
  validRectificationCents: -2_000, validB4PaymentCents: -3_000, pendingCents: -5_000,
  state: 'PARCIAL' as const, reviewReasons: [],
}

test('recibidas reutiliza pendiente B5 firmado y descuenta rectificativa sin pago ficticio', () => {
  const [row] = applyCreditNotesToPendingInvoiceProjection([received], [settlement])
  assert.deepEqual([row.creditNoteState, row.rectificationCents, row.importePendienteTrasRectificativasCentimos], ['PARCIAL', -2_000, -5_000])
})

test('si B5 no coincide en B4 o hay doble resultado, devuelve revisión sin cambiar la proyección de pago', () => {
  const [mismatch] = applyCreditNotesToPendingInvoiceProjection([{ ...received, importeAsignadoActivoCentimos: -2_999 }], [settlement])
  assert.deepEqual([mismatch.creditNoteState, mismatch.rectificationCents, mismatch.importePendienteTrasRectificativasCentimos], ['REVISION', null, null])
  assert.ok(mismatch.creditNoteReviewReasons.includes('B5_Y_RECTIFICATIVA_NO_COINCIDEN_EXACTAMENTE'))

  const [duplicate] = applyCreditNotesToPendingInvoiceProjection([received], [settlement, { ...settlement }])
  assert.deepEqual([duplicate.creditNoteState, duplicate.rectificationCents, duplicate.importePendienteTrasRectificativasCentimos], ['REVISION', null, null])
})
