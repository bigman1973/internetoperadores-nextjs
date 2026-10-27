import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validarBorradorMovimiento, type UUID } from '../lib/finanzas/reconciliation-core'
const documentId='11111111-1111-4111-8111-111111111111' as UUID
const nominal=100_000,intereses=1_000,comision=200,iva=42
const neto=nominal-intereses-comision-iva
const capacity=[{documentoConciliableId:documentId,tipoDocumento:'FACTURA_EMITIDA' as const,importeObjetivoCentimos:nominal,netoActivoPrevioCentimos:0}]
const lines=[
 {tipo:'DOCUMENTO',documentoConciliableId:documentId,importeCentimos:nominal},
 {tipo:'DIFERENCIA',motivoDiferencia:'INTERESES',importeCentimos:-intereses},
 {tipo:'DIFERENCIA',motivoDiferencia:'COMISION',importeCentimos:-comision},
 {tipo:'DIFERENCIA',motivoDiferencia:'IVA_COMISION',importeCentimos:-iva},
]
test('B4 cobra el nominal completo y conserva tres deducciones explícitas independientes',()=>{
 const r=validarBorradorMovimiento({movimientoId:'synthetic-confirming-vat',importeMovimientoCentimos:neto,estado:'JUSTIFICADO',lineas:lines},capacity)
 assert(r.ok)
 if(r.ok){assert.equal(r.value.sumaLineasCentimos,neto);assert.equal(r.value.capacidades[0].netoResultanteCentimos,nominal);assert.equal(r.value.diferenciasAgrupadas.length,3);const byReason=new Map(r.value.diferenciasAgrupadas.map(l=>[l.motivoDiferencia,l.importeCentimos]));assert.equal(byReason.get('INTERESES'),-intereses);assert.equal(byReason.get('COMISION'),-comision);assert.equal(byReason.get('IVA_COMISION'),-iva);assert.equal(byReason.has('REDONDEO'),false)}
})
test('un céntimo de diferencia no se absorbe en IVA ni en redondeo',()=>{
 const r=validarBorradorMovimiento({movimientoId:'synthetic-one-cent',importeMovimientoCentimos:neto+1,estado:'JUSTIFICADO',lineas:lines},capacity)
 assert.equal(r.ok,false)
})
test('omitir la deducción explícita de IVA no permite cerrar el abono menor',()=>{
 const r=validarBorradorMovimiento({movimientoId:'synthetic-missing-vat',importeMovimientoCentimos:neto,estado:'JUSTIFICADO',lineas:lines.slice(0,3)},capacity)
 assert.equal(r.ok,false)
})
