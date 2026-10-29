/*
 * Lector de estados documentales visibles para Facturas Recibidas.
 *
 * Lee una sola proyección paginada por los IDs ya seleccionados por B2. No abre
 * Graph, no modifica B4, no crea versiones/enlaces y no devuelve source keys,
 * hashes, URLs, localizadores, OCR ni importes de snapshots.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import {
  financeDocumentVisibleStatesByInvoice,
  type FinanceDocumentVisibleState,
  type FinanceDocumentVisibleStateRow,
} from './finance-document-visible-state-core'

export const FINANCE_DOCUMENT_VISIBLE_STATE_MAX_INVOICES = 100
export const ONEDRIVE_LIFECYCLE_VISIBLE_SOURCE = 'ONEDRIVE' as const

type VisibleStateDatabase = Pick<PrismaClient, '$queryRaw'>

function validInvoiceId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u001F\u007F]/.test(value)
}

function checkedInvoiceIds(invoiceIds: readonly string[]): readonly string[] {
  if (invoiceIds.length > FINANCE_DOCUMENT_VISIBLE_STATE_MAX_INVOICES) {
    throw new Error('FINANCE_DOCUMENT_VISIBLE_STATE_PAGE_TOO_LARGE')
  }
  const unique = [...new Set(invoiceIds)]
  if (unique.some((id) => !validInvoiceId(id))) throw new Error('FINANCE_DOCUMENT_VISIBLE_STATE_INVOICE_ID_INVALID')
  return unique
}

/**
 * El proveedor OneDrive define la identidad de lifecycle como:
 * source='ONEDRIVE', source_item_key=`${driveId}:${itemId}`.
 * No se usa el itemId aislado ni la ruta, y la clave no aparece en el SELECT.
 */
function visibleStateQuery(invoiceIds: readonly string[]): Prisma.Sql {
  return Prisma.sql`
    SELECT
      f.id::text AS "invoiceId",
      f.fecha::date::text AS "historicalDocumentDate",
      l.id::text AS "lifecycleId",
      l.state::text AS "lifecycleState",
      l.current_version AS "currentVersion",
      s.version_number AS "snapshotVersion",
      s.document_date::text AS "snapshotDocumentDate",
      EXISTS (
        SELECT 1
        FROM document_version_tombstones t
        WHERE t.lifecycle_id = l.id
      ) AS "hasTombstone",
      EXISTS (
        SELECT 1
        FROM document_version_incidents i
        WHERE i.lifecycle_id = l.id
          AND i.state = 'OPEN'::"DocumentVersionIncidentState"
          AND i.code = 'AMBAR_DOCUMENTO_CAMBIADO'
      ) AS "hasOpenChangeIncident",
      EXISTS (
        SELECT 1
        FROM document_version_credit_links cl
        WHERE cl.original_lifecycle_id = l.id
          AND cl.state = 'PROPOSED'::"DocumentVersionCreditLinkState"
      ) AS "originalCreditProposed",
      EXISTS (
        SELECT 1
        FROM document_version_credit_links cl
        WHERE cl.original_lifecycle_id = l.id
          AND cl.state = 'CONFIRMED'::"DocumentVersionCreditLinkState"
      ) AS "originalCreditConfirmed",
      EXISTS (
        SELECT 1
        FROM document_version_credit_links cl
        WHERE cl.credit_lifecycle_id = l.id
          AND cl.state = 'PROPOSED'::"DocumentVersionCreditLinkState"
      ) AS "creditOfOriginalProposed",
      EXISTS (
        SELECT 1
        FROM document_version_credit_links cl
        WHERE cl.credit_lifecycle_id = l.id
          AND cl.state = 'CONFIRMED'::"DocumentVersionCreditLinkState"
      ) AS "creditOfOriginalConfirmed",
      EXISTS (
        SELECT 1
        FROM document_version_hash_duplicates hd
        WHERE (hd.left_snapshot_id = s.id OR hd.right_snapshot_id = s.id)
          AND hd.resolved_at IS NULL
      ) AS "hasOpenHashDuplicate"
    FROM facturas_recibidas f
    LEFT JOIN document_version_lifecycle l
      ON l.source = ${ONEDRIVE_LIFECYCLE_VISIBLE_SOURCE}
      AND f.onedrive_drive_id IS NOT NULL
      AND f.onedrive_item_id IS NOT NULL
      AND l.source_item_key = (f.onedrive_drive_id || ':' || f.onedrive_item_id)
    LEFT JOIN document_version_snapshots s
      ON s.lifecycle_id = l.id
      AND s.version_number = l.current_version
    WHERE f.id::text IN (${Prisma.join(invoiceIds)})
    ORDER BY f.id ASC
    LIMIT ${invoiceIds.length}
  `
}

/**
 * Una única consulta para la página actual. La ausencia de lifecycle/snapshot
 * no es una excepción: el núcleo devuelve el fallback histórico por factura.
 */
export async function readFinanceDocumentVisibleStates(
  database: VisibleStateDatabase,
  invoiceIds: readonly string[],
): Promise<ReadonlyMap<string, FinanceDocumentVisibleState>> {
  const ids = checkedInvoiceIds(invoiceIds)
  if (!ids.length) return new Map()
  const rows = await database.$queryRaw<FinanceDocumentVisibleStateRow[]>(visibleStateQuery(ids))
  return financeDocumentVisibleStatesByInvoice(ids, rows)
}

/** Exportado para pruebas sintéticas de forma SQL; no es una API de escritura. */
export const financeDocumentVisibleStateSql = {
  source: ONEDRIVE_LIFECYCLE_VISIBLE_SOURCE,
  maxInvoices: FINANCE_DOCUMENT_VISIBLE_STATE_MAX_INVOICES,
  sourceKeyConvention: '<driveId>:<itemId>',
  queryForTests: (invoiceIds: readonly string[]) => visibleStateQuery(checkedInvoiceIds(invoiceIds)),
} as const
