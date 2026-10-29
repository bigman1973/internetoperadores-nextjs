import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmingEvidenceForSource, readReleaseRegressionAdapter, type ReadonlyPgClient } from './conciliar-release-regression-adapter'

test('adapter C11 reader never invents evidence when persisted current source is absent', () => {
  const evidence = confirmingEvidenceForSource(
    { kind: 'COBRO_CONFIRMING', confirmingId: 'synthetic-confirming', confirmingSourceHash: 'a'.repeat(64) },
    '2026-10-29',
    [],
  )
  assert.equal(evidence, null)
})

test('adapter fails closed before mapping a malformed count result', async () => {
  const client: ReadonlyPgClient = {
    query: async <T extends Record<string, unknown> = Record<string, unknown>>() => ({
      rows: [{ total: 'not-an-integer' }] as unknown as T[],
    }),
  }
  await assert.rejects(() => readReleaseRegressionAdapter(client), /REGRESSION_SCHEMA_INVALID/)
})

console.log('OK: adapter pure guards reject malformed source shape and missing C11 evidence without PostgreSQL.')
