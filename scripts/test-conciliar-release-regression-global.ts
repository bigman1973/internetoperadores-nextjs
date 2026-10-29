/* G1–G6: fixtures sintéticas puras. Sin Prisma, BD, red, PDF ni datos reales. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GLOBAL_COLORS,
  GLOBAL_TABS,
  canonicalGroupLabel,
  collectStagingReadonlyGlobalDataset,
  evaluateGlobalRegression,
  type GlobalConfirmingEvidence,
  type GlobalProjectionRow,
  type GlobalRegressionDataset,
  type GlobalRuleId,
  type StagingReadonlyQueryClient,
} from '../lib/finanzas/conciliar-release-regression-global'

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T
type MutableGlobalProjectionRow = DeepMutable<GlobalProjectionRow>
type MutableGlobalRegressionDataset = DeepMutable<GlobalRegressionDataset>
type MutableGlobalTotals = NonNullable<MutableGlobalRegressionDataset['totals']>
const absentConfirming: MutableGlobalProjectionRow['confirmingEvidence'] = null

function row(input: Partial<MutableGlobalProjectionRow> & Pick<MutableGlobalProjectionRow, 'movementKey'>): MutableGlobalProjectionRow {
  return {
    movementKey: input.movementKey,
    tab: 'COBROS', visible: true, entityKind: 'BANK_MOVEMENT', reconciliationStatus: 'PENDING', activeCollectionSettlement: null,
    color: 'AMBAR', groupLabel: 'OTROS', action: 'NONE', requestReason: 'NONE', amountCents: 10000, bankDate: '2026-10-10',
    protectedKind: 'NONE', seleccionable: false, proposals: [], referenceEvidence: null, confirmingEvidence: absentConfirming,
    ...input,
  }
}

function totals(overrides: Partial<MutableGlobalTotals> = {}): MutableGlobalTotals {
  const tabColorTotals = GLOBAL_TABS.flatMap(tab => GLOBAL_COLORS.map(color => ({ tab, color, amountCents: 0 })))
  const groupTotals = GLOBAL_TABS.flatMap(tab => GLOBAL_COLORS.map(color => ({ tab, color, canonicalGroup: 'OTROS', amountCents: 0 })))
  return { allPagesRead: true, totalVisibleRows: 12, rowsRead: 12, pageSize: 10, pagesRead: 2, tabColorTotals, groupTotals, ...overrides }
}

function validDataset(): MutableGlobalRegressionDataset {
  return {
    rows: [
      row({ movementKey: 'g1-exact', amountCents: 10000, color: 'VERDE', seleccionable: true, proposals: [{ proposalKey: 'proposal-exact', source: 'BANK_MOVEMENT', quote: 'EXACT', assignment: 'RESERVED', sourceOnly: false, projectionProof: { proposalKey: 'proposal-exact', movementKey: 'g1-exact', color: 'VERDE', seleccionable: true }, quotedAmountCents: 10000, composition: [{ documentKey: 'doc-exact', amountCents: 10000 }] }] }),
      row({ movementKey: 'g1-amber', amountCents: 10000, proposals: [{ proposalKey: 'proposal-amber', source: 'BANK_MOVEMENT', quote: 'AMBER', assignment: 'REVIEW', sourceOnly: false, projectionProof: { proposalKey: 'proposal-amber', movementKey: 'g1-amber', color: 'AMBAR', seleccionable: false }, quotedAmountCents: 10100, composition: [{ documentKey: 'doc-amber', amountCents: 10100 }] }] }),
      // Same proposal copied under EMITIDAS is an informational projection, not a second bank assignment.
      row({ movementKey: 'issued-copy', tab: 'EMITIDAS', entityKind: 'ISSUED_INVOICE', proposals: [{ proposalKey: 'proposal-exact', source: 'ISSUED_PROJECTION', quote: 'EXACT', assignment: 'RESERVED', sourceOnly: false, projectionProof: null, quotedAmountCents: 10000, composition: [{ documentKey: 'doc-exact', amountCents: 10000 }] }] }),
      row({ movementKey: 'g2-bank-hidden', visible: false, reconciliationStatus: 'B4_CONFIRMED' }),
      row({ movementKey: 'g2-issued-hidden', tab: 'EMITIDAS', visible: false, entityKind: 'ISSUED_INVOICE', reconciliationStatus: 'COLLECTION_SETTLED', activeCollectionSettlement: true }),
      row({ movementKey: 'g3-own', referenceEvidence: { citations: [{ origin: 'OWN_CANONICAL', usedForDecision: true }], externalReferencePresent: false, ownReferenceCompatible: true, ownProposalBlockedByReference: false } }),
      row({ movementKey: 'g3-supplier', referenceEvidence: { citations: [{ origin: 'SUPPLIER_EXACT', usedForDecision: true }], externalReferencePresent: false, ownReferenceCompatible: false, ownProposalBlockedByReference: false } }),
      row({ movementKey: 'g3-external-plus-own', referenceEvidence: { citations: [{ origin: 'EXTERNAL_CUSTOMER', usedForDecision: false }, { origin: 'OWN_CANONICAL', usedForDecision: true }], externalReferencePresent: true, ownReferenceCompatible: true, ownProposalBlockedByReference: false } }),
      row({ movementKey: 'g5-transfer', protectedKind: 'OWN_TRANSFER', action: 'NONE', requestReason: 'NONE' }),
      row({ movementKey: 'g5-fee', protectedKind: 'BANK_FEE', action: 'NONE', requestReason: 'NONE' }),
      row({ movementKey: 'g5-payroll', protectedKind: 'PAYROLL', action: 'REQUEST_PAYROLL', requestReason: 'MISSING_PAYROLL' }),
      row({ movementKey: 'g6-confirming', color: 'VERDE', amountCents: 9765, bankDate: '2026-10-13', confirmingEvidence: { evidenceSchema: 'C11', liquidationVersion: 1, currentVersion: true, persisted: true, sourceCommitState: 'COMMITTED', bankDate: '2026-10-13', liquidationDate: '2026-10-10', invoiceLineCents: [10000], interestCents: 100, commissionCents: 100, vatCommissionCents: 35, netCents: 9765 } }),
    ],
    collectionReservations: [],
    totals: totals(),
  }
}

function rule(dataset: GlobalRegressionDataset, id: GlobalRuleId) {
  const found = evaluateGlobalRegression(dataset).results.find(item => item.id === id)
  assert.ok(found, `missing ${id}`)
  return found
}
function mutate(base: MutableGlobalRegressionDataset, transform: (rows: MutableGlobalProjectionRow[]) => void, totalsOverride?: Partial<MutableGlobalTotals>): MutableGlobalRegressionDataset {
  const rows: MutableGlobalProjectionRow[] = base.rows.map(item => ({ ...item, proposals: item.proposals.map(proposal => ({ ...proposal, projectionProof: proposal.projectionProof ? { ...proposal.projectionProof } : null, composition: proposal.composition.map(line => ({ ...line })) })), referenceEvidence: item.referenceEvidence ? { ...item.referenceEvidence, citations: item.referenceEvidence.citations.map(citation => ({ ...citation })) } : null, confirmingEvidence: item.confirmingEvidence ? { ...item.confirmingEvidence, invoiceLineCents: [...item.confirmingEvidence.invoiceLineCents] } : null }))
  transform(rows)
  return { rows, collectionReservations: base.collectionReservations?.map(item => ({ ...item })) ?? null, totals: { ...base.totals!, ...totalsOverride } }
}

test('G1 success: exact/amber compositions reserve documents once and ignore EMITIDAS copies', () => {
  assert.deepEqual(rule(validDataset(), 'G1'), { id: 'G1', passed: true, codes: [] })
})
test('G1 fail: a composed invoice cannot be quoted by two active bank movements', () => {
  const dataset = mutate(validDataset(), rows => { rows[1].proposals = [{ ...rows[1].proposals[0], proposalKey: 'proposal-other', quote: 'AMBER', composition: [{ documentKey: 'doc-exact', amountCents: 10100 }] }] })
  assert.equal(rule(dataset, 'G1').passed, false)
  assert.ok(rule(dataset, 'G1').codes.includes('G1_REVIEW_PROOF_INVALID'))
})
test('G1 fail: REVIEW cannot freely hide a green row and RESERVED requires the same real green source', () => {
  const hiddenGreen = mutate(validDataset(), rows => {
    const review = rows.find(item => item.movementKey === 'g1-amber')!
    review.color = 'VERDE'; review.seleccionable = true
    review.proposals[0]!.projectionProof = { proposalKey: 'proposal-amber', movementKey: 'g1-amber', color: 'VERDE', seleccionable: true }
  })
  assert.ok(rule(hiddenGreen, 'G1').codes.includes('G1_REVIEW_PROOF_INVALID'))
  const falseReservation = mutate(validDataset(), rows => {
    const review = rows.find(item => item.movementKey === 'g1-amber')!
    review.proposals[0]!.assignment = 'RESERVED'
  })
  assert.ok(rule(falseReservation, 'G1').codes.includes('G1_RESERVATION_PROOF_INVALID'))
})
test('G1 fail: a source-only proposal never reserves FI or impersonates an amber projection proof', () => {
  const dataset = mutate(validDataset(), rows => {
    rows.push(row({
      movementKey: 'g1-source-only', visible: false, entityKind: 'OTHER', reconciliationStatus: 'NOT_APPLICABLE', seleccionable: false,
      proposals: [{ proposalKey: 'proposal-source-only', source: 'BANK_MOVEMENT', quote: 'AMBER', assignment: 'REVIEW', sourceOnly: true, projectionProof: null, quotedAmountCents: 10000, composition: [{ documentKey: 'doc-source-only', amountCents: 10000 }] }],
    }))
  })
  const actual = rule(dataset, 'G1')
  assert.ok(actual.codes.includes('G1_REVIEW_PROOF_INVALID'))
  assert.ok(!actual.codes.includes('G1_RESERVATION_PROOF_INVALID'))
})
test('G1 fail: missing or conflicting observed B4/B7 capacity never becomes a green pass', () => {
  const missing = validDataset()
  missing.collectionReservations = null
  assert.ok(rule(missing, 'G1').codes.includes('G1_RESERVATION_EVIDENCE_INVALID'))
  const conflict = validDataset()
  conflict.collectionReservations = [
    { documentKey: 'doc-exact', proposalKey: 'proposal-exact', movementKey: 'g1-exact', status: 'CONFIRMED' },
    { documentKey: 'doc-exact', proposalKey: 'proposal-other', movementKey: 'movement-other', status: 'CONFIRMED' },
  ]
  assert.ok(rule(conflict, 'G1').codes.includes('G1_RESERVATION_EVIDENCE_INVALID'))
})
test('G2 success: B4-confirmed bank and active settled issued rows are absent', () => {
  assert.deepEqual(rule(validDataset(), 'G2'), { id: 'G2', passed: true, codes: [] })
})
test('G2 fail: an active settled issued invoice cannot remain visible', () => {
  const dataset = mutate(validDataset(), rows => { rows.find(item => item.movementKey === 'g2-issued-hidden')!.visible = true })
  assert.ok(rule(dataset, 'G2').codes.includes('G2_ACTIVE_SETTLED_ISSUED_VISIBLE'))
})
test('G3 success: canonical own and exact supplier citations are permitted; external client ref does not block own', () => {
  assert.deepEqual(rule(validDataset(), 'G3'), { id: 'G3', passed: true, codes: [] })
})
test('G3 fail: an external customer locator cannot be used as invoice evidence', () => {
  const dataset = mutate(validDataset(), rows => { rows.find(item => item.movementKey === 'g3-external-plus-own')!.referenceEvidence!.citations[0].usedForDecision = true })
  assert.ok(rule(dataset, 'G3').codes.includes('G3_INVALID_CITATION_USED'))
})
test('G4 success: all four tabs and three colours exactly equal canonical group sums', () => {
  assert.deepEqual(rule(validDataset(), 'G4'), { id: 'G4', passed: true, codes: [] })
})
test('G4 fail: a first-page-only aggregate is rejected even if its partial sums agree', () => {
  const dataset = validDataset()
  dataset.totals = totals({ totalVisibleRows: 101, rowsRead: 100, pageSize: 100, pagesRead: 1, allPagesRead: false })
  assert.ok(rule(dataset, 'G4').codes.includes('G4_INCOMPLETE_PAGINATION'))
})
test('G5 success: transfer, bank fee and payroll stay out of invoice-request flow', () => {
  assert.deepEqual(rule(validDataset(), 'G5'), { id: 'G5', passed: true, codes: [] })
})
test('G5 fail: a payroll row may ask for payroll, never blank/invalid invoice paperwork', () => {
  const dataset = mutate(validDataset(), rows => { const payroll = rows.find(item => item.movementKey === 'g5-payroll')!; payroll.action = 'REQUEST_INVOICE'; payroll.requestReason = 'MISSING_INVOICE' })
  const actual = rule(dataset, 'G5')
  assert.ok(actual.codes.includes('G5_PAYROLL_REQUESTS_INVOICE'))
})
test('G6 success: current persisted C11 liquidación closes to the cent after deductions and permits normal delay', () => {
  assert.deepEqual(rule(validDataset(), 'G6'), { id: 'G6', passed: true, codes: [] })
})
test('G6 fail: legacy/uncorroborated green confirming never passes and no evidence is vacuous', () => {
  const legacy = mutate(validDataset(), rows => { const confirming = rows.find(item => item.movementKey === 'g6-confirming')!; confirming.confirmingEvidence = { ...confirming.confirmingEvidence!, evidenceSchema: 'C9_LEGACY', currentVersion: false, persisted: false, sourceCommitState: 'UNCOMMITTED' } })
  assert.ok(rule(legacy, 'G6').codes.includes('G6_LEGACY_OR_NONCURRENT_EVIDENCE'))
  const absent = mutate(validDataset(), rows => { const confirming = rows.find(item => item.movementKey === 'g6-confirming')!; confirming.color = 'AMBAR'; confirming.confirmingEvidence = null })
  assert.ok(rule(absent, 'G6').codes.includes('G6_EVIDENCE_MISSING'))
})
test('G6 fail: green C11 confirming rejects a liquidation outside its documented bank-date window', () => {
  const outsideWindow = mutate(validDataset(), rows => { rows.find(item => item.movementKey === 'g6-confirming')!.confirmingEvidence!.liquidationDate = '2026-10-08' })
  assert.ok(rule(outsideWindow, 'G6').codes.includes('G6_LIQUIDATION_DATE_INCOHERENT'))
})
test('all global results expose only static result shape and aggregate coverage counts', () => {
  const outcome = evaluateGlobalRegression(validDataset())
  assert.deepEqual(outcome.results.map(item => Object.keys(item).sort()), Array.from({ length: 6 }, () => ['codes', 'id', 'passed']))
  assert.deepEqual(Object.keys(outcome.coverageCounts).sort(), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
  assert.ok(Object.values(outcome.coverageCounts).every(value => Number.isSafeInteger(value) && value > 0))
})
test('optional collector is confined to explicit staging read-only client and bounded SELECT', async () => {
  let entered = 0
  const syntheticRow = { synthetic: true } as const
  const syntheticRows = <T>(): readonly T[] => [syntheticRow as unknown as T]
  const client: StagingReadonlyQueryClient = {
    environment: 'STAGING', role: 'io_staging_finanzas',
    withReadOnlyTransaction: async callback => { entered += 1; return callback({ query: async <T>() => syntheticRows<T>() }) },
    query: async <T>() => syntheticRows<T>(),
  }
  const collected = await collectStagingReadonlyGlobalDataset(client, { environment: 'STAGING', readonlyTransaction: true, productionReadDelegated: false }, [{ sql: 'SELECT 1 LIMIT 1' }], sets => sets.length)
  assert.equal(collected, 1)
  assert.equal(entered, 1)
  await assert.rejects(() => collectStagingReadonlyGlobalDataset(client, { environment: 'STAGING', readonlyTransaction: true, productionReadDelegated: false }, [{ sql: 'DELETE FROM x LIMIT 1' }], () => null), /GLOBAL_REGRESSION_STAGING_READONLY_REQUIRED/)
})

console.log('OK: G1–G6 global synthetic contracts verify success and failure paths without real IDs, amounts, references or database access.')

test('canonical group keys are idempotent and own-transfer labels preserve the protected key', () => {
  for (const group of ['TRASPASOS_PROPIOS','GASTOS_BANCO','NOMINAS','CONFIRMING','REMESAS','CLIENTES','PROVEEDORES','TARJETA','IMPUESTOS','PRESTAMOS','DEVOLUCIONES','OTROS']) {
    assert.equal(canonicalGroupLabel(group), group)
    assert.equal(canonicalGroupLabel(canonicalGroupLabel(group)), group)
  }
  assert.equal(canonicalGroupLabel('Traspasos entre cuentas propias'), 'TRASPASOS_PROPIOS')
  assert.equal(canonicalGroupLabel('Gastos del banco'), 'GASTOS_BANCO')
  assert.equal(canonicalGroupLabel('grupo no registrado'), null)
})
