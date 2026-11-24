import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { normalizarEmail } from '@/lib/peticiones-flujo'
import { isArea8Owner, canManageArea8 } from './policy'
import { readLiveArea4Adoption } from '../area4/live-admin'

export type Area8Auth = { id: number; email: string; nombre: string; rol: string; owner: boolean; acting: boolean }
const noStore = { 'Cache-Control': 'private, no-store' }
export const area8Fail = (error: string, status: number) => ({ error: NextResponse.json({ error }, { status, headers: noStore }) })
export async function requireArea8Auth(opts: { management?: boolean; write?: boolean; owner?: boolean; area?: 'admin.peticiones' | 'admin.historial' } = {}): Promise<Area8Auth | { error: NextResponse }> {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin' || !session.user.email) return area8Fail('Inicia sesión con tu cuenta de empleado.', 401)
  const id = Number(session.user.id)
  if (!Number.isSafeInteger(id) || id <= 0 || !/^\d+$/.test(String(session.user.id))) return area8Fail('No autorizado.', 401)
  const acting = Boolean(session.impersonation)
  if ((opts.write || opts.owner || opts.management) && acting) return area8Fail('Sal de «Actuar como» antes de gestionar peticiones o historial.', 403)
  try {
    const current = await prisma.usuarioAdmin.findUnique({ where: { id }, select: { id: true, email: true, nombre: true, rol: true, roles: true, activo: true } })
    if (!current?.activo || normalizarEmail(current.email) !== normalizarEmail(session.user.email)) return area8Fail('Tu cuenta no tiene acceso activo.', 403)
    const owner = isArea8Owner(current, acting)
    if (opts.owner && !owner) return area8Fail('Solo Víctor puede realizar esta acción.', 403)
    if (opts.management && !owner) {
      const area = opts.area || 'admin.peticiones'
      const target = await prisma.permisoArea.findUnique({ where: { codigo: area }, select: { activo: true } })
      if (!target?.activo) return area8Fail('Esta sección no está habilitada para gestión.', 403)
      const grants = await prisma.permisoUsuario.findMany({ where: { usuarioId: id, area: { activo: true } }, select: { lectura: true, escritura: true, area: { select: { codigo: true } } } })
      const permissionsAdopted = await readLiveArea4Adoption(prisma, id)
      if (!canManageArea8(current, grants, Boolean(opts.write), area, permissionsAdopted)) return area8Fail('No tienes permiso para gestionar esta sección.', 403)
    }
    return { id: current.id, email: normalizarEmail(current.email), nombre: current.nombre, rol: current.rol, owner, acting }
  } catch { return area8Fail('No se pudo comprobar tu acceso. Inténtalo de nuevo.', 503) }
}
