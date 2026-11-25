import { NextResponse } from 'next/server'
import { getServerSession, type Session } from 'next-auth'
import type { PrismaClient } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import {
  configuredArea4OwnerId,
  evaluateArea4Capability,
  type Area4Capability,
  type Area4Grant,
  type Area4Principal,
  isArea4Owner,
  isArea4MissingAdoptionColumn,
} from './policy'
import { area4CodeIsBaseline, area4RegisteredSurface } from './section-registry'

export type Area4Database = Pick<PrismaClient, 'usuarioAdmin' | 'permisoArea' | 'permisoUsuario'> & Partial<Pick<PrismaClient, 'auditoriaPermisosArea4'>>

export type Area4Authorized = Readonly<{
  ok: true
  principal: Area4Principal
  session: Session
}>

export type Area4Denied = Readonly<{
  ok: false
  response: NextResponse
}>

export type Area4Authorization = Area4Authorized | Area4Denied

function unauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}

function forbidden() {
  return NextResponse.json({ error: 'No tienes permiso para esta acción' }, { status: 403 })
}

export function normalizeArea4Grants(rows: readonly Readonly<{
  area: Readonly<{ codigo: string }>
  lectura: boolean
  escritura: boolean
  confirmar: boolean
  exportar: boolean
}>[]): Area4Grant[] {
  return rows.map(({ area, lectura, escritura, confirmar, exportar }) => ({
    codigo: area.codigo,
    lectura,
    escritura,
    confirmar,
    exportar,
  }))
}

export async function resolveLiveAdminPrincipal(
  database: Area4Database,
  userId: number,
): Promise<Area4Principal | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null
  const user = await database.usuarioAdmin.findUnique({
    where: { id: userId },
    select: { id: true, activo: true, rol: true, roles: true },
  })
  if (!user?.activo) return null
  return user
}

export async function readLiveArea4Adoption(database: Area4Database, userId: number): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return false
  try {
    const marker = await database.usuarioAdmin.findUnique({ where: { id: userId }, select: { permisosArea4Vivos: true } })
    return marker?.permisosArea4Vivos === true
  } catch (error) {
    if (isArea4MissingAdoptionColumn(error)) return false
    throw error
  }
}

async function sessionPrincipal(database: Area4Database): Promise<{ principal: Area4Principal; session: Session } | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') return null
  const principal = await resolveLiveAdminPrincipal(database, Number(session.user.id))
  return principal ? { principal, session } : null
}

/** Solo acredita una sesión administrativa viva; no concede ninguna área. */
export async function requireLiveArea4Admin(database: Area4Database): Promise<Area4Authorization> {
  const resolved = await sessionPrincipal(database)
  return resolved ? { ok: true, ...resolved } : { ok: false, response: unauthorized() }
}

export async function requireArea4Owner(database: Area4Database): Promise<Area4Authorization> {
  const resolved = await sessionPrincipal(database)
  if (!resolved) return { ok: false, response: unauthorized() }
  if (resolved.session?.impersonation || !isArea4Owner(resolved.principal)) return { ok: false, response: forbidden() }
  return { ok: true, ...resolved }
}

export async function requireArea4Capability(
  database: Area4Database,
  codigoArea: string,
  capability: Area4Capability,
  surfacePath?: string,
): Promise<Area4Authorization> {
  const resolved = await sessionPrincipal(database)
  if (!resolved) return { ok: false, response: unauthorized() }

  const isImpersonating = Boolean(resolved.session?.impersonation)
  const match = surfacePath ? area4RegisteredSurface(surfacePath, surfacePath.startsWith('/api/') ? 'api' : 'page') : null
  if (surfacePath && (!match || match.section.areaCode !== codigoArea)) return { ok: false, response: forbidden() }
  if (!isImpersonating && isArea4Owner(resolved.principal)) return { ok: true, ...resolved }
  if (!area4CodeIsBaseline(codigoArea) && !match) return { ok: false, response: forbidden() }

  if (match && !match.baseline) {
    if (!database.auditoriaPermisosArea4 || resolved.principal.rol === 'SUPER_ADMIN') return { ok: false, response: forbidden() }
    const access = await import('./surface-access')
    const user = await access.readArea4SurfaceAccessUser(database, resolved.principal.id)
    if (!user?.permisosArea4Vivos) return { ok: false, response: forbidden() }
    const consent = await access.validateArea4NewSurfaceConsent(database as import('./users-proposals').Area4ConsentDatabase,
      user, match, capability, configuredArea4OwnerId())
    const allowed = consent && evaluateArea4Capability({ principal: user, grants: user.grants, codigoArea, capability,
      isImpersonating, permissionsAdopted: true, newSurfaceConsent: consent, requireExactGrant: true })
    return allowed ? { ok: true, ...resolved } : { ok: false, response: forbidden() }
  }

  const targetArea = await database.permisoArea.findUnique({
    where: { codigo: codigoArea }, select: { activo: true },
  })
  if (!targetArea?.activo) return { ok: false, response: forbidden() }

  const parts = codigoArea.split('.').filter(Boolean)
  const inheritedCodes = parts.map((_, index) => parts.slice(0, index + 1).join('.'))
  const grantRows = await database.permisoUsuario.findMany({
    where: { usuarioId: resolved.principal.id, area: { activo: true, codigo: { in: inheritedCodes } } },
    select: {
      lectura: true,
      escritura: true,
      confirmar: true,
      exportar: true,
      area: { select: { codigo: true } },
    },
  })
  const grants = normalizeArea4Grants(grantRows)

  const allowed = evaluateArea4Capability({
    principal: resolved.principal,
    grants,
    codigoArea,
    capability,
    ownerId: configuredArea4OwnerId(),
    permissionsAdopted: await readLiveArea4Adoption(database, resolved.principal.id),
    isImpersonating,
  })
  return allowed ? { ok: true, ...resolved } : { ok: false, response: forbidden() }
}
