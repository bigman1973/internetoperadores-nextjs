/*
 * B3b — lifecycle de borrado documental.
 *
 * Núcleo puro, sin Prisma, Graph, red ni B4. Se conecta al contrato 3a mediante
 * claves opacas source/sourceItemKey y snapshots inmutables. Nunca interpreta un
 * error de proveedor, una ausencia parcial o una cancelación como un borrado.
 */
import { createHash } from 'node:crypto'

export const DOCUMENT_DELETION_SAFE_CODES = [
  'EVIDENCIA_BORRADO_POSITIVA',
  'INVENTARIO_INCOMPLETO',
  'DELTA_TOMBSTONE_INVALIDO',
  'OBSERVACION_DE_PROVEEDOR_NO_ES_BORRADO',
  'ITEM_MOVIDO',
  'JOB_CANCELADO',
  'YA_TOMBSTONED',
  'RECUPERACION_REQUIERE_REVISION_HUMANA',
  'FUENTE_INCONSISTENTE',
] as const
export type DocumentDeletionSafeCode = typeof DOCUMENT_DELETION_SAFE_CODES[number]

export type DocumentLifecycleKey = Readonly<{
  /** Contract 3a: stable upstream source name; not a locator, URL or credential. */
  source: string
  /** Contract 3a: opaque stable upstream item key. */
  sourceItemKey: string
}>

export type DocumentLifecycleSnapshot = Readonly<DocumentLifecycleKey & {
  lifecycleState: 'ACTIVO' | 'TOMBSTONE'
  /** Immutable 3a snapshot version; retained even when a tombstone is created. */
  currentSnapshotVersion: number
  /** A current, human-applied B4 reconciliation references this document. */
  b4Reconciled: boolean
  /** Prior positive tombstone is durable and makes a repeat idempotent. */
  tombstoneRecorded: boolean
}>

export type ProviderDeletionObservation =
  | Readonly<{
    kind: 'DELTA_TOMBSTONE'
    source: string
    sourceItemKey: string
    /** Delta token/page was fully validated by the provider adapter. */
    deltaPageComplete: true
    tombstoneId: string
  }>
  | Readonly<{
    kind: 'COMPLETE_INVENTORY_ABSENCE'
    source: string
    sourceItemKey: string
    /** listFolderContents completed all pages/descendants in the declared scope. */
    inventoryComplete: true
    scopeKey: string
  }>
  | Readonly<{
    kind: 'ITEM_PRESENT'
    source: string
    sourceItemKey: string
    /** Same item key exists under another folder: a move is never a deletion. */
    moved: boolean
  }>
  | Readonly<{
    kind: 'PROVIDER_FAILURE'
    source: string
    sourceItemKey: string
    code: 'HTTP_403' | 'HTTP_404' | 'TIMEOUT' | 'NETWORK' | 'INVENTORY_INCOMPLETE' | 'OTHER'
  }>
  | Readonly<{
    kind: 'JOB_CANCELLED'
    source: string
    sourceItemKey: string
  }>

export type DocumentDeletionTombstone = Readonly<{
  key: DocumentLifecycleKey
  evidence: 'DELTA_TOMBSTONE' | 'COMPLETE_INVENTORY_ABSENCE'
  /** Stable opaque idempotency key; no filename, locator, amount or provider detail. */
  idempotencyKey: string
  previousSnapshotVersion: number
}>

export type DocumentDeletionIncident = Readonly<{
  code: 'AMBAR_DOCUMENTO_BORRADO'
  /** This is intentionally fixed to avoid provider/path data in the audit/UI text. */
  message: 'Se ha borrado el documento que justificaba una conciliación; revísalo antes de cualquier recuperación.'
  requiresHumanReview: true
  preserveB4: true
  preservedSnapshotVersion: number
}>

