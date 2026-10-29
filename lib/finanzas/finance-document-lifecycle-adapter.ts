/*
 * Puertos de integración para versiones documentales privadas.
 * No importa Prisma ni Graph y no tiene ninguna operación B4/bancaria.
 */
import { createHash } from 'node:crypto'
import type {
  CreditLinkPlan,
  DocumentChangeIncident,
  DocumentLifecycleIdentity,
  DocumentLifecyclePlan,
  DocumentObservation,
  HashDuplicatePlan,
  PositiveTombstoneEvidence,
  StoredDocumentVersion,
  TombstonePlan,
} from './finance-document-lifecycle-core'

export type PrivateBytePreservation = 'PRESERVED' | 'NOT_AVAILABLE'
export const MAX_DOCUMENT_VERSION_BYTES = 20 * 1024 * 1024
export type ArchivedOriginalFormat = 'PDF' | 'XLS' | 'XLSX'
export type PreparedPrivateArtifact = Readonly<{
  format: ArchivedOriginalFormat
  bytes: Uint8Array
  byteLength: number
  contentSha256: string
  metadataChecksum: string
}>

/** Validates bytes already fetched by the parent importer; never invokes Graph. */
export function preparePrivateArtifact(bytes: Uint8Array, originalFileName: string | null): PreparedPrivateArtifact {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_DOCUMENT_VERSION_BYTES) throw new Error('DOCUMENT_LIFECYCLE_ARCHIVE_SIZE_INVALID')
  const name = originalFileName?.trim().toLowerCase() ?? ''
  const starts = (...signature: number[]) => signature.every((value, index) => bytes[index] === value)
  const format: ArchivedOriginalFormat | null = starts(0x25, 0x50, 0x44, 0x46, 0x2d) && name.endsWith('.pdf') ? 'PDF'
    : starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1) && name.endsWith('.xls') ? 'XLS'
      : starts(0x50, 0x4b, 0x03, 0x04) && name.endsWith('.xlsx') ? 'XLSX' : null
  if (!format) throw new Error('DOCUMENT_LIFECYCLE_ARCHIVE_FORMAT_OR_SIGNATURE_INVALID')
  const contentSha256 = createHash('sha256').update(bytes).digest('hex')
  const metadataChecksum = createHash('sha256').update(JSON.stringify({ schema: 'DOCUMENT_LIFECYCLE_ARCHIVE_V1', format, byteLength: bytes.byteLength, contentSha256 })).digest('hex')
  return { format, bytes, byteLength: bytes.byteLength, contentSha256, metadataChecksum }
}

export type LifecycleActor = Readonly<{ actorId: number | null }>
export type PersistedLifecycle = Readonly<{ lifecycleId: string; current: StoredDocumentVersion | null; tombstoned: boolean }>
export type LifecycleIncidentRecord = Readonly<{
  identity: DocumentLifecycleIdentity
  previousVersionNumber: number
  newVersionNumber: number
  incident: DocumentChangeIncident
}>

/** Implementation must lock/re-read the lifecycle in the caller-owned transaction. */
export interface DocumentLifecycleStorePort<Tx = unknown> {
  lockLifecycle(tx: Tx, identity: DocumentLifecycleIdentity): Promise<PersistedLifecycle | null>
  createLifecycleIfAbsent(tx: Tx, identity: DocumentLifecycleIdentity): Promise<PersistedLifecycle>
  /** Records NOT_AVAILABLE when the predecessor archive cannot be recovered; never invents it. */
  preservePreviousBytesBeforeReplacement(tx: Tx, current: StoredDocumentVersion, actor: LifecycleActor): Promise<PrivateBytePreservation>
  createImmutableSnapshot(tx: Tx, input: Readonly<{
    lifecycleId: string
    versionNumber: number
    observation: DocumentObservation
    /** Opaque DB/archive handle; a Graph URL/token is forbidden. */
    privateLocatorHandle: string | null
    idempotencyKey: string
  }>): Promise<'CREATED' | 'REPLAY'>
  createAmberIncident(tx: Tx, incident: LifecycleIncidentRecord, actor: LifecycleActor): Promise<'CREATED' | 'REPLAY'>
}

/** Immutable archive is addressed only by lifecycle/version/hash, never a browser/download URL. */
export interface PrivateDocumentArchivePort<Tx = unknown> {
  archiveIncomingImmutable(tx: Tx, input: Readonly<{
    lifecycleId: string
    versionNumber: number
    artifact: PreparedPrivateArtifact
    /** Stable provider revision, not a signed/expiring download link. */
    upstreamVersionRef: string | null
  }>): Promise<Readonly<{ privateStorageHandle: string }>>
  readImmutableVersion(tx: Tx, input: Readonly<{
    lifecycleId: string
    versionNumber: number
    contentSha256: string
  }>): Promise<Readonly<{ bytes: Uint8Array; capturedAt: Date }> | null>
}

/** Private history UI/API contract: real metadata is private DB data, not a fake projection. */
export interface DocumentVersionHistoryReader<Tx = unknown> {
  readVersionHistory(tx: Tx, input: Readonly<{ lifecycleId: string; limit: number; offset: number }>): Promise<readonly Readonly<{
    versionNumber: number
    originalFileName: string | null
    documentNumber: string | null
    documentDate: string | null
    totalCents: number | null
    capturedAt: Date
    artifactAvailable: boolean
    upstreamVersionRef: string | null
  }>[]>
}

