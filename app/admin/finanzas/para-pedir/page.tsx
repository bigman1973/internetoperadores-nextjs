import { notFound } from 'next/navigation';
import NewParaPedirWorkspace from '@/components/finanzas/easy/newParaPedirWorkspace';
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError } from '@/lib/finanzas/prototype-staging';

export const dynamic = 'force-dynamic';

/** La bandeja se monta sólo tras validar el entorno y la identidad viva de BD. */
export default async function ParaPedirPage() {
  try {
    const context = await assertFinanceEasyRuntime();
    return <NewParaPedirWorkspace environment={context.runtime} />;
  } catch (error) {
    if (error instanceof FinanceEasyRuntimeError) notFound();
    throw error;
  }
}
