export type FiscalEstimateDto = {
  recurso: 'estimacionFiscalDocumental'
  estimacion: {
    periodo: { desde: string; hasta: string; inclusivo: true; criterioFecha: 'FECHA_FACTURA_DOCUMENTAL' }
    recibidas: { numFacturas: number; baseCents: number; ivaSoportadoCents: number; irpfRetenidoCents: number; totalCents: number }
    emitidas: { numFacturas: number; baseCents: number; ivaRepercutidoCents: number; irpfRetenidoCents: number; totalCents: number; porEstado: Record<string, number> }
    ivaNetoDocumentalCents: number
    diagnostics: {
      receivedExcludedB2: number; receivedExcludedNonDeductibleVat: number; receivedExcludedRejected: number; receivedExcludedConfirmingDraxton: number; receivedExcludedInvalidPeriodDate: number; receivedExcludedInexactEconomics: number
      emittedExcludedInvalidPeriodDate: number; emittedExcludedInexactEconomics: number; emittedExcludedFiIspIdentityCollision: number; emittedExcludedRepeatedFiId: number
      notices: readonly ['ESTIMACION_INFORMATIVA_NO_DECLARACION', 'SIN_BANCO_SIN_MOVIMIENTOS_SIN_CUENTAS', 'ABONOS_FIRMADOS_SIN_ABS_NI_REDONDEO', 'IRPF_RECIBIDAS_Y_EMITIDAS_NO_SE_COMPENSAN_SIN_MODELO_FISCAL']
    }
  }
}
export type FiscalParseResult = { ok: true; value: FiscalEstimateDto } | { ok: false; error: string }
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const REQUIRED = ['ESTIMACION_INFORMATIVA_NO_DECLARACION', 'SIN_BANCO_SIN_MOVIMIENTOS_SIN_CUENTAS', 'ABONOS_FIRMADOS_SIN_ABS_NI_REDONDEO', 'IRPF_RECIBIDAS_Y_EMITIDAS_NO_SE_COMPENSAN_SIN_MODELO_FISCAL'] as const
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} debe ser objeto.`); return value as Record<string, unknown> }
function integer(value: unknown, path: string): number { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${path} debe ser entero seguro.`); return value }
function nonnegative(value: unknown, path: string): number { const n = integer(value, path); if (n < 0) throw new Error(`${path} no puede ser negativo.`); return n }
function date(value: unknown, path: string): string { if (typeof value !== 'string' || !DATE.test(value)) throw new Error(`${path} debe ser fecha ISO.`); const check = new Date(`${value}T12:00:00.000Z`); if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== value) throw new Error(`${path} no es fecha civil válida.`); return value }
function totals(value: unknown, path: string, vatKey: 'ivaSoportadoCents' | 'ivaRepercutidoCents') {
  const r = record(value, path)
  return { numFacturas: nonnegative(r.numFacturas, `${path}.numFacturas`), baseCents: integer(r.baseCents, `${path}.baseCents`), [vatKey]: integer(r[vatKey], `${path}.${vatKey}`), irpfRetenidoCents: integer(r.irpfRetenidoCents, `${path}.irpfRetenidoCents`), totalCents: integer(r.totalCents, `${path}.totalCents`) }
}
export function parseFiscalEstimateDto(value: unknown): FiscalParseResult {
  try {
    const outer = record(value, 'respuesta')
    if (outer.recurso !== 'estimacionFiscalDocumental') throw new Error('recurso no corresponde a estimación documental.')
    const estimate = record(outer.estimacion, 'estimacion'), period = record(estimate.periodo, 'periodo')
    const desde = date(period.desde, 'periodo.desde'), hasta = date(period.hasta, 'periodo.hasta')
    if (desde > hasta || period.inclusivo !== true || period.criterioFecha !== 'FECHA_FACTURA_DOCUMENTAL') throw new Error('Período documental inválido.')
    const received = totals(estimate.recibidas, 'recibidas', 'ivaSoportadoCents')
    const emitted = totals(estimate.emitidas, 'emitidas', 'ivaRepercutidoCents')
    const states = record(record(estimate.emitidas, 'emitidas').porEstado, 'emitidas.porEstado')
    const porEstado: Record<string, number> = {}
    for (const [key, item] of Object.entries(states)) { if (!key || key.length > 80) throw new Error('Estado inválido.'); porEstado[key] = nonnegative(item, `estado.${key}`) }
    const diagnostics = record(estimate.diagnostics, 'diagnostics')
    if (!Array.isArray(diagnostics.notices) || diagnostics.notices.length !== REQUIRED.length || diagnostics.notices.some((item, index) => item !== REQUIRED[index])) throw new Error('Faltan avisos fiscales obligatorios.')
    const ivaNetoDocumentalCents = integer(estimate.ivaNetoDocumentalCents, 'ivaNetoDocumentalCents')
    if (ivaNetoDocumentalCents !== emitted.ivaRepercutidoCents - received.ivaSoportadoCents) throw new Error('Saldo de IVA no exacto.')
    return { ok: true, value: {
      recurso: 'estimacionFiscalDocumental',
      estimacion: {
        periodo: { desde, hasta, inclusivo: true, criterioFecha: 'FECHA_FACTURA_DOCUMENTAL' },
        recibidas: { numFacturas: received.numFacturas, baseCents: received.baseCents, ivaSoportadoCents: received.ivaSoportadoCents, irpfRetenidoCents: received.irpfRetenidoCents, totalCents: received.totalCents },
        emitidas: { numFacturas: emitted.numFacturas, baseCents: emitted.baseCents, ivaRepercutidoCents: emitted.ivaRepercutidoCents, irpfRetenidoCents: emitted.irpfRetenidoCents, totalCents: emitted.totalCents, porEstado },
        ivaNetoDocumentalCents,
        diagnostics: {
          receivedExcludedB2: nonnegative(diagnostics.receivedExcludedB2, 'receivedExcludedB2'), receivedExcludedNonDeductibleVat: nonnegative(diagnostics.receivedExcludedNonDeductibleVat, 'receivedExcludedNonDeductibleVat'), receivedExcludedRejected: nonnegative(diagnostics.receivedExcludedRejected, 'receivedExcludedRejected'), receivedExcludedConfirmingDraxton: nonnegative(diagnostics.receivedExcludedConfirmingDraxton, 'receivedExcludedConfirmingDraxton'), receivedExcludedInvalidPeriodDate: nonnegative(diagnostics.receivedExcludedInvalidPeriodDate, 'receivedExcludedInvalidPeriodDate'), receivedExcludedInexactEconomics: nonnegative(diagnostics.receivedExcludedInexactEconomics, 'receivedExcludedInexactEconomics'),
          emittedExcludedInvalidPeriodDate: nonnegative(diagnostics.emittedExcludedInvalidPeriodDate, 'emittedExcludedInvalidPeriodDate'), emittedExcludedInexactEconomics: nonnegative(diagnostics.emittedExcludedInexactEconomics, 'emittedExcludedInexactEconomics'), emittedExcludedFiIspIdentityCollision: nonnegative(diagnostics.emittedExcludedFiIspIdentityCollision, 'emittedExcludedFiIspIdentityCollision'), emittedExcludedRepeatedFiId: nonnegative(diagnostics.emittedExcludedRepeatedFiId, 'emittedExcludedRepeatedFiId'), notices: REQUIRED,
        },
      },
    } }
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Respuesta fiscal inválida.' } }
}
export function formatExactEuro(centsValue: number): string { if (!Number.isSafeInteger(centsValue)) throw new Error('Importe inválido.'); const cents = BigInt(centsValue), sign = cents < BigInt(0) ? '-' : '', absolute = cents < BigInt(0) ? -cents : cents; return `${sign}${(absolute / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(absolute % BigInt(100)).toString().padStart(2, '0')} €` }
