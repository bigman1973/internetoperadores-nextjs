import assert from 'node:assert/strict'
import {
  calculatePhoneCostAnalytics,
  contextualSpanishPhones,
  exactPhoneCostCents,
  normalizeSpanishPhone,
  type PhoneCostCalculationInput,
} from '../lib/finanzas/phone-cost-core'

const client = { id: 7, clienteContratoId: '42', clienteFacturaIspId: '90042', nombre: 'Cliente de prueba' }
const activeContract = { id: 10, clienteContratoId: '42', telefonosContrato: '612345678', fechaInicio: '2026-01-01', fechaBaja: null, activo: true }
const invoice = { id: 1, clienteFacturaIspId: '90042', fecha: '2026-01-12', baseText: '100.00' }
const validLine = [{ descripcion: 'Teléfono: +34 612 345 678', base: '10.00', iva: '2.10', total: '12.10' }]

function input(overrides: Partial<PhoneCostCalculationInput> = {}): PhoneCostCalculationInput {
  return {
    periodo: { desde: '2026-01-01', hasta: '2026-10-08' },
    documentosRecibidos: [{
      id: 'r1', proveedor: 'Telefónica de España', fecha: '2026-01-12', baseText: '10.00', economica: true,
      telefonoServicio: null, datosOcrRaw: null, lineasDetalleRaw: JSON.stringify(validLine),
    }],
    contratos: [activeContract],
    clientes: [client],
    facturasIsp: [invoice],
    facturasEmitidasEspejo: [{ facturaIspId: 1, lineasRaw: JSON.stringify(validLine) }],
    costesConfirmados: [],
    ...overrides,
  }
}

function doc(result: ReturnType<typeof calculatePhoneCostAnalytics>) { return result.documentos.find(row => row.facturaId === 'r1')! }

const fijaEvidence = {
  telefono: '973443349',
  baseCentimos: '5879',
  baseFuenteText: '58.79',
  totalFuenteText: '71.13',
  pdfSha256: 'a'.repeat(64),
  servicioDesde: '2026-08-01',
  servicioHasta: '2026-08-31',
  numeroFactura: 'TA7MI0068516',
  fechaFactura: '2026-09-19',
  schema: 'TELEFONICA_UNICA_PDF_V1',
  versionExtractor: 'TELEFONICA_UNICA_PDF_V1',
  telefonosServicio: ['973443349'],
  snapshotAt: '2026-10-24T09:00:00.000Z',
} as const

