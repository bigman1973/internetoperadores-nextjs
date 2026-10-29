/*
 * Integración P2 OneDrive del ciclo de vida documental.
 *
 * Los bytes sólo existen en el payload efímero de `prepare` y se archivan dentro
 * de la transacción P2 ya protegida por lease/cancelación. Este módulo no abre
 * transacciones, no llama Graph/OCR, no persiste URL/tokens y no modifica B4,
 * facturas, movimientos, cobros ni vínculos bancarios.
 */
import { createHash } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import {
  fingerprintDocumentContent,
  planDocumentLifecycle,
  type DocumentContentFingerprint,
  type DocumentLifecycleIdentity,
  type DocumentLifecyclePlan,
  type DocumentObservation,
  type DocumentPrivateMetadata,
  type ReconciliationProtection,
  type StoredDocumentVersion,
} from '@/lib/finanzas/finance-document-lifecycle-core'
import { preparePrivateArtifact, type PreparedPrivateArtifact } from '@/lib/finanzas/finance-document-lifecycle-adapter'
import {
  applyDocumentLifecyclePlanTx,
  lockDocumentLifecycleForIncomingTx,
  readDocumentLifecycleSnapshotTx,
  recordHashDuplicateTx,
  type DocumentLifecyclePrismaTx,
  type EffectiveFinanceWriteAccess,
} from '@/lib/finanzas/finance-document-lifecycle-db'
import {
  createPostgresPrivateDocumentArchive,
  preservePrivateArchiveBytesBeforeReplacementTx,
} from '@/lib/finanzas/finance-document-private-archive-db'
import { planContentDuplicate, type DuplicateDocument, type DuplicatePlan } from '@/lib/finanzas/finance-content-duplicates-core'
import { aCentimosExactos, claveCanonicaFactura, esFechaDocumentoIso, esImporteCentimosFinito } from '@/lib/finanzas/invoice-quality'

export const ONEDRIVE_DOCUMENT_LIFECYCLE_SOURCE = 'ONEDRIVE' as const
export const ONEDRIVE_DOCUMENT_ARCHIVE_MAX_BYTES = 20 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type OneDriveInventoryDocumentMetadata = Readonly<{
  byteLength: number | null
  quickXorHash: string | null
  cTag: string | null
  eTag: string | null
  sourceVersion: string | null
}>

export type OneDriveContentReadDecision =
  | 'READ_CONTENT'
  | 'NO_CONTENT'
  | 'LEGACY_METADATA_BASELINE'
  | 'REVIEW_INSUFFICIENT_EVIDENCE'

export type OneDrivePrivateArchivePreparation = Readonly<{
  artifact: PreparedPrivateArtifact | null
  /** Explicitly distinguishes unavailable archive metadata from a missing document. */
  metadataUnavailable: boolean
  unavailableReason: 'FORMAT_NOT_ARCHIVABLE' | 'SIZE_NOT_ARCHIVABLE' | 'LEGACY_METADATA_ONLY' | null
}>

export type OneDriveLifecycleApplyResult = Readonly<{
  outcome: 'CREATED' | 'REPLAY' | 'NO_MUTATION' | 'REQUIRES_REVIEW'
  plan: DocumentLifecyclePlan | null
  lifecycleId: string | null
  /**
   * Identidad de la instantánea que el lifecycle acaba de volver durable dentro
   * de este mismo `tx`. Nunca se genera en memoria: sólo se relee de la tabla
   * tras el archive/apply. Los resultados sin nueva instantánea devuelven null.
   */
  snapshotId: string | null
  versionNumber: number | null
  metadataUnavailable: boolean
  duplicate: DuplicatePlan | null
}>

export type OneDriveLifecycleCurrentCheck = 'CURRENT' | 'REQUIRES_CONTENT' | 'REQUIRES_REVIEW'

export type OneDriveLifecycleApplyInput = Readonly<{
  identity: DocumentLifecycleIdentity
  observation: DocumentObservation
  reconciliation: ReconciliationProtection
  actorId: number | null
  /** Bytes are represented only by an already validated in-memory archive artifact. */
  archive: OneDrivePrivateArchivePreparation
  /**
   * Existing source rows that predate lifecycle storage get a metadata-only,
   * explicitly UNAVAILABLE baseline. It never claims historical bytes existed.
   */
  legacyPreviousMetadata: DocumentPrivateMetadata | null
}>

