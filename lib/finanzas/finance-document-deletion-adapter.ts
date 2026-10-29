/*
 * B3b — adaptador de persistencia para `finance-document-deletion-core`.
 *
 * El integrador 3a implementa estos puertos contra las tablas aditivas
 * document_version_* dentro de una única transacción. No hay import de Prisma
 * para mantener este contrato comprobable con pruebas puras y para que el padre
 * conecte su migración privada sin circularidades.
 */
import {
  planDocumentDeletion,
  type DocumentDeletionIncident,
  type DocumentDeletionPlan,
  type DocumentDeletionTombstone,
  type DocumentLifecycleKey,
  type DocumentLifecycleSnapshot,
  type ProviderDeletionObservation,
} from './finance-document-deletion-core'

export class DocumentDeletionApplyError extends Error {
  constructor(
    readonly code: 'ACTOR_REQUIRED' | 'ACCESS_DENIED' | 'LIFECYCLE_STALE' | 'HUMAN_REVIEW_REQUIRED' | 'PLAN_NOT_APPLICABLE',
    message: string,
  ) {
    super(message)
    this.name = 'DocumentDeletionApplyError'
  }
}

export type DocumentDeletionAudit = Readonly<{
  action: 'DOCUMENT_TOMBSTONED'
  lifecycleKey: DocumentLifecycleKey
  tombstoneIdempotencyKey: string
  incidentCode: 'AMBAR_DOCUMENTO_BORRADO' | null
}>

/**
 * Every method below must use the transaction passed to it. `require...` is a
 * fresh effective-permission check (not a JWT role snapshot), matching B4.
 */
export interface DocumentDeletionStoragePort<Tx> {
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>
  requireEffectiveFinanceWriteAccess(tx: Tx, actorId: number): Promise<boolean>
  /** Locks the 3a lifecycle row and includes only the safe state needed by B3b. */
  lockLifecycle(tx: Tx, key: DocumentLifecycleKey): Promise<DocumentLifecycleSnapshot | null>
  /**
   * INSERT is unique on the tombstone idempotency key. It must retain the
   * immutable predecessor snapshot and must never delete lifecycle/snapshot rows.
   */
  insertTombstoneIfAbsent(tx: Tx, tombstone: DocumentDeletionTombstone): Promise<'CREATED' | 'EXISTS'>
  /** State transition ACTIVO -> TOMBSTONE guarded by expected snapshot version. */
  markLifecycleTombstoned(tx: Tx, input: Readonly<{
    key: DocumentLifecycleKey
    expectedSnapshotVersion: number
    tombstoneIdempotencyKey: string
  }>): Promise<'MARKED' | 'ALREADY_TOMBSTONED' | 'STALE'>
  /** Immutable incident only; it has no B4, ledger or document-link side effect. */
  insertIncidentIfAbsent(tx: Tx, input: Readonly<{
    key: DocumentLifecycleKey
    tombstoneIdempotencyKey: string
    incident: DocumentDeletionIncident
  }>): Promise<void>
  appendAudit(tx: Tx, audit: DocumentDeletionAudit): Promise<void>
}

export type AppliedDocumentDeletion = Readonly<{
  outcome: 'APPLIED' | 'IDEMPOTENT' | 'NOOP'
  plan: DocumentDeletionPlan
  /** Documents whether the financial boundary was deliberately untouched. */
  financialLedgerAction: 'NONE'
  b4Action: 'PRESERVE'
}>

function validActor(actorId: unknown): actorId is number {
  return typeof actorId === 'number' && Number.isInteger(actorId) && actorId > 0
}

function sameSnapshot(plan: Extract<DocumentDeletionPlan, { kind: 'TOMBSTONE' }>, current: DocumentLifecycleSnapshot): boolean {
  return current.source === plan.key.source
    && current.sourceItemKey === plan.key.sourceItemKey
    && current.currentSnapshotVersion === plan.tombstone.previousSnapshotVersion
    && current.lifecycleState === 'ACTIVO'
    && !current.tombstoneRecorded
    && current.b4Reconciled === (plan.incident !== null)
}

/**
 * Applies only a positive tombstone plan. A current row is locked and checked
 * again, so a re-run is idempotent and a changed/recovered source fails closed.
 * No port for B4 operations is exposed deliberately.
 */
