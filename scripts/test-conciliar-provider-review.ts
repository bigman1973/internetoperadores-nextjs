/* Revisión de proveedor Conciliar: fixtures sintéticas puras; sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyReceivedInvoicePaymentCandidates,
  conciliarAliasesContainDocumentaryAlias,
  conciliarAliasesMatch,
  type ReceivedInvoicePaymentCandidate,
} from '../lib/finanzas/conciliar-core'
import { conciliarConceptoBancoEsXferaFuerte, conciliarProveedorAliasFuerte, conciliarProveedorAliasesFuertes } from '../lib/finanzas/conciliar-proveedor'

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

test('Xfera sólo admite la pareja fuerte documentada, nunca el grupo MasMovil ni una coincidencia parcial', () => {
  const banco = 'GRUPO MASMOVIL XFERA'
  const factura = 'XFERA MOVILES, S.A.U.'
  assert.equal(conciliarProveedorAliasFuerte([banco], [factura]), true)
  assert.equal(conciliarProveedorAliasFuerte([factura], [banco]), true)
  assert.equal(conciliarAliasesMatch(conciliarProveedorAliasesFuertes([banco]), [factura]), true)
  assert.equal(conciliarProveedorAliasFuerte(['GRUPO MASMOVIL'], [factura]), false)
  assert.equal(conciliarProveedorAliasFuerte(['MASMOVIL IBERCOM'], [factura]), false)
  assert.equal(conciliarProveedorAliasFuerte(['GRUPO MASMOVIL XFERA TELECOM'], [factura]), false)
  assert.equal(conciliarProveedorAliasFuerte([banco], ['XFERA MOVILES']), false)
  assert.equal(conciliarConceptoBancoEsXferaFuerte('CI CC260000004813 GRUPO MASMOVIL XFERA'), true)
  assert.equal(conciliarAliasesMatch(conciliarProveedorAliasesFuertes([], 'CI CC260000004813 GRUPO MASMOVIL XFERA'), [factura]), true)
  assert.equal(conciliarConceptoBancoEsXferaFuerte('CI CC260000004813 GRUPO MASMOVIL'), false)
  assert.equal(conciliarConceptoBancoEsXferaFuerte('CI CC260000004813 GRUPO MASMOVIL XFERA TELECOM'), false)
  assert.equal(conciliarConceptoBancoEsXferaFuerte('CI CC260000004813 XFERA'), false)
  assert.equal(conciliarConceptoBancoEsXferaFuerte('RECIBO CI CC26TEST0001 GRUPO MASMOVIL XFERA, INFORMACION DEL RECIBO'), true)
  assert.equal(conciliarAliasesMatch(conciliarProveedorAliasesFuertes([], 'RECIBO CI CC26TEST0001 GRUPO MASMOVIL XFERA, INFORMACION DEL RECIBO'), [factura]), true)
  assert.equal(conciliarConceptoBancoEsXferaFuerte('RECIBO GRUPO MASMOVIL XFERA TELECOM, INFORMACION DEL RECIBO'), false)
  assert.equal(conciliarConceptoBancoEsXferaFuerte('RECIBO GRUPO MASMOVIL XFERAOTRA, INFORMACION DEL RECIBO'), false)
})

test('Xfera con alias fuerte queda ámbar sin referencia, aunque número de candidata, importe y fecha sean únicos', () => {
  const result = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -321_582,
    fechaBanco: '2026-10-09',
    conceptoBanco: 'CI XFERA MOVILES',
    candidates: [candidate({
      id: 'xfera-no-documentary-reference', referencia: 'CC260000004813', fecha: '2026-08-01', vencimiento: null,
      importeDocumentoCentimos: -321_582, matchesCounterparty: conciliarProveedorAliasFuerte(['GRUPO MASMOVIL XFERA'], ['XFERA MOVILES, S.A.U.']),
    })],
  })
  assert.equal(result.kind, 'REVIEW')
  if (result.kind !== 'REVIEW') throw new Error('Sin número documental Xfera debe quedar ámbar.')
  assert.equal(result.reason, 'REFERENCIA_DISCREPANTE')
})

test('Xfera con CC26 completo, alias fuerte, fecha e importe exactos puede ser verde; referencia parcial no', () => {
  const matchesCounterparty = conciliarAliasesMatch(
    conciliarProveedorAliasesFuertes([], 'CI CC260000004813 GRUPO MASMOVIL XFERA'),
    ['XFERA MOVILES, S.A.U.'],
  )
  const exact = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -321_582,
    fechaBanco: '2026-10-09',
    conceptoBanco: 'CI CC260000004813 GRUPO MASMOVIL XFERA',
    candidates: [candidate({
      id: 'xfera-cc26-complete', referencia: 'CC26/0000004813', fecha: '2026-08-01', vencimiento: null,
      importeDocumentoCentimos: -321_582, matchesCounterparty,
    })],
  })
  assert.equal(exact.kind, 'EXACT')

  const partial = classifyReceivedInvoicePaymentCandidates({
    importeBancoCentimos: -321_582,
    fechaBanco: '2026-10-09',
    conceptoBanco: 'CI CC260000004813 GRUPO MASMOVIL XFERA',
    candidates: [candidate({
      id: 'xfera-cc26-partial', referencia: 'CC26000000481', fecha: '2026-08-01', vencimiento: null,
      importeDocumentoCentimos: -321_582, matchesCounterparty,
    })],
  })
  assert.equal(partial.kind, 'REVIEW')
  if (partial.kind !== 'REVIEW') throw new Error('Una referencia Xfera parcial no puede quedar verde.')
  assert.equal(partial.reason, 'REFERENCIA_DISCREPANTE')
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