export interface OneDriveDocumentLifecyclePort<Tx = unknown> {
  readCurrent(identity: DocumentLifecycleIdentity): Promise<StoredDocumentVersion | null>
  /** Re-reads the locked current snapshot in the P2 TX; it never writes a version. */
  verifyCurrent(tx: Tx, input: Readonly<{
    identity: DocumentLifecycleIdentity
    observation: DocumentObservation
    actorId: number | null
  }>): Promise<OneDriveLifecycleCurrentCheck>
  apply(tx: Tx, input: OneDriveLifecycleApplyInput): Promise<OneDriveLifecycleApplyResult>
}

export class OneDriveDocumentLifecycleError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'OneDriveDocumentLifecycleError'
  }
}

function fail(code: string): never { throw new OneDriveDocumentLifecycleError(code) }
function nullableOpaque(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  if (!normalized || normalized.length > max || /[\u0000-\u001F\u007F]/.test(normalized)) return null
  if (/https?:\/\//i.test(normalized) || /(?:sig|token|access_token)=/i.test(normalized)) return null
  return normalized
}
function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function stableJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (!value || typeof value !== 'object') fail('ONEDRIVE_LIFECYCLE_CANONICAL_INVALID')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}
function stableHash(value: unknown): string { return sha256(stableJson(value)) }

/** Inventory data is metadata only: it never accepts document bytes or a Graph URL. */
export function oneDriveInventoryFingerprint(input: OneDriveInventoryDocumentMetadata): DocumentContentFingerprint {
  const byteLength = input.byteLength === null || input.byteLength === undefined ? null : input.byteLength
  if (byteLength !== null && (!Number.isSafeInteger(byteLength) || byteLength < 0)) fail('ONEDRIVE_LIFECYCLE_BYTE_LENGTH_INVALID')
  return {
    contentSha256: null,
    byteLength,
    quickXorHash: nullableOpaque(input.quickXorHash, 1024),
    cTag: nullableOpaque(input.cTag, 1024),
    eTag: nullableOpaque(input.eTag, 1024),
    graphVersion: nullableOpaque(input.sourceVersion, 1024),
    numberFingerprint: null,
    amountFingerprint: null,
  }
}

/**
 * eTag-only changes stay metadata-only because the pure lifecycle core gives
 * content SHA-256, quickXorHash and cTag strict precedence over eTag.
 */
export function decideOneDriveContentRead(input: Readonly<{
  sourceExists: boolean
  current: StoredDocumentVersion | null
  incoming: DocumentObservation
}>): OneDriveContentReadDecision {
  if (!input.sourceExists) return 'READ_CONTENT'
  // The adapter persists real canonical B2 metadata as v1/UNAVAILABLE and the
  // current downloaded observation as v2. v1 never claims to contain old bytes.
  if (!input.current) return 'LEGACY_METADATA_BASELINE'
  const plan = planDocumentLifecycle(input.current, input.incoming, { status: 'NONE' })
  if (plan.action === 'CREATE_VERSION') return 'READ_CONTENT'
  if (plan.action === 'NO_MUTATION') return 'NO_CONTENT'
  return 'REVIEW_INSUFFICIENT_EVIDENCE'
}

/** Builds private metadata only from OCR values already obtained by the existing extractor. */
export function privateMetadataFromOneDriveOcr(input: Readonly<{
  originalFileName: string
  sourceVersion: string | null
  ocr: Readonly<Record<string, unknown>>
}>): DocumentPrivateMetadata {
  const documentNumber = nullableOpaque(input.ocr.numFactura, 512)
  const totalCents = esImporteCentimosFinito(input.ocr.total) ? aCentimosExactos(input.ocr.total) : null
  const documentDate = esFechaDocumentoIso(input.ocr.fecha) ? input.ocr.fecha : null
  const currencyCandidate = nullableOpaque(input.ocr.moneda, 3)
  return {
    originalFileName: nullableOpaque(input.originalFileName, 1024),
    documentNumber,
    documentDate,
    totalCents,
    invoiceFiscalIdentity: claveCanonicaFactura(input.ocr.cif, input.ocr.numFactura),
    partyRole: 'PROVEEDOR',
    // A rectificativa/original reference is documentary text only. It is used
    // later by the exact-reference proposal, never inferred from an amount.
    documentClass: nullableOpaque(input.ocr.tipoDocumento, 64),
    referencedOriginalReference: nullableOpaque(input.ocr.referenciaFacturaOriginal, 512),
    currencyCode: currencyCandidate && /^[A-Z]{3}$/.test(currencyCandidate) ? currencyCandidate : null,
    upstreamVersionRef: nullableOpaque(input.sourceVersion, 1024),
  }
}

