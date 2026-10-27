/* Revisión de proveedor Conciliar: fixtures sintéticas puras; sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyReceivedInvoicePaymentCandidates,
  conciliarAliasesContainDocumentaryAlias,
  conciliarAliasesMatch,
  type ReceivedInvoicePaymentCandidate,
} from '../lib/finanzas/conciliar-core'

type Fixture = Readonly<{ label: string }>
function candidate(input: Omit<ReceivedInvoicePaymentCandidate<Fixture>, 'source'>): ReceivedInvoicePaymentCandidate<Fixture> {
  return { ...input, source: { label: input.id } }
}

const BUTPO_LITERAL = 'BUTPO 2000, S.L. PAGO FACTURA 260007'
const PROVIDER = 'BUTPO 2000, S.L.'

test('el nombre entero del proveedor contenido en el literal bancario sólo habilita revisión, no identidad exacta', () => {
  assert.equal(conciliarAliasesMatch([BUTPO_LITERAL], [PROVIDER]), false)
  assert.equal(conciliarAliasesContainDocumentaryAlias([BUTPO_LITERAL], [PROVIDER]), true)
  assert.equal(conciliarAliasesContainDocumentaryAlias(['PAGAR A BUTPO 2000, S.L.A.'], [PROVIDER]), false)
  assert.equal(conciliarAliasesContainDocumentaryAlias(['PAGO PROVEEDOR'], [PROVIDER]), false)
})

test('una factura posterior es candidata ámbar aunque número e importe sean exactos', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -102_000,
    fechaBanco: '2026-07-18',
    conceptoBanco: `TRASPAS A ${BUTPO_LITERAL}`,
    includeFutureDateReview: true,
    candidates: [candidate({
      id: 'post-sync-date', referencia: 'F260007', fecha: '2026-07-19', vencimiento: null,
      importeDocumentoCentimos: -102_000, matchesCounterparty: true,
    })],
  })
  assert.equal(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('La fixture debía conservar revisión.')
  assert.equal(result.reason, 'FECHA_POSTERIOR')
  assert.equal(result.candidate.id, 'post-sync-date')
})

test('tres facturas del mismo proveedor con referencia e importe distintos enseñan la candidata más próxima en ámbar', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -102_000,
    fechaBanco: '2026-07-18',
    conceptoBanco: `TRASPAS A ${BUTPO_LITERAL}`,
    candidates: [
      candidate({ id: 'different-reference-nearest', referencia: 'F260006', fecha: '2026-06-01', vencimiento: null, importeDocumentoCentimos: -102_000, matchesCounterparty: true }),
      candidate({ id: 'different-amount', referencia: 'F260008', fecha: '2026-07-01', vencimiento: null, importeDocumentoCentimos: -51_000, matchesCounterparty: true }),
      candidate({ id: 'far-reference', referencia: 'F259900', fecha: '2026-05-01', vencimiento: null, importeDocumentoCentimos: -102_000, matchesCounterparty: true }),
    ],
  })
  assert.equal(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('La fixture debía requerir revisión.')
  assert.equal(result.reason, 'REFERENCIA_DISCREPANTE')
  assert.equal(result.candidate.id, 'different-amount', 'a igual distancia de número, la fecha más próxima ordena la revisión; sigue ámbar por referencia')
})

console.log('OK: alias documental contenido, fecha posterior y discrepancias de proveedor conservan revisión ámbar sin verde por importe o nombre.')
