import type { FinanceConfirmingReadingReason } from './finance-confirming-reading-core'

/**
 * Contrato de lectura para la bandeja Conciliar > Revisar lectura.
 *
 * No contiene bytes, OCR bruto, nombres de facturas, rutas, enlaces de Graph ni
 * cuentas bancarias literales. Los importes ya autorizados se expresan sólo en
 * céntimos y cada ausencia permanece como `null`.
 */
export const FINANCE_CONFIRMING_READING_QUEUE_SCHEMA = 'FINANCE_CONFIRMING_READING_QUEUE_V1' as const

export type FinanceConfirmingReadingBank = 'BBVA' | 'CAIXABANK'
export type FinanceConfirmingReadingParserCode =
  | 'C11_BBVA_PDF_PAGINA_2_COLUMNAS_FISICAS'
  | 'C11_CAIXA_PDF'
  | 'C11_CAIXA_XLS'
  | null
export type FinanceConfirmingReadingSourceRole = 'LIQUIDACION_PDF' | 'DETALLE_FACTURAS_XLS' | 'NO_CLASIFICADO'
export type FinanceConfirmingReadingPairState =
  | 'NO_CLASIFICADO'
  | 'NO_REQUIERE_PAREJA'
  | 'PAREJA_NO_DECLARADA'
  | 'PAREJA_INCOMPLETA'
  | 'PAREJA_DECLARADA_COMPLETA'
export type FinanceConfirmingReadingEntryKind = 'REVISAR_LECTURA' | 'PROPUESTA_CONFIRMACION_HUMANA'

/** Propuesta de cola: no expone huella, snapshot ni fuente documental privada. */
export type FinanceConfirmingReadingQueueProposal = Readonly<{
  kind: 'PROPUESTA_CONFIRMACION_HUMANA'
  liquidacionId: string
  movimientoId: string
  estadoVisual: 'PROPUESTA_PENDIENTE_REVISION_HUMANA'
  propuestaAutomatica: true
  confirmarB4Automaticamente: false
  requiereConfirmacionHumana: true
  noEscrituras: true
}>

export type FinanceConfirmingReadingAmounts = Readonly<{
  nominalCentimos: number | null
  facturasDocumentales: number | null
  interesesCentimos: number | null
  comisionCentimos: number | null
  ivaComisionCentimos: number | null
  netoBancarioCentimos: number | null
  cuentaDepositariaDeclarada: boolean
}>

/** Fila mínima, durable y libre de texto OCR para la nueva tabla P2. */
export type PersistedConfirmingReadingRecord = Readonly<{
  id: string
  lifecycleId: string
  snapshotId: string
  versionDocumento: number
  sourceHash: string
  banco: FinanceConfirmingReadingBank | null
  sourceRole: FinanceConfirmingReadingSourceRole
  parser: FinanceConfirmingReadingParserCode
  parejaCaixaDeclaradaId: string | null
  motivos: readonly FinanceConfirmingReadingReason[]
  resumen: FinanceConfirmingReadingAmounts
  capturedAt: string
}>

export type FinanceConfirmingReadingQueueEntry = Readonly<{
  id: string
  kind: FinanceConfirmingReadingEntryKind
  liquidacionId: string | null
  movimientoId: string | null
  /** Referencia opaca privada. No es una URL ni se muestra en la interfaz. */
  archivoPrivadoId: string
  fuenteVersion: string
  bancoOrigen: FinanceConfirmingReadingBank | null
  pareja: FinanceConfirmingReadingPairState
  motivo: FinanceConfirmingReadingReason | null
  motivos: readonly FinanceConfirmingReadingReason[]
  resumen: FinanceConfirmingReadingAmounts
  propuesta: FinanceConfirmingReadingQueueProposal | null
  confirmarB4Automaticamente: false
  noEscrituras: true
}>

export type FinanceConfirmingReadingQueueDto = Readonly<{
  schema: typeof FINANCE_CONFIRMING_READING_QUEUE_SCHEMA
  state: 'AVAILABLE' | 'UNAVAILABLE'
  updatedAt: string | null
  entries: readonly FinanceConfirmingReadingQueueEntry[]
  unavailableCode: 'LECTURA_CONFIRMING_PERSISTENCIA_NO_DISPONIBLE' | null
}>

function isSafeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 2_147_483_647
}

