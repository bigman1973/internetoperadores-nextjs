import type { PrismaClient } from '@prisma/client'
import { AREA4_ACTIONS, area4RegistrySurfaceMatches } from './section-registry'
import { configuredArea4OwnerId, isArea4MissingAdoptionColumn, isArea4Owner } from './policy'
import { loadArea4SectionAssignmentState } from './section-assignments'
import { readArea4SurfaceAccessUser as readConfirmedSurfaceUser, validateArea4NewSurfaceConsent, type Area4ConsentLiveUser, type Area4ConsentDatabase } from './users-proposals'
import type { Area4SurfacePermissionSeed } from './surface-access-contract'

export { validateArea4NewSurfaceConsent } from './users-proposals'

/** All grants are needed to validate the COMPLETE personal adoption; no name, email or secret. */
export async function readArea4SurfaceAccessUser(
  db: Pick<PrismaClient, 'usuarioAdmin'>, userId: number,
): Promise<Area4ConsentLiveUser | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null
  try {
    const user = await readConfirmedSurfaceUser(db, userId)
    return user?.activo ? user : null
  } catch (error) {
    if (isArea4MissingAdoptionColumn(error)) return null // A missing adoption column NEVER opens a new surface.
    throw error
  }
}

/** Existing registry = no additional SQL. New-only snapshot is bounded and fails closed. */
export async function readArea4SurfacePermissionSeed(
  db: Area4ConsentDatabase, userId: number,
): Promise<Area4SurfacePermissionSeed[]> {
  const matches = area4RegistrySurfaceMatches().filter(match => !match.baseline)
  if (!matches.length) return []
  const user = await readArea4SurfaceAccessUser(db, userId)
  if (!user || isArea4Owner(user) || !user.permisosArea4Vivos) return []
  const ownerId = configuredArea4OwnerId()
  const state = await loadArea4SectionAssignmentState(db, ownerId)
  if (!state.available) return []
  const result: Area4SurfacePermissionSeed[] = []
  // Only new surfaces with a live exact grant can need audit verification.
  for (const match of matches) {
    const actions: string[] = []
    for (const action of AREA4_ACTIONS) {
      if (!user.grants.some(g => g.codigo === match.section.areaCode && g.lectura && g[action.capability])) continue
      if (await validateArea4NewSurfaceConsent(db, user, match, action.capability, ownerId, state)) actions.push(action.letter)
    }
    if (actions.includes('V')) result.push({ id: match.id, descriptor: match.descriptor, actions: actions.join('') })
  }
  return result
}

export async function readArea4SurfacePermissionSeedWithFallback(
  db: Area4ConsentDatabase, userId: number,
): Promise<Area4SurfacePermissionSeed[]> {
  try { return await readArea4SurfacePermissionSeed(db, userId) }
  catch { return [] } // Presentation failure cannot create authority.
}
