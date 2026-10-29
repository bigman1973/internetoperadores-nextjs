/* B3b: pruebas sintéticas puras/memoria. Sin Prisma, BD, Graph, OCR, build ni tsc. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planDocumentDeletion,
  projectDocumentDeletionFolderState,
  type DocumentLifecycleSnapshot,
  type ProviderDeletionObservation,
} from '../lib/finanzas/finance-document-deletion-core'
import {
  applyDocumentDeletionPlan,
  DocumentDeletionApplyError,
  type DocumentDeletionStoragePort,
} from '../lib/finanzas/finance-document-deletion-adapter'

const key = { source: 'ONEDRIVE', sourceItemKey: 'fixture-item-001' } as const
function active(overrides: Partial<DocumentLifecycleSnapshot> = {}): DocumentLifecycleSnapshot {
  return { ...key, lifecycleState: 'ACTIVO', currentSnapshotVersion: 7, b4Reconciled: true, tombstoneRecorded: false, ...overrides }
}
function delta(overrides: Partial<Extract<ProviderDeletionObservation, { kind: 'DELTA_TOMBSTONE' }>> = {}): ProviderDeletionObservation {
  return { kind: 'DELTA_TOMBSTONE', ...key, deltaPageComplete: true, tombstoneId: 'delta-tombstone-001', ...overrides }
}

class MemoryStorage implements DocumentDeletionStoragePort<{}> {
  snapshot: DocumentLifecycleSnapshot
  authorized = true
  tombstones = new Set<string>()
  incidents: string[] = []
  audits: string[] = []
  /** The adapter intentionally has no mechanism to change this counter. */
  financialLedgerMutations = 0
  b4Mutations = 0

  constructor(snapshot: DocumentLifecycleSnapshot) { this.snapshot = snapshot }
  async transaction<T>(work: (tx: {}) => Promise<T>): Promise<T> { return work({}) }
  async requireEffectiveFinanceWriteAccess(): Promise<boolean> { return this.authorized }
  async lockLifecycle(): Promise<DocumentLifecycleSnapshot> { return this.snapshot }
  async insertTombstoneIfAbsent(_: {}, tombstone: { idempotencyKey: string }): Promise<'CREATED' | 'EXISTS'> {
    if (this.tombstones.has(tombstone.idempotencyKey)) return 'EXISTS'
    this.tombstones.add(tombstone.idempotencyKey)
    return 'CREATED'
  }
  async markLifecycleTombstoned(_: {}, input: { expectedSnapshotVersion: number }): Promise<'MARKED' | 'ALREADY_TOMBSTONED' | 'STALE'> {
    if (this.snapshot.lifecycleState === 'TOMBSTONE') return 'ALREADY_TOMBSTONED'
    if (this.snapshot.currentSnapshotVersion !== input.expectedSnapshotVersion) return 'STALE'
    this.snapshot = { ...this.snapshot, lifecycleState: 'TOMBSTONE', tombstoneRecorded: true }
    return 'MARKED'
  }
  async insertIncidentIfAbsent(_: {}, input: { tombstoneIdempotencyKey: string }): Promise<void> {
    if (!this.incidents.includes(input.tombstoneIdempotencyKey)) this.incidents.push(input.tombstoneIdempotencyKey)
  }
  async appendAudit(_: {}, audit: { tombstoneIdempotencyKey: string }): Promise<void> { this.audits.push(audit.tombstoneIdempotencyKey) }
}

test('borrado positivo con B4 conciliado crea tombstone ámbar sin deshacer B4 ni ledger', async () => {
  const plan = planDocumentDeletion(active(), delta())
  assert.equal(plan.kind, 'TOMBSTONE')
  if (plan.kind !== 'TOMBSTONE') throw new Error('El fixture debía producir tombstone.')
  assert.equal(plan.incident?.code, 'AMBAR_DOCUMENTO_BORRADO')
  assert.equal(plan.incident?.preserveB4, true)
  assert.equal(plan.financialLedgerAction, 'NONE')
  const memory = new MemoryStorage(active())
  const result = await applyDocumentDeletionPlan(memory, { actorId: 71, plan })
  assert.equal(result.outcome, 'APPLIED')
  assert.equal(memory.snapshot.lifecycleState, 'TOMBSTONE')
  assert.equal(memory.incidents.length, 1)
  assert.equal(memory.audits.length, 1)
  assert.equal(memory.financialLedgerMutations, 0)
  assert.equal(memory.b4Mutations, 0)
  assert.deepEqual(projectDocumentDeletionFolderState(memory.snapshot), {
    estadoCarpeta: 'BORRADO', elegibleComoCandidato: false, requiereRevisionHumana: true,
  })
})

