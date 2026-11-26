/**
 * Ejecutar: pnpm exec tsx scripts/test-m365-legacy-altas.ts
 * Handler, helper y pantalla reales compilados con esbuild y ejecutados en VM.
 * Imports locales de auth/Prisma/email sustituidos por APIs con firmas reales.
 * Sin .env, Prisma real, proveedores ni HTTP real. fetch del handler siempre lanza;
 * la UI usa un transporte de prueba en memoria para invocar su onClick real.
 * No se ejecuta proxy: ACL/acting centrales siguen siendo responsabilidad de éste.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Script, createContext } from 'node:vm'

const root = new URL('../', import.meta.url)
const routeFile = 'app/api/altas/[id]/enviar-contrato/route.ts'
const uiFile = 'app/admin/altas-pendientes/[id]/page.tsx'
const policyFile = 'lib/m365-legacy-policy.ts'
const accessFile = 'lib/altas/contrato-access.ts'
const localRequire = createRequire(import.meta.url)
const tsxRequire = createRequire(localRequire.resolve('tsx/package.json'))
const { transformSync } = tsxRequire('esbuild') as {
  transformSync: (source: string, options: Record<string, unknown>) => { code: string }
}
const sources = new Map([routeFile, uiFile, policyFile, accessFile].map(file => [file, readFileSync(new URL(file, root), 'utf8')]))
const compiled = new Map([...sources].map(([file, source]) => [file, transformSync(source, {
  loader: file.endsWith('.tsx') ? 'tsx' : 'ts', jsx: 'automatic', format: 'cjs', platform: 'node',
  sourcefile: fileURLToPath(new URL(file, root)),
}).code]))
const MESSAGE = 'Envio pendiente de activar (se hara desde Mi Outlook)'
const PENDING = { error: MESSAGE, message: MESSAGE, code: 'M365_LEGACY_PENDING', codigo: 'M365_LEGACY_PENDING', success: false }
const FLAG = 'M365_LEGACY_ALTAS_CONTRATO_ENABLED'
const SANDBOX = 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.'
const clone = (value: unknown): any => JSON.parse(JSON.stringify(value))
const altaFixture = {
  id: 'alta-ficticia', token: 'token-ficticio', email: 'cliente@example.invalid',
  tipoCliente: 'PARTICULAR', nombre: 'Nombre', apellidos: 'Ficticio', tarifaNombre: 'Servicio ficticio',
  estado: 'EN_REVISION', contratoFirmado: false, documentos: [], enviosContrato: [],
  importeCuota: 15, metodoPago: 'SEPA_DOMICILIACION', createdAt: '2026-11-26T12:00:00Z', updatedAt: '2026-11-26T12:00:00Z',
}

type Env = Record<string, string | undefined>
type Call = { kind: string; input?: any }
function evaluate(file: string, env: Env, mocks: Record<string, any>, globals: Record<string, unknown> = {}) {
  const memoryModule = { exports: {} as Record<string, any> }
  const context = createContext({
    module: memoryModule, exports: memoryModule.exports, process: { env: { ...env } },
    URL, URLSearchParams, Request, Response, Headers, Buffer,
    console: { error() {}, warn() {}, log() {} },
    fetch: () => { throw new Error('Red no permitida') },
    require: (id: string) => {
      assert.ok(Object.prototype.hasOwnProperty.call(mocks, id), `${file}: import prohibido ${id}`)
      return mocks[id]
    },
    ...globals,
  })
  new Script(compiled.get(file)!, { filename: `${file}:isolated-test` }).runInContext(context)
  return memoryModule.exports
}

function handlerHarness(options: {
  flag?: string; session?: any; alta?: any; sendResult?: any; sendThrows?: boolean; readThrows?: boolean; updateThrows?: boolean; env?: Env
} = {}) {
  const env: Env = { [FLAG]: options.flag, ...options.env }
  const calls: Call[] = []
  let networkCalls = 0
  const session = Object.prototype.hasOwnProperty.call(options, 'session') ? options.session : { user: { email: 'admin@example.invalid' } }
  const alta = Object.prototype.hasOwnProperty.call(options, 'alta') ? options.alta : clone(altaFixture)
  const policy = evaluate(policyFile, env, {})
  const access = evaluate(accessFile, {}, { 'node:crypto': localRequire('node:crypto') })
  const authOptions = { mock: 'auth-options' }
  const mocks = {
    'next/server': { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    'next-auth': { getServerSession: async (input: any) => { assert.equal(input, authOptions); calls.push({ kind: 'auth' }); return session } },
    '@/lib/auth': { authOptions },
    '@/lib/prisma': { prisma: {
      altaServicio: {
        findUnique: async (input: any) => { calls.push({ kind: 'read', input: clone(input) }); if (options.readThrows) throw Error('Lectura ficticia fallida'); return alta },
        update: async (input: any) => { calls.push({ kind: 'update', input: clone(input) }); if (options.updateThrows) throw Error('Escritura ficticia fallida'); return { ...alta, ...input.data } },
      },
      envioContrato: { create: async (input: any) => { calls.push({ kind: 'ledger', input: clone(input) }); return { id: 1, ...input.data } } },
    } },
    '@/lib/email': { sendEmail: async (input: any) => { calls.push({ kind: 'provider', input: clone(input) }); if (options.sendThrows) throw Error('Proveedor ficticio fallido'); return options.sendResult ?? { success: true } } },
    '@/lib/m365-legacy-policy': policy,
    '@/lib/altas/contrato-access': { ...access, altaContractPublicUrl: (...args: any[]) => { calls.push({ kind: 'url', input: args }); return access.altaContractPublicUrl(...args) } },
  }
  const route = evaluate(routeFile, env, mocks, { fetch: () => { networkCalls++; throw Error('Red no permitida') } })
  return {
    calls, networkCalls: () => networkCalls,
    run: () => route.POST(new Request('https://example.invalid/api/altas/alta-ficticia/enviar-contrato', { method: 'POST' }), { params: Promise.resolve({ id: 'alta-ficticia' }) }) as Promise<Response>,
  }
}
const effects = (calls: Call[]) => calls.filter(call => ['provider', 'update', 'ledger', 'url'].includes(call.kind))

// Runtime React mínimo: conserva hooks y JSX reales, sin ejecutar useEffect.
// El evento se toma del botón de la pantalla compilada, no de una función copiada.
type Element = { type: any; props: Record<string, any> }
function elements(node: any): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!node || typeof node !== 'object' || !node.props) return []
  return [node, ...elements(node.props.children)]
}
function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join('')
  if (node && typeof node === 'object') return text(node.props?.children)
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}
function uiHarness(responses: Array<{ status: number; body?: any; jsonThrows?: boolean; transportThrows?: boolean }>) {
  const fixture = clone(altaFixture)
  const states: any[] = [fixture, false]
  let cursor = 0
  const calls: Call[] = []
  const alerts: string[] = []
  let responseIndex = 0
  const jsx = (type: any, props: any) => ({ type, props: props || {} })
  const policy = evaluate(policyFile, {}, {})
  const ui = evaluate(uiFile, {}, {
    react: {
      useState: (initial: any) => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
      useEffect: () => {},
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/navigation': { useParams: () => ({ id: fixture.id }), useRouter: () => ({}) },
    'next/link': { default: 'a', __esModule: true },
    '@/lib/m365-legacy-policy': policy,
  }, {
    alert: (message: string) => alerts.push(message),
    // Transporte falso: sólo admite estas dos APIs locales y nunca usa fetch real.
    fetch: async (url: string, input?: any) => {
      if (url === `/api/admin/altas/${fixture.id}`) {
        assert.equal(input, undefined)
        calls.push({ kind: 'refresh' })
        return { ok: true, json: async () => fixture }
      }
      assert.equal(url, `/api/altas/${fixture.id}/enviar-contrato`)
      assert.deepEqual(clone(input), { method: 'POST' })
      calls.push({ kind: 'send' })
      const response = responses[responseIndex++]
      assert.ok(response, 'Respuesta UI simulada no configurada')
      if (response.transportThrows) throw Error('Transporte ficticio fallido')
      return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => { if (response.jsonThrows) throw Error('JSON ficticio inválido'); return response.body } }
    },
  })
  const render = () => { cursor = 0; return ui.default() }
  const send = async () => {
    const button = elements(render()).find(node => node.type === 'button' && text(node).includes('Enviar contrato al cliente por email'))
    assert.ok(button, 'Botón real de envío presente')
    assert.equal(button.props.disabled, false, 'Sin cierre fijo del botón')
    await button.props.onClick()
    return render()
  }
  return { send, render, calls, alerts, states, fixture }
}

let passed = 0
let providerCallsWhenClosed = 0
let businessWritesWhenClosed = 0
async function test(name: string, run: () => void | Promise<void>) {
  await run()
  passed++
  console.log(`OK ${name}`)
}
async function run() {
  for (const flag of [undefined, '0', 'true', '', 'false', ' 1', '1 ', 'TRUE']) {
    await test(`handler cerrado flag=${JSON.stringify(flag)}: 503, sin efectos`, async () => {
      const h = handlerHarness({ flag, env: { M365_STAGING_CALENDARIO: '1', M365_LEGACY_LEADS_EMAIL_ENABLED: '1' } })
      const response = await h.run()
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
      assert.deepEqual(await response.json(), PENDING)
      assert.deepEqual(h.calls, [{ kind: 'auth' }, { kind: 'read', input: { where: { id: altaFixture.id } } }])
      assert.deepEqual(effects(h.calls), [])
      assert.equal(h.networkCalls(), 0)
      providerCallsWhenClosed += h.calls.filter(call => call.kind === 'provider').length
      businessWritesWhenClosed += h.calls.filter(call => ['update', 'ledger'].includes(call.kind)).length
    })
  }
  for (const flag of [undefined, '0', 'true', '1']) {
    await test(`sesión denegada prevalece flag=${JSON.stringify(flag)}`, async () => {
      const h = handlerHarness({ flag, session: null })
      const response = await h.run()
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'No autorizado' })
      assert.deepEqual(h.calls, [{ kind: 'auth' }])
      assert.equal(h.networkCalls(), 0)
    })
    await test(`alta inexistente conserva 404 flag=${JSON.stringify(flag)}`, async () => {
      const h = handlerHarness({ flag, alta: null })
      const response = await h.run()
      assert.equal(response.status, 404)
      assert.deepEqual(await response.json(), { error: 'Alta no encontrada' })
      assert.deepEqual(effects(h.calls), [])
      assert.equal(h.networkCalls(), 0)
    })
  }
  await test('error de lectura conserva 500 sin proveedor', async () => {
    const h = handlerHarness({ readThrows: true })
    assert.equal((await h.run()).status, 500)
    assert.deepEqual(effects(h.calls), [])
  })
  for (const type of ['PARTICULAR', 'EMPRESA']) {
    await test(`literal 1 ejecuta flujo anterior completo ${type}`, async () => {
      const alta = { ...altaFixture, tipoCliente: type, razonSocial: 'Empresa ficticia' }
      const h = handlerHarness({ flag: '1', alta, env: { NEXTAUTH_URL: 'https://site.example.invalid/' } })
      const response = await h.run()
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { success: true, message: 'Contrato enviado por email al cliente' })
      assert.deepEqual(h.calls.map(call => call.kind), ['auth', 'read', 'url', 'provider', 'update', 'ledger'])
      const email = h.calls.find(call => call.kind === 'provider')!.input
      assert.equal(email.to, alta.email)
      assert.equal(email.subject, `Tu contrato con Internet Operadores - ${alta.tarifaNombre}`)
      assert.ok(email.html.includes(type === 'EMPRESA' ? alta.razonSocial : 'Nombre Ficticio'))
      const url = new URL(h.calls.find(call => call.kind === 'update')!.input.data.contratoPdfUrl)
      assert.equal(url.searchParams.get('altaId'), alta.id)
      assert.equal(url.searchParams.get('token'), alta.token)
      assert.equal(url.searchParams.get('format'), 'html')
      assert.deepEqual(h.calls.find(call => call.kind === 'ledger')!.input, { data: { altaId: alta.id, enviadoA: alta.email, enviadoPor: 'admin@example.invalid' } })
      assert.equal(h.networkCalls(), 0)
    })
  }
  await test('literal 1: proveedor rechaza sin marca ni ledger', async () => {
    const h = handlerHarness({ flag: '1', sendResult: { success: false, error: 'Rechazo ficticio' } })
    const response = await h.run()
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.success, false)
    assert.equal(body.error, 'Rechazo ficticio')
    assert.ok(body.contratoUrl && body.documentacionUrl)
    assert.equal(h.calls.filter(call => ['update', 'ledger'].includes(call.kind)).length, 0)
  })
  await test('literal 1: fallo de proveedor conserva 500 sin escrituras', async () => {
    const h = handlerHarness({ flag: '1', sendThrows: true })
    assert.equal((await h.run()).status, 500)
    assert.equal(h.calls.filter(call => ['update', 'ledger'].includes(call.kind)).length, 0)
  })
  await test('literal 1: fallo de marca conserva 500 sin ledger', async () => {
    const h = handlerHarness({ flag: '1', updateThrows: true })
    assert.equal((await h.run()).status, 500)
    assert.equal(h.calls.filter(call => call.kind === 'ledger').length, 0)
  })
  await test('literal 1: enviadoPor opcional sigue siendo null', async () => {
    const h = handlerHarness({ flag: '1', session: {} })
    assert.equal((await h.run()).status, 200)
    assert.equal(h.calls.find(call => call.kind === 'ledger')!.input.data.enviadoPor, null)
  })

  const pendingCases = [
    { status: 503, body: PENDING },
    { status: 503, body: { codigo: 'M365_LEGACY_PENDING' } },
    { status: 200, body: { code: 'M365_LEGACY_PENDING', success: true } },
    { status: 403, body: { codigo: 'FINANCE_EXTERNAL_ACTIONS_DISABLED' } },
    { status: 403, body: { code: 'FINANCE_EXTERNAL_ACTIONS_DISABLED' } },
    { status: 403, body: { error: SANDBOX } },
  ]
  for (const [index, response] of pendingCases.entries()) {
    await test(`UI real bloqueo ${index + 1}: aviso exacto, sin éxito ni refresh`, async () => {
      const ui = uiHarness([response])
      const tree = await ui.send()
      const statuses = elements(tree).filter(node => node.props.role === 'status')
      assert.equal(statuses.length, 1)
      assert.equal(text(statuses[0]), MESSAGE)
      assert.ok(statuses[0].props.className.includes('bg-blue-50'))
      assert.ok(!statuses[0].props.className.includes('red'))
      assert.deepEqual(ui.alerts, [])
      assert.deepEqual(ui.calls, [{ kind: 'send' }])
      assert.equal(ui.states[0], ui.fixture)
      assert.equal(ui.states[2], false, 'finally libera actionLoading')
      assert.deepEqual(ui.fixture.enviosContrato, [])
    })
  }
  for (const response of [
    { status: 200, body: { success: false, error: 'Rechazo ficticio' } },
    { status: 401, body: { error: 'No autorizado' } },
    { status: 403, body: { codigo: 'IMPERSONATION_TARGET_PERMISSION_DENIED', error: 'Permiso efectivo denegado' } },
    { status: 200, body: {} },
    { status: 200, body: { success: 'true' } },
    { status: 500, body: { success: true, error: 'Fallo ficticio' } },
    { status: 200, jsonThrows: true },
    { status: 200, transportThrows: true },
  ]) {
    await test(`UI real no convierte rechazo/error en éxito ${JSON.stringify(response)}`, async () => {
      const ui = uiHarness([response])
      const tree = await ui.send()
      assert.equal(ui.alerts.length, 1)
      assert.ok(!ui.alerts[0].includes('Contrato enviado'))
      assert.equal(ui.calls.filter(call => call.kind === 'refresh').length, 0)
      assert.equal(elements(tree).filter(node => node.props.role === 'status').length, 0)
      assert.equal(ui.states[2], false)
    })
  }
  await test('UI real reapertura: bloqueo seguido de éxito normal, sin inhabilitar fijo', async () => {
    const ui = uiHarness([{ status: 503, body: PENDING }, { status: 200, body: { success: true } }])
    await ui.send()
    const tree = await ui.send()
    assert.deepEqual(ui.alerts, ['Contrato enviado por email al cliente'])
    assert.deepEqual(ui.calls.map(call => call.kind), ['send', 'send', 'refresh'])
    assert.equal(elements(tree).filter(node => node.props.role === 'status').length, 0)
    assert.equal(ui.states[2], false)
  })
  console.log(JSON.stringify({ testsPassed: passed, authPreserved: true, providerCallsWhenClosed, businessWritesWhenClosed, nativeHandler: true, nativeUIEvent: true, realNetwork: false, realPrisma: false, proxyExecuted: false }))
}
run().catch(error => { console.error(error); process.exitCode = 1 })
