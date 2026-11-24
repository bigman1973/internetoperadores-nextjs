import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildIspScope,
  isIspScope,
  normalizeIspJobScope,
  parseIspSyncIntent,
  requireIspScope,
} from '../lib/finanzas/sync-jobs/isp-sync-scope'

const NOW = new Date('2026-11-06T12:00:00.000Z')
const recent = buildIspScope(NOW)
const annual = buildIspScope(NOW, 2026)

function assertBounds(instant: string, fromInclusive: string, toExclusive: string): void {
  const now = new Date(instant)
  const scope = buildIspScope(now)
  assert.deepEqual(scope, { version: 1, mode: 'RECENT_3_MONTHS', fromInclusive, toExclusive, zone: 'Europe/Madrid' })
  assert.equal(isIspScope(scope, now), true)
}

test('November recent scope is a frozen v1 JSON snapshot with only the required fields', () => {
  assertBounds('2026-11-06T12:00:00.000Z', '2026-09-01', '2026-12-01')
  assert.equal(Object.isFrozen(recent), true)
  assert.equal('year' in recent, false)
  assert.deepEqual(JSON.parse(JSON.stringify(recent)), recent)
  assert.throws(() => Object.defineProperty(recent, 'zone', { value: 'UTC' }), TypeError)
})

test('Madrid winter month/year boundaries do not use the UTC civil month', () => {
  assertBounds('2026-10-31T22:59:59.999Z', '2026-08-01', '2026-11-01')
  assertBounds('2026-10-31T23:00:00.000Z', '2026-09-01', '2026-12-01')
  assertBounds('2026-12-31T22:59:59.999Z', '2026-10-01', '2027-01-01')
  assertBounds('2026-12-31T23:00:00.000Z', '2026-11-01', '2027-02-01')
  assertBounds('2027-01-06T12:00:00.000Z', '2026-11-01', '2027-02-01')
})

test('Madrid summer and daylight-saving boundaries use Intl rather than a fixed offset', () => {
  assertBounds('2026-06-30T21:59:59.999Z', '2026-04-01', '2026-07-01')
  assertBounds('2026-06-30T22:00:00.000Z', '2026-05-01', '2026-08-01')
  for (const instant of ['2026-03-29T00:59:59.999Z', '2026-03-29T01:00:00.000Z']) {
    assertBounds(instant, '2026-01-01', '2026-04-01')
  }
  for (const instant of ['2026-10-25T00:59:59.999Z', '2026-10-25T01:00:00.000Z']) {
    assertBounds(instant, '2026-08-01', '2026-11-01')
  }
})

test('leap years and February length never drift the three civil month bounds', () => {
  assertBounds('2024-02-29T12:00:00.000Z', '2023-12-01', '2024-03-01')
  assertBounds('2024-02-29T23:00:00.000Z', '2024-01-01', '2024-04-01')
  assertBounds('2025-02-28T23:00:00.000Z', '2025-01-01', '2025-04-01')
  const leapScope = buildIspScope(NOW, 2024)
  assert.equal(leapScope.fromInclusive, '2024-01-01')
  assert.equal(leapScope.toExclusive, '2025-01-01')
  assert.equal(isIspScope(leapScope, NOW), true)
})

test('YEAR supports historical validation from 1900, current year and Madrid new year', () => {
  assert.deepEqual(annual, {
    version: 1, mode: 'YEAR', year: 2026, fromInclusive: '2026-01-01',
    toExclusive: '2027-01-01', zone: 'Europe/Madrid',
  })
  for (const year of [1900, 2000, 2010, 2024, 2026]) {
    const scope = buildIspScope(NOW, year)
    assert.equal(isIspScope(scope, NOW), true)
    assert.equal(Object.isFrozen(scope), true)
  }
  const januaryMadrid = new Date('2026-12-31T23:00:00.000Z')
  assert.equal(buildIspScope(januaryMadrid, 2027).mode, 'YEAR')
  assert.deepEqual(parseIspSyncIntent({ mode: 'YEAR', year: 2027, confirmed: true }, januaryMadrid), {
    mode: 'YEAR', year: 2027, confirmed: true,
  })
})

test('builder rejects invalid Date and out-of-range/noninteger years without coercion', () => {
  for (const now of [new Date(NaN), null, '2026-11-06', new Date('1899-01-01T12:00:00Z')]) {
    assert.throws(() => buildIspScope(now as Date), /INVALID_ISP_SCOPE_DATE/)
  }
  for (const year of [1899, 2027, 2026.5, NaN, Infinity, '2026', null]) {
    assert.throws(() => buildIspScope(NOW, year as number), /INVALID_ISP_SCOPE_YEAR/)
  }
})

