import assert from 'node:assert/strict'
import test from 'node:test'
import { formatEuroExact, parseBankInvoicingDto } from '../components/finanzas/facturacion-banco/typesparser'

function aggregate(cents: number | null, knownCents = cents ?? 0, unknownInvoiceCount = cents === null ? 1 : 0) {
  return { cents, knownCents, unknownInvoiceCount }
}

function baseResponse() {
  return {
    recurso: 'facturacionBancoB7',
    query: { q: null, mes: null, estado: null, limit: 50, offset: 0 },
    pagination: { limit: 50, offset: 0, total: 1 },
    summary: {
      facturado: aggregate(12_345),
      cobroDocumentalConfirmado: aggregate(0),
      pendienteNoConfirmado: aggregate(12_345),
      diferenciasCaja: { atribuible: aggregate(0), sinAtribuir: aggregate(0) },
      invoicesTotal: 1,
      cobradasCalculadas: 0,
      pendientesCobro: 1,
      revisiones: 0,
    },
    bankCoverage: { status: 'KNOWN', asOf: '2026-10-22', activeAccountCount: 1, accountsWithKnownCutoff: 1 },
    items: [{
      invoiceId: 'fi-001', numFactura: 'F-001', cliente: 'Cliente de prueba',
      fechaISO: '2026-10-02', fechaVencimientoISO: '2026-11-01', facturaISPId: 17,
      targetCents: 12_345, paidDocumentaryCents: 0, remainingCents: 12_345,
      cashCents: null, attributableCashDifferenceCents: null,
      paymentSources: [], paymentState: 'PENDIENTE_COBRO', reasons: [],
    }],
    calculationBasis: 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA',
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

test('acepta una factura de crédito negativa, firmada y documentada', () => {
  const dto = baseResponse()
  dto.summary.facturado = aggregate(-10_050)
  dto.summary.cobroDocumentalConfirmado = aggregate(-10_050)
  dto.summary.pendienteNoConfirmado = aggregate(0)
  dto.summary.cobradasCalculadas = 1
  dto.summary.pendientesCobro = 0
  dto.items[0] = {
    ...dto.items[0], targetCents: -10_050, paidDocumentaryCents: -10_050, remainingCents: 0,
    cashCents: -10_050, attributableCashDifferenceCents: 0,
    paymentSources: ['B4_DIRECTO'], paymentState: 'COBRADA_CALCULADA',
  }

  const result = parseBankInvoicingDto(dto)
  if (result.ok === false) throw new Error(result.error)
  assert.equal(result.ok, true)
  assert.equal(result.value.items[0].targetCents, -10_050)
  assert.equal(result.value.items[0].paidDocumentaryCents, -10_050)
  assert.equal(result.value.summary.facturado.cents, -10_050)
})

test('conserva cero conocido, sin convertirlo en importe desconocido', () => {
  const dto = baseResponse()
  dto.summary.facturado = aggregate(0, 0, 0)
  dto.summary.cobroDocumentalConfirmado = aggregate(0, 0, 0)
  dto.summary.pendienteNoConfirmado = aggregate(0, 0, 0)
  dto.items[0] = {
    ...dto.items[0], targetCents: 0, paidDocumentaryCents: 0, remainingCents: 0,
    paymentState: 'PENDIENTE_COBRO', reasons: ['TOTAL_CERO_SIN_COBRO_EXIGIBLE'],
  }

  const result = parseBankInvoicingDto(dto)
  if (result.ok === false) throw new Error(result.error)
  assert.equal(result.ok, true)
  assert.equal(result.value.summary.facturado.cents, 0)
  assert.equal(result.value.summary.facturado.knownCents, 0)
  assert.equal(result.value.items[0].remainingCents, 0)
})

test('conserva aggregate desconocido null y parte conocida en lugar de sustituirlo por cero', () => {
  const dto = baseResponse()
  dto.summary.facturado = aggregate(null, 1_250, 2)
  dto.summary.cobroDocumentalConfirmado = aggregate(null, -10, 1)
  dto.summary.pendienteNoConfirmado = aggregate(null, 1_260, 2)
  dto.items[0] = {
    ...dto.items[0], targetCents: null, paidDocumentaryCents: null, remainingCents: null,
    paymentState: 'PENDIENTE_COBRO_REVISION', reasons: ['IMPORTE_FUENTE_INEXACTO_O_AUSENTE'],
  }

  const result = parseBankInvoicingDto(dto)
  if (result.ok === false) throw new Error(result.error)
  assert.equal(result.ok, true)
  assert.equal(result.value.summary.facturado.cents, null)
  assert.equal(result.value.summary.facturado.knownCents, 1_250)
  assert.equal(result.value.summary.facturado.unknownInvoiceCount, 2)
  assert.equal(result.value.items[0].remainingCents, null)
})

test('rechaza respuesta sin summary en vez de presentar KPIs a cero', () => {
  const dto = clone(baseResponse()) as Record<string, unknown>
  delete dto.summary
  const result = parseBankInvoicingDto(dto)
  assert.equal(result.ok, false)
  if (result.ok === false) assert.match(result.error, /summary/)
})

test('valida página, conserva sólo metadata FI explícita y permite fechas null con revisión', () => {
  const dto = baseResponse()
  dto.pagination = { limit: 50, offset: 50, total: 52 }
  dto.query = { q: 'acme', mes: '2026-10', estado: 'PENDIENTE_COBRO_REVISION', limit: 50, offset: 50 }
  dto.items = [{
    invoiceId: 'fi-explicita-7', numFactura: null, cliente: null,
    fechaISO: null, fechaVencimientoISO: null, facturaISPId: 9001,
    targetCents: 1_500, paidDocumentaryCents: null, remainingCents: null,
    cashCents: null, attributableCashDifferenceCents: null,
    paymentSources: ['B4_REMESA'], paymentState: 'PENDIENTE_COBRO_REVISION',
    reasons: ['RAZON_NUEVA_SIN_TRADUCCION'],
  }]

  const result = parseBankInvoicingDto(dto)
  if (result.ok === false) throw new Error(result.error)
  assert.equal(result.ok, true)
  const row = result.value.items[0]
  assert.equal(result.value.pagination.offset, 50)
  assert.equal(result.value.pagination.total, 52)
  assert.equal(row.invoiceId, 'fi-explicita-7')
  assert.equal(row.facturaISPId, 9001)
  assert.equal(row.fechaISO, null)
  assert.equal(row.fechaVencimientoISO, null)
  assert.equal(row.remainingCents, null)
  assert.equal(row.paymentState, 'PENDIENTE_COBRO_REVISION')
  assert.deepEqual(row.reasons, ['RAZON_NUEVA_SIN_TRADUCCION'])
})

test('limita filas de transporte a una página contractual de 100', () => {
  const dto = baseResponse()
  dto.query.limit = 100
  dto.pagination.limit = 100
  dto.pagination.total = 101
  dto.items = Array.from({ length: 101 }, (_, index) => ({ ...dto.items[0], invoiceId: `fi-${index}` }))
  const result = parseBankInvoicingDto(dto)
  assert.equal(result.ok, false)
  if (result.ok === false) assert.match(result.error, /100 elementos|límite de página/)
})

test('formatea céntimos exactos sin flotantes ni redondeo', () => {
  assert.equal(formatEuroExact(0), '0,00 €')
  assert.equal(formatEuroExact(123_456_789), '1.234.567,89 €')
  assert.equal(formatEuroExact(-5), '-0,05 €')
  assert.throws(() => formatEuroExact(1.5), /entero seguro/)
})

test('conserva null también en el subtotal cuando no hay una parte verificable', () => {
  const dto = baseResponse()
  dto.summary.facturado.cents = null
  dto.summary.facturado.knownCents = null
  const result = parseBankInvoicingDto(dto)
  if (result.ok === false) throw new Error(result.error)
  assert.equal(result.value.summary.facturado.knownCents, null)
  assert.notEqual(result.value.summary.facturado.knownCents, 0)
})
