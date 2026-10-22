import assert from 'node:assert/strict'
import { calculateMonthlyInvoicing, exactSignedCents } from '../lib/finanzas/monthly-invoicing-core'
import { calculateFiscalEstimate } from '../lib/finanzas/fiscal-estimate-core'
import { parseMonthlyInvoicingDto } from '../components/finanzas/monthly-invoicing/response-parser'
import { parseFiscalEstimateDto } from '../components/finanzas/fiscal-estimate/response-parser'

assert.equal(exactSignedCents('12,34'), 1234)
assert.equal(exactSignedCents('-0.01'), -1)
assert.equal(exactSignedCents('1.234'), null)
const monthly = calculateMonthlyInvoicing([
  { id: 1, fechaISO: '2026-10-01', totalText: '100.00', serieFactura: 'A', idCliente: 1969 },
  { id: 2, fechaISO: '2026-10-03', totalText: '-20.00', serieFactura: 'A', idCliente: 1851 },
  { id: 3, fechaISO: '2026-10-04', totalText: '50.00', serieFactura: 'B', idCliente: 1967 },
  { id: 4, fechaISO: 'fecha-mala', totalText: '1.00', serieFactura: 'B', idCliente: null },
  { id: 5, fechaISO: '2026-10-04', totalText: '1.001', serieFactura: 'B', idCliente: null },
], [{ id: 1, fechaISO: '2026-10-05', totalText: '130.00' }], { mes: '2026-10' })
assert.equal(monthly.resumenMensual.length, 1)
assert.equal(monthly.resumenMensual[0].totalFacturadoCents, 13_000)
assert.equal(monthly.resumenMensual[0].mayoristasTotalCents, 13_000)
assert.equal(monthly.resumenMensual[0].totalRemesadoCents, 13_000)
assert.equal(monthly.diagnostics.invoicesExcludedInvalidDate, 1)
assert.equal(monthly.diagnostics.invoicesExcludedInvalidAmount, 1)
const parsedMonthly = parseMonthlyInvoicingDto({ recurso: 'resumenFacturacionIspHistorico', query: { mes: '2026-10' }, ...monthly })
assert.equal(parsedMonthly.ok, true)
const invalidSignature = parseMonthlyInvoicingDto({ recurso: 'resumenFacturacionIspHistorico', query: { mes: null }, resumenMensual: [], porSerie: [], diagnostics: { ...monthly.diagnostics, seriesMonth: null, source: 'FALSA' } })
assert.equal(invalidSignature.ok, false)

const fiscal = calculateFiscalEstimate({ desde: '2026-10-01', hasta: '2026-10-31' }, [
  { id: 'r-deducible', fechaISO: '2026-10-02', baseText: '100.00', ivaText: '21.00', irpfText: '15.00', totalText: '106.00', b2Economic: true, deducibleIva: true, rejected: false, confirmingDraxtonCommunication: false },
  { id: 'r-no-deducible', fechaISO: '2026-10-03', baseText: '200.00', ivaText: '42.00', irpfText: '30.00', totalText: '212.00', b2Economic: true, deducibleIva: false, rejected: false, confirmingDraxtonCommunication: false },
  { id: 'r-compuesta-invalida', fechaISO: '2026-10-04', baseText: '50.00', ivaText: '10.50', irpfText: '0.00', totalText: '99.99', b2Economic: true, deducibleIva: true, rejected: false, confirmingDraxtonCommunication: false },
], [
  { id: 'e-1', fechaISO: '2026-10-02', baseText: '300.00', ivaText: '63.00', irpfText: '0.00', totalText: '363.00', facturaISPId: 10, estado: 'EMITIDA' },
  { id: 'e-colision-a', fechaISO: '2026-10-03', baseText: '10.00', ivaText: '2.10', irpfText: '0.00', totalText: '12.10', facturaISPId: 99, estado: 'COBRADA' },
  { id: 'e-colision-b', fechaISO: '2026-10-04', baseText: '10.00', ivaText: '2.10', irpfText: '0.00', totalText: '12.10', facturaISPId: 99, estado: 'COBRADA' },
])
assert.equal(fiscal.recibidas.numFacturas, 2, 'recibida no deducible sigue en IRPF/base/total')
assert.equal(fiscal.recibidas.ivaSoportadoCents, 2_100, 'IVA no deducible no entra en IVA soportado')
assert.equal(fiscal.recibidas.irpfRetenidoCents, 4_500, 'IRPF incluye recibida no deducible')
assert.equal(fiscal.diagnostics.receivedExcludedNonDeductibleVat, 1)
assert.equal(fiscal.diagnostics.receivedExcludedInexactEconomics, 1)
assert.equal(fiscal.emitidas.numFacturas, 1)
assert.equal(fiscal.emitidas.porEstado.EMITIDA, 1, 'estado se preserva sólo como transparencia')
assert.equal(fiscal.diagnostics.emittedExcludedFiIspIdentityCollision, 2)
assert.equal(fiscal.ivaNetoDocumentalCents, 4_200)
const parsedFiscal = parseFiscalEstimateDto({ recurso: 'estimacionFiscalDocumental', estimacion: fiscal })
assert.equal(parsedFiscal.ok, true)
if (parsedFiscal.ok) assert.equal(parsedFiscal.value.estimacion.diagnostics.notices.length, 4)
const zeroMonth = calculateMonthlyInvoicing([
  { id: 1, fechaISO: '2026-10-01', totalText: '100.00', serieFactura: 'A', idCliente: 1969 },
  { id: 2, fechaISO: '2026-10-02', totalText: '-100.00', serieFactura: 'B', idCliente: null },
], [], { mes: '2026-10' })
assert.equal(zeroMonth.resumenMensual[0].mayoristasPorcentajeCentimas, null, 'No dividir por cero ni presentar 0%')
assert.equal(parseMonthlyInvoicingDto({ recurso: 'resumenFacturacionIspHistorico', query: { mes: '2026-10' }, ...zeroMonth }).ok, true)
console.log('OK resumenes: núcleo, parsers, firmas y porcentaje no calculable')