export interface TombstoneStorePort<Tx = unknown> {
  recordPositiveTombstone(tx: Tx, input: Readonly<{ identity: DocumentLifecycleIdentity; evidence: PositiveTombstoneEvidence; idempotencyKey: string }>, actor: LifecycleActor): Promise<'CREATED' | 'REPLAY'>
}
export interface CreditLinkStorePort<Tx = unknown> {
  createCreditLinkProposal(tx: Tx, input: Readonly<{ idempotencyKey: string; credit: DocumentLifecycleIdentity; original: DocumentLifecycleIdentity; exactReferenceHash: string }>, actor: LifecycleActor): Promise<'CREATED' | 'REPLAY'>
}
export interface HashDuplicateStorePort<Tx = unknown> {
  recordHashDuplicate(tx: Tx, input: Readonly<{ idempotencyKey: string; leftSnapshotHash: string; rightSnapshotHash: string; contentSha256: string }>, actor: LifecycleActor): Promise<'CREATED' | 'REPLAY'>
}

export type ApplyDocumentLifecycleInput = Readonly<{
  plan: DocumentLifecyclePlan
  observation: DocumentObservation
  incomingPrivateLocatorHandle: string | null
  actor: LifecycleActor
}>
export type ApplyDocumentLifecycleResult = Readonly<{
  outcome: 'BASELINE_CREATED' | 'VERSION_CREATED' | 'REPLAY' | 'NO_MUTATION' | 'REQUIRES_REVIEW'
  previousBytes: PrivateBytePreservation | 'NOT_REQUESTED'
  incidentCreated: boolean
  financialAction: 'NONE'
  b4Mutation: 'FORBIDDEN'
}>
function urlOrToken(value: string): boolean { return /https?:\/\//i.test(value) || /(?:sig|token|access_token)=/i.test(value) }

/** Applies lifecycle storage only. B4 preservation is an invariant, not an option. */
export async function applyDocumentLifecyclePlan<Tx>(tx: Tx, store: DocumentLifecycleStorePort<Tx>, input: ApplyDocumentLifecycleInput): Promise<ApplyDocumentLifecycleResult> {
  const { plan, observation, actor } = input
  if (plan.financialAction !== 'NONE' || plan.b4Mutation !== 'FORBIDDEN') throw new Error('DOCUMENT_LIFECYCLE_FINANCIAL_MUTATION_FORBIDDEN')
  if (input.incomingPrivateLocatorHandle && urlOrToken(input.incomingPrivateLocatorHandle)) throw new Error('DOCUMENT_LIFECYCLE_PERSISTENT_URL_FORBIDDEN')
  if (plan.action === 'NO_MUTATION') return { outcome: 'NO_MUTATION', previousBytes: 'NOT_REQUESTED', incidentCreated: false, financialAction: 'NONE', b4Mutation: 'FORBIDDEN' }
  if (plan.action === 'REQUIRES_REVIEW') return { outcome: 'REQUIRES_REVIEW', previousBytes: 'NOT_REQUESTED', incidentCreated: false, financialAction: 'NONE', b4Mutation: 'FORBIDDEN' }
  const locked = await store.lockLifecycle(tx, observation.identity)
  const lifecycle = locked ?? await store.createLifecycleIfAbsent(tx, observation.identity)
  if (lifecycle.tombstoned) throw new Error('DOCUMENT_LIFECYCLE_TOMBSTONED_REQUIRES_HUMAN_REVIEW')
  const expectedPreviousVersion = plan.action === 'CREATE_BASELINE' ? null : plan.nextVersionNumber! - 1
  if ((lifecycle.current?.versionNumber ?? null) !== expectedPreviousVersion) throw new Error('DOCUMENT_LIFECYCLE_STALE_PLAN')
  const previousBytes = plan.preservation.requiredBeforeReplacement && lifecycle.current
    ? await store.preservePreviousBytesBeforeReplacement(tx, lifecycle.current, actor) : 'NOT_REQUESTED'
  const result = await store.createImmutableSnapshot(tx, { lifecycleId: lifecycle.lifecycleId, versionNumber: plan.nextVersionNumber!, observation, privateLocatorHandle: input.incomingPrivateLocatorHandle, idempotencyKey: plan.idempotencyKey! })
  let incidentCreated = false
  if (plan.incident && lifecycle.current) {
    incidentCreated = (await store.createAmberIncident(tx, { identity: observation.identity, previousVersionNumber: lifecycle.current.versionNumber, newVersionNumber: plan.nextVersionNumber!, incident: plan.incident }, actor)) === 'CREATED'
  }
  return { outcome: result === 'REPLAY' ? 'REPLAY' : plan.action === 'CREATE_BASELINE' ? 'BASELINE_CREATED' : 'VERSION_CREATED', previousBytes, incidentCreated, financialAction: 'NONE', b4Mutation: 'FORBIDDEN' }
}
export function hasNoAutomaticB4Acceptance(plan: Pick<DocumentLifecyclePlan | TombstonePlan | CreditLinkPlan | HashDuplicatePlan, 'financialAction' | 'b4Mutation'>): boolean {
  return plan.financialAction === 'NONE' && plan.b4Mutation === 'FORBIDDEN'
}
