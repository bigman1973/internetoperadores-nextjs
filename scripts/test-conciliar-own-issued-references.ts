/* Referencias propias de COBROS: pruebas sintéticas puras. Sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluarDocumentoExacto, referenciasFacturaCitadas } from '../lib/finanzas/conciliar-contract'
import { extractRefsOwnIssued, referenciaFacturaEmitidaCompatible, referenciasEmitidasComposicionCompatible } from '../lib/finanzas/conciliar-issued-reference-core'

const REGISTRO_EMITIDAS = ['INST26/701', 'INST26/702', 'DRAX26/703', 'CLL26/704', 'OTRA26/705'] as const
const DOCUMENTO_INST = {
  importeBancoCentimos: 10_000,
  importeDocumentoCentimos: 10_000,
  fechaBanco: '2026-10-28',
  fechaDocumento: '2026-10-01',
  referenciaDocumento: 'INST26/701',
  unicoTercero: true,
} as const

test('las variantes de espacio y separador de series emitidas salen sólo del registro canónico', () => {
  assert.deepEqual(extractRefsOwnIssued('PAGO INST 26 / 701', REGISTRO_EMITIDAS), ['INST26701'])
  assert.deepEqual(extractRefsOwnIssued('ABONO DRAX 26-703', REGISTRO_EMITIDAS), ['DRAX26703'])
  assert.deepEqual(extractRefsOwnIssued('COBRO CLL 26 / 704', REGISTRO_EMITIDAS), ['CLL26704'])
  assert.deepEqual(extractRefsOwnIssued('TRANSFERENCIA OTRA26/705', REGISTRO_EMITIDAS), ['OTRA26705'])
})

test('referencias ajenas DG/P y formas desconocidas no se convierten en referencias propias', () => {
  const concept = 'PAGO FACTURA DG26-02445 P-03433 MALICIOSA99/1'
  assert.deepEqual(extractRefsOwnIssued(concept, REGISTRO_EMITIDAS), [])
  assert.equal(referenciaFacturaEmitidaCompatible(concept, 'INST26/701', REGISTRO_EMITIDAS), true)

  const exact = evaluarDocumentoExacto({ ...DOCUMENTO_INST, conceptoBanco: concept, referenciasEmitidasCanonicas: REGISTRO_EMITIDAS })
  assert.equal(exact.color, 'VERDE')
  assert.equal(exact.seleccionable, true)
})

test('Arrow: una referencia propia distinta registrada deja el cobro en ámbar aunque importe y cliente coincidan', () => {
  const concept = 'PAGO FACTURA INST26 / 702'
  assert.deepEqual(extractRefsOwnIssued(concept, REGISTRO_EMITIDAS), ['INST26702'])
  assert.equal(referenciaFacturaEmitidaCompatible(concept, 'INST26/701', REGISTRO_EMITIDAS), false)

  const exact = evaluarDocumentoExacto({ ...DOCUMENTO_INST, conceptoBanco: concept, referenciasEmitidasCanonicas: REGISTRO_EMITIDAS })
  assert.equal(exact.color, 'AMBAR')
  assert.equal(exact.seleccionable, false)
  assert.match(exact.motivo, /número de factura citado/i)
})

test('una factura todavía inexistente con serie propia no se ignora como referencia externa', () => {
  const concept = 'ABONO INST26/99999 DG26-02445'
  assert.deepEqual(extractRefsOwnIssued(concept, REGISTRO_EMITIDAS), ['INST2699999'])
  assert.equal(referenciaFacturaEmitidaCompatible(concept, 'INST26/701', REGISTRO_EMITIDAS), false)
  assert.equal(evaluarDocumentoExacto({ ...DOCUMENTO_INST, conceptoBanco: concept, referenciasEmitidasCanonicas: REGISTRO_EMITIDAS }).color, 'AMBAR')
  assert.deepEqual(extractRefsOwnIssued('ABONO NUEVA26/999', REGISTRO_EMITIDAS), [])
})

test('la composición de COBROS sólo rechaza una referencia propia ajena a sus recibos', () => {
  assert.equal(referenciasEmitidasComposicionCompatible('COBRO INST26/701 y DG26-02445', ['INST26/701'], REGISTRO_EMITIDAS), true)
  assert.equal(referenciasEmitidasComposicionCompatible('COBRO INST26/702', ['INST26/701'], REGISTRO_EMITIDAS), false)
  assert.equal(referenciasEmitidasComposicionCompatible('COBRO DG26-02445 P-03433', ['INST26/701'], REGISTRO_EMITIDAS), true)
})

test('el camino genérico de proveedor conserva CC y la evaluación heredada si no recibe registro de emitidas', () => {
  assert.deepEqual(referenciasFacturaCitadas('PAGO FACTURA CC26/0042 XFERA'), ['CC260042'])
  assert.equal(evaluarDocumentoExacto({ ...DOCUMENTO_INST, conceptoBanco: 'PAGO FACTURA DG26-02445' }).color, 'AMBAR')
})

console.log('OK: referencias propias registradas, externas ignoradas, conflicto propio y compatibilidad de proveedor verificados sin BD ni red.')
