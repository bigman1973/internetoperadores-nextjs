/* Perfil STAGE: contrato puro de las seis enmiendas autorizadas, sin BD/API. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCase, type ConciliarReleaseRegressionCase, type ConciliarReleaseRegressionDataset } from '../lib/finanzas/conciliar-release-regression-core'
import { stageProfileIsExactDerivative } from './areas/conciliar/stage-profile-core'

const bank = (overrides: Record<string, unknown> = {}) => ({
  movementKey: 'synthetic-movement', bankName: 'Synthetic Bank', accountKey: 'synthetic-account', bankDate: '2026-10-01',
  amountCents: 12_345, searchableText: 'synthetic source', counterpartyText: null, b4Confirmed: false, isCardPayment: false, oppositeOwnAccountPairs: [], ...overrides,
})
const projection = (overrides: Record<string, unknown> = {}) => ({
  movementKey: 'synthetic-movement', visible: true, tab: 'COBROS', color: 'AMBAR', groupLabel: 'CLIENTES', documentReference: null,
  reasonText: 'synthetic pending', differenceCents: 0, isParaPedir: false, ...overrides,
})
const pending = (caseId: 'C3' | 'C7' | 'C8' | 'P7'): ConciliarReleaseRegressionCase => ({
  caseId, mode: 'PENDING_VISIBLE', selector: { bank: 'Synthetic Bank', date: '2026-10-01', signedCents: 12_345, searchTerms: ['synthetic'] },
  expect: { b4Confirmed: false, visible: true },
})
const absent = (caseId: 'C2' | 'P31'): ConciliarReleaseRegressionCase => ({
  caseId, mode: 'ABSENT_CONFIRMED', selector: { bank: 'Synthetic Bank', date: '2026-10-01', signedCents: 12_345, searchTerms: ['synthetic'] },
  expect: { b4Confirmed: true, absentAllTabs: true },
})

test('STAGE has exactly four pending-visible and two confirmed-absence amendments; pending never asserts colour', () => {
  const changed = [pending('C3'), pending('C7'), pending('C8'), pending('P7'), absent('C2'), absent('P31')]
  assert.equal(changed.length, 6)
  assert.deepEqual(changed.map(item => item.caseId).sort(), ['C2', 'C3', 'C7', 'C8', 'P31', 'P7'])
  for (const item of changed.filter(item => item.mode === 'PENDING_VISIBLE')) {
    assert.equal(Object.hasOwn(item.expect, 'color'), false)
    assert.equal(Object.hasOwn(item.expect, 'allowedColors'), false)
    assert.equal(evaluateCase(item, { bankRows: [bank()], projectionRows: [projection({ color: 'ROJO' })] }).pass, true)
    assert.equal(evaluateCase(item, { bankRows: [bank()], projectionRows: [projection({ color: 'AMBAR' })] }).pass, true)
  }
  for (const item of changed.filter(item => item.mode === 'ABSENT_CONFIRMED')) {
    assert.equal(evaluateCase(item, { bankRows: [bank({ b4Confirmed: true })], projectionRows: [] }).pass, true)
  }
})

test('production C4 remains exact green with 167 lines and blocks an amber/G7 conflict', () => {
  const c4: ConciliarReleaseRegressionCase = {
    caseId: 'C4', mode: 'EXACT', selector: { bank: 'Synthetic Bank', date: '2026-10-01', signedCents: 12_345, searchTerms: ['synthetic'] },
    expect: { tab: 'COBROS', color: 'VERDE', group: 'REMESAS', remittanceComposition: { lineCount: 167, sumCents: 12_345, exact: true } },
  }
  const data: ConciliarReleaseRegressionDataset = {
    bankRows: [bank()],
    projectionRows: [projection({ color: 'AMBAR', groupLabel: 'REMESAS', remittanceComposition: { lineCount: 167, sumCents: 12_345, exact: true } })],
  }
  assert.equal(evaluateCase(c4, data).reasons.includes('COLOR_MISMATCH'), true)
})

test('derivative comparison permits exactly six expectation edits and preserves every selector and other case', () => {
  const ids = ['C2', 'C3', 'C7', 'C8', 'P7', 'P31']
  const cases = ids.map(caseId => ({ caseId, mode: 'OLD', expect: { old: true }, selector: { token: caseId } }))
  const untouched = { caseId: 'C4', mode: 'EXACT', expect: { color: 'VERDE' }, selector: { token: 'keep' } }
  const golden = { schema: 'UNIT_ONLY', cases: [...cases, untouched] }
  const edits = ids.map(caseId => ({ caseId, collection: 'cases', before: { mode: 'OLD', expect: { old: true } }, after: { mode: 'NEW', expect: { visible: true } } }))
  const derived = { schema: 'UNIT_ONLY', cases: [...cases.map(item => ({ ...item, mode: 'NEW', expect: { visible: true } })), untouched] }
  assert.equal(stageProfileIsExactDerivative(golden, derived, edits), true)
  for (const mutate of [
    (value: any) => { value.cases[6].expect.color = 'AMBAR' },
    (value: any) => { value.cases[0].selector.token = 'altered' },
    (value: any) => { value.cases.push({ caseId: 'C99', mode: 'NEW' }) },
    (value: any) => { value.schema = 'CHANGED' },
  ]) {
    const invalid = JSON.parse(JSON.stringify(derived))
    mutate(invalid)
    assert.equal(stageProfileIsExactDerivative(golden, invalid, edits), false)
  }
  assert.equal(stageProfileIsExactDerivative(golden, derived, edits.slice(0, 5)), false)
  assert.equal(stageProfileIsExactDerivative(golden, derived, [...edits.slice(0, 5), edits[0]!]), false)
  const changedGolden = JSON.parse(JSON.stringify(golden))
  changedGolden.cases[0].mode = 'UNAUTHORIZED_SOURCE'
  assert.equal(stageProfileIsExactDerivative(changedGolden, derived, edits), false)
})

console.log('OK: perfil STAGE de seis cambios exclusivos y Golden C4 exacto/verde preservados.')
