import { AREA4_ACTIONS, area4RegisteredSurface, area4RegistrySurfaceMatches } from './section-registry'
import type { Area4Capability } from './policy'

/** Presentation snapshot for one effective actor and one response, NEVER API authority. */
export type Area4SurfacePermissionSeed = Readonly<{ id: string; descriptor: string; actions: string }>

export function area4SurfaceSeedAllows(
  seeds: readonly Area4SurfacePermissionSeed[], path: string, capability: Area4Capability = 'lectura', kind: 'page' | 'api' = 'page',
): boolean {
  const match = area4RegisteredSurface(path.split('?')[0], kind)
  if (!match) return false
  if (match.baseline) return true
  const action = AREA4_ACTIONS.find(a => a.capability === capability)?.letter
  return Boolean(action && seeds.some(s => s.id === match.id && s.descriptor === match.descriptor && s.actions.includes(action)))
}

export function area4CodeSeedAllows(
  seeds: readonly Area4SurfacePermissionSeed[], code: string, capability: Area4Capability = 'lectura',
): boolean {
  const action = AREA4_ACTIONS.find(a => a.capability === capability)?.letter
  if (!action) return false
  return area4RegistrySurfaceMatches().some(match => !match.baseline && match.section.areaCode === code
    && seeds.some(s => s.id === match.id && s.descriptor === match.descriptor && s.actions.includes(action)))
}

/** A consent change must invalidate SSR navigation even when ACL rows are identical. */
export function area4SurfacePermissionSignature(seeds: readonly Area4SurfacePermissionSeed[]): string {
  return seeds.map(s => JSON.stringify([s.id, s.descriptor, s.actions])).sort().join('|')
}
