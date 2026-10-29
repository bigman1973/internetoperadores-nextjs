import type { GraphFile, InvoiceLibrary, OneDriveReadPort } from './graph-read'
import type { SyncOutcome, SyncSourceItem } from './types'
import { SyncProviderError } from './types'
import type { DocumentObservation, DocumentPrivateMetadata, ReconciliationProtection } from '@/lib/finanzas/finance-document-lifecycle-core'
import type { OneDriveDocumentLifecyclePort, OneDriveInventoryDocumentMetadata, OneDrivePrivateArchivePreparation } from './document-lifecycle'
import {
  decideOneDriveContentRead,
  observationFromOneDriveContent,
  oneDriveInventoryFingerprint,
  prepareOneDrivePrivateArchive,
  privateMetadataFromOneDriveOcr,
} from './document-lifecycle'

export const FACTURAS_BASE_PATH = '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026'
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
export const MAX_OCR_JSON_BYTES = 256 * 1024

export const B1_FOLDERS = {
  pendiente: { nombre: '2. Pendiente de contabilizar o revisar 2026', estadoCarpeta: 'PENDIENTE_CONTABILIZAR' },
  materiales: { nombre: '1. Compra de materiales 2026', estadoCarpeta: 'SIN_CLASIFICAR' },
  confirming_draxton: { nombre: '3. Confirming Draxton 2026', estadoCarpeta: 'CONFIRMING' },
  trimestre1: { nombre: '4. Trimestre 1 2026', estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  trimestre2: { nombre: '5. Trimestre 2 2026', estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  trimestre3: { nombre: '6. Trimestre 3 2026', estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  trimestre4: { nombre: '7. Trimestre 4 2026', estadoCarpeta: 'CONTABILIZADA_GESTORIA' },
  raiz: { nombre: 'Raíz 2026', estadoCarpeta: 'SIN_CLASIFICAR' },
} as const

export type B1FolderKey = keyof typeof B1_FOLDERS
const FOLDER_KEYS = Object.keys(B1_FOLDERS) as B1FolderKey[]
const INVOICE_EXTENSIONS = new Set(['pdf', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'heic', 'tiff'])
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', tiff: 'image/tiff',
}

type ItemData = {
  schema: 1 | 2
  driveId: string
  itemId: string
  folderKey: B1FolderKey
  name: string
  mimeType: string | null
  size: number | null
  eTag: string | null
  /** Content/version hints only. No bytes, URL, token or OCR live in sourceData. */
  inventoryMetadata?: OneDriveInventoryDocumentMetadata
  lastModifiedAt: string | null
  relativeFolderPath: string
  path: string
  location: Location
}

export type Location = {
  carpetaOrigen: string
  oneDriveDriveId: string
  oneDriveRutaActual: string
  archivoOneDrive: string
  estadoCarpeta: string
  etiquetaMateriales: boolean
}

export type OcrInvoice = {
  proveedor?: unknown
  cif?: unknown
  domicilioProveedor?: unknown
  numFactura?: unknown
  fecha?: unknown
  fechaProvenancia?: unknown
  fechaVencimiento?: unknown
  base?: unknown
  tipoIva?: unknown
  importeIva?: unknown
  tipoIrpf?: unknown
  importeIrpf?: unknown
  total?: unknown
  concepto?: unknown
  confianza?: unknown
  lineas?: unknown
  esInternacional?: unknown
  paisOrigen?: unknown
  telefonoServicio?: unknown
  /** Optional extractor values; never inferred from the amount or filename. */
  referenciaFacturaOriginal?: unknown
  tipoDocumento?: unknown
  moneda?: unknown
}

export type OcrValidation = { ok: true; identidad: string } | { ok: false; motivo: string }

export type ExistingSource = {
  kind: 'INVOICE' | 'REVIEW' | 'CONFIRMING_CATALOG'
  id: string
  oneDriveDriveId: string | null
  location: Location
}

export type DedupePlan = {
  canonicalId: string | null
  conflict: boolean
}

/**
 * Project-specific Prisma calls live behind this port. All methods run through
 * the *provided* transaction object. There is deliberately no money, bank,
 * B4, email, or Graph mutation method in this interface.
 */
export interface OneDriveDomainPort<Tx = unknown> {
  /** Read-only preflight, called by prepare to avoid OCR/download for known sources. */
  readSource(itemId: string): Promise<ExistingSource | null>
  /** Must lock/re-read invoice and review candidates for this item ID before any DML. */
  lockSource(tx: Tx, itemId: string): Promise<ExistingSource | null>
  /** Updates location fields and the existing location/B2 audit only. */
  updateLocation(tx: Tx, source: ExistingSource, location: Location, actorId: number | null): Promise<boolean>
  /** Existing B2 locked canonical query + planDeduplicacion. */
  lockedDedupePlan(tx: Tx, canonKey: string): Promise<DedupePlan>
  /** Narrow B4 read-only state for an already locked invoice source. */
  readB4Protection?(tx: Tx, source: ExistingSource): Promise<ReconciliationProtection>
  /** Canonical metadata already stored by B2; used only for an honest no-byte baseline. */
  readPrivateMetadata?(tx: Tx, source: ExistingSource): Promise<DocumentPrivateMetadata | null>
  /** Exact normalised legacy fallback only; no fuzzy/provider/name matching. */
  hasLegacyExactCanonicalMatch(tx: Tx, ocr: OcrInvoice, canonKey: string): Promise<boolean>
  createInvoice(tx: Tx, input: NewInvoiceInput, actorId: number | null): Promise<void>
  createReview(tx: Tx, input: NewReviewInput, actorId: number | null): Promise<void>
}

export type NewInvoiceInput = {
  itemId: string
  location: Location
  ocr: OcrInvoice
  ocrRaw: string
  identity: string
  dedupe: DedupePlan
}
export type NewReviewInput = {
  itemId: string
  location: Location
  ocr: OcrInvoice
  ocrRaw: string
  reason: string
}

export type OcrPort = {
  extract(base64: string, mimeType: string, fileName: string): Promise<OcrInvoice>
  validateNew(ocr: OcrInvoice): OcrValidation
}

export type OneDriveProviderOptions<Tx = unknown> = {
  read: OneDriveReadPort
  domain: OneDriveDomainPort<Tx>
  ocr: OcrPort
  /** Explicit job-scope acknowledgment. Empty/implicit values never authorize legacy changes. */
  historicalLibraryConfirmedDriveId?: string | null
  invoiceRootPath?: string
  /** Real DB adapter injected by production assembly; tests may omit it. */
  documentLifecycle?: OneDriveDocumentLifecyclePort<Tx>
}

type PreparedExisting = { kind: 'EXISTING'; key: string }
type PreparedConfirming = { kind: 'CONFIRMING'; key: string }
type PreparedLifecycleReview = { kind: 'LIFECYCLE_REVIEW'; key: string }
type PreparedLegacyBaseline = { kind: 'LEGACY_METADATA_BASELINE'; key: string; observation: DocumentObservation }
type PreparedLifecycle = Readonly<{
  observation: DocumentObservation
  archive: OneDrivePrivateArchivePreparation
  /** Existing B2 record predates lifecycle snapshots; baseline is metadata-only. */
  needsLegacyMetadataBaseline: boolean
}>
type PreparedInvoice = Readonly<{
  kind: 'INVOICE'
  key: string
  ocr: OcrInvoice
  ocrRaw: string
  validation: OcrValidation
  /** Ephemeral only: this is never serialized in FinanceSyncItemP2.sourceData. */
  lifecycle: PreparedLifecycle | null
}>
type Prepared = PreparedExisting | PreparedConfirming | PreparedLifecycleReview | PreparedLegacyBaseline | PreparedInvoice

function fail(code: string): never { throw new SyncProviderError(code) }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, max: number, code: string): string {
  if (typeof value !== 'string') fail(code)
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) fail(code)
  return normalized
}

