import assert from 'node:assert/strict'
import { canAttemptConciliarProjectionDelta, closeDeltaProposalDependencies } from '../lib/finanzas/conciliar-delta'
import { emittedProjection } from '../lib/finanzas/conciliar-db'

const base = {
  action: 'CONFIRMAR' as const,
  sourceKind: 'COBRO_PROPUESTA' as const,
  originalOperationB4Id: '11111111-1111-4111-8111-111111111111',
  movimientoId: 'movimiento-1',
}

assert.equal(canAttemptConciliarProjectionDelta({ ...base, projectionWasDirty: true }), false,
  'Dirty previo no puede limpiarse mediante delta aunque el recibo sea conocido.')
assert.equal(canAttemptConciliarProjectionDelta({ ...base, projectionWasDirty: false }), true)

const closed = closeDeltaProposalDependencies(['fi-a'], [
  { movimientoId: 'cobro-a-b', invoiceIds: ['fi-a', 'fi-b'] },
  { movimientoId: 'cobro-b-c', invoiceIds: ['fi-b', 'fi-c'] },
  { movimientoId: 'cobro-aislado', invoiceIds: ['fi-z'] },
])
assert.deepEqual(closed, {
  invoiceIds: ['fi-a', 'fi-b', 'fi-c'],
  movimientoIds: ['cobro-a-b', 'cobro-b-c'],
}, 'Un cambio B7 de FI debe incluir propuestas transitivas y sus otras Emitidas, no sólo el cobro propio.')

assert.equal(closeDeltaProposalDependencies(['fi-a'], [
  { movimientoId: 'cobro-a-b', invoiceIds: ['fi-a', 'fi-b'] },
], 1), null, 'Si la componente no cabe, el delta debe hacer fallback sin escribir una foto parcial.')
assert.equal(closeDeltaProposalDependencies([], [], 25_000), null)

const reviewRow = emittedProjection({
  invoiceId: 'fi-review', numFactura: 'F-REVIEW', cliente: 'Cliente', fechaISO: '2026-10-01', fechaVencimientoISO: null,
  facturaISPId: 1, targetCents: 10_000, paidDocumentaryCents: null, remainingCents: null, cashCents: null,
  attributableCashDifferenceCents: null, paymentSources: ['B4_REMESA'], paymentState: 'PENDIENTE_COBRO_REVISION',
  reasons: ['RECIBO_REMESA_B7_INEXACTO'],
}, undefined)
assert.ok(reviewRow, 'Una reason B7 canónica normal se representa como Emitida ámbar; no fuerza un fallback inseguro.')
assert.equal(reviewRow?.row.color, 'AMBAR')

const revertedReceiptRow = emittedProjection({
  invoiceId: 'fi-reverted', numFactura: 'F-UNDO', cliente: 'Cliente', fechaISO: '2026-10-01', fechaVencimientoISO: null,
  facturaISPId: 2, targetCents: 10_000, paidDocumentaryCents: 0, remainingCents: 10_000, cashCents: null,
  attributableCashDifferenceCents: null, paymentSources: [], paymentState: 'PENDIENTE_COBRO', reasons: [],
}, undefined)
assert.ok(revertedReceiptRow, 'Tras revertir el recibo, la FI pendiente vuelve a tener la misma representación canónica del rebuild.')
assert.equal(revertedReceiptRow?.row.pendienteCentimos, 10_000)

const settledWithNormalReason = emittedProjection({
  invoiceId: 'fi-zero', numFactura: 'F-CERO', cliente: 'Cliente', fechaISO: '2026-10-01', fechaVencimientoISO: null,
  facturaISPId: 3, targetCents: 0, paidDocumentaryCents: 0, remainingCents: 0, cashCents: null,
  attributableCashDifferenceCents: null, paymentSources: [], paymentState: 'COBRADA_CALCULADA',
  reasons: ['TOTAL_CERO_SIN_COBRO_EXIGIBLE'],
}, undefined)
assert.equal(settledWithNormalReason, null,
  'El estado B7 canónico decide la eliminación de Emitidas: no se bloquea por el mero texto de reasons.')

console.log('conciliar delta synthetic test: ok')
