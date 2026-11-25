import { archivoRecibidaControlado } from '../../../lib/finanzas/archivo-fuente-controlada'
import { exactMoney } from '../../../lib/finanzas/conciliar-projection-read'
import {
  classifyG3HistoricalProviderEvidence,
  type G3HistoricalProviderEvidence,
  type G3HistoricalProviderSource,
} from '../../../lib/finanzas/conciliar-g3-historical-evidence'

/** Opaque private selector. It is never emitted by runners or evaluators. */
export type G3HistoricalProviderSelector = Readonly<{
  movementId: string
  invoiceId: string
}>

export type G3HistoricalReadonlyReader = Readonly<{
  query: <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => Promise<T[]>
}>

type HistoricalSqlRow = Readonly<{
  movementKey: unknown
  invoiceKey: unknown
  bankDate: unknown
  bankCents: unknown
  bankText: unknown
  bankReference: unknown
  supplier: unknown
  invoiceReference: unknown
  invoiceDate: unknown
  invoiceTotalText: unknown
  linkCents: unknown
  linkActive: unknown
  documentActive: unknown
  documentKind: unknown
  operationState: unknown
  operationReverted: unknown
  movementState: unknown
  movementVersion: unknown
  oneDriveDriveId: unknown
  oneDriveItemId: unknown
  archivoOneDrive: unknown
  absentFromCurrentProjection: unknown
}>

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function integer(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && Math.abs(parsed) <= 2_147_483_647 ? parsed : null
}
function selectorIsSafe(value: G3HistoricalProviderSelector | undefined): value is G3HistoricalProviderSelector {
  return !!value && typeof value.movementId === 'string' && value.movementId.length > 0 && value.movementId.length <= 300
    && typeof value.invoiceId === 'string' && value.invoiceId.length > 0 && value.invoiceId.length <= 300
}

/**
 * One bounded source read for a caller-selected historic B4 payment. It never
 * queries the projection for a row, never creates a projection row, and returns
 * null for absent, duplicate, inactive, reverted or otherwise unproven evidence.
 */
export const G3_HISTORICAL_PROVIDER_READ_SQL = `
  SELECT
    m.id AS "movementKey",fr.id AS "invoiceKey",m.fecha_operacion::date::text AS "bankDate",
    b4_importe_bancario_centimos(m.importe) AS "bankCents",
    concat_ws(' ',m.concepto,m.referencia,m.info_adicional) AS "bankText",m.referencia AS "bankReference",
    fr.proveedor AS supplier,fr.num_factura AS "invoiceReference",fr.fecha::date::text AS "invoiceDate",
    fr.total::text AS "invoiceTotalText",v.importe_centimos AS "linkCents",
    v.activo AS "linkActive",d.activo AS "documentActive",d.tipo::text AS "documentKind",
    o.estado::text AS "operationState",(o.revertida_at IS NOT NULL) AS "operationReverted",
    e.estado::text AS "movementState",e.version AS "movementVersion",
    fr.onedrive_drive_id AS "oneDriveDriveId",fr.onedrive_item_id AS "oneDriveItemId",fr.archivo_onedrive AS "archivoOneDrive",
    NOT EXISTS (SELECT 1 FROM conciliar_proyecciones p WHERE p.movimiento_id=m.id) AS "absentFromCurrentProjection"
  FROM movimientos_bancarios m
  JOIN facturas_recibidas fr ON fr.id=$2
  JOIN vinculos_movimiento_documento v ON v.movimiento_id=m.id
    AND v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
  JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    AND d.factura_recibida_id=fr.id
  JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
  JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
  WHERE m.id=$1
  ORDER BY v.id ASC
  LIMIT 2`

function sourceFromRow(row: HistoricalSqlRow): G3HistoricalProviderSource | null {
  const movementKey = text(row.movementKey), invoiceKey = text(row.invoiceKey)
  const bankDate = text(row.bankDate), bankText = text(row.bankText), supplier = text(row.supplier)
  const invoiceReference = text(row.invoiceReference), invoiceDate = text(row.invoiceDate)
  const bankCents = integer(row.bankCents), invoiceCents = exactMoney(row.invoiceTotalText), linkCents = integer(row.linkCents)
  const movementVersion = integer(row.movementVersion)
  if (!movementKey || !invoiceKey || !bankDate || !bankText || !supplier || !invoiceReference || !invoiceDate
    || bankCents === null || invoiceCents === null || linkCents === null || movementVersion === null) return null
  return {
    movementKey, invoiceKey, bankDate, bankCents, bankText, bankReference: text(row.bankReference), supplier, invoiceReference,
    invoiceDate, invoiceCents, linkCents, linkActive: row.linkActive === true, documentActive: row.documentActive === true,
    documentKind: text(row.documentKind) ?? '', operationState: text(row.operationState) ?? '', operationReverted: row.operationReverted === true,
    movementState: text(row.movementState) ?? '', movementVersion,
    controlledFile: archivoRecibidaControlado({
      oneDriveDriveId: text(row.oneDriveDriveId), oneDriveItemId: text(row.oneDriveItemId), archivoOneDrive: text(row.archivoOneDrive),
    }) !== null,
    absentFromCurrentProjection: row.absentFromCurrentProjection === true,
  }
}

export async function readG3HistoricalProviderEvidence(
  reader: G3HistoricalReadonlyReader,
  selector: G3HistoricalProviderSelector | undefined,
): Promise<G3HistoricalProviderEvidence | null> {
  if (!selectorIsSafe(selector)) return null
  const rows = await reader.query<HistoricalSqlRow>(G3_HISTORICAL_PROVIDER_READ_SQL, [selector.movementId, selector.invoiceId])
  if (rows.length !== 1) return null
  const source = sourceFromRow(rows[0]!)
  return source ? classifyG3HistoricalProviderEvidence(source) : null
}
