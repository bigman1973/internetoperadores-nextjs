import { notFound } from 'next/navigation';
import CustomerPhoneAnalyticsWorkspace from '@/components/finanzas/customer-analytics/CustomerPhoneAnalyticsWorkspace';
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging';

export const dynamic = 'force-dynamic';

/** No muestra interfaz ni datos si no se verifica el namespace staging aislado. */
export default async function AnaliticaClientePage() {
  try {
    await assertPrototypeStaging();
  } catch (error) {
    if (error instanceof PrototypeStagingError) notFound();
    throw error;
  }
  return <CustomerPhoneAnalyticsWorkspace />;
}
