/**
 * Ejecutar: pnpm exec tsx scripts/test-m365-legacy-mantenimiento.ts
 * Sólo fuentes reales compiladas en memoria (esbuild/VM), APIs locales dobles
 * y Request/Response. No carga .env, Prisma, auth real ni proveedor real.
 * El fetch del handler siempre lanza; el de UI sólo despacha al doble local.
 * No acredita HTTP/proxy/Graph reales ni prueba las otras rutas delegadas.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { NextResponse } from 'next/server'

const localRequire = createRequire(import.meta.url)
const esbuild = createRequire(localRequire.resolve('tsx/package.json'))('esbuild') as {
  transformSync(source: string, options: Record<string, unknown>): { code: string }
}
const routePath = 'app/api/admin/leads-mantenimiento/[id]/enviar-email/route.ts'
const uiPath = 'app/admin/leads-mantenimiento/[id]/page.tsx'
const policyPath = 'lib/m365-legacy-policy.ts'
const flag = 'M365_LEGACY_MANTENIMIENTO_EMAIL_ENABLED'
const message = 'Envio pendiente de activar (se hara desde Mi Outlook)'
const validBody = { asunto: 'Propuesta ficticia', cuerpoHtml: '<p>Prueba local</p>' }
const fixtureSession = { user: { email: 'admin@example.invalid' } }
const uiSource = readFileSync(resolve(uiPath), 'utf8')

type Counters = { auth: number; reads: number; writes: number; provider: number; fetch: number; json: number }
type HarnessOptions = {
  flag?: string
  env?: Record<string, string | undefined>
  session?: unknown
  missingLead?: boolean
  readError?: boolean
  providerResult?: { success: boolean; error?: string }
  providerError?: boolean
  offer?: boolean
  estado?: string
}
function compile(source: string, filename: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const module = { exports: {} as any }
  const { code } = esbuild.transformSync(source, {
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    format: 'cjs', platform: 'node', target: 'es2022', jsx: 'automatic', sourcefile: filename,
  })
  runInNewContext(code, {
    module, exports: module.exports, Buffer, Request, Response, Headers, URL,
    console: { error: () => {} },
    fetch: () => { throw new Error('RED_PROHIBIDA') },
    require: (id: string) => {
      assert.ok(Object.hasOwn(mocks, id), `Import real no permitido: ${id}`)
      return mocks[id]
    },
    ...globals,
  }, { filename })
  return module.exports
}
function harness(options: HarnessOptions = {}) {
  // Entorno exclusivamente ficticio dentro de VM; no lee/modifica process.env real.
  const env: Record<string, string | undefined> = { ...options.env, [flag]: options.flag }
  const processMock = { env }
  const policy = compile(readFileSync(resolve(policyPath), 'utf8'), policyPath, {}, { process: processMock })
  const counters: Counters = { auth: 0, reads: 0, writes: 0, provider: 0, fetch: 0, json: 0 }
  const lead = {
    id: 'lead-local', email: 'destinatario@example.invalid', empresa: 'Empresa Ficticia',
    nombre: 'Persona Ficticia', tipo: 'MANTENIMIENTO_IT', crmContactoId: null,
    estado: options.estado || 'NUEVO', prioridad: 'MEDIA',
    createdAt: '2026-11-26T10:00:00Z', updatedAt: '2026-11-26T10:00:00Z',
    datos: { historialEmails: [{ asunto: 'Anterior' }], ...(options.offer ? { ofertaGenerada: { tipo: 'PROPUESTA_MEDIDA' } } : {}) },
  }
  const sent: any[] = [], updates: any[] = []
  const dependencies = {
    'next/server': { NextResponse },
    'next-auth': { getServerSession: async (_authOptions: unknown) => {
      counters.auth++
      return Object.hasOwn(options, 'session') ? options.session : fixtureSession
    } },
    '@/lib/auth': { authOptions: { localMock: true } },
    '@/lib/prisma': { prisma: { leadSolucion: {
      findUnique: async (args: any) => {
        counters.reads++
        assert.equal(args.where.id, lead.id)
        if (options.readError) throw new Error('LECTURA_SIMULADA_FALLIDA')
        return options.missingLead ? null : lead
      },
      update: async (args: any) => { counters.writes++; updates.push(args); return { ...lead, ...args.data } },
    } } },
    '@/lib/email': { sendEmail: async (args: any) => {
      counters.provider++
      sent.push(args)
      if (options.providerError) throw new Error('PROVEEDOR_SIMULADO_FALLIDO')
      return options.providerResult || { success: true }
    } },
    '@/lib/m365-legacy-policy': policy,
  }
  const route = compile(readFileSync(resolve(routePath), 'utf8'), routePath, dependencies, {
    process: processMock,
    fetch: () => { counters.fetch++; throw new Error('RED_PROHIBIDA') },
  })
  const post = async (body: unknown = validBody, malformed = false) => {
    const request = new Request('https://local.example.invalid/api/admin/leads-mantenimiento/lead-local/enviar-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: malformed ? '{' : JSON.stringify(body),
    })
    const json = request.json.bind(request)
    request.json = async () => { counters.json++; return json() }
    return route.POST(request, { params: Promise.resolve({ id: lead.id }) }) as Promise<Response>
  }
  return { post, counters, lead, sent, updates, policy }
}
let passed = 0
let closedProvider = 0, closedWrites = 0
async function test(name: string, run: () => unknown | Promise<unknown>) {
  await run()
  passed++
  console.log(`OK ${passed}: ${name}`)
}
function noEffects(h: ReturnType<typeof harness>) {
  assert.equal(h.counters.provider, 0)
  assert.equal(h.counters.writes, 0)
  assert.equal(h.counters.fetch, 0)
  assert.equal(h.sent.length, 0)
  assert.equal(h.updates.length, 0)
  closedProvider += h.counters.provider
  closedWrites += h.counters.writes
}

// Árbol JSX y hooks en memoria: ejecuta la página y sus onClick reales, sin DOM,
// timers reales ni useEffect. No se extrae/reimplementa handleEnviarEmail.
type Node = { type: unknown; props: Record<string, any> }
function descendants(node: any): Node[] {
  if (Array.isArray(node)) return node.flatMap(descendants)
  if (!node || typeof node !== 'object' || !node.props) return []
  return [node, ...descendants(node.props.children)]
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join('')
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return node?.props ? text(node.props.children) : ''
}
function uiHarness(reply: () => Promise<Response>) {
  const h = harness({ offer: true })
  const state: any[] = []
  let cursor = 0, requests = 0, timers = 0
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props })
  const page = compile(uiSource, uiPath, {
    react: {
      useEffect: () => {},
      useState: (initial: any) => {
        const index = cursor++
        if (!(index in state)) state[index] = initial
        return [state[index], (value: any) => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/navigation': { useParams: () => ({ id: 'lead-local' }), useRouter: () => ({}) },
    'next/link': { __esModule: true, default: 'link' },
    '@/components/crm/LeadCrmLink': { __esModule: true, default: 'lead-crm-link' },
    '@/lib/m365-legacy-policy': h.policy,
  }, {
    window: { location: { origin: 'https://local.example.invalid' } },
    fetch: async (url: unknown, options: any) => {
      // Sólo la API local de envío es simulada; cualquier otra solicitud lanza.
      assert.equal(url, '/api/admin/leads-mantenimiento/lead-local/enviar-email')
      assert.equal(options.method, 'POST')
      assert.equal(JSON.parse(options.body).asunto, 'Propuesta Servicios Mantenimiento IT - Empresa Ficticia')
      requests++
      return reply()
    },
    setTimeout: () => { timers++; return 0 },
  })
  const render = () => { cursor = 0; return page.default() }
  render() // Inicializar los hooks reales; no ejecuta fetchLead ni fetchCuestionario.
  assert.equal(state.length, 19, 'Si cambian los hooks, revisar este doble explícito')
  assert.equal(state[1], true)
  assert.equal(state[11], false)
  assert.equal(state[18], '')
  state[0] = h.lead; state[1] = false; state[3] = h.lead.datos.ofertaGenerada
  state[5] = h.lead.estado; state[6] = h.lead.prioridad
  const prepare = descendants(render()).find(n => n.type === 'button' && text(n).includes('② Enviar propuesta por email'))
  assert.ok(prepare)
  prepare.props.onClick()
  const click = async () => {
    const button = descendants(render()).find(n => n.type === 'button' && text(n) === ' Enviar email')
    assert.ok(button, 'Botón real de envío disponible, no inhabilitado permanentemente')
    assert.equal(button.props.disabled, false)
    await button.props.onClick()
  }
  return { state, render, click, lead: h.lead, get requests() { return requests }, get timers() { return timers } }
}
function assertInformative(ui: ReturnType<typeof uiHarness>, before: string) {
  assert.equal(ui.requests, 1)
  assert.equal(ui.state[8], '', 'No mensaje de error/éxito')
  assert.equal(ui.state[11], true, 'Se conserva modal/borrador')
  assert.equal(ui.state[17], false, 'finally libera el botón')
  assert.equal(ui.state[18], message)
  assert.equal(ui.timers, 0, 'No temporizador de éxito')
  assert.equal(JSON.stringify(ui.lead), before, 'No estado/fechas/registro optimistas')
  const nodes = descendants(ui.render()).filter(n => n.props.role === 'status' && text(n) === message)
  assert.equal(nodes.length, 2, 'Aviso visible en página y en modal')
  for (const node of nodes) {
    assert.ok(node.props.className.includes('bg-blue-50'))
    assert.ok(!/red-|green-/.test(node.props.className), 'Informativo, no error ni éxito')
  }
  const send = descendants(ui.render()).find(n => n.type === 'button' && text(n) === ' Enviar email')
  assert.equal(send?.props.disabled, false, 'El cierre no inhabilita una reapertura futura')
}

async function main() {
  for (const value of [undefined, '0', 'true', '', 'false', ' 1', '1 '] as const) {
    await test(`cerrado (${String(value)}): 503 exacto, no-store y cero efectos`, async () => {
      const h = harness({ flag: value, offer: true })
      const before = JSON.stringify(h.lead)
      const response = await h.post()
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
      assert.deepEqual(await response.json(), {
        error: message, message, code: 'M365_LEGACY_PENDING', codigo: 'M365_LEGACY_PENDING', success: false,
      })
      assert.equal(h.counters.auth, 1)
      assert.equal(h.counters.json, 1)
      assert.equal(h.counters.reads, 1)
      assert.equal(JSON.stringify(h.lead), before, 'Sin cambios ni historialEmails.push')
      noEffects(h)
    })
  }
  await test('otros interruptores/calendario=1 no reabren mantenimiento', async () => {
    const h = harness({ offer: true, env: {
      M365_LEGACY_LEADS_EMAIL_ENABLED: '1', M365_LEGACY_ALTAS_CONTRATO_ENABLED: '1',
      M365_LEGACY_CRM_EXTERNAL_ENABLED: '1', M365_LEGACY_MAGIC_LINK_ENABLED: '1', M365_STAGING_CALENDARIO: '1',
    } })
    assert.equal((await h.post()).status, 503)
    noEffects(h)
  })
  for (const value of [undefined, '0', 'true', '1'] as const) {
    await test(`auth denegada (${String(value)}): 401 antes de body/lecturas/cierre`, async () => {
      const h = harness({ flag: value, session: null, offer: true })
      const response = await h.post({}, true)
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'No autorizado' })
      assert.equal(h.counters.json, 0)
      assert.equal(h.counters.reads, 0)
      noEffects(h)
    })
    await test(`validación (${String(value)}): 400 conservado`, async () => {
      for (const body of [{}, { asunto: 'Asunto' }, { cuerpoHtml: '<p>Contenido</p>' }]) {
        const h = harness({ flag: value })
        const response = await h.post(body)
        assert.equal(response.status, 400)
        assert.deepEqual(await response.json(), { error: 'Asunto y cuerpo son requeridos' })
        assert.equal(h.counters.reads, 0)
        noEffects(h)
      }
    })
    await test(`lead ausente (${String(value)}): 404 conservado`, async () => {
      const h = harness({ flag: value, missingLead: true })
      const response = await h.post()
      assert.equal(response.status, 404)
      assert.deepEqual(await response.json(), { error: 'Lead no encontrado' })
      noEffects(h)
    })
  }
  await test('JSON inválido conserva 500 y no reserva/envía/escribe', async () => {
    const h = harness()
    assert.equal((await h.post({}, true)).status, 500)
    assert.equal(h.counters.reads, 0)
    noEffects(h)
  })
  await test('error de lectura conserva 500 y cero efectos', async () => {
    const h = harness({ readError: true })
    assert.equal((await h.post()).status, 500)
    noEffects(h)
  })
  for (const estado of ['NUEVO', 'EN_PROCESO', 'PRESUPUESTO_ENVIADO']) {
    await test(`literal1: lógica anterior completa simulada (${estado})`, async () => {
      const h = harness({ flag: '1', estado })
      const response = await h.post()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { success: true, message: 'Email enviado correctamente' })
      assert.equal(h.counters.provider, 1)
      assert.equal(h.counters.writes, 1)
      assert.equal(h.counters.fetch, 0)
      assert.deepEqual(JSON.parse(JSON.stringify(h.sent[0])), {
        to: h.lead.email, subject: validBody.asunto, html: validBody.cuerpoHtml,
        bcc: ['comercial@internetoperadores.com', 'david.perez@internetoperadores.com'],
      })
      const update = h.updates[0]
      assert.equal(update.where.id, h.lead.id)
      assert.equal(update.data.estado, estado === 'NUEVO' ? 'EN_PROCESO' : estado)
      assert.ok(update.data.fechaEmailEnviado)
      assert.ok(update.data.fechaCuestionarioEnviado)
      assert.ok(update.data.datos.ultimoEmailEnviado)
      assert.equal(update.data.datos.historialEmails.length, 2)
      assert.equal(update.data.datos.historialEmails[0].asunto, 'Anterior')
      assert.equal(update.data.datos.historialEmails[1].enviadoPor, fixtureSession.user.email)
      assert.equal(update.data.datos.historialEmails[1].tipo, 'PROPUESTA_CUESTIONARIO')
    })
  }
  await test('literal1: fallback de remitente histórico conservado', async () => {
    const h = harness({ flag: '1', session: { user: {} } })
    assert.equal((await h.post()).status, 200)
    assert.equal(h.updates[0].data.datos.historialEmails[1].enviadoPor, 'admin')
  })
  for (const providerResult of [{ success: false, error: 'Fallo simulado' }, { success: false }]) {
    await test(`literal1: fallo proveedor no marca enviado (${providerResult.error || 'fallback'})`, async () => {
      const h = harness({ flag: '1', providerResult })
      const before = JSON.stringify(h.lead)
      const response = await h.post()
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), { success: false, error: providerResult.error || 'Error al enviar email' })
      assert.equal(h.counters.provider, 1)
      assert.equal(h.counters.writes, 0)
      assert.equal(JSON.stringify(h.lead), before)
    })
  }
  await test('literal1: excepción proveedor conserva 500 sin marcas', async () => {
    const h = harness({ flag: '1', providerError: true })
    assert.equal((await h.post()).status, 500)
    assert.equal(h.counters.provider, 1)
    assert.equal(h.counters.writes, 0)
  })
  await test('literal1: rama PDF intenta fetch prohibido y no llega a proveedor/escritura', async () => {
    const h = harness({ flag: '1', offer: true })
    assert.equal((await h.post()).status, 500)
    assert.equal(h.counters.fetch, 1, 'Ejecuta la rama anterior; la trampa lanza sin red')
    assert.equal(h.counters.provider, 0)
    assert.equal(h.counters.writes, 0)
  })
  await test('UI real + handler cerrado real: aviso exacto sin falso éxito', async () => {
    const h = harness({ offer: true })
    const ui = uiHarness(() => h.post())
    const before = JSON.stringify(ui.lead)
    await ui.click()
    assertInformative(ui, before)
    noEffects(h)
  })
  const blockReplies = [
    { status: 503, data: { codigo: 'M365_LEGACY_PENDING', success: true } },
    { status: 503, data: { code: 'M365_LEGACY_PENDING' } },
    { status: 403, data: { codigo: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', error: 'Bloqueo global' } },
    { status: 403, data: { code: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', success: true } },
    { status: 403, data: { error: 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.' } },
  ]
  for (const [index, block] of blockReplies.entries()) {
    await test(`UI bloqueo conocido ${index + 1}: informativo y borrador conservado`, async () => {
      const ui = uiHarness(async () => NextResponse.json(block.data, { status: block.status }))
      const before = JSON.stringify(ui.lead)
      await ui.click()
      assertInformative(ui, before)
    })
  }
  for (const data of [{ error: 'No autorizado' }, { codigo: 'EASY_ONLY_ACCESS', error: 'Sin acceso' }, { error: 'Fallo ordinario' }, { codigo: 'FINANCE_DEPLOYMENT_READ_ONLY', error: 'Solo lectura' }]) {
    await test(`UI denegación/error no enmascarado: ${data.error}`, async () => {
      const ui = uiHarness(async () => NextResponse.json(data, { status: 403 }))
      await ui.click()
      assert.equal(ui.state[8], `Error: ${data.error}`)
      assert.equal(ui.state[18], '')
      assert.equal(ui.state[11], true)
      assert.equal(ui.state[17], false)
      assert.equal(ui.timers, 0)
    })
  }
  await test('UI error de transporte libera botón sin éxito', async () => {
    const ui = uiHarness(async () => { throw new Error('RED_PROHIBIDA') })
    await ui.click()
    assert.equal(ui.state[8], 'Error de conexión al enviar email')
    assert.equal(ui.state[18], '')
    assert.equal(ui.state[11], true)
    assert.equal(ui.state[17], false)
    assert.equal(ui.timers, 0)
  })
  await test('UI literal1 + handler real: éxito anterior permitido', async () => {
    const h = harness({ flag: '1' })
    const ui = uiHarness(() => h.post())
    await ui.click()
    assert.equal(ui.state[8], 'Email enviado correctamente')
    assert.equal(ui.state[11], false)
    assert.equal(ui.state[17], false)
    assert.equal(ui.state[18], '')
    assert.equal(ui.timers, 1)
    assert.equal(h.counters.provider, 1)
    assert.equal(h.counters.writes, 1)
  })
  await test('UI reintento tras cierre y reapertura literal1 no queda inhabilitado', async () => {
    const closed = harness()
    const opened = harness({ flag: '1' })
    let reopened = false
    const ui = uiHarness(() => reopened ? opened.post() : closed.post())
    await ui.click()
    assertInformative(ui, JSON.stringify(ui.lead))
    noEffects(closed)
    reopened = true
    await ui.click()
    assert.equal(ui.requests, 2)
    assert.equal(ui.state[8], 'Email enviado correctamente')
    assert.equal(ui.state[11], false)
    assert.equal(ui.state[17], false)
    assert.equal(ui.state[18], '', 'No arrastra aviso del cierre anterior')
    assert.equal(ui.timers, 1)
    assert.equal(opened.counters.provider, 1)
    assert.equal(opened.counters.writes, 1)
  })
  await test('UI respuesta no-ok con success:true no muestra éxito', async () => {
    const ui = uiHarness(async () => NextResponse.json({ success: true }, { status: 503 }))
    await ui.click()
    assert.equal(ui.state[8], 'Error: No se pudo enviar')
    assert.equal(ui.state[11], true)
    assert.equal(ui.timers, 0)
  })
  console.log(JSON.stringify({ testsPassed: passed, authPreserved: true, providerCallsWhenClosed: closedProvider, businessWritesWhenClosed: closedWrites, networkRequests: 0 }))
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
