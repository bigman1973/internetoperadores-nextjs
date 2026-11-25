import type { BankCoverage, InvoiceSettlement } from './bank-invoicing-core'

/**
 * Analítica de Facturación (gráficas). Cálculo puro y determinista, en servidor,
 * sobre las MISMAS liquidaciones (InvoiceSettlement) que alimentan la tabla y las
 * tarjetas. Nada se lee de nuevo ni se recalcula en el navegador: las cifras de las
 * gráficas son sumas de los mismos céntimos exactos del DTO B7.
 *
 * Regla que separa deuda real de falta de datos:
 *  - «Pendiente real»: factura pendiente cuya fecha de referencia (vencimiento, o
 *    fecha de factura si no hay) es igual o anterior al corte bancario verificado de
 *    TODAS las cuentas activas. El banco ya debería mostrar el cobro y no aparece.
 *  - «Sin extracto bancario cargado»: factura pendiente posterior al corte, o sin
 *    corte verificable. No se sabe si se cobró; NO es deuda.
 *  - «En revisión»: el cálculo B7 no puede atribuir el cobro (importe no calculable).
 */
export interface AnalyticsAggregate { cents: number; count: number }

export interface AnalyticsMonth {
  /** 1..12 */
  mes: number
  facturado: number
  facturadoPrevio: number
  cobrado: number
  pendienteReal: number
  sinExtracto: number
  revision: number
  facturas: number
}

export interface AnalyticsSerie {
  serie: string
  facturado: number
  facturas: number
  cobrado: number
  pendienteReal: number
  sinExtracto: number
}

export interface AnalyticsClient {
  cliente: string
  facturado: number
  facturas: number
  /** Cobro documental confirmado (suma de los mismos centimos pagados de B7). */
  cobrado: number
  /** Importe de las facturas en revision (cobro no atribuible). */
  revision: number
  pendienteReal: number
  sinExtracto: number
  sociedades: number
}

export interface AnalyticsAgingBucket {
  tramo: string
  pendienteReal: number
  sinExtracto: number
  facturasReal: number
  facturasSinExtracto: number
}

export interface BankInvoicingAnalytics {
  anioGrafico: number | null
  anioPrevio: number | null
  aniosDisponibles: number[]
  corte: {
    estado: BankCoverage['status']
    fecha: string | null
    cuentasVerificadas: number
    cuentasActivas: number
  }
  desglosePendiente: {
    real: AnalyticsAggregate
    sinExtracto: AnalyticsAggregate
    revision: AnalyticsAggregate
  }
  mensual: AnalyticsMonth[]
  porSerie: AnalyticsSerie[]
  topClientes: AnalyticsClient[]
  restoClientes: AnalyticsClient | null
  antiguedad: AnalyticsAgingBucket[]
  /** Facturas del conjunto filtrado sin importe verificable (no entran en ninguna suma). */
  sinImporte: number
}

export interface AnalyticsQuery {
  q: string | null
  mes: string | null
  anio: number | null
  estado: InvoiceSettlement['paymentState'] | null
}

export const AGING_BUCKETS: ReadonlyArray<{ tramo: string; max: number }> = [
  { tramo: '0-30 días', max: 30 },
  { tramo: '31-60 días', max: 60 },
  { tramo: '61-90 días', max: 90 },
  { tramo: '91-180 días', max: 180 },
  { tramo: '181-365 días', max: 365 },
  { tramo: 'Más de 1 año', max: Number.POSITIVE_INFINITY },
]

type Bucket = 'REAL' | 'SIN_EXTRACTO' | 'REVISION' | 'COBRADA'

function safeAdd(a: number, b: number): number {
  const sum = a + b
  if (!Number.isSafeInteger(sum)) throw new Error('ANALITICA_SUMA_NO_SEGURA')
  return sum
}

function yearOf(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  return Number(iso.slice(0, 4))
}

