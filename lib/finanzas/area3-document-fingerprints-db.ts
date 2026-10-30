import { Prisma, type PrismaClient } from '@prisma/client'
import {
  AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN,
  createArea3ObservationFromExistingDocumentBytesEntry,
  type Area3ExistingDocumentBytesManifestEntry,
  type Area3ReceivedDocumentHashObservation,
} from './area3-document-fingerprints-core'

/** No source locators, hashes or URLs are returned by the browser projection. */
export const AREA3_DUPLICATE_PAGE_MAX = 50
export const AREA3_DUPLICATE_DOCUMENTS_PER_GROUP = 20
export const AREA3_APPLY_MAX_OBSERVATIONS = 1_000

type Area3QueryClient = Pick<PrismaClient, '$queryRaw'>
export type Area3FingerprintApplyTx = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>

export class Area3DocumentFingerprintStoreError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'Area3DocumentFingerprintStoreError'
  }
}

export type Area3DuplicatePage = Readonly<{ page: number; limit: number }>
export type Area3DuplicateDocument = Readonly<{ label: string; proveedor: string | null; numero: string | null; importe: string | null }>
export type Area3DuplicateGroup = Readonly<{ groupOrdinal: number; documentCount: number; hiddenDocumentCount: number; documents: readonly Area3DuplicateDocument[] }>
export type Area3DuplicatePageResult = Readonly<{ groups: readonly Area3DuplicateGroup[]; page: number; limit: number; totalGroups: number; totalPages: number }>
export type Area3FingerprintApplyResult = Readonly<{ requested: number; inserted: number; replayed: number }>
export type Area3ManifestSourceValidation = Readonly<{
  invoiceId: string
  valid: boolean
  code: 'VALID' | 'BLOCKED_INVOICE_MISSING' | 'BLOCKED_ITEM_MISMATCH' | 'BLOCKED_DRIVE_UNRESOLVED' | 'BLOCKED_DRIVE_MISMATCH' | 'BLOCKED_SOURCE_VERSION_MISMATCH'
}>

type InvoiceSourceRow = Readonly<{ invoiceId: string; itemId: string | null; driveId: string | null; updatedAt: Date | string | null }>
type DuplicateCountRow = Readonly<{ totalGroups: unknown }>
type DuplicateProjectionRow = Readonly<{ groupOrdinal: unknown; documentCount: unknown; visibleDocumentCount: unknown; documentPosition: unknown; proveedor: unknown; numero: unknown; importe: unknown }>

const CONTROL = /[\u0000-\u001f\u007f]/
function fail(code: string): never { throw new Area3DocumentFingerprintStoreError(code) }
function cleanText(value: unknown, max: number, code: string): string {
  if (typeof value !== 'string') fail(code)
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > max || CONTROL.test(normalized)) fail(code)
  return normalized
}
function nullableText(value: unknown, max: number): string | null {
  if (value === null || value === undefined || typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return !normalized || normalized.length > max || CONTROL.test(normalized) ? null : normalized
}
function safeInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : Number.NaN
  return Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null
}
function configuredDrive(value: string | null | undefined): string | null {
  return value === null || value === undefined || !value.trim() ? null : cleanText(value, 220, 'AREA3_CONFIGURED_DRIVE_INVALID')
}
function instant(value: Date | string | null): string | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function parseArea3DuplicatePage(input: Readonly<{ page?: string | null; limit?: string | null }>): Area3DuplicatePage {
  const parse = (value: string | null | undefined, fallback: number, max: number): number => {
    if (value === null || value === undefined) return fallback
    if (!/^[1-9]\d*$/.test(value)) fail('AREA3_DUPLICATE_PAGE_INVALID')
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed > max) fail('AREA3_DUPLICATE_PAGE_INVALID')
    return parsed
  }
  return { page: parse(input.page, 1, 10_000), limit: parse(input.limit, 10, AREA3_DUPLICATE_PAGE_MAX) }
}

/**
 * Bounded group projection. It counts hash groups first then returns a page and
 * at most 20 documents per group. It never creates unbounded A×B pairs and
 * never projects a content hash, source locator, URL, item ID or technical date.
 */