function nullableString(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  return boundedString(value, max, 'ONEDRIVE_METADATA_INVALID')
}

function isFolderKey(value: unknown): value is B1FolderKey { return typeof value === 'string' && Object.prototype.hasOwnProperty.call(B1_FOLDERS, value) }
function extension(name: string): string { return name.slice(name.lastIndexOf('.') + 1).toLowerCase() }
function isInvoiceFile(file: GraphFile): boolean { return !file.folder && INVOICE_EXTENSIONS.has(extension(file.name)) }

function pathFor(key: B1FolderKey, root: string): string {
  return key === 'raiz' ? root : `${root}/${B1_FOLDERS[key].nombre}`
}

function locationFor(file: GraphFile, key: B1FolderKey, driveId: string, root: string): Location {
  const name = boundedString(file.name, 512, 'ONEDRIVE_NAME_INVALID')
  if (name.includes('/') || name.includes('\\')) fail('ONEDRIVE_NAME_INVALID')
  const folder = boundedString(file.relativeFolderPath || file.folderPath, 2_000, 'ONEDRIVE_PATH_INVALID')
  const path = boundedString(file.fullPath, 2_600, 'ONEDRIVE_PATH_INVALID')
  if (path !== `${folder}/${name}` || (folder !== root && !folder.startsWith(`${root}/`))) fail('ONEDRIVE_PATH_INVALID')
  return {
    carpetaOrigen: folder === root ? 'Raíz 2026' : folder.slice(root.length + 1),
    oneDriveDriveId: driveId,
    oneDriveRutaActual: path,
    archivoOneDrive: path,
    estadoCarpeta: B1_FOLDERS[key].estadoCarpeta,
    etiquetaMateriales: key === 'materiales',
  }
}

