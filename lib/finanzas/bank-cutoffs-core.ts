/**
 * Cortes manuales y saltos de saldo: núcleo puro, sin Prisma, red ni entorno.
 *
 * Un corte confirmado es sólo metadato de cobertura revisado por una persona. No
 * certifica que una cadena de saldos cuadre y nunca modifica movimientos, saldos
 * históricos ni los cálculos B4/B5/B7.
 */

export const CUTS_MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER

export type CutoffSource = 'MANUAL_CONFIRMADO' | 'EXTRACTO_IMPORTADO' | 'SIN_CORTE'
export type BalanceJumpKind = 'SALTO_SALDO' | 'IMPORTE_O_SALDO_NO_EXACTO'

export interface ConfirmedCutoff {
  cutoffDate: string
  balanceCents: number
  confirmedAt: string
  actorId: number
}

export interface EffectiveAccountCutoff {
  accountId: string
  importedCutoffDate: string | null
  manual: ConfirmedCutoff | null
  effectiveCutoffDate: string | null
  source: CutoffSource
}

export interface BalanceJumpInput {
  id: string
  fechaOperacion: string | null
  createdAt: string | null
  importeText: string | null
  saldoText: string | null
}

export interface BalanceJump {
  movimientoId: string
  fecha: string | null
  importeCentimos: number | null
  saldoEsperadoCentimos: number | null
  saldoLeidoCentimos: number | null
  diferenciaCentimos: number | null
  tipo: BalanceJumpKind
  ordenIntradiaNoVerificado: boolean
  /** No se infiere el orden bancario: sólo orden técnico de presentación. */
  ordenPresentacion: 'FECHA_CREATED_AT_ID'
}

const MONEY = /^([+-]?)(0|[1-9]\d*)(?:[.,](\d{1,2}))?$/
// La coma de céntimos hace que «1.234,56» no sea ambiguo. «1.234» se
// rechaza: podría ser tres decimales, no miles exactos según esta interfaz.
const SPANISH_GROUPED_MONEY = /^([+-]?)(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function exactCents(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const normalized = value.trim()
  const grouped = SPANISH_GROUPED_MONEY.exec(normalized)
  const match = grouped
    ? [grouped[0], grouped[1], grouped[2].replaceAll('.', ''), grouped[3]]
    : MONEY.exec(normalized)
  if (!match) return null
  try {
    const cents = (BigInt(match[2]) * BigInt(100) + BigInt((match[3] ?? '').padEnd(2, '0'))) * (match[1] === '-' ? BigInt(-1) : BigInt(1))
    const limit = BigInt(CUTS_MAX_SAFE_CENTS)
    return cents < -limit || cents > limit ? null : Number(cents)
  } catch {
    return null
  }
}

export function isoDay(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !DATE.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? value : null
}

function comparesPresentation(left: BalanceJumpInput, right: BalanceJumpInput): number {
  const leftDay = isoDay(left.fechaOperacion) ?? '9999-12-31'
  const rightDay = isoDay(right.fechaOperacion) ?? '9999-12-31'
  if (leftDay !== rightDay) return leftDay.localeCompare(rightDay)
  const leftCreated = left.createdAt && Number.isFinite(new Date(left.createdAt).getTime()) ? left.createdAt : ''
  const rightCreated = right.createdAt && Number.isFinite(new Date(right.createdAt).getTime()) ? right.createdAt : ''
  return leftCreated.localeCompare(rightCreated) || left.id.localeCompare(right.id)
}

/**
 * Produce candidatos de salto para revisión, ordenados sólo por fecha+createdAt+id.
 * Con más de un apunte el mismo día, el orden intradía queda expresamente incierto:
 * los esperados ayudan a investigar, pero no son evidencia de cadena ni cobertura.
 */
export function listBalanceJumps(rows: readonly BalanceJumpInput[]): BalanceJump[] {
  const sorted = [...rows].sort(comparesPresentation)
  const dayCounts = new Map<string, number>()
  for (const row of sorted) {
    const day = isoDay(row.fechaOperacion)
    if (day) dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1)
  }

  let previousBalance: number | null = null
  const jumps: BalanceJump[] = []
  for (const row of sorted) {
    const fecha = isoDay(row.fechaOperacion)
    const importeCentimos = exactCents(row.importeText)
    const saldoLeidoCentimos = exactCents(row.saldoText)
    const expected = previousBalance !== null && importeCentimos !== null
      ? Number.isSafeInteger(previousBalance + importeCentimos) ? previousBalance + importeCentimos : null
      : null
    const uncertain = fecha === null || (dayCounts.get(fecha) ?? 0) > 1

    if (importeCentimos === null || saldoLeidoCentimos === null) {
      jumps.push({
        movimientoId: row.id, fecha, importeCentimos, saldoEsperadoCentimos: expected,
        saldoLeidoCentimos, diferenciaCentimos: null, tipo: 'IMPORTE_O_SALDO_NO_EXACTO',
        ordenIntradiaNoVerificado: uncertain, ordenPresentacion: 'FECHA_CREATED_AT_ID',
      })
    } else if (expected !== null && expected !== saldoLeidoCentimos) {
      jumps.push({
        movimientoId: row.id, fecha, importeCentimos, saldoEsperadoCentimos: expected,
        saldoLeidoCentimos, diferenciaCentimos: saldoLeidoCentimos - expected, tipo: 'SALTO_SALDO',
        ordenIntradiaNoVerificado: uncertain, ordenPresentacion: 'FECHA_CREATED_AT_ID',
      })
    }
    // Sólo sirve como contexto para la siguiente fila presentada; no se persiste ni
    // actualiza cuentas_bancarias.saldo_actual/fecha_saldo.
    previousBalance = saldoLeidoCentimos
  }
  return jumps
}

