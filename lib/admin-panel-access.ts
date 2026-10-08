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
  if (user.role === 'SUPER_ADMIN' || user.role === 'GERENTE' || (user.roles || []).length > 0) return true
  const usuarioId = Number(user.id)
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) return false
  return (await countReadablePermissions(usuarioId)) > 0
}
