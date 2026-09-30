import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

/** Respuesta de error o null si puede leer el área. No confía en el modo visor del cliente. */
export async function checkAdminAreaRead(
  codigoArea: string,
  legacyRoles: string[] = [],
  existingSession?: Session | null,
  required: 'lectura' | 'escritura' = 'lectura'
): Promise<NextResponse | null> {
  const session = existingSession === undefined ? await getServerSession(authOptions) : existingSession
  if (!session?.user || session.user.userType !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const userId = Number(session.user.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const permission = await verificarPermisoServer(userId, codigoArea, session.user.role)
  if (permission[required]) return null

  const granularPermissions = await prisma.permisoUsuario.count({
    where: { usuarioId: userId, OR: [{ lectura: true }, { escritura: true }] },
  })
  if (granularPermissions === 0) {
    const roles = [session.user.role, ...(session.user.roles || [])]
    if (roles.some(role => legacyRoles.includes(role))) return null
  }
  return NextResponse.json({ error: `Sin permiso de ${required}` }, { status: 403 })
}

export async function checkAdminAreaWrite(
  codigoArea: string,
  legacyRoles: string[] = [],
  existingSession?: Session | null
): Promise<NextResponse | null> {
  return checkAdminAreaRead(codigoArea, legacyRoles, existingSession, 'escritura')
}
