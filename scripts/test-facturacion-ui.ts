import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildBankInvoicingAnalytics } from '../lib/finanzas/bank-invoicing-analytics'
import { invoiceMatchesB7Query, parseB7GetQuery } from '../lib/finanzas/bank-invoicing-contract'
import type { BankCoverage, InvoiceSettlement } from '../lib/finanzas/bank-invoicing-core'
import { BUCKET_LABEL, bucketOf, buildAlerts, cuadra, fmtEur, monthRows, parseLineas, reasonPlain, syncText, totales, visibleMonths } from '../app/admin/facturacion/model'
import type { B7ReadDto } from '../components/finanzas/facturacion-banco/typesparser'

function inv(id: string, cliente: string, fecha: string, venc: string | null, total: number, paid: number, state: InvoiceSettlement['paymentState'], num: string): InvoiceSettlement {
  return { invoiceId: id, numFactura: num, cliente, fechaISO: fecha, fechaVencimientoISO: venc, facturaISPId: null, targetCents: total, paidDocumentaryCents: state === 'PENDIENTE_COBRO_REVISION' ? null : paid, remainingCents: state === 'PENDIENTE_COBRO_REVISION' ? null : total - paid, cashCents: null, attributableCashDifferenceCents: null, paymentSources: [], paymentState: state, reasons: [] }
}
const known: BankCoverage = { status: 'KNOWN', asOf: '2026-10-01', activeAccountCount: 5, accountsWithKnownCutoff: 5 }
const rows: InvoiceSettlement[] = [
  inv('1', 'DRAXTON EUROPE', '2026-01-10', '2026-02-10', 100_00, 100_00, 'COBRADA_CALCULADA', 'DRAX26/1'),
  inv('2', 'DRAXTON POWERTRAIN', '2026-03-05', '2026-04-05', 200_00, 0, 'PENDIENTE_COBRO', 'DRAX26/2'),
  inv('3', 'ACME', '2026-10-20', '2026-11-20', 50_00, 0, 'PENDIENTE_COBRO', 'CLL26/3'),
  inv('4', 'ACME', '2026-10-21', null, 30_00, 10_00, 'PENDIENTE_COBRO', 'CLL26/4'),
  inv('5', 'BETA', '2026-02-02', null, 70_00, 0, 'PENDIENTE_COBRO_REVISION', 'CLL26/5'),
  inv('6', 'BETA', '2026-02-12', '2026-03-02', 40_00, 40_00, 'COBRADA_CALCULADA', 'CLL26/6'),
]
const series = new Map<string, string | null>([['1', 'DRAX'], ['2', 'DRAX'], ['3', 'CLL'], ['4', 'CLL'], ['5', 'CLL'], ['6', 'CLL']])
const analitica = buildBankInvoicingAnalytics({ settlements: rows, serieById: series, coverage: known, query: { q: null, mes: null, anio: 2026, estado: null }, today: '2026-11-24', matching: rows })
const facturado = rows.reduce((s, r) => s + (r.targetCents ?? 0), 0)
const confirmado = rows.reduce((s, r) => s + (r.paidDocumentaryCents ?? 0), 0) // incluye cobros parciales, como el servidor
const money = (c: number | null) => ({ cents: c, knownCents: c, unknownInvoiceCount: 0 })
const dto = { summary: { facturado: money(facturado), cobroDocumentalConfirmado: money(confirmado), pendienteNoConfirmado: money(facturado - confirmado), diferenciasCaja: { atribuible: money(0), sinAtribuir: money(0) }, invoicesTotal: rows.length, cobradasCalculadas: 2, pendientesCobro: 3, revisiones: 1 }, analitica, bankCoverage: known, items: rows, pagination: { limit: 50, offset: 0, total: rows.length } } as unknown as B7ReadDto

