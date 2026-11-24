import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

/** La importación del fichero de ISP Gestión y la confirmación de vínculos son solo para SUPER_ADMIN. */
export async function autorizarSuperadminIsp() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.userType !== 'admin') return { status: 401 as const, actor: null }
  const id = Number(session.user.id)
  if (!Number.isInteger(id)) return { status: 401 as const, actor: null }
  const cuenta = await prisma.usuarioAdmin.findUnique({ where: { id }, select: { activo: true, rol: true, email: true, nombre: true } })
  if (!cuenta?.activo) return { status: 401 as const, actor: null }
  if (cuenta.rol !== 'SUPER_ADMIN') return { status: 403 as const, actor: null }
  return { status: 200 as const, actor: { id, email: cuenta.email || cuenta.nombre || `admin-${id}` } }
}
