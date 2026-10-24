import { notFound } from 'next/navigation';
import EasyReconciliationWorkspace from '@/components/finanzas/easy/EasyReconciliationWorkspace';
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError } from '@/lib/finanzas/prototype-staging';

export const dynamic = 'force-dynamic';

/** Sólo se monta tras validar el contexto de servidor y la identidad viva de BD. */
export default async function ModoFacilPage() {
  try {
    const context = await assertFinanceEasyRuntime();
    return <EasyReconciliationWorkspace environment={context.runtime} />;
  } catch (error) {
    if (error instanceof FinanceEasyRuntimeError) notFound();
    throw error;
  }
}
