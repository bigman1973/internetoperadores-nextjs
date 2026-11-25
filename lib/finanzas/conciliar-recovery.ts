import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertConciliarRuntime } from '@/lib/finanzas/conciliar-runtime'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { trustedImpersonationContextResolutionFromRequest } from '@/lib/impersonation-context'
import { impersonationRequestAllowed } from '@/lib/impersonation-policy'
import type { ConciliarCommand } from './conciliar-contract'
import { assertConciliarLiveAccessTx } from './conciliar-live-access'
import { retryConciliarRecoveryPreparation } from './conciliar-recovery-retry-core'
import {
  buildConciliarRecoveryIntent,
  formatConciliarRecoveryResponse,
  isRecoverableConciliarCommand,
  type ConciliarRecoveryIdentity,
  type ConciliarRecoveryIntent,
  type ConciliarRecoveryLookup,
  type ConciliarRecoveryRecord,
} from './conciliar-recovery-core'

export { buildConciliarRecoveryIntent, formatConciliarRecoveryResponse, isRecoverableConciliarCommand }
export type { ConciliarRecoveryIdentity, ConciliarRecoveryIntent, ConciliarRecoveryLookup, ConciliarRecoveryRecord }

type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx
const CONCILIAR_PATH = '/api/admin/finanzas/conciliar'

export class ConciliarRecoveryError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

const fail = (status: number, code: string, message: string): never => { throw new ConciliarRecoveryError(status, code, message) }

export type ConciliarRecoveryWriteContext = Readonly<{
  identity: ConciliarRecoveryIdentity
  intent: ConciliarRecoveryIntent
}>

function sameNullable(left: string | null, right: string | null): boolean { return left === right }

function sameRecoveryIdentity(left: ConciliarRecoveryIdentity, right: ConciliarRecoveryIdentity): boolean {
  return left.actorRealId === right.actorRealId
    && left.actorEffectiveId === right.actorEffectiveId
    && sameNullable(left.actingSessionId, right.actingSessionId)
}

function rowToRecord(row: Record<string, unknown>): ConciliarRecoveryRecord | null {
  const resolution = row.resolution
  const action = row.action
  if ((resolution !== 'PENDING' && resolution !== 'COMMITTED')
    || (action !== 'CONFIRMAR' && action !== 'DESHACER')
    || typeof row.idempotencyKey !== 'string'
    || typeof row.commandHash !== 'string'
    || typeof row.bodyHash !== 'string'
    || typeof row.requestHash !== 'string'
    || !Number.isSafeInteger(Number(row.actorRealId))
    || !Number.isSafeInteger(Number(row.actorEffectiveId))
    || !Number.isSafeInteger(Number(row.selectionCount))
    || typeof row.selectionHash !== 'string') {
    return null
  }
  const optionalText = (value: unknown): string | null => value === null ? null : typeof value === 'string' ? value : null
  const legCount = row.legCount === null ? null : Number(row.legCount)
  if (row.legCount !== null && (!Number.isSafeInteger(legCount) || legCount < 0)) {
    return null
  }
  return {
    idempotencyKey: row.idempotencyKey,
    action,
    resolution,
    commandHash: row.commandHash,
    bodyHash: row.bodyHash,
    requestHash: row.requestHash,
    actorRealId: Number(row.actorRealId),
    actorEffectiveId: Number(row.actorEffectiveId),
    actingSessionId: optionalText(row.actingSessionId),
    selectionCount: Number(row.selectionCount),
    selectionHash: row.selectionHash,
    receiptOperationId: optionalText(row.receiptOperationId),
    targetConfirmationOperationId: optionalText(row.targetConfirmationOperationId),
    legCount,
  }
}

function recoveryLockKey(actorEffectiveId: number, idempotencyKey: string): string {
  // This is intentionally the pre-existing receipt lock namespace. Preparation,
  // execution and terminal publication serialize against each other.
  return `conciliar:${actorEffectiveId}:${idempotencyKey}`
}

