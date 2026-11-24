import { createHash } from 'node:crypto'
import type { RebuildRow } from './conciliar-db'

export const CONCILIAR_PREPARATION_SCHEMA = 'CONCILIAR_PREPARATION_V2' as const
export const PREPARATION_MAX_ROWS = 25_000
/** Seal pages are read-only. Publication may exceed a page only to keep a closed
 * old/new component atomic: <=500 union IDs, <=500 inserts and <=500 deletes. */
export const PREPARATION_MAX_BATCH = 100
export const PREPARATION_MAX_COHORT = 500
export const PREPARATION_TIMEOUT_MS = 25_000
export const PREPARATION_APPLY_TIMEOUT_MS = 10_000
export const PREPARATION_QUEUE_KIND = '!CONCILIAR_FULL_PREPARATION'
export const PREPARATION_QUEUE_ID = 'INCOMPLETE_REQUIRES_FULL_VIEW'
export type PreparationToken = Readonly<{
  stateXmin: string; projectionVersion: string; dirtyAt: string | null; dirtyReason: string | null
  queueHash: string; generationId: string | null; sourceEpoch: string
}>
export type PreparationPrior = Readonly<{ id: string; movementId: string | null; keys: readonly string[]; links: readonly string[] }>
export type PreparationBatch = Readonly<{ deleteIds: readonly string[]; rowIds: readonly string[] }>
export type PreparationPlan = Readonly<{
  schema: typeof CONCILIAR_PREPARATION_SCHEMA; mode: 'projection' | 'metadata'; actorId: number
  target: { database: string; role: string }; baseline: PreparationToken
  queue: readonly { kind: string; sourceId: string; xmin: string; changedAt: string }[]
  rows: readonly RebuildRow[]; prior: readonly PreparationPrior[]; batches: readonly PreparationBatch[]
  accounts: readonly { id: string; banco: string; alias: string | null }[]; emitted: number; batchSize: number
}>
export type PreparationCheckpoint = {
  schema: typeof CONCILIAR_PREPARATION_SCHEMA; plan: PreparationPlan; planHash: string
  guardedRows: RebuildRow[]; guardCursor: number; sealedRows: RebuildRow[]; sealCursor: number
  applyCursor: number; queueCursor: number; expected: PreparationToken; activated: boolean
  completed: boolean; checksum: string
}
export function preparationHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
export function samePreparationToken(left: PreparationToken, right: PreparationToken): boolean {
  return preparationHash(left) === preparationHash(right)
}
export function boundedPreparationBatch(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > PREPARATION_MAX_BATCH) throw new Error('CONCILIAR_PREPARATION_BATCH_INVALID')
  return value
}
/** Old AND new reservations belong to the same replacement component. A split
 * can expose two movements claiming one invoice during publication. Mirrors,
 * payroll/B5 document capacity and both transfer legs join the component too. */
