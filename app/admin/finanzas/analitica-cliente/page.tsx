import { notFound } from 'next/navigation';
import CustomerPhoneAnalyticsWorkspace from '@/components/finanzas/customer-analytics/CustomerPhoneAnalyticsWorkspace';
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging';

export const dynamic = 'force-dynamic';

/** Telefonía/SOFÍA queda aparcada: no se promueve con las superficies Modo fácil. */
export default async function AnaliticaClientePage() {
  try {
    await assertPrototypeStaging();
  } catch (error) {
    if (error instanceof PrototypeStagingError) notFound();
    throw error;
  }
  return <CustomerPhoneAnalyticsWorkspace />;
}