function duplicateProjectionSql(page: Area3DuplicatePage): Prisma.Sql {
  const offset = (page.page - 1) * page.limit
  return Prisma.sql`
    WITH duplicate_hashes AS (
      SELECT h.content_sha256,COUNT(DISTINCT h.factura_recibida_id)::int AS document_count
      FROM area3_received_document_hashes h
      GROUP BY h.content_sha256
      HAVING COUNT(DISTINCT h.factura_recibida_id) >= 2
    ), paged_hashes AS (
      SELECT content_sha256,document_count,
             (SELECT COUNT(*) FROM duplicate_hashes numbered WHERE numbered.content_sha256<=current_hash.content_sha256)::int AS group_ordinal
      FROM duplicate_hashes current_hash
      ORDER BY content_sha256 ASC
      LIMIT ${page.limit} OFFSET ${offset}
    ), latest_per_invoice AS (
      SELECT DISTINCT ON (h.content_sha256,h.factura_recibida_id)
        h.content_sha256,h.factura_recibida_id,h.observed_at,h.id
      FROM area3_received_document_hashes h
      JOIN paged_hashes g ON g.content_sha256=h.content_sha256
      ORDER BY h.content_sha256,h.factura_recibida_id,h.observed_at DESC,h.id DESC
    ), visible_documents AS (
      SELECT p.group_ordinal,p.document_count,
             (SELECT COUNT(*) FROM latest_per_invoice numbered_document WHERE numbered_document.content_sha256=p.content_sha256 AND numbered_document.factura_recibida_id<=h.factura_recibida_id)::int AS document_position,
             f.proveedor,f.num_factura,f.total::text AS importe
      FROM paged_hashes p
      JOIN latest_per_invoice h ON h.content_sha256=p.content_sha256
      JOIN facturas_recibidas f ON f.id=h.factura_recibida_id
    )
    SELECT group_ordinal AS "groupOrdinal",document_count AS "documentCount",
           LEAST(document_count,${AREA3_DUPLICATE_DOCUMENTS_PER_GROUP})::int AS "visibleDocumentCount",
           document_position AS "documentPosition",proveedor,num_factura AS numero,importe
    FROM visible_documents
    WHERE document_position<=${AREA3_DUPLICATE_DOCUMENTS_PER_GROUP}
    ORDER BY group_ordinal ASC,document_position ASC
  `
}
function duplicateCountSql(): Prisma.Sql {
  return Prisma.sql`
    SELECT COUNT(*)::bigint AS "totalGroups"
    FROM (
      SELECT h.content_sha256
      FROM area3_received_document_hashes h
      GROUP BY h.content_sha256
      HAVING COUNT(DISTINCT h.factura_recibida_id)>=2
    ) duplicate_hashes
  `
}

export async function readArea3ReceivedDocumentDuplicatesPage(database: Area3QueryClient, pageInput: Area3DuplicatePage): Promise<Area3DuplicatePageResult> {
  const page = parseArea3DuplicatePage({ page: String(pageInput.page), limit: String(pageInput.limit) })
  const [countRows, rows] = await Promise.all([database.$queryRaw<DuplicateCountRow[]>(duplicateCountSql()), database.$queryRaw<DuplicateProjectionRow[]>(duplicateProjectionSql(page))])
  const totalGroups = safeInteger(countRows[0]?.totalGroups, 1_000_000) ?? fail('AREA3_DUPLICATE_COUNT_INVALID')
  const grouped = new Map<number, { documentCount: number; visibleDocumentCount: number; documents: Area3DuplicateDocument[] }>()
  for (const row of rows) {
    const groupOrdinal = safeInteger(row.groupOrdinal, 1_000_000)
    const documentCount = safeInteger(row.documentCount, 1_000_000)
    const visibleDocumentCount = safeInteger(row.visibleDocumentCount, AREA3_DUPLICATE_DOCUMENTS_PER_GROUP)
    const position = safeInteger(row.documentPosition, AREA3_DUPLICATE_DOCUMENTS_PER_GROUP)
    if (groupOrdinal === null || documentCount === null || documentCount < 2 || visibleDocumentCount === null || visibleDocumentCount < 1 || position === null || position < 1) fail('AREA3_DUPLICATE_ROW_INVALID')
    const current = grouped.get(groupOrdinal) ?? { documentCount, visibleDocumentCount, documents: [] }
    if (current.documentCount !== documentCount || current.visibleDocumentCount !== visibleDocumentCount || current.documents.length >= AREA3_DUPLICATE_DOCUMENTS_PER_GROUP) fail('AREA3_DUPLICATE_ROW_INVALID')
    current.documents.push({ label: `Archivo ${String.fromCharCode(64 + position)}`, proveedor: nullableText(row.proveedor, 300), numero: nullableText(row.numero, 256), importe: nullableText(row.importe, 80) })
    grouped.set(groupOrdinal, current)
  }
  const groups = [...grouped.entries()].map(([groupOrdinal, group]) => ({ groupOrdinal, documentCount: group.documentCount, hiddenDocumentCount: group.documentCount - group.visibleDocumentCount, documents: group.documents }))
  return { groups, page: page.page, limit: page.limit, totalGroups, totalPages: totalGroups === 0 ? 0 : Math.ceil(totalGroups / page.limit) }
}

