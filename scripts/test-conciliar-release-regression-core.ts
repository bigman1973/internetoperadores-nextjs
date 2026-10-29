import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SAFE_STATIC_CODES,
  evaluateCase,
  type ConciliarReleaseRegressionCase,
  type ConciliarReleaseRegressionDataset,
} from '../lib/finanzas/conciliar-release-regression-core'

const source = (overrides: Record<string, unknown> = {}) => ({
  movementKey: 'synthetic-movement', bankName: 'Synthetic Bank', accountKey: 'own-a', bankDate: '2026-09-01', amountCents: 123_45,
  searchableText: 'synthetic search phrase', counterpartyText: 'synthetic counterparty', b4Confirmed: false,
  oppositeOwnAccountPairs: [], ...overrides,
})
const projection = (overrides: Record<string, unknown> = {}) => ({
  movementKey: 'synthetic-movement', visible: true, tab: 'COBROS', color: 'VERDE', groupLabel: 'CLIENTES', documentReference: 'SYN/1',
  suggestedDocumentReferences: [], partialDocumentReferences: [], documentFileNames: [], reasonText: 'synthetic reason', differenceCents: 0,
  isParaPedir: false, confirmingEvidence: null, remittanceComposition: null, ...overrides,
})
const dataset = (bank: Record<string, unknown> = {}, row: Record<string, unknown> = {}): ConciliarReleaseRegressionDataset => ({ bankRows: [source(bank)], projectionRows: [projection(row)] })
const exact = (expect: Record<string, unknown> = {}): ConciliarReleaseRegressionCase => ({
  caseId: 'C1', mode: 'EXACT', selector: { bank: 'Synthetic Bank', date: '2026-09-01', signedCents: 123_45, searchTerms: ['synthetic'] }, expect,
})

test('C/P core returns only static safe codes and validates a simple exact row', () => {
  const result = evaluateCase(exact({ tab: 'COBROS', color: 'VERDE', group: 'CLIENTES', documentReference: 'SYN/1' }), dataset())
  assert.deepEqual(result, { caseId: 'C1', pass: true, reasons: [] })
  assert(SAFE_STATIC_CODES.every(code => /^[A-Z][A-Z0-9_]+$/.test(code)))
})

test('exact lookup fails closed for zero and multiple sources', () => {
  const missing = evaluateCase(exact(), { bankRows: [], projectionRows: [] })
  assert.deepEqual(missing.reasons, ['SOURCE_MISSING'])
  const ambiguous = evaluateCase(exact(), { bankRows: [source(), source({ movementKey: 'synthetic-movement-2' })], projectionRows: [projection()] })
  assert.deepEqual(ambiguous.reasons, ['SOURCE_AMBIGUOUS'])
})

test('source matching requires all exact terms and does not broaden terms', () => {
  const result = evaluateCase(exact(), dataset({ searchableText: 'synthetic partial' }))
  assert.equal(result.pass, true)
  const noMatch = evaluateCase({ ...exact(), selector: { ...exact().selector, searchTerms: ['synthetic', 'absent'] } }, dataset())
  assert.deepEqual(noMatch.reasons, ['SOURCE_MISSING'])
})

test('alternative source criteria require a complete branch rather than a loose OR', () => {
  const alternative = { ...exact(), selector: { signedDirection: 'POSITIVE' as const, alternatives: [
    { searchTerms: ['synthetic'], counterpartyTerms: ['counterparty'] }, { searchTerms: ['transfer'] },
  ] } }
  assert.equal(evaluateCase(alternative, dataset()).pass, true)
  assert.deepEqual(evaluateCase(alternative, dataset({ counterpartyText: 'different' })).reasons, ['SOURCE_MISSING'])
})

