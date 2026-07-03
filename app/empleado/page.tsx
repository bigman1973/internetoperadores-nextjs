'use client';

import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ReceiptPercentIcon } from '@heroicons/react/24/outline';

export default function EmpleadoPage() {
  const { data: session } = useSession();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {session?.user?.name || 'Empleado'}
        </h1>
        <p className="text-gray-500 mt-1">Portal de empleado de Internet Operadores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/empleado/gastos"
          className="flex items-center gap-4 p-6 bg-white rounded-xl border hover:border-orange-200 hover:shadow-sm transition-all"
        >
          <div className="p-3 bg-orange-50 rounded-lg">
            <ReceiptPercentIcon className="h-8 w-8 text-orange-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Tickets de Gasto</h2>
            <p className="text-sm text-gray-500">Sube tickets y gestiona tus gastos</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