function fijaInput(overrides: Partial<PhoneCostCalculationInput> = {}): PhoneCostCalculationInput {
  return {
    periodo: { desde: '2026-09-01', hasta: '2026-09-30' },
    documentosRecibidos: [{
      id: 'fija-1', numFactura: 'TA7MI0068516', proveedor: 'Telefónica de España', fecha: '2026-09-19', baseText: '58.79', totalText: '71.13', economica: true,
      telefonoServicio: null, datosOcrRaw: null,
      // Four-decimal PDF charges deliberately do not become the allocation base.
      lineasDetalleRaw: JSON.stringify([{ descripcion: 'Internet 100 Mb (1 Ago. a 31 Ago.)', precio: '56.1982' }]),
      evidenciasServicioUnico: [fijaEvidence],
    }],
    contratos: [{ id: 101, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-07-01', fechaBaja: null, activo: true }],
    clientes: [{ id: 61, clienteContratoId: '611', clienteFacturaIspId: '9611', nombre: 'Cliente fija PDF' }],
    facturasIsp: [{ id: 61, clienteFacturaIspId: '9611', fecha: '2026-09-19', baseText: '100.00' }],
    facturasEmitidasEspejo: [],
    costesConfirmados: [],
    ...overrides,
  }
}

function fijaDoc(result: ReturnType<typeof calculatePhoneCostAnalytics>) { return result.documentos.find(row => row.facturaId === 'fija-1')! }

// España: +34, 0034, and standalone national format normalize; non-phone identifiers do not.
assert.equal(normalizeSpanishPhone('+34 612 345 678'), '612345678')
assert.equal(normalizeSpanishPhone('0034-612-345-678'), '612345678')
assert.equal(normalizeSpanishPhone('B12345678'), null, 'CIF must never normalize as a phone')
assert.equal(normalizeSpanishPhone('ES9121000418450200051332'), null, 'IBAN must never normalize as a phone')
assert.deepEqual(contextualSpanishPhones('Factura 612345678 · pedido 987654321'), [], 'bare nine digits outside phone context are ignored')
assert.deepEqual(contextualSpanishPhones('CIF B12345678 · Teléfono: 612 345 678'), ['612345678'])
assert.equal(exactPhoneCostCents(12.34), null, 'hydrated JavaScript numbers must never become monetary source values')
assert.equal(exactPhoneCostCents('12.34'), BigInt(1234))

const happy = calculatePhoneCostAnalytics(input())
assert.equal(happy.totales.ingresoBaseCentimos, '10000')
assert.equal(happy.totales.costeAsignablePropuestoCentimos, '1000')
assert.equal(happy.totales.porcentajeAsignablePorCosteBaseBp, 10000)
assert.equal(happy.totales.costeConfirmadoCentimos, null, 'confirmed legacy flag without durable assignment evidence is never counted')
assert.equal(happy.totales.margenConfirmado.centimos, null)
assert.equal(happy.totales.margenPotencialEstimado.centimos, '9000')
assert.equal(happy.totales.margenPotencialEstimado.porcentajeBp, null, 'potential margin must never synthesize 100%')
assert.equal(happy.deduplicacion.facturasEmitidasEspejoNoSumadas, 1, 'explicit FI mirrors are metadata only, never extra income')
assert.equal(doc(happy).costePropuestoCentimos, '1000')
assert.equal(doc(happy).baseNoAsignadaCentimos, '0')

const bankCensus = calculatePhoneCostAnalytics(input({ movimientosBancoTelefono: [
  { fecha: '2026-01-12', importeText: '-12.10', texto: 'DOMICILIACIÓN TELEFÓNICA · Teléfono: 612 345 678' },
  { fecha: '2026-01-12', importeText: '-99.00', texto: 'TELEFONICA ref 612345678' },
  { fecha: '2026-01-12', importeText: '-88.00', texto: 'TELEFONICA ref 698765432' },
] }))
assert.equal(bankCensus.bancoTelefono.estado, 'CALCULADO_SIN_ASIGNAR_COSTE')
assert.equal(bankCensus.bancoTelefono.movimientosTotal, 3)
assert.equal(bankCensus.bancoTelefono.movimientosConTelefono, 2, 'a bare token needs an exact explicit contract-phone corroboration')
assert.equal(bankCensus.bancoTelefono.movimientosConClienteUnico, 2)
assert.equal(bankCensus.bancoTelefono.importeBancoIdentificadoCentimos, '-11110')
assert.equal(bankCensus.bancoTelefono.usadoEnCoste, false)
assert.equal(bankCensus.totales.costeAsignablePropuestoCentimos, happy.totales.costeAsignablePropuestoCentimos, 'bank amount cannot become accrual cost')
assert.equal(bankCensus.totales.margenPotencialEstimado.centimos, happy.totales.margenPotencialEstimado.centimos, 'bank census cannot alter margin')

// Numeric JSON lexemes are transformed to source text before cents conversion.
// Quantity × unit price is accepted only when exact to a cent and VAT/total close.
const numericJsonLine = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0],
  lineasDetalleRaw: '[{"telefono":"612345678","cantidad":2,"precioUnitario":5,"iva":2.1,"importe":12.1}]',
}] }))
assert.equal(numericJsonLine.totales.costeAsignablePropuestoCentimos, '1000')
assert.equal(doc(numericJsonLine).costePropuestoCentimos, '1000')

const fractionalCent = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], baseText: '0.01',
  lineasDetalleRaw: '[{"telefono":"612345678","cantidad":1,"precioUnitario":0.001,"iva":0,"importe":0.001}]',
}] }))
assert.equal(fractionalCent.totales.costeAsignablePropuestoCentimos, '0', 'sub-cent JSON source is rejected, never rounded')
assert.ok(doc(fractionalCent).motivos.includes('SUBTOTAL_NO_VERIFICADO'))

