/** Tanda 3 · Flag CRM único. Fuentes reales en VM; Prisma, React y respuestas sólo en memoria.
 * Sin .env, auth real, HTTP, tokens ni proveedores. Los callbacks UI no prueban autenticación HTTP.
 * Ejecutar con env -i PATH="$PATH" HOME=/home/ubuntu DATABASE_URL=postgresql://fixture@127.0.0.1:9/fixture node_modules/.bin/tsx scripts/test-tanda3-crm-single-gate.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import * as crypto from 'node:crypto'

const localRequire = createRequire(import.meta.url)
const { transformSync } = createRequire(localRequire.resolve('tsx/package.json'))('esbuild')
const FLAG = 'M365_LEGACY_CRM_EXTERNAL_ENABLED'
const MESSAGE = 'Envio pendiente de activar (se hara desde Mi Outlook)'
const CODE = 'M365_LEGACY_PENDING'
const COMPOSER = 'components/admin/CrmActivityComposer.tsx'
const FICHA = 'components/admin/FichaCliente.tsx'
const oldGate = ['AREA1', 'ENVIOS', 'CRM', 'PRODUCCION'].join('_')
let passed = 0, networkCalls = 0
const noFetch = () => { networkCalls++; throw new Error('NETWORK_FORBIDDEN') }
const compiled = new Map<string, string>()
function load(file: string, dependencies: Record<string, unknown>, env: Record<string, string | undefined> = {}, extra: Record<string, unknown> = {}, appendix = ''): any {
  const key = file + appendix
  if (!compiled.has(key)) compiled.set(key, transformSync(readFileSync(file, 'utf8') + appendix, {
    loader: file.endsWith('.tsx') ? 'tsx' : 'ts', jsx: 'automatic', format: 'cjs', platform: 'node', target: 'es2022', sourcefile: file,
  }).code)
  const module = { exports: {} }
  runInNewContext(compiled.get(key)!, {
    module, exports: module.exports, console, Date, URL, URLSearchParams, AbortController, Buffer,
    process: { env }, fetch: noFetch, ...extra,
    require(id: string) { assert.ok(Object.hasOwn(dependencies, id), `Import no permitido en ${file}: ${id}`); return dependencies[id] },
  }, { filename: file, timeout: 5000 })
  return module.exports
}
async function test(name: string, run: () => unknown) { await run(); passed++; console.log(`OK ${name}`) }
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? sources(path) : /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [path] : []
  })
}
async function status(env: Record<string, string | undefined>, connection: any = null) {
  let reads = 0, gates = 0
  const policy = load('lib/m365-legacy-policy.ts', {}, env)
  const area1 = load('lib/area1-m365.ts', {}, env)
  const module = load('lib/outlook-user-connection.ts', {
    'node:crypto': crypto,
    '@/lib/prisma': { __esModule: true, default: { outlookConexion: { async findUnique(input: any) {
      reads++; assert.equal(input.where.usuarioId, 7)
      assert.deepEqual(Object.keys(input.select).sort(), ['conectadoAt', 'email', 'revocadoAt', 'scopes', 'ultimoError'])
      return connection
    } } } },
    '@/lib/area1-m365': area1,
    '@/lib/m365-legacy-policy': { ...policy, m365LegacyEnabled(route: string) { gates++; assert.equal(route, 'crm'); return policy.m365LegacyEnabled(route) } },
  }, env)
  const value = await module.getOutlookConnectionStatus(7)
  assert.equal(reads, 1); assert.equal(gates, 1)
  return value
}
const connection = { email: 'fixture@internetoperadores.com', conectadoAt: new Date('2026-11-26T10:00:00Z'), revocadoAt: null, ultimoError: null, scopes: 'User.Read Calendars.ReadWrite Mail.Send Mail.ReadWrite' }
const pendingBodies = [
  { code: CODE, success: false, error: MESSAGE },
  { codigo: CODE, success: false, message: MESSAGE },
  { code: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', success: false, error: 'Cierre global' },
  { codigo: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', success: false, error: 'Cierre global' },
  { error: 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.' },
]
function nodes(node: any): any[] {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (typeof node !== 'object') return []
  return [node, ...nodes(node.props?.children)]
}
function ui(kind: 'composer-mail' | 'composer-meet' | 'drawer-mail' | 'drawer-meet', options: any = {}) {
  const drawer = kind.startsWith('drawer'), meeting = kind.endsWith('meet')
  let index = 0, closed = 0, created = 0, pending = 0, reloads = 0
  const states: any[] = [], payloads: any[] = [], toasts: string[] = []
  const responses = [...(options.responses || pendingBodies.slice(0, 1))]
  const jsx = (type: any, props: any) => ({ type, props })
  const hooks = {
    useState(initial: any) {
      const current = index++
      if (!(current in states)) states[current] = typeof initial === 'function' ? initial() : initial
      return [states[current], (value: any) => { states[current] = typeof value === 'function' ? value(states[current]) : value }]
    },
    useEffect() {}, useMemo: (fn: any) => fn(), useCallback: (fn: any) => fn, useRef: (current: any) => ({ current }),
  }
  const policy = load('lib/m365-legacy-policy.ts', {})
  const outlook = { enabled: true, connected: true, mail: true, m365: true, envios: false, email: connection.email, connectedAt: null, lastError: null, ...options.outlook }
  const props: any = drawer ? {
    cajon: { kind: meeting ? 'meet' : 'mail' }, ficha: { empresa: { nombre: 'Fixture' }, personas: [{ id: 'fixture', nombre: 'Persona fixture', email: 'recipient@example.test', papel: 'sin dato' }] },
    m365: { aviso: null, conexion: outlook, corporativo: 'corporativo@example.test', connectUrl: '/unused' }, puedeEscribir: options.canWrite !== false,
    onClose() { closed++ }, onOpen() {}, toast(value: string) { toasts.push(value) },
  } : {
    open: true, type: meeting ? 'REUNION' : options.type || 'CORREO', contactId: 'fixture', contactName: 'Fixture', contactEmail: 'recipient@example.test', contactPhone: '', contactLinkedIn: '', senderEmail: connection.email,
    outlookConnection: outlook, deals: [], onClose() { closed++ }, onCreated() { created++ }, onPending() { pending++ },
  }
  const module = load(drawer ? FICHA : COMPOSER, {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@heroicons/react/24/outline': new Proxy({}, { get: (_target, name) => String(name) }),
    './Area1M365': { Area1M365Aviso: 'Area1M365Aviso', Area1M365Correo: 'Area1M365Correo' },
    '@/lib/area1-m365': load('lib/area1-m365.ts', {}), '@/lib/m365-legacy-policy': policy,
  }, {}, {
    crypto: { randomUUID: () => 'memory-ui-request' }, window: { confirm: () => true, open() { throw new Error('NO_WINDOW') } },
    location: { reload() { reloads++ } }, setTimeout(fn: () => void) { fn(); return 0 },
    async fetch(url: string, init: any) {
      assert.equal(url, '/api/admin/crm/contactos/fixture/actividades'); assert.equal(init.method, 'POST')
      payloads.push(JSON.parse(init.body))
      assert.ok(responses.length, 'Respuesta mock agotada')
      const body = responses.shift()
      return { ok: body.success === true, async json() { return body } }
    },
  }, drawer ? '\nexport { Drawer }\n' : '')
  const component = drawer ? module.Drawer : module.default
  let tree: any
  const render = () => { index = 0; tree = component(props); return nodes(tree) }
  render()
  const input = (predicate: (node: any) => boolean) => { const node = nodes(tree).find(predicate); assert.ok(node, 'Control UI no encontrado'); return node }
  if (!meeting) {
    input(n => n.type === 'textarea').props.onChange({ target: { value: 'Borrador conservado' } })
    if (drawer || props.type === 'CORREO' || props.type === 'TAREA') input(n => n.type === 'input' && (drawer ? n.props.value === '' : n.props.maxLength === 250)).props.onChange({ target: { value: 'Asunto conservado' } })
  } else if (!drawer) {
    input(n => n.type === 'input' && n.props.maxLength === 250).props.onChange({ target: { value: 'Reunión conservada' } })
    input(n => n.type === 'textarea').props.onChange({ target: { value: 'Borrador conservado' } })
    input(n => n.type === 'input' && n.props.type === 'number').props.onChange({ target: { value: '30' } })
    input(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: options.sync !== false } })
  } else if (options.sync === true) {
    // El cierre ahora inicia la ficha en local; estos casos eligen Outlook explícitamente.
    input(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } })
  }
  render()
  return {
    get all() { return nodes(tree) },
    get counters() { return { closed, created, pending, reloads, payloads, toasts } },
    async submit() {
      if (drawer) await input(n => n.type === 'button' && n.props.className === 'btn primary').props.onClick()
      else await input(n => n.type === 'form').props.onSubmit({ preventDefault() {} })
      render()
    },
    localMeeting() { input(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: false } }); render() },
    chooseCorporate() {
      if (drawer) input(n => n.type === 'button' && n.props.children === 'Buzón corporativo').props.onClick()
      else input(n => n.type === 'Area1M365Correo').props.onCanal(false)
      render()
    },
    updateGate(value: boolean) { outlook.envios = value; render() },
    get action() { return input(n => n.type === 'button' && (drawer ? n.props.className === 'btn primary' : n.props.type === 'submit')) },
  }
}
function assertPending(f: ReturnType<typeof ui>, draft = true) {
  assert.equal(f.counters.closed, 0); assert.equal(f.counters.created, 0); assert.equal(f.counters.reloads, 0); assert.equal(f.counters.toasts.length, 0)
  const notice = f.all.find(n => n.props?.role === 'status')
  assert.ok(notice); assert.equal(notice.props.children, MESSAGE)
  assert.ok(!notice.props.className?.includes('red-')); assert.equal(notice.props.style?.color === 'red', false)
  assert.ok(!f.all.some(n => n.props?.role === 'alert'))
  assert.equal(f.action.props.disabled, false)
  if (draft) assert.equal(f.all.find(n => n.type === 'textarea')?.props.value, 'Borrador conservado')
}
async function main() {
  await test('ausencia de puerta duplicada y aliases en app/lib/components/scripts, incluidos comentarios y pruebas', () => {
    const forbidden = [oldGate, ['envios', 'Crm', 'Habilitados'].join(''), ['ENVIOS', 'PENDIENTES'].join('_')]
    for (const file of ['app', 'lib', 'components', 'scripts'].flatMap(sources)) {
      const source = readFileSync(file, 'utf8')
      for (const name of forbidden) assert.ok(!source.includes(name), `${file} contiene ${name}`)
    }
  })
  for (const VERCEL_ENV of ['production', 'preview', 'development', undefined]) {
    for (const value of [undefined, '', '0', 'true', 'false', 'yes', '2', '1 ', ' 1', ' 1 ']) {
      await test(`status cerrado entorno=${String(VERCEL_ENV)} flag=${String(value)} aun con variables vecinas abiertas`, async () => {
        const s = await status({ VERCEL_ENV, [FLAG]: value, [oldGate]: '1', AREA1_M365_PRODUCCION: '1', OUTLOOK_USER_CALENDAR_ENABLED: 'true', M365_STAGING_CALENDARIO: '1' }, connection)
        assert.equal(s.envios, false); assert.equal(s.connected, true); assert.equal(s.mail, true)
      })
    }
    await test(`status literal1 abre sólo envios entorno=${String(VERCEL_ENV)} sin forzar integración ni permisos`, async () => {
      const s = await status({ VERCEL_ENV, [FLAG]: '1' })
      assert.equal(s.envios, true); assert.equal(s.enabled, false); assert.equal(s.connected, false); assert.equal(s.mail, false)
      assert.equal(s.m365, VERCEL_ENV !== 'production')
    })
  }
  await test('status CRM cerrado no apaga lecturas M365 existentes ni conexión', async () => {
    const s = await status({ VERCEL_ENV: 'production', AREA1_M365_PRODUCCION: '1', OUTLOOK_USER_CALENDAR_ENABLED: 'true' }, connection)
    assert.equal(s.envios, false); assert.equal(s.enabled, true); assert.equal(s.m365, true); assert.equal(s.mail, true)
  })
  await test('status producción mantiene M365 actual cerrado aunque la puerta CRM se reabra', async () => {
    const s = await status({ VERCEL_ENV: 'production', [FLAG]: '1' }, connection)
    assert.equal(s.envios, true); assert.equal(s.m365, false); assert.equal(s.mail, false)
  })
  for (const kind of ['composer-mail', 'composer-meet', 'drawer-mail', 'drawer-meet'] as const) {
    for (const response of pendingBodies) {
      await test(`${kind}: pendiente exacto sin éxito, conserva contenido y reintento habilitado ${response.code || response.codigo || 'sandbox'}`, async () => {
        const f = ui(kind, { sync: true, responses: [response, { success: true, linkedToOutlook: true, acceptedByMicrosoft: true }] })
        await f.submit(); assertPending(f, kind !== 'drawer-meet')
        assert.equal(f.counters.payloads.length, 1)
        if (kind.endsWith('meet')) assert.equal(f.counters.payloads[0].syncOutlook, true)
        f.updateGate(true); await f.submit()
        assert.equal(f.counters.payloads.length, 2); assert.equal(f.counters.closed, 1)
        if (kind.startsWith('drawer')) assert.equal(f.counters.toasts.length, 1)
        else assert.equal(f.counters.created, 1)
      })
    }
  }
  for (const kind of ['composer-mail', 'drawer-mail'] as const) {
    await test(`${kind}: cierre sin conexión es informativo y no cambia Mi Outlook por corporativo`, async () => {
      const f = ui(kind, { outlook: { connected: false, mail: false } }); await f.submit(); assertPending(f)
      assert.equal(f.counters.payloads[0].viaOutlook, true)
    })
    await test(`${kind}: corporativo también cierra informativamente`, async () => {
      const f = ui(kind); f.chooseCorporate(); await f.submit(); assertPending(f)
      assert.equal(f.counters.payloads[0].viaOutlook, false)
    })
    await test(`${kind}: una denegación auth no se disfraza de pendiente ni éxito`, async () => {
      const f = ui(kind, { outlook: { envios: true }, responses: [{ error: 'No autorizado.' }] }); await f.submit()
      assert.equal(f.counters.closed, 0); assert.equal(f.counters.created, 0)
      assert.ok(f.all.some(n => n.props?.children === 'No autorizado.'))
    })
  }
  for (const kind of ['composer-meet', 'drawer-meet'] as const) {
    await test(`${kind}: elección local explícita guarda con puerta cerrada; nunca fallback tácito`, async () => {
      const f = ui(kind, { responses: [{ success: true }] }); f.localMeeting(); await f.submit()
      assert.equal(f.counters.payloads[0].syncOutlook, false); assert.equal(f.counters.closed, 1)
      assert.ok(!f.all.some(n => n.props?.role === 'status'))
    })
  }
  await test('ficha reunión inicial local con salida CRM cerrada: sin Graph, Teams ni invitados externos', async () => {
    const f = ui('drawer-meet', { responses: [{ success: true }] })
    const boxes = f.all.filter(n => n.type === 'input' && n.props.type === 'checkbox')
    assert.equal(boxes[0].props.checked, false); assert.equal(boxes[1].props.checked, false)
    await f.submit()
    assert.equal(f.counters.payloads[0].syncOutlook, false)
    assert.equal(f.counters.payloads[0].onlineMeeting, false)
    assert.equal(f.counters.payloads[0].inviteAttendees, false)
    assert.equal(f.counters.closed, 1)
    assert.deepEqual(f.counters.toasts, ['Reunión guardada en la ficha.'])
    assert.ok(!f.all.some(n => n.props?.role === 'status'))
  })
  await test('compositor NOTA permanece operativo y sin aviso envío al cerrar CRM', async () => {
    const f = ui('composer-mail', { type: 'NOTA', responses: [{ success: true }] }); await f.submit()
    assert.equal(f.counters.payloads[0].type, 'NOTA'); assert.equal(f.counters.created, 1)
    assert.ok(!f.all.some(n => n.props?.role === 'status'))
  })
  await test('ficha sin escritura conserva botón bloqueado por ACL, no por puerta CRM', () => {
    const f = ui('drawer-mail', { canWrite: false }); assert.equal(f.action.props.disabled, true)
  })
  await test('cero red durante estado y callbacks UI reales en VM', () => assert.equal(networkCalls, 0))
  console.log(`\n${passed}/${passed} OK · estado y callbacks reales en VM; sin HTTP/auth/proveedores/BD reales`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
