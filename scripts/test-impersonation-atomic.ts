/*
 * Impersonation Prisma guard — pure checks plus an opt-in PostgreSQL rollback
 * fixture. The default invocation performs no database operation:
 *
 *   pnpm exec tsx scripts/test-impersonation-atomic.ts
 *
 * The PostgreSQL phase is intentionally not run by default. It requires prior
 * review/application of the impersonation-ledger DDL and private existing IDs:
 *
 *   FINANCE_STAGING_SANDBOX=1 VERCEL_ENV=preview \
 *   FINANCE_EXTERNAL_ACTIONS_DISABLED=1 IMPERSONATION_ATOMIC_STAGING_ROLLBACK=1 \
 *   IMPERSONATION_ATOMIC_ACTOR_FILE=/private/actor-0600 \
 *   IMPERSONATION_ATOMIC_TARGET_FILE=/private/target-0600 \
 *   pnpm exec tsx scripts/test-impersonation-atomic.ts --staging-rollback
 *
 * No users, account, e-mail, external service, DDL, or persistent test data is
 * created. The optional phase uses existing private identities and one existing
 * bank-movement FK only; every inserted session, business receipt and event is
 * inside a transaction deliberately rolled back.
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { Prisma, PrismaClient } from '@prisma/client'
import prisma, {
  classifyPrisma5RawSqlArgs,
  currentImpersonationTransactionClient,
  guardPrismaImpersonationMutation,
  installImpersonationPrismaGuard,
} from '../lib/prisma'
import {
  parseSignedImpersonationContext,
  resolveSignedImpersonationContext,
  signTrustedImpersonationContext,
  type SignedImpersonationContextResolution,
  type TrustedImpersonationContext,
} from '../lib/impersonation-context'

const STAGING_FLAG = '--staging-rollback'
const TEST_SECRET = 'impersonation-atomic-script-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

class ExpectedRollback extends Error {
  constructor() { super('IMPERSONATION_ATOMIC_EXPECTED_ROLLBACK') }
}

type Tx = Prisma.TransactionClient

function contextFor(sessionId: string, actorId = 101, targetId = 202): TrustedImpersonationContext {
  return {
    v: 'v1',
    sessionId,
    actorId,
    targetId,
    reason: 'Prueba reversible de la guarda transaccional.',
    method: 'POST',
    path: '/api/admin/finanzas/modo-facil/terceros',
    action: 'confirmar',
    ip: null,
    ipSource: 'untrusted_proxy',
  }
}

async function withTestSecret<T>(callback: () => Promise<T> | T): Promise<T> {
  const previous = process.env.NEXTAUTH_SECRET
  process.env.NEXTAUTH_SECRET = TEST_SECRET
  try {
    return await callback()
  } finally {
    if (previous === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previous
  }
}

function requireValidResolution(value: string): Extract<SignedImpersonationContextResolution, { status: 'valid' }> {
  const resolution = resolveSignedImpersonationContext(value)
  assert.equal(resolution.status, 'valid', 'El contexto firmado de la prueba debe superar HMAC y esquema sin next/headers.')
  if (resolution.status !== 'valid') throw new Error('IMPERSONATION_TEST_CONTEXT_NOT_VALID')
  return resolution
}

function tamper(value: string): string {
  const last = value.at(-1)
  assert(last)
  return `${value.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`
}

async function pureSignedContextAndGuardTests(): Promise<void> {
  const sessionId = '8f2cae1d-2a25-4c66-8f5c-2d4ce6e2f1f3'
  const signed = signTrustedImpersonationContext(contextFor(sessionId))
  const valid = requireValidResolution(signed)
  assert.deepEqual(parseSignedImpersonationContext(signed), valid.context, 'El parser debe devolver exactamente el payload HMAC válido.')

  const invalid = resolveSignedImpersonationContext(tamper(signed))
  assert.deepEqual(invalid, { status: 'invalid' }, 'Un MAC alterado no puede degradarse a tráfico normal.')
  assert.deepEqual(resolveSignedImpersonationContext(null), { status: 'absent' }, 'Sólo la ausencia real del header es tráfico no actuando.')

  // Exact Prisma 5 $use form: [TemplateStringsArray/string-parts, ...boundValues].
  // A parameter that happens to contain a write keyword is data, not grammar.
  assert.equal(classifyPrisma5RawSqlArgs([['INSERT INTO receipt(value) VALUES (', ') RETURNING id'], 'DELETE FROM elsewhere']), 'mutating')
  assert.equal(classifyPrisma5RawSqlArgs(['UPDATE receipt SET value=$1', 'not SQL']), 'mutating')
  assert.equal(classifyPrisma5RawSqlArgs([['SELECT id FROM receipt WHERE value=', ''], 'DELETE FROM elsewhere']), 'read_only')
  assert.equal(classifyPrisma5RawSqlArgs([['WITH candidate AS (SELECT 1) INSERT INTO receipt(value) SELECT * FROM candidate RETURNING id']]), 'mutating')
  // A read-only CTE using no function is a plain read; a data-modifying CTE stays a write.
  assert.equal(classifyPrisma5RawSqlArgs([['WITH candidate AS (SELECT 1) SELECT * FROM candidate']]), 'read_only')
  assert.equal(classifyPrisma5RawSqlArgs([['WITH candidate AS (DELETE FROM receipt RETURNING id) SELECT * FROM candidate']]), 'mutating')
  assert.equal(classifyPrisma5RawSqlArgs([['SELECT pg_advisory_xact_lock(', ')'], 1]), 'unknown')
  assert.equal(classifyPrisma5RawSqlArgs([['SELECT unreviewed_function(', ')'], 'argument']), 'unknown')
  assert.equal(classifyPrisma5RawSqlArgs({ strings: ['INSERT INTO receipt VALUES (', ')'] }), 'unknown')

  const tx = { marker: 'pure-transaction-client' } as unknown as Tx
  let nextCalls = 0
  let verifierCalls = 0
  let appendCalls = 0
  const verify = async (context: TrustedImpersonationContext, actualTx: Tx) => {
    verifierCalls += 1
    assert.equal(context.sessionId, sessionId)
    assert.equal(actualTx, tx)
    return true
  }
  const append = async (actualTx: Tx, context: TrustedImpersonationContext, model: string | undefined, action: string) => {
    appendCalls += 1
    assert.equal(actualTx, tx)
    assert.equal(context.sessionId, sessionId)
    assert.equal(model, undefined)
    assert.equal(action, 'queryRaw')
  }

  const writeParams = {
    action: 'queryRaw',
    args: [['INSERT INTO decisiones_tercero_modo_facil(value) VALUES (', ') RETURNING id'], 'bound-value'],
    model: null,
  }
  await guardPrismaImpersonationMutation(writeParams, async () => {
    nextCalls += 1
    return 'business-result'
  }, { requestContext: valid, transaction: tx, verifyLiveContext: verify, appendSuccess: append })
  assert.deepEqual({ nextCalls, verifierCalls, appendCalls }, { nextCalls: 1, verifierCalls: 1, appendCalls: 1 })

  await assert.rejects(
    () => guardPrismaImpersonationMutation(writeParams, async () => {
      nextCalls += 1
      return 'must-not-run'
    }, { requestContext: invalid, transaction: tx, verifyLiveContext: verify, appendSuccess: append }),
    /IMPERSONATION_WRITE_CONTEXT_INVALID/,
  )
  assert.deepEqual({ nextCalls, verifierCalls, appendCalls }, { nextCalls: 1, verifierCalls: 1, appendCalls: 1 }, 'MAC inválido debe denegar antes de DML, ledger o recibo.')

  // Absence is normal non-acting traffic; invalidity is not. This distinction is
  // important because scripts/background work have no request headers at all.
  await guardPrismaImpersonationMutation(writeParams, async () => {
    nextCalls += 1
    return 'normal-request-result'
  }, { requestContext: { status: 'absent' }, transaction: null, verifyLiveContext: verify, appendSuccess: append })
  assert.deepEqual({ nextCalls, verifierCalls, appendCalls }, { nextCalls: 2, verifierCalls: 1, appendCalls: 1 })

  // A deliberately tiny SELECT grammar is allowed under a valid acting context,
  // but it is only a read: no live-write verification and no SUCCESS receipt.
  await guardPrismaImpersonationMutation({
    action: 'queryRaw', args: [['SELECT id FROM decisiones_tercero_modo_facil WHERE id=', ''], randomUUID()], model: null,
  }, async () => {
    nextCalls += 1
    return 'read-result'
  }, { requestContext: valid, transaction: tx, verifyLiveContext: verify, appendSuccess: append })
  assert.deepEqual({ nextCalls, verifierCalls, appendCalls }, { nextCalls: 3, verifierCalls: 1, appendCalls: 1 }, 'Una lectura no puede contarse como BUSINESS_MUTATION/SUCCESS.')

  await assert.rejects(
    () => guardPrismaImpersonationMutation({
      action: 'queryRaw', args: [['SELECT pg_advisory_xact_lock(', ')'], 1], model: null,
    }, async () => {
      nextCalls += 1
      return 'must-not-run'
    }, { requestContext: valid, transaction: tx, verifyLiveContext: verify, appendSuccess: append }),
    /IMPERSONATION_RAW_SQL_UNREVIEWED/,
  )
  assert.deepEqual({ nextCalls, verifierCalls, appendCalls }, { nextCalls: 3, verifierCalls: 1, appendCalls: 1 }, 'SELECT con función/efecto posible debe cerrar, no contar como lectura normal.')

  await assert.rejects(
    () => guardPrismaImpersonationMutation(writeParams, async () => {
      nextCalls += 1
      return 'must-not-run'
    }, {
      requestContext: valid,
      transaction: tx,
      verifyLiveContext: async () => false, // representa sesión expirada/revocada en la relectura viva
      appendSuccess: append,
    }),
    /IMPERSONATION_WRITE_DENIED/,
  )
  assert.deepEqual({ nextCalls, verifierCalls, appendCalls }, { nextCalls: 3, verifierCalls: 1, appendCalls: 1 }, 'Una relectura viva fallida no ejecuta ni audita éxito.')
}

/** A no-DB harness verifying that installation state belongs to each client. */
async function pureInstallationAndNestedTransactionTests(): Promise<void> {
  type CapturedMiddleware = (params: any, next: (params: any) => Promise<unknown>) => Promise<unknown>
  type FakeClient = PrismaClient & {
    registered: CapturedMiddleware[]
    callbackTransactions: number
  }
  const fakeClient = (): FakeClient => {
    const client = {
      registered: [] as CapturedMiddleware[],
      callbackTransactions: 0,
      $use(middleware: CapturedMiddleware) { this.registered.push(middleware) },
      $transaction(input: unknown) {
        if (typeof input !== 'function') return input
        this.callbackTransactions += 1
        const tx = { transactionNumber: this.callbackTransactions } as unknown as Tx
        return input(tx)
      },
    }
    return client as unknown as FakeClient
  }

  const first = fakeClient()
  const second = fakeClient()
  installImpersonationPrismaGuard(first)
  installImpersonationPrismaGuard(first)
  installImpersonationPrismaGuard(second)
  assert.equal(first.registered.length, 1, 'La misma instancia recibe el middleware exactamente una vez.')
  assert.equal(second.registered.length, 1, 'Una segunda instancia no hereda un flag global y queda sin middleware.')

  await (first.$transaction as any)(async (outer: Tx) => {
    assert.equal(currentImpersonationTransactionClient(), outer)
    await (first.$transaction as any)(async (inner: Tx) => {
      assert.equal(currentImpersonationTransactionClient(), inner, 'La transacción anidada domina su callback.')
    })
    assert.equal(currentImpersonationTransactionClient(), outer, 'Al salir de la anidada se restaura el cliente exterior.')
  })
  assert.equal(currentImpersonationTransactionClient(), null, 'No queda cliente transaccional en ALS después del callback.')
  assert.equal(first.callbackTransactions, 2, 'Cada callback de transacción llega una vez al cliente subyacente.')

  // This is a real Prisma 5 client/$use pipeline, but its final middleware does
  // not call next(), so Prisma never opens a connection or issues SQL. It proves
  // the installed guard sees each raw call once and preserves Prisma 5 args.
  const probe = new PrismaClient({
    datasources: { db: { url: 'postgresql://unused:unused@127.0.0.1:1/unused' } },
  })
  const seen: Array<{ action: string; args: unknown }> = []
  try {
    installImpersonationPrismaGuard(probe)
    installImpersonationPrismaGuard(probe)
    probe.$use(async (params) => {
      seen.push({ action: params.action, args: params.args })
      return []
    })
    await probe.$queryRawUnsafe('SELECT 1')
    await probe.$queryRaw(Prisma.sql`INSERT INTO ignored_table(value) VALUES (${'bound value'}) RETURNING id`)
    assert.equal(seen.length, 2, 'Cada llamada raw cruza exactamente una vez el middleware Prisma real.')
    assert.deepEqual(seen[0], { action: 'queryRaw', args: ['SELECT 1'] })
    assert.equal(seen[1]?.action, 'queryRaw')
    assert.equal(Array.isArray(seen[1]?.args), true)
    const sqlArgument = (seen[1]?.args as Array<{ strings?: unknown; values?: unknown }>)[0]
    assert.equal(typeof sqlArgument, 'object')
    assert.deepEqual(sqlArgument.strings, [
      'INSERT INTO ignored_table(value) VALUES (', ') RETURNING id',
    ], 'Prisma 5 puede pasar [Prisma.Sql] para este overload; sus values no se usan como SQL.')
    assert.deepEqual(sqlArgument.values, ['bound value'])
    assert.equal(classifyPrisma5RawSqlArgs(seen[1]?.args), 'mutating', 'La forma capturada del middleware Prisma real debe activar la guarda.')
  } finally {
    await probe.$disconnect()
  }
}

