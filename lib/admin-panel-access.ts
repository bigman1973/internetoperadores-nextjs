import { configuredArea4OwnerId } from './area4/policy'

interface PanelUser {
  id?: string | number
  role?: string
  roles?: string[]
  userType?: string
}

// Misma puerta de entrada del layout admin. No sustituye permisos por sección.
export async function canAccessAdminPanel(
  user: PanelUser,
  countReadablePermissions: (usuarioId: number) => Promise<number>,
): Promise<boolean> {
  if (user.userType !== 'admin') return false
  const usuarioId = Number(user.id)
  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) return false
  if (user.role === 'SUPER_ADMIN') return usuarioId === configuredArea4OwnerId()
  if (user.role === 'GERENTE') return true
  // Compatibility with real business roles, never a secondary SUPER_ADMIN.
  const legacy = new Set(['MARKETING', 'VENTAS', 'CONTABILIDAD', 'RRHH'])
  if ([user.role, ...(user.roles || [])].some(role => legacy.has(role || ''))) return true
  return (await countReadablePermissions(usuarioId)) > 0
}