function dataFor(file: GraphFile, key: B1FolderKey, driveId: string, root: string): ItemData {
  const itemId = boundedString(file.id, 512, 'ONEDRIVE_ITEM_ID_INVALID')
  const name = boundedString(file.name, 512, 'ONEDRIVE_NAME_INVALID')
  const size = typeof file.size === 'number' && Number.isSafeInteger(file.size) && file.size >= 0 ? file.size : null
  const eTag = nullableString(file.eTag, 1_024)
  const modified = nullableString(file.lastModifiedDateTime, 128)
  const providerMime = nullableString(file.file?.mimeType, 256)
  const ext = extension(name)
  return {
    schema: 2,
    driveId,
    itemId,
    folderKey: key,
    name,
    // Prefer the provider MIME when valid, retaining extension derived type for OCR.
    mimeType: providerMime || MIME_BY_EXTENSION[ext] || null,
    size,
    eTag,
    inventoryMetadata: {
      byteLength: size,
      quickXorHash: nullableString(file.file?.hashes?.quickXorHash, 1_024),
      cTag: nullableString(file.cTag, 1_024),
      eTag,
      sourceVersion: nullableString(file.sourceVersion, 1_024),
    },
    lastModifiedAt: modified,
    relativeFolderPath: locationFor(file, key, driveId, root).oneDriveRutaActual.slice(0, -(name.length + 1)),
    path: locationFor(file, key, driveId, root).oneDriveRutaActual,
    location: locationFor(file, key, driveId, root),
  }
}

function itemKey(data: ItemData): string { return `onedrive:${data.driveId}:${data.itemId}` }
/** Stable lifecycle convention: exactly `<driveId>:<itemId>` under source ONEDRIVE. */
function lifecycleIdentity(data: ItemData): DocumentObservation['identity'] {
  return { source: 'ONEDRIVE', sourceItemKey: `${data.driveId}:${data.itemId}` }
}
function inventoryMetadataFor(data: ItemData): OneDriveInventoryDocumentMetadata {
  return data.inventoryMetadata ?? {
    byteLength: data.size,
    quickXorHash: null,
    cTag: null,
    eTag: data.eTag,
    sourceVersion: null,
  }
}

function parseCheckpoint(checkpoint: unknown): number {
  if (checkpoint === null || checkpoint === undefined || (isRecord(checkpoint) && Object.keys(checkpoint).length === 0)) return 0
  if (!isRecord(checkpoint) || checkpoint.schema !== 1 || !Number.isSafeInteger(checkpoint.folderIndex) || Number(checkpoint.folderIndex) < 0 || Number(checkpoint.folderIndex) > FOLDER_KEYS.length) fail('ONEDRIVE_CHECKPOINT_INVALID')
  return Number(checkpoint.folderIndex)
}

