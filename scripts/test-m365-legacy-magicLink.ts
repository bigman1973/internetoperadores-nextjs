/**
 * Ejecutar: pnpm exec tsx scripts/test-m365-legacy-magicLink.ts
 * Handler y políticas reales compilados con esbuild y ejecutados en VM.
 * Sólo dobles de las APIs locales de Prisma/correo/crypto y NextResponse.json
 * sobre Response nativa. Cero red, Prisma real, .env o cambios de process.env.
 * No hay consumidor UI directo: se comprueba estáticamente, sin inventar uno.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script, createContext } from 'node:vm'

const root = fileURLToPath(new URL('../', import.meta.url))
const route = 'app/api/auth/magic-link/route.ts'
const flag = 'M365_LEGACY_MAGIC_LINK_ENABLED'
const pendingMessage = 'Envio pendiente de activar (se hara desde Mi Outlook)'
const successMessage = 'Si el email está registrado, recibirás un enlace de acceso.'
const localRequire = createRequire(import.meta.url)
const tsxRequire = createRequire(localRequire.resolve('tsx/package.json'))
const { transformSync } = tsxRequire('esbuild') as {
  transformSync: (source: string, options: {
    loader: 'ts'; format: 'cjs'; platform: 'node'; target: 'es2022'; sourcefile: string
  }) => { code: string }
}

const compile = (path: string) => transformSync(readFileSync(join(root, path), 'utf8'), {
  loader: 'ts', format: 'cjs', platform: 'node', target: 'es2022', sourcefile: path,
}).code
const handlerCode = compile(route)
const policyCode = compile('lib/m365-legacy-policy.ts')
const actingCode = compile('lib/impersonation-policy.ts')

type UnknownRecord = Record<string, any>
type Calls = {
  reads: UnknownRecord[]
  invalidations: UnknownRecord[]
  creations: UnknownRecord[]
  emails: UnknownRecord[]
  tokenBytes: number[]
  errors: unknown[][]
  network: number
  order: string[]
}
type FixtureOptions = {
  env?: Record<string, string | undefined>
  activeClient?: boolean
  readFails?: boolean
  providerFails?: boolean
  tokenFails?: boolean
}

// No fallback require: ningún módulo de BD/proveedor puede ejecutarse.
function load(code: string, label: string, env: Record<string, string | undefined>, imports: UnknownRecord, calls: Calls) {
  const memoryModule = { exports: {} as UnknownRecord }
  const context = createContext({
    module: memoryModule,
    exports: memoryModule.exports,
    process: { env },
    Buffer,
    URL,
    URLSearchParams,
    console: { error: (...args: unknown[]) => calls.errors.push(args) },
    fetch: () => {
      calls.network++
      throw new Error('RED_PROHIBIDA_EN_PRUEBA_MAGIC_LINK')
    },
    require: (id: string) => {
      assert.ok(Object.hasOwn(imports, id), `Import real prohibido: ${id}`)
      return imports[id]
    },
  })
  new Script(code, { filename: `${label}:test-memory` }).runInContext(context)
  return memoryModule.exports
}

function fixture(options: FixtureOptions = {}) {
  // Sólo un mapa de fixtures; nunca se lee ni se modifica process.env real.
  const env = { ...options.env }
  const calls: Calls = {
    reads: [], invalidations: [], creations: [], emails: [], tokenBytes: [], errors: [], network: 0, order: [],
  }
  const policy = load(policyCode, 'm365-legacy-policy', env, {}, calls)
  const prisma = {
    clienteWeb: {
      findFirst: async (args: UnknownRecord) => {
        calls.reads.push(args)
        calls.order.push('clienteWeb.findFirst')
        if (options.readFails) throw new Error('READ_DENIED_FIXTURE')
        return options.activeClient === false ? null : { id: 'cliente-ficticio', nombre: 'Cliente ficticio', email: 'cliente@example.invalid', activo: true }
      },
    },
    magicLink: {
      updateMany: async (args: UnknownRecord) => {
        calls.invalidations.push(args)
        calls.order.push('magicLink.updateMany')
        return { count: 1 }
      },
      create: async (args: UnknownRecord) => {
        calls.creations.push(args)
        calls.order.push('magicLink.create')
        return { id: 'enlace-ficticio', ...args.data }
      },
    },
  }
  const handler = load(handlerCode, route, env, {
    'next/server': {
      NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
    },
    '@/lib/prisma': { __esModule: true, default: prisma },
    '@/lib/email': {
      sendEmail: async (args: UnknownRecord) => {
        calls.emails.push(args)
        calls.order.push('sendEmail')
        if (options.providerFails) throw new Error('PROVIDER_DENIED_FIXTURE')
        return { success: true }
      },
    },
    '@/lib/m365-legacy-policy': policy,
    crypto: {
      randomBytes: (bytes: number) => {
        calls.tokenBytes.push(bytes)
        calls.order.push('crypto.randomBytes')
        if (options.tokenFails) throw new Error('TOKEN_DENIED_FIXTURE')
        return Buffer.alloc(bytes, 0xab)
      },
    },
  }, calls)
  return {
    calls,
    policy,
    post: (body: unknown) => handler.POST(new Request('https://example.invalid/api/auth/magic-link', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })) as Promise<Response>,
    postMalformed: () => handler.POST(new Request('https://example.invalid/api/auth/magic-link', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    })) as Promise<Response>,
  }
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value))
function noEffects(calls: Calls) {
  assert.equal(calls.invalidations.length, 0, 'No invalidar enlaces anteriores')
  assert.equal(calls.creations.length, 0, 'No crear enlaces ni tokens persistidos')
  assert.equal(calls.emails.length, 0, 'No llamar al proveedor de correo')
  assert.equal(calls.tokenBytes.length, 0, 'No generar tokens externos')
  assert.equal(calls.network, 0, 'No permitir red')
}

let testsPassed = 0
let closedProviderCalls = 0
let closedBusinessWrites = 0
async function test(name: string, fn: () => void | Promise<void>) {
  await fn()
  testsPassed++
  console.log(`ok ${testsPassed}: ${name}`)
}

async function main() {
  // No basta inspeccionar fuente: cada caso ejecuta POST real compilado.
  for (const value of [undefined, '0', 'true', '', 'TRUE', ' 1', '1 ']) {
    for (const activeClient of [true, false]) {
      await test(`cerrado flag=${JSON.stringify(value)} cliente=${activeClient ? 'activo' : 'ausente/inactivo'}`, async () => {
        const f = fixture({ env: { [flag]: value }, activeClient })
        const response = await f.post({ email: '  Cliente@Example.Invalid  ' })
        assert.equal(response.status, 503)
        assert.equal(response.headers.get('cache-control'), 'private, no-store')
        const body = await response.json()
        assert.deepEqual(body, {
          error: pendingMessage, message: pendingMessage,
          code: 'M365_LEGACY_PENDING', codigo: 'M365_LEGACY_PENDING', success: false,
        })
        assert.equal(f.policy.isM365LegacyPending(body), true)
        assert.equal(body.success, false, 'Contrato al consumidor: nunca éxito/enviado cuando está pendiente')
        assert.deepEqual(plain(f.calls.reads), [{ where: { email: 'cliente@example.invalid', activo: true } }])
        assert.deepEqual(f.calls.order, ['clienteWeb.findFirst'], 'Validar cliente antes del cierre; ningún efecto después')
        noEffects(f.calls)
        closedProviderCalls += f.calls.emails.length
        closedBusinessWrites += f.calls.invalidations.length + f.calls.creations.length
      })
    }
  }

  await test('los otros interruptores y calendario staging no reabren magic-link', async () => {
    const f = fixture({ env: {
      M365_LEGACY_LEADS_EMAIL_ENABLED: '1', M365_LEGACY_MANTENIMIENTO_EMAIL_ENABLED: '1',
      M365_LEGACY_ALTAS_CONTRATO_ENABLED: '1', M365_LEGACY_CRM_EXTERNAL_ENABLED: '1',
      M365_STAGING_CALENDARIO: '1',
    } })
    assert.equal((await f.post({ email: 'cliente@example.invalid' })).status, 503)
    noEffects(f.calls)
  })

  for (const value of [undefined, '0', 'true', '1']) {
    for (const body of [{}, { email: '' }, { email: null }, { email: false }]) {
      await test(`validación pública Email requerido precede al cierre flag=${JSON.stringify(value)} body=${JSON.stringify(body)}`, async () => {
        const f = fixture({ env: { [flag]: value } })
        const response = await f.post(body)
        assert.equal(response.status, 400)
        assert.deepEqual(await response.json(), { error: 'Email requerido' })
        assert.equal(f.calls.reads.length, 0)
        noEffects(f.calls)
      })
    }
  }

  for (const value of [undefined, '1']) {
    await test(`JSON inválido conserva error anterior flag=${JSON.stringify(value)}`, async () => {
      const f = fixture({ env: { [flag]: value } })
      const response = await f.postMalformed()
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), { error: 'Error al procesar la solicitud' })
      assert.equal(f.calls.reads.length, 0)
      noEffects(f.calls)
    })
    await test(`email de tipo incorrecto conserva error anterior flag=${JSON.stringify(value)}`, async () => {
      const f = fixture({ env: { [flag]: value } })
      assert.equal((await f.post({ email: 42 })).status, 500)
      assert.equal(f.calls.reads.length, 0)
      noEffects(f.calls)
    })
    await test(`consulta de cliente denegada no se enmascara como pendiente flag=${JSON.stringify(value)}`, async () => {
      const f = fixture({ env: { [flag]: value }, readFails: true })
      const response = await f.post({ email: 'cliente@example.invalid' })
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), { error: 'Error al procesar la solicitud' })
      assert.equal(f.calls.reads.length, 1)
      noEffects(f.calls)
    })
  }

  await test('literal 1 mantiene envío anterior, normalización, invalidación y expiración de 15 minutos', async () => {
    const f = fixture({ env: { [flag]: '1' } })
    const before = Date.now()
    const response = await f.post({ email: '  Cliente@Example.Invalid ' })
    const after = Date.now()
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body, { success: true, message: successMessage })
    assert.equal(f.policy.isM365LegacyPending(body), false, 'La reapertura conserva contrato de éxito normal')
    assert.deepEqual(f.calls.order, ['clienteWeb.findFirst', 'crypto.randomBytes', 'magicLink.updateMany', 'magicLink.create', 'sendEmail'])
    assert.deepEqual(plain(f.calls.invalidations), [{ where: { email: 'cliente@example.invalid', used: false }, data: { used: true } }])
    assert.deepEqual(f.calls.tokenBytes, [32])
    assert.equal(f.calls.creations.length, 1)
    const data = f.calls.creations[0].data
    assert.equal(data.email, 'cliente@example.invalid')
    assert.equal(data.token, 'ab'.repeat(32))
    const expiresAt = Number(data.expiresAt)
    assert.ok(expiresAt >= before + 15 * 60 * 1000 && expiresAt <= after + 15 * 60 * 1000)
    assert.equal(f.calls.emails.length, 1)
    assert.equal(f.calls.emails[0].to, data.email)
    assert.equal(f.calls.emails[0].subject, 'Tu enlace de acceso - Internet Operadores')
    assert.ok(f.calls.emails[0].html.includes(`https://www.internetoperadores.com/api/auth/magic-link/verify?token=${data.token}`))
    assert.equal(f.calls.network, 0)
  })

  await test('literal 1 conserva URL configurada sin leer entorno real', async () => {
    const f = fixture({ env: { [flag]: '1', NEXTAUTH_URL: 'https://fixture.example.invalid' } })
    assert.equal((await f.post({ email: 'cliente@example.invalid' })).status, 200)
    assert.ok(f.calls.emails[0].html.includes('https://fixture.example.invalid/api/auth/magic-link/verify?token='))
    assert.equal(f.calls.network, 0)
  })

  await test('literal 1 conserva privacidad cliente inexistente/inactivo sin generar enlace ni enviar', async () => {
    const f = fixture({ env: { [flag]: '1' }, activeClient: false })
    const response = await f.post({ email: 'ausente@example.invalid' })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true, message: successMessage })
    assert.deepEqual(plain(f.calls.reads), [{ where: { email: 'ausente@example.invalid', activo: true } }])
    noEffects(f.calls)
  })

  await test('literal 1 no salta el fallo de generación de token anterior', async () => {
    const f = fixture({ env: { [flag]: '1' }, tokenFails: true })
    assert.equal((await f.post({ email: 'cliente@example.invalid' })).status, 500)
    assert.equal(f.calls.tokenBytes.length, 1)
    assert.equal(f.calls.invalidations.length + f.calls.creations.length + f.calls.emails.length, 0)
    assert.equal(f.calls.network, 0)
  })

  await test('literal 1 mantiene el error del proveedor, no declara envío exitoso', async () => {
    const f = fixture({ env: { [flag]: '1' }, providerFails: true })
    const response = await f.post({ email: 'cliente@example.invalid' })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'Error al procesar la solicitud' })
    assert.equal(f.calls.invalidations.length, 1)
    assert.equal(f.calls.creations.length, 1)
    assert.equal(f.calls.emails.length, 1)
    assert.equal(f.calls.network, 0)
  })

  for (const value of [undefined, '1']) {
    await test(`política acting real sigue denegando magic-link aun con flag=${JSON.stringify(value)}`, () => {
      const f = fixture({ env: { [flag]: value } })
      const acting = load(actingCode, 'impersonation-policy', {}, {}, f.calls)
      const decision = acting.impersonationRouteDecision('/api/auth/magic-link', 'POST', new URLSearchParams(), 42)
      assert.deepEqual(plain(decision), { allowed: false })
      assert.equal(acting.impersonationRequestAllowed('/api/auth/magic-link', 'POST'), false)
      // Política pura real: no se simula ni se atribuye un HTTP 403 al handler público.
      noEffects(f.calls)
      assert.equal(f.calls.reads.length, 0)
    })
  }

  await test('contrato pendiente reconocible por code/codigo y sin falso éxito', () => {
    const f = fixture()
    for (const body of [f.policy.m365LegacyPendingBody(), { code: 'M365_LEGACY_PENDING' }, { codigo: 'M365_LEGACY_PENDING' }]) {
      assert.equal(f.policy.isM365LegacyPending(body), true)
    }
    for (const body of [null, {}, { success: true }, { code: 'FINANCE_EXTERNAL_ACTIONS_DISABLED' }]) {
      assert.equal(f.policy.isM365LegacyPending(body), false)
    }
    assert.equal(f.policy.m365LegacyPendingBody().success, false)
    noEffects(f.calls)
  })

  await test('UI: no existen consumidores directos que puedan registrar éxito/toast de este envío', () => {
    const consumers: string[] = []
    function visit(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) {
          if (relative(root, path).replaceAll('\\', '/') !== 'app/api') visit(path)
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          const source = readFileSync(path, 'utf8')
          if (/\/api\/auth\/magic-link\b|magicLink|magic-link/.test(source)) consumers.push(relative(root, path))
        }
      }
    }
    // app y components contienen la UI actual; app/api se excluye expresamente.
    visit(join(root, 'app'))
    visit(join(root, 'components'))
    assert.deepEqual(consumers, [], 'Si aparece un consumidor directo deberá adoptar isM365LegacyPending antes de éxito/error')
  })

  console.log(JSON.stringify({
    route, testsPassed, authPreserved: true,
    providerCallsWhenClosed: closedProviderCalls,
    businessWritesWhenClosed: closedBusinessWrites,
    networkCalls: 0, prismaReal: false, uiDirectConsumers: 0,
    limitations: ['Handler público sin guard 401 propio; acting probado con política pura real, no HTTP de proxy.', 'Sin consumidor UI directo: comprobación estática y contrato success:false, no render UI inventado.'],
  }))
}

void main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
