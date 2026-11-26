/**
 * Regresión local del envío de leads. No ejecuta HTTP real ni carga Prisma/auth/email reales.
 * Ejecutar: pnpm exec tsx scripts/test-m365-legacy-leads.ts
 * Handler, helper y componente reales compilados con esbuild en memoria y ejecutados en VM.
 * process.env de cada VM es un objeto ficticio; no lee .env ni cambia el entorno del proceso.
 * fetch del handler lanza siempre; UI sólo admite las dos APIs locales simuladas del lead.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const localRequire = createRequire(import.meta.url)
const { transformSync } = createRequire(localRequire.resolve('tsx/package.json'))('esbuild') as {
  transformSync(source: string, options: Record<string, unknown>): { code: string }
}
const routePath = 'app/api/admin/leads/[id]/enviar-email/route.ts'
const uiPath = 'components/admin/LeadDetalleClient.tsx'
const helperPath = 'lib/m365-legacy-policy.ts'
function compile(path: string, loader: 'ts' | 'tsx' = 'ts') {
  const url = new URL(`../${path}`, import.meta.url)
  return transformSync(readFileSync(url, 'utf8'), {
    loader, jsx: 'automatic', format: 'cjs', platform: 'node', target: 'es2022', sourcefile: fileURLToPath(url),
  }).code
}
const routeCode = compile(routePath)
const helperCode = compile(helperPath)
const uiCode = compile(uiPath, 'tsx')
const FLAG = 'M365_LEGACY_LEADS_EMAIL_ENABLED'
const MESSAGE = 'Envio pendiente de activar (se hara desde Mi Outlook)'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
let networkCalls = 0
let providerCallsWhenClosed = 0
let businessWritesWhenClosed = 0
function noNetwork(): never {
  networkCalls++
  throw new Error('NETWORK_FORBIDDEN')
}
function load(code: string, dependencies: Record<string, unknown>, env: Record<string, string | undefined>, globals: Record<string, unknown> = {}) {
  const memoryModule = { exports: {} as Record<string, any> }
  runInNewContext(code, {
    module: memoryModule, exports: memoryModule.exports,
    require: (id: string) => {
      assert.ok(Object.hasOwn(dependencies, id), `Import real prohibido: ${id}`)
      return dependencies[id]
    },
    process: { env: { ...env } }, Request, Response, Headers, URL, console: { error: () => {} },
    fetch: noNetwork, ...globals,
  })
  return memoryModule.exports
}
function helper(env: Record<string, string | undefined> = {}) {
  return load(helperCode, {}, env)
}
const fixture = () => ({
  id: 'lead-ficticio', nombreEmpresa: 'Empresa ficticia', contacto: 'Persona ficticia',
  email: 'lead@example.invalid', estado: 'NUEVO', prioridad: 'MEDIA', notas: 'Nota anterior',
  informePdfUrl: 'informe-anterior', createdAt: '2026-11-26T12:00:00.000Z',
  cuestionario: { id: 'cuestionario-ficticio', token: 'token-ficticio', estado: 'PENDIENTE', respuestas: [] },
})
type Options = {
  flag?: string
  env?: Record<string, string | undefined>
  authenticated?: boolean
  lead?: ReturnType<typeof fixture> | null
  result?: { success: boolean; error?: string }
  providerThrows?: boolean
}
function handler(options: Options = {}) {
  const env = { ...options.env, [FLAG]: options.flag }
  const counters = { auth: 0, reads: 0, provider: 0, writes: 0 }
  const steps: string[] = []
  const sends: any[] = []
  const updates: Array<{ model: string; args: any }> = []
  const lead = options.lead === undefined ? fixture() : options.lead
  const dependencies = {
    'next/server': { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    'next-auth': { getServerSession: async (authOptions: unknown) => {
      assert.deepEqual(authOptions, { test: 'auth-options' })
      counters.auth++; steps.push('auth')
      return options.authenticated === false ? null : { user: { email: 'admin@example.invalid' } }
    } },
    '@/lib/auth': { authOptions: { test: 'auth-options' } },
    '@/lib/prisma': { prisma: {
      leadMigracionWeb: {
        findUnique: async (args: unknown) => {
          counters.reads++; steps.push('read')
          assert.deepEqual(clone(args), { where: { id: 'lead-ficticio' }, include: { cuestionario: true } })
          return clone(lead)
        },
        update: async (args: unknown) => {
          counters.writes++; steps.push('lead-write')
          updates.push({ model: 'lead', args: clone(args) })
          return clone(lead)
        },
      },
      cuestionarioPrivado: { update: async (args: unknown) => {
        counters.writes++; steps.push('questionnaire-write')
        updates.push({ model: 'questionnaire', args: clone(args) })
        return {}
      } },
    } },
    '@/lib/email': { sendEmail: async (args: unknown) => {
      counters.provider++; steps.push('provider'); sends.push(clone(args))
      if (options.providerThrows) throw new Error('MOCK_PROVIDER_FAILURE')
      return options.result ?? { success: true }
    } },
    '@/lib/m365-legacy-policy': helper(env),
  }
  const route = load(routeCode, dependencies, env)
  const post = (body: unknown = { asunto: 'Asunto ficticio', cuerpoHtml: '<p>Contenido ficticio</p>' }, malformed = false) => route.POST(
    new Request('https://example.invalid/api/admin/leads/lead-ficticio/enviar-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: malformed ? '{' : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'lead-ficticio' }) },
  ) as Promise<Response>
  return { post, counters, steps, sends, updates }
}
let passed = 0
async function test(name: string, run: () => unknown | Promise<unknown>) {
  await run()
  passed++
  console.log(`OK ${name}`)
}
async function assertClosed(options: Options) {
  const h = handler(options)
  const response = await h.post()
  providerCallsWhenClosed += h.counters.provider
  businessWritesWhenClosed += h.counters.writes
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(await response.json(), {
    error: MESSAGE, message: MESSAGE, code: 'M365_LEGACY_PENDING', codigo: 'M365_LEGACY_PENDING', success: false,
  })
  assert.deepEqual(h.counters, { auth: 1, reads: 1, provider: 0, writes: 0 })
  assert.deepEqual(h.steps, ['auth', 'read'])
}

type Element = { type: unknown; props: Record<string, any> }
function elements(node: any): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!node || typeof node !== 'object' || !node.props) return []
  return [node, ...elements(node.props.children)]
}
function ui(responses: Array<{ status: number; data: unknown }>) {
  // Hooks simulados: se ejecutan el componente y el callback originales, no una copia.
  const state: any[] = []
  let cursor = 0
  let used = 0
  const calls: string[] = []
  const timers: Array<() => void> = []
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props })
  const component = load(uiCode, {
    react: {
      useState: (initial: unknown) => {
        const index = cursor++
        if (!(index in state)) state[index] = initial
        return [state[index], (value: unknown) => { state[index] = value }]
      },
      useEffect: () => {}, // no ejecutar carga inicial ni ningún efecto fuera de la acción bajo prueba
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/link': { default: 'link', __esModule: true },
    '@/lib/m365-legacy-policy': helper(),
  }, {}, {
    fetch: async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/leads/lead-ficticio/enviar-email' && init?.method === 'POST') {
        calls.push('POST enviar-email')
        assert.deepEqual(JSON.parse(String(init.body)), { asunto: 'Asunto UI', cuerpoHtml: '<p>HTML UI</p>' })
        const response = responses[used++]
        assert.ok(response, 'Cada envío debe tener respuesta simulada explícita')
        return Response.json(response.data, { status: response.status })
      }
      if (path === '/api/admin/leads/lead-ficticio' && !init) {
        calls.push('GET lead')
        return Response.json({ lead: fixture() })
      }
      return noNetwork()
    },
    window: { location: { origin: 'https://example.invalid' } },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length },
  }).default
  const render = () => { cursor = 0; return component({ leadId: 'lead-ficticio' }) }
  render() // inicializa hooks sin lanzar useEffect
  state[0] = fixture()
  state[1] = false
  state[7] = 'Éxito anterior que no debe sobrevivir a un envío bloqueado'
  state[11] = true
  state[12] = 'Asunto UI'
  state[13] = '<p>HTML UI</p>'
  const send = async () => {
    const button = elements(render()).find(element => element.props.onClick?.name === 'handleEnviarEmail')
    assert.ok(button, 'Se ejecuta el callback del botón real del modal')
    assert.equal(button.props.disabled, false, 'No hay bloqueo fijo del botón')
    await button.props.onClick()
    await Promise.resolve() // permite terminar fetchLead() del caso abierto
    await Promise.resolve()
  }
  return { render, send, state, calls, timers }
}
function assertUiPending(u: ReturnType<typeof ui>) {
  assert.deepEqual(u.calls, ['POST enviar-email'], 'No refresca lead ni llama acciones adicionales')
  assert.equal(u.state[7], '', 'No conserva éxito anterior ni muestra error')
  assert.equal(u.state[11], true, 'Conserva el borrador/modal')
  assert.equal(u.state[14], false, 'Libera estado enviando')
  assert.equal(u.state[15], MESSAGE)
  assert.equal(u.state[0].estado, 'NUEVO', 'No cambia estado ni fechas localmente')
  assert.equal(u.timers.length, 0, 'No programa notificación de éxito')
  const notices = elements(u.render()).filter(element => element.props.role === 'status' && element.props.children === MESSAGE)
  assert.equal(notices.length, 2, 'Aviso informativo en página y dentro del modal visible')
  for (const notice of notices) {
    assert.match(notice.props.className, /bg-blue-50/)
    assert.doesNotMatch(notice.props.className, /red|green/)
  }
}

async function main() {
  for (const flag of [undefined, '', '0', 'true', 'false', 'TRUE', ' 1 ', '01']) {
    await test(`cerrado literal ${String(flag)}: 503, privado y cero efectos`, () => assertClosed({ flag }))
  }
  await test('flags de calendario y otras rutas no reabren leads', () => assertClosed({ env: {
    M365_STAGING_CALENDARIO: '1', M365_LEGACY_CRM_EXTERNAL_ENABLED: '1',
    M365_LEGACY_ALTAS_CONTRATO_ENABLED: '1', M365_LEGACY_MANTENIMIENTO_EMAIL_ENABLED: '1',
    M365_LEGACY_MAGIC_LINK_ENABLED: '1',
  } }))
  for (const flag of [undefined, '0', 'true', '1']) {
    await test(`sesión denegada conserva 401 antes del cierre (${String(flag)})`, async () => {
      const h = handler({ flag, authenticated: false })
      const response = await h.post(undefined, true)
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'No autorizado' })
      assert.deepEqual(h.counters, { auth: 1, reads: 0, provider: 0, writes: 0 })
    })
  }
  for (const flag of [undefined, '1']) {
    await test(`lead inexistente conserva 404 sin efectos (${String(flag)})`, async () => {
      const h = handler({ flag, lead: null })
      const response = await h.post()
      assert.equal(response.status, 404)
      assert.deepEqual(await response.json(), { error: 'Lead no encontrado' })
      assert.deepEqual(h.counters, { auth: 1, reads: 1, provider: 0, writes: 0 })
    })
    await test(`JSON inválido conserva error existente sin efectos (${String(flag)})`, async () => {
      const h = handler({ flag })
      const response = await h.post(undefined, true)
      assert.equal(response.status, 500)
      assert.deepEqual(h.counters, { auth: 1, reads: 0, provider: 0, writes: 0 })
    })
  }
  await test('literal 1 recorre proveedor y marcas previas después de autenticación/lectura', async () => {
    const h = handler({ flag: '1' })
    const response = await h.post({ asunto: 'Asunto probado', cuerpoHtml: '<p>HTML probado</p>', pdfUrl: 'pdf-ficticio' })
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.success, true)
    assert.equal(data.message, 'Email enviado correctamente')
    assert.equal(data.cuestionarioUrl, 'https://www.internetoperadores.com/cuestionario/token-ficticio')
    assert.deepEqual(h.steps, ['auth', 'read', 'provider', 'lead-write', 'questionnaire-write'])
    assert.deepEqual(h.sends[0], {
      to: 'lead@example.invalid', subject: 'Asunto probado', html: '<p>HTML probado</p>',
      bcc: ['comercial@internetoperadores.com', 'david.perez@internetoperadores.com'],
    })
    const dataWritten = h.updates[0].args.data
    assert.equal(dataWritten.estado, 'AUDITORIA_ENVIADA')
    assert.equal(dataWritten.informePdfUrl, 'pdf-ficticio')
    assert.match(dataWritten.notas, /Email enviado: "Asunto probado" por admin@example.invalid\nNota anterior$/)
    assert.ok(dataWritten.fechaAuditoriaEnviada)
    assert.ok(dataWritten.fechaCuestionarioEnviado)
    assert.ok(h.updates[1].args.data.fechaEnvio)
  })
  await test('literal 1 conserva HTML legacy/asunto automático sin cuestionario', async () => {
    const lead = { ...fixture(), cuestionario: null } as unknown as ReturnType<typeof fixture>
    const h = handler({ flag: '1', lead })
    const response = await h.post({ mensaje: 'Mensaje probado', pdfUrl: 'pdf-ficticio' })
    assert.equal(response.status, 200)
    assert.equal(h.sends[0].subject, 'Informe de Auditoría Web - Empresa ficticia')
    assert.match(h.sends[0].html, /Mensaje probado/)
    assert.match(h.sends[0].html, /pdf-ficticio/)
    assert.doesNotMatch(h.sends[0].html, /Completar Cuestionario Técnico/)
    assert.equal(h.counters.writes, 1)
    assert.equal((await response.json()).cuestionarioUrl, '')
  })
  for (const [estado, expected] of [['EN_REVISION', 'AUDITORIA_ENVIADA'], ['CUESTIONARIO_COMPLETADO', 'PROPUESTA_ENVIADA'], ['CERRADO_GANADO', 'CERRADO_GANADO']]) {
    await test(`literal 1 conserva transición ${estado}`, async () => {
      const h = handler({ flag: '1', lead: { ...fixture(), estado } })
      assert.equal((await h.post()).status, 200)
      const data = h.updates[0].args.data
      assert.equal(data.estado, expected)
      assert.equal(Boolean(data.fechaPropuestaEnviada), expected === 'PROPUESTA_ENVIADA')
      assert.equal(Boolean(data.fechaAuditoriaEnviada), expected === 'AUDITORIA_ENVIADA')
    })
  }
  await test('literal 1 conserva fallo proveedor sin marcar enviado', async () => {
    const h = handler({ flag: '1', result: { success: false, error: 'Fallo proveedor simulado' } })
    const response = await h.post()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { success: false, error: 'Fallo proveedor simulado', emailSent: false })
    assert.equal(h.counters.provider, 1)
    assert.equal(h.counters.writes, 0)
  })
  await test('literal 1 conserva excepción proveedor sin escrituras', async () => {
    const h = handler({ flag: '1', providerThrows: true })
    assert.equal((await h.post()).status, 500)
    assert.equal(h.counters.provider, 1)
    assert.equal(h.counters.writes, 0)
  })
  for (const pending of [
    { code: 'M365_LEGACY_PENDING', success: false, error: MESSAGE },
    { codigo: 'M365_LEGACY_PENDING', success: false, message: MESSAGE },
    { code: 'M365_LEGACY_PENDING', success: true }, // pending debe preceder incluso a un success contradictorio
    { codigo: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', error: 'Mensaje global previo' },
    { code: 'FINANCE_EXTERNAL_ACTIONS_DISABLED', error: 'Mensaje global previo' },
  ]) {
    await test(`UI callback real: ${JSON.stringify(pending)} informativo sin falso éxito`, async () => {
      const u = ui([{ status: 503, data: pending }])
      await u.send()
      assertUiPending(u)
    })
  }
  await test('UI callback real reconoce el bloqueo sandbox conocido anterior al handler', async () => {
    const u = ui([{ status: 403, data: { error: 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.' } }])
    await u.send()
    assertUiPending(u)
  })
  await test('UI no disfraza denegación de autenticación como pendiente', async () => {
    const u = ui([{ status: 401, data: { error: 'No autorizado' } }])
    await u.send()
    assert.equal(u.state[15], '')
    assert.equal(u.state[7], 'Error: No autorizado')
    assert.deepEqual(u.calls, ['POST enviar-email'])
  })
  await test('UI conserva error real del proveedor', async () => {
    const u = ui([{ status: 500, data: { success: false, error: 'Error proveedor' } }])
    await u.send()
    assert.equal(u.state[15], '')
    assert.equal(u.state[7], 'Error: Error proveedor')
    assert.deepEqual(u.calls, ['POST enviar-email'])
  })
  await test('UI reapertura normal tras pendiente: reintenta y sólo éxito refresca/cierra modal', async () => {
    const u = ui([
      { status: 503, data: { code: 'M365_LEGACY_PENDING', success: false } },
      { status: 200, data: { success: true } },
    ])
    await u.send()
    assertUiPending(u)
    await u.send()
    assert.equal(u.state[15], '')
    assert.equal(u.state[7], 'Email enviado correctamente')
    assert.equal(u.state[11], false)
    assert.equal(u.state[14], false)
    assert.deepEqual(u.calls, ['POST enviar-email', 'POST enviar-email', 'GET lead'])
    assert.equal(u.timers.length, 1)
  })
  await test('cero red y cero efectos de negocio/proveedor con interruptor cerrado', () => {
    assert.equal(networkCalls, 0)
    assert.equal(providerCallsWhenClosed, 0)
    assert.equal(businessWritesWhenClosed, 0)
  })
  console.log(JSON.stringify({ testsPassed: passed, authPreserved: true, providerCallsWhenClosed, businessWritesWhenClosed, networkCalls }))
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
