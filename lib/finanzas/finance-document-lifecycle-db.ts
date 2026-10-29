/*
 * Almacén Prisma concreto para document_version_*.
 *
 * Sólo debe invocarse dentro de la transacción/lease del integrador después de
 * comprobar permiso efectivo. No abre conexiones, no descarga Graph, no usa
 * OCR, no toca tablas B4 ni conserva URLs/tokens. Los metadatos son privados:
 * este módulo no los registra ni los devuelve fuera de sus tipos.
 */
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import {
  planCreditLink,
  planDocumentLifecycle,
  planHashDuplicate,
  planPositiveTombstone,
  type CreditLinkProposal,
  type DocumentLifecycleIdentity,
  type DocumentLifecyclePlan,
  type DocumentObservation,
  type HashDuplicateProposal,
  type PositiveTombstoneEvidence,
  type ReconciliationProtection,
  type StoredDocumentVersion,
  type TombstoneObservation,
} from './finance-document-lifecycle-core'
import type { ArchivedOriginalFormat, LifecycleActor, PrivateBytePreservation, PreparedPrivateArtifact } from './finance-document-lifecycle-adapter'

export const DOCUMENT_LIFECYCLE_DB_SCHEMA = 'DOCUMENT_LIFECYCLE_DB_V1' as const
export type DocumentLifecyclePrismaTx = Pick<Prisma.TransactionClient, '$queryRaw'>
export type EffectiveFinanceWriteAccess<Tx = DocumentLifecyclePrismaTx> = (tx: Tx, actorId: number) => Promise<boolean>
type ArtifactState = 'CAPTURED' | 'UNAVAILABLE'
type LifecycleRow = Readonly<{
  lifecycleId: string
  state: 'ACTIVE' | 'TOMBSTONED'
  currentVersion: number
  versionNumber: number | null
  contentSha256: string | null
  byteLength: number | null
  quickXorHash: string | null
  cTag: string | null
  eTag: string | null
  graphVersion: string | null
  numberFingerprint: string | null
  amountFingerprint: string | null
  privateStorageHandle: string | null
  originalFileName: string | null
  documentNumber: string | null
  documentDate: string | null
  totalCents: number | bigint | null
  invoiceFiscalIdentity: string | null
  partyRole: 'CLIENTE' | 'PROVEEDOR' | null
  documentClass: string | null
  referencedOriginalReference: string | null
  currencyCode: string | null
  upstreamVersionRef: string | null
  capturedAt: Date | null
}>

