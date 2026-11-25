import { summarizeBankInvoicing, type BankInvoicingResult } from '../finanzas/bank-invoicing-core'
import { buildBankInvoicingAnalytics } from '../finanzas/bank-invoicing-analytics'
import { totalsOf } from '../../app/admin/rentabilidad/io-model'
import { numeric, noKnownCost, type Row } from '../../app/admin/rentabilidad/view-model'
import type { DashboardFinance } from './dashboard-model'
import type { DashboardPoint } from './dashboard-contract'

/** Pure projection of the complete, bounded B7 population; never a page aggregate. */
export function projectDashboardFinance(result: BankInvoicingResult, year: number, month: number, today: string, bankAllowed: boolean): DashboardFinance {
  const throughToday = result.invoices.filter(i => i.fechaISO !== null && i.fechaISO <= today)
  const selected = throughToday.filter(i => i.fechaISO!.startsWith(`${year}-`))
  const summary = summarizeBankInvoicing(selected, null)
  const currentMonth = `${year}-${String(month).padStart(2, '0')}`
  const current = selected.filter(i => i.fechaISO!.startsWith(currentMonth))
  const monthSummary = summarizeBankInvoicing(current, null)
  const analytics = buildBankInvoicingAnalytics({ settlements: throughToday, matching: selected, serieById: new Map(), coverage: result.bankCoverage, query: { q: null, mes: null, anio: year, estado: null }, today })
  const euros = (cents: number | null) => cents === null ? null : cents / 100
  // Unknown settlements could belong to any pending bucket: do not label known
  // partial sums as exact debt, nor replace an unprovable settlement with zero.
  const bucketsExact = summary.pendienteNoConfirmado.cents !== null && analytics.sinImporte === 0
  return {
    points: Array.from({ length: month }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, '0')}`
      const own = selected.filter(i => i.fechaISO!.startsWith(key))
      return { month: key, value: euros(summarizeBankInvoicing(own, null).facturado.cents) }
    }),
    yearTotal: euros(summary.facturado.cents), monthTotal: euros(monthSummary.facturado.cents),
    invoiceCount: selected.length, monthCount: current.length,
    confirmed: bankAllowed ? euros(summary.cobroDocumentalConfirmado.cents) : null,
    pendingReal: bankAllowed && bucketsExact ? euros(analytics.desglosePendiente.real.cents) : null,
    withoutStatement: bankAllowed && bucketsExact ? euros(analytics.desglosePendiente.sinExtracto.cents) : null,
    revisionCount: bankAllowed ? summary.revisiones : null,
    cutoff: bankAllowed ? analytics.corte.fecha : null,
  }
}

/** Reuse the current Rentabilidad aggregate only after its inputs are quantifiable. */
export function projectDashboardMargin(products: Row[], month: string, period: string): DashboardPoint {
  const total = totalsOf(products, 'real')
  const complete = products.length > 0 && products.every(p =>
    (numeric(p.rawIncome) ?? numeric(p.income)) !== null &&
    numeric(p.rawCost ?? p.cost) !== null && !noKnownCost(p))
  return { month, value: month <= period && complete && total.hasData ? total.marginPct : null,
    provisional: total.estimated || products.some(p => p.pending || p.incomePending || p.pendingCost) }
}
