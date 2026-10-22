import { prisma } from '@/lib/prisma'

/**
 * Las escrituras de inicialización/revisión B2 sólo son válidas en la copia aislada.
 * Nunca registra URLs ni credenciales y falla cerrada fuera del sandbox explícito.
 */
export async function assertFinanceStagingIsolated() {
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('STAGING_ISOLATION_REQUIRED')
  const rows = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `
  if (rows[0]?.db !== 'io_staging_finanzas' || rows[0]?.usuario !== 'io_staging_finanzas') {
    throw new Error('STAGING_ISOLATION_REQUIRED')
  }
}
