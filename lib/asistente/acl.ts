import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { registrarArea, verificarPermisoServer } from '@/lib/permisos'
import { assistantClientEnabled } from '@/lib/asistente/public-flag'

export type AlcanceAsistente = { espacios: Array<'PUBLICO' | 'INTERNO' | 'CLIENTE'>; roles: string[]; tenantId: number | null; usuarioId: number | null }
export type ContextoAlcance = 'PUBLICO' | 'INTERNO' | 'CLIENTE'

export async function resolverAlcance(contexto: ContextoAlcance): Promise<AlcanceAsistente | null> {
  if (contexto === 'PUBLICO') return { espacios: ['PUBLICO'], roles: [], tenantId: null, usuarioId: null }
  const sesion = await getServerSession(authOptions)
  const usuarioId = Number(sesion?.user?.id)
  if (!sesion?.user || !Number.isInteger(usuarioId) || usuarioId <= 0) return null
  if (contexto === 'CLIENTE') {
    const tenantId = Number((sesion.user as any).clienteId)
    if (!assistantClientEnabled() || !Number.isInteger(tenantId) || tenantId <= 0) return null
    return { espacios: ['CLIENTE'], roles: [], tenantId, usuarioId }
  }
  if (sesion.user.userType !== 'admin') return null
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: usuarioId }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!admin?.activo) return null
  await registrarArea('admin.asistente.chat', 'Chat del asistente', 'admin.asistente')
  const permiso = await verificarPermisoServer(admin.id, 'admin.asistente.chat', admin.rol)
  if (!permiso.lectura) return null
  if (admin.rol === 'SUPER_ADMIN' || admin.rol === 'GERENTE') return { espacios: ['PUBLICO', 'INTERNO'], roles: [], tenantId: null, usuarioId: admin.id }
  const areas = await prisma.permisoUsuario.findMany({ where: { usuarioId: admin.id, lectura: true, area: { activo: true } }, select: { area: { select: { codigo: true } } } })
  return { espacios: ['PUBLICO', 'INTERNO'], roles: areas.map(fila => fila.area.codigo), tenantId: null, usuarioId: admin.id }
}
