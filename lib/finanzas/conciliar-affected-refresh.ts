import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertConciliarRuntime } from './conciliar-runtime'
import { assertConciliarLiveAccessTx } from './conciliar-live-access'
import { rebuildConciliarProjectionTx, type ConciliarAffectedProjectionScope, type ConciliarProjectionChange } from './conciliar-db'
import { PREPARATION_QUEUE_KIND } from './conciliar-preparation-core'

type Tx = Prisma.TransactionClient & Record<string, any>
const MAX_CHANGES = 25_000
/** The queue is derived, durable and transaction-local. No process/global cache,
 * financial DML or automatic importer is introduced by consuming it. */
export async function refreshAffectedConciliarProjectionTx(base: Prisma.TransactionClient, actorId: number | null) {
  const tx = base as Tx
  const state = await tx.$queryRaw<Array<{ ready: boolean; dirty: boolean }>>(Prisma.sql`
    SELECT rebuilt_at IS NOT NULL AS ready,dirty_at IS NOT NULL AS dirty
    FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1 FOR UPDATE
  `)
  if (state.length !== 1 || !state[0].ready) return { projectionSynchronized: false, reason: 'INITIAL_MANUAL_REBUILD_REQUIRED' }
  const changes = await tx.$queryRaw<Array<{ kind: string; sourceId: string }>>(Prisma.sql`
    SELECT kind,source_id AS "sourceId" FROM area3_conciliar_projection_changes ORDER BY kind,source_id LIMIT ${MAX_CHANGES + 1} FOR UPDATE
  `)
  // A partial full-view publish is not a collection of independently dirty
  // source IDs. Only full preparation (or the real manual full rebuild) proves
  // coverage and may consume this durable marker; ordinary refresh stays inert.
  if (changes.some(row => row.kind === PREPARATION_QUEUE_KIND)) {
    return { projectionSynchronized: false, reason: 'INCOMPLETE_FULL_PREPARATION_REQUIRED' }
  }
  if (!changes.length) return { projectionSynchronized: !state[0].dirty }
  if (changes.length > MAX_CHANGES) throw new Error('CONCILIAR_AFFECTED_SCOPE_LIMIT')
  const byKind = (kind: string) => changes.filter(row => row.kind === kind).map(row => row.sourceId)
  const knownKinds = ['MOVEMENT', 'RECEIVED', 'ISSUED', 'PAYROLL', 'ACCOUNT', 'REMITTANCE', 'CONFIRMING'] as const
  if (changes.some(row => !(knownKinds as readonly string[]).includes(row.kind))) {
    return { projectionSynchronized: false, reason: 'UNKNOWN_DERIVED_CHANGE' }
  }
  const consumedChanges: readonly ConciliarProjectionChange[] = changes.map(row => ({ kind: row.kind as ConciliarProjectionChange['kind'], sourceId: row.sourceId }))
  const movementIds = new Set(byKind('MOVEMENT'))
  const issuedIds = new Set(byKind('ISSUED'))
  const receivedIds = new Set(byKind('RECEIVED'))
  const accounts = byKind('ACCOUNT'), remittances = byKind('REMITTANCE'), confirming = byKind('CONFIRMING')
  if (accounts.length) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM movimientos_bancarios WHERE cuenta_id IN (${Prisma.join(accounts)}) ORDER BY id LIMIT ${MAX_CHANGES + 1}
    `)
    if (rows.length > MAX_CHANGES) throw new Error('CONCILIAR_ACCOUNT_SCOPE_LIMIT')
    rows.forEach(row => movementIds.add(row.id))
  }
  if (remittances.length) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT fi.id FROM facturas_emitidas fi JOIN facturas f ON f.id=fi.factura_isp_id
      WHERE f.remesa_id::text IN (${Prisma.join(remittances)}) ORDER BY fi.id LIMIT ${MAX_CHANGES + 1}
    `)
    if (rows.length > MAX_CHANGES) throw new Error('CONCILIAR_REMITTANCE_SCOPE_LIMIT')
    rows.forEach(row => issuedIds.add(row.id))
  }
  if (confirming.length) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT l.factura_emitida_id AS id FROM lineas_liquidacion_confirming l
      JOIN liquidaciones_confirming_documentales d ON d.id=l.liquidacion_id
      WHERE d.confirming_id IN (${Prisma.join(confirming)}) ORDER BY l.factura_emitida_id LIMIT ${MAX_CHANGES + 1}
    `)
    if (rows.length > MAX_CHANGES) throw new Error('CONCILIAR_CONFIRMING_SCOPE_LIMIT')
    rows.forEach(row => issuedIds.add(row.id))
  }
  // Active AND historical links are needed on undo; source identity only, never
  // infer the invoice from amounts, a cached candidate or a receipt label.
  if (movementIds.size) {
    const rows = await tx.$queryRaw<Array<{ receivedId: string | null; issuedId: string | null }>>(Prisma.sql`
      SELECT DISTINCT d.factura_recibida_id AS "receivedId",d.factura_emitida_id AS "issuedId"
      FROM vinculos_movimiento_documento v JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
      WHERE v.movimiento_id IN (${Prisma.join([...movementIds])}) ORDER BY d.factura_recibida_id,d.factura_emitida_id LIMIT ${MAX_CHANGES + 1}
    `)
    if (rows.length > MAX_CHANGES) throw new Error('CONCILIAR_DOCUMENT_SCOPE_LIMIT')
    rows.forEach(row => { if (row.receivedId) receivedIds.add(row.receivedId); if (row.issuedId) issuedIds.add(row.issuedId) })
  }
  const scope: ConciliarAffectedProjectionScope = { movementIds: [...movementIds], receivedIds: [...receivedIds], issuedIds: [...issuedIds], payrollIds: byKind('PAYROLL'), consumedChanges }
  await rebuildConciliarProjectionTx(tx, actorId, scope)
  return { projectionSynchronized: true }
}

/** Finite existing import-hook consumer; never performs an import, a provider
 * request or a full/onboarding rebuild. Runtime/identity remains fail closed. */
export async function refreshAffectedConciliarProjection(actorId: number | null) {
  // The authorized POST owns scheduling, but its financial authorization marker
  // must never authorize a different transaction. Revalidate the effective actor
  // in this worker's own SERIALIZABLE snapshot before any derived write.
  if (!Number.isSafeInteger(actorId) || actorId === null || actorId < 1) throw new Error('CONCILIAR_REFRESH_ACTOR_REQUIRED')
  return (prisma as PrismaClient).$transaction(async base => {
    await assertConciliarRuntime(base)
    const access = await assertConciliarLiveAccessTx(base, actorId)
    if ('response' in access) throw new Error('CONCILIAR_REFRESH_ACCESS_REVOKED')
    return refreshAffectedConciliarProjectionTx(base, actorId)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 90_000 })
}
