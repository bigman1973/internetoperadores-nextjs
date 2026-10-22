/** Estimación documental informativa; no es declaración ni lee banco/cuentas/movimientos. */
export type FiscalPeriod = Readonly<{ desde: string; hasta: string }>
export type ReceivedInvoiceForEstimate = Readonly<{ id: string; fechaISO: string | null; baseText: string | null; ivaText: string | null; irpfText: string | null; totalText: string | null; b2Economic: boolean; deducibleIva: boolean; rejected: boolean; confirmingDraxtonCommunication: boolean }>
export type EmittedInvoiceForEstimate = Readonly<{ id: string; fechaISO: string | null; baseText: string | null; ivaText: string | null; irpfText: string | null; totalText: string | null; facturaISPId: number | null; estado: string | null }>
export type ExactDocument = Readonly<{ baseCents: number; ivaCents: number; irpfCents: number; totalCents: number }>
export type FiscalEstimate = Readonly<{
  periodo: FiscalPeriod & { inclusivo: true; criterioFecha: 'FECHA_FACTURA_DOCUMENTAL' }
  recibidas: { numFacturas: number; baseCents: number; ivaSoportadoCents: number; irpfRetenidoCents: number; totalCents: number }
  emitidas: { numFacturas: number; baseCents: number; ivaRepercutidoCents: number; irpfRetenidoCents: number; totalCents: number; porEstado: Record<string, number> }
  ivaNetoDocumentalCents: number
  diagnostics: {
    receivedExcludedB2: number; receivedExcludedNonDeductibleVat: number; receivedExcludedRejected: number; receivedExcludedConfirmingDraxton: number; receivedExcludedInvalidPeriodDate: number; receivedExcludedInexactEconomics: number
    emittedExcludedInvalidPeriodDate: number; emittedExcludedInexactEconomics: number; emittedExcludedFiIspIdentityCollision: number; emittedExcludedRepeatedFiId: number
    notices: readonly ['ESTIMACION_INFORMATIVA_NO_DECLARACION', 'SIN_BANCO_SIN_MOVIMIENTOS_SIN_CUENTAS', 'ABONOS_FIRMADOS_SIN_ABS_NI_REDONDEO', 'IRPF_RECIBIDAS_Y_EMITIDAS_NO_SE_COMPENSAN_SIN_MODELO_FISCAL']
  }
}>
const MONEY = /^([+-]?)(0|[1-9]\d*)(?:[.,](\d{1,2}))?$/
const DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const SAFE = BigInt(Number.MAX_SAFE_INTEGER)
function dateValue(value: string): number | null { const found = DATE.exec(value); if (!found) return null; const date = new Date(`${value}T12:00:00.000Z`); return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date.getTime() }
export function parseFiscalPeriod(input: FiscalPeriod): FiscalPeriod { const from = dateValue(input.desde), to = dateValue(input.hasta); if (from === null || to === null || from > to) throw new Error('El período debe usar fechas ISO válidas y desde no puede ser posterior a hasta.'); return { desde: input.desde, hasta: input.hasta } }
export function exactCents(value: string | null): number | null { if (value === null) return null; const match = MONEY.exec(value); if (!match) return null; try { const cents = (BigInt(match[2]) * BigInt(100) + BigInt((match[3] || '').padEnd(2, '0') || '0')) * (match[1] === '-' ? BigInt(-1) : BigInt(1)); return cents > SAFE || cents < -SAFE ? null : Number(cents) } catch { return null } }
function sum(...values: number[]): number | null { let result = BigInt(0); for (const value of values) { if (!Number.isSafeInteger(value)) return null; result += BigInt(value) }; return result > SAFE || result < -SAFE ? null : Number(result) }
export function exactDocument(row: Pick<ReceivedInvoiceForEstimate | EmittedInvoiceForEstimate, 'baseText' | 'ivaText' | 'irpfText' | 'totalText'>): ExactDocument | null { const baseCents = exactCents(row.baseText), ivaCents = exactCents(row.ivaText), irpfCents = exactCents(row.irpfText), totalCents = exactCents(row.totalText); if (baseCents === null || ivaCents === null || irpfCents === null || totalCents === null) return null; return sum(baseCents, ivaCents, -irpfCents) === totalCents ? { baseCents, ivaCents, irpfCents, totalCents } : null }
function belongs(fechaISO: string | null, period: FiscalPeriod) { return fechaISO !== null && dateValue(fechaISO) !== null && fechaISO >= period.desde && fechaISO <= period.hasta }
type Totals = { numFacturas: number; baseCents: number; ivaCents: number; irpfCents: number; totalCents: number }
function totals(): Totals { return { numFacturas: 0, baseCents: 0, ivaCents: 0, irpfCents: 0, totalCents: 0 } }
function add(target: Totals, row: ExactDocument, includeVat: boolean): boolean { const base = sum(target.baseCents, row.baseCents), vat = sum(target.ivaCents, includeVat ? row.ivaCents : 0), irpf = sum(target.irpfCents, row.irpfCents), total = sum(target.totalCents, row.totalCents); if (base === null || vat === null || irpf === null || total === null || !Number.isSafeInteger(target.numFacturas + 1)) return false; target.numFacturas++; target.baseCents = base; target.ivaCents = vat; target.irpfCents = irpf; target.totalCents = total; return true }
function collisions(rows: readonly EmittedInvoiceForEstimate[]) { const counts = new Map<number, number>(); for (const row of rows) if (row.facturaISPId !== null) counts.set(row.facturaISPId, (counts.get(row.facturaISPId) || 0) + 1); return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id)) }