const RECOVERY_INTENT_COLUMNS = [
  'idempotencyKey', 'action', 'resolution', 'commandHash', 'bodyHash', 'requestHash',
  'actorRealId', 'actorEffectiveId', 'actingSessionId', 'selectionCount', 'selectionHash',
  'receiptOperationId', 'targetConfirmationOperationId', 'legCount',
] as const

function isNullRecoveryIntentSentinel(row: Record<string, unknown>): boolean {
  return RECOVERY_INTENT_COLUMNS.every(column => row[column] === null)
}

async function readIntentForUpdateTx(tx: Tx, actorEffectiveId: number, idempotencyKey: string, checkLegacyReceipt = false): Promise<ConciliarRecoveryRecord | null> {
  // These are the only two advisory/row-lock CTE shapes admitted by the
  // impersonation classifier. `barrier` remains the materialized root even if
  // both relations are empty, and every relation lock depends on it.
  const rows = checkLegacyReceipt
    ? await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH barrier AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(CAST(${recoveryLockKey(actorEffectiveId, idempotencyKey)} AS text),0))::text AS locked
      ), intent AS MATERIALIZED (
        SELECT i.idempotency_key::text AS "idempotencyKey",i.action,i.resolution,
          i.command_hash AS "commandHash",i.body_hash AS "bodyHash",i.request_hash AS "requestHash",
          i.actor_real_id AS "actorRealId",i.actor_effective_id AS "actorEffectiveId",
          i.acting_session_id::text AS "actingSessionId",i.selection_count AS "selectionCount",
          i.selection_hash AS "selectionHash",i.receipt_operation_id::text AS "receiptOperationId",
          i.target_confirmation_operation_id::text AS "targetConfirmationOperationId",i.leg_count AS "legCount"
        FROM area3_conciliar_recovery_intents i CROSS JOIN barrier
        WHERE barrier.locked IS NOT NULL AND i.actor_effective_id=${actorEffectiveId} AND i.idempotency_key=CAST(${idempotencyKey} AS uuid)
        ORDER BY i.idempotency_key ASC LIMIT 1 FOR UPDATE OF i
      ), legacy_receipt AS MATERIALIZED (
        SELECT o.id FROM operaciones_conciliar o CROSS JOIN barrier
        WHERE barrier.locked IS NOT NULL AND o.actor_id=${actorEffectiveId} AND o.idempotency_key=CAST(${idempotencyKey} AS uuid)
        ORDER BY o.id ASC LIMIT 1 FOR UPDATE OF o
      ), legacy_flags AS MATERIALIZED (
        SELECT EXISTS (SELECT 1 FROM legacy_receipt) AS "hasLegacyReceipt" FROM barrier
      )
      SELECT i."idempotencyKey",i.action,i.resolution,i."commandHash",i."bodyHash",i."requestHash",
        i."actorRealId",i."actorEffectiveId",i."actingSessionId",i."selectionCount",i."selectionHash",
        i."receiptOperationId",i."targetConfirmationOperationId",i."legCount",legacy_flags."hasLegacyReceipt"
      FROM barrier LEFT JOIN intent i ON true LEFT JOIN legacy_flags ON true
    `)
    : await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      WITH barrier AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(CAST(${recoveryLockKey(actorEffectiveId, idempotencyKey)} AS text),0))::text AS locked
      ), intent AS MATERIALIZED (
        SELECT i.idempotency_key::text AS "idempotencyKey",i.action,i.resolution,
          i.command_hash AS "commandHash",i.body_hash AS "bodyHash",i.request_hash AS "requestHash",
          i.actor_real_id AS "actorRealId",i.actor_effective_id AS "actorEffectiveId",
          i.acting_session_id::text AS "actingSessionId",i.selection_count AS "selectionCount",
          i.selection_hash AS "selectionHash",i.receipt_operation_id::text AS "receiptOperationId",
          i.target_confirmation_operation_id::text AS "targetConfirmationOperationId",i.leg_count AS "legCount"
        FROM area3_conciliar_recovery_intents i CROSS JOIN barrier
        WHERE barrier.locked IS NOT NULL AND i.actor_effective_id=${actorEffectiveId} AND i.idempotency_key=CAST(${idempotencyKey} AS uuid)
        ORDER BY i.idempotency_key ASC LIMIT 1 FOR UPDATE OF i
      )
      SELECT i."idempotencyKey",i.action,i.resolution,i."commandHash",i."bodyHash",i."requestHash",
        i."actorRealId",i."actorEffectiveId",i."actingSessionId",i."selectionCount",i."selectionHash",
        i."receiptOperationId",i."targetConfirmationOperationId",i."legCount"
      FROM barrier LEFT JOIN intent i ON true
    `)
  if (rows.length !== 1 || !rows[0]) fail(503,'RECOVERY_INTENT_CORRUPTO','El intent durable no conserva una forma verificable.')
  const row = rows[0]
  if (row.idempotencyKey === null) {
    if (!isNullRecoveryIntentSentinel(row)) fail(503,'RECOVERY_INTENT_CORRUPTO','El intent durable no conserva una forma verificable.')
    if (!checkLegacyReceipt) return null
    if (row.hasLegacyReceipt === true) fail(409, 'RECOVERY_RECIBO_LEGADO_NO_VERIFICABLE', 'La clave ya tiene un recibo sin correlación durable de recuperación.')
    if (row.hasLegacyReceipt === false) return null
    fail(503,'RECOVERY_INTENT_CORRUPTO','El intent durable no conserva una forma verificable.')
  }
  const record = rowToRecord(row)
  if (!record) fail(503, 'RECOVERY_INTENT_CORRUPTO', 'El intent durable no conserva una forma verificable.')
  return record
}