function parsedData(item: SyncSourceItem): ItemData {
  const rawData: unknown = item.data
  if (!isRecord(rawData) || (rawData.schema !== 1 && rawData.schema !== 2) || !isFolderKey(rawData.folderKey)) fail('ONEDRIVE_ITEM_DATA_INVALID')
  const data = rawData as ItemData
  const driveId = boundedString(data.driveId, 512, 'ONEDRIVE_ITEM_DATA_INVALID')
  const itemId = boundedString(data.itemId, 512, 'ONEDRIVE_ITEM_DATA_INVALID')
  const name = boundedString(data.name, 512, 'ONEDRIVE_ITEM_DATA_INVALID')
  if (name.includes('/') || name.includes('\\')) fail('ONEDRIVE_ITEM_DATA_INVALID')
  const location = data.location
  if (!isRecord(location) || location.oneDriveDriveId !== driveId || location.oneDriveRutaActual !== data.path || location.archivoOneDrive !== data.path || typeof location.etiquetaMateriales !== 'boolean') fail('ONEDRIVE_ITEM_DATA_INVALID')
  const rawInventory = data.inventoryMetadata
  const inventoryMetadata = rawInventory === undefined
    ? undefined
    : isRecord(rawInventory)
      ? {
          byteLength: rawInventory.byteLength === null ? null : (Number.isSafeInteger(rawInventory.byteLength) && Number(rawInventory.byteLength) >= 0 ? Number(rawInventory.byteLength) : fail('ONEDRIVE_ITEM_DATA_INVALID')),
          quickXorHash: rawInventory.quickXorHash === null || rawInventory.quickXorHash === undefined ? null : boundedString(rawInventory.quickXorHash, 1_024, 'ONEDRIVE_ITEM_DATA_INVALID'),
          cTag: rawInventory.cTag === null || rawInventory.cTag === undefined ? null : boundedString(rawInventory.cTag, 1_024, 'ONEDRIVE_ITEM_DATA_INVALID'),
          eTag: rawInventory.eTag === null || rawInventory.eTag === undefined ? null : boundedString(rawInventory.eTag, 1_024, 'ONEDRIVE_ITEM_DATA_INVALID'),
          sourceVersion: rawInventory.sourceVersion === null || rawInventory.sourceVersion === undefined ? null : boundedString(rawInventory.sourceVersion, 1_024, 'ONEDRIVE_ITEM_DATA_INVALID'),
        }
      : fail('ONEDRIVE_ITEM_DATA_INVALID')
  const checked: ItemData = {
    ...data,
    driveId, itemId, name,
    mimeType: data.mimeType === null ? null : boundedString(data.mimeType, 256, 'ONEDRIVE_ITEM_DATA_INVALID'),
    size: data.size === null ? null : (Number.isSafeInteger(data.size) && data.size >= 0 ? data.size : fail('ONEDRIVE_ITEM_DATA_INVALID')),
    eTag: data.eTag === null ? null : boundedString(data.eTag, 1_024, 'ONEDRIVE_ITEM_DATA_INVALID'),
    inventoryMetadata,
    lastModifiedAt: data.lastModifiedAt === null ? null : boundedString(data.lastModifiedAt, 128, 'ONEDRIVE_ITEM_DATA_INVALID'),
    relativeFolderPath: boundedString(data.relativeFolderPath, 2_000, 'ONEDRIVE_ITEM_DATA_INVALID'),
    path: boundedString(data.path, 2_600, 'ONEDRIVE_ITEM_DATA_INVALID'),
    location: {
      carpetaOrigen: boundedString(location.carpetaOrigen, 2_000, 'ONEDRIVE_ITEM_DATA_INVALID'),
      oneDriveDriveId: driveId,
      oneDriveRutaActual: boundedString(location.oneDriveRutaActual, 2_600, 'ONEDRIVE_ITEM_DATA_INVALID'),
      archivoOneDrive: boundedString(location.archivoOneDrive, 2_600, 'ONEDRIVE_ITEM_DATA_INVALID'),
      estadoCarpeta: boundedString(location.estadoCarpeta, 100, 'ONEDRIVE_ITEM_DATA_INVALID'),
      etiquetaMateriales: location.etiquetaMateriales,
    },
  }
  if (checked.path !== `${checked.relativeFolderPath}/${checked.name}` || checked.location.oneDriveRutaActual !== checked.path) fail('ONEDRIVE_ITEM_DATA_INVALID')
  if (item.key !== itemKey(checked)) fail('ONEDRIVE_ITEM_KEY_INVALID')
  return checked
}