export class DocumentLifecycleDbError extends Error {
  constructor(public readonly code: string) { super(code) }
}
function fail(code: string): never { throw new DocumentLifecycleDbError(code) }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[0-9a-f]{64}$/
function uuid(value: string, code: string): string { if (!UUID.test(value)) fail(code); return value.toLowerCase() }
function hash(value: string, code: string): string { if (!HASH.test(value)) fail(code); return value }
function actorId(value: number | null): number { if (!Number.isSafeInteger(value) || value! < 1) fail('DOCUMENT_LIFECYCLE_ACTOR_REQUIRED'); return value! }
function hasUrlOrToken(value: string | null | undefined): boolean { return Boolean(value && (/https?:\/\//i.test(value) || /(?:sig|token|access_token)=/i.test(value))) }
function safeHandle(value: string | null): string | null { if (value === null) return null; if (hasUrlOrToken(value)) fail('DOCUMENT_LIFECYCLE_PERSISTENT_URL_FORBIDDEN'); return uuid(value, 'DOCUMENT_LIFECYCLE_HANDLE_INVALID') }
function safeCents(value: number | bigint | null): number | null { if (value === null) return null; const n=Number(value); return Number.isSafeInteger(n) ? n : null }
function sha256(value: unknown): string {
  const canonical=(value: unknown): string => value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number'
    ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : value && typeof value === 'object' ? `{${Object.keys(value as Record<string,unknown>).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}` : fail('DOCUMENT_LIFECYCLE_CANONICAL_INVALID')
  return createHash('sha256').update(canonical(value)).digest('hex')
}
function toStored(identity: DocumentLifecycleIdentity, row: LifecycleRow): StoredDocumentVersion | null {
  if (row.versionNumber === null) return null
  const cents=safeCents(row.totalCents)
  return {
    identity, versionNumber: row.versionNumber,
    fingerprint: { contentSha256: row.contentSha256, byteLength: row.byteLength, quickXorHash: row.quickXorHash, cTag: row.cTag, eTag: row.eTag, graphVersion: row.graphVersion, numberFingerprint: row.numberFingerprint, amountFingerprint: row.amountFingerprint },
    privateMetadata: { originalFileName: row.originalFileName, documentNumber: row.documentNumber, documentDate: row.documentDate, totalCents: cents, invoiceFiscalIdentity: row.invoiceFiscalIdentity, partyRole: row.partyRole, documentClass: row.documentClass, referencedOriginalReference: row.referencedOriginalReference, currencyCode: row.currencyCode, upstreamVersionRef: row.upstreamVersionRef },
    privateLocatorHandle: row.privateStorageHandle,
    capturedAt: row.capturedAt?.toISOString() ?? null,
  }
}
const CURRENT_SNAPSHOT_SQL = Prisma.sql`
  SELECT l.id::text AS "lifecycleId",l.state::text AS state,l.current_version AS "currentVersion",
    s.version_number AS "versionNumber",s.content_sha256 AS "contentSha256",s.byte_length AS "byteLength",s.quick_xor_hash AS "quickXorHash",s.c_tag AS "cTag",s.e_tag AS "eTag",s.graph_version AS "graphVersion",s.number_fingerprint AS "numberFingerprint",s.amount_fingerprint AS "amountFingerprint",s.private_storage_handle::text AS "privateStorageHandle",s.original_file_name AS "originalFileName",s.document_number AS "documentNumber",s.document_date::text AS "documentDate",s.total_cents AS "totalCents",s.invoice_fiscal_identity AS "invoiceFiscalIdentity",s.party_role AS "partyRole",s.document_class AS "documentClass",s.referenced_original_reference AS "referencedOriginalReference",s.currency_code AS "currencyCode",s.upstream_version_ref AS "upstreamVersionRef",s.captured_at AS "capturedAt"
  FROM document_version_lifecycle l
  LEFT JOIN document_version_snapshots s ON s.lifecycle_id=l.id AND s.version_number=l.current_version
  WHERE l.source=`

/** Locks and reads only the current private version. Callers must not log its result. */
export async function readDocumentLifecycleSnapshotTx(tx: DocumentLifecyclePrismaTx, identity: DocumentLifecycleIdentity, lock = false): Promise<Readonly<{ lifecycleId: string; tombstoned: boolean; current: StoredDocumentVersion | null }> | null> {
  if (hasUrlOrToken(identity.sourceItemKey)) fail('DOCUMENT_LIFECYCLE_SOURCE_URL_FORBIDDEN')
  const suffix = lock ? Prisma.sql` FOR UPDATE OF l` : Prisma.empty
  const rows=await tx.$queryRaw<LifecycleRow[]>(Prisma.sql`${CURRENT_SNAPSHOT_SQL}${identity.source}${Prisma.sql` AND l.source_item_key=`}${identity.sourceItemKey}${Prisma.sql` LIMIT 2`}${suffix}`)
  if (!rows.length) return null
  if (rows.length !== 1) fail('DOCUMENT_LIFECYCLE_ROW_AMBIGUOUS')
  const row=rows[0]
  return { lifecycleId: uuid(row.lifecycleId,'DOCUMENT_LIFECYCLE_ID_INVALID'), tombstoned: row.state === 'TOMBSTONED', current: toStored(identity,row) }
}

async function requireWrite<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, actor: LifecycleActor, assertAccess: EffectiveFinanceWriteAccess<Tx>): Promise<number> {
  const id=actorId(actor.actorId)
  if (!await assertAccess(tx,id)) fail('DOCUMENT_LIFECYCLE_ACCESS_DENIED')
  return id
}
async function lockOrCreate(tx: DocumentLifecyclePrismaTx, identity: DocumentLifecycleIdentity): Promise<Readonly<{ lifecycleId: string; tombstoned: boolean; current: StoredDocumentVersion | null }>> {
  let found=await readDocumentLifecycleSnapshotTx(tx,identity,true)
  if (found) return found
  await tx.$queryRaw(Prisma.sql`
    INSERT INTO document_version_lifecycle (id,source,source_item_key,state,current_version,updated_at)
    VALUES (gen_random_uuid(),${identity.source},${identity.sourceItemKey},'ACTIVE'::"DocumentVersionLifecycleState",0,CURRENT_TIMESTAMP)
    ON CONFLICT (source,source_item_key) DO NOTHING
  `)
  found=await readDocumentLifecycleSnapshotTx(tx,identity,true)
  if (!found) fail('DOCUMENT_LIFECYCLE_CREATE_FAILED')
  return found
}

/** Authorized P2 bridge: obtains the real lifecycle before archiving its first version. */
export async function lockDocumentLifecycleForIncomingTx<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, input: Readonly<{
  identity: DocumentLifecycleIdentity
  actor: LifecycleActor
  assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx>
}>): Promise<Readonly<{ lifecycleId: string; tombstoned: boolean; current: StoredDocumentVersion | null }>> {
  await requireWrite(tx,input.actor,input.assertEffectiveFinanceWriteAccess)
  const locked=await lockOrCreate(tx,input.identity)
  if(locked.tombstoned)fail('DOCUMENT_LIFECYCLE_TOMBSTONED_REQUIRES_HUMAN_REVIEW')
  return locked
}

export type PrivateSnapshotArchive = Readonly<{
  artifact: PreparedPrivateArtifact | null
  privateStorageHandle: string | null
  upstreamVersionRef: string | null
}>
function archiveFor(plan: DocumentLifecyclePlan, archive: PrivateSnapshotArchive): Readonly<{ state: ArtifactState; handle: string | null; format: ArchivedOriginalFormat | null; bytes: number | null; contentHash: string | null; checksum: string }> {
  if (archive.upstreamVersionRef && hasUrlOrToken(archive.upstreamVersionRef)) fail('DOCUMENT_LIFECYCLE_UPSTREAM_URL_FORBIDDEN')
  if (archive.artifact) {
    const handle=safeHandle(archive.privateStorageHandle)
    if (!handle || archive.artifact.byteLength > 20*1024*1024 || !HASH.test(archive.artifact.contentSha256) || !HASH.test(archive.artifact.metadataChecksum)) fail('DOCUMENT_LIFECYCLE_ARCHIVE_INVALID')
    if (createHash('sha256').update(archive.artifact.bytes).digest('hex') !== archive.artifact.contentSha256) fail('DOCUMENT_LIFECYCLE_ARCHIVE_CONTENT_HASH_MISMATCH')
    const observed=plan.assessment.kind === 'CREATE_BASELINE' || plan.assessment.kind === 'NEW_VERSION'
    if (!observed) fail('DOCUMENT_LIFECYCLE_ARCHIVE_UNEXPECTED')
    return { state:'CAPTURED', handle, format:archive.artifact.format, bytes:archive.artifact.byteLength, contentHash:archive.artifact.contentSha256, checksum:archive.artifact.metadataChecksum }
  }
  if (archive.privateStorageHandle !== null) fail('DOCUMENT_LIFECYCLE_ARCHIVE_HANDLE_WITHOUT_BYTES')
  return { state:'UNAVAILABLE', handle:null, format:null, bytes:null, contentHash:null, checksum:sha256({ schema:DOCUMENT_LIFECYCLE_DB_SCHEMA, unavailable:true, version:plan.nextVersionNumber }) }
}

/**
 * Concrete plan application. The parent must archive incoming bytes before this
 * call, pass its immutable handle, and keep the same P2 lease transaction.
 */
export async function applyDocumentLifecyclePlanTx<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, input: Readonly<{
  observation: DocumentObservation
  reconciliation: ReconciliationProtection
  archive: PrivateSnapshotArchive
  actor: LifecycleActor
  /** The parent-owned private archive reports PRESERVED or NOT_AVAILABLE truthfully. */
  preservePreviousBytesBeforeReplacement?: (tx: Tx, current: StoredDocumentVersion, actor: LifecycleActor) => Promise<PrivateBytePreservation>
  assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx>
}>): Promise<Readonly<{ plan: DocumentLifecyclePlan; lifecycleId: string; outcome: 'CREATED'|'REPLAY'|'NO_MUTATION'|'REQUIRES_REVIEW'; previousBytes: PrivateBytePreservation|'NOT_REQUESTED' }>> {
  const actor=await requireWrite(tx,input.actor,input.assertEffectiveFinanceWriteAccess)
  if (hasUrlOrToken(input.observation.identity.sourceItemKey)) fail('DOCUMENT_LIFECYCLE_SOURCE_URL_FORBIDDEN')
  const locked=await lockOrCreate(tx,input.observation.identity)
  if (locked.tombstoned) fail('DOCUMENT_LIFECYCLE_TOMBSTONED_REQUIRES_HUMAN_REVIEW')
  const plan=planDocumentLifecycle(locked.current,input.observation,input.reconciliation)
  if (plan.action === 'NO_MUTATION') return { plan,lifecycleId:locked.lifecycleId,outcome:'NO_MUTATION',previousBytes:'NOT_REQUESTED' }
  if (plan.action === 'REQUIRES_REVIEW') return { plan,lifecycleId:locked.lifecycleId,outcome:'REQUIRES_REVIEW',previousBytes:'NOT_REQUESTED' }
  const archive=archiveFor(plan,input.archive)
  // A predecessor never becomes an invented archive; absent callback/bytes means NOT_AVAILABLE.
  const previousBytes: PrivateBytePreservation|'NOT_REQUESTED' = plan.preservation.requiredBeforeReplacement && locked.current
    ? (input.preservePreviousBytesBeforeReplacement
      ? await input.preservePreviousBytesBeforeReplacement(tx, locked.current, input.actor)
      : 'NOT_AVAILABLE')
    : 'NOT_REQUESTED'
  const metadata=input.observation.privateMetadata ?? null
  // Covers both the immutable byte evidence and every persisted private metadata
  // field; contentSha256 itself remains separately queryable for duplicates.
  const snapshotMetadataChecksum=sha256({
    schema: DOCUMENT_LIFECYCLE_DB_SCHEMA,
    lifecycleId: locked.lifecycleId,
    versionNumber: plan.nextVersionNumber,
    archive: { state: archive.state, format: archive.format, byteLength: archive.bytes, contentSha256: archive.contentHash, artifactChecksum: archive.checksum },
    fingerprint: input.observation.fingerprint,
    privateMetadata: metadata,
    upstreamVersionRef: input.archive.upstreamVersionRef ?? metadata?.upstreamVersionRef ?? null,
  })
  const inserted=await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO document_version_snapshots
      (id,lifecycle_id,version_number,content_sha256,byte_length,original_format,artifact_state,private_storage_handle,metadata_checksum,quick_xor_hash,c_tag,e_tag,graph_version,original_file_name,document_number,document_date,total_cents,invoice_fiscal_identity,party_role,document_class,referenced_original_reference,currency_code,upstream_version_ref,number_fingerprint,amount_fingerprint,idempotency_key,captured_at)
    VALUES
      (gen_random_uuid(),CAST(${locked.lifecycleId} AS uuid),${plan.nextVersionNumber!},${archive.contentHash ?? input.observation.fingerprint.contentSha256 ?? null},${archive.bytes ?? input.observation.fingerprint.byteLength ?? null},${archive.format ? Prisma.sql`${archive.format}::"DocumentVersionOriginalFormat"` : Prisma.sql`NULL`},${archive.state}::"DocumentVersionArtifactState",${archive.handle ? Prisma.sql`CAST(${archive.handle} AS uuid)` : Prisma.sql`NULL`},${snapshotMetadataChecksum},${input.observation.fingerprint.quickXorHash ?? null},${input.observation.fingerprint.cTag ?? null},${input.observation.fingerprint.eTag ?? null},${input.observation.fingerprint.graphVersion ?? null},${metadata?.originalFileName ?? null},${metadata?.documentNumber ?? null},${metadata?.documentDate ? Prisma.sql`CAST(${metadata.documentDate} AS date)` : Prisma.sql`NULL`},${metadata?.totalCents ?? null},${metadata?.invoiceFiscalIdentity ?? null},${metadata?.partyRole ?? null},${metadata?.documentClass ?? null},${metadata?.referencedOriginalReference ?? null},${metadata?.currencyCode ?? null},${input.archive.upstreamVersionRef ?? metadata?.upstreamVersionRef ?? null},${input.observation.fingerprint.numberFingerprint ?? null},${input.observation.fingerprint.amountFingerprint ?? null},${plan.idempotencyKey!},CURRENT_TIMESTAMP)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id::text AS id
  `)
  if (!inserted.length) return { plan,lifecycleId:locked.lifecycleId,outcome:'REPLAY',previousBytes:'NOT_REQUESTED' }
  await tx.$queryRaw(Prisma.sql`UPDATE document_version_lifecycle SET current_version=${plan.nextVersionNumber!},updated_at=CURRENT_TIMESTAMP WHERE id=CAST(${locked.lifecycleId} AS uuid) AND current_version=${locked.current?.versionNumber ?? 0}`)
  if (plan.incident && locked.current) {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO document_version_incidents (id,lifecycle_id,previous_version,new_version,code,color,reasons,state,reported_by_id,created_at)
      VALUES (gen_random_uuid(),CAST(${locked.lifecycleId} AS uuid),${locked.current.versionNumber},${plan.nextVersionNumber!},${plan.incident.code},'AMBAR',CAST(${JSON.stringify(plan.incident.reasons)} AS jsonb),'OPEN'::"DocumentVersionIncidentState",${actor},CURRENT_TIMESTAMP)
      ON CONFLICT (lifecycle_id,previous_version,new_version,code) DO NOTHING
    `)
  }
  return { plan,lifecycleId:locked.lifecycleId,outcome:'CREATED',previousBytes }
}

