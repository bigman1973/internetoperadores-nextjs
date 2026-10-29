/*
 * Proyección visible de ciclo documental para Facturas Recibidas.
 *
 * Este módulo sólo transforma una fila ya leída. No importa Prisma, no consulta
 * Graph, no toca B4 y nunca admite/expone hashes, localizadores ni sourceItemKey.
 * La ausencia de snapshot conserva la fecha histórica de la factura y se muestra
 * como ausencia de evidencia documental actual, no como error ni borrado.
 */

export const FINANCE_DOCUMENT_VISIBLE_STATE_SCHEMA = 'FINANCE_DOCUMENT_VISIBLE_STATE_V1' as const

export type FinanceDocumentFolderVisibleState =
  | 'ACTIVO'
  | 'BORRADO_DE_LA_CARPETA'
  | 'SIN_SEGUIMIENTO_DOCUMENTAL'

export type FinanceDocumentVersionVisibleState =
  | 'VERSION_ACTUAL'
  | 'SIN_SNAPSHOT_CONSERVADOR'
  | 'SIN_SEGUIMIENTO_DOCUMENTAL'

export type FinanceDocumentIncidentVisibleState =
  | 'SIN_INCIDENCIA_DOCUMENTAL'
  | 'DOCUMENTO_CAMBIADO'

export type FinanceDocumentDuplicateVisibleState =
  | 'SIN_DUPLICADO_DETECTADO'
  | 'DUPLICADO_POR_HUELLA_PENDIENTE'

export type FinanceDocumentRelationVisibleState =
  | 'ORIGINAL_CON_RECTIFICATIVA_PROPUESTA'
  | 'ORIGINAL_CON_RECTIFICATIVA_CONFIRMADA'
  | 'RECTIFICATIVA_DE_ORIGINAL_PROPUESTA'
  | 'RECTIFICATIVA_DE_ORIGINAL_CONFIRMADA'

export type FinanceDocumentVisibleState = Readonly<{
  schema: typeof FINANCE_DOCUMENT_VISIBLE_STATE_SCHEMA
  documentDate: Readonly<{
    value: string | null
    source: 'SNAPSHOT_ACTUAL' | 'HISTORICO_FACTURA' | 'NO_DISPONIBLE'
    label: 'Fecha del documento' | 'Fecha histórica de factura' | 'Fecha documental no disponible'
  }>
  /**
   * No existe una columna de última lectura documental en las tablas actuales.
   * `captured_at` es la captura de una versión y nunca se reutiliza como lectura.
   */
  lastRead: Readonly<{
    value: null
    source: 'NO_PERSISTIDA'
    label: 'Última lectura no registrada'
  }>
  folder: Readonly<{
    state: FinanceDocumentFolderVisibleState
    label: 'Carpeta activa' | 'Borrado de la carpeta' | 'Sin seguimiento documental'
  }>
  version: Readonly<{
    state: FinanceDocumentVersionVisibleState
    number: number | null
    label: string
  }>
  incident: Readonly<{
    state: FinanceDocumentIncidentVisibleState
    label: 'Sin incidencia documental abierta' | 'El documento ha cambiado'
  }>
  duplicate: Readonly<{
    state: FinanceDocumentDuplicateVisibleState
    label: 'Sin duplicado documental pendiente' | 'Posible duplicado por contenido; revisar'
  }>
  relations: readonly FinanceDocumentRelationVisibleState[]
}>

/** Fila mínima del adaptador SQL: no contiene ni devuelve evidencia privada sensible. */
export type FinanceDocumentVisibleStateRow = Readonly<{
  invoiceId: unknown
  historicalDocumentDate: unknown
  lifecycleId: unknown
  lifecycleState: unknown
  currentVersion: unknown
  snapshotVersion: unknown
  snapshotDocumentDate: unknown
  hasTombstone: unknown
  hasOpenChangeIncident: unknown
  originalCreditProposed: unknown
  originalCreditConfirmed: unknown
  creditOfOriginalProposed: unknown
  creditOfOriginalConfirmed: unknown
  hasOpenHashDuplicate: unknown
}>

function isoDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? normalized : null
}

function positiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) return value
  if (typeof value === 'bigint' && value >= BigInt(1) && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
  }
  return null
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isTrue(value: unknown): boolean { return value === true }

