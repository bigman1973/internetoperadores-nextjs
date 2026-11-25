/* C4 activo: contrato puro de verde B7 exacto o ámbar con N real de preflight. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCase, type ConciliarReleaseRegressionCase, type ConciliarReleaseRegressionDataset } from './areas/conciliar/case-core'
import { area3RemittanceMapProposalFromRaw, evaluateArea3RemittanceMapPreflight } from '../lib/finanzas/area3-remittance-map-core'

const HASH = 'a'.repeat(64)
const source = { movementKey: 'synthetic-remittance', bankName: 'Synthetic Bank', accountKey: 'synthetic-account', bankDate: '2026-10-01', amountCents: 12_345, searchableText: 'synthetic remittance', counterpartyText: null, b4Confirmed: false }
const c4: ConciliarReleaseRegressionCase = {
  caseId: 'C4', mode: 'EXACT',
  selector: { bank: 'Synthetic Bank', date: '2026-10-01', signedCents: 12_345, searchTerms: ['synthetic'] },
  expect: { tab: 'COBROS', group: 'REMESAS', remittancePreflight: 'GREEN_EXACT_B7_OR_AMBER_MISSING_RECEIPTS' },
}
function projection(overrides: Record<string, unknown> = {}) {
  return {
    movementKey: 'synthetic-remittance', visible: true, tab: 'COBROS', color: 'VERDE', groupLabel: 'REMESAS', documentReference: null,
    reasonText: 'synthetic complete', differenceCents: 0, isParaPedir: false,
    remittanceComposition: { lineCount: 3, sumCents: 12_345, exact: true },
    remittanceMapPreflight: { complete: true, missingReceiptCount: 0, expectedReceiptCount: 3, proposalSetHash: HASH },
    ...overrides,
  }
}
function dataset(row: ReturnType<typeof projection>): ConciliarReleaseRegressionDataset { return { bankRows: [source], projectionRows: [row] } }
function realPreflightWithMissingReceipt() {
  const proposal = area3RemittanceMapProposalFromRaw({
    propuestaId: '11111111-1111-4111-8111-111111111111', generacionId: '22222222-2222-4222-8222-222222222222', metodo: 'REMESA_VENCIMIENTO',
    lineas: [{ tipo: 'DOCUMENTO', tipoDocumento: 'REMESA', sourceId: '9', importeCentimos: 12_345 }],
    composicion: [
      { facturaEmitidaId: '33333333-3333-4333-8333-333333333333', importeCentimos: 6_000 },
      { facturaEmitidaId: '44444444-4444-4444-8444-444444444444', importeCentimos: 6_345 },
    ],
  })
  assert.ok(proposal)
  const evidence = (facturaEmitidaId: string, facturaISPId: number | null) => ({
    facturaEmitidaId, facturaISPId, facturaISPGestionId: facturaISPId === null ? null : facturaISPId + 100,
    remesaId: 9, identityAuditPresent: true, facturaEmitidaOrigenSistema: 'ISPGestion', facturaEmitidaRemoteId: facturaISPId === null ? null : String(facturaISPId + 100),
    facturaEmitidaNumero: 'R-001', facturaISPNumero: 'r-001', facturaEmitidaSerie: 'REM', facturaISPSerie: 'rem',
    facturaEmitidaCliente: 'Cliente Uno, S.L.', facturaISPCliente: 'cliente uno, s.l.', facturaEmitidaCif: 'B12345678', facturaISPCif: 'b12345678',
  })
  return evaluateArea3RemittanceMapPreflight([proposal], [
    evidence('33333333-3333-4333-8333-333333333333', 1),
    evidence('44444444-4444-4444-8444-444444444444', null),
  ])
}

test('C4 green requires exact composition and the complete real-preflight evidence branch', () => {
  assert.equal(evaluateCase(c4, dataset(projection())).pass, true)
  assert.equal(evaluateCase(c4, dataset(projection({ remittanceComposition: { lineCount: 3, sumCents: 12_345, exact: false } }))).reasons.includes('REMESA_COMPOSITION_MISMATCH'), true)
  assert.equal(evaluateCase(c4, dataset(projection({ remittanceMapPreflight: { complete: false, missingReceiptCount: 1, expectedReceiptCount: 3, proposalSetHash: HASH } }))).reasons.includes('REMESA_COMPOSITION_MISMATCH'), true)
})

test('C4 amber carries exactly the N supplied by the server preflight and never a general amber allowance', () => {
  const realPreflight = realPreflightWithMissingReceipt()
  assert.equal(realPreflight.complete, false)
  const actualN = realPreflight.missingReceiptCount
  const amber = projection({
    color: 'AMBAR',
    reasonText: `Falta enlazar ${actualN} recibos.`,
    // Exactness is intentionally a green-only fact. The preflight, not a magic
    // number or amount, determines which amber explanatory branch is valid.
    remittanceComposition: { lineCount: 3, sumCents: 12_345, exact: false },
    remittanceMapPreflight: realPreflight,
  })
  assert.equal(evaluateCase(c4, dataset(amber)).pass, true)
  assert.equal(evaluateCase(c4, dataset({ ...amber, reasonText: 'Falta enlazar 3 recibos.' })).reasons.includes('REMESA_COMPOSITION_MISMATCH'), true)
  assert.equal(evaluateCase(c4, dataset({ ...amber, color: 'ROJO' })).reasons.includes('REMESA_COMPOSITION_MISMATCH'), true)
})

test('C4 rejects missing/malformed preflight evidence and does not use allowedColors as a bypass', () => {
  assert.equal(evaluateCase(c4, dataset(projection({ remittanceMapPreflight: null }))).reasons.includes('REMESA_COMPOSITION_MISSING'), true)
  const invalid: ConciliarReleaseRegressionCase = { ...c4, expect: { ...c4.expect, allowedColors: ['VERDE', 'AMBAR'] } }
  assert.deepEqual(evaluateCase(invalid, dataset(projection())).reasons, ['CASE_SPEC_INVALID'])
})

console.log('OK: C4 sólo permite VERDE exacto/B7 completo o ÁMBAR con el N del preflight actual.')
