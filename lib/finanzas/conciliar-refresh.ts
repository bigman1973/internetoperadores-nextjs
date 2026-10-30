import { after } from 'next/server'
import { refreshAffectedConciliarProjection } from './conciliar-affected-refresh'

/** Existing finite import hook. It reads only affected durable IDs, never calls
 * an importer/provider or creates an onboarding/full rebuild. */
export async function refreshConciliarProjectionIfDirty(actorId: number | null) {
  const result = await refreshAffectedConciliarProjection(actorId)
  return { rebuilt: result.projectionSynchronized, ...result }
}
export function scheduleConciliarProjectionRefresh(actorId: number | null) {
  after(async () => {
    try { await refreshConciliarProjectionIfDirty(actorId) }
    catch { console.warn('CONCILIAR_REFRESH_PENDING') }
  })
}
