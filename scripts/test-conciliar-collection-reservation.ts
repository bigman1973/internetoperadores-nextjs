/* G1 reservas de cobro: fixtures sintéticas puras. Sin BD, Prisma, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planCollectionDocumentReservations,
  type CollectionDocumentReservation,
  type CollectionReservationProposal,
} from '../lib/finanzas/conciliar-collection-reservation'

function exact(overrides: Partial<CollectionReservationProposal> = {}): CollectionReservationProposal {
  return {
    proposalKey: 'proposal-a', movementKey: 'movement-a', projection: 'BANK_MOVEMENT', state: 'ACTIVE', quote: 'EXACT',
    quotedAmountCents: 12000, bankAmountCents: 12000,
    composition: [{ documentKey: 'document-a', importeCentimos: 12000 }],
    evidence: { documentEvidenceComplete: true, counterpartyEvidenceComplete: true },
    ...overrides,
  }
}

function amber(overrides: Partial<CollectionReservationProposal> = {}): CollectionReservationProposal {
  return {
    proposalKey: 'proposal-amber', movementKey: 'movement-amber', projection: 'BANK_MOVEMENT', state: 'ACTIVE', quote: 'AMBER',
    quotedAmountCents: 12000, bankAmountCents: 12000,
    composition: [{ documentKey: 'document-amber', importeCentimos: 12000 }],
    evidence: { documentEvidenceComplete: false, counterpartyEvidenceComplete: false },
    ...overrides,
  }
}

function reviewFor(plan: ReturnType<typeof planCollectionDocumentReservations>, proposalKey: string) {
  const review = plan.review.find(item => item.proposalKey === proposalKey)
  assert.ok(review, `missing review for ${proposalKey}`)
  return review
}

test('selecciona una exacta con documento, contraparte e importe completos y nunca reserva el espejo EMITIDAS', () => {
  const bank = exact()
  const issuedMirror = exact({ projection: 'ISSUED_MIRROR', movementKey: 'issued-copy' })
  const plan = planCollectionDocumentReservations({ proposals: [issuedMirror, bank] })
  assert.deepEqual(plan.selected, [{
    proposalKey: 'proposal-a', movementKey: 'movement-a', quote: 'EXACT', documentKeys: ['document-a'], compositionTotalCents: 12000, disposition: 'NEW',
  }])
  assert.equal(plan.ignoredIssuedMirrors, 1)
  assert.equal(plan.review.length, 0)
})

test('preserva una remesa 1:N íntegra y suma todas sus facturas, sin crear una composición sintética', () => {
  const proposal = exact({
    proposalKey: 'proposal-remittance', movementKey: 'movement-remittance', quotedAmountCents: 30000, bankAmountCents: 30000,
    composition: [
      { documentKey: 'document-r1', importeCentimos: 9000 },
      { documentKey: 'document-r2', importeCentimos: 11000 },
      { documentKey: 'document-r3', importeCentimos: 10000 },
    ],
  })
  const plan = planCollectionDocumentReservations({ proposals: [proposal] })
  assert.deepEqual(plan.selected[0]?.documentKeys, ['document-r1', 'document-r2', 'document-r3'])
  assert.equal(plan.selected[0]?.compositionTotalCents, 30000)
  assert.equal(plan.review.length, 0)
})

test('dos movimientos exactos que reclaman el mismo documento quedan ambos en revisión y ninguno se decide por UUID u orden', () => {
  const first = exact({ proposalKey: 'proposal-first', movementKey: 'movement-first' })
  const second = exact({ proposalKey: 'proposal-second', movementKey: 'movement-second' })
  const forward = planCollectionDocumentReservations({ proposals: [first, second] })
  const reverse = planCollectionDocumentReservations({ proposals: [second, first] })
  for (const plan of [forward, reverse]) {
    assert.equal(plan.selected.length, 0)
    assert.deepEqual(plan.review.map(item => item.proposalKey), ['proposal-first', 'proposal-second'])
    assert.ok(plan.issueCodes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
    assert.ok(reviewFor(plan, 'proposal-first').codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
    assert.ok(reviewFor(plan, 'proposal-second').codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
  }
  assert.deepEqual(forward, reverse)
})

test('una prueba documental canónica única conserva todas sus FI frente a reclamaciones exactas ordinarias, sin método, importe o orden como excepción', () => {
  const canonical = exact({
    proposalKey: 'proposal-canonical', movementKey: 'movement-canonical', quotedAmountCents: 30000, bankAmountCents: 30000,
    composition: [
      { documentKey: 'document-c1', importeCentimos: 10000 },
      { documentKey: 'document-c2', importeCentimos: 10000 },
      { documentKey: 'document-c3', importeCentimos: 10000 },
    ],
    evidence: { documentEvidenceComplete: true, counterpartyEvidenceComplete: true, canonicalDocumentIdentityComplete: true },
  })
  const ordinaryFirst = exact({ proposalKey: 'proposal-ordinary-first', movementKey: 'movement-ordinary-first', composition: [{ documentKey: 'document-c1', importeCentimos: 12000 }] })
  const ordinarySecond = exact({ proposalKey: 'proposal-ordinary-second', movementKey: 'movement-ordinary-second', composition: [{ documentKey: 'document-c3', importeCentimos: 12000 }] })
  const forward = planCollectionDocumentReservations({ proposals: [canonical, ordinaryFirst, ordinarySecond] })
  const reverse = planCollectionDocumentReservations({ proposals: [ordinarySecond, canonical, ordinaryFirst] })
  for (const plan of [forward, reverse]) {
    assert.deepEqual(plan.selected.map(item => item.proposalKey), ['proposal-canonical'])
    assert.deepEqual(plan.selected[0]?.documentKeys, ['document-c1', 'document-c2', 'document-c3'])
    for (const proposalKey of ['proposal-ordinary-first', 'proposal-ordinary-second']) {
      assert.ok(reviewFor(plan, proposalKey).codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
    }
  }
  assert.deepEqual(forward, reverse)
})

test('dos pruebas canónicas que comparten FI siguen en revisión: la prioridad jamás desempata evidencia igual', () => {
  const first = exact({
    proposalKey: 'proposal-canonical-first', movementKey: 'movement-canonical-first',
    evidence: { documentEvidenceComplete: true, counterpartyEvidenceComplete: true, canonicalDocumentIdentityComplete: true },
  })
  const second = exact({
    proposalKey: 'proposal-canonical-second', movementKey: 'movement-canonical-second',
    evidence: { documentEvidenceComplete: true, counterpartyEvidenceComplete: true, canonicalDocumentIdentityComplete: true },
  })
  const plan = planCollectionDocumentReservations({ proposals: [second, first] })
  assert.equal(plan.selected.length, 0)
  assert.ok(reviewFor(plan, 'proposal-canonical-first').codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
  assert.ok(reviewFor(plan, 'proposal-canonical-second').codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
})

test('una identidad canónica incompleta no gana prioridad y el conflicto queda cerrado', () => {
  const incomplete = exact({
    proposalKey: 'proposal-incomplete-identity', movementKey: 'movement-incomplete-identity',
    evidence: { documentEvidenceComplete: true, counterpartyEvidenceComplete: true, canonicalDocumentIdentityComplete: false },
  })
  const ordinary = exact({ proposalKey: 'proposal-ordinary-identity', movementKey: 'movement-ordinary-identity' })
  const plan = planCollectionDocumentReservations({ proposals: [incomplete, ordinary] })
  assert.equal(plan.selected.length, 0)
  assert.ok(reviewFor(plan, 'proposal-incomplete-identity').codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
  assert.ok(reviewFor(plan, 'proposal-ordinary-identity').codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
})

test('un empate de exactas dentro del mismo movimiento falla cerrado y no usa proposalKey como desempate', () => {
  const left = exact({ proposalKey: 'proposal-left' })
  const right = exact({ proposalKey: 'proposal-right', composition: [{ documentKey: 'document-b', importeCentimos: 12000 }] })
  const plan = planCollectionDocumentReservations({ proposals: [right, left] })
  assert.equal(plan.selected.length, 0)
  assert.ok(reviewFor(plan, 'proposal-left').codes.includes('EXACT_TIE_FAIL_CLOSED'))
  assert.ok(reviewFor(plan, 'proposal-right').codes.includes('EXACT_TIE_FAIL_CLOSED'))
})

test('una exacta inválida por suma o importe de banco nunca se selecciona y publica el código G1 exacto', () => {
  const invalid = exact({ quotedAmountCents: 11999 })
  const plan = planCollectionDocumentReservations({ proposals: [invalid] })
  assert.equal(plan.selected.length, 0)
  assert.ok(reviewFor(plan, 'proposal-a').codes.includes('G1_EXACT_QUOTE_INVALID'))
  assert.ok(plan.issueCodes.includes('G1_EXACT_QUOTE_INVALID'))
})

test('una composición con clave 0, nula o repetida no se convierte en documento ficticio', () => {
  const zero = exact({ proposalKey: 'proposal-zero', composition: [{ documentKey: '0', importeCentimos: 12000 }] })
  const absent = exact({ proposalKey: 'proposal-absent', composition: [{ documentKey: null, importeCentimos: 12000 }] })
  const repeated = exact({
    proposalKey: 'proposal-duplicate-line', quotedAmountCents: 12000, bankAmountCents: 12000,
    composition: [{ documentKey: 'document-repeat', importeCentimos: 6000 }, { documentKey: 'document-repeat', importeCentimos: 6000 }],
  })
  const plan = planCollectionDocumentReservations({ proposals: [zero, absent, repeated] })
  assert.equal(plan.selected.length, 0)
  for (const proposalKey of ['proposal-zero', 'proposal-absent', 'proposal-duplicate-line']) {
    assert.ok(reviewFor(plan, proposalKey).codes.includes('G1_PROPOSAL_SHAPE_INVALID'))
  }
})

test('la propuesta ámbar nunca consume ni desplaza una exacta que comparte factura', () => {
  const green = exact()
  const review = amber({ composition: [{ documentKey: 'document-a', importeCentimos: 12000 }] })
  const plan = planCollectionDocumentReservations({ proposals: [review, green] })
  assert.deepEqual(plan.selected.map(item => item.proposalKey), ['proposal-a'])
  const amberReview = reviewFor(plan, 'proposal-amber')
  assert.ok(amberReview.codes.includes('AMBER_REVIEW_ONLY'))
  assert.ok(amberReview.codes.includes('AMBER_CANNOT_CONSUME_EXACT'))
  assert.ok(amberReview.codes.includes('G1_DOCUMENT_REUSED_ACROSS_BANK_MOVEMENTS'))
})

test('una reserva actual de otra propuesta bloquea la exacta; una reserva idéntica se conserva sin reescribirla', () => {
  const other: CollectionDocumentReservation = { documentKey: 'document-a', proposalKey: 'proposal-other', movementKey: 'movement-other', status: 'ACTIVE' }
  const blocked = planCollectionDocumentReservations({ proposals: [exact()], reservations: [other] })
  assert.equal(blocked.selected.length, 0)
  assert.ok(reviewFor(blocked, 'proposal-a').codes.includes('DOCUMENT_ALREADY_RESERVED'))

  const own: CollectionDocumentReservation = { documentKey: 'document-a', proposalKey: 'proposal-a', movementKey: 'movement-a', status: 'ACTIVE' }
  const kept = planCollectionDocumentReservations({ proposals: [exact()], reservations: [own] })
  assert.equal(kept.selected[0]?.disposition, 'KEEP')
})

test('las propuestas históricas o confirmadas y las reservas históricas se preservan sin mutación ni nueva asignación', () => {
  const historical = exact({ proposalKey: 'proposal-history', state: 'HISTORICAL' })
  const confirmed = exact({ proposalKey: 'proposal-confirmed', movementKey: 'movement-confirmed', state: 'CONFIRMED' })
  const plan = planCollectionDocumentReservations({
    proposals: [historical, confirmed, exact()],
    reservations: [{ documentKey: 'document-old', proposalKey: 'proposal-history', movementKey: 'movement-history', status: 'HISTORICAL' }],
  })
  assert.deepEqual(plan.selected.map(item => item.proposalKey), ['proposal-a'])
  assert.deepEqual(plan.preservedProposals, [
    { proposalKey: 'proposal-history', movementKey: 'movement-a', state: 'HISTORICAL' },
    { proposalKey: 'proposal-confirmed', movementKey: 'movement-confirmed', state: 'CONFIRMED' },
  ])
  assert.equal(plan.preservedReservationCount, 1)
})

test('evidencia documental o de contraparte incompleta no se transforma en verde por ausencia de una mejor candidata', () => {
  const incomplete = exact({ evidence: { documentEvidenceComplete: true, counterpartyEvidenceComplete: false } })
  const plan = planCollectionDocumentReservations({ proposals: [incomplete] })
  assert.equal(plan.selected.length, 0)
  assert.ok(reviewFor(plan, 'proposal-a').codes.includes('EXACT_EVIDENCE_INCOMPLETE'))
})

test('una propuesta activa reutilizada entre movimientos se invalida aun cuando no comparta documento en la entrada defectuosa', () => {
  const first = exact({ proposalKey: 'proposal-shared', movementKey: 'movement-1' })
  const second = exact({ proposalKey: 'proposal-shared', movementKey: 'movement-2', composition: [{ documentKey: 'document-b', importeCentimos: 12000 }] })
  const plan = planCollectionDocumentReservations({ proposals: [first, second] })
  assert.equal(plan.selected.length, 0)
  assert.ok(reviewFor(plan, 'proposal-shared').codes.includes('G1_PROPOSAL_REUSED_ACROSS_BANK_MOVEMENTS'))
  assert.ok(plan.issueCodes.includes('G1_PROPOSAL_REUSED_ACROSS_BANK_MOVEMENTS'))
})

console.log('OK: G1 reserva exacta determinista, 1:N, ámbar de sólo revisión, sin documentos ficticios ni mutación de B4/BD.')
