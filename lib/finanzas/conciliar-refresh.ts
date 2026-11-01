/** Compatibility-only hook for callers outside this urgent release. The current
 * production schema has no durable affected-source queue. Do not infer scope,
 * schedule after(), rebuild implicitly or clear a pre-existing dirty marker. */
export async function refreshConciliarProjectionIfDirty(_actorId: number | null) {
  return { rebuilt: false, projectionSynchronized: false, reason: 'MANUAL_REBUILD_REQUIRED' as const }
}
export function scheduleConciliarProjectionRefresh(_actorId: number | null): void {
  // Intentionally non-operative. A complete rebuild remains an explicit action.
}
