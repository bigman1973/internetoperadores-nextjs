import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildHistoricalExclusionsReport,
  renderHistoricalExclusionsCsv,
  renderHistoricalExclusionsHtml,
  type HistoricalExclusionEvidenceByRow,
} from '../lib/finanzas/historical-exclusions-core'
import type { MaterialHistorical } from '../lib/finanzas/historical-bulk-core'

const document = (overrides: Record<string, unknown> = {}) => ({
  tipo: 'FACTURA_RECIBIDA', sourceId: 'invoice-1', referencia: 'Factura recibida F-1', tercero: null,
  fecha: '2026-10-01', fechaVencimiento: null, importeObjetivoCentimos: -10000,
  documentoConciliableId: null, valid: true, archivo: true, wrapperVersion: null,
  sourceDateSnapshot: '2026-10-01', targetSnapshot: -10000, netoActivo: '0', activeCount: 0, fileProof: { id: 'ok' },
  ...overrides,
})

const row = (overrides: Partial<MaterialHistorical> = {}): MaterialHistorical => ({
  historicoId: 'h-1', movimientoId: 'm-1', sourceHash: 'a'.repeat(64), sourceIntegrity: true,
  fechaBancoSnapshot: '2026-10-02', clasificacion: 'PROPUESTA', estado: 'SIN_DOCUMENTO', version: 1,
  fechaOperacion: '2026-10-02T23:30:00.000Z', concepto: 'Pago de prueba', banco: 'Banco Uno', cuentaAlias: 'Cuenta A',
  importeMovimientoCentimos: -10000, importeSnapshot: -10000, documentos: [document()], unsupported: false,
  ...overrides,
})

const evidence = (entries: readonly [string, readonly Record<string, unknown>[]][]): HistoricalExclusionEvidenceByRow => new Map(entries.map(([id, docs]) => [id, docs.map(doc => ({
  tipo: 'FACTURA_RECIBIDA', sourceId: 'invoice-1', referenciaHistorica: 'Factura histórica F-1', importeHistoricoCentimos: -10000,
  referenciaActual: 'Factura actual F-1', importeDocumentoCentimos: -10000, actualVerificable: true, ...doc,
}))]))

test('agrupa por el primer motivo exacto, suma firmados y no cuenta YA_RESUELTA_B4', () => {
  const report = buildHistoricalExclusionsReport([
    row({ historicoId: 'amount', movimientoId: 'amount', importeMovimientoCentimos: -10100, importeSnapshot: -10000 }),
    row({ historicoId: 'missing', movimientoId: 'missing', documentos: [] }),
    row({ historicoId: 'resolved', movimientoId: 'resolved', estado: 'JUSTIFICADO' }),
  ], new Map(), '2026-10-23T00:00:00.000Z')
  assert.equal(report.totalMovimientos, 2)
  assert.equal(report.totalCargosCentimos, '-20100')
  assert.equal(report.totalCobrosCentimos, '0')
  assert.deepEqual(report.grupos.map(group => [group.codigo, group.totalMovimientos]), [
    ['IMPORTE_BANCARIO_CAMBIADO_O_NO_EXACTO', 1], ['SIN_DOCUMENTO_VERIFICABLE', 1],
  ])
  assert.equal(report.grupos.some(group => group.codigo === 'YA_RESUELTA_B4'), false)
})

test('asigna documento compartido en la fase de población sin duplicar movimientos', () => {
  const report = buildHistoricalExclusionsReport([
    row({ historicoId: 'one', movimientoId: 'one' }),
    row({ historicoId: 'two', movimientoId: 'two', concepto: 'Segundo' }),
  ])
  assert.equal(report.totalMovimientos, 2)
  assert.equal(report.grupos.length, 1)
  assert.equal(report.grupos[0].codigo, 'DOCUMENTO_COMPARTIDO_ENTRE_PROPUESTAS')
  assert.equal(report.grupos[0].totalMovimientos, 2)
})

test('un documento actual ausente conserva sólo snapshot histórico y no fabrica cero ni diferencia', () => {
  const report = buildHistoricalExclusionsReport([row({ documentos: [] })], evidence([['h-1', [{
    referenciaHistorica: 'Factura histórica F-9', importeHistoricoCentimos: -2345,
    referenciaActual: null, importeDocumentoCentimos: null, actualVerificable: false,
  }]]]))
  const movement = report.grupos[0].movimientos[0]
  assert.equal(movement.documentos[0].referencia, 'Factura histórica F-9')
  assert.equal(movement.documentos[0].importeHistoricoCentimos, '-2345')
  assert.equal(movement.documentos[0].importeDocumentoCentimos, null)
  assert.equal(movement.documentos[0].estado, 'NO_VERIFICABLE')
  assert.equal(movement.importeDocumentosCentimos, null)
  assert.equal(movement.diferenciaCentimos, null)
})

test('ordena el detalle por magnitud descendente sin conversiones flotantes', () => {
  const report = buildHistoricalExclusionsReport([
    row({ historicoId: 'small', movimientoId: 'small', importeMovimientoCentimos: -101, importeSnapshot: -100 }),
    row({ historicoId: 'large', movimientoId: 'large', importeMovimientoCentimos: -900719925474, importeSnapshot: -100 }),
    row({ historicoId: 'middle', movimientoId: 'middle', importeMovimientoCentimos: 5000, importeSnapshot: 100 }),
  ])
  const values = report.grupos[0].movimientos.map(movement => movement.movimientoId)
  assert.deepEqual(values, ['large', 'middle', 'small'])
})

test('escapa HTML y protege los textos de fórmulas en CSV', () => {
  const report = buildHistoricalExclusionsReport([
    row({ concepto: '<img src=x onerror=alert(1)>', banco: '=HYPERLINK("https://example.invalid")', documentos: [] }),
  ], new Map(), '2026-10-23T00:00:00.000Z')
  const html = renderHistoricalExclusionsHtml(report)
  const csv = renderHistoricalExclusionsCsv(report)
  assert.equal(html.includes('<img src=x'), false)
  assert.equal(html.includes('&lt;img src=x onerror=alert(1)&gt;'), true)
  assert.equal(csv.startsWith('\uFEFF'), true)
  assert.equal(csv.includes("'=HYPERLINK"), true)
  assert.equal(csv.includes('"<img src=x onerror=alert(1)>"'), true)
})

test('CSV da una fila por excluida y HTML incluye resumen del grupo', () => {
  const report = buildHistoricalExclusionsReport([
    row({ historicoId: 'one', movimientoId: 'one', documentos: [] }),
    row({ historicoId: 'two', movimientoId: 'two', concepto: 'Segundo', documentos: [] }),
  ])
  const csvRows = renderHistoricalExclusionsCsv(report).trim().split(/\r?\n/)
  assert.equal(csvRows.length, 3)
  assert.equal(renderHistoricalExclusionsHtml(report).includes('2 movimientos'), true)
})
