/*
 * Pure API-vs-persisted-projection gate for Conciliar staging.
 *
 * The module never opens files or connections and never exposes a row value in
 * diagnostics. Callers provide a private captured API snapshot plus an already
 * complete read-only DB projection. Any malformed, empty, partial or changing
 * photo fails closed before the release evaluators are allowed to run.
 */

export const API_GATE_STATIC_CODES = [
  'API_SNAPSHOT_INVALID',
  'API_SNAPSHOT_IDENTITY_UNVERIFIED',
  'API_SNAPSHOT_SESSION_NOT_ENDED',
  'API_RENDERED_P9_NOT_VERIFIED',
  'API_RENDERED_P10_NOT_VERIFIED',
  'API_SCOPE_INVALID',
  'API_SCOPE_MISSING',
  'API_SCOPE_DUPLICATED',
  'API_PAGINATION_INVALID',
  'API_COVERAGE_EMPTY',
  'API_RESPONSE_INVALID',
  'API_ROW_INVALID',
  'API_SNAPSHOT_CHANGED_DURING_PAGINATION',
  'API_TABS_MISMATCH',
  'API_CUTOFF_INVALID',
  'API_DB_COVERAGE_INCOMPLETE',
  'API_DB_PROJECTION_MISMATCH',
] as const
export type ApiGateStaticCode = typeof API_GATE_STATIC_CODES[number]

export const API_GATE_TABS = ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'] as const
export const API_GATE_COLORS = ['VERDE', 'AMBAR', 'ROJO'] as const
export const API_GATE_ORIGIN = 'https://staging.internetoperadores.com'
export const API_GATE_SCHEMA = 'CONCILIAR_STAGING_API_SNAPSHOT_V1'
export const API_GATE_PAGE_LIMIT = 100
export const API_GATE_DEFAULT_CUTOFF = '2026-01-01'

type ApiGateTab = typeof API_GATE_TABS[number]
type ApiGateColor = typeof API_GATE_COLORS[number]

export type ApiProjectionComparableRow = Readonly<{
  id: string
  movimientoId: string | null
  tab: ApiGateTab
  fecha: string
  color: ApiGateColor
  grupo: string | null
  documento: Readonly<{ referencia: string; importeCentimos: number }> | null
  seleccionable: boolean
  diferenciaCentimos: number
  motivo: string
  propuesta: string | null
  /** Required to independently verify the API `tabs` summary. */
  pendienteCentimos: number
}>

export type ApiProjectionCoverage = Readonly<{
  /** True only when the adapter paged every persisted projection row. */
  allRowsRead: boolean
  /** `estado_proyeccion_conciliar.rebuilt_at` from the same repeatable-read DB photo. */
  updatedAt: string
  rows: readonly ApiProjectionComparableRow[]
}>

export type ApiGateResult = Readonly<{
  ok: boolean
  codes: readonly ApiGateStaticCode[]
  /** Counts only; never identifiers, references, texts, dates or amounts. */
  coverage: Readonly<{ dbRows: number; apiRows: number; scopes: number; pages: number }>
}>

type JsonRecord = Record<string, unknown>
type TabSummary = Readonly<{
  tab: ApiGateTab
  count: number
  amountCentimos: number
  colors: Readonly<Record<ApiGateColor, Readonly<{ count: number; amountCentimos: number }>>>
}>
type Page = Readonly<{ tab: ApiGateTab; historic: boolean; total: number; limit: number; offset: number; updatedAt: string; cutoffDate: string; rows: readonly ApiProjectionComparableRow[]; tabs: readonly TabSummary[] }>
type Scope = Readonly<{ tab: ApiGateTab; historic: boolean }>

const expectedScopes: readonly Scope[] = [
  { tab: 'COBROS', historic: false },
  { tab: 'EMITIDAS', historic: false },
  { tab: 'PAGOS', historic: false },
  { tab: 'RECIBIDAS', historic: false },
  { tab: 'EMITIDAS', historic: true },
] as const

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}
function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
function safeDateTime(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && Number.isFinite(new Date(value).getTime())
}
function day(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function hasTab(value: unknown): value is ApiGateTab { return (API_GATE_TABS as readonly string[]).includes(String(value)) }
function hasColor(value: unknown): value is ApiGateColor { return (API_GATE_COLORS as readonly string[]).includes(String(value)) }
function key(scope: Scope): string { return `${scope.tab}:${scope.historic ? 'H' : 'A'}` }
function same(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right) }

