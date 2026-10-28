import { notFound } from 'next/navigation';
import NewParaPedirWorkspace from '@/components/finanzas/easy/newParaPedirWorkspace';
import { readParaPedirProjection } from '@/lib/finanzas/para-pedir-projection-read';
import { parseParaPedirInput } from '@/lib/finanzas/para-pedir-contract';
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError } from '@/lib/finanzas/prototype-staging';
import { requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
import { requireAuth } from '@/lib/middleware/auth';

export const dynamic = 'force-dynamic';

/** La primera foto se renderiza sólo tras comprobar entorno, sesión y permiso B4 vivo. */
export default async function ParaPedirPage() {
  try {
    const context = await assertFinanceEasyRuntime();
    const access = await requireB4FinanceAccess('lectura', await requireAuth('admin'));
    if (!access.ok) notFound();
    const initialData = await readParaPedirProjection(parseParaPedirInput({ limit: '20', offset: '0' }));
    return <NewParaPedirWorkspace environment={context.runtime} initialData={{ ...initialData, stagingOnly: context.stagingOnly }} />;
  } catch (error) {
    if (error instanceof FinanceEasyRuntimeError) notFound();
    throw error;
  }
}
