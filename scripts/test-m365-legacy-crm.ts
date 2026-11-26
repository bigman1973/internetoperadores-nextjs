/** CRM · cierre M365 reversible. Ejecutar: pnpm exec tsx scripts/test-m365-legacy-crm.ts
 * Compila las fuentes reales con esbuild y las ejecuta en VM. Sin .env, Prisma real,
 * imports de auth/proveedor reales, HTTP remoto ni cambios al entorno del proceso.
 * Request/Response nativos son objetos en memoria, NO un servidor HTTP.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'

const localRequire = createRequire(import.meta.url)
const { transformSync } = createRequire(localRequire.resolve('tsx/package.json'))('esbuild')
const ROUTE = 'app/api/admin/crm/contactos/[id]/actividades/route.ts'
const COMPOSER = 'components/admin/CrmActivityComposer.tsx'
const WORKSPACE = 'components/admin/CrmContactoWorkspace.tsx'
const MESSAGE = 'Envio pendiente de activar (se hara desde Mi Outlook)'
const CODE = 'M365_LEGACY_PENDING'
const FLAG = 'M365_LEGACY_CRM_EXTERNAL_ENABLED'
const SANDBOX_MESSAGE = 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.'
const sender = 'fixture@internetoperadores.com'
let networkCalls = 0
const noFetch = () => { networkCalls++; throw new Error('RED PROHIBIDA') }
const compiled = new Map<string, string>()
function compile(file: string) {
  if (!compiled.has(file)) compiled.set(file, transformSync(readFileSync(file, 'utf8'), {
    loader: file.endsWith('.tsx') ? 'tsx' : 'ts', jsx: 'automatic', format: 'cjs', platform: 'node', target: 'es2022', sourcefile: file,
  }).code)
  return compiled.get(file)!
}
function load(file: string, dependencies: Record<string, unknown>, env: Record<string, string | undefined>, extra: Record<string, unknown> = {}) {
  const module = { exports: {} as any }
  runInNewContext(compile(file), {
    module, exports: module.exports, Request, Response, Headers, Date, URL, URLSearchParams, AbortController,
    console, process: { env }, fetch: noFetch, ...extra,
    require(id: string) {
      assert.ok(Object.hasOwn(dependencies, id), `Import no permitido en ${file}: ${id}`)
      return dependencies[id]
    },
  }, { filename: file, timeout: 5000 })
  return module.exports
}
function helpers(env: Record<string, string | undefined>) {
  return {
    policy: load('lib/m365-legacy-policy.ts', {}, env),
    area1: load('lib/area1-m365.ts', {}, env),
  }
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value))
const admin = () => ({ user: { id: '7', userType: 'admin', role: 'GERENTE', name: 'Fixture', email: sender } })
function fixture(options: any = {}) {
  const env = options.env || {}
  const { policy, area1 } = helpers(env)
  const calls = { auth: 0, permission: 0, acting: 0, connection: 0, tokens: 0, provider: 0, businessWrites: 0, reads: 0, transactions: 0, sender: 0, network: 0 }
  const writes: any[] = [], providers: any[] = [], order: string[] = []
  const connection = { enabled: true, connected: true, mail: true, ...options.connection }
  const stored = options.existing || null
  const crmActividad = {
    async findUnique() { calls.reads++; return stored },
    async findFirst() { calls.reads++; return options.duplicate ? { id: 'duplicate-fixture' } : null },
    async create({ data }: any) {
      calls.businessWrites++; writes.push({ operation: 'create', data }); order.push('reserve')
      return { id: 'activity-fixture', tipo: data.tipo, resultado: data.resultado, creadoPorId: data.creadoPorId, metadatos: data.metadatos || {}, createdAt: new Date() }
    },
    async update({ data }: any) { calls.businessWrites++; writes.push({ operation: 'update', data }); return { id: 'activity-fixture', ...data } },
    async updateMany({ data }: any) { calls.businessWrites++; writes.push({ operation: 'updateMany', data }); return { count: 1 } },
  }
  const database = {
    crmActividad,
    crmRegistroHubspot: { async findMany({ where }: any) {
      calls.reads++
      return where.id.in.map((id: string) => ({ id, nombre: 'Contacto ficticio', email: 'contacto@example.test', propiedades: {}, propiedadesLocales: {} }))
    } },
    crmNegocioHubspot: { async findMany() { calls.reads++; return options.deals || [] } },
    async $transaction(fn: any) { calls.transactions++; return fn(database) },
  }
  const POST = load(ROUTE, {
    'next-auth': { async getServerSession() { calls.auth++; order.push('auth'); return Object.hasOwn(options, 'session') ? options.session : admin() } },
    'next/server': { NextResponse: { json(data: any, init: any = {}) { return Response.json(data, init) } } },
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } },
    'node:crypto': { createHash },
    '@/lib/auth': { authOptions: {} },
    '@/lib/permisos': { async verificarPermisoServer(id: number, area: string, role: string) {
      calls.permission++; order.push('permission'); assert.equal(id, 7); assert.equal(area, 'admin.crm.contactos'); assert.equal(role, 'GERENTE')
      return { escritura: options.permission !== false }
    } },
    '@/lib/prisma': { __esModule: true, default: database },
    '@/lib/m365-legacy-policy': policy,
    '@/lib/area1-m365': { ...area1, bloqueoActuacion(session: any) { calls.acting++; order.push('acting'); return area1.bloqueoActuacion(session) } },
    '@/lib/email': {
      getDefaultEmailSender() { calls.sender++; return sender },
      async sendCrmEmail(input: any) { calls.provider++; providers.push({ type: 'corporate', input }); order.push('provider'); return options.emailResult || { success: true, status: 202, sender } },
    },
    '@/lib/outlook-user-connection': {
      async getOutlookConnectionStatus(id: number) { calls.connection++; assert.equal(id, 7); return connection },
      async getOutlookUserAccessToken(id: number, email: string, purpose?: string) {
        calls.tokens++; order.push('token'); assert.equal(id, 7); assert.equal(email, sender)
        if (options.tokenError) throw new Error('Conexión ficticia caducada')
        return { accessToken: 'FAKE_MEMORY_TOKEN', mailbox: sender, purpose }
      },
    },
    '@/lib/area1-m365-graph': { async enviarCorreoComoUsuario(input: any) {
      calls.provider++; providers.push({ type: 'delegated', input }); order.push('provider')
      return options.emailResult || { success: true, status: 202, messageId: 'fake-message', conversationId: 'fake-thread' }
    } },
    '@/lib/outlook-calendar': { async createOutlookUserCalendarEvent(input: any) {
      calls.provider++; providers.push({ type: 'calendar', input }); order.push('provider')
      return options.calendarResult || { success: true, status: 201, mailbox: sender, event: { id: 'fake-event', webLink: 'https://calendar.example.invalid/fake-event' } }
    } },
  }, env)
  return {
    calls, writes, providers, order,
    async post(body: any, requestOptions: any = {}) {
      const request = new Request('https://crm.example.invalid/api/admin/crm/contactos/contact-fixture/actividades', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...requestOptions.headers },
        body: Object.hasOwn(requestOptions, 'raw') ? requestOptions.raw : JSON.stringify(body),
      })
      const response = await POST.POST(request, { params: Promise.resolve({ id: 'contact-fixture' }) })
      return { response, data: await response.json() }
    },
  }
}
const mail = (extra: any = {}) => ({ type: 'CORREO', clientRequestId: 'memory-mail-123', title: 'Asunto ficticio', description: 'Contenido ficticio', to: ['a@example.test'], cc: ['c@example.test'], bcc: ['b@example.test'], ...extra })
const meeting = (extra: any = {}) => ({ type: 'REUNION', clientRequestId: 'memory-meet-123', title: 'Reunión ficticia', description: 'Agenda ficticia', activityDate: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 30, syncOutlook: true, inviteAttendees: true, ...extra })
function noEffects(f: ReturnType<typeof fixture>) {
  assert.equal(f.calls.provider, 0); assert.equal(f.calls.tokens, 0); assert.equal(f.calls.connection, 0)
  assert.equal(f.calls.businessWrites, 0); assert.equal(f.calls.transactions, 0); assert.equal(f.calls.reads, 0); assert.equal(f.calls.sender, 0)
}
let passed = 0
async function test(name: string, run: () => any) { await run(); passed++; console.log(`OK ${name}`) }

// React/JSX mínimos para ejecutar el submit ORIGINAL y observar callbacks/estado.
// No copia el submit, no usa source regex como prueba de cero efectos y no simula HTTP real.
function uiFixture(type = 'CORREO', responseData: any = {}, responseOk = false, sync = true) {
  const states: any[] = [], setters: any[] = []
  let index = 0, postCalls = 0, created = 0, closed = 0, pending = 0, payload: any, details: any
  const jsx = (elementType: any, props: any) => ({ type: elementType, props })
  const { area1, policy } = helpers({})
  const props = {
    open: true, type, contactId: 'contact-fixture', contactName: 'Fixture', contactEmail: 'a@example.test', contactPhone: '', contactLinkedIn: '',
    senderEmail: sender, outlookConnection: { enabled: true, connected: true, mail: true, email: sender, connectedAt: null, lastError: null }, deals: [],
    onCreated(_type: any, value: any) { created++; details = value }, onClose() { closed++ }, onPending() { pending++ },
  }
  const component = load(COMPOSER, {
    react: {
      useState(initial: any) { const current = index++; if (!(current in states)) states[current] = typeof initial === 'function' ? initial() : initial; setters[current] = (value: any) => { states[current] = typeof value === 'function' ? value(states[current]) : value }; return [states[current], setters[current]] },
      useEffect() {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@heroicons/react/24/outline': new Proxy({}, { get: (_target, name) => String(name) }),
    './Area1M365': { Area1M365Aviso: 'Area1M365Aviso', Area1M365Correo: 'Area1M365Correo' },
    '@/lib/area1-m365': area1, '@/lib/m365-legacy-policy': policy,
  }, {}, {
    crypto: { randomUUID: () => 'memory-ui-123' }, window: { open() { throw new Error('No abrir ventanas en correo/reunión') }, confirm: () => true },
    async fetch(url: string, init: any) {
      assert.equal(url, '/api/admin/crm/contactos/contact-fixture/actividades'); assert.equal(init.method, 'POST')
      postCalls++; payload = JSON.parse(init.body)
      return { ok: responseOk, async json() { return responseData } }
    },
  }).default
  const render = () => { index = 0; return component(props) }
  function all(node: any): any[] {
    if (!node) return []
    if (Array.isArray(node)) return node.flatMap(all)
    if (typeof node !== 'object') return []
    return [node, ...all(node.props?.children)]
  }
  let tree = render()
  all(tree).find((node) => node.type === 'textarea').props.onChange({ target: { value: 'Borrador conservado' } })
  all(tree).find((node) => node.type === 'input' && node.props.maxLength === 250)?.props.onChange({ target: { value: 'Asunto fixture' } })
  if (type === 'REUNION' && sync) {
    all(tree).find((node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } })
    all(tree).find((node) => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: '30' } })
  }
  tree = render()
  return {
    async submit() { await all(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); tree = render() },
    get result() { return { postCalls, created, closed, pending, payload, details, nodes: all(tree), states } },
  }
}

async function main() {
  for (const flag of [undefined, '', '0', 'true', '1 ']) {
    for (const viaOutlook of [undefined, false, true]) {
      await test(`cerrado flag=${String(flag)} viaOutlook=${String(viaOutlook)}: 503 sin reserva/token/proveedor`, async () => {
        const f = fixture({ env: { [FLAG]: flag, VERCEL_ENV: 'production', AREA1_M365_PRODUCCION: '1' } })
        const body = mail(); if (viaOutlook !== undefined) body.viaOutlook = viaOutlook
        const { response, data } = await f.post(body)
        assert.equal(response.status, 503); assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
        assert.deepEqual(data, { error: MESSAGE, message: MESSAGE, code: CODE, codigo: CODE, success: false }); noEffects(f)
        assert.deepEqual(f.order, ['auth', 'permission', 'acting'])
      })
    }
    await test(`cerrado flag=${String(flag)} syncOutlook con M365_STAGING_CALENDARIO=1`, async () => {
      const f = fixture({ env: { [FLAG]: flag, VERCEL_ENV: 'preview', M365_STAGING_CALENDARIO: '1' } })
      const { response, data } = await f.post(meeting()); assert.equal(response.status, 503); assert.equal(data.code, CODE); noEffects(f)
    })
  }
  for (const [name, body, opts, status] of [
    ['sin sesión', mail(), { session: null }, 401],
    ['usuario no admin', mail(), { session: { user: { ...admin().user, userType: 'cliente' } } }, 401],
    ['sin id', mail(), { session: { user: { ...admin().user, id: '' } } }, 401],
    ['sin escritura', mail(), { permission: false }, 403],
    ['acting correo', mail({ viaOutlook: true }), { session: { ...admin(), impersonation: { actorId: 4 } } }, 403],
    ['acting reunión', meeting(), { session: { ...admin(), impersonation: { actorId: 4 } }, env: { M365_STAGING_CALENDARIO: '1' } }, 403],
  ] as const) {
    await test(`auth/ACL conservada: ${name}`, async () => { const f = fixture(opts); const r = await f.post(body); assert.equal(r.response.status, status); assert.notEqual(r.data.code, CODE); noEffects(f) })
  }
  for (const [name, body, options] of [
    ['sin descripción', mail({ description: '' }), {}], ['tipo inválido', mail({ type: 'DESCONOCIDO' }), {}],
    ['id inválido', mail({ clientRequestId: 'x' }), {}], ['sin asunto', mail({ title: '' }), {}], ['sin para', mail({ to: [] }), {}],
    ['to inválido', mail({ to: ['invalido'] }), {}], ['cc inválido', mail({ cc: ['invalido'] }), {}], ['bcc inválido', mail({ bcc: ['invalido'] }), {}],
    ['fecha inválida', mail({ activityDate: 'nunca' }), {}], ['duración inválida', mail({ durationMinutes: -1 }), {}],
    ['followUp inválido', mail({ followUp: { dueAt: 'nunca' } }), {}], ['JSON inválido', null, { raw: '{' }], ['array', [], {}],
  ] as const) {
    await test(`validación antes del cierre: ${name}`, async () => { const f = fixture(); const r = await f.post(body, options); assert.equal(r.response.status, 400); noEffects(f) })
  }
  await test('límite de tamaño preservado', async () => { const f = fixture(); assert.equal((await f.post(mail(), { headers: { 'content-length': '150001' } })).response.status, 413); noEffects(f) })
  for (const bad of [{ title: '' }, { durationMinutes: 2 }, { activityDate: new Date(Date.now() - 86400000).toISOString() }]) {
    await test(`reunión externa inválida ${JSON.stringify(bad)} sin leer Outlook`, async () => { const f = fixture({ env: { M365_STAGING_CALENDARIO: '1' } }); assert.equal((await f.post(meeting(bad))).response.status, 400); noEffects(f) })
  }
  for (const body of [
    { type: 'NOTA' }, { type: 'LLAMADA', direction: 'SALIENTE', result: 'CONTACTADO' },
    { type: 'TAREA', title: 'Seguimiento', followUp: { dueAt: new Date(Date.now() + 86400000).toISOString() } },
    { type: 'REUNION', syncOutlook: false }, { type: 'REUNION' },
  ]) {
    await test(`local ${body.type} sync=${String((body as any).syncOutlook)} sigue guardando cerrado`, async () => {
      const f = fixture(); const r = await f.post({ clientRequestId: 'memory-local-123', description: 'Actividad interna ficticia', ...body })
      assert.equal(r.response.status, 200); assert.equal(r.data.success, true); assert.equal(f.calls.businessWrites, 1)
      assert.equal(f.calls.provider, 0); assert.equal(f.calls.tokens, 0); assert.equal(f.calls.connection, 0)
    })
  }
  await test('cierre de ruta prevalece sobre Opción C: pedir Outlook no reserva reunión local como éxito', async () => {
    const f = fixture({ env: { VERCEL_ENV: 'preview' } }); const r = await f.post(meeting())
    assert.equal(r.response.status, 503); assert.equal(r.data.success, false); noEffects(f)
  })
  await test('ruta abierta1 conserva Opción C sin flag calendario: local y sin falso vínculo', async () => {
    const f = fixture({ env: { [FLAG]: '1', VERCEL_ENV: 'preview' } }); const r = await f.post(meeting())
    assert.equal(r.data.success, true); assert.equal(r.data.linkedToOutlook, undefined); assert.equal(f.writes[0].data.resultado, 'CALENDARIO_NO_CREADO_AISLADO')
    assert.equal(f.calls.businessWrites, 1); assert.equal(f.calls.provider, 0); assert.equal(f.calls.tokens, 0); assert.equal(f.calls.connection, 0)
  })
  for (const viaOutlook of [undefined, false, true]) {
    await test(`flag1 reabre correo viaOutlook=${String(viaOutlook)} con destinatarios originales to/cc/bcc`, async () => {
      const f = fixture({ env: { [FLAG]: '1', VERCEL_ENV: 'production', AREA1_M365_PRODUCCION: '1' } })
      const body = mail({ viaOutlook, to: 'A@EXAMPLE.TEST; a@example.test', cc: 'C@example.test', bcc: ['B@example.test'] })
      const r = await f.post(body)
      assert.equal(r.response.status, 200); assert.equal(r.data.success, true); assert.equal(r.data.acceptedByMicrosoft, true)
      assert.equal(f.calls.provider, 1); assert.equal(f.calls.businessWrites, 2); assert.equal(f.calls.tokens, viaOutlook ? 1 : 0)
      assert.equal(f.providers[0].type, viaOutlook ? 'delegated' : 'corporate')
      assert.deepEqual(json(f.providers[0].input.to), ['a@example.test']); assert.deepEqual(json(f.providers[0].input.cc), ['c@example.test']); assert.deepEqual(json(f.providers[0].input.bcc), ['b@example.test'])
      assert.equal(f.writes[0].data.resultado, 'ENVIO_PENDIENTE'); assert.equal(f.writes[1].data.resultado, 'ACEPTADO_GRAPH')
      assert.ok(f.order.indexOf('reserve') < f.order.indexOf('provider'))
    })
  }
  await test('flag1 reunión recorre reserva, token, creación y confirmación anteriores', async () => {
    const f = fixture({ env: { [FLAG]: '1', VERCEL_ENV: 'preview', M365_STAGING_CALENDARIO: '1', M365_STAGING_TEST_EMAIL: 'prueba@internetoperadores.com' } })
    const r = await f.post(meeting({ onlineMeeting: true })); assert.equal(r.data.linkedToOutlook, true)
    assert.equal(f.calls.provider, 1); assert.equal(f.calls.tokens, 1); assert.equal(f.calls.businessWrites, 2)
    assert.equal(f.writes[0].data.resultado, 'CALENDARIO_PENDIENTE'); assert.equal(f.writes[1].data.resultado, 'CALENDARIO_CREADO')
    assert.deepEqual(json(f.providers[0].input.attendees), [{ email: 'prueba@internetoperadores.com', name: 'Prueba staging' }])
  })
  await test('flag1 conserva aislamiento del correo sin buzón de prueba', async () => {
    const f = fixture({ env: { [FLAG]: '1', VERCEL_ENV: 'preview' } }); const r = await f.post(mail({ viaOutlook: false }))
    assert.equal(r.data.sent, false); assert.equal(f.calls.provider, 0); assert.equal(f.writes[1].data.resultado, 'NO_ENVIADO_AISLADO')
  })
  for (const [name, body, opts, status] of [
    ['sin permiso', mail(), { permission: false }, 403],
    ['acting', mail(), { session: { ...admin(), impersonation: { actorId: 4 } } }, 403],
    ['Outlook desactivado producción', mail({ viaOutlook: true }), {}, 409],
    ['correo sin conexión', mail({ viaOutlook: true }), { connection: { connected: false } }, 428],
    ['correo sin scope', mail({ viaOutlook: true }), { connection: { mail: false } }, 428],
    ['reunión sin conexión', meeting(), { connection: { connected: false } }, 428],
    ['token caducado', mail({ viaOutlook: true }), { tokenError: true }, 401],
  ] as const) {
    await test(`flag1 no salta guardas: ${name}`, async () => {
      const f = fixture({ ...opts, env: { [FLAG]: '1', VERCEL_ENV: 'production', ...(name !== 'Outlook desactivado producción' ? { AREA1_M365_PRODUCCION: '1' } : {}) } })
      assert.equal((await f.post(body)).response.status, status); assert.equal(f.calls.provider, 0); assert.equal(f.calls.businessWrites, 0)
    })
  }
  await test('flag1 conserva propiedad de clientRequestId existente', async () => {
    const f = fixture({ env: { [FLAG]: '1', VERCEL_ENV: 'production' }, existing: { creadoPorId: 8 } })
    assert.equal((await f.post(mail())).response.status, 409); assert.equal(f.calls.businessWrites, 0); assert.equal(f.calls.provider, 0)
  })
  await test('flag1 conserva idempotencia de correo completado', async () => {
    const f = fixture({ env: { [FLAG]: '1', VERCEL_ENV: 'production' }, existing: { id: 'done', tipo: 'CORREO', resultado: 'ACEPTADO_GRAPH', creadoPorId: 7, createdAt: new Date(), metadatos: {} } })
    const r = await f.post(mail()); assert.equal(r.data.unchanged, true); assert.equal(f.calls.businessWrites, 0); assert.equal(f.calls.provider, 0)
  })
  const pendingBodies = [
    { code: CODE, error: MESSAGE, success: false }, { codigo: CODE, message: MESSAGE, success: false },
    { codigo: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', error: 'Cierre global' }, { code: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', error: 'Cierre global' },
    { error: SANDBOX_MESSAGE },
  ]
  for (const type of ['CORREO', 'REUNION']) {
    for (const data of pendingBodies) {
      await test(`UI ${type} informa sin éxito/cierre/registro para ${data.code || data.codigo || 'sandbox'}`, async () => {
        const f = uiFixture(type, data); await f.submit(); const r = f.result
        assert.equal(r.postCalls, 1); assert.equal(r.created, 0); assert.equal(r.closed, 0); assert.equal(r.pending, 1)
        assert.ok(r.nodes.some(node => node.props?.role === 'status' && node.props.children === MESSAGE && !node.props.className.includes('red-')))
        assert.ok(!r.nodes.some(node => node.props?.role === 'alert'))
        assert.equal(r.nodes.find(node => node.type === 'textarea').props.value, 'Borrador conservado')
        assert.equal(r.nodes.find(node => node.type === 'button' && node.props.type === 'submit').props.disabled, false)
      })
    }
  }
  await test('UI no oculta denegaciones auth como aviso pendiente', async () => {
    const f = uiFixture('CORREO', { error: 'No autorizado.' }); await f.submit(); const r = f.result
    assert.equal(r.pending, 0); assert.equal(r.created, 0); assert.ok(r.nodes.some(node => node.props?.role === 'alert' && node.props.children === 'No autorizado.'))
  })
  for (const type of ['NOTA', 'REUNION', 'WHATSAPP']) {
    await test(`UI local ${type} no convierte bloqueo sandbox en aviso de envío`, async () => {
      const f = uiFixture(type, { error: SANDBOX_MESSAGE }, false, false); await f.submit(); const r = f.result
      assert.equal(r.pending, 0); assert.equal(r.created, 0); assert.equal(r.closed, 0)
      assert.ok(r.nodes.some(node => node.props?.role === 'alert' && node.props.children === SANDBOX_MESSAGE))
    })
  }
  for (const [type, data, outlook, sent] of [
    ['CORREO', { success: true, acceptedByMicrosoft: true }, false, true],
    ['CORREO', { success: true, sent: false }, false, false],
    ['REUNION', { success: true, linkedToOutlook: true }, true, undefined],
    ['REUNION', { success: true }, false, undefined],
  ] as const) {
    await test(`UI normal al reabrir ${type}: ${JSON.stringify(data)}`, async () => {
      const f = uiFixture(type, data, true); await f.submit(); const r = f.result
      assert.equal(r.created, 1); assert.equal(r.closed, 1); assert.equal(r.pending, 0); assert.equal(r.details.outlook, outlook); assert.equal(r.details.sent, sent)
    })
  }
  await test('workspace aviso pendiente no refresca ni anuncia registro; usa estilo informativo', () => {
    const source = readFileSync(WORKSPACE, 'utf8')
    // Comprobación estática complementaria explícita: no representa un render HTTP.
    const handler = source.slice(source.indexOf('const handleActivityPending'), source.indexOf('const handleActivityCreated'))
    assert.ok(handler.includes("type: 'info'")); assert.ok(handler.includes('M365_LEGACY_PENDING_MESSAGE'))
    assert.ok(!/router\.refresh|setActiveTab|success|registrad|enviado/.test(handler))
    assert.ok(source.includes('onPending={handleActivityPending}')); assert.ok(source.includes("quickMessage.type === 'info' ? 'border-blue-200 bg-blue-50 text-blue-900'"))
    assert.ok(source.includes("details?.sent === false ? 'Correo no enviado"))
    compile(WORKSPACE)
  })
  await test('sin red en toda la batería', () => assert.equal(networkCalls, 0))
  console.log(`\n${passed}/${passed} OK · handler y submit reales en VM; proveedor/BD sólo mocks; cero red`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