function monthOf(iso: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  return Number(iso.slice(5, 7))
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Corte efectivo: sólo cuando TODAS las cuentas activas tienen corte verificable. */
export function effectiveCutoff(coverage: BankCoverage): string | null {
  return coverage.status === 'KNOWN' && coverage.asOf ? coverage.asOf : null
}

export function classifyInvoice(invoice: InvoiceSettlement, cutoff: string | null): Bucket {
  if (invoice.paymentState === 'PENDIENTE_COBRO_REVISION') return 'REVISION'
  if (invoice.paymentState === 'COBRADA_CALCULADA') return 'COBRADA'
  const reference = invoice.fechaVencimientoISO ?? invoice.fechaISO
  return cutoff !== null && reference !== null && reference <= cutoff ? 'REAL' : 'SIN_EXTRACTO'
}

function matchesQ(invoice: InvoiceSettlement, q: string | null): boolean {
  if (!q) return true
  const needle = q.toLocaleLowerCase('es-ES')
  return [invoice.invoiceId, invoice.numFactura, invoice.cliente, invoice.facturaISPId === null ? null : String(invoice.facturaISPId)]
    .some((value) => value !== null && value.toLocaleLowerCase('es-ES').includes(needle))
}

/** Grupo de cliente: Draxton es un grupo de sociedades que se trata como un mismo cliente. */
export function clientGroup(name: string | null): { key: string; label: string } {
  const clean = (name ?? '').trim().replace(/\s+/g, ' ')
  if (!clean) return { key: 'SIN_CLIENTE', label: 'Sin cliente' }
  if (/^draxton\b/i.test(clean)) return { key: 'DRAXTON', label: 'Draxton (grupo)' }
  return { key: clean.toLocaleUpperCase('es-ES'), label: clean }
}

export function serieFromInvoiceNumber(numFactura: string | null): string {
  if (!numFactura) return 'Sin serie'
  const first = numFactura.split('/')[0]
  const trimmed = first.replace(/\d{2}$/, '')
  return trimmed || first || 'Sin serie'
}

export interface AnalyticsInput {
  /** Población completa de FacturaEmitida ya calculada (no sólo la página). */
  settlements: InvoiceSettlement[]
  /** Serie real de facturas_emitidas.serie por invoiceId; si falta se deriva del número. */
  serieById: ReadonlyMap<string, string | null>
  coverage: BankCoverage
  query: AnalyticsQuery
  /** Fecha civil de hoy, YYYY-MM-DD (inyectada para que sea determinista). */
  today: string
  matching: InvoiceSettlement[]
}

function emptyMonth(mes: number): AnalyticsMonth {
  return { mes, facturado: 0, facturadoPrevio: 0, cobrado: 0, pendienteReal: 0, sinExtracto: 0, revision: 0, facturas: 0 }
}

export function buildBankInvoicingAnalytics(input: AnalyticsInput): BankInvoicingAnalytics {
  const { settlements, serieById, coverage, query, today, matching } = input
  const cutoff = effectiveCutoff(coverage)

  const years = new Set<number>()
  for (const invoice of settlements) {
    const year = yearOf(invoice.fechaISO)
    if (year !== null) years.add(year)
  }
  const aniosDisponibles = [...years].sort((a, b) => b - a)
  const mesYear = query.mes ? Number(query.mes.slice(0, 4)) : null
  const anioGrafico = query.anio ?? mesYear ?? (aniosDisponibles[0] ?? null)
  const anioPrevio = anioGrafico === null ? null : anioGrafico - 1

  // Gráficas 1 y 2 (año frente a año anterior; cobrado y pendiente por mes): siguen la
  // búsqueda de texto pero no el mes ni el estado, para poder comparar meses entre sí.
  const monthly = Array.from({ length: 12 }, (_, index) => emptyMonth(index + 1))
  for (const invoice of settlements) {
    if (!matchesQ(invoice, query.q)) continue
    const year = yearOf(invoice.fechaISO)
    const month = monthOf(invoice.fechaISO)
    if (year === null || month === null || invoice.targetCents === null) continue
    const row = monthly[month - 1]
    if (year === anioPrevio) {
      row.facturadoPrevio = safeAdd(row.facturadoPrevio, invoice.targetCents)
    } else if (year === anioGrafico) {
      row.facturado = safeAdd(row.facturado, invoice.targetCents)
      row.facturas += 1
      const bucket = classifyInvoice(invoice, cutoff)
      if (bucket === 'REVISION') row.revision = safeAdd(row.revision, invoice.targetCents)
      else {
        row.cobrado = safeAdd(row.cobrado, invoice.paidDocumentaryCents ?? 0)
        const remaining = invoice.remainingCents ?? 0
        if (bucket === 'REAL') row.pendienteReal = safeAdd(row.pendienteReal, remaining)
        else if (bucket === 'SIN_EXTRACTO') row.sinExtracto = safeAdd(row.sinExtracto, remaining)
      }
    }
  }

  // Gráficas 3, 4 y 5 y el desglose del pendiente: exactamente la población de la tabla.
  const real: AnalyticsAggregate = { cents: 0, count: 0 }
  const sinExtracto: AnalyticsAggregate = { cents: 0, count: 0 }
  const revision: AnalyticsAggregate = { cents: 0, count: 0 }
  const series = new Map<string, AnalyticsSerie>()
  const clients = new Map<string, AnalyticsClient & { names: Set<string> }>()
  const aging: AnalyticsAgingBucket[] = AGING_BUCKETS.map((b) => ({ tramo: b.tramo, pendienteReal: 0, sinExtracto: 0, facturasReal: 0, facturasSinExtracto: 0 }))
  let sinImporte = 0

  for (const invoice of matching) {
    if (invoice.targetCents === null) { sinImporte += 1; continue }
    const bucket = classifyInvoice(invoice, cutoff)
    const remaining = bucket === 'REVISION' ? 0 : invoice.remainingCents ?? 0
    const paid = bucket === 'REVISION' ? 0 : invoice.paidDocumentaryCents ?? 0

    if (bucket === 'REAL') { real.cents = safeAdd(real.cents, remaining); real.count += 1 }
    else if (bucket === 'SIN_EXTRACTO') { sinExtracto.cents = safeAdd(sinExtracto.cents, remaining); sinExtracto.count += 1 }
    else if (bucket === 'REVISION') { revision.cents = safeAdd(revision.cents, invoice.targetCents); revision.count += 1 }

    const serieName = (serieById.get(invoice.invoiceId) ?? '').trim() || serieFromInvoiceNumber(invoice.numFactura)
    const serie = series.get(serieName) ?? { serie: serieName, facturado: 0, facturas: 0, cobrado: 0, pendienteReal: 0, sinExtracto: 0 }
    serie.facturado = safeAdd(serie.facturado, invoice.targetCents)
    serie.facturas += 1
    serie.cobrado = safeAdd(serie.cobrado, paid)
    if (bucket === 'REAL') serie.pendienteReal = safeAdd(serie.pendienteReal, remaining)
    if (bucket === 'SIN_EXTRACTO') serie.sinExtracto = safeAdd(serie.sinExtracto, remaining)
    series.set(serieName, serie)

    const group = clientGroup(invoice.cliente)
    const client = clients.get(group.key) ?? { cliente: group.label, facturado: 0, facturas: 0, cobrado: 0, revision: 0, pendienteReal: 0, sinExtracto: 0, sociedades: 0, names: new Set<string>() }
    client.facturado = safeAdd(client.facturado, invoice.targetCents)
    client.facturas += 1
    client.cobrado = safeAdd(client.cobrado, paid)
    if (bucket === 'REVISION') client.revision = safeAdd(client.revision, invoice.targetCents)
    client.names.add((invoice.cliente ?? '').trim().toLocaleUpperCase('es-ES'))
    if (bucket === 'REAL') client.pendienteReal = safeAdd(client.pendienteReal, remaining)
    if (bucket === 'SIN_EXTRACTO') client.sinExtracto = safeAdd(client.sinExtracto, remaining)
    clients.set(group.key, client)

    if ((bucket === 'REAL' || bucket === 'SIN_EXTRACTO') && invoice.fechaISO) {
      const age = Math.max(0, daysBetween(invoice.fechaISO, today))
      const index = AGING_BUCKETS.findIndex((b) => age <= b.max)
      const slot = aging[index === -1 ? aging.length - 1 : index]
      if (bucket === 'REAL') { slot.pendienteReal = safeAdd(slot.pendienteReal, remaining); slot.facturasReal += 1 }
      else { slot.sinExtracto = safeAdd(slot.sinExtracto, remaining); slot.facturasSinExtracto += 1 }
    }
  }

  const clientRows = [...clients.values()]
    .map(({ names, ...rest }) => ({ ...rest, sociedades: names.size }))
    .sort((a, b) => b.facturado - a.facturado || a.cliente.localeCompare(b.cliente, 'es'))
  const topClientes = clientRows.slice(0, 10)
  const rest = clientRows.slice(10)
  const restoClientes: AnalyticsClient | null = rest.length === 0 ? null : rest.reduce<AnalyticsClient>((acc, row) => ({
    cliente: `Resto (${rest.length} clientes)`,
    facturado: safeAdd(acc.facturado, row.facturado),
    facturas: acc.facturas + row.facturas,
    cobrado: safeAdd(acc.cobrado, row.cobrado),
    revision: safeAdd(acc.revision, row.revision),
    pendienteReal: safeAdd(acc.pendienteReal, row.pendienteReal),
    sinExtracto: safeAdd(acc.sinExtracto, row.sinExtracto),
    sociedades: acc.sociedades + row.sociedades,
  }), { cliente: '', facturado: 0, facturas: 0, cobrado: 0, revision: 0, pendienteReal: 0, sinExtracto: 0, sociedades: 0 })

  return {
    anioGrafico,
    anioPrevio,
    aniosDisponibles,
    corte: {
      estado: coverage.status,
      fecha: cutoff,
      cuentasVerificadas: coverage.accountsWithKnownCutoff,
      cuentasActivas: coverage.activeAccountCount,
    },
    desglosePendiente: { real, sinExtracto, revision },
    mensual: monthly,
    porSerie: [...series.values()].sort((a, b) => b.facturado - a.facturado || a.serie.localeCompare(b.serie, 'es')),
    topClientes,
    restoClientes,
    antiguedad: aging,
    sinImporte,
  }
}
