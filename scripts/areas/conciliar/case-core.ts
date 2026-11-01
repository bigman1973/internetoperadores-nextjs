/**
 * Evaluador puro de la batería C/P de Conciliar.
 *
 * El módulo no abre conexiones, no conoce credenciales y no contiene referencias,
 * importes, nombres ni identificadores de producción. El runner adapta una foto
 * de sólo lectura a estas estructuras y conserva los casos reales fuera del repo.
 */

export const SAFE_STATIC_CODES = [
  'CASE_SPEC_INVALID',
  'DATASET_INVALID',
  'SOURCE_MISSING',
  'SOURCE_AMBIGUOUS',
  'COVERAGE_EMPTY',
  'PROJECTION_MISSING',
  'PROJECTION_AMBIGUOUS',
  'PROJECTION_PRESENT_WHEN_ABSENT',
  'B4_NOT_CONFIRMED',
  'TAB_MISMATCH',
  'COLOR_MISMATCH',
  'GROUP_MISMATCH',
  'DOCUMENT_REFERENCE_MISSING',
  'DOCUMENT_REFERENCE_FORBIDDEN',
  'DOCUMENT_UNEXPECTED',
  'DOCUMENT_FILENAME_MISSING',
  'PARTIAL_DOCUMENT_MISSING',
  'REASON_MISMATCH',
  'DIFFERENCE_MISMATCH',
  'CONFIRMING_EVIDENCE_MISSING',
  'CONFIRMING_EQUATION_MISMATCH',
  'REMESA_COMPOSITION_MISSING',
  'REMESA_COMPOSITION_MISMATCH',
  'PARA_PEDIR_FORBIDDEN',
  'TRANSFER_PAIR_MISSING',
  'TRANSFER_PAIR_UNEXPECTED',
] as const

export type SafeStaticCode = typeof SAFE_STATIC_CODES[number]
/** Alias intentionally kept singular for the release runner public contract. */
export type SAFE_STATIC_CODES = SafeStaticCode

export type RegressionCaseMode = 'EXACT' | 'PARAMETRIC' | 'ABSENT_CONFIRMED'
export type SignedDirection = 'POSITIVE' | 'NEGATIVE'

export type RegressionSelector = Readonly<{
  bank?: string
  date?: string
  signedCents?: number
  signedDirection?: SignedDirection
  /** Every literal must be present in the source bank text. */
  searchTerms?: readonly string[]
  /** At least one literal must be present in the source bank text. */
  searchAnyTerms?: readonly string[]
  /** Every literal must be present in the source bank counterparty text. */
  counterpartyTerms?: readonly string[]
  /** At least one text/counterparty branch must match in addition to common criteria. */
  alternatives?: readonly Readonly<{
    searchTerms?: readonly string[]
    searchAnyTerms?: readonly string[]
    counterpartyTerms?: readonly string[]
  }> []
  requiresNoDocument?: boolean
  excludeCardPayments?: boolean
}>

export type ConfirmingEquationExpectation = Readonly<{
  nominalCents: number
  deductionsCents: readonly number[]
  netCents: number
}>
export type RemittanceCompositionExpectation = Readonly<{
  lineCount: number
  sumCents: number
  exact: boolean
}>

export type RegressionExpectation = Readonly<{
  tab?: string
  color?: string
  neverColor?: string
  allowedColors?: readonly string[]
  group?: string
  documentReference?: string
  documentReferences?: readonly string[]
  forbiddenDocumentReferences?: readonly string[]
  partialDocumentReference?: string
  documentFileName?: string
  documentMustBeAbsent?: boolean
  reasonTerms?: readonly string[]
  differenceCents?: number
  noParaPedir?: boolean
  absentAllTabs?: boolean
  b4Confirmed?: boolean
  requiresOppositeOwnAccountPair?: boolean
  requiresMissingPair?: boolean
  colorByOppositeOwnAccountPair?: boolean
  maxPairDays?: number
  confirmingEquation?: ConfirmingEquationExpectation
  remittanceComposition?: RemittanceCompositionExpectation
}>

