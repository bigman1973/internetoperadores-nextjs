import { Prisma } from '@prisma/client'

/** Sólo se repite una preparación cuyo callback serializable Prisma confirmó abortado. */
export const CONCILIAR_RECOVERY_PREPARE_RETRY_DELAYS_MS = [25, 50] as const
export const CONCILIAR_RECOVERY_PREPARE_MAX_ATTEMPTS = CONCILIAR_RECOVERY_PREPARE_RETRY_DELAYS_MS.length + 1

type RetryDelay = (milliseconds: number) => Promise<void>

const waitForRecoveryPrepareRetry: RetryDelay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

/**
 * P2010 es el envoltorio Prisma de `$executeRaw`; PostgreSQL deja el SQLSTATE
 * original en `meta.code`. Ningún objeto que sólo imite estos campos se acepta.
 */
export function isRetryableConciliarRecoveryPrepareConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === 'P2034') return true
  if (error.code !== 'P2010') return false
  const sqlState = error.meta?.code
  return sqlState === '40001' || sqlState === '40P01'
}

/**
 * Reabre como máximo tres callbacks serializables para el mismo intent. Los
 * demás errores (autorización, validación, contrato o dominio) se propagan tal
 * cual y no se convierten en un replay de preparación.
 */
export async function retryConciliarRecoveryPreparation<T>(
  transaction: () => Promise<T>,
  delay: RetryDelay = waitForRecoveryPrepareRetry,
): Promise<T> {
  for (let attempt = 0; attempt < CONCILIAR_RECOVERY_PREPARE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await transaction()
    } catch (error) {
      const retryDelay = CONCILIAR_RECOVERY_PREPARE_RETRY_DELAYS_MS[attempt]
      if (!isRetryableConciliarRecoveryPrepareConflict(error) || retryDelay === undefined) throw error
      await delay(retryDelay)
    }
  }
  throw new Error('CONCILIAR_RECOVERY_PREPARE_RETRY_UNREACHABLE')
}