test('validator rejects non-JSON records, empty/missing fields, bad versions, modes and zones', () => {
  for (const value of [null, undefined, [], new Date(), 1, '', {},
    { ...recent, version: '1' }, { ...recent, version: 2 }, { ...recent, mode: 'RECENT' },
    { ...recent, mode: 'YEAR' }, { ...recent, zone: 'UTC' }, { ...recent, year: 2026 },
  ]) assert.equal(isIspScope(value, NOW), false)
  for (const key of Object.keys(recent)) {
    const missing: Record<string, unknown> = { ...recent }
    delete missing[key]
    assert.equal(isIspScope(missing, NOW), false, key)
  }
  assert.equal(isIspScope(recent, new Date(NaN)), false)
})

test('validator checks canonical real month-start dates and exactly three months', () => {
  for (const date of [
    '2026-02-30', '2025-02-29', '2024-02-29', '2026-04-31', '2026-11-00',
    '2026-00-01', '2026-13-01', '2026-9-01', '26-09-01', '2026-09-1',
    '2026-09-01T00:00:00Z', '2026-09-01 ', '0000-09-01', null, 20260901,
  ]) {
    assert.equal(isIspScope({ ...recent, fromInclusive: date }, NOW), false, String(date))
    assert.equal(isIspScope({ ...recent, toExclusive: date }, NOW), false, String(date))
  }
  for (const toExclusive of ['2026-09-01', '2026-10-01', '2026-11-01', '2027-01-01', '2026-08-01']) {
    assert.equal(isIspScope({ ...recent, toExclusive }, NOW), false, toExclusive)
  }
  assert.equal(isIspScope({ ...recent, fromInclusive: '2026-10-01', toExclusive: '2027-01-01' }, NOW), false)
  assert.equal(isIspScope(buildIspScope(new Date('1900-01-01T12:00:00Z')), NOW), true)
  assert.equal(isIspScope({ ...recent, fromInclusive: '1899-10-01', toExclusive: '1900-01-01' }, NOW), false)
})

test('annual bounds must match the integer year and future years cannot be injected', () => {
  for (const patch of [
    { year: 2025 }, { year: 1899 }, { year: 2027 }, { year: '2026' }, { year: 2026.5 },
    { year: NaN }, { fromInclusive: '2026-02-01' }, { toExclusive: '2026-12-01' },
    { toExclusive: '2028-01-01' },
  ]) assert.equal(isIspScope({ ...annual, ...patch }, NOW), false)
  assert.equal(isIspScope({ ...annual, year: 2027, fromInclusive: '2027-01-01', toExclusive: '2028-01-01' }, NOW), false)
})

test('scope keys are closed, including symbols, hidden keys and accessors', () => {
  for (const scope of [recent, annual]) {
    for (const key of ['scope', 'confirmed', 'actorId', 'checkpoint', 'from', 'to', '__proto__']) {
      assert.equal(isIspScope({ ...scope, [key]: true }, NOW), false, key)
    }
    assert.equal(isIspScope({ ...scope, [Symbol('extra')]: 1 }, NOW), false)
    const hidden = Object.defineProperty({ ...scope }, 'secret', { value: 'no' })
    assert.equal(isIspScope(hidden, NOW), false)
    for (const key of Object.keys(scope)) {
      const accessor = Object.defineProperty({ ...scope }, key, {
        enumerable: true, get: () => { throw new Error('must not read accessors') },
      })
      assert.equal(isIspScope(accessor, NOW), false, key)
    }
  }
  assert.equal(isIspScope(Object.assign(Object.create(null), recent), NOW), true)
  assert.equal(isIspScope(Object.assign(Object.create({ extra: true }), recent), NOW), false)
})

test('require returns a frozen copy and rejects malformed scopes without repairing them', () => {
  const input = JSON.parse(JSON.stringify(recent))
  const scope = requireIspScope(input, NOW)
  assert.deepEqual(scope, recent)
  assert.notEqual(scope, input)
  assert.equal(Object.isFrozen(scope), true)
  assert.equal(Object.isFrozen(input), false)
  input.fromInclusive = '1900-01-01'
  assert.equal(scope.fromInclusive, '2026-09-01')
  for (const value of [{}, null, { ...recent, version: 0 }, { ...recent, extra: true }]) {
    assert.throws(() => requireIspScope(value, NOW), /INVALID_ISP_SCOPE/)
  }
})

test('API intent defaults a missing mode to recent and accepts only confirmed YEAR choices', () => {
  assert.deepEqual(parseIspSyncIntent({}, NOW), { mode: 'RECENT_3_MONTHS' })
  assert.deepEqual(parseIspSyncIntent({ mode: 'RECENT_3_MONTHS' }, NOW), { mode: 'RECENT_3_MONTHS' })
  for (const year of [2010, 2025, 2026]) {
    const intent = parseIspSyncIntent({ mode: 'YEAR', year, confirmed: true }, NOW)
    assert.deepEqual(intent, { mode: 'YEAR', year, confirmed: true })
    assert.equal(Object.isFrozen(intent), true)
    assert.deepEqual(buildIspScope(NOW, intent.mode === 'YEAR' ? intent.year : undefined), buildIspScope(NOW, year))
  }
})