// A non-economic/duplicate/confirming-like source is visible only as excluded metadata, never a cost.
const excluded = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], economica: false,
}] }))
assert.equal(excluded.totales.costeAsignablePropuestoCentimos, '0')
assert.equal(excluded.deduplicacion.documentosRecibidosExcluidos, 1)

// A multi-client document cannot assign its whole base to the first number; two line subtotals are retained exactly.
const twoClients = calculatePhoneCostAnalytics(input({
  clientes: [client, { id: 8, clienteContratoId: '43', clienteFacturaIspId: '90043', nombre: 'Otro cliente' }],
  contratos: [activeContract, { id: 11, clienteContratoId: '43', telefonosContrato: '623456789', fechaInicio: '2026-01-01', fechaBaja: null, activo: true }],
  documentosRecibidos: [{ ...input().documentosRecibidos[0], baseText: '15.00', lineasDetalleRaw: JSON.stringify([
    validLine[0], { descripcion: 'Línea: 623456789', base: '5.00', iva: '1.05', total: '6.05' },
  ]) }],
}))
assert.equal(twoClients.totales.costeAsignablePropuestoCentimos, '1500')
assert.equal(twoClients.clientes.find(row => row.cliente.id === 7)?.coste.asignablePropuestoCentimos, '1000')
assert.equal(twoClients.clientes.find(row => row.cliente.id === 8)?.coste.asignablePropuestoCentimos, '500')
assert.equal(twoClients.clientes.find(row => row.cliente.id === 7)?.margenPotencialEstimado.centimos, null, 'una factura compartida no acredita coste completo por cliente')

// A line subtotal must reconcile exactly: VAT mismatch and global-base overrun are review, never allocation.
const vatMismatch = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], lineasDetalleRaw: JSON.stringify([{ descripcion: 'Teléfono: 612345678', base: '10.00', iva: '2.00', total: '12.10' }]),
}] }))
assert.equal(vatMismatch.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(doc(vatMismatch).motivos.includes('IVA_LINEA_NO_CONCILIA'))

const exceedsInvoice = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], baseText: '9.99',
}] }))
assert.equal(exceedsInvoice.totales.costeAsignablePropuestoCentimos, '0')
assert.equal(exceedsInvoice.deduplicacion.lineasRechazadasPorControlBase, 1)
assert.ok(doc(exceedsInvoice).motivos.includes('SUMA_LINEAS_SUPERA_BASE_FACTURA'))

const unknownBase = calculatePhoneCostAnalytics(input({ documentosRecibidos: [{
  ...input().documentosRecibidos[0], baseText: 'no-disponible',
}] }))
assert.equal(unknownBase.totales.costeBaseDocumentadoCentimos, null)
assert.equal(unknownBase.totales.bolsaSinAsignar.importeDesconocidoCentimos, null)
assert.equal(unknownBase.totales.costeAsignablePropuestoCentimos, '0')
assert.equal(unknownBase.totales.margenPotencialEstimado.centimos, null, 'unknown supplier base cannot turn income minus zero into potential margin')
assert.ok(doc(unknownBase).motivos.includes('BASE_FACTURA_DESCONOCIDA'))

