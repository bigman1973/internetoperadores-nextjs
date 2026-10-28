/**
 * Cliente B7: contrato de lectura para /api/admin/facturacion-banco.
 *
 * No deriva identidad, no corrige importes y no convierte null en cero. Este
 * parser está deliberadamente separado del núcleo de cálculo para que el
 * navegador sólo acepte el DTO JSON ya calculado por el servidor.
 */

export const B7_AREA_PERMISO = 'admin.facturacion'
export const B7_PAGE_SIZE = 50
export const B7_MAX_PAGE_SIZE = 100
export const B7_MAX_OFFSET = 100_000

export type B7PaymentState = 'COBRADA_CALCULADA' | 'PENDIENTE_COBRO' | 'PENDIENTE_COBRO_REVISION'
export type B7PaymentSource = 'B4_DIRECTO' | 'B4_REMESA'
export type B7CoverageStatus = 'KNOWN' | 'PARTIAL' | 'UNKNOWN'

export interface B7MoneyAggregate {
  /** Total verificable; null nunca equivale a 0. */
  cents: number | null
  /** Porción comprobable, incluso si el total completo no lo es. */
  knownCents: number | null
  unknownInvoiceCount: number
}

export interface B7Summary {
  facturado: B7MoneyAggregate
  cobroDocumentalConfirmado: B7MoneyAggregate
  pendienteNoConfirmado: B7MoneyAggregate
  diferenciasCaja: {
    atribuible: B7MoneyAggregate
    sinAtribuir: B7MoneyAggregate
  }
  invoicesTotal: number
  cobradasCalculadas: number
  pendientesCobro: number
  revisiones: number
}

export interface B7BankCoverage {
  status: B7CoverageStatus
  /** Fecha mínima de corte verificada cuando está disponible; no se inventa. */
  asOf: string | null
  activeAccountCount: number
  accountsWithKnownCutoff: number
}

export interface B7InvoiceSettlement {
  /** Identidad canónica FacturaEmitida. */
  invoiceId: string
  numFactura: string | null
  cliente: string | null
  fechaISO: string | null
  fechaVencimientoISO: string | null
  /** Sólo metadata del espejo ISP mediante FK explícita; no se usa para buscar. */
  facturaISPId: number | null
  targetCents: number | null
  paidDocumentaryCents: number | null
  remainingCents: number | null
  /** Caja atribuible opcional; no modifica ni reparte deuda documental. */
  cashCents: number | null
  attributableCashDifferenceCents: number | null
  paymentSources: B7PaymentSource[]
  paymentState: B7PaymentState
  /** Los códigos no reconocidos se conservan textualmente para revisión humana. */
  reasons: string[]
}

export interface B7GetQueryDto {
  q: string | null
  mes: string | null
  estado: B7PaymentState | null
  limit: number
  offset: number
}

export interface B7ReadDto {
  recurso: 'facturacionBancoB7'
  query: B7GetQueryDto
  pagination: { limit: number; offset: number; total: number }
  /** Agregado de toda la población coincidente en servidor, no de la página. */
  summary: B7Summary
  bankCoverage: B7BankCoverage
  items: B7InvoiceSettlement[]
  calculationBasis: 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA__RECIBO_REMESA_B7_V1'
}

export type B7ParseResult =
  | { ok: true; value: B7ReadDto }
  | { ok: false; error: string }

type UnknownRecord = Record<string, unknown>

const PAYMENT_STATES: readonly B7PaymentState[] = ['COBRADA_CALCULADA', 'PENDIENTE_COBRO', 'PENDIENTE_COBRO_REVISION']
const PAYMENT_SOURCES: readonly B7PaymentSource[] = ['B4_DIRECTO', 'B4_REMESA']
const COVERAGE_STATUSES: readonly B7CoverageStatus[] = ['KNOWN', 'PARTIAL', 'UNKNOWN']
const CALCULATION_BASIS = 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA__RECIBO_REMESA_B7_V1' as const
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} debe ser texto.`)
  return value
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path)
}

function safeInteger(value: unknown, path: string, minimum?: number, maximum?: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${path} debe ser un entero seguro JSON.`)
  if (minimum !== undefined && value < minimum) throw new Error(`${path} no puede ser menor que ${minimum}.`)
  if (maximum !== undefined && value > maximum) throw new Error(`${path} no puede ser mayor que ${maximum}.`)
  return value
}

function nullableCents(value: unknown, path: string): number | null {
  return value === null ? null : safeInteger(value, path)
}

