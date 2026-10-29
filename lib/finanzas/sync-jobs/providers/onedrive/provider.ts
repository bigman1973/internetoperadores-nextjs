import type { GraphFile, InvoiceLibrary, OneDriveReadPort } from './graph-read'
import type { SyncOutcome, SyncSourceItem } from './types'
import { SyncProviderError } from './types'
import { fingerprintDocumentContent, type DocumentObservation, type DocumentPrivateMetadata, type ReconciliationProtection } from '@/lib/finanzas/finance-document-lifecycle-core'
import type { OneDriveDocumentLifecyclePort, OneDriveInventoryDocumentMetadata, OneDrivePrivateArchivePreparation } from './document-lifecycle'
import {
  decideOneDriveContentRead,
  observationFromOneDriveContent,
  oneDriveInventoryFingerprint,
  prepareOneDrivePrivateArchive,
  privateMetadataFromOneDriveOcr,
} from './document-lifecycle'
import { privateDocumentArtifactHandle } from '@/lib/finanzas/finance-document-private-archive-db'
import {
  applyOneDriveConfirmingReadingAfterLifecycleTx,
  prepareOneDriveConfirmingReading,
  type OneDriveConfirmingReadingApplyResult,
} from './confirming-reading'
import {
  bindPreparedFinanceConfirmingReadingP2ToArchivedSource,
  type FinanceConfirmingReadingP2Prepared,
  type FinanceConfirmingReadingPersistedSnapshot,
  type FinanceConfirmingReadingRegisteredSource,
} from '@/lib/finanzas/finance-confirming-reading-p2'
import type { FinanceConfirmingReadingDocumentKind } from '@/lib/finanzas/finance-confirming-reading-event'
import type { FinanceConfirmingReadingParserPort } from '@/lib/finanzas/finance-confirming-reading-adapter'

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

/**
 * Declaración humana previa de una fuente confirming. El worker sólo la lee: no
 * crea ni reclasifica una FacturaRecibida para hacer elegible un archivo nuevo.
 */
export type RegisteredConfirmingSupport = Readonly<{
  registroSoporteId: string
  facturaRecibidaId: string
  oneDriveDriveId: string
  oneDriveItemId: string
  tipoDetectado: FinanceConfirmingReadingDocumentKind
  parejaCaixaDeclaradaId: string | null
  hashProcesadoAnterior: string | null
}>

export type ConfirmingSupportVersionInput = Readonly<{
  lifecycleId: string
  snapshotId: string
  versionDocumento: number
  archivoControladoId: string
  sourceHash: string
}>

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
  /** Read-only declaration required before a confirming file can be downloaded. */
  readConfirmingSupport(driveId: string, itemId: string): Promise<RegisteredConfirmingSupport | null>
  /** Re-reads/locks the same declared support inside the fenced P2 transaction. */
  lockConfirmingSupport(tx: Tx, driveId: string, itemId: string): Promise<RegisteredConfirmingSupport | null>
  /** Appends the exact archived snapshot to the pre-existing support declaration. */
  registerConfirmingSupportVersion(tx: Tx, source: RegisteredConfirmingSupport, version: ConfirmingSupportVersionInput, actorId: number): Promise<boolean>
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
  /** Re-checks the real P2 actor inside the same fenced apply transaction. */
  assertLiveFinanceWriteAccess?: (tx: Tx, actorId: number) => Promise<boolean>
  /** Fixture-only parser override. Production always uses the installed C11 parsers. */
  confirmingParserPort?: FinanceConfirmingReadingParserPort
}

type PreparedExisting = { kind: 'EXISTING'; key: string }
type PreparedConfirmingCatalog = { kind: 'CONFIRMING_CATALOG'; key: string }
type PreparedConfirmingReading = Readonly<{
  kind: 'CONFIRMING_READING'
  key: string
  registeredSource: RegisteredConfirmingSupport
  bytes: Uint8Array
  lifecycle: PreparedLifecycle
  reading: FinanceConfirmingReadingP2Prepared
}>
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
type Prepared = PreparedExisting | PreparedConfirmingCatalog | PreparedConfirmingReading | PreparedLifecycleReview | PreparedLegacyBaseline | PreparedInvoice

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