/** Hashes private comparison values; values themselves stay in private snapshot columns. */
export function privateComparisonFingerprint(metadata: DocumentPrivateMetadata): Pick<DocumentContentFingerprint, 'numberFingerprint' | 'amountFingerprint'> {
  return {
    numberFingerprint: metadata.documentNumber === null ? null : sha256(`DOCUMENT_NUMBER_V1:${metadata.documentNumber}`),
    amountFingerprint: metadata.totalCents === null ? null : sha256(`TOTAL_CENTS_V1:${metadata.totalCents}`),
  }
}

/** Creates an observation after a bounded download, without serializing its bytes. */
export function observationFromOneDriveContent(input: Readonly<{
  identity: DocumentLifecycleIdentity
  inventory: OneDriveInventoryDocumentMetadata
  bytes: Uint8Array
  privateMetadata: DocumentPrivateMetadata | null
}>): DocumentObservation {
  const content = fingerprintDocumentContent(input.bytes)
  const inventory = oneDriveInventoryFingerprint(input.inventory)
  const comparisons = input.privateMetadata ? privateComparisonFingerprint(input.privateMetadata) : { numberFingerprint: null, amountFingerprint: null }
  return {
    identity: input.identity,
    fingerprint: {
      ...inventory,
      contentSha256: content.contentSha256,
      byteLength: content.byteLength,
      ...comparisons,
    },
    privateMetadata: input.privateMetadata,
  }
}

/**
 * Selects the immutable byte archive. Images and files over 20 MiB still remain
 * eligible for the existing OCR flow; their lifecycle snapshot explicitly records
 * an UNAVAILABLE artifact instead of turning the invoice into a provider error.
 */
export function prepareOneDrivePrivateArchive(bytes: Uint8Array, originalFileName: string): OneDrivePrivateArchivePreparation {
  const extension = originalFileName.trim().toLowerCase().split('.').pop() || ''
  const archiveFormat = extension === 'pdf' || extension === 'xls' || extension === 'xlsx'
  if (!archiveFormat) return { artifact: null, metadataUnavailable: true, unavailableReason: 'FORMAT_NOT_ARCHIVABLE' }
  if (bytes.byteLength > ONEDRIVE_DOCUMENT_ARCHIVE_MAX_BYTES) {
    return { artifact: null, metadataUnavailable: true, unavailableReason: 'SIZE_NOT_ARCHIVABLE' }
  }
  try {
    return { artifact: preparePrivateArtifact(bytes, originalFileName), metadataUnavailable: false, unavailableReason: null }
  } catch {
    // Signature/format failures are an explicit unavailable archive state. OCR is
    // intentionally left to the existing extractor and is not reclassified here.
    return { artifact: null, metadataUnavailable: true, unavailableReason: 'FORMAT_NOT_ARCHIVABLE' }
  }
}

type LockedLifecycle = Readonly<{
  lifecycleId: string
  tombstoned: boolean
  current: StoredDocumentVersion | null
}>

type SnapshotIdRow = Readonly<{ snapshotId: string; versionNumber: number | bigint }>
type DuplicateCandidateRow = Readonly<{
  snapshotId: string
  lifecycleId: string
  sourceItemKey: string
  contentSha256: string | null
  quickXorHash: string | null
  byteLength: number | bigint | null
  invoiceFiscalIdentity: string | null
  documentNumber: string | null
  preservesActiveB4: boolean
  firstObservedOrder: number | bigint
}>

function legacyBaselineKeys(lifecycleId: string, metadata: DocumentPrivateMetadata): Readonly<{ idempotencyKey: string; metadataChecksum: string }> {
  const payload = { schema: 'ONEDRIVE_LEGACY_METADATA_BASELINE_V1', lifecycleId, metadata }
  return {
    idempotencyKey: stableHash({ kind: 'IDEMPOTENCY', ...payload }),
    metadataChecksum: stableHash({ kind: 'METADATA', ...payload, artifactState: 'UNAVAILABLE' }),
  }
}

/**
 * Retains canonical metadata from a source that predates lifecycle storage. It
 * deliberately writes no content evidence, no private handle and no bytes. The
 * caller must route the item to human review rather than treating it as changed.
 */
