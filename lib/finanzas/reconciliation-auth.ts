import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

export const B4_CONCILIACION_AREA = 'admin.finanzas.conciliacion'
const LEGACY_FINANCE_ROLES = ['CONTABILIDAD']

export type B4Actor = { id: number; rol: string; roles: string[] }
type B4AccessClient = Pick<Prisma.TransactionClient, 'usuarioAdmin' | 'permisoArea' | 'permisoUsuario'>

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } })
}

/**
 * Authentication is deliberately resolved again against UsuarioAdmin.  A JWT can
 * remain valid after an admin has been disabled or its role/area permissions have
 * changed; B4 must never trust that stale role.
 */
export async function requireB4FinanceAccess(
  required: 'lectura' | 'escritura',
  existingSession?: Session | null,
): Promise<{ ok: true; actor: B4Actor } | { ok: false; response: NextResponse }> {
  const session = existingSession === undefined ? await getServerSession(authOptions) : existingSession
  if (!session?.user || session.user.userType !== 'admin') {
    return { ok: false, response: privateJson({ error: 'No autorizado' }, 401) }
  }

  const userId = Number(session.user.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return { ok: false, response: privateJson({ error: 'No autorizado' }, 401) }
  }

  return requireB4ActorAccess(userId, required)
}

/** Sólo para servicios server-side llamados tras autenticar la solicitud. */
export async function requireB4ActorAccess(userId:number,required:'lectura'|'escritura',database:B4AccessClient=prisma):Promise<{ok:true;actor:B4Actor}|{ok:false;response:NextResponse}> {
  if(!Number.isInteger(userId)||userId<=0)return {ok:false,response:privateJson({error:'No autorizado'},401)}
  const admin = await database.usuarioAdmin.findUnique({
    where: { id: userId },
    select: { id: true, activo: true, rol: true, roles: true },
  })
  if (!admin?.activo) return { ok: false, response: privateJson({ error: 'No autorizado' }, 401) }

  const permission = await verificarPermisoServer(admin.id, B4_CONCILIACION_AREA, admin.rol, database)
  if (permission[required]) return { ok: true, actor: { id: admin.id, rol: admin.rol, roles: admin.roles ?? [] } }

  // Preserve the project’s legacy fallback, but calculate it from the live row.
  const granularPermissions = await database.permisoUsuario.count({
    where: { usuarioId: admin.id, OR: [{ lectura: true }, { escritura: true }] },
  })
  if (granularPermissions === 0 && [admin.rol, ...(admin.roles ?? [])].some((role) => LEGACY_FINANCE_ROLES.includes(role))) {
    return { ok: true, actor: { id: admin.id, rol: admin.rol, roles: admin.roles ?? [] } }
  }
  return { ok: false, response: privateJson({ error: `Sin permiso de ${required}` }, 403) }
}

export function sameOrigin(req: { headers: Headers; nextUrl: URL }): boolean {
  return req.headers.get('origin') === req.nextUrl.origin
}
