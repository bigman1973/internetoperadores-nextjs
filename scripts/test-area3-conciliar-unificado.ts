/* Encargo J · Conciliar unificado. Sin BD, sin red: funciones puras y análisis estático del código. */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calcularBloqueos, filasConfirmablesConciliar, mensajeBloqueoCuadre, movimientoConfirmableFacil, type CuentaCuadre,
} from '../lib/finanzas/conciliar-cuadre'
import {
  CHIPS, MOTIVOS_NO_REQUIERE, PAGINA_BANDEJA, REDIRECTS_ANTIGUOS, VISTAS, bloqueoPorCuadre, buildKpis, buildPasos, corteMinimo, cuentasActivas,
  destinoConciliar, diasEntre, estadoPropuesta, etiquetaCuenta, fechaCorta, lecturasDeChip, parseVista, quienEs, tamanoPorLectura, textoEstadoCadena,
  tipoDeFila, unirBandeja,
} from '../lib/finanzas/conciliar-unificado'

let pasadas = 0
function t(nombre: string, fn: () => void) { try { fn(); pasadas++ } catch (e) { console.error(`FALLA: ${nombre}`); throw e } }
const leer = (p: string) => readFileSync(resolve(p), 'utf8')

const cuenta = (o: Partial<CuentaCuadre>): CuentaCuadre => ({
  id: 'x', banco: 'B', alias: null, etiqueta: 'Cuenta', ultimos4: null, activa: true, estado: 'OK', cuadra: true, totalMovimientos: 10,
  ultimoMovimiento: null, fechaCorteExtracto: '2026-11-25', avisos: [], ...o,
} as CuentaCuadre)
const CUENTAS: CuentaCuadre[] = [
  cuenta({ id: 'bbva', etiqueta: 'BBVA Principal', estado: 'ORDEN_AMBIGUO', cuadra: false, fechaCorteExtracto: '2026-11-20' }),
  cuenta({ id: 'prest', etiqueta: 'Préstamo', estado: 'ORDEN_AMBIGUO', cuadra: false }),
  cuenta({ id: 'gui', etiqueta: 'Caixa Guissona', fechaCorteExtracto: '2026-11-23' }),
  cuenta({ id: 'san', etiqueta: 'Santander Principal', estado: 'ORDEN_AMBIGUO', cuadra: false }),
  cuenta({ id: 'viv', etiqueta: 'Vivid' }),
  cuenta({ id: 'wise', etiqueta: 'Wise', activa: false, estado: 'SIN_SALDO', cuadra: false, totalMovimientos: 0, fechaCorteExtracto: null }),
]
const ESTADOS = new Map(CUENTAS.map(c => [c.id, c]))

