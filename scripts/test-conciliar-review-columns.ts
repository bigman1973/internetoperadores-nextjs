import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { referenciasFacturaCitadas, referenciaFacturaCompatible, evaluarDocumentoExacto, parseConciliarGetInput } from '../lib/finanzas/conciliar-contract'
import { createConciliarSearchMachineState, reduceConciliarSearchMachine } from '../components/finanzas/conciliar/conciliar-global-search'

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
  const detail=readFileSync('components/finanzas/conciliar/ConciliarDocumentPreview.tsx','utf8')
  assert.match(ui,/documentLabel = row\.documento\?\.referencia \|\| '—'/)
  assert.match(ui,/aria-label="Ver nota completa"/)
  assert.match(ui,/title=\{row\.motivo\}/)
  assert.match(detail,/\{drawer\.row\.motivo\}/)
  assert.match(detail,/formatMoney\(drawer\.row\.importeCentimos\)/)
  assert.match(detail,/detail\?\.pdfHref && <a href=\{detail\.pdfHref\} target="_blank"/)
  assert.doesNotMatch(detail,/<(?:iframe|object|embed)\b/)
  assert.match(ui,/Anteriores a la fecha de corte/)
  assert.match(ui,/Facturas sin cobro confirmado/)
  assert.match(ui,/Estado de facturas emitidas/)
  assert.match(ui,/Con propuesta/)
  assert.match(ui,/Para revisar/)
  assert.match(ui,/Sin propuesta/)
  assert.match(ui,/useConciliarGlobalSearch\(\{ initialTab, initialQuery, initialOffset: 0, initialData: initialParsed, read: readGlobal, cache: searchCache \}\)/)
  const seededSearch = createConciliarSearchMachineState('COBROS', 'factura 260007', 0, true)
  assert.equal(seededSearch.phase, 'idle')
  assert.equal(seededSearch.view.query, 'factura 260007')
  const noSeedSearch = createConciliarSearchMachineState('COBROS', 'factura 260007', 0, false)
  assert.equal(noSeedSearch.phase, 'loading')
  const nextGeneration = reduceConciliarSearchMachine(seededSearch, { type: 'TAB', tab: 'PAGOS' })
  assert.equal(reduceConciliarSearchMachine(nextGeneration, { type: 'RESOLVED', generation: seededSearch.generation }).phase, 'loading')
  assert.match(ui,/const ConciliarConfirmationHistory = dynamic\(loadConciliarConfirmationHistory\);/)
  assert.match(ui,/<ConciliarConfirmationHistory activeActuationSessionId=\{activeActuation\?\.sessionId \?\? null\} busy=\{mutationsBlocked\} refreshKey=\{confirmationHistoryRevision\}/)
  assert.match(ui,/showInterestInvoices && <ConfirmingInterestInvoices/)
})