test('confirmado + por confirmar + sin extracto = facturado (la comprobación ✔ cuadra)', () => {
  const t = totales(dto)
  assert.equal(t.confirmado, confirmado)
  assert.equal(t.porConfirmar + t.sinExtracto + (t.confirmado ?? 0), facturado)
  const c = cuadra(t)
  assert.equal(c.ok, true, `diferencia ${c.diff}`)
})
test('si algo no cuadra, la comprobación lo dice en vez de mostrar ✔', () => {
  const t = totales(dto)
  assert.equal(cuadra({ ...t, sinExtracto: t.sinExtracto + 500 }).ok, false)
  assert.equal(cuadra({ ...t, facturado: t.base + 700 }).ok, false)
  assert.equal(cuadra({ ...t, facturado: null }).ok, true)
})
test('clasificación en pantalla = clasificación del servidor (ámbar solo con corte verificado)', () => {
  assert.equal(bucketOf(rows[1], '2026-10-01'), 'REAL')
  assert.equal(bucketOf(rows[2], '2026-10-01'), 'SIN_EXTRACTO')
  assert.equal(bucketOf(rows[1], null), 'SIN_EXTRACTO')
  assert.equal(bucketOf(rows[4], '2026-10-01'), 'REVISION')
  assert.equal(bucketOf(rows[0], null), 'COBRADA')
  assert.equal(BUCKET_LABEL.REAL, 'Por confirmar')
})
test('filtros serie y cobro: se aceptan, se validan y no alteran el contrato anterior', () => {
  const ok = parseB7GetQuery(new URLSearchParams('anio=2026&serie=DRAX&cobro=por_confirmar&limit=50'))
  assert.equal(ok.serie, 'DRAX'); assert.equal(ok.cobro, 'por_confirmar')
  assert.throws(() => parseB7GetQuery(new URLSearchParams('cobro=pendiente_real')))
  assert.throws(() => parseB7GetQuery(new URLSearchParams('serie=%3Bdrop')))
  const plain = parseB7GetQuery(new URLSearchParams('mes=2026-10'))
  assert.equal(plain.serie ?? null, null); assert.equal(plain.cobro ?? null, null)
  assert.equal(invoiceMatchesB7Query(rows[0], { q: null, mes: null, estado: null, anio: 2026 }), true)
})
test('analítica por cliente: cobrado y en revisión salen de los mismos céntimos de B7', () => {
  const all = [...analitica.topClientes, ...(analitica.restoClientes ? [analitica.restoClientes] : [])]
  const beta = analitica.topClientes.find(c => c.cliente.startsWith('BETA'))
  assert.ok(beta); assert.equal(beta.revision, 70_00); assert.equal(beta.cobrado, 40_00)
  assert.equal(all.reduce((s, c) => s + c.cobrado, 0), confirmado)
  assert.equal(all.reduce((s, c) => s + c.facturado, 0), facturado)
  for (const c of all) assert.equal(c.cobrado + c.pendienteReal + c.revision + c.sinExtracto <= c.facturado + 1, true)
})
test('meses visibles: el año en curso llega hasta el mes actual; los cerrados, 12', () => {
  assert.equal(visibleMonths(2026, new Date('2026-11-25T10:00:00Z')), 11)
  assert.equal(visibleMonths(2025, new Date('2026-11-25T10:00:00Z')), 12)
})
test('mes a mes: sin resumen ISP no se inventan mayoristas ni remesas (sin dato)', () => {
  const m = monthRows(analitica, null, 2026)
  assert.equal(m.length, 12); assert.equal(m[0].may, null); assert.equal(m[0].rem, null)
  assert.equal(m.reduce((s, r) => s + r.fact, 0) * 100, facturado)
})
test('alertas: salen de los datos; sin datos, ninguna', () => {
  const al = buildAlerts(dto, monthRows(analitica, null, 2026), null, 2026, new Date('2026-11-25T10:00:00Z'))
  const titles = al.map(a => a.title)
  assert.ok(titles.includes('Por confirmar en banco')); assert.ok(titles.includes('Facturas en revisión'))
  assert.ok(al.every(a => a.tone !== 'b'), 'ninguna alerta en rojo: por confirmar es ámbar')
  assert.equal(buildAlerts({ ...dto, analitica: null } as B7ReadDto, [], null, 2026, new Date()).length, 0)
})
test('líneas de factura: acepta JSON o lista, y lo que falta queda en null (sin dato)', () => {
  assert.deepEqual(parseLineas('[{"concepto":"Cuota","importe":"10,5"}]'), [{ concepto: 'Cuota', contrato: null, importe: 10.5 }])
  assert.deepEqual(parseLineas('no es json'), []); assert.deepEqual(parseLineas(null), [])
})
test('textos en llano: sin códigos internos', () => {
  assert.equal(reasonPlain('CODIGO_NUEVO'), 'Motivo sin descripción; revisar en Conciliar.')
  assert.equal(fmtEur(null), 'sin dato')
  assert.match(syncText(null, null, null), /sin sincronización registrada/)
  assert.match(syncText('2026-11-20T10:00:00Z', 'COMPLETED', '2026-10-01'), /bancos hasta 01\/10/)
})
test('la pantalla no muestra textos técnicos ni etiquetas de maqueta', () => {
  const src = ['FacturacionClient.tsx', 'model.ts', 'charts.tsx'].map(f => readFileSync(new URL(`../app/admin/facturacion/${f}`, import.meta.url), 'utf8')).join('\n')
  const visible = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const bad of ['FacturaEmitida', 'Evidencia B4', 'Evidencia B6', 'Espejo ISP', 'pendiente real', 'Pendiente real', 'className="ex"', 'ejemplo', 'snapshot']) assert.equal(visible.includes(bad), false, `texto no permitido: ${bad}`)
  assert.ok(!/<(h\d|p|span|b|div)[^>]*>[^<]*B[4-7]\b/.test(visible), 'sin claves B4/B6/B7 en pantalla')
})
test('la pantalla no escribe: solo lecturas y el panel de sincronización existente', () => {
  const src = readFileSync(new URL('../app/admin/facturacion/FacturacionClient.tsx', import.meta.url), 'utf8')
  assert.equal(/method:\s*['"](POST|PUT|PATCH|DELETE)/.test(src), false)
  assert.ok(src.includes('SyncJobPanel')); assert.ok(src.includes('source="ISP"'))
})
test('la página sirve el nuevo cliente y conserva los componentes antiguos para volver atrás', () => {
  const page = readFileSync(new URL('../app/admin/facturacion/page.tsx', import.meta.url), 'utf8')
  assert.ok(page.includes('FacturacionClient')); assert.equal(page.includes('BankInvoicingWorkspace'), false)
  readFileSync(new URL('../components/finanzas/facturacion-banco/BankInvoicingWorkspace.tsx', import.meta.url), 'utf8')
})