function comparableRow(value: unknown, pageTab?: ApiGateTab): ApiProjectionComparableRow | null {
  const row = record(value)
  const tab = row?.tab === undefined ? pageTab : hasTab(row?.tab) ? row.tab : null
  if (!row || !tab || (pageTab !== undefined && tab !== pageTab) || typeof row.id !== 'string' || !row.id || (row.movimientoId !== null && typeof row.movimientoId !== 'string')
    || !day(row.fecha) || !hasColor(row.color)
    || (row.grupo !== null && typeof row.grupo !== 'string') || typeof row.seleccionable !== 'boolean'
    || integer(row.diferenciaCentimos) === null || typeof row.motivo !== 'string'
    || (row.propuesta !== null && typeof row.propuesta !== 'string') || integer(row.pendienteCentimos) === null) return null
  let documento: ApiProjectionComparableRow['documento'] = null
  if (row.documento !== null) {
    const document = record(row.documento)
    const amount = document ? integer(document.importeCentimos) : null
    if (!document || typeof document.referencia !== 'string' || !document.referencia || amount === null) return null
    documento = { referencia: document.referencia, importeCentimos: amount }
  }
  return {
    id: row.id, movimientoId: row.movimientoId as string | null, tab, fecha: row.fecha,
    color: row.color, grupo: row.grupo as string | null, documento, seleccionable: row.seleccionable,
    diferenciaCentimos: row.diferenciaCentimos as number, motivo: row.motivo, propuesta: row.propuesta as string | null,
    pendienteCentimos: row.pendienteCentimos as number,
  }
}

function tabSummary(value: unknown): TabSummary | null {
  const item = record(value)
  if (!item || !hasTab(item.tab) || integer(item.count) === null || (item.count as number) < 0 || integer(item.amountCentimos) === null) return null
  const colors = record(item.colors)
  if (!colors) return null
  const parsed = {} as Record<ApiGateColor, { count: number; amountCentimos: number }>
  for (const color of API_GATE_COLORS) {
    const current = record(colors[color])
    const count = current ? integer(current.count) : null
    const amount = current ? integer(current.amountCentimos) : null
    if (count === null || count < 0 || amount === null) return null
    parsed[color] = { count, amountCentimos: amount }
  }
  return { tab: item.tab, count: item.count as number, amountCentimos: item.amountCentimos as number, colors: parsed }
}

function page(value: unknown): Page | null {
  const raw = record(value), response = raw ? record(raw.response) : null
  if (!raw || !response || !hasTab(raw.tab) || typeof raw.historic !== 'boolean'
    || !Array.isArray(response.rows) || !Array.isArray(response.tabs)
    || integer(response.total) === null || integer(response.limit) === null || integer(response.offset) === null
    || !safeDateTime(response.updatedAt) || !day(response.cutoffDate)) return null
  // The production API carries the tab at page level.  A row-level tab is
  // accepted only when it agrees with that page, preventing a caller from
  // moving an otherwise identical row between tabs in the capture.
  const pageTab = raw.tab
  const rows = response.rows.map(item => comparableRow(item, pageTab))
  const tabs = response.tabs.map(tabSummary)
  if (rows.some(row => row === null) || tabs.some(item => item === null)) return null
  return {
    tab: raw.tab, historic: raw.historic, total: response.total as number, limit: response.limit as number,
    offset: response.offset as number, updatedAt: response.updatedAt, cutoffDate: response.cutoffDate,
    rows: rows as ApiProjectionComparableRow[], tabs: tabs as TabSummary[],
  }
}

function validTabs(tabs: readonly TabSummary[]): boolean {
  return tabs.length === API_GATE_TABS.length
    && new Set(tabs.map(item => item.tab)).size === API_GATE_TABS.length
    && API_GATE_TABS.every(tab => tabs.some(item => item.tab === tab))
}

