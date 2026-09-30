import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { verificarPermisoServer } from '@/lib/permisos'
import prisma from '@/lib/prisma'

type CrmCompanyUser = { id: number; name: string; role?: string }

export async function authorizeCrmEmpresas(write = false) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.userType !== 'admin') return { status: 401 as const, user: null }
  const userId = Number(session.user.id)
  if (!Number.isInteger(userId)) return { status: 401 as const, user: null }
  const account = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true, rol: true, email: true, nombre: true } })
  if (!account?.activo) return { status: 401 as const, user: null }
  const permission = await verificarPermisoServer(userId, 'admin.crm.empresas', account.rol)
  const user: CrmCompanyUser = { id: userId, name: account.email || account.nombre || 'Administrador', role: account.rol }
  if (write ? permission.escritura : permission.lectura) return { status: 200 as const, user }
  // Compatible con roles históricos solo en lectura, sin concesiones granulares.
  if (!write && ['MARKETING', 'VENTAS'].includes(account.rol)) {
    const grants = await prisma.permisoUsuario.count({ where: { usuarioId: userId, OR: [{ lectura: true }, { escritura: true }] } })
    if (grants === 0) return { status: 200 as const, user }
  }
  return { status: 403 as const, user: null }
}

/** Un permiso sobre Empresas no concede automáticamente acceso al resto del CRM o a Clientes. */
export async function canAccessCrmRelated(user: CrmCompanyUser, area: 'admin.crm.contactos' | 'admin.clientes', write = false) {
  const permission = await verificarPermisoServer(user.id, area, user.role)
  if (write ? permission.escritura : permission.lectura) return true
  if (!write && area === 'admin.crm.contactos' && ['MARKETING', 'VENTAS'].includes(user.role || '')) {
    const grants = await prisma.permisoUsuario.count({ where: { usuarioId: user.id, OR: [{ lectura: true }, { escritura: true }] } })
    return grants === 0
  }
  return false
}
