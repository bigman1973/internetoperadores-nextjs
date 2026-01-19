import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function requireAuth(userType?: 'admin' | 'cliente') {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (userType && session.user.userType !== userType) {
    redirect('/login')
  }

  return session
}

export async function requireAdminRole(allowedRoles: string[]) {
  const session = await requireAuth('admin')

  if (!session.user.role || !allowedRoles.includes(session.user.role)) {
    redirect('/admin')
  }

  return session
}

export function hasPermission(userRole: string, requiredRoles: string[]): boolean {
  return requiredRoles.includes(userRole)
}

// Jerarquía de roles (de mayor a menor privilegio)
const roleHierarchy = {
  SUPER_ADMIN: 5,
  GERENTE: 4,
  FINANCIERO: 3,
  EDITOR: 2,
  VISOR: 1,
}

export function hasMinimumRole(userRole: string, minimumRole: string): boolean {
  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0
  const minimumLevel = roleHierarchy[minimumRole as keyof typeof roleHierarchy] || 0
  return userLevel >= minimumLevel
}