export function effectiveCutoff(input: {
  accountId: string
  importedCutoffDate: string | null
  manual: ConfirmedCutoff | null
}): EffectiveAccountCutoff {
  const importedCutoffDate = isoDay(input.importedCutoffDate)
  const manual = input.manual && isoDay(input.manual.cutoffDate) !== null && Number.isSafeInteger(input.manual.balanceCents)
    ? { ...input.manual, cutoffDate: isoDay(input.manual.cutoffDate)! }
    : null
  // La declaración manual complementa los cortes explícitos importados.
  // Nunca se infiere cobertura desde la fecha máxima de movimientos.
  if (manual) return { accountId: input.accountId, importedCutoffDate, manual, effectiveCutoffDate: manual.cutoffDate, source: 'MANUAL_CONFIRMADO' }
  return { accountId: input.accountId, importedCutoffDate, manual: null, effectiveCutoffDate: importedCutoffDate, source: importedCutoffDate ? 'EXTRACTO_IMPORTADO' : 'SIN_CORTE' }
}

export function coverageFromCutoffs(cutoffs: readonly EffectiveAccountCutoff[]): {
  status: 'KNOWN' | 'PARTIAL' | 'UNKNOWN'
  asOf: string | null
  activeAccountCount: number
  accountsWithKnownCutoff: number
} {
  const dates = cutoffs.map((cutoff) => cutoff.effectiveCutoffDate).filter((date): date is string => date !== null)
  if (cutoffs.length > 0 && dates.length === cutoffs.length) {
    return { status: 'KNOWN', asOf: [...dates].sort()[0], activeAccountCount: cutoffs.length, accountsWithKnownCutoff: dates.length }
  }
  if (dates.length > 0) return { status: 'PARTIAL', asOf: null, activeAccountCount: cutoffs.length, accountsWithKnownCutoff: dates.length }
  return { status: 'UNKNOWN', asOf: null, activeAccountCount: cutoffs.length, accountsWithKnownCutoff: 0 }
}
