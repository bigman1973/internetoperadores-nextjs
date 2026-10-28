import {
  isConciliarBankFee,
  textoSeguro,
  type ConciliarProjectionSource,
  type ConciliarRow,
} from './conciliar-contract'
import { conciliarProjectionRowId, safeInteger } from './conciliar-core'

export type ConciliarFeeUndoLeg = Readonly<{
  movimientoId: string | null
  operationB4Id: string | null
  actionB5: string | null
  proposalBlockId: string | null
  result: unknown
}>

export type ConciliarBankFeeProjectionSeed = Readonly<{
  tab: 'PAGOS'
  row: Omit<ConciliarRow, 'decisionHash'>
  source: ConciliarProjectionSource
  cuentaId: string
}>

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function sourceKind(value: unknown): ConciliarProjectionSource['kind'] | null {
  const kind = record(value)?.sourceKind
  return kind === 'COMISION_BANCARIA' ? kind : null
}

function identifier(value: unknown, maximum = 200): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum ? value : null
}

function nullableSafeText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const parsed = textoSeguro(value)
  return parsed && parsed.length <= maximum ? parsed : null
}

function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function bankFeeVersion(value: unknown): number | null {
  const parsed = safeInteger(value)
  return parsed !== null && parsed >= 1 && parsed <= 2_147_483_647 ? parsed : null
}

/**
 * This deliberately accepts only metadata persisted by Conciliar's original
 * receipt. Legacy legs without sourceKind are not inferred from their B4 data:
 * they remain on the normal dirty/full-rebuild path.
 */
export function knownSingleBankFeeUndoMovement(input: Readonly<{
  wasDirty: boolean
  legs: readonly ConciliarFeeUndoLeg[]
}>): string | null {
  if (input.wasDirty || input.legs.length !== 1) return null
  const leg = input.legs[0]
  if (!leg || !leg.operationB4Id || leg.actionB5 || leg.proposalBlockId || sourceKind(leg.result) !== 'COMISION_BANCARIA') return null
  return identifier(leg.movimientoId)
}

/**
 * Pure fee constructor shared by the global rebuild and the live undo path.
 * It receives no historical projection/decision hash: every persisted row is
 * derived from the locked movement and account that exist at this instant.
 */
export function buildBankFeeProjectionSeed(input: Readonly<{
  movimientoId: unknown
  cuentaId: unknown
  fecha: unknown
  importeCentimos: unknown
  versionB4: unknown
  concepto: unknown
  referencia: unknown
  infoAdicional: unknown
  tercero: unknown
  banco: unknown
  cuenta: unknown
}>): ConciliarBankFeeProjectionSeed | null {
  const movimientoId = identifier(input.movimientoId)
  const cuentaId = identifier(input.cuentaId)
  const fecha = date(input.fecha)
  const importeCentimos = safeInteger(input.importeCentimos)
  const versionB4 = bankFeeVersion(input.versionB4)
  if (!movimientoId || !cuentaId || !fecha || importeCentimos === null || importeCentimos < -2_147_483_648 || importeCentimos > 2_147_483_647 || versionB4 === null) return null

  const concepto = textoSeguro(input.concepto)
  const banco = nullableSafeText(input.banco, 300)
  const cuenta = nullableSafeText(input.cuenta, 300)
  const referencia = nullableSafeText(input.referencia, 1_200)
  const infoAdicional = nullableSafeText(input.infoAdicional, 1_200)
  const tercero = nullableSafeText(input.tercero, 1_200)
  if (!isConciliarBankFee({ importeCentimos, concepto, referencia, infoAdicional, tercero, banco })) return null

  return {
    tab: 'PAGOS',
    row: {
      id: conciliarProjectionRowId('PAGOS', `COMISION_BANCARIA:${movimientoId}`), movimientoId, fecha, concepto, banco, cuenta,
      importeCentimos, pendienteCentimos: importeCentimos, color: 'VERDE', grupo: 'GASTOS_BANCO',
      motivo: 'Cargo bancario admitido: se registrará como comisión bancaria.', documento: null, propuesta: null,
      seleccionable: true, diferenciaCentimos: 0,
      detail: 'La regla excluye compras con tarjeta, intereses, préstamo y comisiones a cero.',
    },
    source: { kind: 'COMISION_BANCARIA', movimientoId, versionB4 },
    cuentaId,
  }
}
