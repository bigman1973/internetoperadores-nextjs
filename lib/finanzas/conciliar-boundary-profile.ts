import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { classifyFinanceEasyProfileRuntime } from '@/lib/finanzas/prototype-staging'
import { EASY_ONLY_PROFILE } from '@/lib/finanzas/easy-access-core'

type ProfileIdentityRow = { database_name: string; database_user: string; perfil: string | null }

/** Same live identity/profile checks in one statement; never a role/JWT bypass. */
export function validateConciliarBoundaryProfile(rows: readonly ProfileIdentityRow[]): boolean {
  if (rows.length !== 1 || rows[0].database_name !== 'io_staging_finanzas' || rows[0].database_user !== 'io_staging_finanzas') {
    throw Error('STAGING_PROFILE_IDENTITY_REQUIRED')
  }
  return rows[0].perfil === EASY_ONLY_PROFILE
}

/** Called only by the exact Conciliar routes in the isolated staging middleware. */
export async function isConciliarEasyOnlyProfile(userId: number): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw Error('ACCESS_ACTOR_INVALID')
  if (classifyFinanceEasyProfileRuntime({
    stagingSandbox: process.env.FINANCE_STAGING_SANDBOX,
    vercelEnvironment: process.env.VERCEL_ENV,
    easyProductionEnabled: process.env.FINANCE_EASY_PRODUCTION_ENABLED,
    modelProductionEnabled: process.env.FINANCE_MODEL_PRODUCTION_ENABLED,
    automaticLinksDisabled: process.env.FINANCE_AUTOMATIC_LINKS_DISABLED,
    productionReadOnly: process.env.IO_PRODUCTION_READ_ONLY,
    databaseUrl: process.env.DATABASE_URL,
  }) !== 'staging') throw Error('STAGING_PROFILE_CONFIGURATION_REQUIRED')
  const rows = await prisma.$queryRaw<ProfileIdentityRow[]>(Prisma.sql`
    SELECT current_database() AS database_name,current_user AS database_user,
      (SELECT perfil FROM perfiles_acceso_modo_facil WHERE usuario_id=${userId} ORDER BY version DESC LIMIT 1) AS perfil
    LIMIT 1
  `)
  return validateConciliarBoundaryProfile(rows)
}
