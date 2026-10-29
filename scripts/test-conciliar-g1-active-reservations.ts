/* G1 active-offer contract. Pure synthetic data only: no PostgreSQL or production identifiers. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateGlobalRegression,
  type GlobalProjectionRow,
  type GlobalRegressionDataset,
} from '../lib/finanzas/conciliar-release-regression-global'

function offeredRow(overrides: Partial<GlobalProjectionRow> = {}): GlobalProjectionRow {
  return {
    movementKey: 'movement-active-a', tab: 'COBROS', visible: true, entityKind: 'BANK_MOVEMENT', reconciliationStatus: 'PENDING',
    activeCollectionSettlement: null, color: 'VERDE', groupLabel: 'CLIENTES', action: 'NONE', requestReason: 'NONE',
    amountCents: 10_000, bankDate: '2026-10-29', protectedKind: 'NONE', seleccionable: true,
    proposals: [{
      proposalKey: 'source-active-a', source: 'BANK_MOVEMENT', quote: 'EXACT', assignment: 'RESERVED', sourceOnly: false,
      projectionProof: { proposalKey: 'source-active-a', movementKey: 'movement-active-a', color: 'VERDE', seleccionable: true },
      quotedAmountCents: 10_000, composition: [{ documentKey: 'invoice-a', amountCents: 10_000 }],
    }],
    referenceEvidence: null, confirmingEvidence: null,
    ...overrides,
  }
}

type CurrentSourcePopulation = NonNullable<GlobalRegressionDataset['collectionSourcePopulation']>

function dataset(rows: readonly GlobalProjectionRow[], sources: CurrentSourcePopulation['sources']): GlobalRegressionDataset {
  return {
    rows,
    collectionReservations: [],
    collectionSourcePopulation: {
      allCurrentSourcesRead: true,
      allCurrentProjectionsRead: true,
      classifierExecuted: true,
      sources,
    },
    totals: null,
  }
}

function g1(value: GlobalRegressionDataset) {
  return evaluateGlobalRegression(value).results.find(result => result.id === 'G1')!
}

test('G1 counts a fully read source-only proposal as absence, not as an amber/exact offer', () => {
  const actual = g1(dataset(
    [offeredRow()],
    [
      { sourceId: 'source-active-a', movementKey: 'movement-active-a', status: 'OFFERED' },
      { sourceId: 'legacy-source-without-projection', movementKey: 'movement-legacy', status: 'NOT_OFFERED' },
    ],
  ))
  assert.deepEqual(actual, { id: 'G1', passed: true, codes: [] })
})

test('G1 remains blocking when one currently offered invoice is duplicated across active bank movements', () => {
  const first = offeredRow()
  const second = offeredRow({
    movementKey: 'movement-active-b',
    proposals: [{
      proposalKey: 'source-active-b', source: 'BANK_MOVEMENT', quote: 'EXACT', assignment: 'RESERVED', sourceOnly: false,
      projectionProof: { proposalKey: 'source-active-b', movementKey: 'movement-active-b', color: 'VERDE', seleccionable: true },
      quotedAmountCents: 10_000, composition: [{ documentKey: 'invoice-a', amountCents: 10_000 }],
    }],
  })
  const actual = g1(dataset([first, second], [
    { sourceId: 'source-active-a', movementKey: 'movement-active-a', status: 'OFFERED' },
    { sourceId: 'source-active-b', movementKey: 'movement-active-b', status: 'OFFERED' },
  ]))
  assert.equal(actual.passed, false)
  assert.ok(actual.codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
})

test('G1 remains blocking when an offered green reservation has an invalid exact amount or canonical composition', () => {
  const invalidAmount = offeredRow({
    proposals: [{
      proposalKey: 'source-active-a', source: 'BANK_MOVEMENT', quote: 'EXACT', assignment: 'RESERVED', sourceOnly: false,
      projectionProof: { proposalKey: 'source-active-a', movementKey: 'movement-active-a', color: 'VERDE', seleccionable: true },
      quotedAmountCents: 10_000, composition: [{ documentKey: 'invoice-a', amountCents: 9_999 }],
    }],
  })
  const invalidComposition = offeredRow({
    proposals: [{
      proposalKey: 'source-active-a', source: 'BANK_MOVEMENT', quote: 'EXACT', assignment: 'RESERVED', sourceOnly: false,
      projectionProof: { proposalKey: 'source-active-a', movementKey: 'movement-active-a', color: 'VERDE', seleccionable: true },
      quotedAmountCents: 10_000, composition: [{ documentKey: '', amountCents: 10_000 }],
    }],
  })
  const sources = [{ sourceId: 'source-active-a', movementKey: 'movement-active-a', status: 'OFFERED' as const }]
  assert.ok(g1(dataset([invalidAmount], sources)).codes.includes('G1_EXACT_QUOTE_INVALID'))
  assert.ok(g1(dataset([invalidComposition], sources)).codes.includes('G1_PROPOSAL_SHAPE_INVALID'))
})

test('G1 remains blocking when a green selectable row is not validated by its actual current source', () => {
  const actual = g1(dataset([offeredRow()], [
    { sourceId: 'source-active-a', movementKey: 'movement-active-a', status: 'NOT_OFFERED' },
  ]))
  assert.equal(actual.passed, false)
  assert.ok(actual.codes.includes('G1_RESERVATION_PROOF_INVALID'))
})

console.log('OK: G1 validates only active current offers, preserves complete source absence coverage, and keeps unsafe offers blocking.')
