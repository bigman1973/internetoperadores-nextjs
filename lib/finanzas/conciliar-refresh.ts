import { after } from 'next/server'
import { refreshAffectedConciliarProjection } from './conciliar-affected-refresh'

/** Action-owned finite refresh. It reads only affected durable IDs, never calls
 * an importer/provider or creates an onboarding/full rebuild. */
export async function refreshConciliarProjectionIfDirty(actorId: number | null) {
  const result = await refreshAffectedConciliarProjection(actorId)
  return { rebuilt: result.projectionSynchronized, ...result }
}
/** Only the already-authorized Conciliar action route may schedule this work.
 * Other legacy call sites retain the inert compatibility export below: no
 * importer, sync or watcher can acquire an after()-driven financial refresh. */
export function scheduleConciliarActionProjectionRefresh(actorId: number | null) {
  after(async () => {
    try { await refreshConciliarProjectionIfDirty(actorId) }
    catch { console.warn('CONCILIAR_REFRESH_PENDING') }
  })
}

/** Compatibility for pre-existing non-action hooks. Deliberately inert. */
export function scheduleConciliarProjectionRefresh(_actorId: number | null): void {}
