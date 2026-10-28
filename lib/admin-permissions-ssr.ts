import type { PrismaClient } from '@prisma/client'
import {
  serializeAdminPermissionSsrSeed,
  type AdminPermissionSsrSeed,
} from '@/lib/admin-permissions-ssr-contract'

/**
 * Dependencia mínima para poder probar esta lectura sin inicializar Prisma. No
 * mantiene estado compartido: el layout la invoca una vez para la respuesta
 * actual.
 */
export type AdminPermissionsSsrDatabase = Pick<PrismaClient, 'permisoUsuario'>

export async function readAdminPermissionsSsr(
  database: AdminPermissionsSsrDatabase,
  actorId: number,
): Promise<AdminPermissionSsrSeed[] | null> {
  if (!Number.isSafeInteger(actorId) || actorId <= 0) return null

  const permissions = await database.permisoUsuario.findMany({
    where: {
      usuarioId: actorId,
      area: { activo: true },
    },
    select: {
      lectura: true,
      escritura: true,
      area: { select: { codigo: true } },
    },
  })

  return serializeAdminPermissionSsrSeed(permissions)
}

/** Sólo el layout decide conservar el fallback histórico si la foto falla. */
export async function readAdminPermissionsSsrWithFallback(
  database: AdminPermissionsSsrDatabase,
  actorId: number,
): Promise<AdminPermissionSsrSeed[] | null> {
  try {
    return await readAdminPermissionsSsr(database, actorId)
  } catch {
    return null
  }
}