function intentMatches(record: ConciliarRecoveryRecord, context: ConciliarRecoveryWriteContext): boolean {
  const expected = context.intent
  const identity = context.identity
  return record.idempotencyKey === expected.idempotencyKey
    && record.action === expected.action
    && record.commandHash === expected.commandHash
    && record.bodyHash === expected.bodyHash
    && record.requestHash === expected.requestHash
    && record.actorRealId === identity.actorRealId
    && record.actorEffectiveId === identity.actorEffectiveId
    && sameNullable(record.actingSessionId, identity.actingSessionId)
    && record.selectionCount === expected.selectionCount
    && record.selectionHash === expected.selectionHash
    && sameNullable(record.targetConfirmationOperationId, expected.targetConfirmationOperationId)
}

function assertMatchingIntent(record: ConciliarRecoveryRecord, context: ConciliarRecoveryWriteContext): void {
  if (!intentMatches(record, context)) {
    fail(409, 'RECOVERY_IDEMPOTENCY_MISMATCH', 'La clave de idempotencia pertenece a otro intent de recuperación.')
  }
}

/** Resolves identity only from the signed request context; never from a URL/body actor selector. */
export async function resolveConciliarRecoveryIdentity(actorEffectiveId: number): Promise<ConciliarRecoveryIdentity> {
  const context = await trustedImpersonationContextResolutionFromRequest()
  if (context.status === 'invalid' || (context.status === 'valid' && context.context.targetId !== actorEffectiveId)) {
    fail(403, 'CONTEXTO_ACTUACION_CONCILIAR_INVALIDO', 'La identidad efectiva no coincide con el contexto firmado de actuación.')
  }
  return context.status === 'valid'
    ? { actorRealId: context.context.actorId, actorEffectiveId, actingSessionId: context.context.sessionId }
    : { actorRealId: actorEffectiveId, actorEffectiveId, actingSessionId: null }
}

async function assertRecoveryWriteAccessTx(tx: Tx, actorEffectiveId: number): Promise<void> {
  const access = await assertConciliarLiveAccessTx(tx,actorEffectiveId)
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'Tu permiso para conciliar ya no está vigente.')
}