async function preserveLegacyMetadataBaseline<Tx extends DocumentLifecyclePrismaTx>(
  tx: Tx,
  lifecycle: LockedLifecycle,
  metadata: DocumentPrivateMetadata,
): Promise<boolean> {
  if (lifecycle.current) return false
  const keys = legacyBaselineKeys(lifecycle.lifecycleId, metadata)
  await tx.$queryRaw(Prisma.sql`
    INSERT INTO document_version_snapshots
      (id,lifecycle_id,version_number,content_sha256,byte_length,original_format,artifact_state,private_storage_handle,metadata_checksum,quick_xor_hash,c_tag,e_tag,graph_version,original_file_name,document_number,document_date,total_cents,invoice_fiscal_identity,party_role,document_class,referenced_original_reference,currency_code,upstream_version_ref,number_fingerprint,amount_fingerprint,idempotency_key,captured_at)
    VALUES
      (gen_random_uuid(),CAST(${lifecycle.lifecycleId} AS uuid),1,NULL,NULL,NULL,'UNAVAILABLE'::"DocumentVersionArtifactState",NULL,${keys.metadataChecksum},NULL,NULL,NULL,NULL,${metadata.originalFileName},${metadata.documentNumber},${metadata.documentDate ? Prisma.sql`CAST(${metadata.documentDate} AS date)` : Prisma.sql`NULL`},${metadata.totalCents},${metadata.invoiceFiscalIdentity},${metadata.partyRole},${metadata.documentClass},${metadata.referencedOriginalReference},${metadata.currencyCode},${metadata.upstreamVersionRef},NULL,NULL,${keys.idempotencyKey},CURRENT_TIMESTAMP)
    ON CONFLICT (idempotency_key) DO NOTHING
  `)
  await tx.$queryRaw(Prisma.sql`
    UPDATE document_version_lifecycle
    SET current_version=1,updated_at=CURRENT_TIMESTAMP
    WHERE id=CAST(${lifecycle.lifecycleId} AS uuid) AND current_version=0
  `)
  return true
}

function historicalPrivateChange(previous: DocumentPrivateMetadata, incoming: DocumentPrivateMetadata | null | undefined): readonly ('NUMBER_CHANGED' | 'AMOUNT_CHANGED')[] {
  const changes: Array<'NUMBER_CHANGED' | 'AMOUNT_CHANGED'> = []
  if (previous.documentNumber !== null && incoming?.documentNumber !== null && incoming?.documentNumber !== undefined && previous.documentNumber !== incoming.documentNumber) {
    changes.push('NUMBER_CHANGED')
  }
  if (previous.totalCents !== null && incoming?.totalCents !== null && incoming?.totalCents !== undefined && previous.totalCents !== incoming.totalCents) {
    changes.push('AMOUNT_CHANGED')
  }
  return changes
}

/**
 * A pre-lifecycle B2 row has authentic metadata but no historic byte evidence.
 * Its metadata becomes v1/UNAVAILABLE, while the bytes just read from OneDrive
 * become a distinct v2. The old file is never implied to have been archived.
 */