export function preparationReplacementBatches(
  prior: readonly PreparationPrior[], rows: readonly RebuildRow[], reservations: readonly { rowId: string; keys: readonly string[] }[], size: number,
): PreparationBatch[] {
  boundedPreparationBatch(size)
  if (prior.length > PREPARATION_MAX_ROWS || rows.length > PREPARATION_MAX_ROWS
    || new Set(prior.map(p => p.id)).size !== prior.length || new Set(rows.map(p => p.row.id)).size !== rows.length) throw new Error('CONCILIAR_PREPARATION_POPULATION_INVALID')
  const all = [...new Set([...prior.map(p => p.id), ...rows.map(p => p.row.id)])].sort()
  const parents = new Map(all.map(id => [id, id]))
  const root = (id: string): string => {
    let r = id
    while (parents.get(r) !== r) r = parents.get(r)!
    while (id !== r) { const next = parents.get(id)!; parents.set(id, r); id = next }
    return r
  }
  const union = (a: string, b: string) => { const ra = root(a), rb = root(b); if (ra !== rb) parents.set(rb, ra) }
  const keys = new Map<string, string>()
  const bind = (id: string, key: string) => { const other = keys.get(key); if (other) union(id, other); else keys.set(key, id) }
  const reservationsByRow = new Map(reservations.map(r => [r.rowId, r.keys]))
  for (const p of prior) {
    if (p.movementId) bind(p.id, `MOVEMENT:${p.movementId}`)
    for (const key of p.keys) bind(p.id, key)
    for (const id of p.links) if (parents.has(id)) union(p.id, id)
  }
  for (const p of rows) {
    if (p.row.movimientoId) bind(p.row.id, `MOVEMENT:${p.row.movimientoId}`)
    for (const key of reservationsByRow.get(p.row.id) ?? []) bind(p.row.id, key)
    for (const key of preparationSourceKeys(p.source)) bind(p.row.id, key)
    for (const link of p.row.linksMovimiento ?? []) if (parents.has(link.id)) union(p.row.id, link.id)
    if (p.source.movimientoParId) bind(p.row.id, `MOVEMENT:${p.source.movimientoParId}`)
  }
  const components = new Map<string, string[]>()
  for (const id of all) { const r = root(id); const component = components.get(r) ?? []; component.push(id); components.set(r, component) }
  const oldIds = new Set(prior.map(p => p.id)), newIds = new Set(rows.map(p => p.row.id))
  const batches: PreparationBatch[] = []
  let pending: string[] = []
  const flush = () => { if (pending.length) batches.push({ deleteIds: pending.filter(id => oldIds.has(id)), rowIds: pending.filter(id => newIds.has(id)) }); pending = [] }
  for (const component of components.values()) {
    if (component.length > PREPARATION_MAX_COHORT) throw new Error('CONCILIAR_PREPARATION_COMPONENT_TOO_LARGE')
    if (component.length > size) { flush(); pending = component; flush(); continue }
    if (pending.length + component.length > size) flush()
    pending.push(...component)
  }
  flush()
  return batches
}
export function preparationSourceKeys(source: RebuildRow['source']): string[] {
  return [
    ...(source.facturaRecibidaId ? [`RECEIVED:${source.facturaRecibidaId}`] : []),
    ...(source.facturaEmitidaId ? [`ISSUED:${source.facturaEmitidaId}`] : []),
    ...(source.propuestaId ? [`PROPOSAL:${source.propuestaId}`] : []),
    ...(source.confirmingId ? [`CONFIRMING:${source.confirmingId}`] : []),
    ...(source.nominaId ? [`PAYROLL:${source.nominaId}`] : []),
    ...(source.adjuntoB5Id ? [`B5:${source.adjuntoB5Id}`] : []),
    ...(source.gastoId ? [`EXPENSE:${source.gastoId}`] : []),
    ...(source.documentoConciliableId ? [`DOCUMENT:${source.documentoConciliableId}`] : []),
    ...(source.movimientoParId ? [`MOVEMENT:${source.movimientoParId}`] : []),
  ]
}
export function makePreparationCheckpoint(plan: PreparationPlan): PreparationCheckpoint {
  return signPreparationCheckpoint({ schema: CONCILIAR_PREPARATION_SCHEMA, plan, planHash: preparationHash(plan), guardedRows: [], guardCursor: 0,
    sealedRows: [], sealCursor: 0, applyCursor: 0, queueCursor: 0, expected: plan.baseline, activated: false, completed: false, checksum: '' })
}
/** File integrity digest, NOT a financial signature or permission. */
export function signPreparationCheckpoint(checkpoint: PreparationCheckpoint): PreparationCheckpoint {
  const { checksum: _checksum, ...body } = checkpoint
  return { ...body, checksum: preparationHash(body) }
}
export function validatePreparationCheckpoint(value: unknown): PreparationCheckpoint {
  const c = value as PreparationCheckpoint
  if (!c || c.schema !== CONCILIAR_PREPARATION_SCHEMA || c.plan?.schema !== CONCILIAR_PREPARATION_SCHEMA
    || !Number.isSafeInteger(c.plan.actorId) || c.plan.actorId < 1 || !['projection', 'metadata'].includes(c.plan.mode)
    || !Array.isArray(c.plan.rows) || !Array.isArray(c.plan.prior) || !Array.isArray(c.plan.batches) || !Array.isArray(c.plan.queue)
    || !Array.isArray(c.guardedRows) || !Array.isArray(c.sealedRows)
    || c.plan.rows.length > PREPARATION_MAX_ROWS || c.plan.prior.length > PREPARATION_MAX_ROWS
    || !Number.isSafeInteger(c.guardCursor) || c.guardCursor < 0 || c.guardCursor > c.plan.rows.length || c.guardedRows.length !== c.guardCursor
    || !Number.isSafeInteger(c.sealCursor) || c.sealCursor < 0 || c.sealCursor > c.plan.rows.length || c.sealedRows.length !== c.sealCursor
    || (c.sealCursor > 0 && c.guardCursor !== c.plan.rows.length)
    || !Number.isSafeInteger(c.applyCursor) || c.applyCursor < 0 || c.applyCursor > c.plan.batches.length
    || (c.applyCursor > 0 && c.sealCursor !== c.plan.rows.length)
    || !Number.isSafeInteger(c.queueCursor) || c.queueCursor < 0 || c.queueCursor > c.plan.queue.length
    || (c.queueCursor > 0 && c.applyCursor !== c.plan.batches.length)
    || typeof c.activated !== 'boolean' || typeof c.completed !== 'boolean'
    || (c.completed && c.applyCursor !== c.plan.batches.length)
    || !/^[a-f0-9]{64}$/.test(c.expected?.sourceEpoch ?? '')
    || c.planHash !== preparationHash(c.plan) || c.checksum !== signPreparationCheckpoint(c).checksum) throw new Error('CONCILIAR_PREPARATION_CHECKPOINT_INVALID')
  boundedPreparationBatch(c.plan.batchSize)
  if (c.plan.batches.some(b => !Array.isArray(b.deleteIds) || !Array.isArray(b.rowIds) || new Set([...b.deleteIds, ...b.rowIds]).size > PREPARATION_MAX_COHORT)) throw new Error('CONCILIAR_PREPARATION_CHECKPOINT_INVALID')
  const newIds = c.plan.batches.flatMap(b => [...b.rowIds]).sort(), oldIds = c.plan.batches.flatMap(b => [...b.deleteIds]).sort()
  const expectedNew = (c.plan.mode === 'projection' ? c.plan.rows.map(r => r.row.id) : c.plan.prior.map(r => r.id)).sort()
  const expectedOld = (c.plan.mode === 'projection' ? c.plan.prior.map(r => r.id) : []).sort()
  if (preparationHash(newIds) !== preparationHash(expectedNew) || preparationHash(oldIds) !== preparationHash(expectedOld)
    || c.guardedRows.some((r, i) => r.row.id !== c.plan.rows[i].row.id)
    || c.sealedRows.some((r, i) => r.row.id !== c.plan.rows[i].row.id)) throw new Error('CONCILIAR_PREPARATION_CHECKPOINT_COVERAGE_INVALID')
  return c
}
