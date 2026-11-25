import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'
import { assertConciliarLiveAccessTx } from '../lib/finanzas/conciliar-live-access'

type Photo = Readonly<{
  actor: { id: number; activo: boolean; rol: string; roles: string[] | null } | null
  target: { activo: boolean } | null
  permissions: readonly { lectura: boolean; escritura: boolean }[]
  granular: number
}>

const ACTOR = 41
const DATABASE = 'io_staging_finanzas'
const USER = 'io_staging_finanzas'

function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    actor: { id: ACTOR, activo: true, rol: 'OPERADOR', roles: [] },
    target: { activo: true },
    permissions: [{ lectura: true, escritura: true }],
    granular: 1,
    ...overrides,
  }
}

function sqlText(statement: unknown): string {
  if (Array.isArray(statement)) return statement.join('?')
  const candidate = statement as { strings?: unknown }
  return Array.isArray(candidate?.strings) ? candidate.strings.join('?') : ''
}

function txFor(value: Photo) {
  const queries: string[] = []
  return {
    queries,
    async $queryRaw<T>(statement: unknown): Promise<T> {
      const sql = sqlText(statement)
      queries.push(sql)
      assert.match(sql, /WITH actor_locked AS MATERIALIZED/, 'B8 must lock the actor in the one coalesced photo')
      assert.match(sql, /permissions_locked AS MATERIALIZED/, 'B8 must lock permission rows after actor')
      assert.match(sql, /FOR SHARE OF u/, 'the actor lock remains FOR SHARE')
      assert.match(sql, /FOR SHARE OF p/, 'permission lock remains FOR SHARE')
      return [{ database_name: DATABASE, database_user: USER, ...structuredClone(value) }] as T
    },
  }
}

async function withStagingRuntime<T>(run: () => Promise<T>): Promise<T> {
  const names = [
    'FINANCE_STAGING_SANDBOX',
    'VERCEL_ENV',
    'DATABASE_URL',
    'FINANCE_EASY_PRODUCTION_ENABLED',
    'FINANCE_MODEL_PRODUCTION_ENABLED',
    'FINANCE_CONCILIAR_PRODUCTION_ENABLED',
    'NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED',
    'IO_PRODUCTION_READ_ONLY',
  ] as const
  const before = new Map(names.map(name => [name, process.env[name]]))
  process.env.FINANCE_STAGING_SANDBOX = '1'
  process.env.VERCEL_ENV = 'preview'
  process.env.DATABASE_URL = 'postgresql://io_staging_finanzas:fixture@127.0.0.1:1/io_staging_finanzas'
  process.env.FINANCE_EASY_PRODUCTION_ENABLED = '0'
  process.env.FINANCE_MODEL_PRODUCTION_ENABLED = '0'
  process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED = '0'
  process.env.NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED = '0'
  process.env.IO_PRODUCTION_READ_ONLY = '0'
  try {
    return await run()
  } finally {
    for (const name of names) {
      const previous = before.get(name)
      if (previous === undefined) delete process.env[name]
      else process.env[name] = previous
    }
  }
}

test('G7 coalesced live access preserves B4/B8 authorization outcomes and lock order', async () => {
  await withStagingRuntime(async () => {
    for (const fixture of [
      photo(),
      photo({ actor: { id: ACTOR, activo: true, rol: 'SUPER_ADMIN', roles: ['CONTABILIDAD'] }, target: { activo: false }, permissions: [], granular: 7 }),
      photo({ actor: { id: ACTOR, activo: true, rol: 'GERENTE', roles: ['CONTABILIDAD'] }, target: null, permissions: [], granular: 4 }),
      photo({ actor: { id: ACTOR, activo: true, rol: 'OPERADOR', roles: ['CONTABILIDAD', 'OTRO'] }, permissions: [], granular: 0 }),
      photo({ permissions: [{ lectura: true, escritura: false }, { lectura: false, escritura: true }], granular: 2 }),
    ]) {
      const tx = txFor(fixture)
      const result = await assertConciliarLiveAccessTx(tx as never, ACTOR, true)
      assert.equal('response' in result, false, 'the real B4 and B8 validators accept this exact live photo')
      assert.equal(tx.queries.length, 1, 'only the coalesced original-transaction photo reads authorization state')
    }
  })
})

test('G7 coalesced live access retains denials for inactive, area-off, granular and cross-context actors', async () => {
  await withStagingRuntime(async () => {
    for (const fixture of [
      photo({ actor: null }),
      photo({ actor: { id: ACTOR, activo: false, rol: 'SUPER_ADMIN', roles: [] } }),
      photo({ target: { activo: false } }),
      photo({ permissions: [{ lectura: true, escritura: false }], granular: 1 }),
      photo({ actor: { id: ACTOR, activo: true, rol: 'OPERADOR', roles: ['SUPER_ADMIN'] }, permissions: [], granular: 0 }),
      photo({ actor: { id: ACTOR + 1, activo: true, rol: 'SUPER_ADMIN', roles: [] } }),
    ]) {
      const tx = txFor(fixture)
      if (fixture.actor?.id === ACTOR + 1) {
        await assert.rejects(assertConciliarLiveAccessTx(tx as never, ACTOR, true), /CONCILIAR_ACCESS_PHOTO_CONTRATO_INVALIDO/)
      } else {
        const result = await assertConciliarLiveAccessTx(tx as never, ACTOR, true)
        assert.equal('response' in result, true, 'no stale photo, role-array escalation or inactive target grants write access')
      }
      assert.equal(tx.queries.length, 1)
    }
  })
})

test('G7 live access consumes only the already locked adapter surface', async () => {
  await withStagingRuntime(async () => {
    const tx = txFor(photo())
    await assertConciliarLiveAccessTx(tx as never, ACTOR, true)
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('lib/finanzas/conciliar-live-access.ts', 'utf8'))
    assert.match(source, /await assertConciliarRuntime\(accessTx\)/)
    assert.match(source, /await requireB4ActorAccess\(actorId, 'escritura', accessTx\)/)
    assert.match(source, /await requireActualActorPermissionB8Tx\(accessTx, actorId, 'escritura'\)/)
    assert.doesNotMatch(source, /hasConciliarSerializableAuthorizationForActor|WeakMap|Map<|setTimeout|AsyncLocalStorage/)
  })
})
