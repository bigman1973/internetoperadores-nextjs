/** Tanda 3 · calendario/margen/gráficos: VM + SSR en memoria, sin BD, .env, HTTP ni Graph. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const local = createRequire(import.meta.url)
const { transformSync } = createRequire(local.resolve('tsx/package.json'))('esbuild')
const json = (value: unknown) => JSON.parse(JSON.stringify(value))
function execute(path: string, imports: Record<string, unknown>) {
  const module = { exports: {} as any }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText
  runInNewContext(code, { module, exports: module.exports, Date, Intl, console, process: { env: {} }, require(id: string) {
    if (!Object.hasOwn(imports, id)) throw new Error(`IMPORT_PROHIBIDO:${id}`)
    return imports[id]
  } }, { filename: path, timeout: 5000 })
  return module.exports
}
const view = execute('app/admin/rentabilidad/view-model.ts', {})
const native = execute('app/admin/rentabilidad/io-model.ts', { './view-model': view, '@/lib/subida-precios/calc': execute('lib/subida-precios/calc.ts', {}) })
const adapter = execute('lib/area1-ficha-rentabilidad.ts', { '../app/admin/rentabilidad/io-model': native, '../app/admin/rentabilidad/view-model': view })
const ispPolicy = execute('lib/isp-origen-policy.ts', {})
const identity = execute('lib/area1-isp-identidad.ts', { './isp-origen-policy': ispPolicy })
const model = execute('lib/area1-ficha-cliente.ts', { './prisma': { __esModule: true, default: {} }, './area1-isp-identidad': identity, './area1-subida-cliente': { leerSubidaCliente: async () => null }, './area1-ficha-rentabilidad': adapter })
const policy = execute('lib/m365-legacy-policy.ts', {})
const source = readFileSync('components/admin/FichaCliente.tsx', 'utf8')
const compiled = transformSync(`${source}\nexport { Bars, graficoFacturadoFicha }\n`, { loader: 'tsx', jsx: 'automatic', format: 'cjs', platform: 'node', target: 'es2022' }).code
let forbiddenCalls = 0
const module = { exports: {} as any }
runInNewContext(compiled, {
  module, exports: module.exports, Date, Intl, console,
  fetch() { forbiddenCalls++; throw new Error('HTTP_GRAPH_BD_PROHIBIDOS') },
  setTimeout() { throw new Error('EFECTOS_PROHIBIDOS') }, clearTimeout() {},
  require(id: string) {
    if (id === 'react' || id === 'react/jsx-runtime') return local(id)
    if (id === '@/lib/m365-legacy-policy') return policy
    throw new Error(`IMPORT_UI_PROHIBIDO:${id}`)
  },
}, { filename: 'FichaCliente.tsx:SSR-meses', timeout: 5000 })
const ui = module.exports
const now = new Date('2026-11-26T20:21:00Z')
const foto = (id: string, month: string, version = 11, kind = 'PROYECCION') => ({ id, month, kind, version, createdAt: '2026-11-24T10:00:00Z' })
const row = (extra = {}) => ({ income: 100, rawIncome: 100, cost: 60, rawCost: 60, estimatedCost: 20, rawEstimatedCost: 20, pending: true, ...extra })
const fila = (datos: unknown, tipo = 'cliente', snapshotId = 'oct-v11', month = '2026-10') => ({ datos, tipo, snapshotId, month, clientCode: '14', clientIndex: 1, contractIndex: tipo === 'contrato' ? 1 : 0 })
const prepared = adapter.proyectarFichaRentabilidad(
  [foto('oct-v11', '2026-10'), foto('nov-v11', '2026-11'), foto('dec-v11', '2026-12')],
  [fila(row()), fila(row({ contractCode: 'ISP000044', income: 40, rawIncome: 40, cost: 10, rawCost: 10, estimatedCost: 0, rawEstimatedCost: 0 }), 'contrato'), fila(row({ cost: 2, rawCost: 2, estimatedCost: 0, rawEstimatedCost: 0 }), 'cliente', 'nov-v11', '2026-11')],
  ['14'], now,
)
function fixture() {
  return {
    hoyIso: '2026-11-26', nivel: 'SUPERADMIN', verMargen: true,
    empresa: { id: 'empresa-ficticia', nombre: 'Empresa ficticia', iniciales: 'EF', nif: null, tipo: 'Empresa', estado: { tono: 'ok', txt: 'Cliente activo' } },
    kpis: [{ etiqueta: 'Margen octubre 2026', valor: model.pct(prepared.margenUltimo.pct), sub: '20 €/mes de margen · incluye 20,00 € estimados · mes cerrado por calendario · foto PROYECCION v11 · no acredita cierre certificado', go: 'rentabilidad' }],
    contratos: [{ codigo: 'ISP000044', producto: 'Fibra', sede: 'Sede ficticia', cuota: 40, estado: 'Activo', finPermanencia: '—', margenPct: prepared.margenContrato.get('44') }],
    eventos: [], tareas: [], avisos: [], personas: [], negocios: [], datos: [], comunicaciones: [],
    facturacion: { meses: ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'], serie: [null, 0, 100, 40, 999], hayFacturas: true, facturas: [], anio: '2026', cobrado: 0, pendiente: 0, formaPago: null },
    rentabilidad: prepared.rentabilidad, subida: null,
  }
}
const render = (ficha = fixture()) => renderToStaticMarkup(createElement(ui.default, { ficha, puedeEscribir: false, m365: { aviso: null, corporativo: 'fixture@example.invalid', connectUrl: '/fixture', conexion: { enabled: false, connected: false, email: null, m365: false, envios: false } } }))
const section = (html: string, id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</section>', html.indexOf(`id="${id}"`)))

test('facturación: null por ausencia, cero documentado, varios importes y fuera de ventana', () => {
  const meses = ['2026-08', '2026-09', '2026-10', '2026-11']
  const invoices = [{ mes: '2026-09', base: 0 }, { mes: '2026-10', base: 10 }, { mes: '2026-10', base: 5.25 }, { mes: '2026-12', base: 999 }]
  const before = JSON.stringify(invoices)
  assert.deepEqual(json(model.serieMensual(invoices, meses)), [null, 0, 15.25, null])
  assert.deepEqual(json(model.serieMensual([], meses)), [null, null, null, null])
  assert.equal(JSON.stringify(invoices), before)
})
test('defensa visual: diciembre futuro fuera incluso si llega con un importe real; arrays alineados sin mutación', () => {
  const f = fixture(), before = JSON.stringify(f.facturacion)
  const out = ui.graficoFacturadoFicha(f.facturacion, f.hoyIso)
  assert.deepEqual(json(out), { meses: ['2026-08', '2026-09', '2026-10', '2026-11'], serie: [null, 0, 100, 40] })
  assert.equal(JSON.stringify(f.facturacion), before)
})
test('SSR real: cabecera y contrato octubre 2026 misma PROYECCION v11, calendario no certificado', () => {
  const html = render(), contratos = section(html, 'v-contratos')
  assert.match(html, /Margen octubre 2026/)
  assert.match(contratos, /Margen octubre 2026/)
  assert.match(contratos, /foto PROYECCION v11/)
  assert.match(contratos, /mes cerrado por calendario/)
  assert.match(contratos, /no acredita cierre certificado/)
  assert.match(contratos, /75 %/)
  assert.match(html, /20,0 %/)
  assert.doesNotMatch(html, /foto CIERRE/)
})
test('SSR FACTURADO: noviembre abierto provisional, diciembre sin etiqueta ni barra ni 999', () => {
  const html = section(render(), 'v-facturacion')
  assert.match(html, /mes actual está abierto y es provisional/)
  assert.match(html, /2026-11: 40/)
  assert.match(html, /2026-08: sin dato/)
  assert.match(html, /2026-09: 0/)
  assert.doesNotMatch(html, /2026-12|dic 26|999/)
})
test('SSR coste: noviembre 2 EUR excluido, fuente octubre v11 conservada y calidad sin cambios', () => {
  const html = section(render(), 'v-rentabilidad')
  assert.match(html, /Coste 2026-10: 80/)
  assert.match(html, /foto PROYECCION v11 \(oct-v11\)/)
  assert.match(html, /no se muestra su coste provisional/)
  assert.doesNotMatch(html, /Coste 2026-11|nov-v11|dec-v11|2026-12/)
  assert.equal(prepared.rentabilidad.costeReal.at(-1), 60)
  assert.equal(prepared.rentabilidad.costeEstimado.at(-1), 20)
  assert.equal(prepared.rentabilidad.calidad.at(-1), 75)
})
test('SSR sin foto octubre no presenta margen ni contrato de septiembre como cerrado', () => {
  const empty = adapter.proyectarFichaRentabilidad([foto('sep-v11', '2026-09')], [fila(row(), 'cliente', 'sep-v11', '2026-09')], ['14'], now)
  const f = fixture(); f.rentabilidad = empty.rentabilidad
  f.kpis = [{ etiqueta: 'Margen octubre 2026', valor: 'sin dato', sub: 'sin dato de Rentabilidad · mes cerrado por calendario · sin foto preparada', go: 'rentabilidad' }]
  f.contratos[0].margenPct = null
  const html = render(f), contratos = section(html, 'v-contratos')
  assert.match(contratos, /octubre 2026/); assert.match(contratos, /sin foto preparada/)
  assert.match(contratos, /sin dato/); assert.doesNotMatch(contratos, /75 %/)
})
test('SSR comercial sin rentabilidad ni márgenes en contrato ni etiquetas privadas', () => {
  const f = fixture(); f.verMargen = false; f.rentabilidad = null; f.kpis = []
  f.contratos[0].margenPct = null
  const html = render(f)
  assert.doesNotMatch(html, /oct-v11|foto PROYECCION|75 %/)
  assert.doesNotMatch(section(html, 'v-contratos'), /Margen octubre 2026/)
  assert.equal(forbiddenCalls, 0)
})
