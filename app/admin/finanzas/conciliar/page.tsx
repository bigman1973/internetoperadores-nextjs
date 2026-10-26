import { notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { Roboto } from 'next/font/google';
import ConciliarWorkspace from '@/components/finanzas/conciliar/ConciliarWorkspace';
import { authOptions } from '@/lib/auth';
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging';
import { requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';

const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700', '900'], display: 'swap', variable: '--font-conciliar' });
export const dynamic = 'force-dynamic';

/**
 * La página no renderiza datos en el servidor: valida primero entorno staging y
 * permiso financiero vivo. El cliente solicita después la proyección paginada.
 */
export default async function ConciliarPage() {
  try {
    await assertPrototypeStaging();
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions));
    if (!access.ok) notFound();
    return <div className={roboto.variable}><ConciliarWorkspace /></div>;
  } catch (error) {
    if (error instanceof PrototypeStagingError) notFound();
    throw error;
  }
}
