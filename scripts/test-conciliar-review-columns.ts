import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { referenciasFacturaCitadas, referenciaFacturaCompatible, evaluarDocumentoExacto, parseConciliarGetInput } from '../lib/finanzas/conciliar-contract'

test('la etiqueta FACTURA no crea una segunda referencia léxica', () => {
  assert.deepEqual(referenciasFacturaCitadas('PAGO FACTURA 260007'), ['260007'])
  assert.deepEqual(referenciasFacturaCitadas('PAGO FACTURA260007'), ['260007'])
  assert.equal(referenciaFacturaCompatible('PAGO FACTURA 260007', '260007'), true)
  assert.equal(referenciaFacturaCompatible('PAGO FACTURA 260007', '260008'), false)
  assert.equal(referenciaFacturaCompatible('Facturas INST26/68 y INST26/105', 'INST26/68'), false)
})
test('deduplicar etiqueta no tolera diferencias ni cambia fechas', () => {
  const fixture={importeBancoCentimos:10000,importeDocumentoCentimos:10000,fechaBanco:'2026-05-12',fechaDocumento:'2026-05-01',conceptoBanco:'PAGO FACTURA 260007',referenciaDocumento:'260007',unicoTercero:true}
  assert.equal(evaluarDocumentoExacto(fixture).color,'VERDE')
  assert.equal(evaluarDocumentoExacto({...fixture,importeDocumentoCentimos:10001}).color,'AMBAR')
  assert.equal(evaluarDocumentoExacto({...fixture,referenciaDocumento:'260008'}).color,'AMBAR')
  assert.equal(evaluarDocumentoExacto({...fixture,unicoTercero:false}).color,'AMBAR')
})
test('el corte es una preferencia validada, no un importe ni una confirmación', () => {
  const active=parseConciliarGetInput({tab:'EMITIDAS'})
  assert.equal(active.cutoffDate,'2026-01-01');assert.equal(active.historic,false)
  assert.throws(()=>parseConciliarGetInput({tab:'EMITIDAS',cutoffDate:'2026-02-30'}))
  assert.throws(()=>parseConciliarGetInput({tab:'PAGOS',historic:'1'}))
})
test('Documento sólo muestra referencia; Nota y detalles siguen accesibles sin PDF', () => {
  const ui=readFileSync('components/finanzas/conciliar/ConciliarWorkspace.tsx','utf8')
  assert.match(ui,/documentLabel = row\.documento\?\.referencia \|\| '—'/)
  assert.match(ui,/aria-label="Ver nota completa"/)
  assert.match(ui,/title=\{row\.motivo\}/)
  assert.match(ui,/document\.movement\.diferenciaCentimos/)
  assert.match(ui,/document\.href \? <iframe/)
  assert.match(ui,/Anteriores a la fecha de corte/)
  assert.match(ui,/initialRequestKey/)
  assert.match(ui,/if \(showHistory\) void loadHistory\(\)/)
  assert.match(ui,/showInterestInvoices && <ConfirmingInterestInvoices/)
})