/* 1 · Guarda de cuadre (parte pura que usan las dos rutas POST) */
t('qué acciones pasan por la guarda en Conciliar', () => {
  assert.deepEqual(filasConfirmablesConciliar({ action: 'confirmar', items: [{ id: 'a' }, { id: 'b' }] }), ['a', 'b'])
  assert.deepEqual(filasConfirmablesConciliar({ action: 'confirmar_traspasos_propios_manual', items: [{ id: 'a' }] }), ['a'])
  assert.deepEqual(filasConfirmablesConciliar({ action: 'confirmar', review: { kind: 'REVIEW_CONFIRM', id: 'r1' } }), ['r1'])
  assert.deepEqual(filasConfirmablesConciliar({ action: 'confirmar', review: { kind: 'REVIEW_PREVIEW', id: 'r1' } }), [], 'la vista previa no escribe')
  assert.deepEqual(filasConfirmablesConciliar({ action: 'deshacer', operationId: 'o' }), [], 'deshacer nunca se bloquea')
  assert.deepEqual(filasConfirmablesConciliar({ action: 'pedir', id: 'a' }), [], 'pedir sólo anota, no concilia')
  assert.deepEqual(filasConfirmablesConciliar(null), [])
  assert.deepEqual(filasConfirmablesConciliar('x'), [])
})
t('qué acciones pasan por la guarda en Modo fácil', () => {
  assert.equal(movimientoConfirmableFacil({ action: 'confirmar_factura', movimientoId: 'm1' }), 'm1')
  assert.equal(movimientoConfirmableFacil({ action: 'no_requiere', movimientoId: 'm2' }), 'm2')
  assert.equal(movimientoConfirmableFacil({ action: 'deshacer', movimientoId: 'm3' }), null)
  assert.equal(movimientoConfirmableFacil({ action: 'confirmar_factura' }), null)
  assert.equal(movimientoConfirmableFacil(undefined), null)
})
t('una cuenta que cuadra deja pasar; las demás bloquean', () => {
  assert.equal(calcularBloqueos(new Map([['f1', 'gui'], ['f2', 'viv']]), ESTADOS).length, 0)
  const b = calcularBloqueos(new Map([['f1', 'gui'], ['f2', 'bbva'], ['f3', 'bbva'], ['f4', 'san']]), ESTADOS)
  assert.deepEqual(b.map(x => x.cuentaId).sort(), ['bbva', 'san'])
  assert.equal(b.find(x => x.cuentaId === 'bbva')?.estado, 'ORDEN_AMBIGUO')
})
t('falla cerrado: sin cuenta o cuenta desconocida bloquean', () => {
  assert.equal(calcularBloqueos(new Map([['f1', null]]), ESTADOS)[0].estado, 'SIN_CUENTA')
  assert.equal(calcularBloqueos(new Map([['f1', 'no-existe']]), ESTADOS)[0].estado, 'SIN_CUENTA')
  assert.equal(calcularBloqueos(new Map([['f1', 'wise']]), ESTADOS).length, 1, 'una cuenta inactiva sin saldo no cuadra')
})
t('el mensaje nombra las cuentas y la salida', () => {
  const m = mensajeBloqueoCuadre(calcularBloqueos(new Map([['f', 'bbva'], ['g', 'san']]), ESTADOS))
  assert.match(m, /BBVA Principal, Santander Principal/); assert.match(m, /Cuentas y extractos/)
})
t('las dos rutas llaman a la guarda ANTES de escribir', () => {
  const c = leer('app/api/admin/finanzas/conciliar/route.ts')
  assert.match(c, /guardaCuadreConciliar\(parsed\)/); assert.match(c, /privateJson\(bloqueo, 409\)/)
  assert.match(c, /!reviewPreview/, 'la vista previa de revisión no se bloquea')
  const ordenC = [c.indexOf("phase('command-ready')"), c.indexOf('guardaCuadreConciliar(parsed)')]
  assert(ordenC[0] >= 0 && ordenC[1] > ordenC[0], 'la guarda va tras validar el comando')
  const f = leer('app/api/admin/finanzas/modo-facil/route.ts')
  assert(f.indexOf('guardaCuadreModoFacil(body.value)') > 0 && f.indexOf('guardaCuadreModoFacil(body.value)') < f.indexOf('confirmEasyReconciliation('), 'la guarda va antes de confirmEasyReconciliation')
  assert.match(f, /409/)
})
t('guarda de cliente: igual que la del servidor', () => {
  const mapa = new Map([['gui', true], ['bbva', false]])
  assert.equal(bloqueoPorCuadre('gui', mapa), null)
  assert.equal(bloqueoPorCuadre('bbva', mapa), 'CUENTA_NO_CUADRA')
  assert.equal(bloqueoPorCuadre(null, mapa), 'CUENTA_DESCONOCIDA')
  assert.equal(bloqueoPorCuadre('otra', mapa), 'CUENTA_NO_CUADRA')
})