function expectedTabs(rows: readonly ApiProjectionComparableRow[], cutoffDate: string): readonly TabSummary[] | null {
  const result = new Map<ApiGateTab, { count: number; amountCentimos: number; colors: Record<ApiGateColor, { count: number; amountCentimos: number }> }>()
  for (const tab of API_GATE_TABS) result.set(tab, { count: 0, amountCentimos: 0, colors: {
    VERDE: { count: 0, amountCentimos: 0 }, AMBAR: { count: 0, amountCentimos: 0 }, ROJO: { count: 0, amountCentimos: 0 },
  } })
  for (const row of rows) {
    if (row.tab === 'EMITIDAS' && row.fecha < cutoffDate) continue
    const target = result.get(row.tab)!
    const color = target.colors[row.color]
    const next = target.amountCentimos + row.pendienteCentimos
    const nextColor = color.amountCentimos + row.pendienteCentimos
    if (!Number.isSafeInteger(next) || !Number.isSafeInteger(nextColor)) return null
    target.count += 1
    target.amountCentimos = next
    color.count += 1
    color.amountCentimos = nextColor
  }
  return API_GATE_TABS.map(tab => ({ tab, ...result.get(tab)! }))
}

function inScope(row: ApiProjectionComparableRow, scope: Scope, cutoffDate: string): boolean {
  if (row.tab !== scope.tab) return false
  if (scope.tab !== 'EMITIDAS') return scope.historic === false
  return scope.historic ? row.fecha < cutoffDate : row.fecha >= cutoffDate
}

function coverageValid(coverage: ApiProjectionCoverage): boolean {
  if (!coverage || coverage.allRowsRead !== true || !safeDateTime(coverage.updatedAt) || !Array.isArray(coverage.rows)) return false
  const ids = new Set<string>()
  for (const row of coverage.rows) {
    const parsed = comparableRow(row)
    if (!parsed || ids.has(parsed.id)) return false
    ids.add(parsed.id)
  }
  return true
}

/**
 * Validates a browser-captured API photo against a complete persisted DB photo.
 * Only aggregate counts and static codes are returned; no source row is logged.
 */
