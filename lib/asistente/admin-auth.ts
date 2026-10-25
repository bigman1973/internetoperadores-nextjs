import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { registrarArea, verificarPermisoServer } from '@/lib/permisos'
import { CABECERAS_PRIVADAS } from '@/lib/asistente/http'

const NOMBRES: Record<string, string> = { 'admin.asistente': 'Asistente IA', 'admin.asistente.chat': 'Chat del asistente', 'admin.asistente.conocimiento': 'Conocimiento del asistente', 'admin.asistente.configuracion': 'Configuración del asistente' }
export type ActorAdminAsistente = { id: number; rol: string; roles: string[] }

export async function exigirAdminAsistente(area: keyof typeof NOMBRES | string, accion: 'lectura' | 'escritura'): Promise<{ ok: true; actor: ActorAdminAsistente } | { ok: false; response: NextResponse }> {
  await registrarArea('admin.asistente', NOMBRES['admin.asistente'])
  await registrarArea(area, NOMBRES[area] || area, 'admin.asistente')
  const sesion = await getServerSession(authOptions)
  const id = Number(sesion?.user?.id)
  if (!sesion?.user || sesion.user.userType !== 'admin' || !Number.isInteger(id) || id <= 0) return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: CABECERAS_PRIVADAS }) }
  const usuario = await prisma.usuarioAdmin.findUnique({ where: { id }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!usuario?.activo) return { ok: false, response: NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: CABECERAS_PRIVADAS }) }
  const permiso = await verificarPermisoServer(usuario.id, area, usuario.rol)
  if (!permiso[accion]) return { ok: false, response: NextResponse.json({ error: `Sin permiso de ${accion}` }, { status: 403, headers: CABECERAS_PRIVADAS }) }
  return { ok: true, actor: { id: usuario.id, rol: usuario.rol, roles: usuario.roles || [] } }
}
