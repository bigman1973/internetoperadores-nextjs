/* Perfil STAGE V2: ocho overrides exactos y C4 compuesto; sin BD/API. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCase, type ConciliarReleaseRegressionCase, type ConciliarReleaseRegressionDataset } from './areas/conciliar/case-core'
import { deriveAuthorizedProductionGolden, deriveAuthorizedStageProfile, stageProfileIsExactDerivative } from './areas/conciliar/stage-profile-core'

const bank = (overrides: Record<string, unknown> = {}) => ({
  movementKey: 'synthetic-movement', bankName: 'Synthetic Bank', accountKey: 'synthetic-account', bankDate: '2026-10-01',
  amountCents: 12_345, searchableText: 'synthetic source', counterpartyText: null, b4Confirmed: false, isCardPayment: false, oppositeOwnAccountPairs: [], ...overrides,
})
const projection = (overrides: Record<string, unknown> = {}) => ({
  movementKey: 'synthetic-movement', visible: true, tab: 'COBROS', color: 'AMBAR', groupLabel: 'CLIENTES', documentReference: null,
  reasonText: 'synthetic pending', differenceCents: 0, isParaPedir: false, ...overrides,
})
const pending = (caseId: 'C1' | 'P1' | 'C3' | 'C7' | 'C8' | 'P7'): ConciliarReleaseRegressionCase => ({
  caseId, mode: 'PENDING_VISIBLE', selector: { bank: 'Synthetic Bank', date: '2026-10-01', signedCents: 12_345, searchTerms: ['synthetic'] },
  expect: { b4Confirmed: false, visible: true },
})
const absent = (caseId: 'C2' | 'P31'): ConciliarReleaseRegressionCase => ({
  caseId, mode: 'ABSENT_CONFIRMED', selector: { bank: 'Synthetic Bank', date: '2026-10-01', signedCents: 12_345, searchTerms: ['synthetic'] },
  expect: { b4Confirmed: true, absentAllTabs: true },
})

test('STAGE has exactly six pending-visible and two confirmed-absence overrides; pending never asserts colour', () => {
  const changed = [pending('C1'), pending('P1'), pending('C3'), pending('C7'), pending('C8'), pending('P7'), absent('C2'), absent('P31')]
  assert.equal(changed.length, 8)
  assert.deepEqual(changed.map(item => item.caseId).sort(), ['C1', 'C2', 'C3', 'C7', 'C8', 'P1', 'P31', 'P7'])
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

test('pending visibility requires one bank task; invoice mirrors neither prove visibility nor duplicate it', () => {
  const spec = pending('C1')
  const data = (rows: ReturnType<typeof projection>[]) => ({ bankRows: [bank()], projectionRows: rows })
  assert.equal(evaluateCase(spec, data([projection(), projection({ tab: 'EMITIDAS' })])).pass, true)
  assert.equal(evaluateCase(spec, data([projection({ tab: 'EMITIDAS' })])).pass, false)
  assert.equal(evaluateCase(spec, data([projection(), projection()])).reasons.includes('PROJECTION_AMBIGUOUS'), true)
  assert.equal(evaluateCase(spec, data([projection({ visible: false }), projection({ tab: 'EMITIDAS' })])).pass, false)
  assert.equal(evaluateCase(absent('C2'), { bankRows: [bank({ b4Confirmed: true })], projectionRows: [projection({ tab: 'EMITIDAS' })] }).pass, false)
})

test('C4 permits only the composed B7 green or real-preflight amber branch', () => {
  const c4: ConciliarReleaseRegressionCase = {
    caseId: 'C4', mode: 'EXACT', selector: { bank: 'Synthetic Bank', date: '2026-10-01', signedCents: 12_345, searchTerms: ['synthetic'] },
    expect: { tab: 'COBROS', group: 'REMESAS', remittancePreflight: 'GREEN_EXACT_B7_OR_AMBER_MISSING_RECEIPTS' },
  }
  const data: ConciliarReleaseRegressionDataset = {
    bankRows: [bank()],
    projectionRows: [projection({ color: 'AMBAR', groupLabel: 'REMESAS', reasonText: 'Falta enlazar 2 recibos.', remittanceComposition: { lineCount: 2, sumCents: 12_345, exact: false }, remittanceMapPreflight: { complete: false, missingReceiptCount: 2, expectedReceiptCount: 2, proposalSetHash: 'a'.repeat(64) } })],
  }
  assert.equal(evaluateCase(c4, data).pass, true)
  assert.deepEqual(evaluateCase({ ...c4, expect: { ...c4.expect, allowedColors: ['VERDE', 'AMBAR'] } }, data).reasons, ['CASE_SPEC_INVALID'])
})

test('derivative comparison permits only production C1/P1/C4 and eight STAGE overrides', () => {
  const cases = ['C1', 'P1', 'C2', 'C3', 'C4', 'C7', 'C8', 'P7'].map(caseId => ({
    caseId, mode: caseId === 'C3' || caseId === 'C7' || caseId === 'C8' || caseId === 'P7' ? 'ABSENT_CONFIRMED' : 'EXACT',
    expect: caseId === 'C4' ? { tab: 'COBROS', color: 'VERDE', group: 'REMESAS', remittanceComposition: { lineCount: 1, sumCents: 1, exact: true } } : { old: true }, selector: { token: caseId },
  }))
  const golden = { schema: 'UNIT_ONLY', cases, supplementalCases: [{ caseId: 'P31', mode: 'EXACT', expect: { old: true }, selector: { token: 'P31' } }] }
  const production = deriveAuthorizedProductionGolden(golden)!
  const stage = deriveAuthorizedStageProfile(production)!
  assert.equal(stageProfileIsExactDerivative(production, stage), true)
  for (const mutate of [
    (value: any) => { value.cases[4].expect.group = 'CLIENTES' },
    (value: any) => { value.cases[0].selector.token = 'altered' },
    (value: any) => { value.cases.push({ caseId: 'C99', mode: 'NEW' }) },
    (value: any) => { value.schema = 'CHANGED' },
  ]) {
    const invalid = JSON.parse(JSON.stringify(stage))
    mutate(invalid)
    assert.equal(stageProfileIsExactDerivative(production, invalid), false)
  }
})

console.log('OK: perfil STAGE de ocho overrides exclusivos y C4 compuesto por preflight preservados.')