function jsonBounded(value: unknown): string {
  let encoded: string
  try { encoded = JSON.stringify(value) } catch { return fail('OCR_RESULT_INVALID') }
  if (typeof encoded !== 'string' || new TextEncoder().encode(encoded).byteLength > MAX_OCR_JSON_BYTES) fail('OCR_RESULT_TOO_LARGE')
  return encoded
}

function preparedFor(item: SyncSourceItem, raw: unknown): Prepared {
  if (!isRecord(raw) || typeof raw.kind !== 'string' || raw.key !== item.key) fail('ONEDRIVE_PREPARED_INVALID')
  if (raw.kind === 'EXISTING') return { kind: 'EXISTING', key: item.key }
  if (raw.kind === 'CONFIRMING') return { kind: 'CONFIRMING', key: item.key }
  if (raw.kind === 'LIFECYCLE_REVIEW') return { kind: 'LIFECYCLE_REVIEW', key: item.key }
  if (raw.kind === 'LEGACY_METADATA_BASELINE' && isRecord(raw.observation)) {
    return { kind: 'LEGACY_METADATA_BASELINE', key: item.key, observation: raw.observation as unknown as DocumentObservation }
  }
  if (raw.kind === 'INVOICE' && isRecord(raw.ocr) && typeof raw.ocrRaw === 'string' && isRecord(raw.validation) && typeof raw.validation.ok === 'boolean') {
    const validation: OcrValidation = raw.validation.ok === true && typeof raw.validation.identidad === 'string'
      ? { ok: true, identidad: boundedString(raw.validation.identidad, 256, 'ONEDRIVE_PREPARED_INVALID') }
      : raw.validation.ok === false && typeof raw.validation.motivo === 'string'
        ? { ok: false, motivo: boundedString(raw.validation.motivo, 128, 'ONEDRIVE_PREPARED_INVALID') }
        : fail('ONEDRIVE_PREPARED_INVALID')
    if (new TextEncoder().encode(raw.ocrRaw).byteLength > MAX_OCR_JSON_BYTES) fail('ONEDRIVE_PREPARED_INVALID')
    const lifecycle = raw.lifecycle === null || raw.lifecycle === undefined
      ? null
      : isRecord(raw.lifecycle) && isRecord(raw.lifecycle.observation) && isRecord(raw.lifecycle.archive)
        ? raw.lifecycle as unknown as PreparedLifecycle
        : fail('ONEDRIVE_PREPARED_INVALID')
    return { kind: 'INVOICE', key: item.key, ocr: raw.ocr as OcrInvoice, ocrRaw: raw.ocrRaw, validation, lifecycle }
  }
  fail('ONEDRIVE_PREPARED_INVALID')
}

function locationsEqual(a: Location, b: Location): boolean {
  return a.carpetaOrigen === b.carpetaOrigen && a.oneDriveDriveId === b.oneDriveDriveId &&
    a.oneDriveRutaActual === b.oneDriveRutaActual && a.archivoOneDrive === b.archivoOneDrive &&
    a.estadoCarpeta === b.estadoCarpeta && a.etiquetaMateriales === b.etiquetaMateriales
}

/**
 * B1+B2+C9 source adapter. It does not create transactions, inspect a job
 * lease, send mail, create B4 links, or move a cloud file. The P2 worker owns
 * the lease/cancellation check immediately before calling apply in its TX.
 */