async function appendHistoricalSuccessor<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, input: Readonly<{
  lifecycle: LockedLifecycle
  observation: DocumentObservation
  archive: OneDrivePrivateArchivePreparation
  privateStorageHandle: string | null
  previousMetadata: DocumentPrivateMetadata
  reconciliation: ReconciliationProtection
  actorId: number
  assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx>
}>): Promise<Readonly<{ outcome: 'CREATED' | 'REPLAY'; requiresHumanConfirmation: boolean }>> {
  const fingerprint = input.observation.fingerprint
  const metadata = input.observation.privateMetadata ?? null
  const idempotencyKey = stableHash({
    schema: 'ONEDRIVE_HISTORICAL_SUCCESSOR_V1', lifecycleId: input.lifecycle.lifecycleId,
    versionNumber: 2, fingerprint, metadata,
  })
  const metadataChecksum = stableHash({
    schema: 'ONEDRIVE_HISTORICAL_SUCCESSOR_V1', lifecycleId: input.lifecycle.lifecycleId,
    versionNumber: 2,
    archive: input.archive.artifact ? {
      state: 'CAPTURED', format: input.archive.artifact.format, byteLength: input.archive.artifact.byteLength,
      contentSha256: input.archive.artifact.contentSha256, checksum: input.archive.artifact.metadataChecksum,
    } : { state: 'UNAVAILABLE' },
    fingerprint, metadata,
  })
  const inserted = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO document_version_snapshots
      (id,lifecycle_id,version_number,content_sha256,byte_length,original_format,artifact_state,private_storage_handle,metadata_checksum,quick_xor_hash,c_tag,e_tag,graph_version,original_file_name,document_number,document_date,total_cents,invoice_fiscal_identity,party_role,document_class,referenced_original_reference,currency_code,upstream_version_ref,number_fingerprint,amount_fingerprint,idempotency_key,captured_at)
    VALUES
      (gen_random_uuid(),CAST(${input.lifecycle.lifecycleId} AS uuid),2,${input.archive.artifact?.contentSha256 ?? fingerprint.contentSha256 ?? null},${input.archive.artifact?.byteLength ?? fingerprint.byteLength ?? null},${input.archive.artifact ? Prisma.sql`${input.archive.artifact.format}::"DocumentVersionOriginalFormat"` : Prisma.sql`NULL`},${input.archive.artifact ? Prisma.sql`'CAPTURED'::"DocumentVersionArtifactState"` : Prisma.sql`'UNAVAILABLE'::"DocumentVersionArtifactState"`},${input.privateStorageHandle ? Prisma.sql`CAST(${input.privateStorageHandle} AS uuid)` : Prisma.sql`NULL`},${metadataChecksum},${fingerprint.quickXorHash ?? null},${fingerprint.cTag ?? null},${fingerprint.eTag ?? null},${fingerprint.graphVersion ?? null},${metadata?.originalFileName ?? null},${metadata?.documentNumber ?? null},${metadata?.documentDate ? Prisma.sql`CAST(${metadata.documentDate} AS date)` : Prisma.sql`NULL`},${metadata?.totalCents ?? null},${metadata?.invoiceFiscalIdentity ?? null},${metadata?.partyRole ?? null},${metadata?.documentClass ?? null},${metadata?.referencedOriginalReference ?? null},${metadata?.currencyCode ?? null},${metadata?.upstreamVersionRef ?? null},${fingerprint.numberFingerprint ?? null},${fingerprint.amountFingerprint ?? null},${idempotencyKey},CURRENT_TIMESTAMP)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id::text AS id
  `)
  await tx.$queryRaw(Prisma.sql`
    UPDATE document_version_lifecycle
    SET current_version=2,updated_at=CURRENT_TIMESTAMP
    WHERE id=CAST(${input.lifecycle.lifecycleId} AS uuid) AND current_version=1
  `)
  const reasons = input.reconciliation.status === 'CONFIRMED'
    ? historicalPrivateChange(input.previousMetadata, metadata) : []
  if (reasons.length) {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO document_version_incidents (id,lifecycle_id,previous_version,new_version,code,color,reasons,state,reported_by_id,created_at)
      VALUES (gen_random_uuid(),CAST(${input.lifecycle.lifecycleId} AS uuid),1,2,'AMBAR_DOCUMENTO_CAMBIADO','AMBAR',CAST(${JSON.stringify(reasons)} AS jsonb),'OPEN'::"DocumentVersionIncidentState",${input.actorId},CURRENT_TIMESTAMP)
      ON CONFLICT (lifecycle_id,previous_version,new_version,code) DO NOTHING
    `)
  }
  return { outcome: inserted.length ? 'CREATED' : 'REPLAY', requiresHumanConfirmation: reasons.length > 0 }
}

function fiscalFromPrivateIdentity(value: string | null, fallbackNumber: string | null): Readonly<{ cif: string | null; invoiceNumber: string | null }> {
  if (!value) return { cif: null, invoiceNumber: fallbackNumber }
  const matched = /^CIF:([^|]+)\|NUM:(.+)$/.exec(value)
  if (!matched) return { cif: null, invoiceNumber: fallbackNumber }
  return { cif: matched[1], invoiceNumber: matched[2] }
}

function safeLength(value: number | bigint | null): number | null {
  if (value === null) return null
  const asNumber = Number(value)
  return Number.isSafeInteger(asNumber) && asNumber >= 0 ? asNumber : null
}
function safeOrder(value: number | bigint): number {
  const asNumber = Number(value)
  return Number.isSafeInteger(asNumber) && asNumber >= 0 ? asNumber : 0
}

/**
 * Lee el identificador que PostgreSQL asignó a la versión durable. No reutiliza
 * un UUID calculado ni una versión de plan: el hook confirming debe recibir
 * exactamente la pareja que quedó archivada en la transacción P2 viva.
 */
