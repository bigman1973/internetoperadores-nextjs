import assert from 'node:assert/strict'
import test from 'node:test'
import {
  B7_REMESA_RECEIPT_SCHEMA_VERSION,
  RemittancePaymentReceiptError,
  buildRemittanceReceiptPlan,
  parseReceiptComposition,
  receiptRequestHash,
} from '../lib/finanzas/remittance-payment-receipts-core'
 import { calculateBankInvoicing, type B4DocumentLineInput, type RemittancePaymentReceiptInput } from '../lib/finanzas/bank-invoicing-core'

const FI_A = '11111111-1111-4111-8111-111111111111'
const FI_B = '22222222-2222-4222-8222-222222222222'
const PROPOSAL_A = '33333333-3333-4333-8333-333333333333'
const GENERATION = '44444444-4444-4444-8444-444444444444'
const HASH = 'a'.repeat(64)

function errorCode(work: () => unknown): string | null {
  try { work() } catch (error) { return error instanceof RemittancePaymentReceiptError ? error.code : String(error) }
  return null
}
function source(id: string, isp: number, total = 10_000, fecha = '2026-10-01') {
  return {
    facturaEmitidaId: id, facturaISPId: isp, facturaISPGestionId: isp + 100,
    facturaEmitidaTotalCentimos: total, facturaEmitidaFecha: fecha,
    facturaISPTotalCentimos: total, facturaISPFecha: fecha, remesaId: 9,
  }
}
function proposal(composicion: unknown, amount = 10_000, fechaBanco = '2026-10-10') {
  return {
    propuestaId: PROPOSAL_A, generacionId: GENERATION, movimientoId: 'movimiento-remesa-a',
    metodo: 'REMESA_VENCIMIENTO', fingerprint: HASH, estadoPropuesto: 'JUSTIFICADO', nivel: 'EXACTA',
    importeMovimientoCentimos: amount, fechaBanco, versionB4: 1,
    lineas: [{ tipo: 'DOCUMENTO' as const, tipoDocumento: 'REMESA' as const, sourceId: '9', importeCentimos: amount }],
    composicion,
  }
}
function b4Line(id: string, cents: number, active = true) {
  return {
    lineId: id, movementId: `mov-${id}`, signedCents: cents, active, documentActive: active,
    documentKind: 'REMESA' as const, wrapperTargetCents: 20_000,
    operationApplied: active, operationReverted: !active, movementJustified: active,
    physicalBankCents: cents, sumAllActiveCents: cents, activeDocumentLineCount: 1, allActiveLinesApplied: active,
  }
}
function receipt(id: string, line: ReturnType<typeof b4Line>, invoiceId: string, facturaISPId: number, cents: number, bankDateISO = '2026-10-10') {
  return {
    receiptId: id, sourceHash: 'b'.repeat(64), proposalFingerprint: HASH, compositionHash: 'c'.repeat(64),
    snapshotSchemaValid: true, bankDateISO, b4Line: line,
    lines: [{ invoiceId, facturaISPId, cents, sourceHash: 'd'.repeat(64), snapshotSchemaValid: true }],
  }
}
function partialRemittance(receipts: RemittancePaymentReceiptInput[], bankLines: B4DocumentLineInput[]) {
  return {
    remittanceId: '9', sourceTotalText: '200.00', wrapperTargetCents: 20_000, wrapperActive: true, wrapperCount: 1,
    humanConfirmedAssociation: true, humanAssociationStale: false,
    members: [
      { facturaISPId: 1, invoiceId: 'a', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00', facturaISPFechaISO: '2026-10-01' },
      { facturaISPId: 2, invoiceId: 'b', facturaISPSourceTotalText: '100.00', facturaEmitidaSourceTotalText: '100.00', facturaISPFechaISO: '2026-10-01' },
    ],
    bankDocumentLines: bankLines, refunds: [], paymentReceipts: receipts,
  }
}
const invoice = (id: string, isp: number) => ({
  id, sourceTotalText: '100.00', b2Economic: true, numFactura: `F-${id}`, cliente: id,
  fechaISO: '2026-10-01', fechaVencimientoISO: null, facturaISPId: isp,
})

test('receipt planner aggregates only its explicit subset and two disjoint partial credits stay disjoint', () => {
  const first = buildRemittanceReceiptPlan(proposal([{ facturaEmitidaId: FI_A, importeCentimos: 4_000 }, { facturaEmitidaId: FI_A, importeCentimos: 6_000 }]), [source(FI_A, 1)])
  const second = buildRemittanceReceiptPlan({ ...proposal([{ facturaEmitidaId: FI_B, importeCentimos: 10_000 }]), propuestaId: '55555555-5555-4555-8555-555555555555', movimientoId: 'movimiento-remesa-b' }, [source(FI_B, 2)])
  assert.deepEqual(first.allocations.map(line => [line.facturaEmitidaId, line.importeCentimos, line.compositionOrdinals]), [[FI_A, 10_000, [1, 2]]])
  assert.deepEqual(second.allocations.map(line => [line.facturaEmitidaId, line.importeCentimos]), [[FI_B, 10_000]])
  assert.equal(first.compositionHash, parseReceiptComposition([{ facturaEmitidaId: FI_A, importeCentimos: 4_000 }, { facturaEmitidaId: FI_A, importeCentimos: 6_000 }]).hash)
})

test('planner rejects date, mapping, bank sum, negative and unknown composition evidence without inference', () => {
  assert.equal(errorCode(() => buildRemittanceReceiptPlan(proposal([{ facturaEmitidaId: FI_A, importeCentimos: 10_000 }], 10_000, '2026-10-01'), [source(FI_A, 1, 10_000, '2026-10-02')])), 'FUENTE_FI_ISP_INEXACTA')
  assert.equal(errorCode(() => buildRemittanceReceiptPlan(proposal([{ facturaEmitidaId: FI_A, importeCentimos: 10_000 }]), [{ ...source(FI_A, 1), facturaISPId: null }])), 'MAPA_FI_ISP_REMESA_INEXACTO')
  assert.equal(errorCode(() => buildRemittanceReceiptPlan(proposal([{ facturaEmitidaId: FI_A, importeCentimos: 9_999 }]), [source(FI_A, 1)])), 'COMPOSICION_REMESA_NO_CIERRA_BANCO')
  assert.equal(errorCode(() => parseReceiptComposition([{ facturaEmitidaId: FI_A, importeCentimos: -1 }])), 'COMPOSICION_REMESA_INEXACTA')
  assert.equal(errorCode(() => parseReceiptComposition([{ facturaEmitidaId: FI_A, importeCentimos: 1 }, { facturaEmitidaId: 'no-es-uuid', importeCentimos: 1 }])), 'COMPOSICION_REMESA_INEXACTA')
})

test('receipt composition accepts more than 40 rows but remains capped and exact', () => {
  const composition = Array.from({ length: 41 }, () => ({ facturaEmitidaId: FI_A, importeCentimos: 1 }))
  const parsed = parseReceiptComposition(composition)
  assert.equal(parsed.entries.length, 41)
  assert.equal(parsed.totalCentimos, 41)
  const overflow = Array.from({ length: 2_001 }, () => ({ facturaEmitidaId: FI_A, importeCentimos: 1 }))
  assert.equal(errorCode(() => parseReceiptComposition(overflow)), 'COMPOSICION_REMESA_INEXACTA')
})

test('idempotent receipt hash is deterministic and changes on the sealed composition or actor', () => {
  const first = receiptRequestHash({ actorId: 7, propuestaId: PROPOSAL_A, movimientoId: 'movimiento-remesa-a', fingerprint: HASH, compositionHash: 'f'.repeat(64) })
  assert.equal(first, receiptRequestHash({ actorId: 7, propuestaId: PROPOSAL_A, movimientoId: 'movimiento-remesa-a', fingerprint: HASH, compositionHash: 'f'.repeat(64) }))
  assert.notEqual(first, receiptRequestHash({ actorId: 8, propuestaId: PROPOSAL_A, movimientoId: 'movimiento-remesa-a', fingerprint: HASH, compositionHash: 'f'.repeat(64) }))
  assert.notEqual(first, receiptRequestHash({ actorId: 7, propuestaId: PROPOSAL_A, movimientoId: 'movimiento-remesa-a', fingerprint: HASH, compositionHash: 'e'.repeat(64) }))
})

test('B7 counts exact live partial receipts, ignores an undone receipt, and marks an active abono without receipt amber', () => {
  const first = b4Line('abono-a', 10_000)
  const second = b4Line('abono-b', 10_000)
  const exact = calculateBankInvoicing({
    invoices: [invoice('a', 1), invoice('b', 2)],
    explicitRemittances: [partialRemittance([receipt('r-a', first, 'a', 1, 10_000), receipt('r-b', second, 'b', 2, 10_000)], [first, second])],
  })
  assert.deepEqual(exact.invoices.map(row => [row.invoiceId, row.paidDocumentaryCents, row.remainingCents, row.paymentState]), [
    ['a', 10_000, 0, 'COBRADA_CALCULADA'], ['b', 10_000, 0, 'COBRADA_CALCULADA'],
  ])
  const undone = { ...first, active: false, documentActive: false, operationApplied: false, operationReverted: true, movementJustified: false }
  const afterUndo = calculateBankInvoicing({
    invoices: [invoice('a', 1), invoice('b', 2)],
    explicitRemittances: [partialRemittance([receipt('r-history', undone, 'a', 1, 10_000)], [])],
  })
  assert.ok(afterUndo.invoices.every(row => row.paymentState === 'PENDIENTE_COBRO' && row.paidDocumentaryCents === 0))
  const missing = calculateBankInvoicing({
    invoices: [invoice('a', 1), invoice('b', 2)],
    explicitRemittances: [partialRemittance([receipt('r-a', first, 'a', 1, 10_000)], [first, second])],
  })
  assert.ok(missing.invoices.every(row => row.paymentState === 'PENDIENTE_COBRO_REVISION' && row.reasons.includes('RECIBO_REMESA_B7_ABONO_SIN_RECIBO')))
  assert.equal(exact.calculationBasis, 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA__RECIBO_REMESA_B7_V1')
})

test('B7 rejects a one-cent receipt mismatch and receipt line capacity overrun', () => {
  const line = b4Line('mismatch', 10_000)
  const mismatch = calculateBankInvoicing({
    invoices: [invoice('a', 1), invoice('b', 2)],
    explicitRemittances: [partialRemittance([receipt('r-mismatch', line, 'a', 1, 9_999)], [line])],
  })
  assert.ok(mismatch.invoices.every(row => row.reasons.includes('RECIBO_REMESA_B7_INEXACTO')))
  const capacity = calculateBankInvoicing({
    invoices: [invoice('a', 1), invoice('b', 2)],
    explicitRemittances: [partialRemittance([receipt('r-over', { ...line, signedCents: 10_001, physicalBankCents: 10_001, sumAllActiveCents: 10_001 }, 'a', 1, 10_001)], [{ ...line, signedCents: 10_001, physicalBankCents: 10_001, sumAllActiveCents: 10_001 }])],
  })
  assert.ok(capacity.invoices.every(row => row.reasons.includes('RECIBO_REMESA_B7_CAPACIDAD_EXCEDIDA')))
})

console.log(`test-finance-remittance-payment-receipts-core: ${B7_REMESA_RECEIPT_SCHEMA_VERSION} OK`)