function frozenRelations(row: Partial<FinanceDocumentVisibleStateRow> | null | undefined): readonly FinanceDocumentRelationVisibleState[] {
  const relations: FinanceDocumentRelationVisibleState[] = []
  if (isTrue(row?.originalCreditProposed)) relations.push('ORIGINAL_CON_RECTIFICATIVA_PROPUESTA')
  if (isTrue(row?.originalCreditConfirmed)) relations.push('ORIGINAL_CON_RECTIFICATIVA_CONFIRMADA')
  if (isTrue(row?.creditOfOriginalProposed)) relations.push('RECTIFICATIVA_DE_ORIGINAL_PROPUESTA')
  if (isTrue(row?.creditOfOriginalConfirmed)) relations.push('RECTIFICATIVA_DE_ORIGINAL_CONFIRMADA')
  return Object.freeze(relations)
}

/**
 * Convierte evidencia ya persistida en una vista segura. No deduce una lectura,
 * no valida ni altera B4 y no intenta recrear un snapshot ausente.
 */
export function financeDocumentVisibleStateFromRow(row: FinanceDocumentVisibleStateRow | null | undefined): FinanceDocumentVisibleState {
  const historicalDate = isoDate(row?.historicalDocumentDate)
  const snapshotDate = isoDate(row?.snapshotDocumentDate)
  const lifecycleKnown = nonEmpty(row?.lifecycleId)
  const snapshotVersion = positiveInteger(row?.snapshotVersion)
  const tombstoned = row?.lifecycleState === 'TOMBSTONED' || isTrue(row?.hasTombstone)
  const hasChangedIncident = isTrue(row?.hasOpenChangeIncident)

  const documentDate = snapshotDate
    ? { value: snapshotDate, source: 'SNAPSHOT_ACTUAL' as const, label: 'Fecha del documento' as const }
    : historicalDate
      ? { value: historicalDate, source: 'HISTORICO_FACTURA' as const, label: 'Fecha histórica de factura' as const }
      : { value: null, source: 'NO_DISPONIBLE' as const, label: 'Fecha documental no disponible' as const }

  const folder = tombstoned
    ? { state: 'BORRADO_DE_LA_CARPETA' as const, label: 'Borrado de la carpeta' as const }
    : lifecycleKnown
      ? { state: 'ACTIVO' as const, label: 'Carpeta activa' as const }
      : { state: 'SIN_SEGUIMIENTO_DOCUMENTAL' as const, label: 'Sin seguimiento documental' as const }

  const version = snapshotVersion
    ? { state: 'VERSION_ACTUAL' as const, number: snapshotVersion, label: `Versión actual ${snapshotVersion}` }
    : lifecycleKnown
      ? { state: 'SIN_SNAPSHOT_CONSERVADOR' as const, number: null, label: 'Sin snapshot actual; se conservan datos históricos' }
      : { state: 'SIN_SEGUIMIENTO_DOCUMENTAL' as const, number: null, label: 'Sin seguimiento de versiones' }

  return Object.freeze({
    schema: FINANCE_DOCUMENT_VISIBLE_STATE_SCHEMA,
    documentDate: Object.freeze(documentDate),
    // Deliberadamente constante: no existe `ultima_sincronizacion` ni una marca
    // de última lectura documental por factura en el modelo persistido actual.
    lastRead: Object.freeze({ value: null, source: 'NO_PERSISTIDA' as const, label: 'Última lectura no registrada' as const }),
    folder: Object.freeze(folder),
    version: Object.freeze(version),
    incident: Object.freeze(hasChangedIncident
      ? { state: 'DOCUMENTO_CAMBIADO' as const, label: 'El documento ha cambiado' as const }
      : { state: 'SIN_INCIDENCIA_DOCUMENTAL' as const, label: 'Sin incidencia documental abierta' as const }),
    duplicate: Object.freeze(isTrue(row?.hasOpenHashDuplicate)
      ? { state: 'DUPLICADO_POR_HUELLA_PENDIENTE' as const, label: 'Posible duplicado por contenido; revisar' as const }
      : { state: 'SIN_DUPLICADO_DETECTADO' as const, label: 'Sin duplicado documental pendiente' as const }),
    relations: frozenRelations(row),
  })
}

export function financeDocumentVisibleStatesByInvoice(
  invoiceIds: readonly string[],
  rows: readonly FinanceDocumentVisibleStateRow[],
): ReadonlyMap<string, FinanceDocumentVisibleState> {
  const wanted = new Set(invoiceIds)
  const byInvoice = new Map<string, FinanceDocumentVisibleState>()
  for (const row of rows) {
    if (typeof row.invoiceId !== 'string' || !wanted.has(row.invoiceId) || byInvoice.has(row.invoiceId)) continue
    byInvoice.set(row.invoiceId, financeDocumentVisibleStateFromRow(row))
  }
  for (const invoiceId of invoiceIds) {
    if (!byInvoice.has(invoiceId)) byInvoice.set(invoiceId, financeDocumentVisibleStateFromRow(null))
  }
  return byInvoice
}
