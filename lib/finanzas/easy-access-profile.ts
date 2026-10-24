import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  assertFinanceEasyProfileRuntime,
  assertFinanceEasyRuntime,
  assertPrototypeStaging,
  type FinanceEasyProfileRuntime,
  type FinanceEasyRuntimeContext,
} from '@/lib/finanzas/prototype-staging'
import { EASY_ONLY_PROFILE } from '@/lib/finanzas/easy-access-core'

async function easyOnlyProfile(userId: number): Promise<boolean> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw Error('ACCESS_ACTOR_INVALID')
  const rows = await prisma.$queryRaw<Array<{ perfil: string }>>(Prisma.sql`
    SELECT perfil FROM perfiles_acceso_modo_facil
    WHERE usuario_id=${userId}
    ORDER BY version DESC LIMIT 1
  `)
  return rows[0]?.perfil === EASY_ONLY_PROFILE
}

/**
 * Live, append-only profile lookup for the explicitly promoted surfaces. Its
 * caller has already established an exact server-side finance environment; no
 * JWT role can bypass this profile in either staging or production.
 */
export async function isEasyOnlyFinanceUser(userId: number): Promise<boolean> {
  await assertFinanceEasyProfileRuntime()
  return easyOnlyProfile(userId)
}

/** Compatibility fence for staging runners and their existing rollback tests. */
export async function isEasyOnlyStageUser(userId: number): Promise<boolean> {
  await assertPrototypeStaging()
  return easyOnlyProfile(userId)
}

/** The profile response is server-derived and deliberately contains no URL/host input. */
export async function financeEasyProfileEnvironment(): Promise<FinanceEasyProfileRuntime> {
  return assertFinanceEasyProfileRuntime()
}

/** Pure final gate for the live row; a caller-provided role is never accepted. */
export function hasLiveEasyAutomationCapability(input: Readonly<{ activo: boolean; rol: string; easyOnly: boolean }>): boolean {
  return input.activo && input.easyOnly === false && ['SUPER_ADMIN', 'GERENTE'].includes(input.rol)
}

/**
 * Runtime-promoted automation capability. It is established entirely on the
 * server: all three production opt-ins and the live database identity must be
 * valid, the account must remain active and its current role must be GERENTE or
 * SUPER_ADMIN. MODO_FACIL_ONLY always wins over a legacy role.
 */
export async function canManageEasyAutomation(
  userId: number,
  expectedRuntime?: FinanceEasyRuntimeContext,
): Promise<boolean> {
  const runtime = await assertFinanceEasyRuntime()
  if (expectedRuntime && expectedRuntime.runtime !== runtime.runtime) return false
  if (!Number.isSafeInteger(userId) || userId <= 0) return false
  const easyOnly = await easyOnlyProfile(userId)
  const user = await prisma.usuarioAdmin.findUnique({
    where: { id: userId },
    select: { activo: true, rol: true },
  })
  return hasLiveEasyAutomationCapability({
    activo: user?.activo === true,
    rol: user?.rol ?? '',
    easyOnly,
  })
}

/** Strict compatibility fence for staging-only runners and rollback tests. */
export async function canManageEasyAutomationStage(userId: number): Promise<boolean> {
  await assertPrototypeStaging()
  const easyOnly = await isEasyOnlyStageUser(userId)
  const user = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true, rol: true } })
  return hasLiveEasyAutomationCapability({
    activo: user?.activo === true,
    rol: user?.rol ?? '',
    easyOnly,
  })
}