export type ConciliarReleaseRegressionCase = Readonly<{
  caseId: string
  mode: RegressionCaseMode
  selector: RegressionSelector
  expect: RegressionExpectation
}>

export type RegressionBankRow = Readonly<{
  /** Anonymous stable token. Never emit it in test output. */
  movementKey: string
  bankName: string | null
  accountKey: string | null
  bankDate: string
  amountCents: number
  searchableText: string
  counterpartyText: string | null
  /** Derived from B4 applied, unreversed evidence; never inferred from legacy fields. */
  b4Confirmed: boolean
  /** Source bank type or an explicit card-purchase marker, not the word salary. */
  isCardPayment?: boolean
  /** Candidate already proved to be an opposite-sign leg in another own account. */
  oppositeOwnAccountPairs?: readonly Readonly<{ daysApart: number; oppositeSign: boolean; distinctAccount: boolean }>[]
}>

export type RegressionProjectionRow = Readonly<{
  movementKey: string
  /** A false row is still materialized evidence for ABSENT_CONFIRMED. */
  visible: boolean
  tab: string | null
  color: string | null
  groupLabel: string | null
  documentReference: string | null
  suggestedDocumentReferences?: readonly string[]
  partialDocumentReferences?: readonly string[]
  documentFileNames?: readonly string[]
  reasonText: string | null
  differenceCents: number | null
  /** True only when the current row belongs to the Para pedir queue. */
  isParaPedir: boolean
  confirmingEvidence?: Readonly<{
    persisted: boolean
    nominalCents: number | null
    deductionsCents: readonly number[]
    netCents: number | null
  }> | null
  remittanceComposition?: Readonly<{
    lineCount: number
    sumCents: number
    exact: boolean
  }> | null
}>

export type ConciliarReleaseRegressionDataset = Readonly<{
  bankRows: readonly RegressionBankRow[]
  projectionRows: readonly RegressionProjectionRow[]
}>

export type CaseEvaluation = Readonly<{
  caseId: string
  pass: boolean
  reasons: readonly SAFE_STATIC_CODES[]
}>

function codeSet(): Set<SAFE_STATIC_CODES> { return new Set<SAFE_STATIC_CODES>() }
function add(reasons: Set<SAFE_STATIC_CODES>, code: SAFE_STATIC_CODES): void { reasons.add(code) }
function result(caseId: string, reasons: Set<SAFE_STATIC_CODES>): CaseEvaluation {
  return { caseId, pass: reasons.size === 0, reasons: [...reasons].sort() }
}
function fold(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').replace(/\s+/g, ' ').trim()
}
function same(value: string | null | undefined, expected: string): boolean { return fold(value) === fold(expected) }
function contains(value: string | null | undefined, expected: string): boolean { return fold(value).includes(fold(expected)) }
/**
 * The persisted projection has deliberately specific labels (for example,
 * REMESA_VENCIMIENTO and CONFIRMING_DRAXTON). Release expectations use the
 * public canonical group vocabulary, so this is a closed equivalence map rather
 * than a substring match or a new classifier.
 */
