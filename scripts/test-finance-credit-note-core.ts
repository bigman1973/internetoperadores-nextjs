import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateCreditNoteSettlements,
  type CanonicalCreditNoteDocument,
  type CreditNoteB4PaymentEvidence,
  type CreditNoteVersionLink,
} from '../lib/finanzas/finance-credit-note-core'
import { calculateCreditNotesFromCanonicalReaders } from '../lib/finanzas/finance-credit-note-readers'

function original(overrides: Partial<CanonicalCreditNoteDocument> = {}): CanonicalCreditNoteDocument {
  return {
    documentId: 'original-a', canonicalIdentity: 'canonical-original-a', currentVersionId: 'version-original-a',
    kind: 'EMITIDA', partyRole: 'CLIENTE', documentReference: 'SER/2026/001', referencedOriginalReference: null,
    counterpartyFiscalIdentity: 'FISCAL-CLIENTE-A', counterpartyCanonicalIdentity: 'CLIENTE-A',
    signedTotalCents: 10_000, currencyCode: 'EUR', canonicalCurrent: true, ...overrides,
  }
}
function credit(overrides: Partial<CanonicalCreditNoteDocument> = {}): CanonicalCreditNoteDocument {
  return {
    documentId: 'rectificativa-a', canonicalIdentity: 'canonical-rectificativa-a', currentVersionId: 'version-rectificativa-a',
    kind: 'EMITIDA', partyRole: 'CLIENTE', documentReference: 'R-SER/2026/001', referencedOriginalReference: 'SER/2026/001',
    counterpartyFiscalIdentity: 'FISCAL-CLIENTE-A', counterpartyCanonicalIdentity: 'CLIENTE-A',
    signedTotalCents: -2_000, currencyCode: 'EUR', canonicalCurrent: true, ...overrides,
  }
}
function link(overrides: Partial<CreditNoteVersionLink> = {}): CreditNoteVersionLink {
  return {
    linkId: 'link-a', originalDocumentId: 'original-a', creditNoteDocumentId: 'rectificativa-a',
    originalVersionId: 'version-original-a', creditNoteVersionId: 'version-rectificativa-a',
    originalCanonicalIdentity: 'canonical-original-a', creditNoteCanonicalIdentity: 'canonical-rectificativa-a',
    originalDocumentReference: 'SER/2026/001', referencedOriginalReference: 'SER/2026/001',
    counterpartyFiscalIdentity: 'FISCAL-CLIENTE-A', counterpartyCanonicalIdentity: 'CLIENTE-A', current: true, deleted: false,
    ...overrides,
  }
}
function payment(overrides: Partial<CreditNoteB4PaymentEvidence> = {}): CreditNoteB4PaymentEvidence {
  return {
    evidenceId: 'b4-a', originalDocumentId: 'original-a', signedCents: 3_000, currencyCode: 'EUR',
    active: true, documentActive: true, operationApplied: true, operationReverted: false,
    movementJustified: true, physicalClosureExact: true, ...overrides,
  }
}
function settle(overrides: Partial<Parameters<typeof calculateCreditNoteSettlements>[0]> = {}) {
  return calculateCreditNoteSettlements({ originals: [original()], creditNotes: [credit()], versionLinks: [link()], b4Payments: [], ...overrides })
}

test('rectificativa total exacta cierra la original sin crear pago B4', () => {
  const result = settle({ creditNotes: [credit({ signedTotalCents: -10_000 })] })
  assert.deepEqual(result.settlements[0], {
    originalDocumentId: 'original-a', kind: 'EMITIDA', currencyCode: 'EUR', originalCents: 10_000,
    validRectificationCents: 10_000, validB4PaymentCents: 0, pendingCents: 0,
    state: 'CERRADA', reviewReasons: [],
  })
})

test('rectificativa parcial y cobro B4 conservan céntimos y fórmula original menos rectificación menos B4', () => {
  const result = settle({ b4Payments: [payment()] })
  const row = result.settlements[0]
  assert.deepEqual([row.validRectificationCents, row.validB4PaymentCents, row.pendingCents, row.state], [2_000, 3_000, 5_000, 'PARCIAL'])
})

test('sin pago B4, el pendiente es exactamente original menos rectificativa válida', () => {
  const row = settle().settlements[0]
  assert.deepEqual([row.pendingCents, row.validB4PaymentCents, row.state], [8_000, 0, 'PARCIAL'])
})

test('una rectificativa repetida no acredita dos veces y obliga revisión', () => {
  const result = settle({ versionLinks: [link(), link({ linkId: 'link-b' })] })
  const row = result.settlements[0]
  assert.deepEqual([row.state, row.validRectificationCents, row.pendingCents], ['REVISION', null, null])
  assert.ok(row.reviewReasons.includes('RECTIFICATIVA_REPETIDA_O_MULTIENLAZADA'))
})

test('dos versiones o copias con la misma identidad canónica de rectificativa no se descuentan una sola vez arbitrariamente', () => {
  const repeatedIdentity = credit({ documentId: 'rectificativa-copia', currentVersionId: 'version-rectificativa-copia' })
  const row = settle({ creditNotes: [credit(), repeatedIdentity] }).settlements[0]
  assert.deepEqual([row.state, row.validRectificationCents, row.pendingCents], ['REVISION', null, null])
  assert.ok(row.reviewReasons.includes('RECTIFICATIVA_IDENTIDAD_CANONICA_AMBIGUA'))
})