export class OneDriveSyncProvider<Tx = unknown> {
  readonly source = 'ONEDRIVE' as const
  private readonly root: string
  private readonly historicalConfirmation: string | null

  constructor(private readonly options: OneDriveProviderOptions<Tx>) {
    this.root = options.invoiceRootPath || FACTURAS_BASE_PATH
    this.historicalConfirmation = options.historicalLibraryConfirmedDriveId?.trim() || null
  }

  async inventory(checkpoint: unknown): Promise<{ items: SyncSourceItem[]; checkpoint: unknown; complete: boolean }> {
    const folderIndex = parseCheckpoint(checkpoint)
    if (folderIndex === FOLDER_KEYS.length) return { items: [], checkpoint: { schema: 1, folderIndex }, complete: true }
    const library: InvoiceLibrary = await this.options.read.resolveInvoiceLibrary()
    const driveId = boundedString(library.driveId, 512, 'ONEDRIVE_LIBRARY_INVALID')
    const key = FOLDER_KEYS[folderIndex]
    const listed = await this.options.read.listFolderContents(driveId, pathFor(key, this.root), key !== 'raiz')
    if (!Array.isArray(listed)) fail('ONEDRIVE_INVENTORY_INVALID')
    // listFolderContents must exhaust/validate its own Graph pagination. The
    // provider only persists this checkpoint after that single folder succeeds.
    const seen = new Set<string>()
    const items: SyncSourceItem[] = []
    for (const file of listed) {
      if (file.folder) continue
      const data = dataFor(file, key, driveId, this.root)
      if (seen.has(data.itemId)) fail('ONEDRIVE_DUPLICATE_ITEM')
      seen.add(data.itemId)
      // Confirming is a document catalog, not OCR/invoice import. Other B1
      // folders emit only existing accepted invoice document formats.
      if (key !== 'confirming_draxton' && !isInvoiceFile(file)) continue
      items.push({ key: itemKey(data), tipo: key === 'confirming_draxton' ? 'ONEDRIVE_CONFIRMING_SOPORTE' : 'ONEDRIVE_FACTURA', data: data as unknown as SyncSourceItem['data'] })
    }
    const nextFolderIndex = folderIndex + 1
    return { items, checkpoint: { schema: 1, folderIndex: nextFolderIndex }, complete: nextFolderIndex === FOLDER_KEYS.length }
  }

