import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBankInvoicingAnalytics, classifyInvoice, clientGroup, serieFromInvoiceNumber } from '../lib/finanzas/bank-invoicing-analytics'
import { invoiceMatchesB7Query, parseB7GetQuery, sortInvoicesB7 } from '../lib/finanzas/bank-invoicing-contract'
import { summarizeBankInvoicing, type BankCoverage, type InvoiceSettlement } from '../lib/finanzas/bank-invoicing-core'

function inv(id: string, cliente: string, fecha: string, venc: string | null, total: number, paid: number, state: InvoiceSettlement['paymentState'], num = `CLL26/${id}`): InvoiceSettlement {
  return { invoiceId: id, numFactura: num, cliente, fechaISO: fecha, fechaVencimientoISO: venc, facturaISPId: null, targetCents: total, paidDocumentaryCents: state === 'PENDIENTE_COBRO_REVISION' ? null : paid, remainingCents: state === 'PENDIENTE_COBRO_REVISION' ? null : total - paid, cashCents: null, attributableCashDifferenceCents: null, paymentSources: [], paymentState: state, reasons: [] }
}
const known: BankCoverage = { status: 'KNOWN', asOf: '2026-10-01', activeAccountCount: 5, accountsWithKnownCutoff: 5 }
const unknown: BankCoverage = { status: 'UNKNOWN', asOf: null, activeAccountCount: 5, accountsWithKnownCutoff: 0 }
const rows: InvoiceSettlement[] = [
  inv('1', 'DRAXTON EUROPE & ASIA S.L.U.', '2026-01-10', '2026-02-10', 100_00, 100_00, 'COBRADA_CALCULADA', 'DRAX26/1'),
  inv('2', 'DRAXTON POWERTRAIN & CHASSIS, S.L.', '2026-03-05', '2026-04-05', 200_00, 0, 'PENDIENTE_COBRO', 'DRAX26/2'),
  inv('3', 'ACME', '2026-10-20', '2026-11-20', 50_00, 0, 'PENDIENTE_COBRO', 'CLL26/3'),
  inv('4', 'ACME', '2026-10-21', null, 30_00, 10_00, 'PENDIENTE_COBRO', 'CLL26/4'),
  inv('5', 'BETA', '2026-02-02', null, 70_00, 0, 'PENDIENTE_COBRO_REVISION', 'CLL26/5'),
  inv('6', 'BETA', '2025-12-02', '2026-01-02', 40_00, 40_00, 'COBRADA_CALCULADA', 'CLL25/6'),
]
const series = new Map<string, string | null>([['1', 'DRAX'], ['2', 'DRAX'], ['3', 'CLL'], ['4', 'CLL'], ['5', 'CLL'], ['6', null]])
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

test('pendiente real frente a sin extracto: depende del corte bancario verificado', () => {
  const a = buildBankInvoicingAnalytics({ settlements: rows, serieById: series, coverage: known, query: { q: null, mes: null, anio: 2026, estado: null }, today: '2026-11-24', matching: rows.filter((r) => invoiceMatchesB7Query(r, { q: null, mes: null, estado: null, anio: 2026 })) })
  assert.equal(a.desglosePendiente.real.cents, 200_00) // vence 05/04 <= corte 01/10
  assert.equal(a.desglosePendiente.sinExtracto.cents, 50_00 + 20_00) // vence 20/11 y sin vencimiento (21/10) > corte
  assert.equal(a.desglosePendiente.revision.count, 1)
  const b = buildBankInvoicingAnalytics({ settlements: rows, serieById: series, coverage: unknown, query: { q: null, mes: null, anio: 2026, estado: null }, today: '2026-11-24', matching: rows })
  assert.equal(b.desglosePendiente.real.cents, 0, 'sin cobertura no se afirma deuda real')
  assert.equal(b.desglosePendiente.sinExtracto.cents, 200_00 + 50_00 + 20_00)
})

