import { analizarCadenaSaldo } from '@/lib/finanzas/bank-balance-chain'
import { proveLocalBalanceNeighborhoods, type EasyAutoBalanceRow } from '@/lib/finanzas/easy-auto-core'

/**
 * Diagnóstico de lectura para explicar por qué no se puede certificar una cadena.
 * No completa extractos, no deduplica filas y no convierte ausencias en saldo cero.
 * Los cálculos propios se hacen siempre con céntimos enteros exactos.
 */
export type BankChainGapCode =
  | 'SALDO_INICIAL_NO_VERIFICABLE'
  | 'MOVIMIENTO_SIN_SALDO'
  | 'ORDEN_O_DUPLICADO_AMBIGUO'
  | 'SALTO_DE_SALDO'

export type BankChainGapAction = 'INFORMAR_LIMITACION' | 'FALTA_SALDO_APUNTE' | 'REVISAR_EXTRACTO'

export type BankChainGapRow = Readonly<{
  id: string
  cuentaId: string
  fecha: string
  importeCentimos: number | null
  saldoCentimos: number | null
}>

export type BankChainGap = Readonly<{
  codigo: BankChainGapCode
  accion: BankChainGapAction
  mensaje: string
  fechaProblema: string
  fechaPrevia: string | null
  fechaPosterior: string
  importeCentimos: number | null
  saldoEsperadoCentimos: number | null
  saldoLeidoCentimos: number | null
  apuntesMismoDia: number | null
}>