test('C3 confirms persisted evidence and the deduction equation', () => {
  const caseC3 = exact({
    tab: 'COBROS', color: 'VERDE', group: 'CONFIRMING', documentFileName: 'synthetic-confirming.pdf',
    confirmingEquation: { nominalCents: 12_000, deductionsCents: [200, 30, 6], netCents: 11_764 },
  })
  const good = dataset({}, projection({ groupLabel: 'CONFIRMING', documentFileNames: ['synthetic-confirming.pdf'], confirmingEvidence: {
    persisted: true, nominalCents: 12_000, deductionsCents: [200, 30, 6], netCents: 11_764,
  } }))
  assert.equal(evaluateCase(caseC3, good).pass, true)
  const noFile = evaluateCase(caseC3, dataset({}, projection({ groupLabel: 'CONFIRMING', confirmingEvidence: good.projectionRows[0]!.confirmingEvidence })))
  assert(noFile.reasons.includes('DOCUMENT_FILENAME_MISSING'))
  const wrongEquation = evaluateCase(caseC3, dataset({}, projection({ groupLabel: 'CONFIRMING', documentFileNames: ['synthetic-confirming.pdf'], confirmingEvidence: {
    persisted: true, nominalCents: 12_000, deductionsCents: [200, 30, 6], netCents: 11_765,
  } })))
  assert(wrongEquation.reasons.includes('CONFIRMING_EQUATION_MISMATCH'))
})

test('C4 demands exact full remittance composition', () => {
  const caseC4 = exact({ tab: 'COBROS', color: 'VERDE', group: 'REMESAS', remittanceComposition: { lineCount: 3, sumCents: 123_45, exact: true } })
  assert.equal(evaluateCase(caseC4, dataset({}, projection({ groupLabel: 'REMESAS', remittanceComposition: { lineCount: 3, sumCents: 123_45, exact: true } }))).pass, true)
  const partial = evaluateCase(caseC4, dataset({}, projection({ groupLabel: 'REMESAS', remittanceComposition: { lineCount: 3, sumCents: 123_45, exact: false } })))
  assert(partial.reasons.includes('REMESA_COMPOSITION_MISMATCH'))
})

test('C5 requires every document and explicitly marks the partial document', () => {
  const caseC5 = exact({ color: 'AMBAR', documentReferences: ['SYN/1', 'SYN/2', 'SYN/3'], partialDocumentReference: 'SYN/3' })
  const good = dataset({}, projection({ color: 'AMBAR', documentReference: 'SYN/1', suggestedDocumentReferences: ['SYN/2', 'SYN/3'], partialDocumentReferences: ['SYN/3'] }))
  assert.equal(evaluateCase(caseC5, good).pass, true)
  const missingPartial = evaluateCase(caseC5, dataset({}, projection({ color: 'AMBAR', documentReference: 'SYN/1', suggestedDocumentReferences: ['SYN/2', 'SYN/3'] })))
  assert(missingPartial.reasons.includes('PARTIAL_DOCUMENT_MISSING'))
})

test('C6 validates the exact signed discrepancy', () => {
  const caseC6 = exact({ color: 'AMBAR', group: 'REMESAS', differenceCents: -1042 })
  assert.equal(evaluateCase(caseC6, dataset({}, projection({ color: 'AMBAR', groupLabel: 'REMESAS', differenceCents: -1042 }))).pass, true)
  assert(evaluateCase(caseC6, dataset({}, projection({ color: 'AMBAR', groupLabel: 'REMESAS', differenceCents: 1042 }))).reasons.includes('DIFFERENCE_MISMATCH'))
})

test('C7/C8 absence is accepted only with actual B4 confirmation and no row in any tab', () => {
  const absent: ConciliarReleaseRegressionCase = {
    caseId: 'C7', mode: 'ABSENT_CONFIRMED', selector: { bank: 'Synthetic Bank', date: '2026-09-01', signedCents: 123_45, searchTerms: ['synthetic'] }, expect: { absentAllTabs: true, b4Confirmed: true },
  }
  assert.equal(evaluateCase(absent, { bankRows: [source({ b4Confirmed: true })], projectionRows: [] }).pass, true)
  assert(evaluateCase(absent, { bankRows: [source({ b4Confirmed: false })], projectionRows: [] }).reasons.includes('B4_NOT_CONFIRMED'))
  assert(evaluateCase(absent, { bankRows: [source({ b4Confirmed: true })], projectionRows: [projection({ tab: 'PAGOS' })] }).reasons.includes('PROJECTION_PRESENT_WHEN_ABSENT'))
})