function canonicalGroup(value: string | null | undefined): string | null {
  const normalized = fold(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) return null
  if (/^(?:traspasos?|transferencias?_propias?)$/.test(normalized)) return 'traspasos_propios'
  if (/^(?:gastos?_del?_banco|gastos?_banco|banco|comisiones?_bancarias?)$/.test(normalized)) return 'gastos_banco'
  if (/^nominas?$/.test(normalized)) return 'nominas'
  if (/^confirming(?:_draxton)?$/.test(normalized)) return 'confirming'
  if (/^remesa(?:s|_(?:vencimiento|union|residuo))?$/.test(normalized)) return 'remesas'
  if (/^(?:facturas?_emitidas?|clientes?)$/.test(normalized)) return 'clientes'
  if (/^(?:facturas?_recibidas?|proveedores?)$/.test(normalized)) return 'proveedores'
  if (/^tarjetas?$/.test(normalized)) return 'tarjeta'
  if (/^impuestos?$/.test(normalized)) return 'impuestos'
  if (/^(?:prestamos?|leasing)$/.test(normalized)) return 'prestamos'
  if (/^devoluciones?$/.test(normalized)) return 'devoluciones'
  return normalized
}
function sameGroup(value: string | null | undefined, expected: string): boolean {
  return canonicalGroup(value) === canonicalGroup(expected)
}
function validTextArray(value: readonly string[] | undefined): boolean {
  return value === undefined || value.every(item => typeof item === 'string' && item.trim().length > 0)
}
function validCase(input: ConciliarReleaseRegressionCase): boolean {
  if (!input || typeof input.caseId !== 'string' || !/^[CP]\d+$/.test(input.caseId)) return false
  if (!['EXACT', 'PARAMETRIC', 'ABSENT_CONFIRMED'].includes(input.mode)) return false
  if (!input.selector || !input.expect) return false
  const selector = input.selector
  if (selector.signedCents !== undefined && !Number.isSafeInteger(selector.signedCents)) return false
  if (selector.signedDirection !== undefined && selector.signedDirection !== 'POSITIVE' && selector.signedDirection !== 'NEGATIVE') return false
  if (selector.excludeCardPayments !== undefined && typeof selector.excludeCardPayments !== 'boolean') return false
  if (!validTextArray(selector.searchTerms) || !validTextArray(selector.searchAnyTerms) || !validTextArray(selector.counterpartyTerms)
    || (selector.alternatives !== undefined && (!selector.alternatives.length || selector.alternatives.some(branch => !validTextArray(branch.searchTerms) || !validTextArray(branch.searchAnyTerms) || !validTextArray(branch.counterpartyTerms))))) return false
  const expectation = input.expect
  if (expectation.colorByOppositeOwnAccountPair !== undefined && typeof expectation.colorByOppositeOwnAccountPair !== 'boolean') return false
  if (!validTextArray(expectation.documentReferences) || !validTextArray(expectation.forbiddenDocumentReferences) || !validTextArray(expectation.reasonTerms) || !validTextArray(expectation.allowedColors)) return false
  if (expectation.differenceCents !== undefined && !Number.isSafeInteger(expectation.differenceCents)) return false
  if (expectation.maxPairDays !== undefined && (!Number.isSafeInteger(expectation.maxPairDays) || expectation.maxPairDays < 0)) return false
  const equation = expectation.confirmingEquation
  if (equation && (!Number.isSafeInteger(equation.nominalCents) || !Number.isSafeInteger(equation.netCents) || !equation.deductionsCents.every(Number.isSafeInteger))) return false
  const remittance = expectation.remittanceComposition
  if (remittance && (!Number.isSafeInteger(remittance.lineCount) || remittance.lineCount < 1 || !Number.isSafeInteger(remittance.sumCents))) return false
  return true
}
function textCriteriaMatch(criteria: Pick<RegressionSelector, 'searchTerms' | 'searchAnyTerms' | 'counterpartyTerms'>, row: RegressionBankRow): boolean {
  if ((criteria.searchTerms ?? []).some(term => !contains(row.searchableText, term))) return false
  if (criteria.searchAnyTerms && criteria.searchAnyTerms.length > 0 && !criteria.searchAnyTerms.some(term => contains(row.searchableText, term))) return false
  return !(criteria.counterpartyTerms ?? []).some(term => !contains(row.counterpartyText, term))
}
export function sourceMatches(selector: RegressionSelector, row: RegressionBankRow): boolean {
  if (selector.bank !== undefined && !same(row.bankName, selector.bank)) return false
  if (selector.date !== undefined && row.bankDate !== selector.date) return false
  if (selector.signedCents !== undefined && row.amountCents !== selector.signedCents) return false
  if (selector.signedDirection === 'POSITIVE' && row.amountCents <= 0) return false
  if (selector.signedDirection === 'NEGATIVE' && row.amountCents >= 0) return false
  if (selector.requiresNoDocument === true && row.b4Confirmed) return false
  if (selector.excludeCardPayments === true && row.isCardPayment !== false) return false
  if (!textCriteriaMatch(selector, row)) return false
  return selector.alternatives === undefined || selector.alternatives.some(branch => textCriteriaMatch(branch, row))
}
function refs(row: RegressionProjectionRow): readonly string[] {
  return [row.documentReference, ...(row.suggestedDocumentReferences ?? [])].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}
