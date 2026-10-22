/**
 * Restauración de lectura del resumen ISP histórico.
 * Semántica: Factura.total/fecha/serie y Remesa.totalImporte/fecha; mayoristas
 * V-Valley=1969, Arrow=1851 e IPS Norte=1967. No calcula cobros ni pendientes:
 * B7 (B4/B6) continúa siendo su única fuente.
 */
export const VVALLEY_ID_CLIENTE = 1969
export const ARROW_ID_CLIENTE = 1851
export const IPSNORTE_ID_CLIENTE = 1967

export type LegacyIspInvoice = Readonly<{ id: number; fechaISO: string | null; totalText: string | null; serieFactura: string | null; idCliente: number | null }>
export type LegacyRemittance = Readonly<{ id: number; fechaISO: string | null; totalText: string | null }>
export type MonthlyInvoicingQuery = Readonly<{ mes: string | null }>

export type MonthlyInvoicingMonth = Readonly<{
  mes: string; totalFacturadoCents: number; numFacturas: number
  vvalleyFacturadoCents: number; vvalleyNumFacturas: number
  arrowFacturadoCents: number; arrowNumFacturas: number
  ipsNorteFacturadoCents: number; ipsNorteNumFacturas: number
  mayoristasTotalCents: number; mayoristasPorcentajeCentimas: number | null
  totalRemesadoCents: number; numRemesas: number
}>
export type InvoicingSeries = Readonly<{ serie: string; totalFacturadoCents: number; numFacturas: number }>
export type MonthlyInvoicingResult = Readonly<{
  resumenMensual: MonthlyInvoicingMonth[]; porSerie: InvoicingSeries[]
  diagnostics: {
    invoicesExcludedInvalidDate: number; invoicesExcludedInvalidAmount: number
    remittancesExcludedInvalidDate: number; remittancesExcludedInvalidAmount: number
    seriesMonth: string | null
    source: 'FACTURA_ISP_Y_REMESA_ISP_HISTORICAS'
    payments: 'NO_CALCULADOS_AQUI__B7_B4_B6_ES_LA_UNICA_FUENTE_DE_COBRADO_Y_PENDIENTE'
  }
}>

type Bucket = {
  totalFacturadoCents: number; numFacturas: number
  vvalleyFacturadoCents: number; vvalleyNumFacturas: number
  arrowFacturadoCents: number; arrowNumFacturas: number
  ipsNorteFacturadoCents: number; ipsNorteNumFacturas: number
  mayoristasTotalCents: number; totalRemesadoCents: number; numRemesas: number
}
type SeriesBucket = { totalFacturadoCents: number; numFacturas: number }
const MONEY = /^([+-]?)(0|[1-9]\d*)(?:[.,](\d{1,2}))?$/
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const ZERO = BigInt(0)
const HUNDRED = BigInt(100)
const SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/** Sólo acepta representación decimal exacta de hasta dos decimales; nunca redondea. */
export function exactSignedCents(value: string | null): number | null {
  if (value === null) return null
  const match = MONEY.exec(value)
  if (!match) return null
  try {
    const cents = (BigInt(match[2]) * HUNDRED + BigInt((match[3] || '').padEnd(2, '0') || '0')) * (match[1] === '-' ? BigInt(-1) : BigInt(1))
    return cents > SAFE || cents < -SAFE ? null : Number(cents)
  } catch { return null }
}

function monthOf(value: string | null): string | null {
  return value !== null && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value) ? value.slice(0, 7) : null
}
function add(left: number, right: number): number | null {
  const value = BigInt(left) + BigInt(right)
  return value > SAFE || value < -SAFE ? null : Number(value)
}
function addMany(...values: number[]): number | null {
  let current = ZERO
  for (const value of values) current += BigInt(value)
  return current > SAFE || current < -SAFE ? null : Number(current)
}
function percentageHundredths(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  const sign = (numerator < 0) !== (denominator < 0) ? BigInt(-1) : BigInt(1)
  const n = BigInt(Math.abs(numerator)) * BigInt(10_000)
  const d = BigInt(Math.abs(denominator))
  const result = ((n + d / BigInt(2)) / d) * sign
  return result > SAFE || result < -SAFE ? null : Number(result)
}
function emptyBucket(): Bucket {
  return { totalFacturadoCents: 0, numFacturas: 0, vvalleyFacturadoCents: 0, vvalleyNumFacturas: 0, arrowFacturadoCents: 0, arrowNumFacturas: 0, ipsNorteFacturadoCents: 0, ipsNorteNumFacturas: 0, mayoristasTotalCents: 0, totalRemesadoCents: 0, numRemesas: 0 }
}

