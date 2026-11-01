/**
 * Pure profile derivation contracts for Conciliar release inputs.
 *
 * This module deliberately knows only case IDs and state shapes. It does not
 * open files, databases, browsers or URLs, and it does not contain selectors,
 * references, names or amounts from the private Golden.
 */
export const ORIGINAL_PRODUCTION_GOLDEN_SHA256 = '14045a576f46af17c58c800f2573022e7f7b6ff79cfd8941e93c38d6ae3b1905'
export const PRODUCTION_GOLDEN_AMENDMENT_IDS = ['C1', 'P1', 'C4'] as const
export const STAGE_OVERRIDE_IDS = ['C1', 'P1', 'C2', 'C3', 'C7', 'C8', 'P7', 'P31'] as const
export const C4_REMITTANCE_MODE = 'GREEN_EXACT_B7_OR_AMBER_MISSING_RECEIPTS' as const

type RecordValue = Record<string, unknown>
type Profile = RecordValue & { cases?: unknown; supplementalCases?: unknown }

export function canonicalProfileValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalProfileValue).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as RecordValue
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalProfileValue(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function profile(value: unknown): Profile | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Profile : null
}
function collection(value: Profile, name: 'cases' | 'supplementalCases'): RecordValue[] | null {
  const found = value[name]
  return Array.isArray(found) && found.every(item => item && typeof item === 'object' && !Array.isArray(item)) ? found as RecordValue[] : null
}
function one(items: RecordValue[], caseId: string): RecordValue | null {
  const found = items.filter(item => item.caseId === caseId)
  return found.length === 1 ? found[0]! : null
}
function originalExactCase(items: RecordValue[], caseId: 'C1' | 'P1'): RecordValue | null {
  const item = one(items, caseId)
  if (!item || item.mode !== 'EXACT' || !item.expect || typeof item.expect !== 'object' || Array.isArray(item.expect)) return null
  return item
}
function absentExpectation(): RecordValue { return { b4Confirmed: true, absentAllTabs: true } }
function pendingExpectation(): RecordValue { return { b4Confirmed: false, visible: true } }
function same(left: unknown, right: unknown): boolean { return canonicalProfileValue(left) === canonicalProfileValue(right) }

/**
 * Returns a structurally-preserving new production Golden expectation graph.
 * C1/P1 become B4 confirmed absence. C4 drops the frozen 167/green assertion
 * in favour of the explicit B7 preflight branch evaluated by the case core.
 */
export function deriveAuthorizedProductionGolden(original: unknown): Profile | null {
  const source = profile(original)
  if (!source) return null
  const result = clone(source)
  const cases = collection(result, 'cases')
  if (!cases) return null
  for (const caseId of ['C1', 'P1'] as const) {
    const item = one(cases, caseId)
    if (!item || item.mode !== 'EXACT') return null
    item.mode = 'ABSENT_CONFIRMED'
    item.expect = absentExpectation()
  }
  const c4 = one(cases, 'C4')
  const before = c4?.expect
  if (!c4 || c4.mode !== 'EXACT' || !before || typeof before !== 'object' || Array.isArray(before)) return null
  const exact = before as RecordValue
  if (typeof exact.tab !== 'string' || typeof exact.group !== 'string') return null
  c4.expect = { tab: exact.tab, group: exact.group, remittancePreflight: C4_REMITTANCE_MODE }
  return result
}

/** Production source is valid only when every selector and non-authorized case
 * remains structurally equivalent after canonical JSON ordering. */
export function productionGoldenIsAuthorizedDerivative(original: unknown, derived: unknown): boolean {
  const expected = deriveAuthorizedProductionGolden(original)
  return expected !== null && same(expected, derived)
}

/**
 * Derives STAGE only from the immutable original and its authorized production
 * successor. C1/P1 restore their complete original EXACT expectations; they
 * are not relaxed to a colour-free pending condition. The former six deltas
 * remain exactly scoped, preserving selectors, collection order and globals.
 */
export function deriveAuthorizedStageProfile(originalGolden: unknown, productionGolden: unknown): Profile | null {
  const original = profile(originalGolden)
  const production = profile(productionGolden)
  if (!original || !production || !productionGoldenIsAuthorizedDerivative(original, production)) return null

  const result = clone(production)
  const originalCases = collection(original, 'cases')
  const cases = collection(result, 'cases')
  const supplemental = collection(result, 'supplementalCases')
  if (!originalCases || !cases || !supplemental) return null

  for (const caseId of ['C1', 'P1'] as const) {
    const originalItem = originalExactCase(originalCases, caseId)
    const stageItem = one(cases, caseId)
    if (!originalItem || !stageItem) return null
    stageItem.mode = originalItem.mode
    stageItem.expect = clone(originalItem.expect)
  }
  for (const caseId of ['C3', 'C7', 'C8', 'P7'] as const) {
    const item = one(cases, caseId)
    if (!item) return null
    item.mode = 'PENDING_VISIBLE'
    item.expect = pendingExpectation()
  }
  const c2 = one(cases, 'C2')
  if (!c2) return null
  c2.mode = 'ABSENT_CONFIRMED'
  c2.expect = absentExpectation()
  const p31 = one(supplemental, 'P31')
  if (!p31) return null
  p31.mode = 'ABSENT_CONFIRMED'
  p31.expect = absentExpectation()
  return result
}

/** Exact STAGE derivative: only the eight listed state changes are tolerated. */
export function stageProfileIsExactDerivative(originalGolden: unknown, productionGolden: unknown, stage: unknown): boolean {
  const expected = deriveAuthorizedStageProfile(originalGolden, productionGolden)
  return expected !== null && same(expected, stage)
}

/** Previous manifest/profile compatibility guard used by the external migrator
 * before it creates the eight-change STAGE successor. */
export function isPreviousStageSixOverrideDerivative(original: unknown, priorStage: unknown): boolean {
  const source = profile(original)
  if (!source) return false
  const expected = clone(source)
  const cases = collection(expected, 'cases')
  const supplemental = collection(expected, 'supplementalCases')
  if (!cases || !supplemental) return false
  for (const caseId of ['C3', 'C7', 'C8', 'P7'] as const) {
    const item = one(cases, caseId)
    if (!item) return false
    item.mode = 'PENDING_VISIBLE'
    item.expect = pendingExpectation()
  }
  const c2 = one(cases, 'C2')
  if (!c2) return false
  c2.mode = 'ABSENT_CONFIRMED'
  c2.expect = absentExpectation()
  const p31 = one(supplemental, 'P31')
  if (!p31) return false
  p31.mode = 'ABSENT_CONFIRMED'
  p31.expect = absentExpectation()
  return same(expected, priorStage)
}