export type DocumentDeletionPlan =
  | Readonly<{
    kind: 'TOMBSTONE'
    key: DocumentLifecycleKey
    tombstone: DocumentDeletionTombstone
    incident: DocumentDeletionIncident | null
    /** The integrator must not touch the finance ledger or B4 links. */
    b4Action: 'PRESERVE'
    financialLedgerAction: 'NONE'
    requiresHumanConfirmation: false
    safeCodes: readonly ['EVIDENCIA_BORRADO_POSITIVA']
  }>
  | Readonly<{
    kind: 'NOOP_ALREADY_TOMBSTONED'
    key: DocumentLifecycleKey
    b4Action: 'PRESERVE'
    financialLedgerAction: 'NONE'
    requiresHumanConfirmation: false
    safeCodes: readonly ['YA_TOMBSTONED']
  }>
  | Readonly<{
    kind: 'NO_TOMBSTONE'
    key: DocumentLifecycleKey
    b4Action: 'PRESERVE'
    financialLedgerAction: 'NONE'
    requiresHumanConfirmation: false
    safeCodes: readonly DocumentDeletionSafeCode[]
  }>
  | Readonly<{
    /** An item reappearing after a tombstone never reactivates B4 automatically. */
    kind: 'RECOVERY_REVIEW'
    key: DocumentLifecycleKey
    incident: Readonly<{
      code: 'AMBAR_DOCUMENTO_RECUPERADO'
      message: 'El archivo reapareció tras un borrado; requiere revisión humana antes de volver a usarse.'
      requiresHumanReview: true
      preserveB4: true
      preservedSnapshotVersion: number
    }>
    b4Action: 'PRESERVE'
    financialLedgerAction: 'NONE'
    requiresHumanConfirmation: true
    safeCodes: readonly ['RECUPERACION_REQUIERE_REVISION_HUMANA']
  }>

/**
 * Read-model boundary for folder/import/projection code. A tombstone is shown
 * as `BORRADO` and is excluded from every automatic candidate list; it is not
 * a DELETE and cannot make the prior immutable version disappear.
 */
export type DocumentDeletionFolderProjection = Readonly<{
  estadoCarpeta: 'ACTIVO' | 'BORRADO'
  elegibleComoCandidato: boolean
  requiereRevisionHumana: boolean
}>

export function projectDocumentDeletionFolderState(snapshot: Pick<DocumentLifecycleSnapshot, 'lifecycleState' | 'b4Reconciled'>): DocumentDeletionFolderProjection {
  if (snapshot.lifecycleState === 'TOMBSTONE') {
    return { estadoCarpeta: 'BORRADO', elegibleComoCandidato: false, requiereRevisionHumana: snapshot.b4Reconciled }
  }
  return { estadoCarpeta: 'ACTIVO', elegibleComoCandidato: true, requiereRevisionHumana: false }
}

const OPAQUE = /^[A-Za-z0-9:_-]{1,240}$/
const VERSION = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647

function validKey(value: DocumentLifecycleKey): boolean {
  return OPAQUE.test(value.source) && OPAQUE.test(value.sourceItemKey)
}

function sameKey(left: DocumentLifecycleKey, right: DocumentLifecycleKey): boolean {
  return left.source === right.source && left.sourceItemKey === right.sourceItemKey
}

function observationKey(observation: ProviderDeletionObservation): DocumentLifecycleKey {
  return { source: observation.source, sourceItemKey: observation.sourceItemKey }
}

function safeKey(snapshot: DocumentLifecycleSnapshot): DocumentLifecycleKey {
  return { source: snapshot.source, sourceItemKey: snapshot.sourceItemKey }
}

function tombstoneKey(snapshot: DocumentLifecycleSnapshot, observation: ProviderDeletionObservation): string {
  const evidence = observation.kind === 'DELTA_TOMBSTONE'
    ? `delta:${observation.tombstoneId}`
    : observation.kind === 'COMPLETE_INVENTORY_ABSENCE'
      ? `inventory:${observation.scopeKey}`
      : 'not-positive'
  return createHash('sha256').update(`${snapshot.source}\n${snapshot.sourceItemKey}\n${snapshot.currentSnapshotVersion}\n${evidence}`, 'utf8').digest('hex')
}

