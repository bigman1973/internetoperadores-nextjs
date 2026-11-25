import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/middleware/auth'
import { verificarPermisoServer } from '@/lib/permisos'
import { isArea4MissingAdoptionColumn } from '@/lib/area4/policy'

/**
 * Autoriza datos sensibles en páginas server-side.
 * Si el usuario tiene permisos granulares, estos son la única fuente de acceso.
 * Sin permisos granulares, conserva la compatibilidad con los roles legacy indicados.
 */
export async function requireAdminAreaRead(codigoArea: string, legacyRoles: string[] = []) {
  const session = await requireAuth('admin')
  const userId = Number(session.user.id)
  if (!Number.isInteger(userId)) redirect('/admin')

  const principal = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!principal?.activo) redirect('/login')
  const permission = await verificarPermisoServer(userId, codigoArea)
  if (permission.lectura) return session

  const granularPermissions = await prisma.permisoUsuario.count({
    where: {
      usuarioId: userId,
      OR: [{ lectura: true }, { escritura: true }],
    },
  })
  if (granularPermissions > 0) redirect('/admin')

  // Once adopted, zero grants cannot resurrect a legacy role fallback.
  try {
    const marker = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { permisosArea4Vivos: true } })
    if (marker?.permisosArea4Vivos) redirect('/admin')
  } catch (error) {
    if (!isArea4MissingAdoptionColumn(error)) throw error
  }
  const roles = new Set([principal.rol, ...(principal.roles || [])].filter(Boolean))
  if (legacyRoles.some((role) => roles.has(role))) return session

  redirect('/admin')
}
