import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { financeSyncEnabled, type FinanceSyncKind } from '@/lib/finanzas/finance-sync-environment';

export type { FinanceSyncKind } from '@/lib/finanzas/finance-sync-environment';

/**
 * No hay valor por defecto para sincronizaciones externas. Estas banderas no
 * autorizan vínculos automáticos, cobros, correos ni Azure; sólo permiten que
 * el llamador de sync ya revisado continúe tras acreditar el runtime financiero.
 */
export async function assertFinanceSyncEnabled(kind: FinanceSyncKind): Promise<void> {
  if (!financeSyncEnabled({
    oneDriveSyncEnabled: process.env.FINANCE_ONEDRIVE_SYNC_ENABLED,
    ispSyncEnabled: process.env.FINANCE_ISP_SYNC_ENABLED,
  }, kind)) throw new Error('FINANCE_SYNC_DISABLED');
  await assertFinanceRuntimeReady();
}
