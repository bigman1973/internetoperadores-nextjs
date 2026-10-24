import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

const EXIT_PAYLOAD_HASH = 'c365b737507105e4e2fbd8400ea5aa21940c7440dccb5bce4b9d9e6c86c21b07'

/**
 * Requires two private, pre-existing staging identities supplied by the runner:
 *   IMPERSONATION_ACTOR_FILE  -> JSON or a text integer for a live SUPER_ADMIN
 *   IMPERSONATION_TARGET_FILE -> JSON or a text integer for a live non-super-admin
 *
 * It creates no users. Every ledger insert is inside one transaction which is
 * deliberately rolled back; the final query proves the synthetic source hash
 * is absent. Do not execute this script against production.
 */
const actorFile = process.env.IMPERSONATION_ACTOR_FILE
const targetFile = process.env.IMPERSONATION_TARGET_FILE

function privateId(file: string | undefined, label: string): number {
  if (!file) throw new Error(`${label}_FILE_REQUIRED`)
  const raw = readFileSync(file, 'utf8').trim()
  let value: unknown = raw
  try {
    const parsed: unknown = JSON.parse(raw)
    // A private file may hold {"id":n} or a plain integer; keep the number itself.
    value = typeof parsed === 'number' ? parsed : (parsed as { id?: unknown } | null)?.id
  } catch { /* text integer is accepted */ }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label}_INVALID`)
  return id
}

async function main(): Promise<void> {
  const actorId = privateId(actorFile, 'IMPERSONATION_ACTOR')
  const targetId = privateId(targetFile, 'IMPERSONATION_TARGET')
  if (actorId === targetId) throw new Error('IMPERSONATION_IDENTITIES_MUST_DIFFER')
  const sourceHash = randomBytes(32).toString('hex')
  const sessionId = randomUUID()
  const otherSessionId = randomUUID()
  const idempotencyKey = `rollback-${randomBytes(16).toString('hex')}`.slice(0, 64)

  const identity = await prisma.$queryRaw<Array<{ database_name: string; database_user: string }>>(Prisma.sql`
    SELECT current_database() AS database_name,current_user AS database_user LIMIT 1
  `)
  assert.deepEqual(identity, [{ database_name: 'io_staging_finanzas', database_user: 'io_staging_finanzas' }])

  const accounts = await prisma.$queryRaw<Array<{ id: number; activo: boolean; rol: string; roles: string[] }>>(Prisma.sql`
    SELECT id,activo,rol::text AS rol,roles
      FROM usuarios_admin
     WHERE id IN (${actorId},${targetId})
     ORDER BY id LIMIT 2
  `)
  assert.equal(accounts.length, 2, 'Las identidades privadas deben existir')
  const actor = accounts.find(account => account.id === actorId)
  const target = accounts.find(account => account.id === targetId)
  assert(actor?.activo && actor.rol === 'SUPER_ADMIN', 'El actor privado debe ser SUPER_ADMIN activo')
  assert(target?.activo && target.rol !== 'SUPER_ADMIN' && !(target.roles ?? []).includes('SUPER_ADMIN'), 'El destino privado no puede ser SUPER_ADMIN')

  try {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_sessions(id,actor_id,target_id,source_session_hash,idempotency_key,reason,started_at,expires_at)
        VALUES(${sessionId}::uuid,${actorId},${targetId},${sourceHash},${idempotencyKey},'Prueba reversible bajo rollback.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '59 minutes')
      `)
      const started = await tx.$queryRaw<Array<{ actor_id: number; target_id: number; expires_at: Date }>>(Prisma.sql`
        SELECT actor_id,target_id,expires_at FROM impersonation_sessions WHERE id=${sessionId}::uuid LIMIT 1 FOR SHARE
      `)
      assert.equal(started.length, 1)
      assert.equal(started[0].actor_id, actorId)
      assert.equal(started[0].target_id, targetId)
      assert(started[0].expires_at.getTime() > Date.now())

      // Absolute 60-minute ceiling is enforced by the database itself.
      await tx.$executeRawUnsafe('SAVEPOINT absolute_expiry')
      await assert.rejects(() => tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_sessions(id,actor_id,target_id,source_session_hash,idempotency_key,reason,started_at,expires_at)
        VALUES(gen_random_uuid(),${actorId},${targetId},${randomBytes(32).toString('hex')},${`rollback-${randomBytes(16).toString('hex')}`.slice(0, 64)},'Caducidad excesiva.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '61 minutes')
      `), 'Una actuación de más de 60 minutos debe rechazarse')
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT absolute_expiry')

      await tx.$executeRawUnsafe('SAVEPOINT ledger_immutable')
      await assert.rejects(() => tx.$executeRaw(Prisma.sql`
        UPDATE impersonation_sessions SET reason='forbidden' WHERE id=${sessionId}::uuid
      `))
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ledger_immutable')

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_session_ends(id,session_id,end_reason,ended_by_id,ended_at)
        VALUES(gen_random_uuid(),${sessionId}::uuid,'EXITED',${actorId},CURRENT_TIMESTAMP)
      `)
      const ended = await tx.$queryRaw<Array<{ end_reason: string }>>(Prisma.sql`
        SELECT end_reason FROM impersonation_session_ends WHERE session_id=${sessionId}::uuid LIMIT 1
      `)
      assert.deepEqual(ended, [{ end_reason: 'EXITED' }])

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_control_command_receipts
          (id,command,session_id,actor_id,idempotency_key,payload_hash,redirect_to,created_at)
        VALUES
          (gen_random_uuid(),'EXIT',${sessionId}::uuid,${actorId},${idempotencyKey},${EXIT_PAYLOAD_HASH},'/admin',CURRENT_TIMESTAMP)
      `)
      const receipt = await tx.$queryRaw<Array<{ session_id: string; actor_id: number; payload_hash: string; redirect_to: string }>>(Prisma.sql`
        SELECT session_id::text,actor_id,payload_hash,redirect_to
          FROM impersonation_control_command_receipts
         WHERE actor_id=${actorId} AND idempotency_key=${idempotencyKey} LIMIT 1 FOR SHARE
      `)
      assert.deepEqual(receipt, [{ session_id: sessionId, actor_id: actorId, payload_hash: EXIT_PAYLOAD_HASH, redirect_to: '/admin' }])

      await tx.$executeRawUnsafe('SAVEPOINT receipt_constraints')
      await assert.rejects(() => tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_control_command_receipts
          (id,command,session_id,actor_id,idempotency_key,payload_hash,redirect_to,created_at)
        VALUES
          (gen_random_uuid(),'EXIT',${sessionId}::uuid,${actorId},${idempotencyKey},${EXIT_PAYLOAD_HASH},'/admin',CURRENT_TIMESTAMP)
      `))
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT receipt_constraints')

      await tx.$executeRawUnsafe('SAVEPOINT receipt_immutable')
      await assert.rejects(() => tx.$executeRaw(Prisma.sql`
        UPDATE impersonation_control_command_receipts SET redirect_to='/other' WHERE actor_id=${actorId} AND idempotency_key=${idempotencyKey}
      `))
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT receipt_immutable')

      await tx.$executeRawUnsafe('SAVEPOINT restrictive_fk')
      await assert.rejects(() => tx.$executeRaw(Prisma.sql`
        DELETE FROM usuarios_admin WHERE id=${actorId}
      `))
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT restrictive_fk')

      await tx.$executeRawUnsafe('SAVEPOINT receipt_requires_exited_session')
      const otherSourceHash = randomBytes(32).toString('hex')
      const otherKey = `rollback-${randomBytes(16).toString('hex')}`.slice(0, 64)
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_sessions(id,actor_id,target_id,source_session_hash,idempotency_key,reason,started_at,expires_at)
        VALUES(${otherSessionId}::uuid,${actorId},${targetId},${otherSourceHash},${otherKey},'Prueba de recibo.',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '59 minutes')
      `)
      await assert.rejects(() => tx.$executeRaw(Prisma.sql`
        INSERT INTO impersonation_control_command_receipts
          (id,command,session_id,actor_id,idempotency_key,payload_hash,redirect_to,created_at)
        VALUES
          (gen_random_uuid(),'EXIT',${otherSessionId}::uuid,${actorId},${otherKey},${EXIT_PAYLOAD_HASH},'/admin',CURRENT_TIMESTAMP)
      `))
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT receipt_requires_exited_session')
      throw new Error('EXPECTED_ROLLBACK')
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000, maxWait: 10_000 })
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'EXPECTED_ROLLBACK') throw error
  }

  const absent = await prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*) AS count FROM impersonation_sessions WHERE source_session_hash=${sourceHash} LIMIT 1
  `)
  assert.equal(Number(absent[0]?.count ?? -1), 0, 'El ledger sintético debe haberse revertido por completo')
  console.log(JSON.stringify({ passed: true, stagingOnly: true, rollback: true, appendOnly: true, restrictiveForeignKeys: true, durableExitReceipt: true, identitiesFromPrivateFiles: true }))
}

main().catch(error => {
  console.error(`IMPERSONATION_POSTGRES_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}`)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