function isReason(value: unknown): value is FinanceConfirmingReadingReason {
  return value === 'ARCHIVO_PRIVADO_NO_CONTROLADO'
    || value === 'ARCHIVO_PRIVADO_DUPLICADO'
    || value === 'PAREJA_CAIXA_PDF_XLS_INCOMPLETA'
    || value === 'PAREJA_CAIXA_PDF_XLS_NO_DECLARADA'
    || value === 'EVIDENCIA_C11_INCOMPLETA'
    || value === 'CUADRE_C11_NO_EXACTO'
    || value === 'MOVIMIENTO_AMBIGUO'
    || value === 'CUENTA_DEPOSITARIA_NO_COINCIDE'
    || value === 'NETO_BANCARIO_NO_COINCIDE'
    || value === 'MOVIMIENTO_NO_DISPONIBLE'
    || value === 'LECTURA_NO_APTA_PARA_PROPUESTA'
}

function isAmounts(value: unknown): value is FinanceConfirmingReadingAmounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const cents = ['nominalCentimos', 'interesesCentimos', 'comisionCentimos', 'ivaComisionCentimos', 'netoBancarioCentimos']
  return cents.every((key) => row[key] === null || isSafeCents(row[key]))
    && (row.facturasDocumentales === null || (typeof row.facturasDocumentales === 'number' && Number.isInteger(row.facturasDocumentales) && row.facturasDocumentales >= 0))
    && typeof row.cuentaDepositariaDeclarada === 'boolean'
}

function isProposal(value: unknown): value is FinanceConfirmingReadingQueueProposal | null {
  if (value === null) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return row.kind === 'PROPUESTA_CONFIRMACION_HUMANA'
    && typeof row.liquidacionId === 'string'
    && typeof row.movimientoId === 'string'
    && row.estadoVisual === 'PROPUESTA_PENDIENTE_REVISION_HUMANA'
    && row.propuestaAutomatica === true
    && row.confirmarB4Automaticamente === false
    && row.requiereConfirmacionHumana === true
    && row.noEscrituras === true
}

function isEntry(value: unknown): value is FinanceConfirmingReadingQueueEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const stringOrNull = (candidate: unknown) => candidate === null || typeof candidate === 'string'
  return typeof row.id === 'string'
    && (row.kind === 'REVISAR_LECTURA' || row.kind === 'PROPUESTA_CONFIRMACION_HUMANA')
    && stringOrNull(row.liquidacionId)
    && stringOrNull(row.movimientoId)
    && typeof row.archivoPrivadoId === 'string'
    && typeof row.fuenteVersion === 'string'
    && (row.bancoOrigen === 'BBVA' || row.bancoOrigen === 'CAIXABANK' || row.bancoOrigen === null)
    && (row.pareja === 'NO_CLASIFICADO' || row.pareja === 'NO_REQUIERE_PAREJA' || row.pareja === 'PAREJA_NO_DECLARADA' || row.pareja === 'PAREJA_INCOMPLETA' || row.pareja === 'PAREJA_DECLARADA_COMPLETA')
    && (row.motivo === null || isReason(row.motivo))
    && Array.isArray(row.motivos) && row.motivos.every(isReason)
    && isAmounts(row.resumen)
    && isProposal(row.propuesta)
    && typeof row.confirmarB4Automaticamente === 'boolean' && row.confirmarB4Automaticamente === false
    && typeof row.noEscrituras === 'boolean' && row.noEscrituras === true
}

/** Runtime parser for the private GET response; malformed responses never become an empty queue. */
export function parseFinanceConfirmingReadingQueueDto(value: unknown): FinanceConfirmingReadingQueueDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.schema !== FINANCE_CONFIRMING_READING_QUEUE_SCHEMA || (row.state !== 'AVAILABLE' && row.state !== 'UNAVAILABLE')) return null
  if ((row.updatedAt !== null && typeof row.updatedAt !== 'string') || !Array.isArray(row.entries) || !row.entries.every(isEntry)) return null
  if (row.unavailableCode !== null && row.unavailableCode !== 'LECTURA_CONFIRMING_PERSISTENCIA_NO_DISPONIBLE') return null
  if (row.state === 'AVAILABLE' && row.unavailableCode !== null) return null
  if (row.state === 'UNAVAILABLE' && (row.entries.length !== 0 || row.unavailableCode === null)) return null
  return row as FinanceConfirmingReadingQueueDto
}

export function unavailableFinanceConfirmingReadingQueue(): FinanceConfirmingReadingQueueDto {
  return {
    schema: FINANCE_CONFIRMING_READING_QUEUE_SCHEMA,
    state: 'UNAVAILABLE',
    updatedAt: null,
    entries: [],
    unavailableCode: 'LECTURA_CONFIRMING_PERSISTENCIA_NO_DISPONIBLE',
  }
}