function hasReference(values: readonly string[], expected: string): boolean { return values.some(value => same(value, expected)) }
function validProjection(row: RegressionProjectionRow): boolean {
  return typeof row.movementKey === 'string' && typeof row.visible === 'boolean' && typeof row.isParaPedir === 'boolean'
}
function assertTransfer(expectation: RegressionExpectation, source: RegressionBankRow, reasons: Set<SAFE_STATIC_CODES>): void {
  const pairs = source.oppositeOwnAccountPairs ?? []
  const maxDays = expectation.maxPairDays ?? 3
  const validPairs = pairs.filter(pair => pair.oppositeSign && pair.distinctAccount && Number.isSafeInteger(pair.daysApart) && pair.daysApart >= 0 && pair.daysApart <= maxDays)
  if (expectation.requiresOppositeOwnAccountPair === true && validPairs.length === 0) add(reasons, 'TRANSFER_PAIR_MISSING')
  if (expectation.requiresMissingPair === true && validPairs.length > 0) add(reasons, 'TRANSFER_PAIR_UNEXPECTED')
}
function assertProjection(selector: RegressionSelector, expectation: RegressionExpectation, source: RegressionBankRow, row: RegressionProjectionRow, reasons: Set<SAFE_STATIC_CODES>): void {
  if (expectation.tab !== undefined && !same(row.tab, expectation.tab)) add(reasons, 'TAB_MISMATCH')
  if (expectation.color !== undefined && !same(row.color, expectation.color)) add(reasons, 'COLOR_MISMATCH')
  if (expectation.neverColor !== undefined && same(row.color, expectation.neverColor)) add(reasons, 'COLOR_MISMATCH')
  if (expectation.allowedColors !== undefined && !expectation.allowedColors.some(color => same(row.color, color))) add(reasons, 'COLOR_MISMATCH')
  if (expectation.group !== undefined && !sameGroup(row.groupLabel, expectation.group)) add(reasons, 'GROUP_MISMATCH')
  if (expectation.colorByOppositeOwnAccountPair === true) {
    const maxDays = expectation.maxPairDays ?? 3
    const paired = (source.oppositeOwnAccountPairs ?? []).some(pair => pair.oppositeSign && pair.distinctAccount && Number.isSafeInteger(pair.daysApart) && pair.daysApart >= 0 && pair.daysApart <= maxDays)
    if (!same(row.color, paired ? 'VERDE' : 'AMBAR')) add(reasons, 'COLOR_MISMATCH')
  }

  const references = refs(row)
  if (expectation.documentReference !== undefined && !hasReference(references, expectation.documentReference)) add(reasons, 'DOCUMENT_REFERENCE_MISSING')
  if ((expectation.documentReferences ?? []).some(reference => !hasReference(references, reference))) add(reasons, 'DOCUMENT_REFERENCE_MISSING')
  if ((expectation.forbiddenDocumentReferences ?? []).some(reference => hasReference(references, reference))) add(reasons, 'DOCUMENT_REFERENCE_FORBIDDEN')
  if (expectation.partialDocumentReference !== undefined && !(row.partialDocumentReferences ?? []).some(reference => same(reference, expectation.partialDocumentReference!))) add(reasons, 'PARTIAL_DOCUMENT_MISSING')
  if (expectation.documentFileName !== undefined && !(row.documentFileNames ?? []).some(name => same(name, expectation.documentFileName!))) add(reasons, 'DOCUMENT_FILENAME_MISSING')
  if (expectation.documentMustBeAbsent === true && references.length > 0) add(reasons, 'DOCUMENT_UNEXPECTED')
  if (selector.requiresNoDocument === true && references.length > 0) add(reasons, 'DOCUMENT_UNEXPECTED')
  if ((expectation.reasonTerms ?? []).some(term => !contains(row.reasonText, term))) add(reasons, 'REASON_MISMATCH')
  if (expectation.differenceCents !== undefined && row.differenceCents !== expectation.differenceCents) add(reasons, 'DIFFERENCE_MISMATCH')
  if (expectation.noParaPedir === true && row.isParaPedir) add(reasons, 'PARA_PEDIR_FORBIDDEN')

  if (expectation.confirmingEquation) {
    const evidence = row.confirmingEvidence
    const equation = expectation.confirmingEquation
    const deductions = evidence?.deductionsCents ?? []
    const expectedDeductions = equation.deductionsCents
    const deductionTotal = expectedDeductions.reduce((total, value) => total + value, 0)
    const equationMatches = evidence?.persisted === true
      && evidence.nominalCents === equation.nominalCents
      && evidence.netCents === equation.netCents
      && deductions.length === expectedDeductions.length
      && deductions.every((value, index) => value === expectedDeductions[index])
      && equation.nominalCents - deductionTotal === equation.netCents
    if (!evidence?.persisted) add(reasons, 'CONFIRMING_EVIDENCE_MISSING')
    if (!equationMatches) add(reasons, 'CONFIRMING_EQUATION_MISMATCH')
  }
  if (expectation.remittanceComposition) {
    const composition = row.remittanceComposition
    const wanted = expectation.remittanceComposition
    if (!composition) add(reasons, 'REMESA_COMPOSITION_MISSING')
    else if (composition.lineCount !== wanted.lineCount || composition.sumCents !== wanted.sumCents || composition.exact !== wanted.exact) add(reasons, 'REMESA_COMPOSITION_MISMATCH')
  }
  assertTransfer(expectation, source, reasons)
}

