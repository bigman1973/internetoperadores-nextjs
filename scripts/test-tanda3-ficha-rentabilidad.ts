/** Tanda 3: pruebas VM/puras, sin BD, env, red, Prisma real ni proveedores. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function execute(file: string, imports: Record<string, unknown>) {
  const module = { exports: {} as any }
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  runInNewContext(js, { module, exports: module.exports, Date, Intl, console, process: { env: {} }, require: (name: string) => {
    if (!(name in imports)) throw new Error(`UNEXPECTED_IMPORT:${name}`)
    return imports[name]
  } }, { filename: file })
  return module.exports
}
const ispPolicy = execute('lib/isp-origen-policy.ts', {})
const ispIdentity = execute('lib/area1-isp-identidad.ts', { './isp-origen-policy': ispPolicy })
const view = execute('app/admin/rentabilidad/view-model.ts', {})
const classification = execute('lib/subida-precios/calc.ts', {})
const native = execute('app/admin/rentabilidad/io-model.ts', {
  './view-model': view,
  '@/lib/subida-precios/calc': classification,
})
const adapter = execute('lib/area1-ficha-rentabilidad.ts', {
  '../app/admin/rentabilidad/io-model': native,
  '../app/admin/rentabilidad/view-model': view,
})
const now = new Date('2026-11-26T20:21:00Z')
const foto = (id = 'oct-p2', month = '2026-10', kind = 'PROYECCION', version = 2, createdAt = '2026-11-24T09:00:00Z') => ({ id, month, kind, version, createdAt })
const fila = (datos: any, tipo = 'cliente', snapshotId = 'oct-p2', month = '2026-10', clientCode = 'ISP000014', clientIndex = 1, contractIndex = 0) => ({ datos, tipo, snapshotId, month, clientCode, clientIndex, contractIndex })
const row = (overrides = {}) => ({ income: 100, rawIncome: 100, cost: 60, rawCost: 60, estimatedCost: 20, rawEstimatedCost: 20, pending: true, margin: 40, marginPct: null, ...overrides })
const json = (value: any) => JSON.parse(JSON.stringify(value))
const project = (datos = row(), extras: any[] = []) => adapter.proyectarFichaRentabilidad([foto()], [fila(datos), ...extras], ['14'], now)

// Calendario y política de foto.
test('doce meses completos: nov-2025 … oct-2026; facturación conserva ultimos12', () => {
  assert.deepEqual(json(adapter.mesesCompletosFicha(now)), ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
  const ficha = execute('lib/area1-ficha-cliente.ts', { './prisma': { __esModule: true, default: {} }, './area1-subida-cliente': { leerSubidaCliente: async () => null }, './area1-ficha-rentabilidad': adapter, './area1-isp-identidad': ispIdentity })
  assert.equal(ficha.ultimos12(now).at(-1), '2026-11')
})
test('Madrid manda al cruzar medianoche y año, incluido cambio horario', () => {
  assert.equal(adapter.mesesCompletosFicha(new Date('2026-10-31T22:59:59Z')).at(-1), '2026-09')
  assert.equal(adapter.mesesCompletosFicha(new Date('2026-10-31T23:00:00Z')).at(-1), '2026-10')
  assert.equal(adapter.mesesCompletosFicha(new Date('2026-03-31T22:00:00Z')).at(-1), '2026-03')
  const year = adapter.mesesCompletosFicha(new Date('2026-12-31T23:00:00Z'))
  assert.equal(year[0], '2026-01'); assert.equal(year.at(-1), '2026-12')
})
test('normalización ISP000014=000014=14, sin identidad vacía ni nombres alterados', () => {
  for (const code of ['ISP000014', 'isp000014', '000014', '14', ' ISP000014 ']) assert.equal(adapter.normalizarCodigoFicha(code), '14')
  assert.equal(adapter.normalizarCodigoFicha('0000'), '0')
  assert.equal(adapter.normalizarCodigoFicha('ISP14A'), 'ISP14A')
  assert.equal(adapter.normalizarCodigoFicha(null), '')
})
test('PROYECCION supera CIERRE de versión mayor; la versión supera createdAt', () => {
  const photos = [foto('c99', '2026-10', 'CIERRE', 99, '2026-11-26T10:00:00Z'), foto('p1', '2026-10', 'PROYECCION', 1, '2026-11-25T10:00:00Z'), foto()]
  const before = JSON.stringify(photos)
  assert.equal(adapter.seleccionarFotosFicha(photos, adapter.mesesCompletosFicha(now), now)[0].id, 'oct-p2')
  assert.equal(JSON.stringify(photos), before)
})
test('sin proyección: toma la mayor versión de la foto disponible', () => {
  assert.equal(adapter.seleccionarFotosFicha([foto('c1', '2026-10', 'CIERRE', 1), foto('c2', '2026-10', 'CIERRE', 2)], adapter.mesesCompletosFicha(now), now)[0].id, 'c2')
})
test('ni mes abierto, ni futuro, ni createdAt futuro, ni fecha inválida', () => {
  const photos = [foto(), foto('open', '2026-11'), foto('future', '2027-01'), foto('not-yet', '2026-10', 'PROYECCION', 900, '2026-11-27T00:00:00Z'), foto('bad', '2026-10', 'PROYECCION', 901, 'bad-date')]
  assert.deepEqual(json(adapter.seleccionarFotosFicha(photos, [...adapter.mesesCompletosFicha(now), '2026-11', '2027-01'], now)).map((f: any) => f.id), ['oct-p2'])
})

// Cifras: oráculos = funciones puras reales de la UI; nunca cálculos sustitutos.
test('real+estimado y margen nativo, no margin/marginPct guardados', () => {
  const data = row(), before = JSON.stringify(data), out = project(data), total = native.rowTotals(data, 'real')
  assert.equal(out.rentabilidad.ingreso.at(-1), total.income)
  assert.equal(out.rentabilidad.coste.at(-1), total.cost)
  assert.equal(out.margenUltimo.margen, total.margin)
  assert.equal(out.margenUltimo.pct, total.marginPct)
  assert.equal(out.rentabilidad.costeReal.at(-1), total.costReal)
  assert.equal(out.rentabilidad.costeEstimado.at(-1), total.costEst)
  assert.equal(out.rentabilidad.calidad.at(-1), total.quality)
  assert.equal(out.rentabilidad.hayEstimados.at(-1), total.estimated)
  assert.equal(out.margenUltimo.costeEstimado, total.costEst)
  assert.equal(out.margenUltimo.calidad, total.quality)
  assert.equal(total.cost, 80); assert.equal(total.margin, 20); assert.equal(total.marginPct, 20)
  assert.equal(JSON.stringify(data), before)
})
test('raw de precisión manda sobre el redondeado y no se añade ajuste', () => {
  const data = row({ income: 10, rawIncome: 10.004, cost: 2, rawCost: 2.004, estimatedCost: 1, rawEstimatedCost: 1.004 })
  const out = project(data), total = native.rowTotals(data, 'real')
  assert.equal(out.rentabilidad.coste.at(-1), total.cost)
  assert.equal(out.margenUltimo.margen, total.margin)
  assert.equal(out.margenUltimo.pct, total.marginPct)
})
test('sin ningún coste conocido pendiente: coste y margen null, no 0 ni 100%', () => {
  const out = project(row({ cost: 0, rawCost: 0, estimatedCost: 0, rawEstimatedCost: 0 }))
  assert.equal(out.rentabilidad.ingreso.at(-1), 100)
  assert.equal(out.rentabilidad.coste.at(-1), null)
  assert.equal(out.margenUltimo.margen, null); assert.equal(out.margenUltimo.pct, null)
  assert.equal(out.rentabilidad.costeReal.at(-1), null); assert.equal(out.rentabilidad.costeEstimado.at(-1), null)
  assert.equal(out.rentabilidad.calidad.at(-1), null); assert.equal(out.rentabilidad.hayEstimados.at(-1), false)
  assert.equal(out.rentabilidad.estados.at(-1), 'SIN_COSTE')
})
test('coste cero acreditado sin pendiente sí se conserva', () => {
  const out = project(row({ cost: 0, rawCost: 0, estimatedCost: 0, rawEstimatedCost: 0, pending: false }))
  assert.equal(out.rentabilidad.coste.at(-1), 0); assert.equal(out.margenUltimo.pct, 100)
})
test('solo estimado cuantificable es coste conocido, sin ocultarlo por pendiente', () => {
  const data = row({ cost: 0, rawCost: 0 }), out = project(data)
  assert.equal(out.rentabilidad.coste.at(-1), native.rowTotals(data, 'real').cost)
  assert.equal(out.margenUltimo.pct, native.rowTotals(data, 'real').marginPct)
})
test('nulos y datos no numéricos siguen ausentes', () => {
  for (const value of [null, undefined, '', true, 'NaN']) {
    const out = project(row({ cost: value, rawCost: value }))
    assert.equal(out.rentabilidad.coste.at(-1), null); assert.equal(out.margenUltimo.pct, null)
  }
  const out = project(row({ income: null, rawIncome: null }))
  assert.equal(out.rentabilidad.ingreso.at(-1), null); assert.equal(out.margenUltimo.pct, null)
  assert.equal(out.rentabilidad.estados.at(-1), 'DATOS_INCOMPLETOS')
})
test('ingreso cero: margen conocido negativo pero porcentaje null, no infinito', () => {
  const data = row({ income: 0, rawIncome: 0 }), out = project(data)
  assert.equal(out.margenUltimo.margen, native.rowTotals(data, 'real').margin)
  assert.equal(out.margenUltimo.pct, null)
})
test('varios códigos enlazados: totalsOf nativo ponderado, no media de porcentajes', () => {
  const one = row(), two = row({ income: 50, rawIncome: 50, cost: 5, rawCost: 5, estimatedCost: 0, rawEstimatedCost: 0 })
  const out = adapter.proyectarFichaRentabilidad([foto()], [fila(one), fila(two, 'cliente', 'oct-p2', '2026-10', '000015', 2)], ['14', 'ISP000015'], now)
  const expected = native.totalsOf([one, two], 'real')
  assert.equal(out.rentabilidad.ingreso.at(-1), expected.income)
  assert.equal(out.rentabilidad.coste.at(-1), expected.cost)
  assert.equal(out.margenUltimo.margen, expected.margin); assert.equal(out.margenUltimo.pct, expected.marginPct)
  assert.equal(out.rentabilidad.costeReal.at(-1), expected.costReal)
  assert.equal(out.rentabilidad.costeEstimado.at(-1), expected.costEst)
  assert.equal(out.rentabilidad.calidad.at(-1), expected.quality)
})
test('varios códigos con una ausencia monetaria no producen suma exacta falsa', () => {
  const out = adapter.proyectarFichaRentabilidad([foto()], [fila(row()), fila(row({ cost: null, rawCost: null }), 'cliente', 'oct-p2', '2026-10', '15', 2)], ['14', '15'], now)
  assert.equal(out.rentabilidad.coste.at(-1), null); assert.equal(out.margenUltimo.pct, null)
  assert.equal(out.rentabilidad.estados.at(-1), 'DATOS_INCOMPLETOS')
})
test('serie con huecos: SIN_FOTO/SIN_CLIENTE explícitos, no ceros', () => {
  const out = adapter.proyectarFichaRentabilidad([foto(), foto('sep', '2026-09')], [fila(row())], ['14'], now)
  assert.equal(out.rentabilidad.ingreso[0], null); assert.equal(out.rentabilidad.coste[0], null)
  assert.equal(out.rentabilidad.estados[0], 'SIN_FOTO'); assert.equal(out.rentabilidad.fotos[0], null)
  assert.equal(out.rentabilidad.estados.at(-2), 'SIN_CLIENTE'); assert.equal(out.rentabilidad.ingreso.at(-2), null)
})
test('última foto sin cliente no cae al margen ni contratos de un mes viejo', () => {
  const out = adapter.proyectarFichaRentabilidad([foto(), foto('sep', '2026-09')], [fila(row(), 'cliente', 'sep', '2026-09'), fila({ ...row(), contractCode: '44' }, 'contrato', 'sep', '2026-09')], ['14'], now)
  assert.equal(out.rentabilidad.mes, '2026-10'); assert.equal(out.rentabilidad.snapshot.id, 'oct-p2')
  assert.equal(out.margenUltimo.pct, null); assert.equal(out.margenContrato.size, 0)
})
test('octubre sin foto no usa septiembre como último mes cerrado ni arrastra contratos', () => {
  const out = adapter.proyectarFichaRentabilidad([foto('sep', '2026-09')], [fila(row(), 'cliente', 'sep', '2026-09'), fila({ ...row(), contractCode: '44' }, 'contrato', 'sep', '2026-09')], ['14'], now)
  assert.equal(out.rentabilidad.mes, '2026-10'); assert.equal(out.rentabilidad.snapshot, null)
  assert.equal(out.margenUltimo.mes, '2026-10'); assert.equal(out.margenUltimo.pct, null)
  assert.equal(out.margenContrato.size, 0); assert.equal(out.rentabilidad.estados.at(-1), 'SIN_FOTO')
  assert.equal(out.rentabilidad.fotos.at(-2).id, 'sep')
})
test('v11 octubre PROYECCION común en margen/contrato, noviembre coste 2 y diciembre fuera', () => {
  const oct = foto('oct-p11', '2026-10', 'PROYECCION', 11), data = row(), contract = row({ contractCode: 'ISP000044', income: 40, rawIncome: 40, cost: 10, rawCost: 10, estimatedCost: 0, rawEstimatedCost: 0 })
  const photos = [foto('oct-c99', '2026-10', 'CIERRE', 99), foto('oct-p10', '2026-10', 'PROYECCION', 10), oct, foto('nov', '2026-11'), foto('dec', '2026-12')]
  const rows = [fila(data, 'cliente', oct.id), fila(contract, 'contrato', oct.id), fila(row({ cost: 2, rawCost: 2 }), 'cliente', 'nov', '2026-11'), fila(row(), 'cliente', 'dec', '2026-12')]
  const before = JSON.stringify({ photos, rows }), out = adapter.proyectarFichaRentabilidad(photos, rows, ['14'], now)
  assert.equal(out.rentabilidad.snapshot.id, oct.id); assert.equal(out.rentabilidad.snapshot.kind, 'PROYECCION'); assert.equal(out.rentabilidad.snapshot.version, 11)
  assert.equal(out.margenUltimo.mes, '2026-10'); assert.equal(out.margenUltimo.pct, native.rowTotals(data, 'real').marginPct)
  assert.equal(out.margenContrato.get('44'), native.rowTotals(contract, 'real').marginPct)
  assert.equal(out.rentabilidad.meses.at(-1), '2026-10'); assert.ok(!out.rentabilidad.meses.includes('2026-11')); assert.ok(!out.rentabilidad.meses.includes('2026-12'))
  assert.equal(out.rentabilidad.costeReal.at(-1), native.rowTotals(data, 'real').costReal)
  assert.equal(out.rentabilidad.costeEstimado.at(-1), native.rowTotals(data, 'real').costEst)
  assert.equal(out.rentabilidad.calidad.at(-1), native.rowTotals(data, 'real').quality)
  assert.equal(JSON.stringify({ photos, rows }), before)
})
test('cliente y contratos usan el mismo snapshot y excluyen identidades ajenas', () => {
  const good = { ...row(), contractCode: 'ISP000044' }
  const out = project(row(), [fila(good, 'contrato', 'oct-p2', '2026-10', '14', 1, 1), fila({ ...row(), contractCode: '55' }, 'contrato', 'c99'), fila({ ...row(), contractCode: '66' }, 'contrato', 'oct-p2', '2026-10', '99')])
  assert.equal(out.margenContrato.get('44'), native.rowTotals(good, 'real').marginPct)
  assert.equal(out.margenContrato.size, 1)
})
test('contrato sin coste y contrato de identidad ambigua tienen margen null', () => {
  const missing = { ...row({ cost: 0, rawCost: 0, estimatedCost: 0, rawEstimatedCost: 0 }), contractCode: '44' }
  const out = project(row(), [fila(missing, 'contrato'), fila({ ...row(), contractCode: '55' }, 'contrato'), fila({ ...row(), contractCode: '000055' }, 'contrato')])
  assert.equal(out.margenContrato.get('44'), null); assert.equal(out.margenContrato.get('55'), null)
})

// Harness de consultas: se captura el SQL pero jamás se conecta ni importa Prisma real.
test('lector SELECT mínimo: 12 cabeceras, scope normalizado, contratos del último mes, IDs congelados y paginación >500', async () => {
  const calls: any[] = [], data = Array.from({ length: 501 }, (_, i) => fila({ ...row(), contractCode: String(i + 1) }, 'contrato', 'oct-p2', '2026-10', '14', 1, i + 1))
  data.unshift(fila(row()))
  const db = { $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
    const sql = strings.join('?'); calls.push({ sql, values })
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i)
    if (calls.length === 1) return [{ ...foto(), createdAt: new Date(foto().createdAt) }]
    const offset = values.at(-1)
    return data.slice(offset, offset + 500)
  } }
  const out = await adapter.leerRentabilidadFicha(db, ['ISP000014', '000014'], now)
  assert.equal(calls.length, 3); assert.equal(out.margenContrato.size, 501)
  assert.match(calls[0].sql, /ORDER BY month, \(kind = 'PROYECCION'\) DESC, version DESC/)
  assert.match(calls[0].sql, /created_at <=/); assert.match(calls[0].sql, /LIMIT 12/)
  assert.doesNotMatch(calls[0].sql, /payload/)
  assert.deepEqual(json(calls[0].values[0]), json(adapter.mesesCompletosFicha(now)))
  for (const call of calls.slice(1)) {
    assert.match(call.sql, /jsonb_build_object/); assert.match(call.sql, /LIMIT 500 OFFSET/)
    assert.match(call.sql, /WHERE c.month =/)
    assert.match(call.sql, /WHERE id = ANY\(\?::text\[\]\)/)
    assert.doesNotMatch(call.sql, /SELECT \*|AS payload|costSources|source_hash|marginPct|->'margin'/)
    assert.deepEqual(json(call.values[0]), ['oct-p2']); assert.deepEqual(json(call.values[1]), ['14'])
    assert.equal(call.values[2], '2026-10')
    assert.ok(call.sql.includes("'^ISP([0-9]+)$', '\\1', 'i'"))
  }
  assert.equal(calls[1].values.at(-1), 0); assert.equal(calls[2].values.at(-1), 500)
})
test('lector fake con solo septiembre: pide contratos para octubre, no sustituye el corte calendario', async () => {
  const calls: any[] = []
  const db = { $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
    calls.push({ sql: strings.join('?'), values })
    return calls.length === 1 ? [foto('sep', '2026-09')] : [fila(row(), 'cliente', 'sep', '2026-09')]
  } }
  const out = await adapter.leerRentabilidadFicha(db, ['14'], now)
  assert.equal(calls.length, 2); assert.equal(calls[1].values[2], '2026-10')
  assert.equal(out.margenUltimo.mes, '2026-10'); assert.equal(out.margenUltimo.pct, null)
  assert.equal(out.rentabilidad.snapshot, null); assert.equal(out.margenContrato.size, 0)
})
test('sin vínculo/sin foto: sin consulta privada innecesaria y arrays null', async () => {
  let calls = 0
  const db = { $queryRaw: async () => { calls++; return [] } }
  const unlinked = await adapter.leerRentabilidadFicha(db, ['', ' '], now)
  assert.equal(calls, 0); assert.ok(unlinked.rentabilidad.estados.every((s: string) => s === 'SIN_VINCULO'))
  const missing = await adapter.leerRentabilidadFicha(db, ['14'], now)
  assert.equal(calls, 1); assert.equal(missing.rentabilidad.snapshot, null); assert.equal(missing.rentabilidad.hay, false)
  assert.ok(missing.rentabilidad.coste.every((n: any) => n === null))
})

function fichaHarness(invoices: any[] = [], photoAvailable = true) {
  let rentCalls = 0
  const company = { id: 'empresa-14', nombre: 'Empresa ficticia', tipo: 'EMPRESA', contactos: [], clientes: [] }
  const contract = { id: 'k44', codigoContratoIsp: 'ISP000044', activo: true, fechaBaja: null, tarifa: 'Fibra', descripcion: 'Sede ficticia', importeSinIva: 100 }
  const empty = { findMany: async () => [] }
  const db = { crmEmpresa: { findUnique: async () => company }, crmEmpresaCliente: empty, ispVinculoArea1: empty, ispClienteArea1: { findMany: async () => [{ id: 's14', ispClienteId: 'isp-14', nombre: company.nombre, codigo: 'ISP000014', crmEmpresaId: company.id, contratos: [contract] }] }, factura: { findMany: async () => invoices }, crmActividad: empty, crmTarea: empty, area1CrmNegocio: empty, area1CrmConsentimiento: empty, crmNegocioContacto: empty, area1CrmPipeline: empty, devolucionRemesa: empty,
    $queryRaw: async () => { throw new Error('NO_DIRECT_PRIVATE_SQL') } }
  const prepared = photoAvailable ? project(row(), [fila({ ...row(), contractCode: '44' }, 'contrato')]) : adapter.proyectarFichaRentabilidad([], [], ['14'], now)
  const ficha = execute('lib/area1-ficha-cliente.ts', {
    './prisma': { __esModule: true, default: db },
    './area1-isp-identidad': ispIdentity,
    './area1-subida-cliente': { leerSubidaCliente: async () => null },
    './area1-ficha-rentabilidad': { ...adapter, leerRentabilidadFicha: async (_db: any, codes: any, date: any) => {
      rentCalls++; assert.deepEqual(json(codes), ['14']); assert.equal(date, now); return prepared
    } },
  })
  return { ficha, calls: () => rentCalls, prepared }
}
test('cargador real VM: comercial sin consulta, snapshot, serie, cifras, avisos ni IA privados', async () => {
  const h = fichaHarness(), out = await h.ficha.cargarFichaCliente('empresa-14', 'COMERCIAL', now)
  assert.equal(h.calls(), 0); assert.equal(out.verMargen, false); assert.equal(out.rentabilidad, null)
  assert.ok(out.contratos.every((c: any) => c.margenPct === null))
  assert.equal(out.kpis.find((k: any) => k.etiqueta === 'Margen último mes').valor, 'sin acceso')
  assert.ok(!out.avisos.some((a: any) => /margen/i.test(a.titulo)))
  assert.equal(h.ficha.contextoTieneCostes(out.contextoIa), false)
  assert.doesNotMatch(JSON.stringify(out), /oct-p2|costSources|rawCost|rawIncome|estimatedCost/)
})
for (const role of ['GERENTE', 'SUPERADMIN']) test(`cargador real VM: ${role} delega una lectura y deriva KPI/contrato del resultado nativo`, async () => {
  const h = fichaHarness(), out = await h.ficha.cargarFichaCliente('empresa-14', role, now)
  assert.equal(h.calls(), 1); assert.equal(out.rentabilidad.snapshot.id, 'oct-p2')
  assert.equal(out.rentabilidad.meses.at(-1), '2026-10'); assert.equal(out.facturacion.meses.at(-1), '2026-11')
  assert.equal(out.contratos[0].margenPct, h.prepared.margenContrato.get('44'))
  const kpi = out.kpis.find((k: any) => k.etiqueta === 'Margen octubre 2026')
  assert.equal(kpi.valor, h.ficha.pct(h.prepared.margenUltimo.pct))
  assert.equal(kpi.sub, `incluye ${h.ficha.eur(h.prepared.margenUltimo.costeEstimado)} de coste estimado`)
  assert.equal(h.ficha.contextoTieneCostes(out.contextoIa), false)
})
test('cargador fake: facturas futuras excluidas de serie/KPI y huecos sin cero fabricado', async () => {
  const invoice = (id: string, date: string, base: number) => ({ id, numeroDocumento: id, fecha: new Date(date), base, total: base, totalPendiente: 0, situacion: 'COBRADA' })
  const h = fichaHarness([invoice('nov', '2026-11-25T10:00:00Z', 40), invoice('dec-future', '2026-12-01T10:00:00Z', 999)])
  const out = await h.ficha.cargarFichaCliente('empresa-14', 'SUPERADMIN', now)
  assert.equal(out.facturacion.serie.at(-1), 40)
  assert.ok(out.facturacion.serie.slice(0, -1).every((value: any) => value === null))
  assert.deepEqual(json(out.facturacion.facturas).map((f: any) => f.numero), ['nov'])
  assert.equal(out.kpis.find((k: any) => k.etiqueta === 'Facturado 12 meses').valor, h.ficha.eur(40))
})
test('cargador fake: octubre sin foto conserva etiqueta y todos los márgenes sin dato', async () => {
  const h = fichaHarness([], false), out = await h.ficha.cargarFichaCliente('empresa-14', 'GERENTE', now)
  const kpi = out.kpis.find((k: any) => k.etiqueta === 'Margen octubre 2026')
  assert.equal(kpi.valor, 'sin dato'); assert.equal(kpi.sub, 'sin dato de Rentabilidad')
  assert.equal(out.contratos[0].margenPct, null)
  assert.equal(out.rentabilidad.mes, '2026-10'); assert.equal(out.rentabilidad.snapshot, null)
})
test('fuentes nativas intactas: el adaptador importa puras, no store/report/desglose ni proveedores', () => {
  const source = readFileSync('lib/area1-ficha-rentabilidad.ts', 'utf8')
  const imports = Array.from(source.matchAll(/^import .* from '([^']+)'/gm)).map(m => m[1])
  assert.deepEqual(imports, ['../app/admin/rentabilidad/io-model', '../app/admin/rentabilidad/view-model'])
  assert.doesNotMatch(source, /\$executeRaw|\$transaction|process\.env|fetch\(|getRentabilidadReport\(|rebuildRentabilidadReport\(|calculateReport\(/)
})
