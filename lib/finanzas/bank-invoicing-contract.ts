import type { BankCoverage, BankInvoicingSummary, InvoiceSettlement, PaymentState } from './bank-invoicing-core'

export const B7_PAGE_DEFAULT = 50
export const B7_PAGE_MAX = 100
export const B7_OFFSET_MAX = 100_000
export const B7_QUERY_MAX = 120

export interface B7GetQuery {
  /** Case-insensitive metadata search; never a source-identity heuristic. */
  q: string | null
  /** Calendar month of the canonical FacturaEmitida.fecha, e.g. 2026-10. */
  mes: string | null
  estado: PaymentState | null
  limit: number
  offset: number
}

export interface B7ReadDto {
  recurso: 'facturacionBancoB7'
  query: B7GetQuery
  pagination: { limit: number; offset: number; total: number }
  /** Entire matching population, never a page-only aggregate. */
  summary: BankInvoicingSummary
  bankCoverage: BankCoverage
  items: InvoiceSettlement[]
  calculationBasis: 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA'
}

export class B7QueryError extends Error {
  constructor(public readonly code: 'B7_QUERY_INVALIDA', message: string) {
    super(message)
    this.name = 'B7QueryError'
  }
}

function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number, field: string): number {
  if (value === null) return fallback
  if (!/^\d+$/.test(value)) throw new B7QueryError('B7_QUERY_INVALIDA', `${field} debe ser un entero.`)
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new B7QueryError('B7_QUERY_INVALIDA', `${field} debe estar entre ${min} y ${max}.`)
  }
  return result
}

function validMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false
  return true
}

/** Strict, read-only GET contract: ?q=&mes=YYYY-MM&estado=&limit=1..100&offset=0..100000. */
export function parseB7GetQuery(params: URLSearchParams): B7GetQuery {
  const permitted = new Set(['q', 'mes', 'estado', 'limit', 'offset'])
  const keys: string[] = []
  params.forEach((_value, key) => keys.push(key))
  for (const key of keys) {
    if (!permitted.has(key)) throw new B7QueryError('B7_QUERY_INVALIDA', `Parámetro no admitido: ${key}.`)
  }
  const rawQ = params.get('q')
  const q = rawQ === null ? null : rawQ.trim()
  if (q !== null && q.length > B7_QUERY_MAX) throw new B7QueryError('B7_QUERY_INVALIDA', `q no puede superar ${B7_QUERY_MAX} caracteres.`)
  const rawMonth = params.get('mes')
  if (rawMonth !== null && !validMonth(rawMonth)) throw new B7QueryError('B7_QUERY_INVALIDA', 'mes debe ser YYYY-MM.')
  const rawState = params.get('estado')
  const validStates: readonly PaymentState[] = ['COBRADA_CALCULADA', 'PENDIENTE_COBRO', 'PENDIENTE_COBRO_REVISION']
  if (rawState !== null && !validStates.includes(rawState as PaymentState)) {
    throw new B7QueryError('B7_QUERY_INVALIDA', 'estado no es válido.')
  }
  return {
    q: q || null,
    mes: rawMonth,
    estado: rawState as PaymentState | null,
    limit: parseBoundedInteger(params.get('limit'), B7_PAGE_DEFAULT, 1, B7_PAGE_MAX, 'limit'),
    offset: parseBoundedInteger(params.get('offset'), 0, 0, B7_OFFSET_MAX, 'offset'),
  }
}

export function invoiceMatchesB7Query(invoice: InvoiceSettlement, query: Pick<B7GetQuery, 'q' | 'mes' | 'estado'>): boolean {
  if (query.estado && invoice.paymentState !== query.estado) return false
  // Month is source FacturaEmitida.fecha (not bank date, ISP payment date, or cutoff).
  if (query.mes && (!invoice.fechaISO || invoice.fechaISO.slice(0, 7) !== query.mes)) return false
  if (!query.q) return true
  const needle = query.q.toLocaleLowerCase('es-ES')
  return [invoice.invoiceId, invoice.numFactura, invoice.cliente, invoice.facturaISPId === null ? null : String(invoice.facturaISPId)]
    .some((value) => value !== null && value.toLocaleLowerCase('es-ES').includes(needle))
}

export function sortInvoicesB7(invoices: InvoiceSettlement[]): InvoiceSettlement[] {
  return [...invoices].sort((left, right) => {
    const leftDate = left.fechaISO ?? ''
    const rightDate = right.fechaISO ?? ''
    if (leftDate !== rightDate) return rightDate.localeCompare(leftDate)
    return left.invoiceId.localeCompare(right.invoiceId)
  })
}