export function evaluateConciliarStagingApiSnapshot(snapshot: unknown, coverage: ApiProjectionCoverage): ApiGateResult {
  const codes = new Set<ApiGateStaticCode>()
  let apiRows = 0
  let scopeCount = 0
  let pageCount = 0
  if (!coverageValid(coverage)) codes.add('API_DB_COVERAGE_INCOMPLETE')
  const root = record(snapshot)
  if (!root || root.schema !== API_GATE_SCHEMA || root.origin !== API_GATE_ORIGIN || !safeDateTime(root.capturedAt) || !Array.isArray(root.pages)) {
    codes.add('API_SNAPSHOT_INVALID')
    return { ok: false, codes: [...codes].sort(), coverage: { dbRows: Array.isArray(coverage?.rows) ? coverage.rows.length : 0, apiRows, scopes: scopeCount, pages: pageCount } }
  }
  if (root.effectiveUserVerified !== true) codes.add('API_SNAPSHOT_IDENTITY_UNVERIFIED')
  if (root.ownSessionEnded !== true) codes.add('API_SNAPSHOT_SESSION_NOT_ENDED')
  const rendered = record(root.renderedChecks)
  if (rendered?.P9 !== true) codes.add('API_RENDERED_P9_NOT_VERIFIED')
  if (rendered?.P10 !== true) codes.add('API_RENDERED_P10_NOT_VERIFIED')

  const parsedPages = root.pages.map(page)
  if (parsedPages.some(item => item === null)) codes.add('API_RESPONSE_INVALID')
  const pages = parsedPages.filter((item): item is Page => item !== null)
  pageCount = pages.length
  if (!pages.length) codes.add('API_COVERAGE_EMPTY')
  const byScope = new Map<string, Page[]>()
  for (const item of pages) {
    const scope: Scope = { tab: item.tab, historic: item.historic }
    const expected = expectedScopes.some(value => key(value) === key(scope))
    if (!expected) { codes.add('API_SCOPE_INVALID'); continue }
    byScope.set(key(scope), [...(byScope.get(key(scope)) ?? []), item])
  }
  for (const scope of expectedScopes) {
    const found = byScope.get(key(scope)) ?? []
    if (!found.length) codes.add('API_SCOPE_MISSING')
    if (found.length > 1) {
      // Multiple pages are valid. A duplicate only means duplicate offset, which
      // is determined below once their pagination contract is known.
      const offsets = found.map(item => item.offset)
      if (new Set(offsets).size !== offsets.length) codes.add('API_SCOPE_DUPLICATED')
    }
  }

  const allTimes = new Set(pages.map(item => item.updatedAt))
  if (allTimes.size !== 1 || (allTimes.size === 1 && [...allTimes][0] !== coverage.updatedAt)) codes.add('API_SNAPSHOT_CHANGED_DURING_PAGINATION')
  const allCutoffs = new Set(pages.map(item => item.cutoffDate))
  if (allCutoffs.size !== 1 || [...allCutoffs][0] !== API_GATE_DEFAULT_CUTOFF) codes.add('API_CUTOFF_INVALID')
  const cutoffDate = allCutoffs.size === 1 ? [...allCutoffs][0]! : API_GATE_DEFAULT_CUTOFF
  const expectedSummary = coverageValid(coverage) ? expectedTabs(coverage.rows, cutoffDate) : null
  if (!expectedSummary) codes.add('API_DB_COVERAGE_INCOMPLETE')

  const seenAcrossScopes = new Set<string>()
  for (const scope of expectedScopes) {
    const scopePages = [...(byScope.get(key(scope)) ?? [])].sort((left, right) => left.offset - right.offset)
    if (!scopePages.length) continue
    scopeCount += 1
    const total = scopePages[0]!.total
    if (!Number.isSafeInteger(total) || total < 0 || scopePages.some(item => item.total !== total || item.limit !== API_GATE_PAGE_LIMIT || item.offset < 0 || item.offset > 100_000)) {
      codes.add('API_PAGINATION_INVALID')
      continue
    }
    const expectedRows = coverage.rows.filter(row => inScope(row, scope, cutoffDate))
    if (total !== expectedRows.length) codes.add('API_DB_PROJECTION_MISMATCH')
    const expectedPageCount = Math.max(1, Math.ceil(total / API_GATE_PAGE_LIMIT))
    if (scopePages.length !== expectedPageCount) codes.add('API_PAGINATION_INVALID')
    const expectedRowsById = new Map(expectedRows.map(row => [row.id, row]))
    const seen = new Set<string>()
    for (let index = 0; index < scopePages.length; index += 1) {
      const current = scopePages[index]!
      const expectedOffset = index * API_GATE_PAGE_LIMIT
      const expectedLength = Math.max(0, Math.min(API_GATE_PAGE_LIMIT, total - expectedOffset))
      if (current.offset !== expectedOffset || current.rows.length !== expectedLength) codes.add('API_PAGINATION_INVALID')
      if (!validTabs(current.tabs) || !expectedSummary || !same(current.tabs, expectedSummary)) codes.add('API_TABS_MISMATCH')
      for (const row of current.rows) {
        apiRows += 1
        if (seen.has(row.id) || seenAcrossScopes.has(row.id)) { codes.add('API_DB_PROJECTION_MISMATCH'); continue }
        seen.add(row.id)
        seenAcrossScopes.add(row.id)
        const persisted = expectedRowsById.get(row.id)
        if (!persisted || !same(row, persisted)) codes.add('API_DB_PROJECTION_MISMATCH')
      }
    }
    if (seen.size !== expectedRowsById.size) codes.add('API_DB_PROJECTION_MISMATCH')
  }
  if (coverageValid(coverage) && coverage.rows.length < 1) codes.add('API_COVERAGE_EMPTY')
  if (coverageValid(coverage) && seenAcrossScopes.size !== coverage.rows.length) codes.add('API_DB_PROJECTION_MISMATCH')
  return {
    ok: codes.size === 0,
    codes: [...codes].sort(),
    coverage: { dbRows: Array.isArray(coverage?.rows) ? coverage.rows.length : 0, apiRows, scopes: scopeCount, pages: pageCount },
  }
}
