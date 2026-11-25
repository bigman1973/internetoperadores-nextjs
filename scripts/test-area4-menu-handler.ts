import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import test from 'node:test'

/** Real route module, injected identity/DB/audit. No network, cookies or actual database. */
async function withHandler(run: (ctx: any) => Promise<void>) {
  const require = createRequire(resolve(process.cwd(), 'scripts/test-area4-menu-handler.ts'))
  const paths = ['../lib/prisma', '../lib/area4/live-admin', '../lib/area4/audit', '../app/api/admin/usuarios/menu-presentacion/route'].map(path => require.resolve(path))
  const prior = paths.map(path => ({ path, value: require.cache[path] }))
  const flags = ['IO_PRODUCTION_READ_ONLY', 'FINANCE_DEPLOYMENT_READ_ONLY']
  const previous = flags.map(key => ({ key, value: process.env[key] }))
  for (const flag of flags) delete process.env[flag]
  const stats = { transactions: 0, writes: 0, audits: 0 }
  let denied = false
  let acting = false
  let config = { menuAgrupadoParaPropietario: false, menuAgrupadoParaTodos: false }
  const tx = { configuracionPanelArea4: {
    async findUnique() { return config },
    async upsert(input: any) {
      stats.writes++
      config = { menuAgrupadoParaPropietario: input.update.menuAgrupadoParaPropietario, menuAgrupadoParaTodos: input.update.menuAgrupadoParaTodos }
      return config
    },
  } }
  const db = { ...tx, async $transaction(callback: any) { stats.transactions++; return callback(tx) } }
  require.cache[paths[0]] = { exports: { default: db, prisma: db, __esModule: true } } as any
  require.cache[paths[1]] = { exports: { async requireArea4Owner() {
    return denied ? { ok: false, response: new Response('{}', { status: 401 }) } : {
      ok: true, principal: { id: 101, activo: true, rol: 'SUPER_ADMIN' },
      session: { user: { id: '101', email: 'owner@example.invalid' }, ...(acting ? { impersonation: { actorId: '101' } } : {}) },
    }
  } } } as any
  require.cache[paths[2]] = { exports: { async appendArea4Audit(_tx: any, event: any) { assert.equal(event.actorId, 101); stats.audits++ } } } as any
  delete require.cache[paths[3]]
  const origin = 'https://staging.internetoperadores.com'
  const request = (body: unknown = { menuAgrupadoParaPropietario: false, menuAgrupadoParaTodos: true }, source = origin) => new Request(`${origin}/api/admin/usuarios/menu-presentacion`, {
    method: 'PUT', headers: { origin: source, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    await run({ handler: require(paths[3]), request, stats, setDenied(value: boolean) { denied = value }, setActing(value: boolean) { acting = value } })
  } finally {
    for (const { key, value } of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    for (const { path, value } of prior) { if (value) require.cache[path] = value; else delete require.cache[path] }
  }
}

test('cada flag read-only cierra el PUT real sin transacción, upsert ni auditoría', async () => {
  await withHandler(async ({ handler, request, stats }) => {
    for (const flag of ['IO_PRODUCTION_READ_ONLY', 'FINANCE_DEPLOYMENT_READ_ONLY']) {
      process.env[flag] = '1'
      const response = await handler.PUT(request())
      assert.equal(response.status, 409)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      assert.deepEqual(stats, { transactions: 0, writes: 0, audits: 0 })
      delete process.env[flag]
    }
  })
})

test('sesión denegada, actuación, origen cruzado y cuerpo desconocido no escriben', async () => {
  await withHandler(async ({ handler, request, stats, setDenied, setActing }) => {
    setDenied(true); assert.equal((await handler.PUT(request())).status, 401); setDenied(false)
    setActing(true); assert.equal((await handler.PUT(request())).status, 403); setActing(false)
    assert.equal((await handler.PUT(request(undefined, 'https://foreign.example.invalid'))).status, 403)
    assert.equal((await handler.PUT(request({ menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: false, grant: 'VECX' }))).status, 400)
    assert.deepEqual(stats, { transactions: 0, writes: 0, audits: 0 })
  })
})

test('solo la configuración explícita válida se guarda y audita en la misma transacción', async () => {
  await withHandler(async ({ handler, request, stats }) => {
    const response = await handler.PUT(request())
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body.configuracion, { menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: true })
    assert.deepEqual(stats, { transactions: 1, writes: 1, audits: 1 })
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  })
})