async function durableSnapshotForVersion<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, lifecycleId: string, versionNumber: number): Promise<Readonly<{ snapshotId: string; versionNumber: number }>> {
  const rows = await tx.$queryRaw<SnapshotIdRow[]>(Prisma.sql`
    SELECT id::text AS "snapshotId",version_number AS "versionNumber"
    FROM document_version_snapshots
    WHERE lifecycle_id=CAST(${lifecycleId} AS uuid) AND version_number=${versionNumber}
    LIMIT 2 FOR KEY SHARE
  `)
  if (rows.length > 1) fail('ONEDRIVE_LIFECYCLE_SNAPSHOT_AMBIGUOUS')
  const row = rows[0]
  const snapshotId = row?.snapshotId
  const storedVersion = Number(row?.versionNumber)
  if (!snapshotId || !UUID.test(snapshotId) || !Number.isSafeInteger(storedVersion) || storedVersion !== versionNumber) {
    fail('ONEDRIVE_LIFECYCLE_SNAPSHOT_MISSING')
  }
  return { snapshotId, versionNumber: storedVersion }
}

/**
 * Hash-only duplicate reader. It selects no byte, URL, OCR raw or eTag/cTag and
 * uses snapshots as the sole document evidence. A duplicate only appends the
 * existing non-financial observation; source invoices and B4 links are untouched.
 */
async function observeSnapshotContentDuplicate<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, input: Readonly<{
  lifecycleId: string
  snapshotId: string
  observation: DocumentObservation
  actorId: number
  assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx>
}>): Promise<DuplicatePlan | null> {
  const contentSha256 = input.observation.fingerprint.contentSha256
  if (!contentSha256) return null
  const rows = await tx.$queryRaw<DuplicateCandidateRow[]>(Prisma.sql`
    SELECT s.id::text AS "snapshotId",l.id::text AS "lifecycleId",l.source_item_key AS "sourceItemKey",
      s.content_sha256 AS "contentSha256",s.quick_xor_hash AS "quickXorHash",s.byte_length AS "byteLength",
      s.invoice_fiscal_identity AS "invoiceFiscalIdentity",s.document_number AS "documentNumber",
      EXISTS(
        SELECT 1
        FROM facturas_recibidas f
        JOIN documentos_conciliables d ON d.factura_recibida_id=f.id AND d.activo
        JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
        JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4"
        WHERE l.source='ONEDRIVE' AND l.source_item_key=(f.onedrive_drive_id || ':' || f.onedrive_item_id)
      ) AS "preservesActiveB4",
      row_number() OVER (ORDER BY s.captured_at ASC,s.id ASC)::int AS "firstObservedOrder"
    FROM document_version_snapshots s
    JOIN document_version_lifecycle l ON l.id=s.lifecycle_id
    WHERE s.content_sha256=${contentSha256}
    ORDER BY s.captured_at ASC,s.id ASC
    LIMIT 50
  `)
  const incomingFiscal = fiscalFromPrivateIdentity(
    input.observation.privateMetadata?.invoiceFiscalIdentity ?? null,
    input.observation.privateMetadata?.documentNumber ?? null,
  )
  const incoming: DuplicateDocument = {
    lifecycleId: input.lifecycleId,
    snapshotId: input.snapshotId,
    sourceItemKey: input.observation.identity.sourceItemKey,
    kind: 'RECEIVED_INVOICE',
    fingerprint: {
      sha256Bytes: contentSha256,
      quickXorHash: input.observation.fingerprint.quickXorHash ?? null,
      byteLength: input.observation.fingerprint.byteLength ?? null,
    },
    fiscal: incomingFiscal,
    preservesActiveB4: false,
    firstObservedOrder: rows.find(row => row.snapshotId === input.snapshotId)?.firstObservedOrder
      ? safeOrder(rows.find(row => row.snapshotId === input.snapshotId)!.firstObservedOrder) : 0,
  }
  const candidates: DuplicateDocument[] = rows.map(row => ({
    lifecycleId: row.lifecycleId,
    snapshotId: row.snapshotId,
    sourceItemKey: row.sourceItemKey,
    kind: 'RECEIVED_INVOICE',
    fingerprint: {
      sha256Bytes: row.contentSha256,
      quickXorHash: row.quickXorHash,
      byteLength: safeLength(row.byteLength),
    },
    fiscal: fiscalFromPrivateIdentity(row.invoiceFiscalIdentity, row.documentNumber),
    preservesActiveB4: row.preservesActiveB4 === true,
    firstObservedOrder: safeOrder(row.firstObservedOrder),
  }))
  const plan = planContentDuplicate(incoming, candidates)
  const partner = candidates.find(candidate =>
    candidate.lifecycleId !== incoming.lifecycleId
    && candidate.fingerprint.sha256Bytes === incoming.fingerprint.sha256Bytes,
  )
  // `SOFT_CANONICAL_LINK` intentionally remains just this immutable hash-pair
  // observation. It does not alter either invoice, canonical B2 choice or B4 link.
  if (partner) {
    await recordHashDuplicateTx(tx, {
      proposal: {
        leftSnapshotHash: sha256(`DOCUMENT_SNAPSHOT_V1:${input.snapshotId}`),
        rightSnapshotHash: sha256(`DOCUMENT_SNAPSHOT_V1:${partner.snapshotId}`),
        contentSha256,
      },
      leftSnapshotId: input.snapshotId,
      rightSnapshotId: partner.snapshotId,
      actor: { actorId: input.actorId },
      assertEffectiveFinanceWriteAccess: input.assertEffectiveFinanceWriteAccess,
    })
  }
  return plan
}

