import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertFinanceStagingIsolated } from '@/lib/finanzas/staging-safety';
import { financeEnvironment } from '@/lib/finanzas/finance-environment';

type FinanceRuntimeIdentityClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

async function assertFinanceRuntimeIdentity(database: FinanceRuntimeIdentityClient, expected: { db: string; usuario: string }, error: string): Promise<void> {
  const rows = await database.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `;
  if (rows[0]?.db !== expected.db || rows[0]?.usuario !== expected.usuario) throw new Error(error);
}

/** No configura ni modifica entorno/BD; sólo permite un runtime ya aprobado. */
export async function assertFinanceRuntimeReady(database?: FinanceRuntimeIdentityClient): Promise<void> {
  const mode = financeEnvironment({
    stagingSandbox: process.env.FINANCE_STAGING_SANDBOX,
    vercelEnvironment: process.env.VERCEL_ENV,
    productionEnabled: process.env.FINANCE_MODEL_PRODUCTION_ENABLED,
    automaticLinksDisabled: process.env.FINANCE_AUTOMATIC_LINKS_DISABLED,
    databaseUrl: process.env.DATABASE_URL,
  });
  if (mode === 'staging') {
    if (!database) return assertFinanceStagingIsolated();
    return assertFinanceRuntimeIdentity(database, { db: 'io_staging_finanzas', usuario: 'io_staging_finanzas' }, 'STAGING_ISOLATION_REQUIRED');
  }
  if (mode !== 'production') throw new Error('FINANCE_RUNTIME_NOT_APPROVED');
  return assertFinanceRuntimeIdentity(database ?? prisma, { db: 'railway', usuario: 'postgres' }, 'FINANCE_RUNTIME_DATABASE_MISMATCH');
}