test('parametric C9/P8/P12/P15 coverage can never pass vacuously', () => {
  for (const caseId of ['C9', 'P8', 'P12', 'P15']) {
    const parametric: ConciliarReleaseRegressionCase = {
      caseId, mode: 'PARAMETRIC', selector: { signedDirection: 'NEGATIVE', searchAnyTerms: ['synthetic'] }, expect: { tab: 'PAGOS', color: 'ROJO' },
    }
    const empty = evaluateCase(parametric, { bankRows: [], projectionRows: [] })
    assert.deepEqual(empty.reasons, ['COVERAGE_EMPTY'])
  }
})

test('C9 and P9/P10 require opposite-sign other-own-account pairs within three days', () => {
  const transfer = exact({ group: 'TRASPASOS_PROPIOS', color: 'VERDE', noParaPedir: true, requiresOppositeOwnAccountPair: true, maxPairDays: 3 })
  const good = dataset({ oppositeOwnAccountPairs: [{ daysApart: 3, oppositeSign: true, distinctAccount: true }] }, projection({ groupLabel: 'TRASPASOS_PROPIOS' }))
  assert.equal(evaluateCase(transfer, good).pass, true)
  const noPair = evaluateCase(transfer, dataset({}, projection({ groupLabel: 'TRASPASOS_PROPIOS' })))
  assert(noPair.reasons.includes('TRANSFER_PAIR_MISSING'))
  const wrongSign = evaluateCase(transfer, dataset({ oppositeOwnAccountPairs: [{ daysApart: 1, oppositeSign: false, distinctAccount: true }] }, projection({ groupLabel: 'TRASPASOS_PROPIOS' })))
  assert(wrongSign.reasons.includes('TRANSFER_PAIR_MISSING'))
})

test('P11 remains amber and verifies the pair is absent', () => {
  const p11 = exact({ tab: 'PAGOS', color: 'AMBAR', neverColor: 'ROJO', group: 'TRASPASOS_PROPIOS', noParaPedir: true, requiresMissingPair: true })
  const good = dataset({}, projection({ tab: 'PAGOS', color: 'AMBAR', groupLabel: 'TRASPASOS_PROPIOS' }))
  assert.equal(evaluateCase(p11, good).pass, true)
  const pairExists = evaluateCase(p11, dataset({ oppositeOwnAccountPairs: [{ daysApart: 1, oppositeSign: true, distinctAccount: true }] }, projection({ tab: 'PAGOS', color: 'AMBAR', groupLabel: 'TRASPASOS_PROPIOS' })))
  assert(pairExists.reasons.includes('TRANSFER_PAIR_UNEXPECTED'))
  const red = evaluateCase(p11, dataset({}, projection({ tab: 'PAGOS', color: 'ROJO', groupLabel: 'TRASPASOS_PROPIOS' })))
  assert(red.reasons.includes('COLOR_MISMATCH'))
})

test('P12 permits only amber or green and never Para pedir', () => {
  const p12: ConciliarReleaseRegressionCase = { caseId: 'P12', mode: 'PARAMETRIC', selector: { signedDirection: 'NEGATIVE', searchTerms: ['synthetic'] }, expect: { tab: 'PAGOS', group: 'NOMINAS', allowedColors: ['VERDE', 'AMBAR'], noParaPedir: true } }
  assert.equal(evaluateCase(p12, dataset({ amountCents: -123_45 }, projection({ tab: 'PAGOS', color: 'AMBAR', groupLabel: 'NOMINAS' }))).pass, true)
  const red = evaluateCase(p12, dataset({ amountCents: -123_45 }, projection({ tab: 'PAGOS', color: 'ROJO', groupLabel: 'NOMINAS', isParaPedir: true })))
  assert(red.reasons.includes('COLOR_MISMATCH') && red.reasons.includes('PARA_PEDIR_FORBIDDEN'))
})