/**
 * Concrete transaction-bound adapter. The production factory injects the P2
 * authorization callback; it must evaluate the real actor inside this same TX.
 */
export class PrismaOneDriveDocumentLifecycle<Tx extends DocumentLifecyclePrismaTx = Prisma.TransactionClient> implements OneDriveDocumentLifecyclePort<Tx> {
  constructor(
    private readonly client: Pick<PrismaClient, '$queryRaw'>,
    private readonly assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx>,
  ) {}

  async readCurrent(identity: DocumentLifecycleIdentity): Promise<StoredDocumentVersion | null> {
    const read = await readDocumentLifecycleSnapshotTx(this.client, identity, false)
    return read?.current ?? null
  }

  async verifyCurrent(tx: Tx, input: Readonly<{
    identity: DocumentLifecycleIdentity
    observation: DocumentObservation
    actorId: number | null
  }>): Promise<OneDriveLifecycleCurrentCheck> {
    if (!Number.isSafeInteger(input.actorId) || input.actorId === null || input.actorId < 1) {
      fail('ONEDRIVE_LIFECYCLE_ACTOR_REQUIRED')
    }
    const locked = await lockDocumentLifecycleForIncomingTx(tx, {
      identity: input.identity,
      actor: { actorId: input.actorId },
      assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
    })
    if (!locked.current) return 'REQUIRES_REVIEW'
    const plan = planDocumentLifecycle(locked.current, input.observation, { status: 'NONE' })
    if (plan.action === 'NO_MUTATION') return 'CURRENT'
    return plan.action === 'CREATE_VERSION' ? 'REQUIRES_CONTENT' : 'REQUIRES_REVIEW'
  }

