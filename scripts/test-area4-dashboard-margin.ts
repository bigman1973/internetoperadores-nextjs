import test from 'node:test'
import assert from 'node:assert/strict'
import { totalsOf } from '../app/admin/rentabilidad/io-model'
import { projectDashboardMargin, latestDashboardMarginSnapshot } from '../lib/area4/dashboard-native-projection'
import type { Row } from '../app/admin/rentabilidad/view-model'

// All figures and rows are synthetic: no real product, customer or snapshot data.
const month = '2026-10'
const project = (rows: Row[], period = month) => projectDashboardMargin(rows, month, period)
const documented: Row = { product: 'Producto ficticio A', contracts: 2, income: 200, rawIncome: 200, cost: 80, rawCost: 80, estimatedCost: 20, rawEstimatedCost: 20 }

test('usa totalsOf sin otra fórmula: coste real + estimado y calidad original intacta', () => {
  const rows = [documented, { product: 'Producto ficticio B', income: 50, cost: 25 }]
  const before = structuredClone(rows)
  const total = totalsOf(rows, 'real')
  assert.equal(total.margin, 125)
  assert.equal(total.marginPct, 50)
  assert.equal(total.quality, 84)
  assert.deepEqual(project(rows), { month, value: total.marginPct, reliability: total.quality, provisional: true })
  assert.deepEqual(rows, before)
})

test('filas estructurales vacías con null no anulan el agregado conocido', () => {
  const emptyRows: Row[] = [
    { product: 'Catálogo ficticio sin actividad', contracts: 0, income: null, rawIncome: null, cost: null, rawCost: null, estimatedCost: null },
    { income: 0, rawIncome: 0, cost: null, rawCost: null, contracts: 0 },
    { income: null, rawIncome: null, cost: 0, rawCost: 0, contracts: 0 },
    { income: 0, cost: 0, pending: true },
  ]
  assert.equal(project([documented, ...emptyRows]).value, totalsOf([documented], 'real').marginPct)
  assert.equal(project([documented, ...emptyRows]).provisional, true)
  assert.equal(project(emptyRows).value, null)
})

test('ceros numéricos pendientes de productos no ocultan el coste agregado conocido', () => {
  const rows = [documented, { product: 'Servicio ficticio pendiente', contracts: 3, income: 100, rawIncome: 100, cost: 0, rawCost: 0, estimatedCost: 0, pending: true }]
  assert.equal(project(rows).value, totalsOf(rows, 'real').marginPct)
  assert.equal(project(rows).provisional, true)
})

test('coste null de una fila material bloquea también cuando otras filas tienen coste conocido', () => {
  for (const missing of [null, undefined, '', NaN, Infinity, true, 'desconocido']) {
    assert.equal(project([documented, { income: 100, rawIncome: 100, cost: missing, rawCost: missing, pending: true }]).value, null)
  }
  assert.equal(project([documented, { income: 100, cost: null, estimatedCost: 25, pending: true }]).value, null)
  assert.equal(project([documented, { contracts: 1, income: 0, cost: null }]).value, null)
})

test('ingreso null de una fila material no se convierte en cero', () => {
  assert.equal(project([documented, { income: null, rawIncome: null, cost: 40, rawCost: 40 }]).value, null)
  assert.equal(project([documented, { income: null, cost: 0, estimatedCost: 10 }]).value, null)
  assert.equal(project([documented, { contracts: 1, income: null, cost: 0 }]).value, null)
  assert.equal(project([documented, { incomePending: true, income: null, cost: null }]).value, null)
})

test('sin coste conocido real ni estimado nunca inventa 100 % con pendiente', () => {
  assert.equal(project([{ income: 100, cost: null, pending: true }]).value, null)
  assert.equal(project([{ income: 100, cost: 0, pending: true }]).value, null)
  assert.equal(project([{ income: 100, cost: 0, pendingCost: true }]).value, null)
  assert.equal(project([{ income: 100, cost: 0, status: 'PENDIENTE' }]).value, null)
  assert.equal(project([{ income: 100, cost: 0, estimatedCost: 10, pending: true }]).value, 90)
})

test('coste cero explícito y no pendiente sí puede acreditar un 100 %', () => {
  assert.deepEqual(project([{ income: 100, cost: 0 }]), { month, value: 100, reliability: null, provisional: false })
})

test('respeta campos raw y su precisión y no muta filas ni totales', () => {
  const rows = [{ income: 100, rawIncome: 100.004, cost: 60, rawCost: 60.004, estimatedCost: 7, rawEstimatedCost: 10.004 }]
  assert.equal(project(rows).value, totalsOf(rows, 'real').marginPct)
  assert.equal(project(rows).provisional, true)
  assert.equal(project([{ income: '100', cost: '60' }]).value, 40)
  assert.equal(project([{ rawIncome: null, income: 100, rawCost: null, cost: 60 }]).value, 40)
})

test('mes posterior a la foto, población vacía y denominador cero permanecen sin dato', () => {
  assert.equal(project([documented], '2026-09').value, null)
  assert.equal(project([]).value, null)
  assert.equal(project([{ income: 0, cost: 0 }]).value, null)
  assert.equal(project([{ income: 0, cost: 50 }]).value, null)
  assert.equal(project([{ income: 100, cost: 150 }]).value, -50)
})

test('foto de octubre frente al mes abierto: PROYECCION y CIERRE no comparten numeración', () => {
  const snapshots = [{ month: '2026-11', kind: 'PROYECCION', version: 9 }, { month: '2026-10', kind: 'CIERRE', version: 99 }, { month: '2026-10', kind: 'PROYECCION', version: 11 }, { month: '2026-10', kind: 'PROYECCION', version: 1 }]
  const before = structuredClone(snapshots)
  assert.deepEqual(latestDashboardMarginSnapshot(snapshots, 2026, 11), snapshots[2])
  assert.deepEqual(snapshots, before)
})

test('enero permite diciembre del año anterior y no acepta meses malformados o futuros', () => {
  const december = { month: '2026-12', kind: 'PROYECCION', version: 3 }
  assert.deepEqual(latestDashboardMarginSnapshot([december, { month: '2027-01', version: 4 }, { month: '2026-99', version: 90 }, { month: 'unknown', version: 1 }], 2027, 1), december)
  assert.equal(latestDashboardMarginSnapshot([], 2026, 11), undefined)
})
