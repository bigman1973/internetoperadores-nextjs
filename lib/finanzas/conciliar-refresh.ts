import { after } from 'next/server'
import { refreshAffectedConciliarProjection } from './conciliar-affected-refresh'

/** Action-owned finite refresh. Durable IDs scope the derived writes; the current
 * rebuild still reads the full source population. It never calls a provider. */
export async function refreshConciliarProjectionIfDirty(actorId: number | null) {
  const result = await refreshAffectedConciliarProjection(actorId)
  return { rebuilt: result.projectionSynchronized, ...result }
}
/** Only the already-authorized Conciliar action route may schedule this work.
 * Other legacy call sites retain the inert compatibility export below: no
 * importer, sync or watcher can acquire an after()-driven financial refresh. */
export function scheduleConciliarActionProjectionRefresh(actorId: number | null) {
  after(async () => {
    const refreshStartedAt = Date.now()
    const phase = (name: 'refresh-start' | 'refresh-end') => { if (process.env.FINANCE_STAGING_SANDBOX === '1') console.info('CONCILIAR_REFRESH_PHASE', name, JSON.stringify({ elapsedMs: Date.now() - refreshStartedAt })) }
    phase('refresh-start')
    try {
      const result = await refreshConciliarProjectionIfDirty(actorId)
      if (!result.projectionSynchronized) console.warn('CONCILIAR_REFRESH_PENDING')
    }
    catch { console.warn('CONCILIAR_REFRESH_PENDING') }
    finally { phase('refresh-end') }
  })
}

/** Compatibility for pre-existing non-action hooks. Deliberately inert. */
export function scheduleConciliarProjectionRefresh(_actorId: number | null): void {}
