import { notFound } from 'next/navigation';
import EasyReconciliationWorkspace from '@/components/finanzas/easy/EasyReconciliationWorkspace';
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging';

export const dynamic = 'force-dynamic';

/** El prototipo nunca se monta fuera de la base staging aislada. */
export default async function ModoFacilPage() {
  try {
    await assertPrototypeStaging();
  } catch (error) {
    if (error instanceof PrototypeStagingError) notFound();
    throw error;
  }
  return <EasyReconciliationWorkspace />;
}
