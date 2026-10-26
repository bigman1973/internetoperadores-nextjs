'use client'

import dynamic from 'next/dynamic'

const MonthlyInvoicingWorkspace = dynamic(
  () => import('@/components/finanzas/monthly-invoicing/MonthlyInvoicingWorkspace'),
  {
    ssr: false,
    loading: () => (
      <section
        aria-busy="true"
        aria-live="polite"
        aria-label="Resumen histórico de facturación ISP"
        className="min-h-[44rem] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm"
      >
        <span className="sr-only">Cargando resumen histórico de facturación ISP</span>
      </section>
    ),
  },
)

/**
 * El resumen histórico queda después del workspace bancario principal. Separarlo
 * evita que su parser, hidratación y lectura compitan con el contenido inicial.
 */
export default function DeferredMonthlyInvoicing() {
  return <MonthlyInvoicingWorkspace />
}
