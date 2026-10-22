import { prisma } from '@/lib/prisma';
import { assertFinanceStagingIsolated } from '@/lib/finanzas/staging-safety';
import { financeEnvironment } from '@/lib/finanzas/finance-environment';

/** No configura ni modifica entorno/BD; sólo permite un runtime ya aprobado. */
export async function assertFinanceRuntimeReady(): Promise<void> {
  const mode = financeEnvironment({
    stagingSandbox: process.env.FINANCE_STAGING_SANDBOX,
    vercelEnvironment: process.env.VERCEL_ENV,
    productionEnabled: process.env.FINANCE_MODEL_PRODUCTION_ENABLED,
    automaticLinksDisabled: process.env.FINANCE_AUTOMATIC_LINKS_DISABLED,
    databaseUrl: process.env.DATABASE_URL,
  });
  if (mode === 'staging') return assertFinanceStagingIsolated();
  if (mode !== 'production') throw new Error('FINANCE_RUNTIME_NOT_APPROVED');
  const rows = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `;
  if (rows[0]?.db !== 'railway' || rows[0]?.usuario !== 'postgres') throw new Error('FINANCE_RUNTIME_DATABASE_MISMATCH');
}
