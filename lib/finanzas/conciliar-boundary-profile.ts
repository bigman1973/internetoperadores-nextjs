import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertConciliarRuntime, type ConciliarRuntime } from '@/lib/finanzas/conciliar-runtime'
import { EASY_ONLY_PROFILE } from '@/lib/finanzas/easy-access-core'

type ProfileIdentityRow = { database_name: string; database_user: string; perfil: string | null }

/** Same live identity/profile checks in one statement; never a role/JWT bypass. */
export function validateConciliarBoundaryProfile(rows: readonly ProfileIdentityRow[], runtime: ConciliarRuntime = 'staging'): boolean {
  const expected = runtime === 'staging'
    ? { databaseName: 'io_staging_finanzas', databaseUser: 'io_staging_finanzas' }
    : { databaseName: 'railway', databaseUser: 'postgres' }
  if (rows.length !== 1 || rows[0].database_name !== expected.databaseName || rows[0].database_user !== expected.databaseUser) {
    throw Error('CONCILIAR_PROFILE_IDENTITY_REQUIRED')
  }
  return rows[0].perfil === EASY_ONLY_PROFILE
}

/** Called only by exact Conciliar routes after the server runtime guard. */
export async function isConciliarEasyOnlyProfile(userId: number): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw Error('ACCESS_ACTOR_INVALID')
  const runtime = await assertConciliarRuntime()
  const rows = await prisma.$queryRaw<ProfileIdentityRow[]>(Prisma.sql`
    SELECT current_database() AS database_name,current_user AS database_user,
      (SELECT perfil FROM perfiles_acceso_modo_facil WHERE usuario_id=${userId} ORDER BY version DESC LIMIT 1) AS perfil
    LIMIT 1
  `)
  return validateConciliarBoundaryProfile(rows, runtime.runtime)
}
