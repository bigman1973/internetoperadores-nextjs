import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertConciliarRuntime } from './conciliar-runtime'

type Tx = Prisma.TransactionClient & Record<string, any>

/**
 * Production v1 has only the persisted dirty marker. Without the later durable
 * affected-source queue, a consumer cannot prove a closed financial scope, so it
 * must not rebuild, clear dirty, or claim synchronization. The manual full
 * rebuild remains the sole operation that clears a dirty projection.
 */
export async function refreshAffectedConciliarProjectionTx(base: Prisma.TransactionClient, _actorId: number | null) {
  const tx = base as Tx
  const state = await tx.$queryRaw<Array<{ ready: boolean; dirty: boolean }>>(Prisma.sql`
    SELECT rebuilt_at IS NOT NULL AS ready,dirty_at IS NOT NULL AS dirty
    FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1 FOR UPDATE
  `)
  if (state.length !== 1 || !state[0].ready) {
    return { projectionSynchronized: false, reason: 'INITIAL_MANUAL_REBUILD_REQUIRED' as const }
  }
  if (state[0].dirty) {
    return { projectionSynchronized: false, reason: 'MANUAL_REBUILD_REQUIRED' as const }
  }
  return { projectionSynchronized: true as const }
}

/** Existing finite hook: it verifies the production marker only. It never
 * imports, calls a provider, infers a scope, or starts a full rebuild. */
export async function refreshAffectedConciliarProjection(actorId: number | null) {
  return (prisma as PrismaClient).$transaction(async base => {
    await assertConciliarRuntime(base)
    return refreshAffectedConciliarProjectionTx(base, actorId)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
}
