import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { PrismaClient } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import {
  configuredArea4OwnerId,
  evaluateArea4Capability,
  type Area4Capability,
  type Area4Grant,
  type Area4Principal,
  isArea4Owner,
} from './policy'

export type Area4Database = Pick<PrismaClient, 'usuarioAdmin' | 'permisoArea' | 'permisoUsuario'>

export type Area4Authorized = Readonly<{
  ok: true
  principal: Area4Principal
  session: Awaited<ReturnType<typeof getServerSession>>
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

async function sessionPrincipal(database: Area4Database): Promise<{ principal: Area4Principal; session: Awaited<ReturnType<typeof getServerSession>> } | null> {
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
  if (!isArea4Owner(resolved.principal)) return { ok: false, response: forbidden() }
  return { ok: true, ...resolved }
}

export async function requireArea4Capability(
  database: Area4Database,
  codigoArea: string,
  capability: Area4Capability,
): Promise<Area4Authorization> {
  const resolved = await sessionPrincipal(database)
  if (!resolved) return { ok: false, response: unauthorized() }

  if (isArea4Owner(resolved.principal)) return { ok: true, ...resolved }

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
  })
  return allowed ? { ok: true, ...resolved } : { ok: false, response: forbidden() }
}