test('P4 excludes a forbidden proposal and P13-P15 check request wording', () => {
  const p4 = exact({ tab: 'PAGOS', color: 'ROJO', documentMustBeAbsent: true, forbiddenDocumentReferences: ['SYN/1'] })
  const proposed = evaluateCase(p4, dataset({}, projection({ tab: 'PAGOS', color: 'ROJO', documentReference: 'SYN/1' })))
  assert(proposed.reasons.includes('DOCUMENT_REFERENCE_FORBIDDEN') && proposed.reasons.includes('DOCUMENT_UNEXPECTED'))
  const request = exact({ tab: 'PAGOS', color: 'ROJO', reasonTerms: ['Pedir', 'ticket', 'factura'] })
  assert.equal(evaluateCase(request, dataset({}, projection({ tab: 'PAGOS', color: 'ROJO', reasonText: 'Pedir ticket o factura.' }))).pass, true)
  const noDocument = { ...request, selector: { ...request.selector, requiresNoDocument: true } }
  assert(evaluateCase(noDocument, dataset({}, projection({ tab: 'PAGOS', color: 'ROJO', reasonText: 'Pedir ticket o factura.', documentReference: 'SYN/1' }))).reasons.includes('DOCUMENT_UNEXPECTED'))
})

test('invalid case spec and malformed data fail closed', () => {
  const invalid = evaluateCase({ ...exact(), caseId: 'BAD' }, dataset())
  assert.deepEqual(invalid.reasons, ['CASE_SPEC_INVALID'])
  const malformed = evaluateCase(exact(), { bankRows: [source()], projectionRows: [{ movementKey: 'synthetic-movement' } as never] })
  assert.deepEqual(malformed.reasons, ['DATASET_INVALID'])
})

// Parametric expectations concern the pending queue; G2 still protects every matched historical source.
test('parametric coverage requires pending sources and verifies that matched confirmed sources stay hidden', () => {
  const input: ConciliarReleaseRegressionCase = { ...exact({ tab: 'COBROS', color: 'VERDE', group: 'CLIENTES' }), mode: 'PARAMETRIC' }
  const history = source({ movementKey: 'synthetic-confirmed', b4Confirmed: true })
  const pending = source()
  const clean: ConciliarReleaseRegressionDataset = { bankRows: [pending, history], projectionRows: [projection()] }
  assert.equal(evaluateCase(input, clean).pass, true)
  const leaked = { ...clean, projectionRows: [...clean.projectionRows, projection({ movementKey: history.movementKey })] }
  assert(evaluateCase(input, leaked).reasons.includes('PROJECTION_PRESENT_WHEN_ABSENT'))
  const vacuous: ConciliarReleaseRegressionDataset = { bankRows: [history], projectionRows: [] }
  assert(evaluateCase(input, vacuous).reasons.includes('COVERAGE_EMPTY'))
})

test('requiresNoDocument never includes a B4-confirmed source in a document-missing parametric case', () => {
  const input: ConciliarReleaseRegressionCase = { ...exact(), mode: 'PARAMETRIC', selector: { ...exact().selector, requiresNoDocument: true } }
  assert(evaluateCase(input, dataset({ b4Confirmed: true })).reasons.includes('COVERAGE_EMPTY'))
  assert.equal(evaluateCase(input, dataset({}, { documentReference: null })).pass, true)
  assert(evaluateCase(input, dataset()).reasons.includes('DOCUMENT_UNEXPECTED'))
})