test('repetir el mismo borrado es idempotente: no duplica tombstone, incidencia, auditoría ni ledger', async () => {
  const plan = planDocumentDeletion(active(), delta())
  if (plan.kind !== 'TOMBSTONE') throw new Error('El fixture debía producir tombstone.')
  const memory = new MemoryStorage(active())
  const first = await applyDocumentDeletionPlan(memory, { actorId: 71, plan })
  const second = await applyDocumentDeletionPlan(memory, { actorId: 71, plan })
  assert.equal(first.outcome, 'APPLIED')
  assert.equal(second.outcome, 'IDEMPOTENT')
  assert.equal(memory.tombstones.size, 1)
  assert.equal(memory.incidents.length, 1)
  assert.equal(memory.audits.length, 1)
  assert.equal(memory.financialLedgerMutations, 0)
  assert.equal(memory.b4Mutations, 0)
})

test('mismo itemId movido nunca crea tombstone', () => {
  const plan = planDocumentDeletion(active(), { kind: 'ITEM_PRESENT', ...key, moved: true })
  assert.equal(plan.kind, 'NO_TOMBSTONE')
  if (plan.kind !== 'NO_TOMBSTONE') throw new Error('El fixture debía permanecer sin tombstone.')
  assert.deepEqual(plan.safeCodes, ['ITEM_MOVIDO'])
  assert.equal(plan.financialLedgerAction, 'NONE')
})

test('job cancelado, 403, 404, timeout e inventario incompleto no bastan para un tombstone', () => {
  const observations: ProviderDeletionObservation[] = [
    { kind: 'JOB_CANCELLED', ...key },
    { kind: 'PROVIDER_FAILURE', ...key, code: 'HTTP_403' },
    { kind: 'PROVIDER_FAILURE', ...key, code: 'HTTP_404' },
    { kind: 'PROVIDER_FAILURE', ...key, code: 'TIMEOUT' },
    { kind: 'PROVIDER_FAILURE', ...key, code: 'INVENTORY_INCOMPLETE' },
    { kind: 'COMPLETE_INVENTORY_ABSENCE', ...key, inventoryComplete: false as unknown as true, scopeKey: 'scope-fixture-001' },
  ]
  for (const observation of observations) {
    const plan = planDocumentDeletion(active(), observation)
    assert.equal(plan.kind, 'NO_TOMBSTONE')
    assert.equal(plan.financialLedgerAction, 'NONE')
  }
})

test('un tombstone delta inválido falla cerrado y un archivo recuperado pide revisión humana, nunca autoconfirma', async () => {
  const invalid = planDocumentDeletion(active(), delta({ deltaPageComplete: false as unknown as true }))
  assert.equal(invalid.kind, 'NO_TOMBSTONE')
  if (invalid.kind !== 'NO_TOMBSTONE') throw new Error('El fixture debía rechazar delta parcial.')
  assert.deepEqual(invalid.safeCodes, ['DELTA_TOMBSTONE_INVALIDO'])

  const recovered = planDocumentDeletion(active({ lifecycleState: 'TOMBSTONE', tombstoneRecorded: true }), { kind: 'ITEM_PRESENT', ...key, moved: false })
  assert.equal(recovered.kind, 'RECOVERY_REVIEW')
  if (recovered.kind !== 'RECOVERY_REVIEW') throw new Error('El fixture debía requerir revisión humana.')
  assert.equal(recovered.requiresHumanConfirmation, true)
  const memory = new MemoryStorage(active({ lifecycleState: 'TOMBSTONE', tombstoneRecorded: true }))
  await assert.rejects(
    () => applyDocumentDeletionPlan(memory, { actorId: 71, plan: recovered }),
    (error: unknown) => error instanceof DocumentDeletionApplyError && error.code === 'HUMAN_REVIEW_REQUIRED',
  )
  assert.equal(memory.financialLedgerMutations, 0)
  assert.equal(memory.b4Mutations, 0)
})

test('el permiso efectivo se comprueba en transacción y no se sustituye por rol del cliente', async () => {
  const plan = planDocumentDeletion(active(), delta())
  if (plan.kind !== 'TOMBSTONE') throw new Error('El fixture debía producir tombstone.')
  const memory = new MemoryStorage(active())
  memory.authorized = false
  await assert.rejects(
    () => applyDocumentDeletionPlan(memory, { actorId: 71, plan }),
    (error: unknown) => error instanceof DocumentDeletionApplyError && error.code === 'ACCESS_DENIED',
  )
  assert.equal(memory.tombstones.size, 0)
  assert.equal(memory.financialLedgerMutations, 0)
  assert.equal(memory.b4Mutations, 0)
})

console.log('OK: B3b exige evidencia positiva, conserva B4/ledger y bloquea recuperación automática.')
