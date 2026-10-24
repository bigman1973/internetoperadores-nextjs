import assert from 'node:assert/strict'
import { calculatePhoneCostAnalytics, type PhoneCostCalculationInput } from '../lib/finanzas/phone-cost-core'

const hash = 'a'.repeat(64)
const evidence = {
  telefono: '973443349',
  baseCentimos: '5879',
  baseFuenteText: '58.79',
  totalFuenteText: '71.13',
  pdfSha256: hash,
  servicioDesde: '2026-08-01',
  servicioHasta: '2026-08-31',
  numeroFactura: 'TA7MI0068516',
  fechaFactura: '2026-09-19',
  schema: 'TELEFONICA_UNICA_PDF_V1',
  versionExtractor: 'TELEFONICA_UNICA_PDF_V1',
  telefonosServicio: ['973443349'],
} as const

function input(overrides: Partial<PhoneCostCalculationInput> = {}): PhoneCostCalculationInput {
  return {
    periodo: { desde: '2026-09-01', hasta: '2026-09-30' },
    documentosRecibidos: [{
      id: 'telefonica-fija-1',
      numFactura: 'TA7MI0068516',
      proveedor: 'Telefónica de España',
      fecha: '2026-09-19',
      baseText: '58.79',
      totalText: '71.13',
      economica: true,
      telefonoServicio: null,
      datosOcrRaw: null,
      // Intentionally non-allocable four-decimal charges: only the PDF's explicit
      // base imponible can form the single-service whole-document proposal.
      lineasDetalleRaw: JSON.stringify([{ descripcion: 'Internet 100 Mb', precio: '56.1982' }]),
      evidenciasServicioUnico: [evidence],
    }],
    contratos: [{ id: 101, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-07-01', fechaBaja: null, activo: true }],
    clientes: [{ id: 61, clienteContratoId: '611', clienteFacturaIspId: '9611', nombre: 'Cliente de prueba' }],
    facturasIsp: [{ id: 61, clienteFacturaIspId: '9611', fecha: '2026-09-19', baseText: '100.00' }],
    facturasEmitidasEspejo: [],
    costesConfirmados: [],
    ...overrides,
  }
}

function document(result: ReturnType<typeof calculatePhoneCostAnalytics>) {
  return result.documentos.find(row => row.facturaId === 'telefonica-fija-1')!
}

const accepted = calculatePhoneCostAnalytics(input())
assert.equal(accepted.totales.costeAsignablePropuestoCentimos, '5879')
assert.equal(document(accepted).costePropuestoCentimos, '5879')
assert.equal(document(accepted).baseNoAsignadaCentimos, '0')
assert.equal(document(accepted).lineasPropuestas, 1)
assert.ok(document(accepted).motivos.includes('EVIDENCIA_PDF_SERVICIO_UNICO'))
assert.equal(accepted.clientes[0]?.coste.confirmadoCentimos, null)
assert.equal(accepted.totales.margenPotencialEstimado.porcentajeBp, null)
assert.equal(accepted.bancoTelefono.usadoEnCoste, false)

const noEvidence = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], evidenciasServicioUnico: [],
}] }))
assert.equal(noEvidence.totales.costeAsignablePropuestoCentimos, '0', 'four-decimal legacy PDF detail cannot become a whole-invoice cost without staged evidence')

const missingTotal = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], totalText: null,
}] }))
assert.equal(missingTotal.totales.costeAsignablePropuestoCentimos, '0', 'whole-PDF evidence must revalidate the source total')
const changedSource = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], evidenciasServicioUnico: [{ ...evidence, sourceSnapshotMatches: false }],
}] }))
assert.equal(changedSource.totales.costeAsignablePropuestoCentimos, '0', 'a changed source snapshot cannot be silently allocated')

const sourceMismatch = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], evidenciasServicioUnico: [{ ...evidence, baseFuenteText: '58.7900' }],
}] }))
assert.equal(sourceMismatch.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(document(sourceMismatch).motivos.includes('EVIDENCIA_PDF_INCONSISTENTE'))

const identityMismatch = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], evidenciasServicioUnico: [{ ...evidence, fechaFactura: '2026-09-18' }],
}] }))
assert.equal(identityMismatch.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(document(identityMismatch).motivos.includes('EVIDENCIA_PDF_INCONSISTENTE'))

const multiplePhones = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], evidenciasServicioUnico: [{ ...evidence, telefonosServicio: ['973443349', '612345678'] }],
}] }))
assert.equal(multiplePhones.totales.costeAsignablePropuestoCentimos, '0')

const ambiguousHashes = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], evidenciasServicioUnico: [evidence, { ...evidence, pdfSha256: 'b'.repeat(64) }],
}] }))
assert.equal(ambiguousHashes.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(document(ambiguousHashes).motivos.includes('EVIDENCIA_PDF_AMBIGUA'))

const samePdfRepeated = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], evidenciasServicioUnico: [evidence, { ...evidence, snapshotAt: '2026-10-24T10:00:00.000Z' }],
}] }))
assert.equal(samePdfRepeated.totales.costeAsignablePropuestoCentimos, '5879')
assert.equal(document(samePdfRepeated).costePropuestoCentimos, '5879')

const samePdfAcrossReceivedInvoices = calculatePhoneCostAnalytics(input({ documentosRecibidos: [
  input().documentosRecibidos[0],
  { ...input().documentosRecibidos[0], id: 'telefonica-fija-duplicada' },
] }))
assert.equal(samePdfAcrossReceivedInvoices.totales.costeAsignablePropuestoCentimos, '0', 'one PDF hash cannot allocate two received-invoice records')
assert.ok(samePdfAcrossReceivedInvoices.documentos.every(row => row.motivos.includes('EVIDENCIA_PDF_INCONSISTENTE')))

const partialCoverage = calculatePhoneCostAnalytics(input({ contratos: [{
  id: 101, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-08-02', fechaBaja: null, activo: true,
}] }))
assert.equal(partialCoverage.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(document(partialCoverage).motivos.includes('TELEFONO_SIN_CONTRATO_VIGENTE'))

const overlap = calculatePhoneCostAnalytics(input({ contratos: [
  { id: 101, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-07-01', fechaBaja: null, activo: true },
  { id: 102, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-08-20', fechaBaja: '2026-08-25', activo: false },
] }))
assert.equal(overlap.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(document(overlap).motivos.includes('TELEFONO_CONTRATO_AMBIGUO'))

console.log('test-finance-phone-single-service: OK (PDF único 58,79 €, cobertura íntegra, rechazo de ambigüedades y sin doble coste)')
