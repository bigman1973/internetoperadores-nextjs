import { Prisma, type PrismaClient } from '@prisma/client'
import { assertConciliarRuntime } from './conciliar-runtime'
import { assertConciliarLiveAccessTx } from './conciliar-live-access'
import { applyConciliarDocumentSourceGuardToRebuildRowsTx, calculateConciliarProjectionPlan, insertProjectionBatches, materializeConciliarReadMetadataTx, readConciliarProjectionPlanSourcesTx, sealConciliarProjectionRowsTx, type RebuildRow } from './conciliar-db'
import { readConciliarPreparationSourceEpochTx } from './conciliar-preparation-epoch'
import {
  CONCILIAR_PREPARATION_SCHEMA, PREPARATION_MAX_ROWS, PREPARATION_TIMEOUT_MS, PREPARATION_APPLY_TIMEOUT_MS,
  PREPARATION_QUEUE_KIND, PREPARATION_QUEUE_ID,
  boundedPreparationBatch, makePreparationCheckpoint, preparationHash, preparationReplacementBatches, preparationSourceKeys,
  samePreparationToken, signPreparationCheckpoint, validatePreparationCheckpoint,
  type PreparationCheckpoint, type PreparationPlan, type PreparationPrior, type PreparationToken,
} from './conciliar-preparation-core'

type Tx = Prisma.TransactionClient & Record<string, any>
export type ConciliarPreparationOptions = Readonly<{
  client: PrismaClient; actorId: number; mode?: 'projection' | 'metadata'; batchSize?: number
  /** Explicit manual predeployment command, never an arbitrary DB opt-in. */
  productionPredeploy?: boolean
  checkpoint?: PreparationCheckpoint
  save: (checkpoint: PreparationCheckpoint) => Promise<void>
  progress?: (event: { phase: string; completed: number; total: number; rows?: number }) => void
}>
const READ_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 2_000, timeout: PREPARATION_TIMEOUT_MS }
const APPLY_OPTIONS = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 2_000, timeout: PREPARATION_APPLY_TIMEOUT_MS }
function changed(): never { throw new Error('CONCILIAR_PREPARATION_SOURCE_CHANGED_REPLAN_REQUIRED') }
async function authorize(tx: Tx, options: ConciliarPreparationOptions) {
  const runtime = await assertConciliarRuntime(tx)
  const access = await assertConciliarLiveAccessTx(tx, options.actorId)
  if ('response' in access) throw new Error('CONCILIAR_PREPARATION_ACCESS_REVOKED')
  if (runtime.runtime === 'production' && (!options.productionPredeploy || options.actorId !== 3 || access.actor.id !== 3 || access.actor.rol !== 'SUPER_ADMIN')) {
    throw new Error('CONCILIAR_PREPARATION_PRODUCTION_COMMAND_REQUIRED')
  }
  if (runtime.runtime === 'staging' && options.productionPredeploy) throw new Error('CONCILIAR_PREPARATION_TARGET_MISMATCH')
}
async function readQueue(tx: Tx): Promise<PreparationPlan['queue']> {
  const rows = await tx.$queryRaw<Array<{ kind: string; sourceId: string; xmin: string; changedAt: string }>>(Prisma.sql`
    SELECT kind,source_id AS "sourceId",xmin::text AS xmin,changed_at::text AS "changedAt"
    FROM area3_conciliar_projection_changes ORDER BY kind,source_id LIMIT ${PREPARATION_MAX_ROWS + 1}
  `)
  if (rows.length > PREPARATION_MAX_ROWS) throw new Error('CONCILIAR_PREPARATION_QUEUE_LIMIT')
  return rows
}
async function readState(tx: Tx) {
  const rows = await tx.$queryRaw<Array<{ stateXmin: string; projectionVersion: string; dirtyAt: string | null; dirtyReason: string | null }>>(Prisma.sql`
    SELECT xmin::text AS "stateXmin",projection_version::text AS "projectionVersion",dirty_at::text AS "dirtyAt",dirty_reason AS "dirtyReason"
    FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1
  `)
  if (rows.length !== 1) throw new Error('CONCILIAR_PREPARATION_STATE_REQUIRED')
  return rows[0]
}
/** Complete SQL epoch, queue row versions, state row version and current
 * generation. No source lock, timestamp approximation or financial memo. */
