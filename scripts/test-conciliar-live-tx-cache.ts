/*
 * Regresión local del caché de verificación viva de Conciliar.
 *
 *   pnpm exec tsx scripts/test-conciliar-live-tx-cache.ts
 *
 * No importa dotenv, no abre una conexión y no crea usuarios/tablas: el cliente
 * transaccional devuelve filas guionizadas. La configuración staging se aplica
 * sólo en process.env durante la prueba para recorrer el verificador real.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TrustedImpersonationContext } from '../lib/impersonation-context'

const root = resolve(import.meta.dirname, '..')
const future = (now: number, offset = 60_000) => ({ id: 'live-session', expiresAt: new Date(now + offset) })

type ScriptedTx = {
  queries: unknown[]
  rows: Array<Array<{ id: string; expiresAt: Date }> | Error>
  $queryRaw: <T>(query: unknown) => Promise<T>
}

function fakeTx(rows: Array<Array<{ id: string; expiresAt: Date }> | Error>): ScriptedTx {
  const queries: unknown[] = []
  return {
    queries,
    rows: [...rows],
    async $queryRaw<T>(query: unknown): Promise<T> {
      queries.push(query)
      const next = this.rows.shift() ?? []
      if (next instanceof Error) throw next
      return next as T
    },
  }
}

function contextFor(overrides: Partial<TrustedImpersonationContext> = {}): TrustedImpersonationContext {
  return {
    v: 'v1',
    sessionId: '11111111-1111-4111-8111-111111111111',
    actorId: 101,
    targetId: 202,
    reason: 'Fixture local strict transaction cache.',
    method: 'POST',
    path: '/api/admin/finanzas/conciliar',
    action: 'confirmar',
    ip: null,
    ipSource: 'untrusted_proxy',
    ...overrides,
  }
}

async function withCacheEnvironment<T>(callback: () => Promise<T>): Promise<T> {
  const names = ['FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'DATABASE_URL', 'IMPERSONATION_ALLOWED_ACTOR_IDS', 'IMPERSONATION_PRODUCTION_ENABLED'] as const
  const before = new Map(names.map(name => [name, process.env[name]]))
  process.env.FINANCE_STAGING_SANDBOX = '1'
  process.env.VERCEL_ENV = 'preview'
  process.env.DATABASE_URL = 'postgresql://io_staging_finanzas:fixture@127.0.0.1:1/io_staging_finanzas'
  process.env.IMPERSONATION_ALLOWED_ACTOR_IDS = '101,102'
  try {
    return await callback()
  } finally {
    for (const name of names) {
      const value = before.get(name)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

async function withProductionLikeEnvironment<T>(callback: () => Promise<T>): Promise<T> {
  const names = ['FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'DATABASE_URL', 'IMPERSONATION_ALLOWED_ACTOR_IDS', 'IMPERSONATION_PRODUCTION_ENABLED'] as const
  const before = new Map(names.map(name => [name, process.env[name]]))
  delete process.env.FINANCE_STAGING_SANDBOX
  process.env.VERCEL_ENV = 'production'
  process.env.DATABASE_URL = 'postgresql://postgres:fixture@yamanote.proxy.rlwy.net:34880/railway'
  process.env.IMPERSONATION_ALLOWED_ACTOR_IDS = '101'
  process.env.IMPERSONATION_PRODUCTION_ENABLED = '1'
  try {
    return await callback()
  } finally {
    for (const name of names) {
      const value = before.get(name)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

async function main(): Promise<void> {
  // Dynamic import occurs only after process startup. The script never invokes
  // $connect/$transaction and fake clients satisfy every verifier query.
  const {
    default: prisma,
    runWithImpersonationMutationAuditScope: auditScope,
    runWithConciliarSerializableAuthorization,
    hasConciliarSerializableAuthorizationForActor,
    verifyLiveImpersonationContext,
  } = await import('../lib/prisma')
  const runWithLegacyConciliarScope = <T>(tx: never, callback: () => T | Promise<T>) => auditScope(tx, () => runWithConciliarSerializableAuthorization(tx, callback))
  const runWithVerifiedConciliarScope = <T>(tx: never, actorId: number, callback: () => T | Promise<T>) => auditScope(tx, () => runWithConciliarSerializableAuthorization(tx, callback, actorId))
  const source = readFileSync(resolve(root, 'lib/prisma.ts'), 'utf8')
  assert.match(source, /FOR SHARE OF s,actor,target/, 'La verificación inicial debe bloquear sesión, actor y destino contra revocaciones concurrentes.')
  assert.match(source, /JOIN usuarios_admin actor[\s\S]*JOIN usuarios_admin target/, 'La consulta bloqueante debe volver a leer ambos administradores.')
  assert.match(source, /actor\.activo=true[\s\S]*actor\.rol::text='SUPER_ADMIN'[\s\S]*target\.activo=true/, 'La matriz viva de actor/destino debe permanecer en SQL.')
  assert.doesNotMatch(source, /WeakMap|global.*liveContextCache/i, 'No se permite caché global de permisos o decisiones vivas.')

  const realNow = Date.now
  let now = 1_790_000_000_000
  Date.now = () => now
  try {
    await withCacheEnvironment(async () => {
      const unmarked = fakeTx([[future(now)], [future(now)]])
      assert.equal(hasConciliarSerializableAuthorizationForActor(unmarked as never, 101), false, 'La capacidad no existe fuera del callback exacto.')
      await runWithLegacyConciliarScope(unmarked as never, async () => {
        assert.equal(hasConciliarSerializableAuthorizationForActor(unmarked as never, 101), false, 'El llamador legado sin actor verificado no recibe marcador.')
        assert.equal(await verifyLiveImpersonationContext(contextFor(), unmarked as never), true)
        assert.equal(await verifyLiveImpersonationContext(contextFor(), unmarked as never), true)
      })
      assert.equal(unmarked.queries.length, 2, 'Una transacción ordinaria/legada sin marcador de Conciliar mantiene todas las comprobaciones por sentencia.')

      const marked = fakeTx([])
      const otherTx = fakeTx([])
      await runWithVerifiedConciliarScope(marked as never, 101, async () => {
        assert.equal(hasConciliarSerializableAuthorizationForActor(marked as never, 101), true, 'Sólo el actor validado en la misma transacción obtiene el marcador.')
        assert.equal(hasConciliarSerializableAuthorizationForActor(marked as never, 102), false, 'Un actor distinto no puede reutilizar el marcador.')
        assert.equal(hasConciliarSerializableAuthorizationForActor(otherTx as never, 101), false, 'Otra transacción no puede reutilizar el marcador.')
        await runWithLegacyConciliarScope(marked as never, async () => {
          assert.equal(hasConciliarSerializableAuthorizationForActor(marked as never, 101), false, 'Un llamador legado anidado no hereda el marcador exterior.')
        })
        assert.equal(hasConciliarSerializableAuthorizationForActor(marked as never, 101), true, 'Al volver al callback validado se restaura sólo su propio marcador.')
      })
      assert.equal(hasConciliarSerializableAuthorizationForActor(marked as never, 101), false, 'El marcador se restaura al salir del callback.')

      const failedScope = fakeTx([])
      await assert.rejects(
        runWithVerifiedConciliarScope(failedScope as never, 101, async () => {
          assert.equal(hasConciliarSerializableAuthorizationForActor(failedScope as never, 101), true)
          throw new Error('fixture rollback')
        }),
        /fixture rollback/,
      )
      assert.equal(hasConciliarSerializableAuthorizationForActor(failedScope as never, 101), false, 'Una excepción limpia el marcador antes del reintento.')
      const retryScope = fakeTx([])
      await runWithVerifiedConciliarScope(retryScope as never, 101, async () => {
        assert.equal(hasConciliarSerializableAuthorizationForActor(retryScope as never, 101), true, 'Un reintento sólo obtiene su propio marcador de callback.')
        assert.equal(hasConciliarSerializableAuthorizationForActor(failedScope as never, 101), false)
      })

      const realActorOnly = fakeTx([[future(now)], [future(now)]])
      await runWithVerifiedConciliarScope(realActorOnly as never, 101, async () => {
        assert.equal(await verifyLiveImpersonationContext(contextFor(), realActorOnly as never), true)
        assert.equal(await verifyLiveImpersonationContext(contextFor(), realActorOnly as never), true)
      })
      assert.equal(realActorOnly.queries.length, 2, 'El permiso del actor real no sustituye la comprobación del usuario efectivo; un marcador de actor real no activa caché.')

      const reusable = fakeTx(Array.from({ length: 9 }, () => [future(now)]))
      await runWithVerifiedConciliarScope(reusable as never, 202, async () => {
        const base = contextFor()
        assert.equal(await verifyLiveImpersonationContext(base, reusable as never), true)
        assert.equal(reusable.queries.length, 1)

        // Runtime flags/actor whitelist are re-evaluated even on a hit.
        process.env.IMPERSONATION_ALLOWED_ACTOR_IDS = '999'
        assert.equal(await verifyLiveImpersonationContext(base, reusable as never), false, 'Un actor retirado de la whitelist no puede usar la decisión cacheada.')
        assert.equal(reusable.queries.length, 1, 'La denegación de runtime no llega al SQL ni reutiliza autoridad.')
        process.env.IMPERSONATION_ALLOWED_ACTOR_IDS = '101,102'
        assert.equal(await verifyLiveImpersonationContext(base, reusable as never), true)
        assert.equal(reusable.queries.length, 1)

        // Todos los campos firmados críticos componen la clave interna exacta.
        assert.equal(await verifyLiveImpersonationContext(contextFor({ actorId: 102 }), reusable as never), true)
        assert.equal(await verifyLiveImpersonationContext(contextFor({ targetId: 203 }), reusable as never), true)
        assert.equal(await verifyLiveImpersonationContext(contextFor({ sessionId: '22222222-2222-4222-8222-222222222222' }), reusable as never), true)
        assert.equal(await verifyLiveImpersonationContext(contextFor({ action: 'deshacer' }), reusable as never), true)
        assert.equal(reusable.queries.length, 5, 'Actor, destino, sesión y acción distintos no comparten una entrada.')

        // Las variantes de ruta/método siguen la política, pero nunca entran en
        // el caché de confirmar/deshacer de Conciliar.
        const otherPath = contextFor({ path: '/api/admin/finanzas/modo-facil/terceros' })
        assert.equal(await verifyLiveImpersonationContext(otherPath, reusable as never), true)
        assert.equal(await verifyLiveImpersonationContext(otherPath, reusable as never), true)
        const otherMethod = contextFor({ method: 'GET' })
        assert.equal(await verifyLiveImpersonationContext(otherMethod, reusable as never), true)
        assert.equal(await verifyLiveImpersonationContext(otherMethod, reusable as never), true)
        assert.equal(reusable.queries.length, 9, 'Ruta o método distinto conservan exactamente el comportamiento sin caché.')
      })
      assert.equal(reusable.queries.length, 9)

      // Expiración: cada sentencia vuelve a comparar Date.now con expires_at.
      const expiring = fakeTx([[future(now, 5)], [future(now, 60_000)]])
      await runWithVerifiedConciliarScope(expiring as never, 202, async () => {
        const base = contextFor()
        assert.equal(await verifyLiveImpersonationContext(base, expiring as never), true)
        now += 6
        assert.equal(await verifyLiveImpersonationContext(base, expiring as never), true)
      })
      assert.equal(expiring.queries.length, 2, 'Una entrada vencida se borra antes de la siguiente sentencia y fuerza relectura bloqueante.')

      // Ningún falso/throw se memoriza; la relectura posterior puede decidir de nuevo.
      const initiallyDenied = fakeTx([[], [future(now)]])
      await runWithVerifiedConciliarScope(initiallyDenied as never, 202, async () => {
        const base = contextFor()
        assert.equal(await verifyLiveImpersonationContext(base, initiallyDenied as never), false, 'Revocada antes de la primera mutación se deniega.')
        assert.equal(await verifyLiveImpersonationContext(base, initiallyDenied as never), true)
      })
      assert.equal(initiallyDenied.queries.length, 2, 'Una denegación no se guarda como permiso ni como denegación cacheada.')

      const queryFailure = fakeTx([new Error('fixture live query failure'), [future(now)]])
      await runWithVerifiedConciliarScope(queryFailure as never, 202, async () => {
        const base = contextFor()
        assert.equal(await verifyLiveImpersonationContext(base, queryFailure as never), false, 'Un fallo de lectura viva cierra la mutación.')
        assert.equal(await verifyLiveImpersonationContext(base, queryFailure as never), true)
      })
      assert.equal(queryFailure.queries.length, 2, 'Un error de consulta no se cachea; la siguiente sentencia debe revalidar.')

      // Un P2034/reintento crea un callback/scope nuevo, incluso con el mismo contexto.
      const retryOne = fakeTx([[future(now)]])
      const retryTwo = fakeTx([[future(now)]])
      await runWithVerifiedConciliarScope(retryOne as never, 202, async () => {
        assert.equal(await verifyLiveImpersonationContext(contextFor(), retryOne as never), true)
      })
      await runWithVerifiedConciliarScope(retryTwo as never, 202, async () => {
        assert.equal(await verifyLiveImpersonationContext(contextFor(), retryTwo as never), true)
      })
      assert.deepEqual([retryOne.queries.length, retryTwo.queries.length], [1, 1], 'Un reintento serializable no hereda la decisión ni el scope del intento anterior.')
    })

    await withProductionLikeEnvironment(async () => {
      const production = fakeTx([[future(now)], [future(now)]])
      await runWithVerifiedConciliarScope(production as never, 202, async () => {
        assert.equal(await verifyLiveImpersonationContext(contextFor(), production as never), true)
        assert.equal(await verifyLiveImpersonationContext(contextFor(), production as never), true)
      })
      assert.equal(production.queries.length, 2, 'Sin los opt-ins completos de Conciliar, producción conserva la verificación SQL por sentencia.')

      const names = ['FINANCE_EASY_PRODUCTION_ENABLED', 'FINANCE_MODEL_PRODUCTION_ENABLED', 'FINANCE_AUTOMATIC_LINKS_DISABLED', 'FINANCE_CONCILIAR_PRODUCTION_ENABLED', 'NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED', 'IO_PRODUCTION_READ_ONLY'] as const
      const previous = new Map(names.map(name => [name, process.env[name]]))
      for (const name of names) process.env[name] = name === 'IO_PRODUCTION_READ_ONLY' ? '0' : '1'
      try {
        const enabled = fakeTx([[future(now, 5)], [future(now)], [future(now)]])
        await runWithVerifiedConciliarScope(enabled as never, 202, async () => {
          const base = contextFor()
          assert.equal(await verifyLiveImpersonationContext(base, enabled as never), true)
          assert.equal(await verifyLiveImpersonationContext(base, enabled as never), true)
          assert.equal(enabled.queries.length, 1, 'Con runtime productivo explícito, misma sesión y misma transacción reutilizan el bloqueo vivo.')
          now += 6
          assert.equal(await verifyLiveImpersonationContext(base, enabled as never), true)
          assert.equal(enabled.queries.length, 2, 'La caducidad vuelve a verificarse en producción por sentencia, no sólo al comenzar el lote.')
          process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED = '0'
          assert.equal(await verifyLiveImpersonationContext(base, enabled as never), true)
          assert.equal(enabled.queries.length, 3, 'Retirar un opt-in desactiva la caché inmediatamente y restaura la consulta conservadora.')
          process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED = '1'
        })
        const fresh = fakeTx([[future(now)]])
        await runWithVerifiedConciliarScope(fresh as never, 202, async () => {
          assert.equal(await verifyLiveImpersonationContext(contextFor(), fresh as never), true)
        })
        assert.equal(fresh.queries.length, 1, 'La siguiente transacción productiva no hereda la comprobación del lote anterior.')
      } finally {
        for (const name of names) {
          const value = previous.get(name)
          if (value === undefined) delete process.env[name]
          else process.env[name] = value
        }
      }
    })
  } finally {
    Date.now = realNow
    await prisma.$disconnect()
  }

  console.log(JSON.stringify({
    passed: true,
    databaseOperations: 0,
    noCredentialsLoaded: true,
    exactContextCacheKey: true,
    runtimeWhitelistCheckedOnHit: true,
    expiryCheckedEveryStatement: true,
    failedVerificationNotCached: true,
    retryGetsFreshTransactionScope: true,
    productionWithoutOptInsHasNoCache: true,
    productionExplicitRuntimeUsesTransactionScopedCache: true,
    requiresExplicitConciliarTransactionMarker: true,
    markerBindsExactTransactionAndActor: true,
    effectiveTargetDistinctFromRealActor: true,
    markerClearsAfterExceptionAndRetry: true,
    legacyCallerRetainsAllChecks: true,
    lockSqlCoversSessionActorTarget: true,
  }))
}

main().catch(error => {
  console.error(`CONCILIAR_LIVE_TX_CACHE_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}`)
  process.exitCode = 1
})
