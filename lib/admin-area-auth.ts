import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware/auth'
import { verificarPermisoServer } from '@/lib/permisos'

/**
 * Autoriza datos sensibles en páginas server-side.
 * Si el usuario tiene permisos granulares, estos son la única fuente de acceso.
 * Sin permisos granulares, conserva la compatibilidad con los roles legacy indicados.
 */
export async function requireAdminAreaRead(codigoArea: string, legacyRoles: string[] = []) {
  const session = await requireAuth('admin')
  const userId = Number(session.user.id)
  if (!Number.isInteger(userId)) redirect('/admin')

  const permission = await verificarPermisoServer(userId, codigoArea, session.user.role)
  if (permission.lectura) return session

  const granularPermissions = await prisma.permisoUsuario.count({
    where: {
      usuarioId: userId,
      OR: [{ lectura: true }, { escritura: true }],
    },
  })
  if (granularPermissions > 0) redirect('/admin')

  const roles = new Set([session.user.role, ...(session.user.roles || [])].filter(Boolean))
  if (legacyRoles.some((role) => roles.has(role))) return session

  redirect('/admin')
}
