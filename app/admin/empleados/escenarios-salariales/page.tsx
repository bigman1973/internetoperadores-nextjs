import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { authOptions } from '@/lib/auth';
import SalaryScenariosPanel from '@/components/empleados/SalaryScenariosPanel';

export const dynamic = 'force-dynamic';

export default async function SalaryScenariosPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');
  if (session.user.role !== 'SUPER_ADMIN') redirect('/admin/empleados');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Personal · Costes de Personal</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Escenarios de revisión salarial</h1>
          <p className="mt-1 text-sm text-gray-500">Simulaciones guardadas, comparables e imprimibles. Ningún escenario modifica el histórico salarial real.</p>
        </div>
        <Link href="/admin/empleados" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <ArrowLeftIcon className="h-4 w-4" /> Volver a costes actuales
        </Link>
      </div>
      <SalaryScenariosPanel />
    </div>
  );
}