/* 2 · Vistas, chips y redirects */
t('vistas y parseo', () => {
  assert.deepEqual([...VISTAS], ['bandeja', 'cobros', 'pagos', 'remesas', 'pedir', 'cuentas'])
  assert.equal(parseVista('pagos'), 'pagos'); assert.equal(parseVista('zzz'), 'bandeja'); assert.equal(parseVista(['cuentas', 'x']), 'cuentas'); assert.equal(parseVista(undefined), 'bandeja')
})
t('chips -> lecturas reales de la proyección', () => {
  assert.deepEqual(CHIPS.map(c => c[0]), ['all', 'cli', 'prov', 'banco', 'otro'])
  assert.deepEqual(lecturasDeChip('all'), [{ tab: 'COBROS' }, { tab: 'PAGOS' }])
  assert.deepEqual(lecturasDeChip('cli'), [{ tab: 'COBROS' }])
  assert.deepEqual(lecturasDeChip('prov'), [{ tab: 'PAGOS' }])
  assert.deepEqual(lecturasDeChip('banco'), [{ tab: 'PAGOS', grupo: 'BANCO' }])
  assert.deepEqual(lecturasDeChip('otro'), [{ tab: 'COBROS', estado: 'ROJO' }, { tab: 'PAGOS', estado: 'ROJO' }])
  assert.equal(PAGINA_BANDEJA, 50); assert.equal(tamanoPorLectura(1), 50); assert.equal(tamanoPorLectura(2), 25)
})
t('redirects de las 5 pantallas antiguas', () => {
  assert.deepEqual(Object.keys(REDIRECTS_ANTIGUOS).sort(), ['/admin/finanzas/conciliacion-remesas', '/admin/finanzas/conciliacion-v2', '/admin/finanzas/modo-facil', '/admin/finanzas/para-pedir', '/admin/finanzas/pendientes'])
  assert.equal(destinoConciliar('bandeja'), '/admin/finanzas/conciliar'); assert.equal(destinoConciliar('remesas'), '/admin/finanzas/conciliar?vista=remesas'); assert.equal(destinoConciliar('pedir'), '/admin/finanzas/conciliar?vista=pedir')
  for (const ruta of Object.keys(REDIRECTS_ANTIGUOS)) {
    const f = ruta.replace('/admin/finanzas/', '')
    const src = leer(`app/admin/finanzas/${f}/page.tsx`)
    assert.match(src, /redirect\(destinoConciliar\(/, `${f} redirige`)
    assert.equal(/Workspace/.test(src), false, `${f} ya no monta su pantalla`)
  }
  for (const f of ['modo-facil', 'conciliacion-v2', 'pendientes', 'conciliacion-remesas', 'para-pedir']) assert(existsSync(resolve(`app/admin/finanzas/${f}/page.tsx`)), 'la ruta sigue existiendo (registro Área 4)')
})
t('los componentes y APIs antiguos se conservan', () => {
  for (const p of ['components/finanzas/conciliar/ConciliarWorkspace.tsx', 'components/finanzas/easy/EasyReconciliationWorkspace.tsx', 'components/finanzas/pendientes/PendientesWorkspace.tsx', 'components/finanzas/remesas-b6/RemesasWorkspace.tsx', 'components/finanzas/reconciliation-v2/ReconciliationWorkspace.tsx', 'app/api/admin/finanzas/conciliar/route.ts', 'app/api/admin/finanzas/modo-facil/route.ts']) assert(existsSync(resolve(p)), p)
})

/* 3 · Presentación */
t('estado de propuesta, tipo, quién es y cuenta', () => {
  assert.deepEqual(estadoPropuesta({ color: 'VERDE' }), { cls: 'g', label: 'Propuesta segura' })
  assert.equal(estadoPropuesta({ color: 'AMBAR' }).cls, 'w'); assert.equal(estadoPropuesta({ color: 'ROJO' }).cls, 'b')
  assert.equal(tipoDeFila({ grupo: 'GASTOS_BANCO', importeCentimos: -100 }), 'Banco'); assert.equal(tipoDeFila({ grupo: 'TRASPASOS_PROPIOS', importeCentimos: 5 }), 'Traspaso propio')
  assert.equal(tipoDeFila({ grupo: 'NOMINAS', importeCentimos: -5 }), 'Nómina'); assert.equal(tipoDeFila({ grupo: null, importeCentimos: -5 }), 'Pago por revisar'); assert.equal(tipoDeFila({ grupo: null, importeCentimos: 5 }), 'Cobro por revisar')
  assert.equal(quienEs({ color: 'VERDE', documento: { tercero: 'ACME' } }).label, 'ACME'); assert.equal(quienEs({ color: 'ROJO', documento: null }).label, 'Por confirmar')
  assert.equal(etiquetaCuenta('Vivid (cerrada)', CUENTAS), 'Vivid', 'Vivid está activa: no se enseña «cerrada»')
  assert.equal(etiquetaCuenta('Wise (cerrada)', CUENTAS), 'Wise (cerrada)', 'Wise sí está inactiva')
  assert.equal(etiquetaCuenta(null, CUENTAS), 'Cuenta no disponible'); assert.equal(fechaCorta('2026-11-25'), '25/11'); assert.equal(fechaCorta(null), '—')
  assert.equal(textoEstadoCadena('OK'), 'Cuadra')
})
t('unirBandeja ordena por fecha y no repite', () => {
  const r = unirBandeja([[{ id: 'a', fecha: '2026-11-01' }, { id: 'b', fecha: '2026-11-03' }], [{ id: 'b', fecha: '2026-11-03' }, { id: 'c', fecha: '2026-11-02' }]])
  assert.deepEqual(r.map(x => x.id), ['b', 'c', 'a'])
})

/* 4 · KPIs y pasos con los datos reales de staging (25/11) */
const ENTRADA = { resumen: { movimientos: 3195, entranCentimos: 169240641, salenCentimos: 165972102, conciliados: 878, sinTercero: 658 }, cuentas: CUENTAS, sinDocumentoCobros: 503, sinDocumentoPagos: 1728, rojas: 1442, reglas: 322, hoy: '2026-11-25' }
t('6 KPIs reales, sin cifras inventadas', () => {
  const k = buildKpis(ENTRADA)
  assert.equal(k.length, 6)
  assert.equal(k[0].value, (3195).toLocaleString('es-ES', { maximumFractionDigits: 0 }))
  assert.equal(k[1].value, '878'); assert.match(k[1].sub, /27 %/)
  assert.equal(k[2].value, (2231).toLocaleString('es-ES')); assert.match(k[2].sub, /1\.?728 cargos · 503 cobros/)
  assert.equal(k[3].value, '658')
  assert.equal(k[4].value, '2 de 5', 'cuadran 2 de 5 cuentas activas (Wise inactiva no cuenta)'); assert.equal(k[4].tone, 'b')
  assert.equal(k[5].value, '20/11'); assert.match(k[5].sub, /BBVA Principal/)
})
t('5 pasos en orden y con su destino', () => {
  const p = buildPasos(ENTRADA)
  assert.deepEqual(p.map(x => x.titulo), ['Cargar extractos', 'Cuadrar saldos', 'Reglas automáticas', 'Revisar la bandeja', 'Pedir papeles'])
  assert.deepEqual(p.map(x => x.ir), ['cuentas', 'cuentas', 'reglas', 'bandeja', 'pedir'])
  assert.equal(p[0].estado, 'bad'); assert.equal(p[1].estado, 'bad'); assert.match(p[1].texto, /2 de 5/)
  const todo = buildPasos({ ...ENTRADA, cuentas: CUENTAS.map(c => ({ ...c, cuadra: true, estado: 'OK' as const, fechaCorteExtracto: c.activa ? '2026-11-25' : null })), reglas: 0, rojas: 0 })
  assert.equal(todo[0].estado, 'ok'); assert.equal(todo[1].estado, 'ok'); assert.equal(todo[2].estado, 'ok'); assert.match(todo[4].texto, /Nada que pedir/)
})
t('utilidades de fechas y cuentas activas', () => {
  assert.equal(cuentasActivas(CUENTAS).length, 5); assert.equal(corteMinimo(CUENTAS), '2026-11-20'); assert.equal(diasEntre('2026-11-20', '2026-11-25'), 5)
  assert.equal(MOTIVOS_NO_REQUIERE.length, 6)
})

/* 5 · Contrato visual: marcado y clases de la maqueta */
t('el cliente monta el marcado de la maqueta', () => {
  const c = leer('components/finanzas/conciliar-unificado/ConciliarUnificado.tsx')
  for (const marca of ['header className="top"', 'className="bar"', 'className="brand"', 'className="scn"', 'className="tabs"', 'data-v={v}', 'className="tag"', 'className="kpis"', 'className="kpi"', 'className="replaces"',
    'Cómo se cierra el mes', 'className="steps"', 'className={`step ', 'className="lay"', 'className="panel side"', 'className="chips"', 'className={`mv ', 'className="kv"', 'className="sug', 'className="acts"', 'className="chain"', 'id="tRem"', 'id="tPed"',
    'Movimientos sin documento', 'Cargar extractos', 'Aplicar reglas automáticas', 'Exportar a Excel', 'Exportar a A3', 'Ver auditoría', 'Buscar otra factura', 'Dividir entre varias', 'No requiere documento', 'Pedir el papel', 'Ver huecos',
    'Confirmar no se aplica hasta que la cuenta cuadre (paso 2). Queda en auditoría y se puede deshacer.', 'Solución habitual: descargar del banco el extracto completo del periodo (Norma 43 o Excel)']) assert(c.includes(marca), `falta en el cliente: ${marca}`)
  for (const v of ['Bandeja', 'Cobros de clientes', 'Pagos a proveedores', 'Remesas', 'Para pedir', 'Cuentas y extractos']) assert(c.includes(`'${v}'`) || c.includes(`: '${v}'`), v)
  assert.equal(/ejemplo/i.test(c.replace(/ejemplo de/gi, '')), false, 'ninguna cifra de ejemplo de la maqueta')
})
t('el CSS propio sólo cuelga de .io-ui.area3-conciliar y no toca el kit', () => {
  const css = leer('app/admin/finanzas/conciliar/area3-conciliar.css')
  const reglas = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map(x => x.split('{')[0].trim()).filter(x => x && !x.startsWith('@') && !/^\d+%$|^from$|^to$/.test(x))
  for (const sel of reglas) for (const parte of sel.split(',')) assert(parte.trim().startsWith('.io-ui.area3-conciliar'), `selector fuera de ámbito: ${parte.trim()}`)
  for (const clase of ['.kpis', '.kpi', '.steps', '.step', '.lay', '.side', '.mv', '.st', '.sug', '.conf', '.acts', '.chain', '.chips', '.kv', '.replaces']) assert(css.includes(`.area3-conciliar ${clase}`), clase)
  const page = leer('app/admin/finanzas/conciliar/page.tsx')
  assert.match(page, /@\/components\/io-ui\/io-ui\.css/); assert.match(page, /area3-conciliar/)
})
t('la página mantiene las guardas de la anterior', () => {
  const p = leer('app/admin/finanzas/conciliar/page.tsx')
  for (const g of ['assertConciliarRuntime', 'ConciliarRuntimeError', "requireB4FinanceAccess('lectura'", "requireAuth('admin')", "preferredRegion = 'sfo1'", "dynamic = 'force-dynamic'", 'notFound()']) assert(p.includes(g), g)
  assert(p.indexOf('assertConciliarRuntime()') < p.indexOf('readCuentasCuadre()'), 'primero la guarda, después la BD')
})
t('el cliente confirma sólo lo verde y respeta cuadre, auditoría y deshacer', () => {
  const c = leer('components/finanzas/conciliar-unificado/ConciliarUnificado.tsx')
  assert.match(c, /row\.color === 'VERDE' && \(row\.seleccionable \|\| hasHumanOwnTransferConfirmation\(row\)\)/, 'G7: sólo lo verde y seleccionable')
  assert.match(c, /textoBloqueo\(row\)/); assert.match(c, /'CUENTA_NO_CUADRA'/); assert.match(c, /makeIdempotencyKey\(\)/)
  assert.match(c, /requiresSeparateRemesaConfirmation/, 'la remesa va sola y con vista previa'); assert.match(c, /remesa-preview/)
  assert.match(c, /REVIEW_PREVIEW/); assert.match(c, /REVIEW_CONFIRM/); assert.match(c, /ConciliarConfirmationHistory/); assert.match(c, /action: 'deshacer'/)
  assert.match(c, /ResultadoIncierto/, 'un resultado incierto se reintenta con la MISMA clave')
  assert.equal(/\bfetch\(/.test(c), false, 'el cliente no hace fetch directo: todo pasa por api.ts')
  const api = leer('components/finanzas/conciliar-unificado/api.ts')
  assert.match(api, /x-io-acting-session/); assert.match(api, /ResultadoIncierto/)
})
t('sólo usa APIs permitidas a perfiles easy-only', () => {
  const todo = leer('components/finanzas/conciliar-unificado/ConciliarUnificado.tsx') + leer('components/finanzas/conciliar-unificado/api.ts')
  const rutas = [...todo.matchAll(/\/api\/admin\/finanzas\/[a-z0-9/_-]+/g)].map(m => m[0])
  for (const r of rutas) assert(/^\/api\/admin\/finanzas\/(conciliar|modo-facil)(\/|$)/.test(r), `API fuera del perímetro: ${r}`)
  assert.equal(/estado-cuentas|remesas\/b6/.test(todo), false)
})
t('ninguna ruta nueva: el registro del Área 4 sigue igual', () => {
  for (const r of ['/admin/finanzas/conciliar', '/admin/finanzas/modo-facil', '/admin/finanzas/para-pedir', '/admin/finanzas/conciliacion-v2', '/admin/finanzas/pendientes', '/admin/finanzas/conciliacion-remesas']) assert(leer('lib/area4/section-registry.ts').includes(r), `registrada: ${r}`)
})
console.log(`OK: ${pasadas}/${pasadas} comprobaciones del encargo J (Conciliar unificado).`)
