/**
 * ISP scope v1: civil dates, inclusive/exclusive bounds, always Europe/Madrid.
 * Build on the server and persist the resulting JSON; workers must reuse it.
 * This module has no provider, DB, environment or authorization dependencies.
 */
export type IspSyncMode = 'RECENT_3_MONTHS' | 'YEAR'

type ScopeBounds = {
  readonly version: 1
  readonly fromInclusive: string
  readonly toExclusive: string
  readonly zone: 'Europe/Madrid'
}

export type IspSyncScope = ScopeBounds & (
  | { readonly mode: 'RECENT_3_MONTHS' }
  | { readonly mode: 'YEAR'; readonly year: number }
)

export type IspSyncIntent =
  | { readonly mode: 'RECENT_3_MONTHS' }
  | { readonly mode: 'YEAR'; readonly year: number; readonly confirmed: true }

const ZONE = 'Europe/Madrid' as const
const MIN_SCOPE_YEAR = 1900
const MIN_INTENT_YEAR = 2010
const madridCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit',
})

type CivilMonth = { year: number; month: number }

function civilMonth(now: Date): CivilMonth {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('INVALID_ISP_SCOPE_DATE')
  const parts = madridCalendar.formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  // Leave room for the exclusive January boundary of the following year.
  if (!Number.isInteger(year) || year < MIN_SCOPE_YEAR || year > 9998) throw new Error('INVALID_ISP_SCOPE_DATE')
  return { year, month }
}

function monthIndex({ year, month }: CivilMonth): number { return year * 12 + month - 1 }

function monthStart(index: number): string {
  const year = Math.floor(index / 12)
  const month = index % 12 + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
}

function parseMonthStart(value: unknown): CivilMonth | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-01$/.test(value)) return null
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7))
  if (year < 1 || month < 1 || month > 12) return null
  return { year, month }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function closedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string' || !allowed.includes(key)) return false
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return !!descriptor?.enumerable && 'value' in descriptor
  })
}

function validYear(year: unknown, minimum: number, currentYear: number): year is number {
  return typeof year === 'number' && Number.isInteger(year) && year >= minimum && year <= currentYear
}

/** Current Madrid month plus the previous two, or a whole civil year (1900..now's Madrid year). */
export function buildIspScope(now: Date, year?: number): IspSyncScope {
  const current = civilMonth(now)
  if (year !== undefined) {
    if (!validYear(year, MIN_SCOPE_YEAR, current.year)) throw new Error('INVALID_ISP_SCOPE_YEAR')
    return Object.freeze({
      version: 1, mode: 'YEAR', year, fromInclusive: monthStart(year * 12),
      toExclusive: monthStart((year + 1) * 12), zone: ZONE,
    })
  }
  const index = monthIndex(current)
  return Object.freeze({
    version: 1, mode: 'RECENT_3_MONTHS', fromInclusive: monthStart(index - 2),
    toExclusive: monthStart(index + 1), zone: ZONE,
  })
}

/** Validate stored JSON, not a request intent. Inject now for deterministic replay/tests. */
export function isIspScope(value: unknown, now: Date = new Date()): value is IspSyncScope {
  if (!isRecord(value)) return false
  const keys = ['version', 'mode', 'fromInclusive', 'toExclusive', 'zone']
  if (!closedKeys(value, [...keys, 'year'])) return false
  if (value.mode !== 'YEAR' && Object.hasOwn(value, 'year')) return false
  if (value.version !== 1 || value.zone !== ZONE) return false
  const from = parseMonthStart(value.fromInclusive); const to = parseMonthStart(value.toExclusive)
  if (!from || !to) return false
  let current: CivilMonth
  try { current = civilMonth(now) } catch { return false }
  if (value.mode === 'YEAR') {
    return validYear(value.year, MIN_SCOPE_YEAR, current.year)
      && from.year === value.year && from.month === 1
      && to.year === value.year + 1 && to.month === 1
  }
  if (value.mode !== 'RECENT_3_MONTHS') return false
  const anchor = monthIndex(to) - 1
  return monthIndex(to) - monthIndex(from) === 3
    && anchor >= MIN_SCOPE_YEAR * 12 && anchor <= monthIndex(current)
}

/** Fail closed and return a fresh frozen JSON snapshot; never freeze/mutate caller input. */
export function requireIspScope(value: unknown, now: Date = new Date()): IspSyncScope {
  if (!isIspScope(value, now)) throw new Error('INVALID_ISP_SCOPE')
  return Object.freeze({ ...value })
}

/**
 * Only {} / {mode: RECENT_3_MONTHS}, or {mode: YEAR, year, confirmed: true}.
 * UI/API year choices are 2010..the current Madrid year; no client-supplied bounds/scope.
 * Build the persisted scope with buildIspScope(now, intent.mode === 'YEAR' ? intent.year : undefined).
 * Authentication and actor authorization belong to the caller, not this helper.
 */
export function parseIspSyncIntent(value: unknown, now: Date): IspSyncIntent {
  if (!isRecord(value) || !closedKeys(value, ['mode', 'year', 'confirmed'])) throw new Error('INVALID_ISP_SYNC_INTENT')
  const current = civilMonth(now)
  const mode = Object.hasOwn(value, 'mode') ? value.mode : 'RECENT_3_MONTHS'
  if (mode === 'RECENT_3_MONTHS') {
    if (Object.hasOwn(value, 'year') || Object.hasOwn(value, 'confirmed')) throw new Error('INVALID_ISP_SYNC_INTENT')
    return Object.freeze({ mode })
  }
  if (mode !== 'YEAR' || value.confirmed !== true || !validYear(value.year, MIN_INTENT_YEAR, current.year)) {
    throw new Error('INVALID_ISP_SYNC_INTENT')
  }
  return Object.freeze({ mode, year: value.year, confirmed: true })
}

/**
 * Worker context: resolve legacy {} only against job.createdAt, never worker time.
 * Nonempty malformed scopes are forbidden; valid snapshots are not recomputed.
 * YEAR is restricted to MANUAL. The caller MUST separately authorize its actor.
 */
export function normalizeIspJobScope(job: { scope: unknown; createdAt: Date; trigger: string }): IspSyncScope {
  const scope = isRecord(job.scope) && Reflect.ownKeys(job.scope).length === 0
    ? buildIspScope(job.createdAt)
    : requireIspScope(job.scope, job.createdAt)
  if (scope.mode === 'YEAR' && job.trigger !== 'MANUAL') throw new Error('ISP_YEAR_SCOPE_REQUIRES_MANUAL')
  return scope
}