export async function applyDocumentDeletionPlan<Tx>(
  storage: DocumentDeletionStoragePort<Tx>,
  input: Readonly<{ actorId: number; plan: DocumentDeletionPlan }>,
): Promise<AppliedDocumentDeletion> {
  if (!validActor(input.actorId)) throw new DocumentDeletionApplyError('ACTOR_REQUIRED', 'La operación documental requiere un actor autorizado.')
  const plan = input.plan
  if (plan.kind === 'RECOVERY_REVIEW') {
    throw new DocumentDeletionApplyError('HUMAN_REVIEW_REQUIRED', 'La recuperación documental requiere revisión humana explícita.')
  }
  if (plan.kind === 'NO_TOMBSTONE' || plan.kind === 'NOOP_ALREADY_TOMBSTONED') {
    return { outcome: 'NOOP', plan, financialLedgerAction: 'NONE', b4Action: 'PRESERVE' }
  }
  if (plan.kind !== 'TOMBSTONE') throw new DocumentDeletionApplyError('PLAN_NOT_APPLICABLE', 'El plan documental no es aplicable.')

  return storage.transaction(async (tx) => {
    if (!await storage.requireEffectiveFinanceWriteAccess(tx, input.actorId)) {
      throw new DocumentDeletionApplyError('ACCESS_DENIED', 'El actor no conserva permiso efectivo de finanzas.')
    }
    const current = await storage.lockLifecycle(tx, plan.key)
    if (!current) throw new DocumentDeletionApplyError('LIFECYCLE_STALE', 'La fuente documental ya no existe para aplicar el borrado.')
    if (current.lifecycleState === 'TOMBSTONE' || current.tombstoneRecorded) {
      return { outcome: 'IDEMPOTENT', plan, financialLedgerAction: 'NONE', b4Action: 'PRESERVE' }
    }
    if (!sameSnapshot(plan, current)) {
      throw new DocumentDeletionApplyError('LIFECYCLE_STALE', 'La fuente documental cambió durante la revisión; vuelva a planificarla.')
    }

    const inserted = await storage.insertTombstoneIfAbsent(tx, plan.tombstone)
    const marked = await storage.markLifecycleTombstoned(tx, {
      key: plan.key,
      expectedSnapshotVersion: plan.tombstone.previousSnapshotVersion,
      tombstoneIdempotencyKey: plan.tombstone.idempotencyKey,
    })
    if (marked === 'STALE') throw new DocumentDeletionApplyError('LIFECYCLE_STALE', 'No se pudo conservar una foto documental consistente.')
    if (inserted === 'CREATED' && marked === 'ALREADY_TOMBSTONED') {
      throw new DocumentDeletionApplyError('LIFECYCLE_STALE', 'El tombstone no coincide con el ciclo documental bloqueado.')
    }
    // A durable tombstone and an active lifecycle row are an inconsistent pair,
    // not a replay: do not silently repair it or suppress its required review.
    if (inserted === 'EXISTS' && marked !== 'ALREADY_TOMBSTONED') {
      throw new DocumentDeletionApplyError('LIFECYCLE_STALE', 'El tombstone existente no coincide con el ciclo documental bloqueado.')
    }
    if (inserted === 'EXISTS' && marked === 'ALREADY_TOMBSTONED') {
      return { outcome: 'IDEMPOTENT', plan, financialLedgerAction: 'NONE', b4Action: 'PRESERVE' }
    }
    if (plan.incident) {
      await storage.insertIncidentIfAbsent(tx, { key: plan.key, tombstoneIdempotencyKey: plan.tombstone.idempotencyKey, incident: plan.incident })
    }
    await storage.appendAudit(tx, {
      action: 'DOCUMENT_TOMBSTONED', lifecycleKey: plan.key,
      tombstoneIdempotencyKey: plan.tombstone.idempotencyKey, incidentCode: plan.incident?.code ?? null,
    })
    return { outcome: 'APPLIED', plan, financialLedgerAction: 'NONE', b4Action: 'PRESERVE' }
  })
}

/** Convenience boundary for importer/job code: plan with the locked/read snapshot, then apply. */
export async function planAndApplyDocumentDeletion<Tx>(
  storage: DocumentDeletionStoragePort<Tx>,
  input: Readonly<{
    actorId: number
    snapshot: DocumentLifecycleSnapshot
    observation: ProviderDeletionObservation
  }>,
): Promise<AppliedDocumentDeletion> {
  return applyDocumentDeletionPlan(storage, { actorId: input.actorId, plan: planDocumentDeletion(input.snapshot, input.observation) })
}