/** No muta parcialmente un bucket: si una suma no es segura, el documento queda excluido completo. */
function applyInvoice(bucket: Bucket, invoice: LegacyIspInvoice, cents: number): boolean {
  const nextTotal = add(bucket.totalFacturadoCents, cents)
  if (nextTotal === null) return false
  let wholesalerField: 'vvalleyFacturadoCents' | 'arrowFacturadoCents' | 'ipsNorteFacturadoCents' | null = null
  let countField: 'vvalleyNumFacturas' | 'arrowNumFacturas' | 'ipsNorteNumFacturas' | null = null
  if (invoice.idCliente === VVALLEY_ID_CLIENTE) { wholesalerField = 'vvalleyFacturadoCents'; countField = 'vvalleyNumFacturas' }
  if (invoice.idCliente === ARROW_ID_CLIENTE) { wholesalerField = 'arrowFacturadoCents'; countField = 'arrowNumFacturas' }
  if (invoice.idCliente === IPSNORTE_ID_CLIENTE) { wholesalerField = 'ipsNorteFacturadoCents'; countField = 'ipsNorteNumFacturas' }
  const nextWholesaler = wholesalerField ? add(bucket[wholesalerField], cents) : null
  const nextAllWholesalers = wholesalerField ? add(bucket.mayoristasTotalCents, cents) : null
  if ((wholesalerField && (nextWholesaler === null || nextAllWholesalers === null)) || !Number.isSafeInteger(bucket.numFacturas + 1)) return false
  bucket.totalFacturadoCents = nextTotal; bucket.numFacturas++
  if (wholesalerField && countField) {
    bucket[wholesalerField] = nextWholesaler as number; bucket.mayoristasTotalCents = nextAllWholesalers as number; bucket[countField]++
  }
  return true
}

export function calculateMonthlyInvoicing(invoices: readonly LegacyIspInvoice[], remittances: readonly LegacyRemittance[], query: MonthlyInvoicingQuery): MonthlyInvoicingResult {
  if (query.mes !== null && !MONTH.test(query.mes)) throw new Error('mes debe tener formato YYYY-MM.')
  const months = new Map<string, Bucket>(); const series = new Map<string, SeriesBucket>()
  let invoicesExcludedInvalidDate = 0, invoicesExcludedInvalidAmount = 0, remittancesExcludedInvalidDate = 0, remittancesExcludedInvalidAmount = 0
  for (const invoice of invoices) {
    const mes = monthOf(invoice.fechaISO); if (!mes) { invoicesExcludedInvalidDate++; continue }
    const cents = exactSignedCents(invoice.totalText); if (cents === null) { invoicesExcludedInvalidAmount++; continue }
    const bucket = months.get(mes) || emptyBucket(); if (!applyInvoice(bucket, invoice, cents)) { invoicesExcludedInvalidAmount++; continue }; months.set(mes, bucket)
    if (query.mes === null || query.mes === mes) {
      const serie = invoice.serieFactura?.trim() || 'Sin serie'; const prior = series.get(serie) || { totalFacturadoCents: 0, numFacturas: 0 }
      const next = add(prior.totalFacturadoCents, cents)
      if (next === null || !Number.isSafeInteger(prior.numFacturas + 1)) { invoicesExcludedInvalidAmount++; continue }
      series.set(serie, { totalFacturadoCents: next, numFacturas: prior.numFacturas + 1 })
    }
  }
  for (const remittance of remittances) {
    const mes = monthOf(remittance.fechaISO); if (!mes) { remittancesExcludedInvalidDate++; continue }
    const cents = exactSignedCents(remittance.totalText); if (cents === null) { remittancesExcludedInvalidAmount++; continue }
    const bucket = months.get(mes) || emptyBucket(); const next = add(bucket.totalRemesadoCents, cents)
    if (next === null || !Number.isSafeInteger(bucket.numRemesas + 1)) { remittancesExcludedInvalidAmount++; continue }
    bucket.totalRemesadoCents = next; bucket.numRemesas++; months.set(mes, bucket)
  }
  const resumenMensual = [...months].map(([mes, value]) => ({ mes, ...value, mayoristasPorcentajeCentimas: percentageHundredths(value.mayoristasTotalCents, value.totalFacturadoCents) })).sort((a, b) => a.mes.localeCompare(b.mes))
  const porSerie = [...series].map(([serie, value]) => ({ serie, ...value })).sort((a, b) => b.totalFacturadoCents - a.totalFacturadoCents || a.serie.localeCompare(b.serie, 'es'))
  return { resumenMensual, porSerie, diagnostics: { invoicesExcludedInvalidDate, invoicesExcludedInvalidAmount, remittancesExcludedInvalidDate, remittancesExcludedInvalidAmount, seriesMonth: query.mes, source: 'FACTURA_ISP_Y_REMESA_ISP_HISTORICAS', payments: 'NO_CALCULADOS_AQUI__B7_B4_B6_ES_LA_UNICA_FUENTE_DE_COBRADO_Y_PENDIENTE' } }
}

export const __monthlyTestOnly = { addMany }
