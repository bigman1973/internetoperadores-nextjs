import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCase, sourceMatches, type ConciliarReleaseRegressionCase, type RegressionBankRow, type RegressionProjectionRow } from '../lib/finanzas/conciliar-release-regression-core'

const bank: RegressionBankRow = {
  movementKey: 'synthetic-movement', bankName: 'Synthetic Bank', accountKey: 'synthetic-account',
  bankDate: '2026-01-10', amountCents: 10000, searchableText: 'TRANSFERENCIA PROPIA', counterpartyText: null,
  b4Confirmed: false, isCardPayment: false, oppositeOwnAccountPairs: [],
}
const projection: RegressionProjectionRow = {
  movementKey: bank.movementKey, visible: true, tab: 'COBROS', color: 'AMBAR', groupLabel: 'TRASPASOS_PROPIOS',
  documentReference: null, reasonText: 'Falta la pareja', differenceCents: null, isParaPedir: false,
}
const c9: ConciliarReleaseRegressionCase = {
  caseId: 'C9', mode: 'PARAMETRIC', selector: { signedDirection: 'POSITIVE' },
  expect: { group: 'TRASPASOS_PROPIOS', allowedColors: ['VERDE', 'AMBAR'], noParaPedir: true, colorByOppositeOwnAccountPair: true, maxPairDays: 3 },
}
const paired = { ...bank, oppositeOwnAccountPairs: [{ daysApart: 3, oppositeSign: true, distinctAccount: true }] }

test('C9 requires amber without a pair and green with the exact bounded opposite pair', () => {
  assert.equal(evaluateCase(c9, { bankRows: [bank], projectionRows: [projection] }).pass, true)
  assert.equal(evaluateCase(c9, { bankRows: [paired], projectionRows: [{ ...projection, color: 'VERDE' }] }).pass, true)
  assert.equal(evaluateCase(c9, { bankRows: [bank], projectionRows: [{ ...projection, color: 'VERDE' }] }).pass, false)
  assert.equal(evaluateCase(c9, { bankRows: [paired], projectionRows: [projection] }).pass, false)
})

test('C9 rejects a red/requested transfer and a false pair in the same account or beyond three days', () => {
  assert.equal(evaluateCase(c9, { bankRows: [bank], projectionRows: [{ ...projection, color: 'ROJO', isParaPedir: true }] }).pass, false)
  for (const pair of [{ daysApart: 4, oppositeSign: true, distinctAccount: true }, { daysApart: 1, oppositeSign: true, distinctAccount: false }, { daysApart: 1, oppositeSign: false, distinctAccount: true }]) {
    assert.equal(evaluateCase(c9, { bankRows: [{ ...bank, oppositeOwnAccountPairs: [pair] }], projectionRows: [{ ...projection, color: 'VERDE' }] }).pass, false)
  }
})

test('P12 excludes only proved card instruments, never a salary based on an employee name', () => {
  const selector = { signedDirection: 'NEGATIVE' as const, searchAnyTerms: ['nomina'], excludeCardPayments: true }
  const salary = { ...bank, amountCents: -10000, searchableText: 'TRANSFERENCIA NOMINA', isCardPayment: false }
  assert.equal(sourceMatches(selector, salary), true)
  assert.equal(sourceMatches(selector, { ...salary, searchableText: 'COMPRA TARJETA NOMINA', isCardPayment: true }), false)
  assert.equal(sourceMatches(selector, { ...salary, isCardPayment: undefined }), false)
})

test('P12 never passes an empty salary population after excluding cards', () => {
  const p12: ConciliarReleaseRegressionCase = { caseId: 'P12', mode: 'PARAMETRIC', selector: { excludeCardPayments: true }, expect: { group: 'NOMINAS' } }
  const result = evaluateCase(p12, { bankRows: [{ ...bank, isCardPayment: true }], projectionRows: [] })
  assert.equal(result.pass, false)
  assert(result.reasons.includes('COVERAGE_EMPTY'))
})

test('C7 and C8 confirmed absence fails if the movement survives in any of the four tabs', () => {
  for (const caseId of ['C7', 'C8']) {
    const item: ConciliarReleaseRegressionCase = { caseId, mode: 'ABSENT_CONFIRMED', selector: { date: bank.bankDate }, expect: { b4Confirmed: true, absentAllTabs: true } }
    const confirmed = { ...bank, b4Confirmed: true }
    assert.equal(evaluateCase(item, { bankRows: [confirmed], projectionRows: [] }).pass, true)
    for (const tab of ['COBROS', 'PAGOS', 'EMITIDAS', 'RECIBIDAS']) {
      assert.equal(evaluateCase(item, { bankRows: [confirmed], projectionRows: [{ ...projection, tab }] }).pass, false)
    }
  }
})

test('A bank-tab case ignores a separate documentary view but still rejects duplicate bank rows', () => {
  const item: ConciliarReleaseRegressionCase = { caseId: 'C1', mode: 'EXACT', selector: { date: bank.bankDate }, expect: { tab: 'COBROS', color: 'AMBAR' } }
  const documentary = { ...projection, tab: 'RECIBIDAS' }
  assert.equal(evaluateCase(item, { bankRows: [bank], projectionRows: [projection, documentary] }).pass, true)
  assert.equal(evaluateCase(item, { bankRows: [bank], projectionRows: [projection, projection, documentary] }).pass, false)
  assert.equal(evaluateCase(item, { bankRows: [bank], projectionRows: [documentary] }).pass, false)
})