function noTombstone(key: DocumentLifecycleKey, codes: readonly DocumentDeletionSafeCode[]): DocumentDeletionPlan {
  return { kind: 'NO_TOMBSTONE', key, b4Action: 'PRESERVE', financialLedgerAction: 'NONE', requiresHumanConfirmation: false, safeCodes: codes }
}

/**
 * Classifies an upstream deletion signal. `HTTP_404` deliberately remains a
 * provider failure: it can mean scoped listing, permission or a transient route.
 */
export function planDocumentDeletion(
  snapshot: DocumentLifecycleSnapshot,
  observation: ProviderDeletionObservation,
): DocumentDeletionPlan {
  const key = safeKey(snapshot)
  if (!validKey(key) || !VERSION(snapshot.currentSnapshotVersion) || !sameKey(key, observationKey(observation))) {
    return noTombstone(key, ['FUENTE_INCONSISTENTE'])
  }

  if (observation.kind === 'ITEM_PRESENT') {
    if (snapshot.lifecycleState === 'TOMBSTONE' || snapshot.tombstoneRecorded) {
      return {
        kind: 'RECOVERY_REVIEW', key,
        incident: {
          code: 'AMBAR_DOCUMENTO_RECUPERADO',
          message: 'El archivo reapareció tras un borrado; requiere revisión humana antes de volver a usarse.',
          requiresHumanReview: true, preserveB4: true, preservedSnapshotVersion: snapshot.currentSnapshotVersion,
        },
        b4Action: 'PRESERVE', financialLedgerAction: 'NONE', requiresHumanConfirmation: true,
        safeCodes: ['RECUPERACION_REQUIERE_REVISION_HUMANA'],
      }
    }
    return noTombstone(key, [observation.moved ? 'ITEM_MOVIDO' : 'OBSERVACION_DE_PROVEEDOR_NO_ES_BORRADO'])
  }

  if (observation.kind === 'JOB_CANCELLED') return noTombstone(key, ['JOB_CANCELADO'])
  if (observation.kind === 'PROVIDER_FAILURE') {
    return noTombstone(key, [observation.code === 'INVENTORY_INCOMPLETE' ? 'INVENTARIO_INCOMPLETO' : 'OBSERVACION_DE_PROVEEDOR_NO_ES_BORRADO'])
  }
  if (observation.kind === 'DELTA_TOMBSTONE' && (!observation.deltaPageComplete || !OPAQUE.test(observation.tombstoneId))) {
    return noTombstone(key, ['DELTA_TOMBSTONE_INVALIDO'])
  }
  if (observation.kind === 'COMPLETE_INVENTORY_ABSENCE' && (!observation.inventoryComplete || !OPAQUE.test(observation.scopeKey))) {
    return noTombstone(key, ['INVENTARIO_INCOMPLETO'])
  }

  // An immutable lifecycle already tombstoned is replayed as a no-op: no second
  // incident and no second audit action are generated by this core.
  if (snapshot.lifecycleState === 'TOMBSTONE' || snapshot.tombstoneRecorded) {
    return { kind: 'NOOP_ALREADY_TOMBSTONED', key, b4Action: 'PRESERVE', financialLedgerAction: 'NONE', requiresHumanConfirmation: false, safeCodes: ['YA_TOMBSTONED'] }
  }

  const evidence = observation.kind
  const tombstone: DocumentDeletionTombstone = {
    key,
    evidence,
    idempotencyKey: tombstoneKey(snapshot, observation),
    previousSnapshotVersion: snapshot.currentSnapshotVersion,
  }
  const incident: DocumentDeletionIncident | null = snapshot.b4Reconciled
    ? {
      code: 'AMBAR_DOCUMENTO_BORRADO',
      message: 'Se ha borrado el documento que justificaba una conciliación; revísalo antes de cualquier recuperación.',
      requiresHumanReview: true, preserveB4: true, preservedSnapshotVersion: snapshot.currentSnapshotVersion,
    }
    : null
  return { kind: 'TOMBSTONE', key, tombstone, incident, b4Action: 'PRESERVE', financialLedgerAction: 'NONE', requiresHumanConfirmation: false, safeCodes: ['EVIDENCIA_BORRADO_POSITIVA'] }
}
