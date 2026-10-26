/*
 * Regresiones puras de pendientes recibidas Conciliar.
 * Sin BD, red, Prisma migrate, build ni tsc.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  receivedInvoicePendingCandidate,
  receivedInvoicePendingSettlement,
} from '../lib/finanzas/conciliar-db'

test('facturas de 100 y abono proveedor de -40 conservan ambos signos y netean deuda a 60', () => {
  const payable = receivedInvoicePendingSettlement({ totalCentimos: 10_000, assignedCentimos: 0 })
  const supplierCredit = receivedInvoicePendingSettlement({ totalCentimos: -4_000, assignedCentimos: 0 })

  assert.deepEqual(payable, { targetCentimos: -10_000, pendingCentimos: -10_000 })
  assert.deepEqual(supplierCredit, { targetCentimos: 4_000, pendingCentimos: 4_000 })
  assert.equal((payable?.pendingCentimos ?? 0) + (supplierCredit?.pendingCentimos ?? 0), -6_000)
  assert.equal(Math.abs((payable?.pendingCentimos ?? 0) + (supplierCredit?.pendingCentimos ?? 0)), 6_000)
})

test('una asignación B4 confirmada de 30 deja exactamente 70 pendientes', () => {
  const settlement = receivedInvoicePendingSettlement({ totalCentimos: 10_000, assignedCentimos: -3_000 })
  assert.deepEqual(settlement, { targetCentimos: -10_000, pendingCentimos: -7_000 })
})

test('un abono proveedor negativo se conserva una sola vez como crédito pendiente de signo positivo', () => {
  const settlement = receivedInvoicePendingSettlement({ totalCentimos: -4_000, assignedCentimos: 0 })
  assert.deepEqual(settlement, { targetCentimos: 4_000, pendingCentimos: 4_000 })
  assert.equal(receivedInvoicePendingSettlement({ totalCentimos: 0, assignedCentimos: 0 }), null)
})

test('un único pago propuesto conserva su semáforo; varios pagos nunca dan verde a ciegas', () => {
  const noPayment = receivedInvoicePendingCandidate([])
  assert.equal(noPayment.color, 'ROJO')
  assert.equal(noPayment.motivo, 'Aún no consta un pago confirmado.')
  assert.equal(noPayment.candidate, null)

  const amberPayment = receivedInvoicePendingCandidate([{ rowId: 'pago-ambar', color: 'AMBAR' }])
  assert.equal(amberPayment.color, 'AMBAR')
  assert.equal(amberPayment.candidate?.rowId, 'pago-ambar')

  const greenPayment = receivedInvoicePendingCandidate([{ rowId: 'pago-verde', color: 'VERDE' }])
  assert.equal(greenPayment.color, 'VERDE')
  assert.equal(greenPayment.candidate?.rowId, 'pago-verde')

  const ambiguous = receivedInvoicePendingCandidate([
    { rowId: 'pago-verde', color: 'VERDE' },
    { rowId: 'pago-ambar', color: 'AMBAR' },
  ])
  assert.equal(ambiguous.color, 'AMBAR')
  assert.equal(ambiguous.candidate, null)
  assert.match(ambiguous.motivo, /varios pagos propuestos/i)
})

console.log('OK: pendientes recibidas firmados y enlaces de pago validados sin BD ni red.')