// Historical validity: a start after invoice and an end before invoice cannot be forced.
const startAfterInvoice = calculatePhoneCostAnalytics(input({ contratos: [{ ...activeContract, fechaInicio: '2026-02-01' }] }))
assert.equal(startAfterInvoice.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(doc(startAfterInvoice).motivos.includes('TELEFONO_SIN_CONTRATO_VIGENTE'))

const endBeforeInvoice = calculatePhoneCostAnalytics(input({ contratos: [{ ...activeContract, fechaBaja: '2026-01-11', activo: false }] }))
assert.equal(endBeforeInvoice.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(doc(endBeforeInvoice).motivos.includes('TELEFONO_SIN_CONTRATO_VIGENTE'))

const unknownStart = calculatePhoneCostAnalytics(input({ contratos: [{ ...activeContract, fechaInicio: null }] }))
assert.equal(unknownStart.totales.costeAsignablePropuestoCentimos, '0')
assert.equal(unknownStart.deduplicacion.contratosSinFechaInicio, 1)
assert.ok(doc(unknownStart).motivos.includes('VIGENCIA_ALTA_DESCONOCIDA'))

const ambiguous = calculatePhoneCostAnalytics(input({ contratos: [activeContract, { ...activeContract, id: 99 }] }))
assert.equal(ambiguous.totales.costeAsignablePropuestoCentimos, '0')
assert.equal(ambiguous.deduplicacion.telefonosConContratoDuplicado, 1)
assert.ok(doc(ambiguous).motivos.includes('TELEFONO_CONTRATO_AMBIGUO'))

// The same number may be reused later, but the invoice date selects exactly one
// historical contract; active-today status never replaces dated validity.
const temporalReuse = calculatePhoneCostAnalytics(input({
  clientes: [
    { id: 7, clienteContratoId: '42', clienteFacturaIspId: '90042', nombre: 'Cliente histórico' },
    { id: 8, clienteContratoId: '43', clienteFacturaIspId: '90043', nombre: 'Cliente posterior' },
  ],
  contratos: [
    { ...activeContract, clienteContratoId: '42', fechaInicio: '2025-01-01', fechaBaja: '2026-01-31', activo: false },
    { ...activeContract, id: 12, clienteContratoId: '43', fechaInicio: '2026-02-01', fechaBaja: null, activo: true },
  ],
}))
assert.equal(temporalReuse.clientes.find(row => row.cliente.id === 7)?.coste.asignablePropuestoCentimos, '1000')
assert.equal(temporalReuse.clientes.find(row => row.cliente.id === 8)?.coste.asignablePropuestoCentimos, undefined)

const duplicateConfirmation = calculatePhoneCostAnalytics(input({ costesConfirmados: [
  { id: 'same', facturaRecibidaId: 'r1', clienteId: 7, importeText: '10.00', confirmado: true, asignacionAcreditada: false },
  { id: 'same', facturaRecibidaId: 'r1', clienteId: 7, importeText: '10.00', confirmado: true, asignacionAcreditada: true },
] }))
assert.equal(duplicateConfirmation.totales.costeConfirmadoCentimos, null, 'a legacy duplicate cannot become an evidenced allocation')

// A Telefónica fixed PDF with a single evidenced service allocates the explicit
// invoice tax base as one proposal; four-decimal component charges are not summed.
const fijaHappy = calculatePhoneCostAnalytics(fijaInput())
assert.equal(fijaHappy.totales.costeAsignablePropuestoCentimos, '5879')
assert.equal(fijaDoc(fijaHappy).costePropuestoCentimos, '5879')
assert.equal(fijaDoc(fijaHappy).baseNoAsignadaCentimos, '0')
assert.equal(fijaDoc(fijaHappy).lineasPropuestas, 1, 'whole-PDF evidence is one proposal line, not a second OCR cost')
assert.ok(fijaDoc(fijaHappy).motivos.includes('EVIDENCIA_PDF_SERVICIO_UNICO'))
assert.equal(fijaHappy.clientes.find(row => row.cliente.id === 61)?.coste.asignablePropuestoCentimos, '5879')
assert.equal(fijaHappy.clientes.find(row => row.cliente.id === 61)?.margenPotencialEstimado.centimos, '4121')
assert.equal(fijaHappy.totales.costeConfirmadoCentimos, null, 'a staged PDF is only a proposal, never confirmed cost')
assert.equal(fijaHappy.bancoTelefono.usadoEnCoste, false)

// The contract must cover the full billed period: an invoice-date-only match is insufficient.
const fixaPartialPeriod = calculatePhoneCostAnalytics(fijaInput({ contratos: [{
  id: 101, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-08-15', fechaBaja: null, activo: true,
}] }))
assert.equal(fixaPartialPeriod.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(fijaDoc(fixaPartialPeriod).motivos.includes('TELEFONO_SIN_CONTRATO_VIGENTE'))

// Any overlap on even a single billed day is ambiguity, including a same-client contract.
const fixaOverlap = calculatePhoneCostAnalytics(fijaInput({ contratos: [
  { id: 101, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-07-01', fechaBaja: null, activo: true },
  { id: 102, clienteContratoId: '611', telefonosContrato: '973443349', fechaInicio: '2026-08-20', fechaBaja: '2026-08-25', activo: false },
] }))
assert.equal(fixaOverlap.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(fijaDoc(fixaOverlap).motivos.includes('TELEFONO_CONTRATO_AMBIGUO'))

// Redundant source identities and base text must agree exactly; trim is allowed
// only for invoice number. A 4-decimal base source and Float are rejected.
const fixaMismatch = calculatePhoneCostAnalytics(fijaInput({ documentosRecibidos: [{
  ...fijaInput().documentosRecibidos[0],
  evidenciasServicioUnico: [{ ...fijaEvidence, numeroFactura: 'OTRA' }],
}] }))
assert.equal(fixaMismatch.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(fijaDoc(fixaMismatch).motivos.includes('EVIDENCIA_PDF_INCONSISTENTE'))

const fixaFourDecimals = calculatePhoneCostAnalytics(fijaInput({ documentosRecibidos: [{
  ...fijaInput().documentosRecibidos[0],
  evidenciasServicioUnico: [{ ...fijaEvidence, baseFuenteText: '58.7900' }],
}] }))
assert.equal(fixaFourDecimals.totales.costeAsignablePropuestoCentimos, '0', 'evidence source base accepts exact cents only')

const fixaFloat = calculatePhoneCostAnalytics(fijaInput({ documentosRecibidos: [{
  ...fijaInput().documentosRecibidos[0],
  evidenciasServicioUnico: [{ ...fijaEvidence, baseFuenteText: 58.79 as unknown as string }],
}] }))
assert.equal(fixaFloat.totales.costeAsignablePropuestoCentimos, '0', 'hydrated float evidence is never accepted')

const fixaMultiPhone = calculatePhoneCostAnalytics(fijaInput({ documentosRecibidos: [{
  ...fijaInput().documentosRecibidos[0],
  evidenciasServicioUnico: [{ ...fijaEvidence, telefonosServicio: ['973443349', '612345678'] }],
}] }))
assert.equal(fixaMultiPhone.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(fijaDoc(fixaMultiPhone).motivos.includes('EVIDENCIA_PDF_INCONSISTENTE'))

const fixaAmbiguousPdf = calculatePhoneCostAnalytics(fijaInput({ documentosRecibidos: [{
  ...fijaInput().documentosRecibidos[0],
  evidenciasServicioUnico: [fijaEvidence, { ...fijaEvidence, pdfSha256: 'b'.repeat(64) }],
}] }))
assert.equal(fixaAmbiguousPdf.totales.costeAsignablePropuestoCentimos, '0')
assert.ok(fijaDoc(fixaAmbiguousPdf).motivos.includes('EVIDENCIA_PDF_AMBIGUA'))

const fixaRepeatedSamePdf = calculatePhoneCostAnalytics(fijaInput({ documentosRecibidos: [{
  ...fijaInput().documentosRecibidos[0],
  evidenciasServicioUnico: [fijaEvidence, { ...fijaEvidence, snapshotAt: '2026-10-24T10:00:00.000Z' }],
}] }))
assert.equal(fixaRepeatedSamePdf.totales.costeAsignablePropuestoCentimos, '5879', 'same-PDF snapshots dedupe, never double count')
assert.equal(fixaRepeatedSamePdf.totales.margenPotencialEstimado.centimos, '4121', 'proposal prevents a false income-minus-zero margin')

console.log('OK PHONE CORE: contexto de teléfono, +34/0034, CIF/IBAN/pedido excluidos, vigencia histórica, importes JSON lexemáticos exactos, desconocidos y no doble coste.')