function privateId(file: string | undefined, label: string): number {
  assert(file, `${label}_FILE_REQUIRED`)
  const stat = lstatSync(file)
  assert(stat.isFile() && !stat.isSymbolicLink(), `${label}_FILE_NOT_REGULAR`)
  assert.equal(stat.mode & 0o777, 0o600, `${label}_FILE_MUST_BE_0600`)
  assert.equal(stat.uid, process.getuid?.(), `${label}_FILE_MUST_BE_OWNED_BY_CURRENT_USER`)
  const raw = readFileSync(file, 'utf8').trim()
  let value: unknown = raw
  try {
    const parsed: unknown = JSON.parse(raw)
    // A private file may hold {"id":n} or a plain integer; keep the number itself.
    value = typeof parsed === 'number' ? parsed : (parsed as { id?: unknown } | null)?.id
  } catch { /* text integer is accepted */ }
  const id = Number(value)
  assert(Number.isSafeInteger(id) && id > 0, `${label}_INVALID`)
  return id
}

function assertRollbackStagingEnvironment(): void {
  assert.equal(process.env.IMPERSONATION_ATOMIC_STAGING_ROLLBACK, '1', 'IMPERSONATION_ATOMIC_STAGING_ROLLBACK=1 es obligatorio.')
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio.')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'FINANCE_EXTERNAL_ACTIONS_DISABLED=1 es obligatorio.')
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'Este test no se puede ejecutar en producción.')
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(url.pathname, '/io_staging_finanzas', 'La URL debe apuntar sólo a io_staging_finanzas.')
  assert.equal(decodeURIComponent(url.username), 'io_staging_finanzas', 'El usuario DB debe ser el rol staging limitado.')
}

