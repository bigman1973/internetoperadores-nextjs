import assert from 'node:assert/strict'
import test, { after, mock } from 'node:test'
import { readFileSync } from 'node:fs'
import { Socket } from 'node:net'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma, classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { desglose, fotoCompleta, leerFoto, leerDatos } from '../lib/rentabilidad/desglose-datos'
import { conFoto, fechaFoto, metadataFoto } from '../lib/rentabilidad/desglose-foto'
import { construirDesglose } from '../lib/rentabilidad/desglose'
import { getRentabilidadReport } from '../lib/rentabilidad/report'
import { failure, parseQuery, querySchema } from '../app/api/admin/rentabilidad/_shared'
import { RentabilidadError } from '../lib/rentabilidad/types'

// Reemplazo en memoria del método Prisma nativo: ninguna consulta puede alcanzar BD/red.
const noNetwork = mock.method(Socket.prototype, 'connect', () => { throw new Error('TEST_NETWORK_FORBIDDEN') })
const noFetch = mock.method(globalThis, 'fetch', async () => { throw new Error('TEST_NETWORK_FORBIDDEN') })
after(() => { assert.equal(noNetwork.mock.callCount(), 0); assert.equal(noFetch.mock.callCount(), 0); mock.restoreAll() })
const MONTH = '2026-10'
const OLD = '11111111-1111-4111-8111-111111111111'
const NEW = '22222222-2222-4222-8222-222222222222'
const CLOSURE = '33333333-3333-4333-8333-333333333333'
const ABSENT = '44444444-4444-4444-8444-444444444444'
const CUT = '2026-11-01T12:00:00.000Z'
function payload(income = 100): any {
  const contract = { contractCode: 'K1', clientCode: 'C1', clientName: 'Sintético', product: 'Fibra', tariff: 'Fibra', income, rawIncome: income, rawCost: 40, rawEstimatedCost: 0, cost: 40, estimatedCost: 0, contractedIncome: 90, rawContractedIncome: 90, contractedIncomePending: false, contractedCost: null, contractedCostPending: true, costSources: [{ source: 'factura:F1:linea:0', sourceId: 'F1', amount: 40, status: 'REAL', provider: 'Proveedor guardado', description: 'Descripción guardada' }] }
  const product = { ...contract, product: 'Fibra', contracts: 1, sources: contract.costSources }
  return { period: MONTH, mode: 'real', snapshot: { id: 'obsoleto-en-payload' }, products: [product], clients: [{ ...contract, contracts: [contract] }], contracts: [contract], monthly: [{ month: MONTH, products: [product] }], summary: { month: { income, cost: 40 } }, controls: { sourceHash: 'hash-economico' } }
}
function row(id = OLD, version = 1, kind = 'PROYECCION', income = 100): any {
  return { id, month: MONTH, version, kind, sourceHash: String(version).repeat(64), createdAt: new Date(CUT), payload: payload(income) }
}
function fixture(options: { snapshots?: any[]; lines?: any[]; versions?: any[]; profile?: any } = {}) {
  const snapshots = options.snapshots ?? [row(), row(NEW, 2, 'PROYECCION', 200), row(CLOSURE, 5, 'CIERRE', 500)]
  const calls: Prisma.Sql[] = []
  const query = async (sql: Prisma.Sql): Promise<any[]> => {
    calls.push(sql)
    assert.equal(classifyPrisma5RawSqlStatement([sql]), 'read_only', sql.text)
    if (/current_database/.test(sql.text)) return options.profile ?? [{ db: 'io_staging_finanzas', usuario: 'io_staging_finanzas' }]
    if (/FROM rentabilidad_snapshots/.test(sql.text)) {
      if (/WHERE id =/.test(sql.text)) return snapshots.filter(s => s.id === sql.values[0] && s.month === sql.values[1]).slice(0, 1)
      const month = sql.values.find(v => typeof v === 'string' && /^20\d{2}-\d{2}$/.test(v))
      const eligible = snapshots.filter(s => s.month === month)
      if (/DISTINCT ON/.test(sql.text)) {
        return [...new Set(eligible.map(s => s.kind))].sort().map(kind => eligible.filter(s => s.kind === kind).sort((a, b) => b.version - a.version)[0])
      }
      return eligible.sort((a, b) => Number(b.kind === 'PROYECCION') - Number(a.kind === 'PROYECCION') || b.version - a.version).slice(0, 1)
    }
    if (/FROM rentabilidad_lineas/.test(sql.text)) return options.lines ?? [{ contrato: 'K1', fecha: new Date('2026-10-01'), mes: MONTH, base: '100', concepto: 'Cuota sintética', tarifa: 'Fibra', cif: null, periodMonths: 1 }]
    if (/FROM rentabilidad_versiones/.test(sql.text) && /kind = 'contract'/.test(sql.text)) {
      assert.match(sql.text, /created_at <= \$\d+::timestamp/)
      assert.match(sql.text, /ORDER BY stable_key, version DESC LIMIT/)
      const [codes, cutoff] = sql.values as [string[], string]
      const versions = (options.versions ?? []).filter(v => codes.includes(v.codigo) && new Date(v.createdAt).getTime() <= new Date(cutoff).getTime()).sort((a, b) => b.version - a.version)
      return [...new Set(versions.map(v => v.codigo))].map(code => versions.find(v => v.codigo === code))
    }
    if (/FROM facturas_recibidas/.test(sql.text)) return [{ id: 'F1', proveedor: 'Proveedor actual', num_factura: 'SYNTH-F1', fecha: new Date('2026-11-20'), base: '999', concepto: 'Cabecera actual' }]
    if (/FROM rentabilidad_versiones|FROM rentabilidad_ejecuciones|FROM facturas_emitidas|FROM facturas/.test(sql.text)) return []
    throw new Error(`Consulta inesperada: ${sql.text}`)
  }
  return { calls, query }
}
function useDb(t: any, options: Parameters<typeof fixture>[0] = {}) {
  const db = fixture(options)
  t.mock.method(prisma, '$queryRaw', db.query)
  t.mock.method(prisma, '$executeRaw', () => { throw new Error('TEST_WRITE_FORBIDDEN') })
  t.mock.method(prisma, '$queryRawUnsafe', () => { throw new Error('TEST_UNSAFE_FORBIDDEN') })
  t.mock.method(prisma, '$executeRawUnsafe', () => { throw new Error('TEST_WRITE_FORBIDDEN') })
  return db
}
const snapshotCalls = (db: ReturnType<typeof fixture>) => db.calls.filter(q => /FROM rentabilidad_snapshots/.test(q.text))