  async apply(tx: Tx, input: OneDriveLifecycleApplyInput): Promise<OneDriveLifecycleApplyResult> {
    if (!Number.isSafeInteger(input.actorId) || input.actorId === null || input.actorId < 1) {
      fail('ONEDRIVE_LIFECYCLE_ACTOR_REQUIRED')
    }
    // This is intentionally a second real authorization check after the P2
    // repository's apply fence. It is never a permissive placeholder callback.
    if (!await this.assertEffectiveFinanceWriteAccess(tx, input.actorId)) {
      fail('ONEDRIVE_LIFECYCLE_ACCESS_DENIED')
    }
    // The parent-owned bridge performs the real effective-access check, locks or
    // creates the durable lifecycle, and rejects tombstones before any BYTEA DML.
    const locked: LockedLifecycle = await lockDocumentLifecycleForIncomingTx(tx, {
      identity: input.identity,
      actor: { actorId: input.actorId },
      assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
    })

    const historicalPredecessor = !locked.current && input.legacyPreviousMetadata ? input.legacyPreviousMetadata : null
    if (historicalPredecessor) await preserveLegacyMetadataBaseline(tx, locked, historicalPredecessor)
    const effectiveCurrent = historicalPredecessor
      ? (await readDocumentLifecycleSnapshotTx(tx, input.identity, true))?.current ?? null
      : locked.current

    if (historicalPredecessor && !effectiveCurrent) fail('ONEDRIVE_LIFECYCLE_HISTORICAL_BASELINE_MISSING')

    const plan = historicalPredecessor ? null : planDocumentLifecycle(effectiveCurrent, input.observation, input.reconciliation)
    if (plan?.action === 'NO_MUTATION') {
      return { outcome: 'NO_MUTATION', plan, lifecycleId: locked.lifecycleId, snapshotId: null, versionNumber: null, metadataUnavailable: false, duplicate: null }
    }
    if (plan?.action === 'REQUIRES_REVIEW') {
      return { outcome: 'REQUIRES_REVIEW', plan, lifecycleId: locked.lifecycleId, snapshotId: null, versionNumber: null, metadataUnavailable: false, duplicate: null }
    }

    // A content version requires the in-memory artifact decision from prepare. A
    // missing eligible artifact is legitimate only when the explicit UNAVAILABLE
    // state was selected after a real bounded download, never from absent evidence.
    const archivePort = createPostgresPrivateDocumentArchive<Tx>({
      actor: { actorId: input.actorId },
      assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
      // P2 import has no private-read authority. A private history route must bind
      // its own authenticated reader rather than inheriting a background-job actor.
      authorizeServerRead: async () => false,
    })
    let privateStorageHandle: string | null = null
    if (input.archive.artifact) {
      const archived = await archivePort.archiveIncomingImmutable(tx, {
        lifecycleId: locked.lifecycleId,
        versionNumber: historicalPredecessor ? 2 : plan!.nextVersionNumber!,
        artifact: input.archive.artifact,
        upstreamVersionRef: input.observation.privateMetadata?.upstreamVersionRef ?? null,
      })
      privateStorageHandle = archived.privateStorageHandle
    }

    if (historicalPredecessor) {
      const historical = await appendHistoricalSuccessor(tx, {
        lifecycle: locked,
        observation: input.observation,
        archive: input.archive,
        privateStorageHandle,
        previousMetadata: historicalPredecessor,
        reconciliation: input.reconciliation,
        actorId: input.actorId,
        assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
      })
      const snapshot = await durableSnapshotForVersion(tx, locked.lifecycleId, 2)
      const duplicate = await observeSnapshotContentDuplicate(tx, {
        lifecycleId: locked.lifecycleId, snapshotId: snapshot.snapshotId, observation: input.observation,
        actorId: input.actorId, assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
      })
      return {
        outcome: historical.requiresHumanConfirmation ? 'REQUIRES_REVIEW' : historical.outcome,
        plan: null,
        lifecycleId: locked.lifecycleId,
        snapshotId: snapshot.snapshotId,
        versionNumber: snapshot.versionNumber,
        metadataUnavailable: input.archive.metadataUnavailable,
        duplicate,
      }
    }

    const applied = await applyDocumentLifecyclePlanTx(tx, {
      observation: input.observation,
      reconciliation: input.reconciliation,
      archive: {
        artifact: input.archive.artifact,
        privateStorageHandle,
        upstreamVersionRef: input.observation.privateMetadata?.upstreamVersionRef ?? null,
      },
      actor: { actorId: input.actorId },
      preservePreviousBytesBeforeReplacement: (nestedTx, current, actor) =>
        preservePrivateArchiveBytesBeforeReplacementTx(nestedTx, {
          current,
          actor,
          assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
        }),
      assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
    })

    let duplicate: DuplicatePlan | null = null
    let snapshot: Readonly<{ snapshotId: string; versionNumber: number }> | null = null
    if ((applied.outcome === 'CREATED' || applied.outcome === 'REPLAY') && plan!.nextVersionNumber !== null) {
      snapshot = await durableSnapshotForVersion(tx, locked.lifecycleId, plan!.nextVersionNumber)
      duplicate = await observeSnapshotContentDuplicate(tx, {
        lifecycleId: locked.lifecycleId, snapshotId: snapshot.snapshotId,
        observation: input.observation,
        actorId: input.actorId,
        assertEffectiveFinanceWriteAccess: this.assertEffectiveFinanceWriteAccess,
      })
    }
    return {
      outcome: applied.outcome,
      plan,
      lifecycleId: locked.lifecycleId,
      snapshotId: snapshot?.snapshotId ?? null,
      versionNumber: snapshot?.versionNumber ?? null,
      metadataUnavailable: input.archive.metadataUnavailable,
      duplicate,
    }
  }
}