async function assertStagingTables(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ name: string | null }>>(Prisma.sql`
    SELECT to_regclass('public.impersonation_sessions')::text AS name
    UNION ALL SELECT to_regclass('public.impersonation_event_log')::text
    UNION ALL SELECT to_regclass('public.decisiones_tercero_modo_facil')::text
    LIMIT 3
  `)
  assert.equal(rows.length, 3)
  assert(rows.every(row => row.name), 'Prerequisito ausente: aplicar/revisar DDL de ledger y recibo P1 antes del test PostgreSQL.')
}

async function insertSession(
  tx: Tx,
  input: Readonly<{ sessionId: string; actorId: number; targetId: number; sourceHash: string; expired?: boolean }>,
): Promise<void> {
  if (input.expired) {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO impersonation_sessions(id,actor_id,target_id,source_session_hash,idempotency_key,reason,started_at,expires_at)
      VALUES(${input.sessionId}::uuid,${input.actorId},${input.targetId},${input.sourceHash},${`expired-${randomBytes(20).toString('hex')}`.slice(0, 64)},
        'Prueba reversible: sesión expirada.',CURRENT_TIMESTAMP - INTERVAL '2 hours',CURRENT_TIMESTAMP - INTERVAL '1 hour')
    `)
    return
  }
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO impersonation_sessions(id,actor_id,target_id,source_session_hash,idempotency_key,reason,started_at,expires_at)
    VALUES(${input.sessionId}::uuid,${input.actorId},${input.targetId},${input.sourceHash},${`atomic-${randomBytes(20).toString('hex')}`.slice(0, 64)},
      'Prueba reversible: auditoría atómica Prisma.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '45 minutes')
  `)
}