test('foto exacta vieja se lee aunque haya proyección y cierre más nuevos; id y mes parametrizados', async t => {
  const db = useDb(t)
  const foto = await leerFoto(MONTH, OLD)
  assert.deepEqual(foto?.snapshot, metadataFoto(row()))
  assert.equal(foto?.payload.clients[0].income, 100)
  assert.equal(snapshotCalls(db).length, 1)
  assert.deepEqual(snapshotCalls(db)[0].values, [OLD, MONTH])
  assert.doesNotMatch(snapshotCalls(db)[0].text, /ORDER BY/)
})
for (const [name, month, id] of [['ausente', MONTH, ABSENT], ['mes incorrecto', '2026-09', OLD]] as const) {
  test(`foto exacta ${name}: 404 controlado y ninguna consulta latest ni fuentes`, async t => {
    const db = useDb(t)
    await assert.rejects(() => desglose(month, 'cliente', 'C1', 'facturado', id), { code: 'FOTO_DESGLOSE_NO_DISPONIBLE', status: 404 })
    assert.equal(snapshotCalls(db).length, 1)
    assert.equal(db.calls.length, 2)
    assert.doesNotMatch(snapshotCalls(db)[0].text, /ORDER BY/)
  })
}
test('sin parámetro mantiene latest PROYECCION y devuelve su id; fotoCompleta conserva payload', async t => {
  useDb(t)
  const foto = await leerFoto(MONTH)
  assert.equal(foto?.snapshot.id, NEW)
  assert.equal((await fotoCompleta(MONTH))?.clients[0].income, 200)
  const result = await desglose(MONTH, 'cliente', 'C1', 'facturado')
  assert.equal(result?.snapshot.id, NEW)
})
test('sin proyección se conserva selección de la foto más reciente disponible', async t => {
  useDb(t, { snapshots: [row(CLOSURE, 5, 'CIERRE')] })
  assert.equal((await leerFoto(MONTH))?.snapshot.id, CLOSURE)
  assert.equal((await getRentabilidadReport(MONTH)).snapshot.id, CLOSURE)
})
test('sin foto: cliente antiguo recibe null y report snapshot null; cliente exacto recibe 404', async t => {
  useDb(t, { snapshots: [] })
  assert.equal(await desglose(MONTH, 'cliente', 'C1', 'facturado'), null)
  assert.equal((await getRentabilidadReport(MONTH)).snapshot, null)
  await assert.rejects(() => desglose(MONTH, 'cliente', 'C1', 'facturado', OLD), { code: 'FOTO_DESGLOSE_NO_DISPONIBLE', status: 404 })
})
test('UUID inválido y mes inválido se rechazan antes de cualquier consulta', async t => {
  const db = useDb(t)
  await assert.rejects(() => leerFoto(MONTH, 'no-uuid'))
  await assert.rejects(() => leerFoto('2026-13', OLD))
  assert.equal(db.calls.length, 0)
})
test('reporte transporta metadata de la selección existente en real y contratado antes de compactar, sin mutación', async t => {
  const snapshots = [row(), row(NEW, 2, 'PROYECCION', 200), row(CLOSURE, 5, 'CIERRE', 500)]
  const before = JSON.stringify(snapshots)
  useDb(t, { snapshots })
  for (const mode of ['real', 'contratado']) {
    const report = await getRentabilidadReport(MONTH, mode)
    assert.deepEqual(report.snapshot, metadataFoto(snapshots[1]))
    assert.equal(report.contracts, undefined)
    assert.equal(report.monthly[0].products[0].sources, undefined)
    assert.deepEqual(report.clients[0].contracts[0].costSources, snapshots[1].payload.contracts[0].costSources)
    assert.equal(report.clients[0].income, mode === 'real' ? 200 : 90)
    if (mode === 'contratado') assert.equal(report.clients[0].cost, null)
    assert.equal(report.snapshots.length, 2)
  }
  assert.equal(JSON.stringify(snapshots), before)
})
test('desglose conserva importes y sources de foto vieja, nunca los de latest ni cabecera actual', async t => {
  useDb(t)
  const result = await desglose(MONTH, 'cliente', 'C1', 'coste', OLD)
  assert.equal(result?.snapshot.id, OLD)
  assert.equal(result?.cifraTabla, 40)
  assert.equal(result?.filas[0].importe, 40)
  assert.equal(result?.filas[0].concepto, 'Descripción guardada')
  assert.equal(result?.filas[0].totalFactura, 999, 'la cabecera se informa como actual, no congelada')
  assert.ok(result?.notas.some(n => /no son fuentes congeladas/.test(n)))
})
test('contratos: última versión <= createdAt incluye frontera y excluye cambio posterior', async t => {
  const db = useDb(t, { versions: [
    { codigo: 'K1', version: 1, createdAt: '2026-10-01T12:00:00Z', payload: { price: 80, periodMonths: 1, estado: 'Anterior' } },
    { codigo: 'K1', version: 2, createdAt: CUT, payload: { price: 90, periodMonths: 1, fechaAlta: '2026-01-01', estado: 'Activo' } },
    { codigo: 'K1', version: 3, createdAt: '2026-11-01T12:00:00.001Z', payload: { price: 999, periodMonths: 1, fechaBaja: '2026-11-01', estado: 'Baja posterior' } },
  ] })
  const result = await desglose(MONTH, 'cliente', 'C1', 'contratos', OLD)
  assert.equal(result?.filas[0].cuota, 90)
  assert.equal(result?.filas[0].estadoIsp, 'Activo')
  assert.equal(result?.filas[0].alta, '2026-01-01')
  assert.equal(result?.filas[0].baja, null)
  const query = db.calls.find(q => /kind = 'contract'/.test(q.text))!
  assert.deepEqual(query.values, [['K1'], CUT, 1])
})
test('contrato con solo versión posterior queda sin dato; no fallback a esa versión', async t => {
  useDb(t, { versions: [{ codigo: 'K1', version: 1, createdAt: '2026-11-02T00:00:00Z', payload: { price: 999, periodMonths: 1, estado: 'Baja' } }] })
  const result = await desglose(MONTH, 'cliente', 'C1', 'contratos', OLD)
  assert.equal(result?.filas[0].cuota, null)
  assert.equal(result?.filas[0].estadoIsp, null)
})
test('sin createdAt verificable no se consulta latest contractual ni se inventan fechas o estado', async t => {
  const snapshot = { ...row(), createdAt: null }
  const db = useDb(t, { snapshots: [snapshot] })
  const result = await desglose(MONTH, 'cliente', 'C1', 'contratos', OLD)
  assert.equal(result?.snapshot.createdAt, null)
  for (const key of ['alta', 'baja', 'estadoIsp', 'cuota']) assert.equal(result?.filas[0][key], null)
  assert.ok(result?.notas.some(n => /sin dato/.test(n)))
  assert.ok(!db.calls.some(q => /kind = 'contract'/.test(q.text)))
  const d = await leerDatos(payload(), 'cliente', 'C1', 'contratos', MONTH, 'fecha inválida')
  assert.deepEqual(d.versiones, [])
})
for (const extra of [0.01, 50]) {
  test(`línea posterior con delta ${extra} mantiene diferencia y cuadra false, sin ajuste ni recálculo`, async t => {
    const snapshots = [row()]
    const before = JSON.stringify(snapshots)
    useDb(t, { snapshots, lines: [{ contrato: 'K1', fecha: '2026-10-01', mes: MONTH, base: 100 + extra, concepto: 'Importada después', tarifa: 'Fibra', cif: null, periodMonths: 1 }] })
    const result = await desglose(MONTH, 'cliente', 'C1', 'facturado', OLD)
    assert.equal(result?.cifraTabla, 100)
    assert.equal(result?.sumaDetalle, 100 + extra)
    assert.equal(result?.diferencia, -extra)
    assert.equal(result?.cuadra, false)
    assert.ok(result?.filas.every(f => !f.ajuste))
    assert.ok(result?.notas.some(n => /Recarga.*revisa las fuentes/.test(n)))
    assert.equal(result?.cobertura.lineas, 1)
    assert.equal(JSON.stringify(snapshots), before)
  })
}
test('helper puro no muta foto/detalle; normaliza fechas válidas y no inventa fecha ausente', () => {
  for (const value of [null, undefined, '', 0, '2026-11-01', 'fecha inválida', new Date('invalid')]) assert.equal(fechaFoto(value), null)
  assert.equal(fechaFoto(new Date(CUT)), CUT)
  const d = { lineas: [], emitidas: [], recibidas: [], series: [], versiones: [] }
  const result = construirDesglose(payload(), 'cliente', 'C1', 'coste', MONTH, d)
  const before = JSON.stringify(result), snapshot = metadataFoto(row())
  assert.deepEqual(conFoto(result, snapshot).snapshot, snapshot)
  assert.equal(JSON.stringify(result), before)
})
test('query schema acepta UUID solo con detalle completo; conserva defaults y rechaza casos adversos', () => {
  const detail = { month: MONTH, detalle: 'cliente', clave: 'C1', vista: 'coste', snapshot: OLD }
  assert.equal(querySchema.parse(detail).mode, 'real')
  assert.ok(querySchema.safeParse({ ...detail, detalle: 'producto', vista: 'contratos', mode: 'contratado' }).success)
  for (const bad of [{ ...detail, snapshot: '' }, { ...detail, snapshot: 'arbitrario' }, { ...detail, month: '2026-13' }, { ...detail, clave: '' }, { ...detail, vista: undefined }, { ...detail, month: undefined }, { ...detail, detalle: undefined }, { month: MONTH, snapshot: OLD }, { ...detail, extra: '1' }]) assert.equal(querySchema.safeParse(bad).success, false)
  assert.ok(querySchema.safeParse({ month: MONTH, mode: 'real' }).success)
})
test('parseQuery rechaza duplicados snapshot, mes y detalle antes de consultas', () => {
  const base = `http://127.0.0.1/api/admin/rentabilidad?month=${MONTH}&detalle=cliente&clave=C1&vista=coste&snapshot=${OLD}`
  for (const repeated of [`snapshot=${NEW}`, `month=${MONTH}`, 'detalle=cliente']) assert.throws(() => parseQuery(new NextRequest(`${base}&${repeated}`)), { code: 'DUPLICATED_PARAMETER' })
  assert.equal(parseQuery(new NextRequest(base)).snapshot, OLD)
})
test('404 controlado se serializa sin stack ni datos de fuente', async () => {
  const response = failure(new RentabilidadError('FOTO_DESGLOSE_NO_DISPONIBLE', 404))
  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), { code: 'FOTO_DESGLOSE_NO_DISPONIBLE', error: 'La foto del desglose ya no está disponible para este mes. Recarga la pantalla o revisa las fuentes.' })
  assert.match(response.headers.get('Cache-Control')!, /no-store/)
})
test('perfil DB incorrecto falla cerrado antes de la lectura del snapshot', async t => {
  const db = useDb(t, { profile: [{ db: 'otra', usuario: 'otro' }] })
  await assert.rejects(() => leerFoto(MONTH, OLD), { code: 'RENTABILIDAD_STAGING_REQUIRED', status: 404 })
  assert.equal(snapshotCalls(db).length, 0)
})
test('producción y READ_ONLY conservan guarda antes de consultas', async t => {
  const db = useDb(t)
  for (const [key, value] of [['IO_PRODUCTION_READ_ONLY', '1'], ['VERCEL_ENV', 'production'], ['FINANCE_STAGING_SANDBOX', '0']] as const) {
    const old = process.env[key]
    process.env[key] = value
    try { await assert.rejects(() => leerFoto(MONTH, OLD), { code: 'RENTABILIDAD_STAGING_REQUIRED', status: 404 }) }
    finally { if (old === undefined) delete process.env[key]; else process.env[key] = old }
  }
  assert.equal(db.calls.length, 0)
})
test('ruta conserva auth previo al lector y pasa snapshot; capa nueva sigue sin SQL de escritura', () => {
  const route = readFileSync(new URL('../app/api/admin/rentabilidad/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('await requireRentabilidadAdmin()') < route.indexOf("await import('@/lib/rentabilidad/desglose-datos')"))
  assert.match(route, /desglose\(month, detalle, clave, vista, snapshot\)/)
  for (const name of ['desglose-datos.ts', 'desglose-foto.ts']) {
    const text = readFileSync(new URL(`../lib/rentabilidad/${name}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(text, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/)
  }
})