test('API intent forbids arbitrary scope/keys, unconfirmed YEAR and invalid year choices', () => {
  for (const value of [
    undefined, null, [], '', recent, annual, { mode: undefined }, { mode: null }, { mode: 'ALL' },
    { scope: recent }, { fromInclusive: '2026-09-01' }, { zone: 'Europe/Madrid' },
    { actorId: 1 }, { year: 2026 }, { confirmed: true },
    { mode: 'RECENT_3_MONTHS', year: 2026 }, { mode: 'RECENT_3_MONTHS', confirmed: false },
    { mode: 'YEAR', year: 2026 }, { mode: 'YEAR', year: 2026, confirmed: false },
    { mode: 'YEAR', year: 2026, confirmed: 'true' }, { mode: 'YEAR', year: 2026, confirmed: 1 },
    { mode: 'YEAR', confirmed: true },
    ...[1900, 2009, 2027, 2026.1, '2026', null, NaN, Infinity].map((year) => ({ mode: 'YEAR', year, confirmed: true })),
    { mode: 'YEAR', year: 2026, confirmed: true, scope: annual },
    { mode: 'YEAR', year: 2026, confirmed: true, extra: false },
    { [Symbol('extra')]: true },
  ]) assert.throws(() => parseIspSyncIntent(value, NOW), /INVALID_ISP_SYNC_INTENT/)
  for (const key of ['mode', 'year', 'confirmed']) {
    const accessor = Object.defineProperty({ mode: 'YEAR', year: 2026, confirmed: true }, key, {
      enumerable: true, get: () => { throw new Error('must not read intent accessors') },
    })
    assert.throws(() => parseIspSyncIntent(accessor, NOW), /INVALID_ISP_SYNC_INTENT/)
  }
  assert.throws(() => parseIspSyncIntent({}, new Date(NaN)), /INVALID_ISP_SCOPE_DATE/)
})

test('legacy job {} uses createdAt, never the worker clock, and leaves input untouched', () => {
  const createdAt = new Date('2025-12-31T23:00:00.000Z') // January 2026 in Madrid.
  const scope = {}
  const job = { scope, createdAt, trigger: 'DAILY_UTC' }
  const before = createdAt.getTime()
  assert.deepEqual(normalizeIspJobScope(job), {
    version: 1, mode: 'RECENT_3_MONTHS', fromInclusive: '2025-11-01',
    toExclusive: '2026-02-01', zone: 'Europe/Madrid',
  })
  assert.equal(createdAt.getTime(), before)
  assert.deepEqual(scope, {})
  assert.equal(Object.isFrozen(scope), false)
  assert.equal(Object.isFrozen(normalizeIspJobScope(job)), true)
  assert.deepEqual(normalizeIspJobScope({ scope: {}, createdAt: new Date('2027-01-06T12:00:00Z'), trigger: 'MANUAL' }), {
    version: 1, mode: 'RECENT_3_MONTHS', fromInclusive: '2026-11-01',
    toExclusive: '2027-02-01', zone: 'Europe/Madrid',
  })
})

test('worker context preserves old valid snapshots and fails closed on malformed nonempty scopes', () => {
  const old = buildIspScope(new Date('2026-01-06T12:00:00.000Z'))
  assert.deepEqual(normalizeIspJobScope({ scope: old, createdAt: NOW, trigger: 'DAILY_UTC' }), old)
  for (const scope of [null, undefined, [], { mode: 'RECENT_3_MONTHS' },
    { ...recent, extra: true }, { ...recent, toExclusive: '2027-01-01' },
  ]) assert.throws(() => normalizeIspJobScope({ scope, createdAt: NOW, trigger: 'MANUAL' }), /INVALID_ISP_SCOPE/)
  assert.throws(() => normalizeIspJobScope({ scope: {}, createdAt: new Date(NaN), trigger: 'MANUAL' }), /INVALID_ISP_SCOPE_DATE/)
})

test('worker YEAR requires MANUAL while actor authorization remains the caller responsibility', () => {
  assert.deepEqual(normalizeIspJobScope({ scope: annual, createdAt: NOW, trigger: 'MANUAL' }), annual)
  for (const trigger of ['DAILY_UTC', 'LEGACY_BRIDGE', '', 'manual']) {
    assert.throws(() => normalizeIspJobScope({ scope: annual, createdAt: NOW, trigger }), /ISP_YEAR_SCOPE_REQUIRES_MANUAL/)
  }
  for (const trigger of ['MANUAL', 'DAILY_UTC', 'LEGACY_BRIDGE']) {
    assert.deepEqual(normalizeIspJobScope({ scope: recent, createdAt: NOW, trigger }), recent)
  }
  const future = { ...annual, year: 2027, fromInclusive: '2027-01-01', toExclusive: '2028-01-01' }
  assert.throws(() => normalizeIspJobScope({ scope: future, createdAt: NOW, trigger: 'MANUAL' }), /INVALID_ISP_SCOPE/)
})