/**
 * Evaluates one real or synthetic C/P case against a snapshot already loaded by
 * a caller. It is deliberately fail-closed: missing/ambiguous source evidence
 * and empty parametric coverage cannot become a pass.
 */
export function evaluateCase(input: ConciliarReleaseRegressionCase, dataset: ConciliarReleaseRegressionDataset): CaseEvaluation {
  const reasons = codeSet()
  if (!validCase(input)) return { caseId: typeof input?.caseId === 'string' ? input.caseId : 'INVALID', pass: false, reasons: ['CASE_SPEC_INVALID'] }
  if (!dataset || !Array.isArray(dataset.bankRows) || !Array.isArray(dataset.projectionRows) || dataset.projectionRows.some(row => !validProjection(row))) {
    add(reasons, 'DATASET_INVALID')
    return result(input.caseId, reasons)
  }
  const matchedSources = dataset.bankRows.filter(row => sourceMatches(input.selector, row))
  const sources = input.mode === 'PARAMETRIC' ? matchedSources.filter(row => !row.b4Confirmed) : matchedSources
  if (input.mode === 'PARAMETRIC' && matchedSources.some(source => source.b4Confirmed && dataset.projectionRows.some(row => row.movementKey === source.movementKey))) add(reasons, 'PROJECTION_PRESENT_WHEN_ABSENT')
  if (input.mode === 'PARAMETRIC') {
    if (sources.length === 0) add(reasons, 'COVERAGE_EMPTY')
  } else if (sources.length === 0) add(reasons, 'SOURCE_MISSING')
  else if (sources.length !== 1) add(reasons, 'SOURCE_AMBIGUOUS')
  if (reasons.size > 0) return result(input.caseId, reasons)

  if (input.mode === 'ABSENT_CONFIRMED') {
    const source = sources[0]!
    if (input.expect.b4Confirmed === true && source.b4Confirmed !== true) add(reasons, 'B4_NOT_CONFIRMED')
    if (input.expect.absentAllTabs === true && dataset.projectionRows.some(row => row.movementKey === source.movementKey)) add(reasons, 'PROJECTION_PRESENT_WHEN_ABSENT')
    return result(input.caseId, reasons)
  }

  for (const source of sources) {
    const rows = dataset.projectionRows.filter(row => row.movementKey === source.movementKey && row.visible
      && (input.expect.tab === undefined || same(row.tab, input.expect.tab)))
    if (rows.length === 0) { add(reasons, 'PROJECTION_MISSING'); continue }
    if (rows.length !== 1) { add(reasons, 'PROJECTION_AMBIGUOUS'); continue }
    assertProjection(input.selector, input.expect, source, rows[0]!, reasons)
  }
  return result(input.caseId, reasons)
}
