import { createHash } from 'node:crypto'
import { archivoRecibidaControlado } from './archivo-fuente-controlada'
import {
  lockConciliarDocumentSourceForConfirmationTx,
  readConciliarDocumentSourceEligibilityTx,
} from './conciliar-document-source-guard'
import type { ConciliarProjectionSource } from './conciliar-contract'

type Tx = Parameters<typeof readConciliarDocumentSourceEligibilityTx>[0]

/**
 * This is a seal of the current productive invoice state, not a content hash.
 * It deliberately makes no assertion about the bytes currently served by a
 * remote PDF provider.
 */
export const AREA3_REVIEW_DOCUMENT_STATE_SNAPSHOT_SCHEMA = 'AREA3_REVIEW_PRODUCTIVE_DOCUMENT_STATE_V1' as const
export type Area3ReviewDocumentStateSnapshotKind = 'PRODUCTIVE_CANONICAL_STATE'
export type Area3ReviewDocumentStateSnapshot = Readonly<{
  eligible: boolean
  snapshotHash: string | null
  kind: Area3ReviewDocumentStateSnapshotKind | null
}>

/** Values selected from the real productive invoice row; never HTTP input. */
export type Area3ReviewProductiveInvoiceState = Readonly<{
  invoiceId: string
  proveedor: string | null
  referencia: string | null
  fecha: string | null
  importeObjetivoCentimos: number | null
  estado: string | null
  calidad: string | null
  copiaDeId: string | null
  naturaleza: string | null
  conflictoIdentidad: boolean | null
  duplicadoExterno: boolean | null
  versionCalidad: number | null
  versionNaturaleza: number | null
  driveId: string | null
  itemId: string | null
  archivo: string | null
  updatedAt: string | null
}>

function unavailable(): Area3ReviewDocumentStateSnapshot {
  return { eligible: false, snapshotHash: null, kind: null }
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001F\u007F]/.test(value) ? value : null
}

function day(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 80 && /^\d{4}-\d{2}-\d{2}[ T][0-9:.+-]+(?:\s*[A-Z]{1,5})?$/.test(value) ? value : null
}

function positiveVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? value : null
}

function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value !== 0 && value >= -2_147_483_648 && value <= 2_147_483_647 ? value : null
}

/**
 * Builds a semantic seal from a source row already read from production. It
 * requires the canonical original, its exact economic identity, actual state,
 * controlled locator and update/version columns. Nothing here reads a file,
 * constructs a byte fingerprint or follows a network locator.
 */
function productiveSnapshot(
  invoice: Area3ReviewProductiveInvoiceState,
  projectionSource: ConciliarProjectionSource,
  sourceGuardVersionState: string,
): Area3ReviewDocumentStateSnapshot {
  const invoiceId = text(invoice.invoiceId, 200)
  const projectionInvoiceId = text(projectionSource.facturaRecibidaId, 200)
  const proveedor = text(invoice.proveedor, 1_000)
  const referencia = text(invoice.referencia, 500)
  const fecha = day(invoice.fecha)
  const importeObjetivoCentimos = cents(invoice.importeObjetivoCentimos)
  const estado = invoice.estado === 'PENDIENTE_REVISION' || invoice.estado === 'VALIDADA' || invoice.estado === 'CONTABILIZADA'
    ? invoice.estado
    : null
  const versionCalidad = positiveVersion(invoice.versionCalidad)
  const versionNaturaleza = positiveVersion(invoice.versionNaturaleza)
  const updatedAt = timestamp(invoice.updatedAt)
  const controlled = archivoRecibidaControlado({
    oneDriveDriveId: invoice.driveId,
    oneDriveItemId: invoice.itemId,
    archivoOneDrive: invoice.archivo,
  })
  const archivo = invoice.archivo === null ? null : text(invoice.archivo, 4_000)
  if (!invoiceId || invoiceId !== projectionInvoiceId || !proveedor || !referencia || !fecha || importeObjetivoCentimos === null
    || !estado || invoice.calidad !== 'VALIDA' || invoice.copiaDeId !== null || invoice.naturaleza !== 'FACTURA_RECIBIDA'
    || invoice.conflictoIdentidad !== false || invoice.duplicadoExterno !== false || !versionCalidad || !versionNaturaleza
    || !updatedAt || !controlled || !archivo) return unavailable()

  const canonical = {
    schema: AREA3_REVIEW_DOCUMENT_STATE_SNAPSHOT_SCHEMA,
    sourceGuardVersionState,
    invoice: {
      id: invoiceId,
      proveedor,
      referencia,
      fecha,
      importeObjetivoCentimos,
      estado,
      calidad: invoice.calidad,
      naturaleza: invoice.naturaleza,
      conflictoIdentidad: false,
      duplicadoExterno: false,
      versionCalidad,
      versionNaturaleza,
      updatedAt,
      locator: { driveId: controlled.driveId, itemId: controlled.itemId, archivo },
    },
  }
  return {
    eligible: true,
    kind: 'PRODUCTIVE_CANONICAL_STATE',
    snapshotHash: createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex'),
  }
}

/**
 * Reads the same server-owned source guard during preview and confirmation. A
 * confirmation additionally locks that exact invoice row and requires equality
 * with the source state sealed in the persisted projection. Missing tables,
 * rows, controlled locators or a changed source fail closed; there is no
 * historical, lifecycle or eligibility=true fallback.
 */
export async function readArea3ReviewDocumentStateSnapshotTx(
  tx: Tx,
  input: Readonly<{
    invoice: Area3ReviewProductiveInvoiceState
    projectionSource: ConciliarProjectionSource
    lock: boolean
  }>,
): Promise<Area3ReviewDocumentStateSnapshot> {
  const documentSource = input.lock
    ? await lockConciliarDocumentSourceForConfirmationTx(tx, {
      source: input.projectionSource,
      expectedVersionState: input.projectionSource.documentLifecycleVersionState,
    })
    : await readConciliarDocumentSourceEligibilityTx(tx, input.projectionSource)
  const expectedVersionState = input.projectionSource.documentLifecycleVersionState
  if (!documentSource.elegible || typeof expectedVersionState !== 'string' || expectedVersionState.length < 1
    || documentSource.versionEstado !== expectedVersionState) return unavailable()
  return productiveSnapshot(input.invoice, input.projectionSource, documentSource.versionEstado)
}