function checkedEntries(entries: readonly Area3ExistingDocumentBytesManifestEntry[]): void {
  if (!Array.isArray(entries) || entries.length > AREA3_APPLY_MAX_OBSERVATIONS) fail('AREA3_MANIFEST_SOURCE_BATCH_INVALID')
  const ids = new Set<string>()
  for (const entry of entries) {
    cleanText(entry.invoiceId, 128, 'AREA3_MANIFEST_SOURCE_INVOICE_INVALID')
    cleanText(entry.sourceItemId, 220, 'AREA3_MANIFEST_SOURCE_ITEM_INVALID')
    if (ids.has(entry.invoiceId)) fail('AREA3_MANIFEST_SOURCE_INVOICE_DUPLICATE')
    ids.add(entry.invoiceId)
  }
}

async function lockedInvoiceSources(tx: Pick<Area3FingerprintApplyTx, '$queryRaw'>, entries: readonly Area3ExistingDocumentBytesManifestEntry[]): Promise<Map<string, InvoiceSourceRow>> {
  if (!entries.length) return new Map()
  const rows = await tx.$queryRaw<InvoiceSourceRow[]>(Prisma.sql`
    SELECT f.id::text AS "invoiceId",f.onedrive_item_id AS "itemId",f.onedrive_drive_id AS "driveId",f.updated_at AS "updatedAt"
    FROM facturas_recibidas f
    WHERE f.id IN (${Prisma.join(entries.map(entry => Prisma.sql`${entry.invoiceId}`))})
    ORDER BY f.id ASC
    LIMIT ${entries.length + 1}
    FOR KEY SHARE
  `)
  if (rows.length > entries.length) fail('AREA3_MANIFEST_SOURCE_UNBOUNDED')
  return new Map(rows.map(row => [row.invoiceId, row]))
}

/**
 * Validates all manifest entries against the exact invoice/item/drive/source time
 * currently stored. No Graph/files/URLs/snapshot tables are read. A null
 * manifest drive is accepted only for an invoice without a stored drive when an
 * explicit configured drive was available to the delegated reader.
 */
export async function validateArea3ExistingDocumentManifestSourcesTx(input: Readonly<{
  tx: Pick<Area3FingerprintApplyTx, '$queryRaw'>
  entries: readonly Area3ExistingDocumentBytesManifestEntry[]
  configuredDriveId?: string | null
}>): Promise<readonly Area3ManifestSourceValidation[]> {
  checkedEntries(input.entries)
  const fallbackDrive = configuredDrive(input.configuredDriveId)
  const sources = await lockedInvoiceSources(input.tx, input.entries)
  return input.entries.map((entry): Area3ManifestSourceValidation => {
    const source = sources.get(entry.invoiceId)
    if (!source) return { invoiceId: entry.invoiceId, valid: false, code: 'BLOCKED_INVOICE_MISSING' }
    if (source.itemId !== entry.sourceItemId) return { invoiceId: entry.invoiceId, valid: false, code: 'BLOCKED_ITEM_MISMATCH' }
    if (instant(source.updatedAt) !== entry.sourceUpdatedAt) return { invoiceId: entry.invoiceId, valid: false, code: 'BLOCKED_SOURCE_VERSION_MISMATCH' }
    if (entry.sourceDriveId === null) {
      if (source.driveId !== null || !fallbackDrive) return { invoiceId: entry.invoiceId, valid: false, code: 'BLOCKED_DRIVE_UNRESOLVED' }
    } else if (source.driveId !== null ? source.driveId !== entry.sourceDriveId : fallbackDrive !== entry.sourceDriveId) {
      return { invoiceId: entry.invoiceId, valid: false, code: 'BLOCKED_DRIVE_MISMATCH' }
    }
    return { invoiceId: entry.invoiceId, valid: true, code: 'VALID' }
  })
}

function validateObservation(observation: Area3ReceivedDocumentHashObservation): Area3ReceivedDocumentHashObservation {
  if (observation.schema !== 'AREA3_RECEIVED_DOCUMENT_FINGERPRINT_V1' || observation.source.kind !== 'PREVIEW_EXISTING_FILE_MANIFEST' || observation.source.observationRef !== AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN) fail('AREA3_APPLY_OBSERVATION_INVALID')
  cleanText(observation.facturaRecibidaId, 128, 'AREA3_APPLY_INVOICE_INVALID')
  cleanText(observation.source.sourceItemId, 220, 'AREA3_APPLY_ITEM_INVALID')
  if (observation.source.sourceDriveId) cleanText(observation.source.sourceDriveId, 220, 'AREA3_APPLY_DRIVE_INVALID')
  if (!/^[a-f0-9]{64}$/.test(observation.fingerprint.contentSha256) || !Number.isSafeInteger(observation.fingerprint.byteLength) || observation.fingerprint.byteLength < 1 || observation.fingerprint.byteLength > 20 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(observation.source.sourceVersionFingerprint) || !/^[a-f0-9]{64}$/.test(observation.idempotencyKey)) fail('AREA3_APPLY_OBSERVATION_INVALID')
  return observation
}

