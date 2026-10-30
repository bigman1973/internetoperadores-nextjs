import assert from 'node:assert/strict'
import test from 'node:test'
import {
  API_GATE_DEFAULT_CUTOFF,
  API_GATE_ORIGIN,
  API_GATE_SCHEMA,
  evaluateConciliarStagingApiSnapshot,
  type ApiProjectionComparableRow,
  type ApiProjectionCoverage,
} from './api-core'

const baseRow = (overrides: Partial<ApiProjectionComparableRow> = {}): ApiProjectionComparableRow => ({
  id: 'synthetic-row', movimientoId: 'synthetic-movement', tab: 'PAGOS', fecha: '2026-10-01', color: 'VERDE', grupo: 'TRASPASOS_PROPIOS',
  documento: null, seleccionable: false, diferenciaCentimos: 0, motivo: 'synthetic reason', propuesta: null, pendienteCentimos: -20_000, ...overrides,
})
const coverage = (rows: readonly ApiProjectionComparableRow[] = [baseRow()]): ApiProjectionCoverage => ({
  allRowsRead: true, updatedAt: '2026-10-29T10:00:00.000Z', rows,
})
const tabs = () => ['COBROS', 'EMITIDAS', 'PAGOS', 'RECIBIDAS'].map(tab => ({
  tab, count: tab === 'PAGOS' ? 1 : 0, amountCentimos: tab === 'PAGOS' ? -20_000 : 0,
  colors: {
    VERDE: { count: tab === 'PAGOS' ? 1 : 0, amountCentimos: tab === 'PAGOS' ? -20_000 : 0 },
    AMBAR: { count: 0, amountCentimos: 0 }, ROJO: { count: 0, amountCentimos: 0 },
  },
}))
function scopePage(tab: string, historic: boolean, rows: readonly ApiProjectionComparableRow[], total = rows.length) {
  return { tab, historic, response: {
    rows: rows.map(row => {
      const { tab: _tab, ...apiRow } = row
      return apiRow
    }), total, limit: 100, offset: 0, updatedAt: '2026-10-29T10:00:00.000Z', cutoffDate: API_GATE_DEFAULT_CUTOFF, tabs: tabs(),
  } }
}
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schema: API_GATE_SCHEMA, origin: API_GATE_ORIGIN, capturedAt: '2026-10-29T10:01:00.000Z', effectiveUserVerified: true, ownSessionEnded: true,
    renderedChecks: { P9: true, P10: true }, pages: [
      scopePage('COBROS', false, []), scopePage('EMITIDAS', false, []), scopePage('PAGOS', false, [baseRow()]), scopePage('RECIBIDAS', false, []), scopePage('EMITIDAS', true, []),
    ], ...overrides,
  }
}

test('the API snapshot gate accepts one complete stable synthetic DB/API photograph', () => {
  const result = evaluateConciliarStagingApiSnapshot(snapshot(), coverage())
  assert.deepEqual(result, { ok: true, codes: [], coverage: { dbRows: 1, apiRows: 1, scopes: 5, pages: 5 } })
})

test('the API snapshot gate fails closed before evaluators for identity/session/rendered P9/P10 absence', () => {
  const result = evaluateConciliarStagingApiSnapshot(snapshot({ effectiveUserVerified: false, ownSessionEnded: false, renderedChecks: { P9: false } }), coverage())
  assert.equal(result.ok, false)
  assert.deepEqual(result.codes, ['API_RENDERED_P10_NOT_VERIFIED', 'API_RENDERED_P9_NOT_VERIFIED', 'API_SNAPSHOT_IDENTITY_UNVERIFIED', 'API_SNAPSHOT_SESSION_NOT_ENDED'])
})

test('the API snapshot gate rejects a page gap and incomplete DB coverage', () => {
  const pages = (snapshot().pages as unknown[]).filter((page: any) => !(page.tab === 'EMITIDAS' && page.historic === true))
  const result = evaluateConciliarStagingApiSnapshot(snapshot({ pages }), { ...coverage(), allRowsRead: false })
  assert.equal(result.ok, false)
  assert(result.codes.includes('API_SCOPE_MISSING'))
  assert(result.codes.includes('API_DB_COVERAGE_INCOMPLETE'))
})

test('the API snapshot gate rejects a response from a different projection photo or a nonzero first offset', () => {
  const changed = snapshot()
  const payment = (changed.pages as any[]).find(page => page.tab === 'PAGOS')
  payment.response.updatedAt = '2026-10-29T10:00:01.000Z'
  payment.response.offset = 100
  const result = evaluateConciliarStagingApiSnapshot(changed, coverage())
  assert.equal(result.ok, false)
  assert(result.codes.includes('API_SNAPSHOT_CHANGED_DURING_PAGINATION'))
  assert(result.codes.includes('API_PAGINATION_INVALID'))
})

test('the API snapshot gate rejects a persisted/API row mismatch without exposing row values', () => {
  const mutated = snapshot()
  const payment = (mutated.pages as any[]).find(page => page.tab === 'PAGOS')
  payment.response.rows[0].color = 'ROJO'
  const result = evaluateConciliarStagingApiSnapshot(mutated, coverage())
  assert.equal(result.ok, false)
  assert.deepEqual(result.codes, ['API_DB_PROJECTION_MISMATCH'])
})

test('the API snapshot gate rejects an entirely empty persisted/API coverage', () => {
  const result = evaluateConciliarStagingApiSnapshot(snapshot(), coverage([]))
  assert.equal(result.ok, false)
  assert(result.codes.includes('API_COVERAGE_EMPTY'))
})
