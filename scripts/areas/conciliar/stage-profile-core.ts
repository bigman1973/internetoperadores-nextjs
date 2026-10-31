/** Pure structural check: no file, URL, environment or database access. */
export function canonicalProfileValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalProfileValue).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalProfileValue(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

type CaseEdit = Readonly<{
  caseId: string
  collection: string
  before: Readonly<{ mode: unknown; expect: unknown }>
  after: Readonly<{ mode: unknown; expect: unknown }>
}>

export function stageProfileIsExactDerivative(golden: unknown, derived: unknown, edits: readonly CaseEdit[]): boolean {
  if (!golden || typeof golden !== 'object' || Array.isArray(golden) || edits.length !== 6) return false
  const expected = JSON.parse(JSON.stringify(golden)) as Record<string, unknown>
  if (new Set(edits.map(edit => edit.caseId)).size !== 6) return false
  for (const edit of edits) {
    if (!['cases', 'supplementalCases'].includes(edit.collection)) return false
    const collection = expected[edit.collection]
    if (!Array.isArray(collection)) return false
    const matches = collection.filter(item => item && typeof item === 'object' && item.caseId === edit.caseId)
    if (matches.length !== 1) return false
    const item = matches[0] as Record<string, unknown>
    if (canonicalProfileValue({ mode: item.mode, expect: item.expect }) !== canonicalProfileValue(edit.before)) return false
    item.mode = edit.after.mode
    item.expect = JSON.parse(JSON.stringify(edit.after.expect))
  }
  return canonicalProfileValue(expected) === canonicalProfileValue(derived)
}