test('signo erróneo de rectificativa se rechaza sin usar abs ni inventar crédito', () => {
  const row = settle({ creditNotes: [credit({ signedTotalCents: 2_000 })] }).settlements[0]
  assert.equal(row.state, 'REVISION')
  assert.ok(row.reviewReasons.includes('RECTIFICATIVA_CON_SIGNO_INCORRECTO'))
})

test('original documentalmente ambigua nunca se desempata por importe ni por el enlace', () => {
  const second = original({ documentId: 'original-b', canonicalIdentity: 'canonical-original-b', currentVersionId: 'version-original-b' })
  const result = settle({ originals: [original(), second] })
  assert.ok(result.settlements.every((row) => row.state === 'REVISION'))
  assert.ok(result.settlements.every((row) => row.reviewReasons.includes('ORIGINAL_DOCUMENTAL_AMBIGUO')))
})

test('moneda distinta se envía a revisión; no hay conversión ni compensación implícita', () => {
  const row = settle({ creditNotes: [credit({ currencyCode: 'USD' })] }).settlements[0]
  assert.equal(row.state, 'REVISION')
  assert.ok(row.reviewReasons.includes('REFERENCIA_FISCAL_CONTRAPARTE_O_IDENTIDAD_NO_COINCIDE_EXACTAMENTE'))
})

test('rectificación superior al original y B4 por encima del pendiente quedan en revisión', () => {
  const excessiveCredit = settle({ creditNotes: [credit({ signedTotalCents: -10_001 })] }).settlements[0]
  assert.equal(excessiveCredit.state, 'REVISION')
  assert.ok(excessiveCredit.reviewReasons.includes('RECTIFICACION_SUPERA_ORIGINAL'))

  const excessiveB4 = settle({ b4Payments: [payment({ signedCents: 9_000 })] }).settlements[0]
  assert.equal(excessiveB4.state, 'REVISION')
  assert.ok(excessiveB4.reviewReasons.includes('PAGO_B4_SUPERA_PENDIENTE'))
})

test('emitidas y recibidas llegan por lectores canónicos distintos y la recibida conserva signo negativo', () => {
  const receivedOriginal = original({
    documentId: 'received-original', canonicalIdentity: 'received-original-key', currentVersionId: 'received-version',
    kind: 'RECIBIDA', partyRole: 'PROVEEDOR', documentReference: 'PROV/2026/001',
    counterpartyFiscalIdentity: 'FISCAL-PROVEEDOR-A', counterpartyCanonicalIdentity: 'PROVEEDOR-A', signedTotalCents: -10_000,
  })
  const receivedCredit = credit({
    documentId: 'received-credit', canonicalIdentity: 'received-credit-key', currentVersionId: 'received-credit-version',
    kind: 'RECIBIDA', partyRole: 'PROVEEDOR', documentReference: 'R-PROV/2026/001', referencedOriginalReference: 'PROV/2026/001',
    counterpartyFiscalIdentity: 'FISCAL-PROVEEDOR-A', counterpartyCanonicalIdentity: 'PROVEEDOR-A', signedTotalCents: 2_000,
  })
  const receivedLink = link({
    originalDocumentId: 'received-original', creditNoteDocumentId: 'received-credit', originalVersionId: 'received-version', creditNoteVersionId: 'received-credit-version',
    originalCanonicalIdentity: 'received-original-key', creditNoteCanonicalIdentity: 'received-credit-key',
    originalDocumentReference: 'PROV/2026/001', referencedOriginalReference: 'PROV/2026/001',
    counterpartyFiscalIdentity: 'FISCAL-PROVEEDOR-A', counterpartyCanonicalIdentity: 'PROVEEDOR-A',
  })
  const result = calculateCreditNotesFromCanonicalReaders({
    issued: { kind: 'EMITIDA', readCanonicalOriginals: () => [], readCanonicalCreditNotes: () => [] },
    received: { kind: 'RECIBIDA', readCanonicalOriginals: () => [receivedOriginal], readCanonicalCreditNotes: () => [receivedCredit] },
    versions: { readCurrentCreditNoteLinks: () => [receivedLink] },
    b4: { readCurrentCreditNoteB4Payments: () => [payment({ evidenceId: 'received-b4', originalDocumentId: 'received-original', signedCents: -3_000 })] },
  })
  assert.deepEqual(result.settlements[0] && [result.settlements[0].validRectificationCents, result.settlements[0].validB4PaymentCents, result.settlements[0].pendingCents, result.settlements[0].state], [-2_000, -3_000, -5_000, 'PARCIAL'])
})

test('B4 no vigente no se confirma ni se usa como pago automático', () => {
  const row = settle({ b4Payments: [payment({ operationReverted: true })] }).settlements[0]
  assert.deepEqual([row.state, row.validB4PaymentCents, row.pendingCents], ['REVISION', null, null])
  assert.ok(row.reviewReasons.includes('EVIDENCIA_B4_NO_VIGENTE_O_INEXACTA'))
})
