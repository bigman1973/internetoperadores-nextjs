import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseConciliarDocumentDetail } from '../lib/finanzas/conciliar-document-detail-contract'

const detail = () => ({ rowId: 'fila_sintetica', kind: 'CONFIRMING', titulo: 'Liquidación de prueba', bancoEmisor: 'Banco ejemplo', numeroLiquidacion: null, fechaLiquidacion: '2026-01-15', cuentaAbono: 'Cuenta de prueba', proveedor: null, numeroFactura: null, fechaFactura: null, importeFacturaCentimos: null, lineas: [{ numero: 'PRUEBA/1', cliente: 'Cliente sintético', fechaEmision: '2026-01-01', fechaVencimiento: '2026-02-01', nominalCentimos: 10000 }], nominalCentimos: 10000, interesesCentimos: 100, comisionCentimos: 50, ivaComisionCentimos: 11, netoDocumentoCentimos: 9839, importeBancoCentimos: 9839, cuadreExacto: true, avisos: [], pdfHref: '/api/admin/finanzas/conciliar/archivo/fila_sintetica' })

test('desglose explícito y fechas se conservan sin deducciones residuales', () => {
 const x = parseConciliarDocumentDetail(detail())
 assert.equal(x.lineas.length, 1)
 assert.equal(x.ivaComisionCentimos, 11)
 assert.equal(x.lineas[0].fechaVencimiento, '2026-02-01')
 assert.equal(x.numeroLiquidacion, null)
})
test('conserva la referencia de archivo separada del número documental ausente', () => {
 const x = parseConciliarDocumentDetail({ ...detail(), referenciaDocumento: 'liquidacion_sintetica.pdf' })
 assert.equal(x.referenciaDocumento, 'liquidacion_sintetica.pdf')
 assert.equal(x.numeroLiquidacion, null)
 assert.equal(parseConciliarDocumentDetail(detail()).referenciaDocumento, null)
})
test('permite faltas documentales explícitas, no las convierte en cero', () => {
 const x = parseConciliarDocumentDetail({ ...detail(), interesesCentimos: null, cuadreExacto: false, avisos: ['Falta el interés explícito.'], pdfHref: null })
 assert.equal(x.interesesCentimos, null)
 assert.equal(x.pdfHref, null)
 assert.equal(x.cuadreExacto, false)
})
test('únicamente admite PDF servido por la ruta privada del panel', () => {
 for (const url of ['https://example.test/archivo.pdf', '//example.test/archivo.pdf', 'blob:example', 'data:application/pdf,abc', '/api/admin/finanzas/conciliar/archivo/fila?drive=externo', '/api/admin/finanzas/conciliar/archivo/../otra']) assert.throws(() => parseConciliarDocumentDetail({ ...detail(), pdfHref: url }))
})
test('rechaza importes fraccionados, inseguros y líneas sin cliente o fechas normalizadas', () => {
 assert.throws(() => parseConciliarDocumentDetail({ ...detail(), nominalCentimos: 100.5 }))
 assert.throws(() => parseConciliarDocumentDetail({ ...detail(), importeBancoCentimos: Number.MAX_SAFE_INTEGER + 1 }))
 assert.throws(() => parseConciliarDocumentDetail({ ...detail(), lineas: [{ numero: 'PRUEBA', nominalCentimos: 10000 }] }))
})
test('rechaza desglose truncado por encima del límite y avisos inválidos', () => {
 assert.throws(() => parseConciliarDocumentDetail({ ...detail(), lineas: Array(2001).fill(detail().lineas[0]) }))
 assert.throws(() => parseConciliarDocumentDetail({ ...detail(), avisos: [42] }))
})
