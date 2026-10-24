import prisma from '@/lib/prisma'

export class PrototypeStagingError extends Error {
  readonly status = 404
  readonly code = 'STAGING_PROTOTYPE_ONLY'
  constructor() { super('Este prototipo sólo está disponible en staging aislado.') }
}

/** No activation through a client parameter, and no writes on the production DB. */
export async function assertPrototypeStaging(): Promise<void> {
  if (process.env.FINANCE_STAGING_SANDBOX !== '1' || process.env.VERCEL_ENV === 'production' || process.env.IO_PRODUCTION_READ_ONLY === '1') {
    throw new PrototypeStagingError()
  }
  const rows = await prisma.$queryRaw<Array<{ database_name: string; database_user: string }>>`
    SELECT current_database() AS database_name, current_user AS database_user LIMIT 1
  `
  if (rows.length !== 1 || rows[0].database_name !== 'io_staging_finanzas' || rows[0].database_user !== 'io_staging_finanzas') {
    throw new PrototypeStagingError()
  }
}
