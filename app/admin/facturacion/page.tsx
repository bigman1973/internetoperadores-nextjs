import BankInvoicingWorkspace from '@/components/finanzas/facturacion-banco/BankInvoicingWorkspace'
import DeferredMonthlyInvoicing from './DeferredMonthlyInvoicing'

export const dynamic = 'force-dynamic'

/** B7 conserva íntegramente KPIs/cobros; el bloque restaurado es sólo histórico. */
export default function FacturacionPage() {
  return <div className="space-y-6"><BankInvoicingWorkspace /><DeferredMonthlyInvoicing /></div>
}