/**
 * Atomic, injectable apply seam. The caller owns transaction begin/commit or a
 * rollback rehearsal. It locks referenced invoices, revalidates manifest origin
 * in the same transaction, then inserts only Area 3 metadata idempotently.
 */
export async function applyArea3ReceivedDocumentHashObservationsTx(input: Readonly<{
  tx: Area3FingerprintApplyTx
  observations: readonly Area3ReceivedDocumentHashObservation[]
  entries: readonly Area3ExistingDocumentBytesManifestEntry[]
  configuredDriveId?: string | null
}>): Promise<Area3FingerprintApplyResult> {
  if (!Array.isArray(input.observations) || input.observations.length > AREA3_APPLY_MAX_OBSERVATIONS) fail('AREA3_APPLY_BATCH_INVALID')
  checkedEntries(input.entries)
  const observationsByInvoice = new Map<string, Area3ReceivedDocumentHashObservation>()
  for (const observation of input.observations) {
    validateObservation(observation)
    if (observationsByInvoice.has(observation.facturaRecibidaId)) fail('AREA3_APPLY_INVOICE_DUPLICATE')
    observationsByInvoice.set(observation.facturaRecibidaId, observation)
  }
  const expectedHashEntries = input.entries.filter(entry => entry.status === 'HASHED')
  if (expectedHashEntries.length !== input.observations.length || expectedHashEntries.some(entry => !observationsByInvoice.has(entry.invoiceId))) fail('AREA3_APPLY_MANIFEST_OBSERVATIONS_MISMATCH')
  if (!input.entries.length) return { requested: 0, inserted: 0, replayed: 0 }
  const validation = await validateArea3ExistingDocumentManifestSourcesTx({ tx: input.tx, entries: input.entries, configuredDriveId: input.configuredDriveId })
  if (validation.some(row => !row.valid)) fail('AREA3_APPLY_SOURCE_CHANGED_OR_BLOCKED')
  if (!input.observations.length) return { requested: 0, inserted: 0, replayed: 0 }
  const values = input.observations.map(observation => Prisma.sql`(
    gen_random_uuid(),${observation.facturaRecibidaId},${observation.fingerprint.contentSha256},${observation.fingerprint.byteLength},
    ${observation.source.kind},${observation.source.observationRef},${observation.source.sourceItemId},${observation.source.sourceDriveId},
    ${observation.source.sourceUpdatedAt}::timestamptz,${observation.source.sourceReadAt}::timestamptz,
    ${observation.source.sourceVersionFingerprint},${observation.idempotencyKey},CURRENT_TIMESTAMP
  )`)
  const inserted = await input.tx.$executeRaw(Prisma.sql`
    INSERT INTO area3_received_document_hashes
      (id,factura_recibida_id,content_sha256,byte_length,source_kind,source_observation,source_item_id,source_drive_id,source_updated_at,source_read_at,source_version_fingerprint,idempotency_key,observed_at)
    VALUES ${Prisma.join(values)}
    ON CONFLICT (idempotency_key) DO NOTHING
  `)
  if (!Number.isSafeInteger(inserted) || inserted < 0 || inserted > input.observations.length) fail('AREA3_APPLY_INSERT_RESULT_INVALID')
  return { requested: input.observations.length, inserted, replayed: input.observations.length - inserted }
}

/** Converts only HASHED entries; UNREADABLE entries never create a fake hash/match. */
export function observationsFromArea3ManifestEntries(entries: readonly Area3ExistingDocumentBytesManifestEntry[]): readonly Area3ReceivedDocumentHashObservation[] {
  return entries.flatMap(entry => {
    const observation = createArea3ObservationFromExistingDocumentBytesEntry(entry)
    return observation ? [observation] : []
  })
}

/** Exported static SQL surface for tests; this module never opens Graph or stores bytes. */
export const area3ReceivedDocumentHashSql = {
  duplicateDocumentsPerGroup: AREA3_DUPLICATE_DOCUMENTS_PER_GROUP,
  duplicateProjectionForTests: (page: Area3DuplicatePage) => duplicateProjectionSql(parseArea3DuplicatePage({ page: String(page.page), limit: String(page.limit) })),
  duplicateCountForTests: () => duplicateCountSql(),
} as const