/** Positive tombstones only. It preserves snapshots and B4 by construction. */
export async function recordPositiveTombstoneTx<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, input: Readonly<{ observation: TombstoneObservation; actor: LifecycleActor; assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx> }>): Promise<'CREATED'|'NO_MUTATION'|'REPLAY'> {
  const actor=await requireWrite(tx,input.actor,input.assertEffectiveFinanceWriteAccess)
  const plan=planPositiveTombstone(input.observation)
  if (plan.action === 'NO_MUTATION') return 'NO_MUTATION'
  const lifecycle=await readDocumentLifecycleSnapshotTx(tx,input.observation.identity,true)
  if (!lifecycle) return 'NO_MUTATION'
  const evidence=input.observation.evidence as PositiveTombstoneEvidence
  const inserted=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
    INSERT INTO document_version_tombstones (id,lifecycle_id,evidence_kind,evidence_hash,idempotency_key,reported_by_id,created_at)
    VALUES (gen_random_uuid(),CAST(${lifecycle.lifecycleId} AS uuid),${evidence.kind},${evidence.evidenceHash},${plan.idempotencyKey!},${actor},CURRENT_TIMESTAMP)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id::text AS id
  `)
  if (!inserted.length) return 'REPLAY'
  await tx.$queryRaw(Prisma.sql`UPDATE document_version_lifecycle SET state='TOMBSTONED'::"DocumentVersionLifecycleState",updated_at=CURRENT_TIMESTAMP WHERE id=CAST(${lifecycle.lifecycleId} AS uuid) AND state='ACTIVE'::"DocumentVersionLifecycleState"`)
  return 'CREATED'
}

export async function recordHashDuplicateTx<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, input: Readonly<{ proposal: HashDuplicateProposal; leftSnapshotId: string; rightSnapshotId: string; actor: LifecycleActor; assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx> }>): Promise<'CREATED'|'NO_MUTATION'|'REPLAY'> {
  const actor=await requireWrite(tx,input.actor,input.assertEffectiveFinanceWriteAccess)
  const plan=planHashDuplicate(input.proposal)
  if (plan.action === 'NO_MUTATION') return 'NO_MUTATION'
  const [left,right]=[uuid(input.leftSnapshotId,'DOCUMENT_LIFECYCLE_SNAPSHOT_ID_INVALID'),uuid(input.rightSnapshotId,'DOCUMENT_LIFECYCLE_SNAPSHOT_ID_INVALID')].sort()
  const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
    INSERT INTO document_version_hash_duplicates (id,left_snapshot_id,right_snapshot_id,content_sha256,idempotency_key,reported_by_id,created_at)
    VALUES (gen_random_uuid(),CAST(${left} AS uuid),CAST(${right} AS uuid),${hash(input.proposal.contentSha256,'DOCUMENT_LIFECYCLE_CONTENT_HASH_INVALID')},${plan.idempotencyKey!},${actor},CURRENT_TIMESTAMP)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id::text AS id
  `)
  return rows.length ? 'CREATED' : 'REPLAY'
}

