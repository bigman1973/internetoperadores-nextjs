'use client';

import dynamic from 'next/dynamic';

const SalaryScenariosPanel = dynamic(
  () => import('@/components/empleados/SalaryScenariosPanel'),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[640px] rounded-2xl border bg-white p-10 text-center text-gray-500"
        role="status"
      >
        Cargando escenarios salariales...
      </div>
    ),
  },
);

export default function SalaryScenariosPanelLoader() {
  return <SalaryScenariosPanel />;
}
