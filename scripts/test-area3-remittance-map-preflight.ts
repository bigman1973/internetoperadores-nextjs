/* Área 3 / G7: puro, sin BD, red, build ni mutaciones. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  area3RemittanceMapAmberReason,
  area3RemittanceMapProposalFromRaw,
  evaluateArea3RemittanceMapPreflight,
  type Area3RemittanceMapEvidence,
  type Area3RemittanceMapProposal,
} from '../lib/finanzas/area3-remittance-map-core'

const GENERATION = '11111111-1111-4111-8111-111111111111'
const PROPOSAL_A = '22222222-2222-4222-8222-222222222222'
const PROPOSAL_B = '33333333-3333-4333-8333-333333333333'
const FI_A = '44444444-4444-4444-8444-444444444444'
const FI_B = '55555555-5555-4555-8555-555555555555'

function proposal(propuestaId: string, ids: readonly string[]): Area3RemittanceMapProposal {
  const raw = area3RemittanceMapProposalFromRaw({
    propuestaId,
    generacionId: GENERATION,
    metodo: 'REMESA_VENCIMIENTO',
    lineas: [{ tipo: 'DOCUMENTO', tipoDocumento: 'REMESA', sourceId: '9', importeCentimos: ids.length * 10_000 }],
    composicion: ids.map(facturaEmitidaId => ({ facturaEmitidaId, importeCentimos: 10_000 })),
  })
  assert(raw, 'la propuesta sintética completa debe ser válida')
  return raw
}

function evidence(facturaEmitidaId: string, overrides: Partial<Area3RemittanceMapEvidence> = {}): Area3RemittanceMapEvidence {
  return {
    facturaEmitidaId,
    facturaISPId: facturaEmitidaId === FI_A ? 101 : 102,
    facturaISPGestionId: facturaEmitidaId === FI_A ? 901 : 902,
    remesaId: 9,
    identityAuditPresent: true,
    facturaEmitidaOrigenSistema: 'ISPGestion',
    facturaEmitidaRemoteId: facturaEmitidaId === FI_A ? '901' : '902',
    facturaEmitidaNumero: facturaEmitidaId === FI_A ? 'R-001' : 'R-002',
    facturaISPNumero: facturaEmitidaId === FI_A ? 'r-001' : 'r-002',
    facturaEmitidaSerie: 'REM',
    facturaISPSerie: 'rem',
    facturaEmitidaCliente: facturaEmitidaId === FI_A ? 'Cliente Uno, S.L.' : 'Cliente Dos, S.L.',
    facturaISPCliente: facturaEmitidaId === FI_A ? 'cliente uno, s.l.' : 'cliente dos, s.l.',
    facturaEmitidaCif: 'B12345678',
    facturaISPCif: 'b12345678',
    ...overrides,
  }
}

function between(source: string, start: string, end: string): string {
  const left = source.indexOf(start)
  const right = source.indexOf(end, left + start.length)
  assert.ok(left >= 0 && right > left, `no se halló el bloque ${start}`)
  return source.slice(left, right)
}

test('G7 acepta sólo mapas FI→ISP→remesa completos con identidad importada corroborada', () => {
  const result = evaluateArea3RemittanceMapPreflight([proposal(PROPOSAL_A, [FI_A, FI_B])], [evidence(FI_A), evidence(FI_B)])
  assert.equal(result.complete, true)
  assert.equal(result.missingReceiptCount, 0)
  assert.equal(result.expectedReceiptCount, 2)
  assert.match(result.proposalSetHash ?? '', /^[a-f0-9]{64}$/)
})

test('G7 convierte en ámbar la FI sin mapa y conserva el motivo agregado llano', () => {
  const result = evaluateArea3RemittanceMapPreflight([proposal(PROPOSAL_A, [FI_A, FI_B])], [evidence(FI_A), evidence(FI_B, { facturaISPId: null })])
  assert.deepEqual({ complete: result.complete, missing: result.missingReceiptCount, expected: result.expectedReceiptCount }, { complete: false, missing: 1, expected: 2 })
  assert.equal(area3RemittanceMapAmberReason(result), 'Falta enlazar 1 recibos.')
})

test('G7 no sustituye el mapa por coincidencias: remoto, número, cliente, auditoría o remesa incorrectos fallan cerrados', () => {
  const cases: Array<Partial<Area3RemittanceMapEvidence>> = [
    { facturaEmitidaRemoteId: 'otra-remota' },
    { facturaISPNumero: 'numero-distinto' },
    { facturaISPCliente: 'cliente distinto' },
    { identityAuditPresent: false },
    { remesaId: 10 },
  ]
  for (const overrides of cases) {
    const result = evaluateArea3RemittanceMapPreflight([proposal(PROPOSAL_A, [FI_A])], [evidence(FI_A, overrides)])
    assert.equal(result.complete, false)
    assert.equal(result.missingReceiptCount, 1)
  }
})

test('G7 cubre todas las propuestas hermanas de remesa y permite la misma FI en abonos parciales', () => {
  const first = proposal(PROPOSAL_A, [FI_A])
  const second = proposal(PROPOSAL_B, [FI_A, FI_B])
  const result = evaluateArea3RemittanceMapPreflight([first, second], [evidence(FI_A), evidence(FI_B)])
  assert.equal(result.complete, true)
  assert.equal(result.expectedReceiptCount, 2)
  assert.match(result.proposalSetHash ?? '', /^[a-f0-9]{64}$/)
})

test('rebuild, delta y confirmación emplean el mismo helper externo y la confirmación corta antes de B4/B6/B7', () => {
  const db = readFileSync('lib/finanzas/conciliar-db.ts', 'utf8')
  const delta = readFileSync('lib/finanzas/conciliar-delta.ts', 'utf8')
  const actions = readFileSync('lib/finanzas/conciliar-actions.ts', 'utf8')
  assert.match(db, /readArea3RemittanceMapPreflightsTx/)
  assert.match(db, /lockArea3RemittanceMapPreflightsTx/)
  const rebuild = between(db, 'export async function rebuildConciliarProjectionTx', 'export async function rebuildConciliarProjection(')
  assert.match(rebuild, /readArea3RemittanceMapPreflightsTx\(tx, proposals\)/)
  const actionPreflight = between(db, 'export async function assertLiveCollectionProjectionForActionTx', 'export function proposalCompositionInvoiceIds')
  assert.match(actionPreflight, /lockArea3RemittanceMapPreflightsTx\(base,proposals\)/)
  assert.match(actionPreflight, /fail\(422, 'MAPA_FI_ISP_REMESA_INEXACTO'/)
  assert.match(actionPreflight, /area3RemittanceMapAmberReason\(remittanceMapPreflight\)/)
  assert.match(delta, /import \{ readArea3RemittanceMapPreflightsTx \} from '\.\/area3-remittance-map-db'/)
  assert.match(delta, /readArea3RemittanceMapPreflightsTx\(tx, proposals\)/)
  assert.doesNotMatch(delta, /function .*RemittanceMap|function .*remittanceMap/i)
  const confirm = between(actions, 'async function confirmCollectionProposal', 'async function confirmConfirming')
  assert.ok(confirm.indexOf('await assertLiveCollectionProjectionForActionTx(tx,row)') < confirm.indexOf('const receiptSource ='), 'el core preflight bloqueado debe correr antes de preparar la confirmación B7')
})

console.log('OK: G7 mapa FI–ISP–remesa compartido, corroborado y cerrado por defecto.')
