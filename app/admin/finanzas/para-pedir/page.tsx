import { notFound } from 'next/navigation';
import NewParaPedirWorkspace from '@/components/finanzas/easy/newParaPedirWorkspace';
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging';

export const dynamic = 'force-dynamic';

/** La bandeja documental sólo se monta en la base de staging aislada. */
export default async function ParaPedirPage() {
  try {
    await assertPrototypeStaging();
  } catch (error) {
    if (error instanceof PrototypeStagingError) notFound();
    throw error;
  }
  return <NewParaPedirWorkspace />;
}
