import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AREA3_ONEDRIVE_SOURCE,
  AREA3_PANEL_RECEIVED_SOURCE,
  area3MetadataOnlySeed,
  containsUniqueLiteralReference,
  decideArea3ReceivedCreditProposal,
  decideArea3ReceivedCreditProposals,
  literalReferenceOccurrences,
  receivedIdentityForArea3,
  type Area3ReceivedSource,
} from '../lib/finanzas/area3-credit-proposals-core'

const IDS = {
  original: '11111111-1111-4111-8111-111111111111',
  credit: '22222222-2222-4222-8222-222222222222',
  extra: '33333333-3333-4333-8333-333333333333',
}
function invoice(overrides: Partial<Area3ReceivedSource> = {}): Area3ReceivedSource {
  return {
    invoiceId: IDS.original,
    eligibleForProposal: true,
    provider: 'Proveedor Sintético, S.L.',
    cif: 'B-123.45678',
    documentReference: 'ORIG/2026-001',
    documentDate: '2026-10-01',
    totalCents: 12_040,
    ocrText: 'Factura ordinaria',
    oneDriveDriveId: null,
    oneDriveItemId: 'item-will-not-be-used',
    currencyCode: 'EUR',
    ...overrides,
  }
}
function credit(overrides: Partial<Area3ReceivedSource> = {}): Area3ReceivedSource {
  return invoice({
    invoiceId: IDS.credit,
    documentReference: 'RECT/2026-001',
    documentDate: '2026-10-02',
    totalCents: -12_040,
    ocrText: 'Factura rectificativa; rectifica la factura ORIG/2026-001.',
    ...overrides,
  })
}

test('literal exacto exige una sola aparición con frontera documental', () => {
  assert.equal(literalReferenceOccurrences('Abono ORIG/2026-001.', 'ORIG/2026-001'), 1)
  assert.equal(containsUniqueLiteralReference('Abono ORIG/2026-001.', 'ORIG/2026-001'), true)
  assert.equal(containsUniqueLiteralReference('ORIG/2026-001 y ORIG/2026-001', 'ORIG/2026-001'), false)
  assert.equal(containsUniqueLiteralReference('XORIG/2026-001Y', 'ORIG/2026-001'), false)
})

test('abono negativo con proveedor exacto, CIF normalizado y referencia literal única se propone sin usar el importe para buscar', () => {
  const original = invoice()
  const candidate = credit({ totalCents: -12_040 })
  const decision = decideArea3ReceivedCreditProposal(candidate, [original, candidate])
  assert.equal(decision.kind, 'PROPOSE')
  if (decision.kind !== 'PROPOSE') throw new Error('fixture')
  assert.equal(decision.exactReference, original.documentReference)
  assert.equal(decision.proposedReductionCents, -12_040)
  assert.equal(decision.creditIdentity.source, AREA3_PANEL_RECEIVED_SOURCE)
  assert.equal(decision.originalIdentity.sourceItemKey, IDS.original)

  // A partial credit chooses exactly the same original because of the literal text,
  // not because of an equal total.
  const partial = credit({ totalCents: -3_001 })
  const partialDecision = decideArea3ReceivedCreditProposal(partial, [original, partial])
  assert.equal(partialDecision.kind, 'PROPOSE')
})

test('la ausencia de moneda explícita no se convierte en EUR: conserva propuesta documental y semilla null para que B5 no liquide', () => {
  const original = invoice({ currencyCode: null, documentReference: '260/12730', totalCents: 12_040 })
  const candidate = credit({
    currencyCode: null,
    documentReference: '260/13437',
    totalCents: -12_040,
    ocrText: 'Rectificación de las facturas: 260/12730',
  })
  const decision = decideArea3ReceivedCreditProposal(candidate, [original, candidate])
  assert.equal(decision.kind, 'PROPOSE')
  assert.equal(area3MetadataOnlySeed(candidate, 'CREDIT', '260/12730')?.currencyCode, null)
  assert.equal(area3MetadataOnlySeed(original, 'ORIGINAL', null)?.currencyCode, null)
})

test('moneda explícita sólo admite igualdad exacta y una identidad fiscal proyectada debe coincidir con claveCanonicaFactura', () => {
  const original = invoice({ invoiceFiscalIdentity: 'CIF:B12345678|NUM:ORIG/2026-001', currencyCode: 'EUR' })
  const candidate = credit({ invoiceFiscalIdentity: 'CIF:B12345678|NUM:RECT/2026-001', currencyCode: 'USD' })
  assert.deepEqual(
    decideArea3ReceivedCreditProposal(candidate, [original, candidate]),
    { kind: 'REVIEW', credit: candidate, reason: 'METADATOS_DOCUMENTALES_INCOMPLETOS' },
  )

  const incompatibleFiscal = credit({ invoiceFiscalIdentity: 'CIF:B12345678|NUM:OTRA-REFERENCIA' })
  assert.deepEqual(
    decideArea3ReceivedCreditProposal(incompatibleFiscal, [original, incompatibleFiscal]),
    { kind: 'REVIEW', credit: incompatibleFiscal, reason: 'METADATOS_DOCUMENTALES_INCOMPLETOS' },
  )
})

