import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { registrarArea, verificarPermisoServer } from '@/lib/permisos'
import { CABECERAS_PRIVADAS } from '@/lib/asistente/http'

const NOMBRES: Record<string, string> = {
  'admin.asistente': 'Asistente IA',
  'admin.asistente.chat': 'Asistente IA > Chat interno',
  'admin.asistente.conocimiento': 'Asistente IA > Conocimiento',
  'admin.asistente.conversaciones': 'Asistente IA > Conversaciones',
  'admin.asistente.leads': 'Asistente IA > Leads',
  'admin.asistente.aprendizaje': 'Asistente IA > Aprendizaje',
  'admin.asistente.analitica': 'Asistente IA > Analítica',
  'admin.asistente.propuestas': 'Asistente IA > Informes y propuestas',
  'admin.asistente.configuracion': 'Asistente IA > Configuración',
}
export type AreaAsistente = 'admin.asistente' | 'admin.asistente.chat' | 'admin.asistente.conocimiento' | 'admin.asistente.conversaciones' | 'admin.asistente.leads' | 'admin.asistente.aprendizaje' | 'admin.asistente.analitica' | 'admin.asistente.propuestas' | 'admin.asistente.configuracion'
export type ActorAdminAsistente = { id: number; rol: string; roles: string[] }

/**
 * Control de acceso para PÁGINAS de servidor `/admin/asistente/**`.
 * Redirige si no hay sesión admin activa o falta permiso de lectura del área.
 * Devuelve también si el actor puede escribir (para ocultar botones; la API vuelve a comprobarlo).
 * Registrar el área no concede permisos: SUPER_ADMIN/GERENTE acceden por rol; el resto, por permiso granular.
 */
export async function exigirPaginaAsistente(area: AreaAsistente): Promise<{ actor: ActorAdminAsistente; puedeEscribir: boolean }> {
  await registrarArea('admin.asistente', NOMBRES['admin.asistente'])
  if (area !== 'admin.asistente') await registrarArea(area, NOMBRES[area], 'admin.asistente')
  const sesion = await getServerSession(authOptions)
  const id = Number(sesion?.user?.id)
  if (!sesion?.user || sesion.user.userType !== 'admin' || !Number.isInteger(id) || id <= 0) redirect('/admin/login')
  const usuario = await prisma.usuarioAdmin.findUnique({ where: { id }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!usuario?.activo) redirect('/admin/login')
  const permiso = await verificarPermisoServer(usuario.id, area, usuario.rol)
  if (!permiso.lectura) redirect('/admin')
  return { actor: { id: usuario.id, rol: usuario.rol, roles: usuario.roles || [] }, puedeEscribir: Boolean(permiso.escritura) }
}

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