export type BankChainGapDiagnosis = Readonly<{
  fallos: readonly BankChainGap[]
  faltaExtracto: Readonly<{
    estado: 'NO_DEMOSTRADA'
    mensaje: string
  }>
}>

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function validCents(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

function stableRows(rows: readonly BankChainGapRow[]): BankChainGapRow[] {
  return [...rows].sort((left, right) => left.fecha.localeCompare(right.fecha) || left.id.localeCompare(right.id))
}

function validDate(value: string): boolean {
  if (!ISO_DAY.test(value)) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function asLocalEvidenceRows(rows: readonly BankChainGapRow[]): EasyAutoBalanceRow[] {
  return rows.map(row => ({
    id: row.id,
    cuentaId: row.cuentaId,
    fecha: row.fecha,
    importeCentimos: row.importeCentimos,
    saldoCentimos: row.saldoCentimos,
  }))
}

function rangeMessage(from: string | null, until: string): string {
  return `Revisar extracto del ${from ?? until} al ${until}.`
}

function initialGap(firstDate: string): BankChainGap {
  return {
    codigo: 'SALDO_INICIAL_NO_VERIFICABLE',
    accion: 'INFORMAR_LIMITACION',
    mensaje: `Saldo inicial no verificable antes del ${firstDate}; no se inventa un saldo de apertura.`,
    fechaProblema: firstDate,
    fechaPrevia: null,
    fechaPosterior: firstDate,
    importeCentimos: null,
    saldoEsperadoCentimos: null,
    saldoLeidoCentimos: null,
    apuntesMismoDia: null,
  }
}

function missingBalanceGap(row: BankChainGapRow, previousDate: string | null): BankChainGap {
  return {
    codigo: 'MOVIMIENTO_SIN_SALDO',
    accion: 'FALTA_SALDO_APUNTE',
    mensaje: `Falta saldo/apunte con saldo en la fecha ${row.fecha}; no equivale a 0.`,
    fechaProblema: row.fecha,
    fechaPrevia: previousDate,
    fechaPosterior: row.fecha,
    importeCentimos: row.importeCentimos,
    saldoEsperadoCentimos: null,
    saldoLeidoCentimos: null,
    apuntesMismoDia: null,
  }
}

function ambiguousDayGap(day: string, count: number, previousDate: string | null, nextDate: string | null): BankChainGap {
  return {
    codigo: 'ORDEN_O_DUPLICADO_AMBIGUO',
    accion: 'REVISAR_EXTRACTO',
    mensaje: `${rangeMessage(previousDate ?? day, nextDate ?? day)} Hay ${count} apuntes el ${day} sin una secuencia bancaria acreditada; no se deducen duplicados ni orden por ID.`,
    fechaProblema: day,
    fechaPrevia: previousDate,
    fechaPosterior: nextDate ?? day,
    importeCentimos: null,
    saldoEsperadoCentimos: null,
    saldoLeidoCentimos: null,
    apuntesMismoDia: count,
  }
}

function jumpGap(previous: BankChainGapRow, current: BankChainGapRow, expected: number): BankChainGap {
  return {
    codigo: 'SALTO_DE_SALDO',
    accion: 'REVISAR_EXTRACTO',
    mensaje: `${rangeMessage(previous.fecha, current.fecha)} El saldo esperado es distinto del saldo leído; esto acredita una inconsistencia entre dos apuntes, no la falta de un extracto.`,
    fechaProblema: current.fecha,
    fechaPrevia: previous.fecha,
    fechaPosterior: current.fecha,
    importeCentimos: current.importeCentimos,
    saldoEsperadoCentimos: expected,
    saldoLeidoCentimos: current.saldoCentimos,
    apuntesMismoDia: null,
  }
}

/**
 * Evalúa una cuenta sin asumir orden de importación ni inventar filas intermedias.
 *
 * Se invocan los dos núcleos ya aprobados: B3 mantiene el criterio de cobertura y
 * orden intradía, y Easy Auto calcula la evidencia local por aristas exactas. El
 * diagnóstico de pantalla conserva el criterio B3 más conservador: sin secuencia
 * bancaria declarada, dos o más apuntes de un día no se reordenan para la persona.
 */
export function diagnoseBankChainGaps(rows: readonly BankChainGapRow[]): BankChainGapDiagnosis {
  const ordered = stableRows(rows)
  if (ordered.length === 0) {
    return {
      fallos: [],
      faltaExtracto: {
        estado: 'NO_DEMOSTRADA',
        mensaje: 'No hay apuntes para demostrar que falte un extracto.',
      },
    }
  }

  // Reuse the B3 chain policy for the same source facts. It deliberately receives
  // no opening balance because the database does not supply one in this read path.
  const b3 = analizarCadenaSaldo(ordered.map(row => ({
    fechaOperacion: validDate(row.fecha) ? new Date(`${row.fecha}T12:00:00.000Z`) : new Date(Number.NaN),
    // The B3 policy only needs additive equality and coverage semantics here.
    // Cents remain the unit, so this adapter never divides, rounds or tolerates.
    importe: validCents(row.importeCentimos) ? row.importeCentimos : Number.NaN,
    saldo: validCents(row.saldoCentimos) ? row.saldoCentimos : null,
  })))
  // Reuse Easy Auto's exact local graph helper as a non-mutating companion check.
  // Its output can prove a restricted transfer neighborhood; it never relaxes B3's
  // account-wide rule requiring bank sequence for multiple rows on one calendar day.
  proveLocalBalanceNeighborhoods(asLocalEvidenceRows(ordered), ordered.map(row => row.id))

  const byDay = new Map<string, BankChainGapRow[]>()
  for (const row of ordered) {
    const day = byDay.get(row.fecha) ?? []
    day.push(row)
    byDay.set(row.fecha, day)
  }
  const days = [...byDay.keys()].sort()
  const gaps: BankChainGap[] = []
  const hasB3NoOpeningBalance = b3.avisos.some(item => item.codigo === 'COBERTURA_NO_VERIFICADA')
  if (hasB3NoOpeningBalance) gaps.push(initialGap(days[0]!))

  let previousVerified: BankChainGapRow | null = null
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index]!
    const group = byDay.get(day)!
    const previousDay = index > 0 ? days[index - 1]! : null
    const nextDay = index + 1 < days.length ? days[index + 1]! : null

    if (!validDate(day)) {
      previousVerified = null
      continue
    }

    // A missing/invalid balance is independently observable even if the bank
    // also omitted intraday order. Keep both findings: one must not hide another.
    let hasInvalidEvidence = false
    for (const row of group) {
      if (!validCents(row.importeCentimos) || !validCents(row.saldoCentimos)) {
        gaps.push(missingBalanceGap(row, previousVerified?.fecha ?? previousDay))
        hasInvalidEvidence = true
      }
    }
    if (group.length !== 1) {
      gaps.push(ambiguousDayGap(day, group.length, previousDay, nextDay))
      previousVerified = null
      continue
    }
    if (hasInvalidEvidence) {
      previousVerified = null
      continue
    }

    const current = group[0]!
    if (!validCents(current.importeCentimos) || !validCents(current.saldoCentimos)) {
      gaps.push(missingBalanceGap(current, previousVerified?.fecha ?? previousDay))
      previousVerified = null
      continue
    }

    if (previousVerified && validCents(previousVerified.saldoCentimos)) {
      const expected = previousVerified.saldoCentimos + current.importeCentimos
      if (!Number.isSafeInteger(expected)) {
        gaps.push({
          codigo: 'MOVIMIENTO_SIN_SALDO',
          accion: 'FALTA_SALDO_APUNTE',
          mensaje: `Falta saldo/apunte verificable en la fecha ${current.fecha}; los céntimos no se pueden representar de forma segura.`,
          fechaProblema: current.fecha,
          fechaPrevia: previousVerified.fecha,
          fechaPosterior: current.fecha,
          importeCentimos: current.importeCentimos,
          saldoEsperadoCentimos: null,
          saldoLeidoCentimos: current.saldoCentimos,
          apuntesMismoDia: null,
        })
        previousVerified = null
        continue
      }
      if (expected !== current.saldoCentimos) gaps.push(jumpGap(previousVerified, current, expected))
    }
    previousVerified = current
  }

  return {
    fallos: gaps,
    faltaExtracto: {
      estado: 'NO_DEMOSTRADA',
      mensaje: 'No se afirma que falte un extracto sólo por la fecha del último apunte o del corte registrado.',
    },
  }
}

export function bankChainGapCountByCode(gaps: readonly BankChainGap[]): Readonly<Record<BankChainGapCode, number>> {
  const counts: Record<BankChainGapCode, number> = {
    SALDO_INICIAL_NO_VERIFICABLE: 0,
    MOVIMIENTO_SIN_SALDO: 0,
    ORDEN_O_DUPLICADO_AMBIGUO: 0,
    SALTO_DE_SALDO: 0,
  }
  for (const gap of gaps) counts[gap.codigo] += 1
  return counts
}