/**
 * Commits PENDING before the financial SERIALIZABLE transaction is opened. The
 * shared advisory lock and unique effective-actor/key pair prevent another
 * command or acting session from adopting the intent.
 */
export async function prepareConciliarRecoveryIntent(
  actorEffectiveId: number,
  command: ConciliarCommand,
  identity: ConciliarRecoveryIdentity,
): Promise<ConciliarRecoveryWriteContext | null> {
  if (!isRecoverableConciliarCommand(command)) return null
  if (identity.actorEffectiveId !== actorEffectiveId) fail(403, 'RECOVERY_ACTOR_INVALIDO', 'La identidad efectiva de recuperación no coincide.')
  const intent = buildConciliarRecoveryIntent(actorEffectiveId, command)
  const context: ConciliarRecoveryWriteContext = { identity, intent }
  return retryConciliarRecoveryPreparation(() => db().$transaction(async base => {
    const tx = asTx(base)
    // A serialization abort discards this entire callback. Resolve the signed
    // request identity again before every fresh snapshot; never carry a stale
    // acting session into a retried durable PENDING preparation.
    const liveIdentity = await resolveConciliarRecoveryIdentity(actorEffectiveId)
    if (!sameRecoveryIdentity(liveIdentity, identity)) {
      fail(403, 'CONTEXTO_ACTUACION_CONCILIAR_INVALIDO', 'La identidad de recuperación cambió antes de preparar el intent.')
    }
    await assertRecoveryWriteAccessTx(tx, actorEffectiveId)
    const existing = await readIntentForUpdateTx(tx, actorEffectiveId, intent.idempotencyKey, true)
    if (existing) {
      assertMatchingIntent(existing, context)
      return context
    }
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO area3_conciliar_recovery_intents(
        id,actor_effective_id,actor_real_id,acting_session_id,idempotency_key,action,
        canonical_command,command_hash,body_hash,request_hash,selection_count,selection_hash,
        target_confirmation_operation_id,resolution,created_at
      ) VALUES(
        gen_random_uuid(),${identity.actorEffectiveId},${identity.actorRealId},
        ${identity.actingSessionId ? Prisma.sql`CAST(${identity.actingSessionId} AS uuid)` : Prisma.sql`NULL`},
        CAST(${intent.idempotencyKey} AS uuid),${intent.action},CAST(${JSON.stringify(intent.canonicalCommand)} AS jsonb),
        ${intent.commandHash},${intent.bodyHash},${intent.requestHash},${intent.selectionCount},${intent.selectionHash},
        ${intent.targetConfirmationOperationId ? Prisma.sql`CAST(${intent.targetConfirmationOperationId} AS uuid)` : Prisma.sql`NULL`},
        'PENDING',CURRENT_TIMESTAMP
      )
    `)
    return context
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 }))
}

/** Locks the already durable exact intent inside the financial transaction. */
export async function assertConciliarRecoveryIntentExecutableTx(tx: Tx, context: ConciliarRecoveryWriteContext | null): Promise<string | undefined> {
  if (!context) return undefined
  const existing = await readIntentForUpdateTx(tx, context.identity.actorEffectiveId, context.intent.idempotencyKey)
  if (!existing) fail(503, 'RECOVERY_INTENT_AUSENTE', 'No se encontró el intent durable de recuperación.')
  assertMatchingIntent(existing, context)
  // Only this private post-validation value permits the exact in-transaction
  // operation helper to reuse the barrier already taken by the CTE.
  return context.intent.idempotencyKey
}

/**
 * Publishes COMMITTED only after the receipt and all financial legs are durable
 * in this same SERIALIZABLE callback. A failed update aborts the callback, so
 * neither a receipt nor a terminal recovery result can commit partially.
 */
export async function commitConciliarRecoveryIntentTx(
  tx: Tx,
  context: ConciliarRecoveryWriteContext | null,
  receiptOperationId: string,
  targetConfirmationOperationId: string | null,
): Promise<void> {
  if (!context) return
  const intent = context.intent
  if (intent.action === 'CONFIRMAR' && targetConfirmationOperationId !== null) fail(503, 'RECOVERY_INTENT_INCONSISTENTE', 'La confirmación no puede tener objetivo de deshacer.')
  if (intent.action === 'DESHACER' && targetConfirmationOperationId !== intent.targetConfirmationOperationId) fail(503, 'RECOVERY_INTENT_INCONSISTENTE', 'El objetivo de deshacer no coincide con el intent durable.')
  const changed = await tx.$queryRaw<Array<{ idempotencyKey: string }>>(Prisma.sql`
    WITH leg_count AS (
      SELECT COUNT(*)::integer AS total FROM patas_operacion_conciliar
      WHERE operacion_conciliar_id=CAST(${receiptOperationId} AS uuid)
    )
    UPDATE area3_conciliar_recovery_intents i
       SET resolution='COMMITTED',receipt_operation_id=CAST(${receiptOperationId} AS uuid),
           target_confirmation_operation_id=${targetConfirmationOperationId ? Prisma.sql`CAST(${targetConfirmationOperationId} AS uuid)` : Prisma.sql`NULL`},
           leg_count=(SELECT total FROM leg_count),committed_at=CURRENT_TIMESTAMP
     WHERE i.actor_effective_id=${context.identity.actorEffectiveId}
       AND i.idempotency_key=CAST(${intent.idempotencyKey} AS uuid)
       AND i.action=${intent.action}
       AND i.command_hash=${intent.commandHash}
       AND i.body_hash=${intent.bodyHash}
       AND i.request_hash=${intent.requestHash}
       AND i.actor_real_id=${context.identity.actorRealId}
       AND i.acting_session_id IS NOT DISTINCT FROM ${context.identity.actingSessionId ? Prisma.sql`CAST(${context.identity.actingSessionId} AS uuid)` : Prisma.sql`NULL`}
       AND i.selection_count=${intent.selectionCount}
       AND i.selection_hash=${intent.selectionHash}
       AND i.target_confirmation_operation_id IS NOT DISTINCT FROM ${intent.targetConfirmationOperationId ? Prisma.sql`CAST(${intent.targetConfirmationOperationId} AS uuid)` : Prisma.sql`NULL`}
       AND i.resolution='PENDING'
    RETURNING i.idempotency_key::text AS "idempotencyKey"
  `)
  if (changed.length === 1 && changed[0]?.idempotencyKey === intent.idempotencyKey) return

  // An exact POST replay reaches this point only after the shared advisory lock
  // and lockOperationOrReplay returned the pre-existing root receipt. It must
  // not attempt a second PENDING→COMMITTED transition, but it still verifies
  // the committed root/target/leg count rather than accepting any same-key row.
  const replay = await readIntentForUpdateTx(tx, context.identity.actorEffectiveId, intent.idempotencyKey)
  if (!replay || replay.resolution !== 'COMMITTED'
    || !intentMatches(replay, context)
    || replay.receiptOperationId !== receiptOperationId
    || replay.targetConfirmationOperationId !== targetConfirmationOperationId) {
    fail(503, 'RECOVERY_INTENT_NO_COMPROMETIDO', 'No se pudo publicar atómicamente el recibo de recuperación.')
  }
  const legs = await tx.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`
    SELECT COUNT(*)::integer AS total FROM patas_operacion_conciliar
    WHERE operacion_conciliar_id=CAST(${receiptOperationId} AS uuid)
  `)
  if (legs.length !== 1 || Number(legs[0]?.total) !== replay.legCount) {
    fail(503, 'RECOVERY_RECIBO_INCONSISTENTE', 'El recibo recuperado no conserva todas sus patas.')
  }
}

async function assertRecoveryReadIdentityLiveTx(tx: Tx, identity: ConciliarRecoveryIdentity): Promise<void> {
  if (identity.actingSessionId === null) return
  const context = await trustedImpersonationContextResolutionFromRequest()
  if (context.status !== 'valid'
    || context.context.sessionId !== identity.actingSessionId
    || context.context.actorId !== identity.actorRealId
    || context.context.targetId !== identity.actorEffectiveId
    || context.context.method !== 'GET'
    || context.context.path !== CONCILIAR_PATH
    || context.context.action !== null
    || !impersonationRequestAllowed(context.context.path, context.context.method, new URLSearchParams(), context.context.targetId, context.context.action)) {
    fail(403, 'CONTEXTO_ACTUACION_CONCILIAR_INVALIDO', 'La sesión de actuación no permite consultar este recibo.')
  }
  // READ ONLY deliberately uses no row lock. It checks the current session,
  // actor and target in the same transaction snapshot without producing an
  // audit mutation or extending a session lease.
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT s.id::text AS id
      FROM impersonation_sessions s
      JOIN usuarios_admin actor ON actor.id=s.actor_id
      JOIN usuarios_admin target ON target.id=s.target_id
     WHERE s.id=CAST(${identity.actingSessionId} AS uuid)
       AND s.actor_id=${identity.actorRealId} AND s.target_id=${identity.actorEffectiveId}
       AND s.expires_at>CURRENT_TIMESTAMP
       AND NOT EXISTS (SELECT 1 FROM impersonation_session_ends e WHERE e.session_id=s.id)
       AND actor.activo=true AND actor.rol::text='SUPER_ADMIN'
       AND target.activo=true AND target.rol::text<>'SUPER_ADMIN'
       AND NOT ('SUPER_ADMIN'=ANY(COALESCE(target.roles,ARRAY[]::text[])))
     LIMIT 1
  `)
  if (rows.length !== 1) fail(403, 'CONTEXTO_ACTUACION_CONCILIAR_CADUCADO', 'La sesión de actuación ya no está activa.')
}

/** Exact, authenticated and transactionally READ ONLY lookup. Unknown is PENDING by design. */
export async function readConciliarRecoveryIntent(
  actorEffectiveId: number,
  lookup: ConciliarRecoveryLookup,
): Promise<ReturnType<typeof formatConciliarRecoveryResponse>> {
  const identity = await resolveConciliarRecoveryIdentity(actorEffectiveId)
  return db().$transaction(async base => {
    const tx = asTx(base)
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    await assertConciliarRuntime(tx)
    const access = await requireB4ActorAccess(actorEffectiveId, 'lectura', tx)
    if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'Tu permiso para consultar Conciliar ya no está vigente.')
    await assertRecoveryReadIdentityLiveTx(tx, identity)
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT idempotency_key::text AS "idempotencyKey",action,resolution,
        command_hash AS "commandHash",body_hash AS "bodyHash",request_hash AS "requestHash",
        actor_real_id AS "actorRealId",actor_effective_id AS "actorEffectiveId",
        acting_session_id::text AS "actingSessionId",selection_count AS "selectionCount",
        selection_hash AS "selectionHash",receipt_operation_id::text AS "receiptOperationId",
        target_confirmation_operation_id::text AS "targetConfirmationOperationId",leg_count AS "legCount"
      FROM area3_conciliar_recovery_intents
      WHERE actor_effective_id=${identity.actorEffectiveId}
        AND idempotency_key=CAST(${lookup.idempotencyKey} AS uuid)
        AND action=${lookup.action} AND body_hash=${lookup.bodyHash}
        AND actor_real_id=${identity.actorRealId}
        AND acting_session_id IS NOT DISTINCT FROM ${identity.actingSessionId ? Prisma.sql`CAST(${identity.actingSessionId} AS uuid)` : Prisma.sql`NULL`}
      LIMIT 1
    `)
    // A malformed/unknown row is deliberately indistinguishable from an
    // unproven result to the caller: it is PENDING and this READ ONLY callback
    // does not attempt repair, reconciliation or a terminal classification.
    const record = rows[0] ? rowToRecord(rows[0]) : null
    return formatConciliarRecoveryResponse(lookup, identity, record)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 })
}