export async function readConciliarPreparationTokenTx(tx: Tx): Promise<PreparationToken> {
  const state = await readState(tx), queues = await readQueue(tx)
  const generations = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id::text AS id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1`)
  const sourceEpoch = await readConciliarPreparationSourceEpochTx(tx)
  return { ...state, queueHash: preparationHash(queues), generationId: generations[0]?.id ?? null, sourceEpoch }
}
async function identity(tx: Tx) {
  const rows = await tx.$queryRaw<Array<{ database: string; role: string }>>(Prisma.sql`SELECT current_database() AS database,current_user AS role LIMIT 1`)
  if (rows.length !== 1) throw new Error('CONCILIAR_PREPARATION_IDENTITY_REQUIRED')
  return rows[0]
}
async function priorProjection(tx: Tx): Promise<PreparationPrior[]> {
  const rows = await tx.$queryRaw<Array<{ id: string; movementId: string | null; source: any; links: any; issuedIds: any }>>(Prisma.sql`
    SELECT p.id,p.movimiento_id AS "movementId",p.source,p.links_movimiento AS links,
      COALESCE((
        SELECT json_agg(DISTINCT ids.id) FROM (
          SELECT x.item->>'facturaEmitidaId' AS id
          FROM modo_facil_propuestas_cobro proposal
          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(proposal.composicion)='array' THEN proposal.composicion WHEN jsonb_typeof(proposal.composicion->'items')='array' THEN proposal.composicion->'items' ELSE '[]'::jsonb END) x(item)
          WHERE proposal.id::text=p.source->>'propuestaId'
          UNION
          SELECT l.factura_emitida_id AS id FROM lineas_liquidacion_confirming l
          JOIN liquidaciones_confirming_documentales d ON d.id=l.liquidacion_id
          WHERE d.confirming_id=p.source->>'confirmingId'
          UNION
          SELECT cl.factura_emitida_id AS id FROM confirming_lineas cl WHERE cl.confirming_id=p.source->>'confirmingId'
        ) ids WHERE ids.id IS NOT NULL
      ),'[]'::json) AS "issuedIds"
    FROM conciliar_proyecciones p ORDER BY p.id LIMIT ${PREPARATION_MAX_ROWS + 1}
  `)
  if (rows.length > PREPARATION_MAX_ROWS) throw new Error('CONCILIAR_PREPARATION_PRIOR_LIMIT')
  return rows.map(p => {
    const source = typeof p.source === 'string' ? JSON.parse(p.source) : p.source
    const links = typeof p.links === 'string' ? JSON.parse(p.links) : p.links
    const issued = typeof p.issuedIds === 'string' ? JSON.parse(p.issuedIds) : p.issuedIds
    if (!source || !Array.isArray(issued) || (links !== null && !Array.isArray(links))) throw new Error('CONCILIAR_PREPARATION_PRIOR_INVALID')
    return { id: p.id, movementId: p.movementId, keys: [...preparationSourceKeys(source), ...issued.map(id => `ISSUED:${id}`)],
      links: (links ?? []).flatMap((link: any) => typeof link.id === 'string' ? [link.id] : []) }
  })
}
export async function createConciliarPreparationPlan(options: ConciliarPreparationOptions): Promise<PreparationCheckpoint> {
  const size = boundedPreparationBatch(options.batchSize ?? 20), mode = options.mode ?? 'projection'
  if (!Number.isSafeInteger(options.actorId) || options.actorId < 1) throw new Error('CONCILIAR_PREPARATION_ACTOR_REQUIRED')
  const picture = await options.client.$transaction(async base => {
    const tx = base as Tx
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    await authorize(tx, options)
    const baseline = await readConciliarPreparationTokenTx(tx), queue = await readQueue(tx), target = await identity(tx)
    const prior = await priorProjection(tx)
    const sources = mode === 'projection' ? await readConciliarProjectionPlanSourcesTx(tx, undefined, true) : null
    if (mode === 'metadata') {
      const ready = await tx.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`SELECT rebuilt_at IS NOT NULL AS ready FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1`)
      if (ready.length !== 1 || !ready[0].ready) throw new Error('CONCILIAR_PREPARATION_METADATA_REQUIRES_EXISTING_VIEW')
    } else if (mode !== 'projection') throw new Error('CONCILIAR_PREPARATION_MODE_INVALID')
    const accounts = await tx.$queryRaw<Array<{ id: string; banco: string; alias: string | null }>>(Prisma.sql`SELECT id,banco,alias FROM cuentas_bancarias WHERE activa=true ORDER BY banco,alias NULLS LAST,id LIMIT 101`)
    if (accounts.length > 100) throw new Error('CONCILIAR_PREPARATION_ACCOUNTS_LIMIT')
    return { baseline, queue, target, prior, sources, accounts }
  }, READ_OPTIONS)
  // Complete raw source read has CLOSED before global allocation, rendering,
  // dependency closure, JSON digest and private artifact I/O.
  const planned = picture.sources ? calculateConciliarProjectionPlan(picture.sources) : { rows: [] as RebuildRow[], emitted: 0, reservationKeys: [] }
  const batches = mode === 'projection' ? preparationReplacementBatches(picture.prior, planned.rows, planned.reservationKeys, size)
    : Array.from({ length: Math.ceil(picture.prior.length / size) }, (_, i) => ({ deleteIds: [], rowIds: picture.prior.slice(i * size, (i + 1) * size).map(p => p.id) }))
  return makePreparationCheckpoint({ schema: CONCILIAR_PREPARATION_SCHEMA, mode, actorId: options.actorId,
    target: picture.target, baseline: picture.baseline, queue: picture.queue, prior: picture.prior,
    rows: planned.rows, emitted: planned.emitted, accounts: picture.accounts, batchSize: size, batches })
}
function receipt(c: PreparationCheckpoint, cursor: number): string { return `AREA3_PREP:${c.planHash.slice(0, 32)}:${cursor}` }
function completionReceipt(c: PreparationCheckpoint): string { return `AREA3_PREP_DONE:${c.planHash.slice(0, 32)}:${c.plan.baseline.sourceEpoch.slice(0, 32)}:${c.plan.batches.length}` }
async function lockState(tx: Tx, token: PreparationToken) {
  // Only commit control is locked, AFTER all source hashing. RR/SSI rejects a
  // tracked/old-EC writer changing the singleton after this snapshot began.
  const locked = await tx.$queryRaw<Array<{ stateXmin: string }>>(Prisma.sql`
    SELECT xmin::text AS "stateXmin" FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1 FOR UPDATE NOWAIT
  `)
  if (locked.length !== 1 || locked[0].stateXmin !== token.stateXmin) changed()
}
async function current(tx: Tx, c: PreparationCheckpoint, options: ConciliarPreparationOptions) {
  await authorize(tx, options)
  if (preparationHash(await identity(tx)) !== preparationHash(c.plan.target)) changed()
  const token = await readConciliarPreparationTokenTx(tx)
  if (token.sourceEpoch !== c.plan.baseline.sourceEpoch) changed()
  return token
}
async function writtenToken(tx: Tx, token: PreparationToken): Promise<PreparationToken> {
  return { ...token, ...await readState(tx), queueHash: preparationHash(await readQueue(tx)) }
}
function recoverable(c: PreparationCheckpoint, token: PreparationToken, reason: string) {
  return token.dirtyReason === reason && token.sourceEpoch === c.expected.sourceEpoch
    && token.generationId === c.expected.generationId
    && BigInt(token.projectionVersion) === BigInt(c.expected.projectionVersion) + BigInt(1)
}
async function assertCoverage(tx: Tx, c: PreparationCheckpoint) {
  const actual = await tx.$queryRaw<Array<{ id: string; fingerprint: string; color: string; selectable: boolean; metadataReady: boolean }>>(Prisma.sql`
    SELECT id,source_fingerprint AS fingerprint,color,seleccionable AS selectable,
      read_metadata->>'id'=id AS "metadataReady" FROM conciliar_proyecciones ORDER BY id COLLATE "C" LIMIT ${PREPARATION_MAX_ROWS + 1}
  `)
  const expected = c.sealedRows.map(r => ({ id: r.row.id, fingerprint: r.sourceFingerprint, color: r.row.color, selectable: r.row.seleccionable, metadataReady: true })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  if (actual.length > PREPARATION_MAX_ROWS || preparationHash(actual) !== preparationHash(expected)) throw new Error('CONCILIAR_PREPARATION_COMPLETION_COVERAGE_FAILED')
}
/** Full-view read-side preparation only. G7 reads are real, in short read-only
 * pages against the SAME complete epoch/context. Persisted display stamps never
 * authorize an action: every action keeps its existing live G7/ACL/locks. */
export async function prepareConciliarProjection(options: ConciliarPreparationOptions) {
  if (!Number.isSafeInteger(options.actorId) || options.actorId < 1) throw new Error('CONCILIAR_PREPARATION_ACTOR_REQUIRED')
  let c = options.checkpoint ? validatePreparationCheckpoint(options.checkpoint) : await createConciliarPreparationPlan(options)
  if (c.plan.actorId !== options.actorId || (options.mode && c.plan.mode !== options.mode)
    || (options.batchSize && c.plan.batchSize !== options.batchSize)) throw new Error('CONCILIAR_PREPARATION_RESUME_MISMATCH')
  const persist = async () => { c = signPreparationCheckpoint(c); await options.save(c) }
  await persist()
  if (!c.activated && !c.completed) {
    c.expected = await options.client.$transaction(async base => {
      const tx = base as Tx, token = await current(tx, c, options)
      const queue = await readQueue(tx)
      const ordinary = queue.filter(q => q.kind !== PREPARATION_QUEUE_KIND)
      const baselineOrdinary = c.plan.queue.filter(q => q.kind !== PREPARATION_QUEUE_KIND)
      const recovered = recoverable(c, token, receipt(c, 0)) && preparationHash(ordinary) === preparationHash(baselineOrdinary)
        && queue.some(q => q.kind === PREPARATION_QUEUE_KIND && q.sourceId === PREPARATION_QUEUE_ID)
      if (recovered) return token
      if (!samePreparationToken(c.expected, token)) changed()
      await lockState(tx, token)
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO area3_conciliar_projection_changes(kind,source_id) VALUES(${PREPARATION_QUEUE_KIND},${PREPARATION_QUEUE_ID})
        ON CONFLICT(kind,source_id) DO UPDATE SET changed_at=CURRENT_TIMESTAMP
      `)
      await tx.$executeRaw(Prisma.sql`
        UPDATE estado_proyeccion_conciliar SET dirty_at=COALESCE(dirty_at,CURRENT_TIMESTAMP),dirty_reason=${receipt(c, 0)},projection_version=projection_version+1 WHERE singleton=true
      `)
      return writtenToken(tx, token)
    }, APPLY_OPTIONS)
    c.activated = true; await persist()
  }
  while (c.guardCursor < c.plan.rows.length) {
    const page = c.plan.rows.slice(c.guardCursor, c.guardCursor + c.plan.batchSize)
    const guarded = await options.client.$transaction(async base => {
      const tx = base as Tx; await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
      if (!samePreparationToken(c.expected, await current(tx, c, options))) changed()
      return applyConciliarDocumentSourceGuardToRebuildRowsTx(tx, page)
    }, READ_OPTIONS)
    c.guardedRows.push(...guarded); c.guardCursor += page.length; await persist()
    options.progress?.({ phase: 'guard', completed: c.guardCursor, total: c.plan.rows.length })
  }
  while (c.sealCursor < c.plan.rows.length) {
    const page = c.guardedRows.slice(c.sealCursor, c.sealCursor + c.plan.batchSize)
    const checked = await options.client.$transaction(async base => {
      // B4's unchanged authoritative preflight takes movement row locks. Keep
      // those locks only for this bounded page, never the global state/rebuild.
      // The seal's existing proxy forbids model/raw writes; no finance is saved.
      const tx = base as Tx; await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ WRITE`)
      if (!samePreparationToken(c.expected, await current(tx, c, options))) changed()
      return sealConciliarProjectionRowsTx(tx, page, c.guardedRows)
    }, READ_OPTIONS)
    c.sealedRows.push(...checked); c.sealCursor += page.length; await persist()
    options.progress?.({ phase: 'seal', completed: c.sealCursor, total: c.plan.rows.length })
  }
  while (c.applyCursor < c.plan.batches.length) {
    const cursor = c.applyCursor, batch = c.plan.batches[cursor]
    c.expected = await options.client.$transaction(async base => {
      const tx = base as Tx, token = await current(tx, c, options)
      if (!samePreparationToken(c.expected, token)) {
        if (recoverable(c, token, receipt(c, cursor + 1)) && token.queueHash === c.expected.queueHash) return token
        changed()
      }
      await lockState(tx, token)
      if (c.plan.mode === 'projection') {
        const ids = new Set(batch.rowIds), rows = c.sealedRows.filter(r => ids.has(r.row.id))
        if (rows.length !== ids.size) throw new Error('CONCILIAR_PREPARATION_BATCH_ROWS_MISSING')
        if (batch.deleteIds.length) await tx.$executeRaw(Prisma.sql`DELETE FROM conciliar_proyecciones WHERE id IN (${Prisma.join([...batch.deleteIds])})`)
        await insertProjectionBatches(tx, rows)
      }
      await materializeConciliarReadMetadataTx(tx, batch.rowIds)
      await tx.$executeRaw(Prisma.sql`
        UPDATE estado_proyeccion_conciliar SET dirty_at=COALESCE(dirty_at,CURRENT_TIMESTAMP),dirty_reason=${receipt(c, cursor + 1)},projection_version=projection_version+1 WHERE singleton=true
      `)
      return writtenToken(tx, token)
    }, APPLY_OPTIONS)
    c.applyCursor++; await persist()
    options.progress?.({ phase: 'apply', completed: c.applyCursor, total: c.plan.batches.length, rows: batch.rowIds.length })
  }
  // Large baseline queues cannot be drained in the final control transaction.
  // Keep the sentinel durable while consuming exact observed xmin pages. An
  // ordinary refresh still cannot claim clean even when only the sentinel remains.
  while (c.plan.mode === 'projection' && c.queueCursor < c.plan.queue.length) {
    const end = Math.min(c.queueCursor + 500, c.plan.queue.length)
    const page = c.plan.queue.slice(c.queueCursor, end).filter(q => q.kind !== PREPARATION_QUEUE_KIND)
    const reason = `AREA3_PREP_QUEUE:${c.planHash.slice(0, 32)}:${end}`
    c.expected = await options.client.$transaction(async base => {
      const tx = base as Tx, token = await current(tx, c, options)
      if (!samePreparationToken(c.expected, token)) {
        const remaining = await readQueue(tx)
        if (recoverable(c, token, reason)
          && !remaining.some(q => page.some(p => p.kind === q.kind && p.sourceId === q.sourceId))
          && remaining.some(q => q.kind === PREPARATION_QUEUE_KIND && q.sourceId === PREPARATION_QUEUE_ID)) return token
        changed()
      }
      await lockState(tx, token)
      if (page.length) await tx.$executeRaw(Prisma.sql`
        DELETE FROM area3_conciliar_projection_changes q USING jsonb_to_recordset(CAST(${JSON.stringify(page)} AS jsonb)) AS old(kind text,"sourceId" text,xmin text)
        WHERE q.kind=old.kind AND q.source_id=old."sourceId" AND q.xmin::text=old.xmin
      `)
      await tx.$executeRaw(Prisma.sql`
        UPDATE estado_proyeccion_conciliar SET dirty_at=COALESCE(dirty_at,CURRENT_TIMESTAMP),dirty_reason=${reason},projection_version=projection_version+1 WHERE singleton=true
      `)
      return writtenToken(tx, token)
    }, APPLY_OPTIONS)
    c.queueCursor = end; await persist()
    options.progress?.({ phase: 'queue', completed: c.queueCursor, total: c.plan.queue.length })
  }
  // Coverage and complete epoch are read BEFORE the short control/cleanup lock.
  // Consume only exact baseline row versions, never a timestamp/key-only drain.
  if (!c.completed) {
    c.expected = await options.client.$transaction(async base => {
      const tx = base as Tx, token = await current(tx, c, options)
      if (!samePreparationToken(c.expected, token)) {
        if (c.plan.mode === 'projection' && recoverable(c, token, completionReceipt(c)) && token.dirtyAt === null && (await readQueue(tx)).length === 0) {
          await assertCoverage(tx, c); return token
        }
        if (c.plan.mode === 'metadata' && recoverable(c, token, receipt(c, c.applyCursor + 1)) && token.queueHash === c.expected.queueHash) return token
        changed()
      }
      if (c.plan.mode === 'projection') await assertCoverage(tx, c)
      await lockState(tx, token)
      await tx.$executeRaw(Prisma.sql`UPDATE estado_proyeccion_conciliar SET read_accounts=CAST(${JSON.stringify(c.plan.accounts)} AS jsonb) WHERE singleton=true`)
      if (c.plan.mode === 'projection') {
        await tx.$executeRaw(Prisma.sql`DELETE FROM area3_conciliar_projection_changes WHERE kind=${PREPARATION_QUEUE_KIND} AND source_id=${PREPARATION_QUEUE_ID}`)
        if ((await readQueue(tx)).length) changed()
        await tx.$executeRaw(Prisma.sql`
          UPDATE estado_proyeccion_conciliar SET dirty_at=NULL,dirty_reason=${completionReceipt(c)},rebuilt_at=CURRENT_TIMESTAMP,rebuilt_by_id=${options.actorId},projection_version=projection_version+1 WHERE singleton=true
        `)
      } else {
        // Metadata is not a full preparation. Retain the unconsumable sentinel.
        await tx.$executeRaw(Prisma.sql`
          UPDATE estado_proyeccion_conciliar SET dirty_at=COALESCE(dirty_at,CURRENT_TIMESTAMP),dirty_reason=${receipt(c, c.applyCursor + 1)},projection_version=projection_version+1 WHERE singleton=true
        `)
      }
      return writtenToken(tx, token)
    }, APPLY_OPTIONS)
    c.completed = true; await persist()
  } else {
    await options.client.$transaction(async base => {
      const tx = base as Tx; await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
      if (!samePreparationToken(c.expected, await current(tx, c, options))) changed()
      if (c.plan.mode === 'projection') await assertCoverage(tx, c)
    }, READ_OPTIONS)
  }
  const full = c.plan.mode === 'projection'
  return { mode: c.plan.mode, prepared: full, metadataPrepared: true, projectionSynchronized: full, stale: !full,
    rows: full ? c.plan.rows.length : c.plan.prior.length, batches: c.applyCursor,
    queueConsumed: full ? c.plan.queue.filter(q => q.kind !== PREPARATION_QUEUE_KIND).length : 0,
    completionProof: full ? completionReceipt(c) : null }
}
