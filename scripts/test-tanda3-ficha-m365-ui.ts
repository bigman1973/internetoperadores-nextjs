/** Tanda 3 · Ficha Production: puertas existentes de correo/IA y conexión Outlook.
 * Ejecutar: node_modules/.bin/tsx scripts/test-tanda3-ficha-m365-ui.ts
 * Fuente real compilada/exportada sólo en memoria. SSR real + harness de hooks,
 * efectos, callbacks antiguos y respuestas diferidas. Sin HTTP, BD, .env ni proveedor.
 * El harness no sustituye pruebas de autenticación/endpoints ni un navegador React.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const requireLocal = createRequire(import.meta.url)
const { transformSync } = createRequire(requireLocal.resolve('tsx/package.json'))('esbuild')
const sourcePath = fileURLToPath(new URL('../components/admin/FichaCliente.tsx', import.meta.url))
const policyPath = fileURLToPath(new URL('../lib/m365-legacy-policy.ts', import.meta.url))
const source = readFileSync(sourcePath, 'utf8')
const compiled = transformSync(`${source}\nexport { Drawer, Timeline, Bars }\n`, {
  loader: 'tsx', jsx: 'automatic', format: 'cjs', platform: 'node', target: 'es2022', sourcefile: sourcePath,
}).code
const policyModule = { exports: {} as Record<string, any> }
runInNewContext(transformSync(readFileSync(policyPath, 'utf8'), { loader: 'ts', format: 'cjs', platform: 'node' }).code, {
  module: policyModule, exports: policyModule.exports, process: { env: {} },
  require(id: string) { throw new Error(`Import de policy no permitido: ${id}`) },
})
const policy = policyModule.exports
const MESSAGE: string = policy.M365_LEGACY_PENDING_MESSAGE
assert.equal(MESSAGE, 'Envio pendiente de activar (se hara desde Mi Outlook)')

type Conexion = { enabled: boolean; connected: boolean; email: string | null; mail?: boolean; m365?: boolean; envios?: boolean }
const closed: Conexion = { enabled: true, connected: false, email: null, mail: false, m365: false, envios: false }
const open: Conexion = { ...closed, m365: true, envios: true }
const fixture = {
  empresa: { id: 'empresa-fixture', nombre: 'Empresa ficticia', iniciales: 'EF', nif: null, tipo: 'Empresa', estado: { tono: 'ok', txt: 'Cliente activo' } },
  personas: [{ id: 'persona-fixture', nombre: 'Persona ficticia', iniciales: 'PF', papel: 'sin dato', email: 'persona@example.invalid', ultimo: 'sin dato' }],
  eventos: [{ id: 'evento-fixture', cat: 'mail', titulo: 'Conversación histórica', fuente: 'Outlook', cuando: 'ayer', fechaIso: '2026-11-25T10:00:00Z', tipo: 'Correo recibido', quien: 'Persona ficticia', texto: 'Actividad conservada', acciones: ['responder'], contactoId: 'persona-fixture' }],
  kpis: [], contratos: [], negocios: [], tareas: [], avisos: [], datos: [], comunicaciones: [],
  facturacion: { hayFacturas: false, facturas: [], meses: [], serie: [], anio: 2026, cobrado: null, pendiente: null, formaPago: null },
  rentabilidad: null, verMargen: false,
  subida: { pctMedio: 2, subidaMes: 2, subidaAnio: 24, fechaLimiteAviso: null, fechaEfecto: null },
}
const connectUrl = '/__fixture__/outlook/connect'
const m365 = (conexion: Conexion) => ({ conexion: { ...conexion }, aviso: null, corporativo: 'corporativo@example.invalid', connectUrl })
const fichaProps = (conexion: Conexion) => ({ ficha: fixture, m365: m365(conexion), puedeEscribir: true })
const drawerProps = (kind: 'mail' | 'ai' | 'meet', conexion: Conexion) => ({
  ...fichaProps(conexion), cajon: { kind }, onClose() {}, onOpen(_c: unknown) {}, toast(_m: string) {},
})
let forbiddenCalls = 0
function forbiddenFetch(): never { forbiddenCalls++; throw new Error('HTTP/DB/PROVEEDOR PROHIBIDO') }
function load(react: unknown, jsxRuntime: unknown, extra: Record<string, unknown> = {}): Record<string, any> {
  const module = { exports: {} }
  runInNewContext(compiled, {
    module, exports: module.exports, console, Date, Intl, URLSearchParams, AbortController,
    fetch: forbiddenFetch,
    // Timers, ubicación y DOM son objetos locales; nunca se navega ni se recarga de verdad.
    setTimeout() { return 0 }, clearTimeout() {},
    crypto: { randomUUID: () => 'request-fixture' },
    history: { replaceState() {} }, location: { hash: '', reload() {} },
    document: { addEventListener() {}, removeEventListener() {} }, window: { scrollTo() {}, print() {} },
    ...extra,
    require(id: string) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return jsxRuntime
      if (id === '@/lib/m365-legacy-policy') return policy
      throw new Error(`Import de runtime no permitido: ${id}`)
    },
  }, { filename: `${sourcePath}:memory-ui-test`, timeout: 5000 })
  return module.exports
}
const real = load(requireLocal('react'), requireLocal('react/jsx-runtime'))
function ssr(name: 'default' | 'Drawer' | 'Bars', props: unknown): string {
  return renderToStaticMarkup(createElement(real[name] as ComponentType<any>, props as any))
}
const links = (html: string) => [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
  .filter(match => match[1] === connectUrl).map(match => match[2])

type Node = { type: any; props: Record<string, any> }
function nodes(node: any): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!node || typeof node !== 'object') return []
  return [node, ...nodes(node.props?.children), ...nodes(node.props?.pie)]
}
const text = (node: any): string => {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return text(node.props?.children)
}
const sameDeps = (a?: unknown[], b?: unknown[]) => Boolean(a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i])))
class Hooks {
  index = 0
  slots: any[] = []
  pending = new Map<number, () => void>()
  api = {
    useState: (initial: any) => {
      const i = this.index++
      if (!(i in this.slots)) this.slots[i] = { value: typeof initial === 'function' ? initial() : initial }
      return [this.slots[i].value, (value: any) => { this.slots[i].value = typeof value === 'function' ? value(this.slots[i].value) : value }]
    },
    useRef: (current: any) => {
      const i = this.index++
      if (!(i in this.slots)) this.slots[i] = { current }
      return this.slots[i]
    },
    useMemo: (fn: () => any, deps?: unknown[]) => this.memo(fn, deps),
    useCallback: (fn: (...args: any[]) => any, deps?: unknown[]) => this.memo(() => fn, deps),
    useEffect: (fn: () => any, deps?: unknown[]) => {
      const i = this.index++, old = this.slots[i]
      if (old && sameDeps(old.deps, deps)) return
      this.slots[i] = { deps, cleanup: old?.cleanup }
      this.pending.set(i, () => {
        this.slots[i].cleanup?.()
        this.slots[i].cleanup = fn()
      })
    },
  }
  memo(fn: () => any, deps?: unknown[]) {
    const i = this.index++, old = this.slots[i]
    if (!old || !sameDeps(old.deps, deps)) this.slots[i] = { deps, value: fn() }
    return this.slots[i].value
  }
  flush() { const queue = [...this.pending.values()]; this.pending.clear(); queue.forEach(fn => fn()) }
  unmount() { this.pending.clear(); this.slots.forEach(slot => slot.cleanup?.()) }
}
type Call = { url: string; init: any; body?: any }
function harness(name: 'default' | 'Drawer', props: any, options: { defer?: boolean } = {}) {
  const hooks = new Hooks(), calls: Call[] = [], deferred: Array<{ call: Call; resolve: (response: any) => void }> = []
  const jsx = (type: any, props: any): Node => ({ type, props })
  let reloads = 0, closes = 0, opens = 0
  const toasts: string[] = []
  if (name === 'Drawer') {
    props.onClose = () => { closes++ }
    props.onOpen = () => { opens++ }
    props.toast = (message: string) => { toasts.push(message) }
  }
  const module = load(hooks.api, { jsx, jsxs: jsx, Fragment: 'fragment' }, {
    location: { hash: '', reload() { reloads++ } },
    setTimeout(fn: () => void, ms: number) { if (ms < 1000) fn(); return 0 },
    fetch(url: string, init: any) {
      assert.ok(/^\/api\/admin\/crm\/(?:empresas|contactos)\/[^/]+\/(?:resumen-ia|correos-recibidos|m365\/borrador\?|actividades)/.test(url), `Ruta mock inesperada: ${url}`)
      const call = { url, init, body: init.body ? JSON.parse(init.body) : undefined }
      calls.push(call)
      if (options.defer) return new Promise(resolve => deferred.push({ call, resolve }))
      return Promise.resolve({ ok: true, json: async () => url.includes('resumen-ia') ? { puntos: ['Resumen ficticio'] }
        : url.includes('borrador') ? { asunto: 'Propuesta ficticia', cuerpo: 'Mensaje ficticio', avisos: [] }
          : url.includes('correos-recibidos') ? { eventos: [], direcciones: 1, dias: 7 } : { success: true } })
    },
  })
  let tree: any
  const render = () => { hooks.index = 0; tree = module[name](props); return nodes(tree) }
  render()
  return {
    props, calls, deferred, hooks, render,
    get all() { return nodes(tree) },
    get counters() { return { reloads, closes, opens, toasts } },
    find(predicate: (node: Node) => boolean) { const node = nodes(tree).find(predicate); assert.ok(node, 'Control real de ficha no encontrado'); return node },
    button(label: string) { return this.find(n => n.type === 'button' && text(n) === label) },
    update(conexion: Partial<Conexion>) { props.m365 = { ...props.m365, conexion: { ...props.m365.conexion, ...conexion } }; render() },
  }
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
let passed = 0
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`OK ${name}`) }

async function main() {
  await test('SSR ficha cerrada: cabecera, compositor, resumen, personas, respuestas y tarifas no ofrecen correo/IA', () => {
    const html = ssr('default', fichaProps(closed))
    assert.ok(!html.includes('data-open="mail"') && !html.includes('data-open="ai"'))
    for (const label of ['Escribir correo', 'Redactar con IA', 'Proponer correo de seguimiento', 'Responder', 'Preparar aviso con IA']) assert.ok(!html.includes(label), label)
    assert.ok(!/<button[^>]*>Correo<\/button>/.test(html))
    assert.ok(html.includes(MESSAGE) && html.includes('role="status"'))
    assert.ok(html.includes('Conversación histórica') && html.includes('Actividad conservada'))
    for (const label of ['Nueva reunión', 'Nota', 'Llamada', 'Tarea', 'Preparar la próxima reunión']) assert.ok(html.includes(label), label)
    assert.deepEqual(links(html), [])
  })
  await test('SSR cierre envios:false oculta todas las entradas aunque M365 global siga abierto y conectado', () => {
    const html = ssr('default', fichaProps({ ...open, envios: false, connected: true, mail: true }))
    assert.ok(!html.includes('data-open="mail"') && !html.includes('data-open="ai"') && !html.includes('Responder'))
    assert.ok(html.includes('Ver correos recibidos en mi Outlook'), 'La lectura ya autorizada no depende de envios')
  })
  await test('SSR fichas/drawers: enabled de agenda no basta para Connect con m365:false', () => {
    for (const envios of [false, true]) {
      const conexion = { ...closed, envios }
      for (const kind of ['mail', 'ai', 'meet'] as const) assert.deepEqual(links(ssr('Drawer', drawerProps(kind, conexion))), [])
      assert.deepEqual(links(ssr('default', fichaProps(conexion))), [])
    }
  })
  await test('SSR drawer retenido: correo e IA inhabilitados y aviso exacto; no hay generación ni conexión', () => {
    for (const kind of ['mail', 'ai'] as const) {
      const html = ssr('Drawer', drawerProps(kind, { ...open, envios: false }))
      assert.ok(html.includes('<fieldset disabled=""'))
      assert.ok(html.includes(MESSAGE) && html.includes('>Cerrar</button>'))
      assert.ok(!html.includes('data-open="ai"') && !html.includes('Otra versión'))
      assert.deepEqual(links(html), [])
    }
  })
  await test('SSR apertura existente/compatibilidad: entradas mail/IA y Connect según enabled,m365; sin flags nuevos', () => {
    for (const conexion of [open, { enabled: true, connected: false, email: null, mail: false }]) {
      const html = ssr('default', fichaProps(conexion))
      assert.ok(html.includes('Escribir correo') && html.includes('Redactar con IA') && html.includes('Responder con IA'))
      assert.deepEqual(links(ssr('Drawer', drawerProps('mail', conexion))), ['Conectar mi Outlook'])
      assert.deepEqual(links(ssr('Drawer', drawerProps('meet', conexion))), ['Conectar mi Outlook'])
    }
    assert.deepEqual(links(ssr('Drawer', drawerProps('mail', { ...open, enabled: false }))), [])
    assert.deepEqual(links(ssr('Drawer', drawerProps('mail', { ...open, connected: true, mail: false }))), ['Conceder permiso de correo'])
    assert.deepEqual(links(ssr('Drawer', drawerProps('mail', { ...open, connected: true, mail: true }))), [])
    assert.ok(!source.includes('process.env'))
  })
  for (const conexion of [closed, { ...open, envios: false }, { ...open, m365: false }]) {
    await test(`efectos ficha y AI montados bajo cierre envios=${conexion.envios},m365=${conexion.m365}: cero GET IA`, async () => {
      for (const [name, props] of [['default', fichaProps(conexion)], ['Drawer', drawerProps('ai', conexion)]] as const) {
        const h = harness(name, props); h.hooks.flush(); await settle(); h.render()
        assert.equal(h.calls.length, 0)
        assert.ok(h.all.some(n => text(n) === MESSAGE))
        h.hooks.unmount()
      }
    })
  }
  await test('efecto resumen retenido de un render abierto consulta la puerta vigente antes de iniciar GET', async () => {
    const h = harness('default', fichaProps(open))
    h.update({ envios: false }); h.hooks.flush(); await settle(); h.render()
    assert.equal(h.calls.length, 0)
  })
  await test('cabecera/personas/timeline/tarifas/compositor: callbacks previos no abren mail/IA tras cierre', async () => {
    const h = harness('default', fichaProps(open))
    const retained = h.all.filter(n => n.type === 'button' && ['mail', 'ai'].includes(n.props['data-open'])).map(n => n.props.onClick)
    const timeline = h.find(n => typeof n.type === 'function' && n.type.name === 'Timeline').props.onOpen
    h.button('Correo').props.onClick(); h.render()
    const save = h.button('Guardar').props.onClick
    h.update({ envios: false })
    for (const callback of retained) callback()
    timeline({ kind: 'mail', para: 'persona-fixture' }); timeline({ kind: 'ai', para: 'persona-fixture' }); await save()
    h.hooks.flush(); await settle(); h.render()
    assert.equal(h.calls.length, 0)
    assert.ok(!h.all.some(n => typeof n.type === 'function' && n.type.name === 'Drawer'))
    assert.equal(text(h.find(n => n.props.id === 'toast')), MESSAGE)
  })
  for (const gate of [{ envios: false }, { m365: false }]) {
    await test(`callbacks IA retenidos tras ${JSON.stringify(gate)}: ni GET borrador ni apertura desde mail`, async () => {
      const ai = harness('Drawer', drawerProps('ai', open))
      const proponer = ai.button('Otra versión').props.onClick
      ai.update(gate); ai.hooks.flush(); await proponer(); await settle(); ai.render()
      assert.equal(ai.calls.length, 0)
      const mail = harness('Drawer', drawerProps('mail', open))
      const abrir = mail.button('Redactar con IA').props.onClick
      mail.update(gate); abrir(); mail.hooks.flush(); await settle(); mail.render()
      assert.equal(mail.calls.length, 0); assert.equal(mail.counters.opens, 0)
      assert.ok(mail.all.some(n => n.props.role === 'status' && text(n) === MESSAGE))
    })
  }
  await test('correo retenido: cierre envios bloquea callback Enviar incluso con contenido válido; sin POST ni éxito', async () => {
    const h = harness('Drawer', drawerProps('mail', open))
    h.find(n => n.type === 'input' && n.props.value === '').props.onChange({ target: { value: 'Asunto conservado' } })
    h.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Mensaje conservado' } }); h.render()
    const enviar = h.button('Enviar').props.onClick
    h.update({ envios: false }); await enviar(); h.render()
    assert.equal(h.calls.length, 0); assert.equal(h.counters.closes, 0); assert.equal(h.counters.reloads, 0); assert.deepEqual(h.counters.toasts, [])
    assert.equal(h.find(n => n.type === 'textarea').props.value, 'Mensaje conservado')
    assert.equal(h.find(n => n.type === 'fieldset').props.disabled, true)
  })
  await test('resumen en vuelo: aborta y descarta respuesta tardía al cerrar envios; reapertura recupera GET normal', async () => {
    const h = harness('default', fichaProps(open), { defer: true })
    h.hooks.flush(); assert.equal(h.calls.length, 1)
    h.update({ envios: false }); h.hooks.flush()
    assert.equal(h.calls[0].init.signal.aborted, true)
    h.deferred[0].resolve({ ok: true, json: async () => ({ puntos: ['NO MOSTRAR RESPUESTA ANTIGUA'] }) })
    await settle(); h.render()
    assert.ok(!h.all.some(n => text(n).includes('NO MOSTRAR RESPUESTA ANTIGUA')))
    h.update({ envios: true }); h.hooks.flush(); assert.equal(h.calls.length, 2)
    h.deferred[1].resolve({ ok: true, json: async () => ({ puntos: ['Resumen reabierto'] }) }); await settle(); h.render()
    assert.ok(h.all.some(n => text(n) === 'Resumen reabierto'))
  })
  await test('propuesta IA en vuelo: aborta y conserva borrador al cerrar M365 o envios', async () => {
    for (const gate of [{ envios: false }, { m365: false }]) {
      const h = harness('Drawer', drawerProps('ai', open), { defer: true })
      h.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Mi texto conservado' } })
      h.hooks.flush(); assert.equal(h.calls.length, 1)
      h.update(gate); h.hooks.flush(); assert.equal(h.calls[0].init.signal.aborted, true)
      h.deferred[0].resolve({ ok: true, json: async () => ({ asunto: 'IA ANTIGUA', cuerpo: 'NO SOBRESCRIBIR' }) })
      await settle(); h.render()
      assert.equal(h.find(n => n.type === 'textarea').props.value, 'Mi texto conservado')
    }
  })
  for (const [label, type] of [['Nota', 'NOTA'], ['Llamada', 'LLAMADA'], ['Tarea', 'TAREA']] as const) {
    await test(`compositor ${label} cerrado: conserva POST local y éxito sin llamadas IA`, async () => {
      const h = harness('default', fichaProps(closed))
      h.button(label).props.onClick(); h.render()
      h.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Actividad local ficticia' } }); h.render()
      h.hooks.flush(); await h.button('Guardar').props.onClick(); await settle(); h.render()
      assert.equal(h.calls.length, 1); assert.equal(h.calls[0].body.type, type)
      assert.equal(h.calls[0].init.method, 'POST'); assert.equal(h.calls[0].body.syncOutlook, undefined)
      assert.equal(h.counters.reloads, 1)
    })
  }
  await test('reunión defaultlocal515 preservada: cierre inicia sin Outlook/Teams/invitaciones y guarda local', async () => {
    for (const conexion of [closed, { ...open, envios: false }]) {
      const h = harness('Drawer', drawerProps('meet', conexion))
      const boxes = h.all.filter(n => n.type === 'input' && n.props.type === 'checkbox')
      assert.equal(boxes[0].props.checked, false); assert.equal(boxes[1].props.checked, false)
      h.hooks.flush(); await h.button('Crear reunión').props.onClick(); await settle(); h.render()
      assert.equal(h.calls.length, 1)
      const body = h.calls[0].body
      assert.equal(body.type, 'REUNION'); assert.equal(body.syncOutlook, false); assert.equal(body.onlineMeeting, false); assert.equal(body.inviteAttendees, false)
      assert.equal(h.counters.closes, 1); assert.deepEqual(h.counters.toasts, ['Reunión guardada en la ficha.'])
      assert.ok(!h.all.some(n => n.props.role === 'status'))
    }
  })
  await test('lectura Outlook sigue separada del envío y callback viejo no lee tras cierre M365', async () => {
    const h = harness('default', fichaProps({ ...open, envios: false, connected: true, mail: true }))
    const read = h.button('Ver correos recibidos en mi Outlook').props.onClick
    h.hooks.flush(); await read(); await settle(); h.render()
    assert.equal(h.calls.length, 1); assert.ok(h.calls[0].url.endsWith('/correos-recibidos'))
    h.update({ m365: false }); await read(); h.hooks.flush(); await settle()
    assert.equal(h.calls.length, 1)
  })
  await test('barras nulas/sin foto/sin cliente/sin coste: ninguna barra cero falsa ni tooltip monetario inventado', () => {
    const meses = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    const foto = (month: string) => ({ id: `foto-${month}`, month, kind: 'PROYECCION', version: 2, createdAt: null })
    const html = ssr('Bars', { meses, a: [null, 100, 100, null, 100], b: [null, 60, null, 60, 80],
      fotos: [null, foto(meses[1]), foto(meses[2]), foto(meses[3]), foto(meses[4])],
      estados: ['SIN_FOTO', 'SIN_CLIENTE', 'SIN_COSTE', 'DATOS_INCOMPLETOS', 'DISPONIBLE'] })
    assert.equal((html.match(/<rect /g) || []).length, 2, 'Sólo el mes completo dibuja ingreso y coste')
    assert.ok(html.includes('2026-06: sin dato (sin foto preparada)'))
    assert.ok(html.includes('2026-07: sin dato (cliente ausente en la foto)'))
    assert.ok(html.includes('2026-08: sin dato (sin coste conocido)'))
    assert.ok(html.includes('2026-09: sin dato (datos incompletos)'))
    assert.ok(html.includes('Ingreso 2026-10: 100 €') && html.includes('Coste 2026-10: 80 €'))
    assert.ok(html.includes('foto PROYECCION v2 (foto-2026-10)'))
    assert.ok(!html.includes('NaN') && !html.includes('undefined') && !html.includes('Coste 2026-08: 0'))
  })
  await test('serie sin datos completa: sin SVG ni rects; cero acreditado no se convierte en sin dato', () => {
    const missing = ssr('Bars', { meses: ['2026-09', '2026-10'], a: [null, null], b: [null, null], fotos: [null, null], estados: ['SIN_VINCULO', 'SIN_FOTO'] })
    assert.ok(!missing.includes('<svg') && !missing.includes('<rect'))
    assert.ok(missing.includes('sin vínculo ISP') && missing.includes('sin foto preparada'))
    const zero = ssr('Bars', { meses: ['2026-10'], a: [0], b: [0], fotos: [{ id: 'cero-acreditado', month: '2026-10', kind: 'CIERRE', version: 1, createdAt: null }], estados: ['DISPONIBLE'] })
    assert.equal((zero.match(/<rect /g) || []).length, 2)
    assert.ok(zero.includes('Ingreso 2026-10: 0 €') && zero.includes('Coste 2026-10: 0 €'))
    assert.ok(!zero.includes('sin dato') && !zero.includes('NaN'))
    const negative = ssr('Bars', { meses: ['2026-10'], a: [-10], b: [5] })
    assert.ok(!/height="-/.test(negative) && negative.includes('-10 €'))
  })
  await test('SSR ficha rentabilidad: mes/foto identificados, huecos explícitos y nota honesta de estimados', () => {
    const snapshot = { id: 'oct-foto2', month: '2026-10', kind: 'PROYECCION', version: 2, createdAt: '2026-11-24T09:00:00Z' }
    const html = ssr('default', { ...fichaProps(closed), ficha: { ...fixture, verMargen: true, rentabilidad: {
      mes: '2026-10', meses: ['2026-09', '2026-10'], ingreso: [null, 100], coste: [null, 80], hay: true,
      snapshot, fotos: [null, snapshot], estados: ['SIN_FOTO', 'DISPONIBLE'],
    } } })
    assert.ok(html.includes('Mes de la última foto preparada: <b>2026-10</b>'))
    assert.ok(html.includes('foto PROYECCION v2 (oct-foto2)') && html.includes(snapshot.createdAt))
    assert.ok(html.includes('El coste incluye importes estimados cuando constan en la foto'))
    assert.ok(html.includes('2026-09: sin dato (sin foto preparada)'))
    assert.equal((html.match(/<rect /g) || []).length, 2)
  })
  await test('SSR y VM: cero llamadas reales; únicamente fetch mock local con fuentes de ficha y policy', () => assert.equal(forbiddenCalls, 0))
  console.log(`\n${passed}/${passed} OK · SSR real + callbacks/efectos en memoria; sin HTTP, BD, .env ni proveedor`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