test('referencia ausente, repetida o a dos originales queda en revisión', () => {
  const original = invoice()
  assert.deepEqual(decideArea3ReceivedCreditProposal(credit({ ocrText: 'Abono sin número original' }), [original]), {
    kind: 'REVIEW', credit: credit({ ocrText: 'Abono sin número original' }), reason: 'REFERENCIA_ORIGINAL_AUSENTE',
  })
  assert.equal(decideArea3ReceivedCreditProposal(credit({ ocrText: 'ORIG/2026-001; ORIG/2026-001' }), [original]).kind, 'REVIEW')
  const second = invoice({ invoiceId: IDS.extra, documentReference: 'ORIG/2026-002', totalCents: 777, ocrText: null })
  const ambiguous = credit({ ocrText: 'Rectificativa ORIG/2026-001 y ORIG/2026-002' })
  const decision = decideArea3ReceivedCreditProposal(ambiguous, [original, second, ambiguous])
  assert.deepEqual([decision.kind, decision.kind === 'REVIEW' ? decision.reason : null], ['REVIEW', 'REFERENCIA_ORIGINAL_AMBIGUA'])
})

test('un original de otro proveedor, CIF distinto o revisión nunca recibe enlace', () => {
  const candidate = credit()
  for (const bad of [
    invoice({ provider: 'Otro proveedor, S.L.' }),
    invoice({ cif: 'B-87654321' }),
    invoice({ eligibleForProposal: false }),
  ]) {
    const decision = decideArea3ReceivedCreditProposal(candidate, [bad, candidate])
    assert.equal(decision.kind, 'REVIEW')
  }
  const crossSupplier = decideArea3ReceivedCreditProposal(candidate, [invoice({ provider: 'Otro proveedor, S.L.' }), candidate])
  assert.deepEqual([crossSupplier.kind, crossSupplier.kind === 'REVIEW' ? crossSupplier.reason : null], ['REVIEW', 'PROVEEDOR_NO_COINCIDE_EXACTAMENTE'])
})

test('texto rectificativa con signo no negativo se revisa; una factura ordinaria no se candidata', () => {
  assert.deepEqual(
    decideArea3ReceivedCreditProposal(credit({ totalCents: 12_040 }), [invoice()]),
    { kind: 'REVIEW', credit: credit({ totalCents: 12_040 }), reason: 'SIGNO_RECTIFICATIVA_INVALIDO' },
  )
  assert.deepEqual(decideArea3ReceivedCreditProposals([invoice()]), [])
})

test('la identidad OneDrive sólo se usa cuando drive e item existen; sin drive usa PANEL_RECEIVED UUID real y jamás lo fabrica', () => {
  const oneDrive = invoice({ oneDriveDriveId: 'drive-synthetic', oneDriveItemId: 'item-synthetic' })
  assert.deepEqual(receivedIdentityForArea3(oneDrive), { source: AREA3_ONEDRIVE_SOURCE, sourceItemKey: 'drive-synthetic:item-synthetic' })
  assert.deepEqual(receivedIdentityForArea3(invoice()), { source: AREA3_PANEL_RECEIVED_SOURCE, sourceItemKey: IDS.original })
  assert.equal(receivedIdentityForArea3(invoice({ invoiceId: 'not-a-real-uuid', oneDriveDriveId: null, oneDriveItemId: 'item' })), null)
})

test('semilla metadata-only conserva campos OCR ya almacenados, pero no crea hash de contenido, bytes ni artefacto', () => {
  const seed = area3MetadataOnlySeed(credit(), 'CREDIT', 'ORIG/2026-001')
  assert.deepEqual(seed, {
    documentNumber: 'RECT/2026-001', documentDate: '2026-10-02', totalCents: -12_040,
    invoiceFiscalIdentity: 'CIF:B12345678|NUM:RECT/2026-001', partyRole: 'PROVEEDOR',
    documentClass: 'FACTURA_RECTIFICATIVA', referencedOriginalReference: 'ORIG/2026-001', currencyCode: 'EUR',
  })
  assert.equal(area3MetadataOnlySeed(credit({ cif: null }), 'CREDIT', 'ORIG/2026-001'), null)
})

console.log('OK: Area 3c pure tests use only synthetic received rows; no DB, Graph, OCR, HTTP, B4 or human confirmation.')