function businessInsert(tx: Tx, movementId: string, actorId: number, marker: string) {
  return tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO decisiones_tercero_modo_facil
      (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
    VALUES
      (gen_random_uuid(),${movementId},${actorId},'CONFIRMADA'::"EstadoDecisionTerceroModoFacil",'BANCO'::"TipoTerceroModoFacil",'CUENTA_PROPIA_ACTUAL'::"OrigenTerceroModoFacil",
       ${HASH_A},${randomUUID()}::uuid,${HASH_B},NULL,
       jsonb_build_object('schema','EASY_COUNTERPARTY_RECEIPT_V1','testMarker',${marker}),CURRENT_TIMESTAMP)
    RETURNING id::text
  `)
}

function businessInsertMiddlewareArgs(movementId: string, actorId: number, marker: string): unknown[] {
  // Exact Prisma 5 $use shape: template string-parts first and bound values after.
  // The values deliberately are not SQL classifier input.
  return [[
    'INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at) VALUES (gen_random_uuid(),',
    ",'CONFIRMADA'::\"EstadoDecisionTerceroModoFacil\",'BANCO'::\"TipoTerceroModoFacil\",'CUENTA_PROPIA_ACTUAL'::\"OrigenTerceroModoFacil\",",
    ',',
    ',::uuid,',
    ',NULL,jsonb_build_object(\'schema\',\'EASY_COUNTERPARTY_RECEIPT_V1\',\'testMarker\',', '),CURRENT_TIMESTAMP) RETURNING id::text',
  ], movementId, actorId, HASH_A, randomUUID(), HASH_B, marker]
}

async function existingMovementId(tx: Tx): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM movimientos_bancarios ORDER BY created_at ASC,id ASC LIMIT 1 FOR KEY SHARE
  `)
  assert(rows[0]?.id, 'Se necesita un movimiento bancario existente sólo como FK para el recibo reversible.')
  return rows[0].id
}

