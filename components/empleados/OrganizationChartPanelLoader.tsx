'use client';

import dynamic from 'next/dynamic';

const OrganizationChartPanel = dynamic(
  () => import('@/components/empleados/OrganizationChartPanel'),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[680px] rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600 sm:min-h-[720px]"
        role="status"
      >
        Cargando estructura organizativa…
      </div>
    ),
  },
);

export default function OrganizationChartPanelLoader({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return <OrganizationChartPanel isSuperAdmin={isSuperAdmin} />;
}