export type OneDriveDeltaDispatchMetadata = Readonly<{
  driveId: string
  itemId: string
  itemName: string
  canonicalPath: string
  byteLength: number | null
  eTag: string | null
  cTag: string | null
  quickXorHash: string | null
  mimeType: string | null
  lastModifiedDateTime: string | null
}>

/**
 * Reforms one existing P2 source item from private Delta topology. This has no
 * Graph I/O and intentionally admits exactly the same root/folder/file types as
 * native B1 inventory. Unknown folders stay out of the automatic consumer.
 */
export function oneDriveItemFromDeltaMetadata(
  input: OneDriveDeltaDispatchMetadata,
  invoiceRootPath: string = FACTURAS_BASE_PATH,
): SyncSourceItem | null {
  const root = boundedString(invoiceRootPath, 2_000, 'ONEDRIVE_DELTA_ROOT_INVALID').replace(/^\/+|\/+$/g, '')
  const driveId = boundedString(input.driveId, 512, 'ONEDRIVE_DELTA_ITEM_INVALID')
  const itemId = boundedString(input.itemId, 512, 'ONEDRIVE_DELTA_ITEM_INVALID')
  const name = boundedString(input.itemName, 512, 'ONEDRIVE_DELTA_ITEM_INVALID')
  if (name.includes('/') || name.includes('\\')) fail('ONEDRIVE_DELTA_ITEM_INVALID')
  const path = boundedString(input.canonicalPath, 2_600, 'ONEDRIVE_DELTA_ITEM_INVALID').replace(/^\/+|\/+$/g, '')
  if (!path.startsWith(`${root}/`) || path !== `${path.slice(0, -(name.length + 1))}/${name}`) fail('ONEDRIVE_DELTA_ITEM_INVALID')
  const relative = path.slice(root.length + 1)
  const pieces = relative.split('/')
  if (pieces.some(piece => !piece || piece === '.' || piece === '..')) fail('ONEDRIVE_DELTA_ITEM_INVALID')
  const folderKey: B1FolderKey | null = pieces.length === 1
    ? 'raiz'
    : FOLDER_KEYS.find(key => pieces[0] === B1_FOLDERS[key].nombre) ?? null
  if (!folderKey) return null
  const folderPath = path.slice(0, -(name.length + 1))
  const file: GraphFile = {
    id: itemId,
    name,
    ...(input.byteLength === null ? {} : { size: input.byteLength }),
    ...(input.eTag === null ? {} : { eTag: input.eTag }),
    ...(input.cTag === null ? {} : { cTag: input.cTag }),
    ...(input.eTag === null ? {} : { sourceVersion: input.eTag }),
    ...(input.lastModifiedDateTime === null ? {} : { lastModifiedDateTime: input.lastModifiedDateTime }),
    ...(input.mimeType === null && input.quickXorHash === null
      ? {}
      : { file: { ...(input.mimeType === null ? {} : { mimeType: input.mimeType }), ...(input.quickXorHash === null ? {} : { hashes: { quickXorHash: input.quickXorHash } }) } }),
    relativeFolderPath: folderPath,
    folderPath,
    fullPath: path,
  }
  if (folderKey !== 'confirming_draxton' && !isInvoiceFile(file)) return null
  const data = { ...dataFor(file, folderKey, driveId, root), deltaDispatch: true as const }
  return {
    key: itemKey(data),
    tipo: folderKey === 'confirming_draxton' ? 'ONEDRIVE_CONFIRMING_SOPORTE' : 'ONEDRIVE_FACTURA',
    data: data as unknown as SyncSourceItem['data'],
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

function confirmingMetadata(data: ItemData, inventory: OneDriveInventoryDocumentMetadata): DocumentPrivateMetadata {
  return {
    originalFileName: data.name,
    documentNumber: null,
    documentDate: null,
    totalCents: null,
    invoiceFiscalIdentity: null,
    partyRole: 'CLIENTE',
    documentClass: 'CONFIRMING_SOPORTE',
    referencedOriginalReference: null,
    currencyCode: null,
    upstreamVersionRef: inventory.sourceVersion,
  }
}

function sameRegisteredSupport(left: RegisteredConfirmingSupport, right: RegisteredConfirmingSupport): boolean {
  return left.registroSoporteId === right.registroSoporteId
    && left.facturaRecibidaId === right.facturaRecibidaId
    && left.oneDriveDriveId === right.oneDriveDriveId
    && left.oneDriveItemId === right.oneDriveItemId
    && left.tipoDetectado === right.tipoDetectado
    && left.parejaCaixaDeclaradaId === right.parejaCaixaDeclaradaId
    && left.hashProcesadoAnterior === right.hashProcesadoAnterior
}

function registeredSourceFor(source: RegisteredConfirmingSupport, archivoControladoId: string): FinanceConfirmingReadingRegisteredSource {
  return {
    registroSoporteId: source.registroSoporteId,
    facturaRecibidaId: source.facturaRecibidaId,
    archivoControladoId,
    oneDriveDriveId: source.oneDriveDriveId,
    oneDriveItemId: source.oneDriveItemId,
    tipoDetectado: source.tipoDetectado,
    parejaCaixaDeclaradaId: source.parejaCaixaDeclaradaId,
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
  if (raw.kind === 'CONFIRMING_CATALOG') return { kind: 'CONFIRMING_CATALOG', key: item.key }
  if (raw.kind === 'CONFIRMING_READING' && isRecord(raw.registeredSource) && raw.bytes instanceof Uint8Array && isRecord(raw.lifecycle) && isRecord(raw.lifecycle.observation) && isRecord(raw.lifecycle.archive) && isRecord(raw.reading)) {
    return raw as unknown as PreparedConfirmingReading
  }
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
    if (item.tipo === 'ONEDRIVE_CONFIRMING_SOPORTE') {
      // Inventory alone never authorizes a byte download. A human-controlled
      // registry must identify this exact Drive item before parser/lifecycle work.
      const registeredSource = await this.options.domain.readConfirmingSupport(data.driveId, data.itemId)
      if (!registeredSource || !this.options.documentLifecycle) {
        return { kind: 'CONFIRMING_CATALOG', key: item.key } satisfies PreparedConfirmingCatalog
      }
      const inventory = inventoryMetadataFor(data)
      const metadataObservation: DocumentObservation = {
        identity: lifecycleIdentity(data),
        fingerprint: oneDriveInventoryFingerprint(inventory),
        privateMetadata: confirmingMetadata(data, inventory),
      }
      const current = await this.options.documentLifecycle.readCurrent(metadataObservation.identity)
      if (current && decideOneDriveContentRead({ sourceExists: true, current, incoming: metadataObservation }) !== 'READ_CONTENT') {
        return { kind: 'CONFIRMING_CATALOG', key: item.key } satisfies PreparedConfirmingCatalog
      }
      // C11 needs an immutable archive. Oversized/unsupported sources remain
      // catalogued for human action rather than being parsed partially.
      if (data.size !== null && data.size > 20 * 1024 * 1024) {
        return { kind: 'CONFIRMING_CATALOG', key: item.key } satisfies PreparedConfirmingCatalog
      }
      const bytes = await this.options.read.downloadFile(data.driveId, data.itemId, 20 * 1024 * 1024)
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 20 * 1024 * 1024) fail('ONEDRIVE_CONFIRMING_FILE_INVALID')
      const archive = prepareOneDrivePrivateArchive(bytes, data.name)
      if (!archive.artifact) return { kind: 'CONFIRMING_CATALOG', key: item.key } satisfies PreparedConfirmingCatalog
      const content = fingerprintDocumentContent(bytes)
      const reading = await prepareOneDriveConfirmingReading({
        source: {
          // Replaced with the durable archive handle before persistence in apply.
          archivoPrivadoId: registeredSource.registroSoporteId,
          versionContenido: inventory.sourceVersion ?? inventory.cTag ?? content.contentSha256,
          hashBinario: content.contentSha256,
          tipoDetectado: registeredSource.tipoDetectado,
          hashProcesadoAnterior: registeredSource.hashProcesadoAnterior,
          parejaCaixaDeclaradaId: registeredSource.parejaCaixaDeclaradaId,
        },
        bytes,
        originalName: data.name,
        parserPort: this.options.confirmingParserPort,
      })
      const lifecycle: PreparedLifecycle = {
        observation: observationFromOneDriveContent({
          identity: lifecycleIdentity(data), inventory, bytes,
          privateMetadata: confirmingMetadata(data, inventory),
        }),
        archive,
        needsLegacyMetadataBaseline: false,
      }
      return { kind: 'CONFIRMING_READING', key: item.key, registeredSource, bytes, lifecycle, reading } satisfies PreparedConfirmingReading
    }
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
    if (item.tipo === 'ONEDRIVE_CONFIRMING_SOPORTE') {
      if (prepared.kind === 'CONFIRMING_CATALOG') return 'SIN_CAMBIOS'
      if (prepared.kind !== 'CONFIRMING_READING' || !this.options.documentLifecycle || !this.options.assertLiveFinanceWriteAccess || !Number.isSafeInteger(actorId) || actorId === null || actorId < 1) return 'REVISAR'
      if (fingerprintDocumentContent(prepared.bytes).contentSha256 !== prepared.reading.source.hashBinario) return 'REVISAR'
      // The declaration is locked and reread after prepare. A revocation, pair
      // change, or changed target fails closed before any C11 proposal exists.
      const lockedSource = await this.options.domain.lockConfirmingSupport(tx, data.driveId, data.itemId)
      if (!lockedSource || !sameRegisteredSupport(lockedSource, prepared.registeredSource)) return 'REVISAR'
      const lifecycle = await this.options.documentLifecycle.apply(tx, {
        identity: lifecycleIdentity(data),
        observation: prepared.lifecycle.observation,
        reconciliation: { status: 'NONE' },
        actorId,
        archive: prepared.lifecycle.archive,
        legacyPreviousMetadata: null,
      })
      if (lifecycle.outcome === 'REQUIRES_REVIEW' || lifecycle.plan?.requiresHumanConfirmation || lifecycle.duplicate?.requiresHumanConfirmation || !lifecycle.lifecycleId || !lifecycle.snapshotId || !lifecycle.versionNumber) return 'REVISAR'
      const sourceHash = prepared.reading.source.hashBinario
      const archivoControladoId = privateDocumentArtifactHandle({ lifecycleId: lifecycle.lifecycleId, versionNumber: lifecycle.versionNumber, contentSha256: sourceHash })
      const snapshot: FinanceConfirmingReadingPersistedSnapshot = {
        lifecycleId: lifecycle.lifecycleId, snapshotId: lifecycle.snapshotId, versionDocumento: lifecycle.versionNumber,
      }
      if (!await this.options.domain.registerConfirmingSupportVersion(tx, lockedSource, { ...snapshot, archivoControladoId, sourceHash }, actorId)) return 'REVISAR'
      const registeredSource = registeredSourceFor(lockedSource, archivoControladoId)
      const reading = bindPreparedFinanceConfirmingReadingP2ToArchivedSource({ prepared: prepared.reading, snapshot, registeredSource })
      const result: OneDriveConfirmingReadingApplyResult = await applyOneDriveConfirmingReadingAfterLifecycleTx({
        tx: tx as never,
        actorId,
        snapshot,
        prepared: reading,
        registeredSource,
        assertLiveFinanceWriteAccess: async (currentTx, currentActorId) => this.options.assertLiveFinanceWriteAccess!(currentTx as Tx, currentActorId),
      })
      return result.outcome === 'PROPUESTA_CONFIRMACION_HUMANA' ? 'NUEVA' : result.outcome === 'REVISAR' ? 'REVISAR' : 'SIN_CAMBIOS'
    }
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