/**
 * Recibidas válidas entran en base/IRPF/total aunque su IVA no sea deducible;
 * sólo su IVA queda fuera de IVA soportado. Una ecuación compuesta inválida se
 * excluye entera y queda diagnosticada; nunca se descompone ni se inventa.
 */
export function calculateFiscalEstimate(periodInput: FiscalPeriod, received: readonly ReceivedInvoiceForEstimate[], emitted: readonly EmittedInvoiceForEstimate[]): FiscalEstimate {
  const period = parseFiscalPeriod(periodInput); const receivedTotals = totals(), emittedTotals = totals()
  let receivedExcludedB2 = 0, receivedExcludedNonDeductibleVat = 0, receivedExcludedRejected = 0, receivedExcludedConfirmingDraxton = 0, receivedExcludedInvalidPeriodDate = 0, receivedExcludedInexactEconomics = 0
  let emittedExcludedInvalidPeriodDate = 0, emittedExcludedInexactEconomics = 0, emittedExcludedFiIspIdentityCollision = 0, emittedExcludedRepeatedFiId = 0
  for (const row of received) {
    if (!belongs(row.fechaISO, period)) { receivedExcludedInvalidPeriodDate++; continue }; if (!row.b2Economic) { receivedExcludedB2++; continue }; if (row.confirmingDraxtonCommunication) { receivedExcludedConfirmingDraxton++; continue }; if (row.rejected) { receivedExcludedRejected++; continue }
    const document = exactDocument(row); if (!document) { receivedExcludedInexactEconomics++; continue }
    if (!row.deducibleIva) receivedExcludedNonDeductibleVat++
    if (!add(receivedTotals, document, row.deducibleIva)) { receivedExcludedInexactEconomics++ }
  }
  const conflictingIsp = collisions(emitted), seenIds = new Set<string>(), porEstado: Record<string, number> = {}
  for (const row of emitted) {
    if (!belongs(row.fechaISO, period)) { emittedExcludedInvalidPeriodDate++; continue }; if (seenIds.has(row.id)) { emittedExcludedRepeatedFiId++; continue }; seenIds.add(row.id)
    if (row.facturaISPId !== null && conflictingIsp.has(row.facturaISPId)) { emittedExcludedFiIspIdentityCollision++; continue }
    const document = exactDocument(row); if (!document || !add(emittedTotals, document, true)) { emittedExcludedInexactEconomics++; continue }
    const state = row.estado?.trim() || 'SIN_ESTADO'; porEstado[state] = (porEstado[state] || 0) + 1
  }
  const ivaNetoDocumentalCents = sum(emittedTotals.ivaCents, -receivedTotals.ivaCents); if (ivaNetoDocumentalCents === null) throw new Error('La suma de IVA excede el rango seguro; no se publica un cero sustitutivo.')
  return { periodo: { ...period, inclusivo: true, criterioFecha: 'FECHA_FACTURA_DOCUMENTAL' }, recibidas: { numFacturas: receivedTotals.numFacturas, baseCents: receivedTotals.baseCents, ivaSoportadoCents: receivedTotals.ivaCents, irpfRetenidoCents: receivedTotals.irpfCents, totalCents: receivedTotals.totalCents }, emitidas: { numFacturas: emittedTotals.numFacturas, baseCents: emittedTotals.baseCents, ivaRepercutidoCents: emittedTotals.ivaCents, irpfRetenidoCents: emittedTotals.irpfCents, totalCents: emittedTotals.totalCents, porEstado }, ivaNetoDocumentalCents, diagnostics: { receivedExcludedB2, receivedExcludedNonDeductibleVat, receivedExcludedRejected, receivedExcludedConfirmingDraxton, receivedExcludedInvalidPeriodDate, receivedExcludedInexactEconomics, emittedExcludedInvalidPeriodDate, emittedExcludedInexactEconomics, emittedExcludedFiIspIdentityCollision, emittedExcludedRepeatedFiId, notices: ['ESTIMACION_INFORMATIVA_NO_DECLARACION', 'SIN_BANCO_SIN_MOVIMIENTOS_SIN_CUENTAS', 'ABONOS_FIRMADOS_SIN_ABS_NI_REDONDEO', 'IRPF_RECIBIDAS_Y_EMITIDAS_NO_SE_COMPENSAN_SIN_MODELO_FISCAL'] } }
}