export async function createCreditLinkProposalTx<Tx extends DocumentLifecyclePrismaTx>(tx: Tx, input: Readonly<{ proposal: CreditLinkProposal; creditLifecycleId: string; originalLifecycleId: string; actor: LifecycleActor; assertEffectiveFinanceWriteAccess: EffectiveFinanceWriteAccess<Tx> }>): Promise<'CREATED'|'NO_MUTATION'|'REPLAY'> {
  const actor=await requireWrite(tx,input.actor,input.assertEffectiveFinanceWriteAccess)
  const plan=planCreditLink(input.proposal)
  if (plan.action !== 'PROPOSE_CREDIT_LINK') return 'NO_MUTATION'
  const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
    INSERT INTO document_version_credit_links (id,credit_lifecycle_id,original_lifecycle_id,exact_reference,exact_reference_hash,state,idempotency_key,proposed_by_id,created_at)
    VALUES (gen_random_uuid(),CAST(${uuid(input.creditLifecycleId,'DOCUMENT_LIFECYCLE_ID_INVALID')} AS uuid),CAST(${uuid(input.originalLifecycleId,'DOCUMENT_LIFECYCLE_ID_INVALID')} AS uuid),${input.proposal.exactReference},${hash(input.proposal.exactReferenceHash,'DOCUMENT_LIFECYCLE_REFERENCE_HASH_INVALID')},'PROPOSED'::"DocumentVersionCreditLinkState",${plan.idempotencyKey!},${actor},CURRENT_TIMESTAMP)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id::text AS id
  `)
  return rows.length ? 'CREATED' : 'REPLAY'
}

/** The parent injects its existing audited B4 protection projection; this store never reads/mutates B4. */
export type DocumentLifecycleHook = typeof applyDocumentLifecyclePlanTx
export type DocumentLifecycleReadHook = typeof readDocumentLifecycleSnapshotTx