async function assertPrivateIdentities(tx: Tx, actorId: number, targetId: number): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: number; activo: boolean; rol: string; roles: string[] | null }>>(Prisma.sql`
    SELECT id,activo,rol::text AS rol,roles FROM usuarios_admin WHERE id IN (${actorId},${targetId}) ORDER BY id LIMIT 2 FOR SHARE
  `)
  assert.equal(rows.length, 2, 'Las identidades privadas deben existir.')
  const actor = rows.find(row => row.id === actorId)
  const target = rows.find(row => row.id === targetId)
  assert(actor?.activo && actor.rol === 'SUPER_ADMIN', 'El actor privado debe ser SUPER_ADMIN activo.')
  assert(target?.activo && target.rol !== 'SUPER_ADMIN' && !(target.roles ?? []).includes('SUPER_ADMIN'), 'El destino privado debe ser activo y no SUPER_ADMIN.')
}

async function assertAbsentAfterRollback(input: Readonly<{ sessionIds: string[]; decisionIds: string[] }>): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ sessions: bigint | number; decisions: bigint | number; events: bigint | number }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM impersonation_sessions WHERE id IN (${Prisma.join(input.sessionIds.map(id => Prisma.sql`${id}::uuid`))})) AS sessions,
      (SELECT COUNT(*) FROM decisiones_tercero_modo_facil WHERE id IN (${Prisma.join(input.decisionIds.map(id => Prisma.sql`${id}::uuid`))})) AS decisions,
      (SELECT COUNT(*) FROM impersonation_event_log WHERE session_id IN (${Prisma.join(input.sessionIds.map(id => Prisma.sql`${id}::uuid`))})) AS events
    LIMIT 1
  `)
  assert.equal(Number(rows[0]?.sessions ?? -1), 0, 'El ledger de prueba debe revertirse.')
  assert.equal(Number(rows[0]?.decisions ?? -1), 0, 'El INSERT RETURNING de negocio debe revertirse.')
  assert.equal(Number(rows[0]?.events ?? -1), 0, 'El BUSINESS_MUTATION/SUCCESS debe revertirse con el negocio.')
}

async function stagingRollbackAtomicityTest(): Promise<void> {
  assertRollbackStagingEnvironment()
  const actorId = privateId(process.env.IMPERSONATION_ATOMIC_ACTOR_FILE, 'IMPERSONATION_ATOMIC_ACTOR')
  const targetId = privateId(process.env.IMPERSONATION_ATOMIC_TARGET_FILE, 'IMPERSONATION_ATOMIC_TARGET')
  assert.notEqual(actorId, targetId, 'Actor y destino privados deben ser distintos.')

  const identity = await prisma.$queryRaw<Array<{ database_name: string; database_user: string }>>(Prisma.sql`
    SELECT current_database() AS database_name,current_user AS database_user LIMIT 1
  `)
  assert.deepEqual(identity, [{ database_name: 'io_staging_finanzas', database_user: 'io_staging_finanzas' }])
  await assertStagingTables()

  const expiredSessionId = randomUUID()
  const successSessionId = randomUUID()
  const failedEventSessionId = randomUUID()
  const marker = `IMPERSONATION-ATOMIC-ROLLBACK-${randomUUID()}`
  let successDecisionId = ''
  let failedEventDecisionId = ''

  try {
    await prisma.$transaction(async tx => {
      assert.equal(currentImpersonationTransactionClient(), tx, 'El wrapper de $transaction debe publicar el mismo TransactionClient en ALS.')
      await assertPrivateIdentities(tx, actorId, targetId)
      const movementId = await existingMovementId(tx)
      await insertSession(tx, { sessionId: expiredSessionId, actorId, targetId, sourceHash: randomBytes(32).toString('hex'), expired: true })
      await insertSession(tx, { sessionId: successSessionId, actorId, targetId, sourceHash: randomBytes(32).toString('hex') })

      const expiredSigned = signTrustedImpersonationContext(contextFor(expiredSessionId, actorId, targetId))
      const expiredContext = requireValidResolution(expiredSigned)
      let expiredNextCalled = false
      await assert.rejects(
        () => guardPrismaImpersonationMutation({
          action: 'queryRaw', args: businessInsertMiddlewareArgs(movementId, targetId, `${marker}-expired`), model: null,
        }, async () => {
          expiredNextCalled = true
          return businessInsert(tx, movementId, targetId, `${marker}-expired`)
        }, { requestContext: expiredContext, transaction: tx }),
        /IMPERSONATION_WRITE_DENIED/,
      )
      assert.equal(expiredNextCalled, false, 'Una sesión expirada no alcanza el INSERT RETURNING.')

      const signed = signTrustedImpersonationContext(contextFor(successSessionId, actorId, targetId))
      const context = requireValidResolution(signed)
      const rawArgs = businessInsertMiddlewareArgs(movementId, targetId, marker)
      assert.equal(classifyPrisma5RawSqlArgs(rawArgs), 'mutating', 'El shape de Prisma 5 debe reconocer INSERT RETURNING con parámetros.')
      const result = await guardPrismaImpersonationMutation({ action: 'queryRaw', args: rawArgs, model: null }, async () => {
        return businessInsert(tx, movementId, targetId, marker)
      }, { requestContext: context, transaction: tx })
      successDecisionId = result[0]?.id ?? ''
      assert(successDecisionId, 'INSERT RETURNING no devolvió la decisión de negocio.')

      const events = await tx.$queryRaw<Array<{ id: string; kind: string; outcome: string; model: string; operation: string }>>(Prisma.sql`
        SELECT id::text,kind,outcome,model,operation FROM impersonation_event_log
        WHERE session_id=${successSessionId}::uuid ORDER BY created_at ASC,id ASC LIMIT 2
      `)
      assert.deepEqual(events.map(event => ({ kind: event.kind, outcome: event.outcome, model: event.model, operation: event.operation })), [
        { kind: 'BUSINESS_MUTATION', outcome: 'SUCCESS', model: 'RAW', operation: 'queryRaw' },
      ], 'El éxito auditado sólo existe después del INSERT RETURNING y antes del mismo commit.')
      throw new ExpectedRollback()
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000, maxWait: 10_000 })
  } catch (error) {
    if (!(error instanceof ExpectedRollback)) throw error
  }
  await assertAbsentAfterRollback({ sessionIds: [expiredSessionId, successSessionId], decisionIds: [successDecisionId] })

  // Independently fail the actual event-table INSERT. The business INSERT has
  // already returned, but the callback transaction must still roll it back.
  await assert.rejects(
    () => prisma.$transaction(async tx => {
      await assertPrivateIdentities(tx, actorId, targetId)
      const movementId = await existingMovementId(tx)
      await insertSession(tx, { sessionId: failedEventSessionId, actorId, targetId, sourceHash: randomBytes(32).toString('hex') })
      const context = requireValidResolution(signTrustedImpersonationContext(contextFor(failedEventSessionId, actorId, targetId)))
      const result = await guardPrismaImpersonationMutation({
        action: 'queryRaw', args: businessInsertMiddlewareArgs(movementId, targetId, `${marker}-event-failure`), model: null,
      }, async () => {
        const business = await businessInsert(tx, movementId, targetId, `${marker}-event-failure`)
        failedEventDecisionId = business[0]?.id ?? ''
        return business
      }, {
        requestContext: context,
        transaction: tx,
        appendSuccess: async eventTx => {
          // `BUSINESS_MUTATION` permits only SUCCESS by the reviewed DB check.
          // This is a real database event INSERT failure, not a mocked throw.
          await eventTx.$executeRaw(Prisma.sql`
            INSERT INTO impersonation_event_log
              (id,session_id,actor_id,target_id,kind,outcome,method,path,ip,reason,model,operation,detail,created_at)
            VALUES
              (gen_random_uuid(),${failedEventSessionId}::uuid,${actorId},${targetId},'BUSINESS_MUTATION','FAILED',
               'POST','/api/admin/finanzas/modo-facil/terceros',NULL,'Prueba reversible de fallo de evento.','RAW','queryRaw','{}'::jsonb,CURRENT_TIMESTAMP)
          `)
        },
      })
      assert.equal(result[0]?.id, failedEventDecisionId)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000, maxWait: 10_000 }),
    /check constraint|impersonation_event_business_success_ck|Failed to execute query/i,
  )
  assert(failedEventDecisionId, 'El negocio debe haber llegado a devolver id antes del fallo de recibo.')
  await assertAbsentAfterRollback({ sessionIds: [failedEventSessionId], decisionIds: [failedEventDecisionId] })
}

async function main(): Promise<void> {
  const staging = process.argv.includes(STAGING_FLAG)
  await withTestSecret(async () => {
    await pureSignedContextAndGuardTests()
    await pureInstallationAndNestedTransactionTests()
    if (staging) await stagingRollbackAtomicityTest()
  })
  console.log(JSON.stringify({
    passed: true,
    pure: true,
    signedContextHmacWithoutNextHeaders: true,
    prisma5RawArgs: true,
    invalidMacWriteFailClosed: true,
    unreviewedRawDeniedWhileActing: true,
    nestedTransactionAls: true,
    stagingRollbackExecuted: staging,
    ...(staging
      ? { stagingOnly: true, businessAndSuccessEventRollbackTogether: true, eventInsertFailureRollsBackBusiness: true }
      : { postgresAtomicity: 'not_run_no_database_fixture_claim' }),
  }))
}

main().catch(error => {
  console.error(`IMPERSONATION_ATOMIC_TEST_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}`)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