  async prepare(item: SyncSourceItem): Promise<unknown> {
    const data = parsedData(item)
    if (item.tipo === 'ONEDRIVE_CONFIRMING_SOPORTE') return { kind: 'CONFIRMING', key: item.key } satisfies PreparedConfirming
    if (item.tipo !== 'ONEDRIVE_FACTURA') fail('ONEDRIVE_ITEM_TYPE_INVALID')
    const existing = await this.options.domain.readSource(data.itemId)
    const inventory = inventoryMetadataFor(data)
    const metadataObservation: DocumentObservation = {
      identity: lifecycleIdentity(data),
      fingerprint: oneDriveInventoryFingerprint(inventory),
      privateMetadata: null,
    }
    let needsLegacyMetadataBaseline = false
    if (this.options.documentLifecycle) {
      const current = await this.options.documentLifecycle.readCurrent(metadataObservation.identity)
      needsLegacyMetadataBaseline = existing !== null && current === null
      const decision = decideOneDriveContentRead({ sourceExists: existing !== null, current, incoming: metadataObservation })
      if (decision === 'NO_CONTENT') return { kind: 'EXISTING', key: item.key } satisfies PreparedExisting
      // A historical B2 source has canonical metadata but no prior lifecycle
      // fingerprint. Its baseline is written as UNAVAILABLE in apply, then the
      // item goes to review; no absent predecessor bytes are ever invented.
      if (decision === 'LEGACY_METADATA_BASELINE') {
        return { kind: 'LEGACY_METADATA_BASELINE', key: item.key, observation: metadataObservation } satisfies PreparedLegacyBaseline
      }
      if (decision === 'REVIEW_INSUFFICIENT_EVIDENCE') return { kind: 'LIFECYCLE_REVIEW', key: item.key } satisfies PreparedLifecycleReview
    } else if (existing) {
      // Compatibility path until the production lifecycle adapter is injected.
      return { kind: 'EXISTING', key: item.key } satisfies PreparedExisting
    }
    const ext = extension(data.name)
    const mimeType = MIME_BY_EXTENSION[ext]
    if (!mimeType) fail('ONEDRIVE_FILE_TYPE_INVALID')
    if (data.size !== null && data.size > MAX_DOCUMENT_BYTES) fail('ONEDRIVE_FILE_TOO_LARGE')
    const bytes = await this.options.read.downloadFile(data.driveId, data.itemId, MAX_DOCUMENT_BYTES)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_DOCUMENT_BYTES) fail('ONEDRIVE_FILE_TOO_LARGE')
    // OCR invokes the project's existing extractor only here, outside the DB TX.
    const ocr = await this.options.ocr.extract(Buffer.from(bytes).toString('base64'), mimeType, data.name)
    if (!isRecord(ocr)) fail('OCR_RESULT_INVALID')
    const ocrRaw = jsonBounded(ocr)
    const privateMetadata = privateMetadataFromOneDriveOcr({
      originalFileName: data.name,
      sourceVersion: inventory.sourceVersion,
      ocr,
    })
    const lifecycle: PreparedLifecycle | null = this.options.documentLifecycle
      ? {
          observation: observationFromOneDriveContent({
            identity: lifecycleIdentity(data),
            inventory,
            bytes,
            privateMetadata,
          }),
          // Images and a 25 MiB invoice continue through OCR; this merely makes
          // the durable archive state explicitly UNAVAILABLE for that snapshot.
          archive: prepareOneDrivePrivateArchive(bytes, data.name),
          needsLegacyMetadataBaseline,
        }
      : null
    return { kind: 'INVOICE', key: item.key, ocr, ocrRaw, validation: this.options.ocr.validateNew(ocr), lifecycle } satisfies PreparedInvoice
  }

  async apply(tx: Tx, item: SyncSourceItem, rawPrepared: unknown, actorId: number | null): Promise<SyncOutcome> {
    const data = parsedData(item)
    const prepared = preparedFor(item, rawPrepared)
    // Required idempotency re-read, after the service's own valid lease/cancel
    // check and before any mutation. Folder moves retain this same source ID.
    const current = await this.options.domain.lockSource(tx, data.itemId)
    if (current) {
      if (current.oneDriveDriveId && current.oneDriveDriveId !== data.driveId) return 'REVISAR'
      // Historical rows with a null library ID cannot be silently attributed.
      if (!current.oneDriveDriveId && this.historicalConfirmation !== data.driveId) return 'REVISAR'
      if (prepared.kind === 'EXISTING' && this.options.documentLifecycle) {
        const currentCheck = await this.options.documentLifecycle.verifyCurrent(tx, {
          identity: lifecycleIdentity(data),
          observation: {
            identity: lifecycleIdentity(data),
            fingerprint: oneDriveInventoryFingerprint(inventoryMetadataFor(data)),
            privateMetadata: null,
          },
          actorId,
        })
        // A prepare/apply race can reveal fresh content after prepare omitted the
        // download. The worker must retry/review; it must never create a version
        // without the mandated OCR/content read nor overwrite the existing B2 row.
        if (currentCheck !== 'CURRENT') return 'REVISAR'
      }
      if (prepared.kind === 'LIFECYCLE_REVIEW') return 'REVISAR'
      if (prepared.kind === 'LEGACY_METADATA_BASELINE') {
        if (!this.options.documentLifecycle || !this.options.domain.readPrivateMetadata || !this.options.domain.readB4Protection) return 'REVISAR'
        await this.options.documentLifecycle.apply(tx, {
          identity: lifecycleIdentity(data),
          observation: prepared.observation,
          reconciliation: await this.options.domain.readB4Protection(tx, current),
          actorId,
          archive: { artifact: null, metadataUnavailable: true, unavailableReason: 'LEGACY_METADATA_ONLY' },
          legacyPreviousMetadata: await this.options.domain.readPrivateMetadata(tx, current),
        })
        return 'REVISAR'
      }
      if (prepared.kind === 'INVOICE' && prepared.lifecycle) {
        if (!this.options.documentLifecycle || !this.options.domain.readB4Protection) return 'REVISAR'
        const legacyPreviousMetadata = prepared.lifecycle.needsLegacyMetadataBaseline
          ? (this.options.domain.readPrivateMetadata ? await this.options.domain.readPrivateMetadata(tx, current) : null)
          : null
        if (prepared.lifecycle.needsLegacyMetadataBaseline && !legacyPreviousMetadata) return 'REVISAR'
        const lifecycle = await this.options.documentLifecycle.apply(tx, {
          identity: lifecycleIdentity(data),
          observation: prepared.lifecycle.observation,
          reconciliation: await this.options.domain.readB4Protection(tx, current),
          actorId,
          archive: prepared.lifecycle.archive,
          legacyPreviousMetadata,
        })
        // AMBAR_DOCUMENTO_CAMBIADO and any insufficient-evidence result keep the
        // existing invoice/B4 untouched and wait for a person. The snapshot and
        // incident have already been stored append-only in the same P2 TX.
        if (lifecycle.outcome === 'REQUIRES_REVIEW' || lifecycle.plan?.requiresHumanConfirmation || lifecycle.duplicate?.requiresHumanConfirmation) return 'REVISAR'
      }
      if (locationsEqual(current.location, data.location)) return 'SIN_CAMBIOS'
      return (await this.options.domain.updateLocation(tx, current, data.location, actorId)) ? 'ACTUALIZADA' : 'SIN_CAMBIOS'
    }

    if (item.tipo === 'ONEDRIVE_CONFIRMING_SOPORTE') {
      if (prepared.kind !== 'CONFIRMING') return 'REVISAR'
      // The durable job item itself is the only new confirming inventory catalog
      // entry. It carries normalized ID, path, name, mime, size and eTag for UI
      // access, yet P2 creates no FacturaRecibida/review/C9 support, bank
      // reference, B4 link, movement, OCR, auto-reconciliation or email.
      return 'SIN_CAMBIOS'
    }

    if (item.tipo !== 'ONEDRIVE_FACTURA' || prepared.kind !== 'INVOICE') return 'REVISAR'
    if (prepared.lifecycle) {
      if (!this.options.documentLifecycle) return 'REVISAR'
      const lifecycle = await this.options.documentLifecycle.apply(tx, {
        identity: lifecycleIdentity(data),
        observation: prepared.lifecycle.observation,
        reconciliation: { status: 'NONE' },
        actorId,
        archive: prepared.lifecycle.archive,
        legacyPreviousMetadata: null,
      })
      if (lifecycle.outcome === 'REQUIRES_REVIEW' || lifecycle.plan?.requiresHumanConfirmation || lifecycle.duplicate?.requiresHumanConfirmation) return 'REVISAR'
    }
    // Re-validate exactly at apply: a prepared payload is not a trusted domain fact.
    const validation = this.options.ocr.validateNew(prepared.ocr)
    if ('motivo' in validation) {
      await this.options.domain.createReview(tx, {
        itemId: data.itemId, location: data.location, ocr: prepared.ocr,
        ocrRaw: prepared.ocrRaw, reason: validation.motivo,
      }, actorId)
      return 'REVISAR'
    }
    const dedupe = await this.options.domain.lockedDedupePlan(tx, validation.identidad)
    // P1 will backfill canonical nulls. Until then, avoid a duplicate only on
    // the current B2 normalizers' exact CIF+number result; never infer by name,
    // filename, amount, date, or fuzzy similarity.
    if (await this.options.domain.hasLegacyExactCanonicalMatch(tx, prepared.ocr, validation.identidad)) return 'REVISAR'
    await this.options.domain.createInvoice(tx, {
      itemId: data.itemId, location: data.location, ocr: prepared.ocr,
      ocrRaw: prepared.ocrRaw, identity: validation.identidad, dedupe,
    }, actorId)
    return 'NUEVA'
  }
}