function dateOrNull(value: unknown, path: string): string | null {
  const result = nullableText(value, path)
  if (result === null) return null
  if (!DATE_RE.test(result)) throw new Error(`${path} debe ser una fecha ISO YYYY-MM-DD o null.`)
  const [year, month, day] = result.split('-').map((part) => Number(part))
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new Error(`${path} no contiene una fecha civil válida.`)
  }
  return result
}

function recordAt(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${path} debe ser un objeto.`)
  return value
}

function arrayAt(value: unknown, path: string, cap: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} debe ser una lista.`)
  if (value.length > cap) throw new Error(`${path} supera el máximo contractual de ${cap} elementos.`)
  return value
}

function paymentState(value: unknown, path: string): B7PaymentState {
  if (typeof value !== 'string' || !PAYMENT_STATES.includes(value as B7PaymentState)) throw new Error(`${path} no es un estado B7 válido.`)
  return value as B7PaymentState
}

function paymentSource(value: unknown, path: string): B7PaymentSource {
  if (typeof value !== 'string' || !PAYMENT_SOURCES.includes(value as B7PaymentSource)) throw new Error(`${path} no es una fuente B7 válida.`)
  return value as B7PaymentSource
}

function moneyAggregate(value: unknown, path: string): B7MoneyAggregate {
  const row = recordAt(value, path)
  return {
    cents: nullableCents(row.cents, `${path}.cents`),
    knownCents: nullableCents(row.knownCents, `${path}.knownCents`),
    unknownInvoiceCount: safeInteger(row.unknownInvoiceCount, `${path}.unknownInvoiceCount`, 0),
  }
}

function summary(value: unknown): B7Summary {
  const row = recordAt(value, 'summary')
  const differences = recordAt(row.diferenciasCaja, 'summary.diferenciasCaja')
  return {
    facturado: moneyAggregate(row.facturado, 'summary.facturado'),
    cobroDocumentalConfirmado: moneyAggregate(row.cobroDocumentalConfirmado, 'summary.cobroDocumentalConfirmado'),
    pendienteNoConfirmado: moneyAggregate(row.pendienteNoConfirmado, 'summary.pendienteNoConfirmado'),
    diferenciasCaja: {
      atribuible: moneyAggregate(differences.atribuible, 'summary.diferenciasCaja.atribuible'),
      sinAtribuir: moneyAggregate(differences.sinAtribuir, 'summary.diferenciasCaja.sinAtribuir'),
    },
    invoicesTotal: safeInteger(row.invoicesTotal, 'summary.invoicesTotal', 0),
    cobradasCalculadas: safeInteger(row.cobradasCalculadas, 'summary.cobradasCalculadas', 0),
    pendientesCobro: safeInteger(row.pendientesCobro, 'summary.pendientesCobro', 0),
    revisiones: safeInteger(row.revisiones, 'summary.revisiones', 0),
  }
}

function coverage(value: unknown): B7BankCoverage {
  const row = recordAt(value, 'bankCoverage')
  if (typeof row.status !== 'string' || !COVERAGE_STATUSES.includes(row.status as B7CoverageStatus)) {
    throw new Error('bankCoverage.status no es válido.')
  }
  return {
    status: row.status as B7CoverageStatus,
    asOf: dateOrNull(row.asOf, 'bankCoverage.asOf'),
    activeAccountCount: safeInteger(row.activeAccountCount, 'bankCoverage.activeAccountCount', 0),
    accountsWithKnownCutoff: safeInteger(row.accountsWithKnownCutoff, 'bankCoverage.accountsWithKnownCutoff', 0),
  }
}