test('las gráficas suman exactamente lo mismo que las tarjetas', () => {
  const matching = rows.filter((r) => invoiceMatchesB7Query(r, { q: null, mes: null, estado: null, anio: 2026 }))
  const a = buildBankInvoicingAnalytics({ settlements: rows, serieById: series, coverage: known, query: { q: null, mes: null, anio: 2026, estado: null }, today: '2026-11-24', matching })
  const summary = summarizeBankInvoicing(matching, null)
  assert.equal(sum(a.porSerie.map((s) => s.facturado)), summary.facturado.cents)
  assert.equal(sum(a.topClientes.map((c) => c.facturado)) + (a.restoClientes?.facturado ?? 0), summary.facturado.cents)
  assert.equal(sum(a.mensual.map((m) => m.facturado)), summary.facturado.cents)
  assert.equal(sum(a.mensual.map((m) => m.cobrado + m.pendienteReal + m.sinExtracto + m.revision)), summary.facturado.cents)
  assert.equal(sum(a.antiguedad.map((x) => x.pendienteReal + x.sinExtracto)), a.desglosePendiente.real.cents + a.desglosePendiente.sinExtracto.cents)
  assert.equal(a.mensual[0].facturadoPrevio, 0)
  const full = buildBankInvoicingAnalytics({ settlements: rows, serieById: series, coverage: known, query: { q: null, mes: null, anio: 2026, estado: null }, today: '2026-11-24', matching })
  assert.equal(full.anioPrevio, 2025)
  assert.equal(full.mensual[11].facturadoPrevio, 40_00)
})

test('Draxton se agrupa como un solo cliente y la serie sale del campo o del número', () => {
  assert.equal(clientGroup('DRAXTON POWERTRAIN & CHASSIS, S.L.').key, clientGroup('Draxton Europe & Asia').key)
  const a = buildBankInvoicingAnalytics({ settlements: rows, serieById: series, coverage: known, query: { q: null, mes: null, anio: null, estado: null }, today: '2026-11-24', matching: rows })
  const dr = a.topClientes.find((c) => c.cliente.startsWith('Draxton'))
  assert.equal(dr?.sociedades, 2)
  assert.equal(dr?.facturado, 300_00)
  assert.equal(serieFromInvoiceNumber('CLL26/12'), 'CLL')
  assert.equal(serieFromInvoiceNumber('AF/03830/2026//1'), 'AF')
  assert.ok(a.porSerie.some((s) => s.serie === 'CLL'))
})

test('antigüedad por tramos y clasificación de revisión', () => {
  const a = buildBankInvoicingAnalytics({ settlements: rows, serieById: series, coverage: known, query: { q: null, mes: null, anio: 2026, estado: null }, today: '2026-11-24', matching: rows })
  const t = Object.fromEntries(a.antiguedad.map((x) => [x.tramo, x.pendienteReal + x.sinExtracto]))
  assert.equal(t['31-60 días'], 50_00 + 20_00) // 20/10 y 21/10 -> 35 y 34 días
  assert.equal(t['181-365 días'], 200_00) // 05/03 -> 264 días
  assert.equal(classifyInvoice(rows[4], known.asOf), 'REVISION')
})

test('filtro por año en el contrato: anio y mes coherentes', () => {
  const q = parseB7GetQuery(new URLSearchParams('anio=2026'))
  assert.equal(q.anio, 2026)
  assert.equal(parseB7GetQuery(new URLSearchParams('mes=2026-03')).anio, 2026)
  assert.throws(() => parseB7GetQuery(new URLSearchParams('anio=1999')), /anio/)
  assert.throws(() => parseB7GetQuery(new URLSearchParams('anio=2025&mes=2026-03')), /no coinciden/)
  assert.deepEqual(sortInvoicesB7(rows.filter((r) => invoiceMatchesB7Query(r, { q: null, mes: null, estado: null, anio: 2025 }))).map((r) => r.invoiceId), ['6'])
})
