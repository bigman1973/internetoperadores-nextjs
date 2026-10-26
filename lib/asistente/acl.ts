import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { registrarArea, verificarPermisoServer } from '@/lib/permisos'
import { assistantClientEnabled } from '@/lib/asistente/public-flag'

export type AlcanceAsistente = {
  espacios: Array<'PUBLICO' | 'INTERNO' | 'CLIENTE'>
  roles: string[]
  tenantId: number | null
  usuarioId: number | null
  /** Sólo lo emite la resolución de sesión administrativa verificada en servidor. */
  puedeLeerTodoInterno?: boolean
}
export type ContextoAlcance = 'PUBLICO' | 'INTERNO' | 'CLIENTE'
type ContextoClienteConfiable = { clienteId: number; usuarioId: number; clienteHabilitado: boolean }

/**
 * Constructor para contexto ya verificado por el servidor. Nunca recibe datos
 * HTTP: `resolverAlcance` lo alimenta desde la sesión y una lectura fresca de BD.
 */
export function alcanceClienteConfiableDesdeServidor(contexto: ContextoClienteConfiable): AlcanceAsistente | null {
  if (!contexto.clienteHabilitado || !Number.isSafeInteger(contexto.clienteId) || contexto.clienteId <= 0 || !Number.isSafeInteger(contexto.usuarioId) || contexto.usuarioId <= 0) return null
  return { espacios: ['CLIENTE'], roles: [], tenantId: contexto.clienteId, usuarioId: contexto.usuarioId }
}

export async function resolverAlcance(contexto: ContextoAlcance): Promise<AlcanceAsistente | null> {
  if (contexto === 'PUBLICO') return { espacios: ['PUBLICO'], roles: [], tenantId: null, usuarioId: null }
  const sesion = await getServerSession(authOptions)
  const usuarioId = Number(sesion?.user?.id)
  if (!sesion?.user || !Number.isInteger(usuarioId) || usuarioId <= 0) return null
  if (contexto === 'CLIENTE') {
    // CLIENTE continúa apagado por defecto. Al habilitarse, el tenant se toma de
    // la fila activa ligada a la sesión, nunca de body, query ni cabecera.
    if (!assistantClientEnabled() || sesion.user.userType !== 'cliente') return null
    const cliente = await prisma.clienteWeb.findUnique({ where: { id: usuarioId }, select: { id: true, activo: true } })
    return alcanceClienteConfiableDesdeServidor({ clienteId: cliente?.id || 0, usuarioId, clienteHabilitado: Boolean(cliente?.activo) })
  }
  if (sesion.user.userType !== 'admin') return null
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: usuarioId }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!admin?.activo) return null
  await registrarArea('admin.asistente.chat', 'Chat del asistente', 'admin.asistente')
  const permiso = await verificarPermisoServer(admin.id, 'admin.asistente.chat', admin.rol)
  if (!permiso.lectura) return null
  if (admin.rol === 'SUPER_ADMIN' || admin.rol === 'GERENTE') return { espacios: ['PUBLICO', 'INTERNO'], roles: [], tenantId: null, usuarioId: admin.id, puedeLeerTodoInterno: true }
  const areas = await prisma.permisoUsuario.findMany({ where: { usuarioId: admin.id, lectura: true, area: { activo: true } }, select: { area: { select: { codigo: true } } } })
  return { espacios: ['PUBLICO', 'INTERNO'], roles: areas.map(fila => fila.area.codigo), tenantId: null, usuarioId: admin.id }
}
