/* Candidatas de pago recibido Conciliar: pruebas sintéticas puras. Sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyReceivedInvoicePaymentCandidates, conciliarCutoffDay, isConciliarHistoricIssued, type ReceivedInvoicePaymentCandidate } from '../lib/finanzas/conciliar-core'
import { normalizarReferenciaFactura, referenciasFacturaCitadas } from '../lib/finanzas/conciliar-contract'

type Fixture = Readonly<{ label: string }>
function candidate(input: Partial<ReceivedInvoicePaymentCandidate<Fixture>> & Pick<ReceivedInvoicePaymentCandidate<Fixture>, 'id' | 'referencia' | 'fecha' | 'vencimiento' | 'importeDocumentoCentimos' | 'matchesCounterparty'>): ReceivedInvoicePaymentCandidate<Fixture> {
  return { source: { label: input.id }, ...input }
}

const BANK_DAY = '2026-10-20'

test('el corte histórico es una fecha ISO real y no oculta emitidas con fecha inválida', () => {
  assert.equal(conciliarCutoffDay('2026-01-01'), '2026-01-01')
  assert.equal(conciliarCutoffDay('2026-02-30'), null)
  assert.equal(conciliarCutoffDay('2026-1-1'), null)
  assert.equal(isConciliarHistoricIssued('2025-12-31', '2026-01-01'), true)
  assert.equal(isConciliarHistoricIssued('2026-01-01', '2026-01-01'), false)
  assert.equal(isConciliarHistoricIssued('fecha-invalida', '2026-01-01'), false)
})

test('proveedor sintético: tres facturas con número o importe distinto dan ámbar y muestran la más próxima', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -88_800,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO FACTURA 880007',
    candidates: [
      candidate({ id: 'invoice-near-number', referencia: '880006', fecha: '2026-10-01', vencimiento: '2026-10-19', importeDocumentoCentimos: -177_700, matchesCounterparty: true }),
      candidate({ id: 'invoice-far-number', referencia: '880040', fecha: '2026-10-02', vencimiento: '2026-10-20', importeDocumentoCentimos: -88_800, matchesCounterparty: true }),
      candidate({ id: 'invoice-other-number', referencia: '879900', fecha: '2026-10-03', vencimiento: '2026-10-18', importeDocumentoCentimos: -177_700, matchesCounterparty: true }),
    ],
  })

  assert.equal(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('La fixture debía requerir revisión.')
  assert.equal(result.reason, 'REFERENCIA_DISCREPANTE')
  assert.equal(result.candidate.id, 'invoice-near-number', 'la proximidad de número prevalece sobre importe de otra factura')
})

test('una referencia citada y única con importe diferente sigue ámbar, nunca verde por proveedor o por número', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -88_800,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO FACTURA 880007',
    candidates: [candidate({ id: 'invoice-cited-wrong-amount', referencia: '880007', fecha: '2026-10-01', vencimiento: '2026-10-20', importeDocumentoCentimos: -177_700, matchesCounterparty: true })],
  })

  assert.deepEqual(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('La fixture debía requerir revisión.')
  assert.equal(result.reason, 'IMPORTE_DISTINTO')
  assert.equal(result.candidate.id, 'invoice-cited-wrong-amount')
})

test('importe sin referencia no identifica una factura: queda ámbar aunque sea único', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -88_800,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'TRANSFERENCIA PROVEEDOR',
    candidates: [candidate({ id: 'invoice-amount-only', referencia: '880007', fecha: '2026-10-01', vencimiento: '2026-10-20', importeDocumentoCentimos: -88_800, matchesCounterparty: true })],
  })

  assert.equal(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('La fixture debía requerir revisión.')
  assert.equal(result.reason, 'REFERENCIA_DISCREPANTE')
})

test('HubSpot sin número de factura queda ámbar aunque proveedor, importe y fecha coincidan', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -88_800,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO RECURRENTE HUBSPOT',
    candidates: [candidate({ id: 'hubspot-without-bank-invoice-number', referencia: 'HS-2026-0088', fecha: '2026-10-01', vencimiento: '2026-10-20', importeDocumentoCentimos: -88_800, matchesCounterparty: true })],
  })

  assert.equal(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('HubSpot sin referencia bancaria no puede ser exacto.')
  assert.equal(result.reason, 'REFERENCIA_DISCREPANTE')
})

test('Xfera cc26 explícita en concepto normaliza separadores y exige igualdad documental completa', () => {
  assert.deepEqual(referenciasFacturaCitadas('PAGO FACTURA CC26/0042 XFERA'), ['CC260042'])
  assert.deepEqual(referenciasFacturaCitadas('TRANSFERENCIA XFERA CC26/0042'), ['CC260042'])
  assert.equal(normalizarReferenciaFactura('cc26-0042'), 'CC260042')
  const exact = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -102_000,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO FACTURA CC26/0042 XFERA',
    candidates: [candidate({ id: 'xfera-cc26-exact', referencia: 'cc26-0042', fecha: '2026-10-01', vencimiento: null, importeDocumentoCentimos: -102_000, matchesCounterparty: true })],
  })
  assert.equal(exact.kind, 'EXACT')

  const partial = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -102_000,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO FACTURA CC26/0042 XFERA',
    candidates: [candidate({ id: 'xfera-cc26-prefix-only', referencia: 'cc26-004', fecha: '2026-10-01', vencimiento: null, importeDocumentoCentimos: -102_000, matchesCounterparty: true })],
  })
  assert.equal(partial.kind, 'REVIEW')
  if (partial.kind !== 'REVIEW') throw new Error('Una referencia parcial no puede ser exacta.')
  assert.equal(partial.reason, 'REFERENCIA_DISCREPANTE')
})

test('sólo una referencia bancaria exacta, emisión no posterior y el importe exacto habilitan verde', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -88_800,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO FACTURA 880007',
    candidates: [candidate({ id: 'invoice-exact', referencia: '880007', fecha: '2026-10-20', vencimiento: '2026-10-25', importeDocumentoCentimos: -88_800, matchesCounterparty: true })],
  })

  assert.equal(result.kind, 'EXACT')
  if (result.kind !== 'EXACT') throw new Error('La fixture debía ser exacta.')
  assert.equal(result.candidate.id, 'invoice-exact')
})

test('emisión posterior y proveedor no confirmado se excluyen aunque el importe o la referencia coincidan', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -88_800,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO FACTURA 880007',
    candidates: [
      candidate({ id: 'invoice-after-bank', referencia: '880007', fecha: '2026-10-21', vencimiento: '2026-10-21', importeDocumentoCentimos: -88_800, matchesCounterparty: true }),
      candidate({ id: 'invoice-other-provider', referencia: '880007', fecha: '2026-10-01', vencimiento: '2026-10-20', importeDocumentoCentimos: -88_800, matchesCounterparty: false }),
    ],
  })

  assert.deepEqual(result, { kind: 'NONE' })
})

test('vencimiento sirve para ordenar candidatas empatadas, sin convertirlas en exactas', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -88_800,
    fechaBanco: BANK_DAY,
    conceptoBanco: 'PAGO FACTURA 880007',
    candidates: [
      candidate({ id: 'invoice-far-due', referencia: '880006', fecha: '2026-10-10', vencimiento: '2026-12-20', importeDocumentoCentimos: -177_700, matchesCounterparty: true }),
      candidate({ id: 'invoice-near-due', referencia: '880008', fecha: '2026-10-10', vencimiento: '2026-10-21', importeDocumentoCentimos: -177_700, matchesCounterparty: true }),
    ],
  })

  assert.equal(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('La fixture debía requerir revisión.')
  assert.equal(result.candidate.id, 'invoice-near-due')
})

console.log('OK: candidatas de mismo proveedor, identidad documental, emisión, vencimiento y semáforo ámbar verificados sin BD ni red.')