function invoice(value: unknown, index: number): B7InvoiceSettlement {
  const path = `items[${index}]`
  const row = recordAt(value, path)
  const sources = arrayAt(row.paymentSources, `${path}.paymentSources`, 2).map((source, sourceIndex) => paymentSource(source, `${path}.paymentSources[${sourceIndex}]`))
  if (new Set(sources).size !== sources.length) throw new Error(`${path}.paymentSources no puede repetir fuentes.`)
  const reasons = arrayAt(row.reasons, `${path}.reasons`, 100).map((reason, reasonIndex) => {
    const parsed = text(reason, `${path}.reasons[${reasonIndex}]`)
    if (!parsed) throw new Error(`${path}.reasons[${reasonIndex}] no puede ser vacío.`)
    return parsed
  })
  return {
    invoiceId: text(row.invoiceId, `${path}.invoiceId`),
    numFactura: nullableText(row.numFactura, `${path}.numFactura`),
    cliente: nullableText(row.cliente, `${path}.cliente`),
    fechaISO: dateOrNull(row.fechaISO, `${path}.fechaISO`),
    fechaVencimientoISO: dateOrNull(row.fechaVencimientoISO, `${path}.fechaVencimientoISO`),
    facturaISPId: row.facturaISPId === null ? null : safeInteger(row.facturaISPId, `${path}.facturaISPId`),
    targetCents: nullableCents(row.targetCents, `${path}.targetCents`),
    paidDocumentaryCents: nullableCents(row.paidDocumentaryCents, `${path}.paidDocumentaryCents`),
    remainingCents: nullableCents(row.remainingCents, `${path}.remainingCents`),
    cashCents: nullableCents(row.cashCents, `${path}.cashCents`),
    attributableCashDifferenceCents: nullableCents(row.attributableCashDifferenceCents, `${path}.attributableCashDifferenceCents`),
    paymentSources: sources,
    paymentState: paymentState(row.paymentState, `${path}.paymentState`),
    reasons,
  }
}

function query(value: unknown): B7GetQueryDto {
  const row = recordAt(value, 'query')
  const q = nullableText(row.q, 'query.q')
  if (q !== null && q.length > 120) throw new Error('query.q supera 120 caracteres.')
  const mes = nullableText(row.mes, 'query.mes')
  if (mes !== null && !MONTH_RE.test(mes)) throw new Error('query.mes debe tener formato YYYY-MM o null.')
  return {
    q,
    mes,
    estado: row.estado === null ? null : paymentState(row.estado, 'query.estado'),
    limit: safeInteger(row.limit, 'query.limit', 1, B7_MAX_PAGE_SIZE),
    offset: safeInteger(row.offset, 'query.offset', 0, B7_MAX_OFFSET),
  }
}

/**
 * Valida todas las partes económicas obligatorias. Devuelve error explícito ante
 * datos incompletos: una respuesta defectuosa nunca se presenta como lista o KPI a cero.
 */
export function parseBankInvoicingDto(value: unknown): B7ParseResult {
  try {
    const row = recordAt(value, 'respuesta')
    if (row.recurso !== 'facturacionBancoB7') throw new Error('recurso no corresponde a facturación bancaria B7.')
    if (row.calculationBasis !== CALCULATION_BASIS) throw new Error('calculationBasis no corresponde a la base documental B7.')
    const parsedQuery = query(row.query)
    const paginationRecord = recordAt(row.pagination, 'pagination')
    const pagination = {
      limit: safeInteger(paginationRecord.limit, 'pagination.limit', 1, B7_MAX_PAGE_SIZE),
      offset: safeInteger(paginationRecord.offset, 'pagination.offset', 0, B7_MAX_OFFSET),
      total: safeInteger(paginationRecord.total, 'pagination.total', 0),
    }
    if (pagination.limit !== parsedQuery.limit || pagination.offset !== parsedQuery.offset) {
      throw new Error('pagination no coincide con la consulta aplicada por el servidor.')
    }
    const rows = arrayAt(row.items, 'items', B7_MAX_PAGE_SIZE)
    if (rows.length > pagination.limit) throw new Error('items contiene más filas que el límite de página.')
    if (pagination.offset > pagination.total || (rows.length > 0 && pagination.offset >= pagination.total)) {
      throw new Error('pagination está fuera del total devuelto.')
    }
    return {
      ok: true,
      value: {
        recurso: 'facturacionBancoB7',
        query: parsedQuery,
        pagination,
        summary: summary(row.summary),
        bankCoverage: coverage(row.bankCoverage),
        items: rows.map((item, index) => invoice(item, index)),
        calculationBasis: CALCULATION_BASIS,
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Respuesta B7 inválida.' }
  }
}

/**
 * Formato exacto de céntimos firmados: sólo aritmética BigInt; no usa flotantes,
 * redondeo ni `toFixed`. `null` se trata en la UI como importe no verificable.
 */
export function formatEuroExact(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Los céntimos deben ser un entero seguro.')
  const value = BigInt(cents)
  const zero = BigInt(0)
  const hundred = BigInt(100)
  const negative = value < zero
  const absolute = negative ? -value : value
  const euros = absolute / hundred
  const decimal = (absolute % hundred).toString().padStart(2, '0')
  const groupedEuros = euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${groupedEuros},${decimal} €`
}
