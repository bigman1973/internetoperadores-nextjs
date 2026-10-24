/**
 * Pure regression for the delegated raw-SQL classifier (no DB, no dotenv):
 *   node_modules/.bin/tsx scripts/test-impersonation-sql-classifier.ts
 * It proves that the grammar needed by Modo fácil / Para pedir is accepted while
 * functions with side effects, session/DDL commands and lexical escapes stay
 * closed, and that the guard routes each kind to the right audit path.
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'
import prisma, { classifyPrisma5RawSqlStatement, guardPrismaImpersonationMutation, type RawSqlStatementKind } from '../lib/prisma'
import { resolveSignedImpersonationContext, signTrustedImpersonationContext, type TrustedImpersonationContext } from '../lib/impersonation-context'

const kind = (sql: string): RawSqlStatementKind => classifyPrisma5RawSqlStatement([sql])
const cases: Array<[string, RawSqlStatementKind]> = [
  // Accepted read grammar.
  ['SELECT COUNT(*) FILTER (WHERE x IN (1,2)) OVER () AS total FROM t', 'read_only'],
  ['SELECT x FROM t WHERE EXISTS (SELECT 1 FROM u WHERE u.id=t.id) AND (a OR b)', 'read_only'],
  ['WITH x AS (SELECT 1 AS n) SELECT COALESCE(SUM(n),0) FROM x', 'read_only'],
  ['SELECT current_database() AS database_name, current_user AS database_user LIMIT 1', 'read_only'],
  ['SELECT to_regclass(?) IS NOT NULL AS ready', 'read_only'],
  ["SELECT * FROM unnest(ARRAY[?, ?]::text[]) AS t(name)", 'read_only'],
  ['SELECT CAST(? AS numeric(12,2)) AS v, ?::numeric(12,2) AS w', 'read_only'],
  ["SELECT 'a; DELETE FROM x -- /*' AS literal", 'read_only'],
  ['SELECT b4_importe_bancario_centimos(m.importe) FROM movimientos_bancarios m WHERE m.id=$1', 'read_only'],
  ['(SELECT 1) UNION (SELECT 2)', 'read_only'],
  // Locks and the single transaction setting.
  ['SELECT id FROM t WHERE id=? FOR UPDATE', 'row_lock'],
  ['SELECT r.id FROM r JOIN o ON o.id=r.o FOR UPDATE OF r, o', 'row_lock'],
  ['SELECT s.id FROM s LIMIT 1 FOR SHARE OF s SKIP LOCKED', 'row_lock'],
  ['SELECT pg_advisory_xact_lock(hashtextextended(CAST(? AS text), 0))::text AS locked', 'advisory_lock'],
  ['SELECT pg_advisory_xact_lock(hashtextextended(?,0))::text AS locked', 'advisory_lock'],
  ['SET TRANSACTION READ ONLY', 'transaction_read_only'],
  // Writes keep the audited path.
  ['INSERT INTO t(a) VALUES (?) ON CONFLICT DO NOTHING RETURNING id', 'mutating'],
  ['WITH x AS (DELETE FROM t RETURNING id) SELECT * FROM x', 'mutating'],
  ['WITH x AS (SELECT 1) UPDATE t SET a=1', 'mutating'],
  // Closed: unreviewed functions, qualified/quoted calls, session commands, DDL.
  ["SELECT set_config('role','postgres',false)", 'unknown'],
  ['SELECT pg_advisory_lock(?)', 'unknown'],
  ['SELECT pg_advisory_xact_lock(?)', 'unknown'],
  ['SELECT nextval(?)', 'unknown'],
  ['SELECT pg_sleep(1)', 'unknown'],
  ["SELECT dblink('x','y')", 'unknown'],
  ["SELECT lo_import('/etc/passwd')", 'unknown'],
  ['SELECT public.b4_importe_bancario_centimos(1)', 'unknown'],
  ['SELECT "upper"(?)', 'unknown'],
  ['SELECT * FROM t AS x(nextval(?))', 'unknown'],
  ['SELECT ?::foo(1)', 'unknown'],
  ['SELECT id INTO copy_table FROM t', 'unknown'],
  ['SET TRANSACTION READ WRITE', 'unknown'],
  ["SET LOCAL lock_timeout='10s'", 'unknown'],
  ['SET LOCAL session_replication_role = replica', 'unknown'],
  ['SET CONSTRAINTS ALL DEFERRED', 'unknown'],
  ['RESET ALL', 'unknown'],
  ['CREATE TABLE x(a int)', 'unknown'],
  ['DROP TABLE x', 'unknown'],
  ['TRUNCATE impersonation_event_log', 'unknown'],
  ['LOCK TABLE t IN ACCESS EXCLUSIVE MODE', 'unknown'],
  ['SELECT 1; DELETE FROM t', 'unknown'],
  ['SELECT 1 -- comment', 'unknown'],
  ['SELECT /* c */ 1', 'unknown'],
  ["SELECT E'\\x41'", 'unknown'],
  ["SELECT U&'d\\0061t'", 'unknown'],
  ["SELECT 'a\\'; DELETE FROM t; --'", 'unknown'],
  ['SELECT $$x$$', 'unknown'],
  ['SELECT * FROM t TABLESAMPLE system(1)', 'unknown'],
  ['VALUES (1)', 'unknown'],
  ['EXPLAIN ANALYZE SELECT 1', 'unknown'],
  ['SELECT x FROM t FOR NOTHING', 'unknown'],
]

async function main(): Promise<void> {
  for (const [sql, expected] of cases) assert.equal(kind(sql), expected, sql)
  // pg_advisory_xact_lock returns void, which Prisma $queryRaw cannot
  // deserialize ($executeRaw returns only a row count and is unaffected).
  // Every $queryRaw occurrence must therefore end in ::text.
  const sources = ['lib/impersonation.ts', ...readdirSync('lib/finanzas').filter(name => name.endsWith('.ts')).map(name => join('lib/finanzas', name))]
  let advisoryLocks = 0
  for (const file of sources) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/pg_advisory_xact_lock\(hashtextextended\(/g)) {
      const head = text.slice(Math.max(0, match.index! - 120), match.index!)
      const call = /\$(queryRaw|executeRaw)(?:Unsafe)?[^$]*$/.exec(head)?.[1]
      if (call !== 'queryRaw') continue
      advisoryLocks += 1
      const tail = text.slice(match.index!, match.index! + 260)
      // Either cast the void to text or select a real column FROM the lock.
      const castsToText = /^pg_advisory_xact_lock\(hashtextextended\([^\n]*?,\s*0\)\)::text AS locked/.test(tail)
      const selectsColumn = /SELECT\s+1\s+AS\s+locked\s+FROM\s*$/i.test(text.slice(Math.max(0, match.index! - 40), match.index!))
      assert.ok(castsToText || selectsColumn, `${file}: bloqueo consultivo sin ::text`)
    }
  }
  assert.ok(advisoryLocks >= 2, 'advisory lock scan found no source')
  // Bound values are data, never grammar.
  assert.equal(classifyPrisma5RawSqlStatement([Prisma.sql`SELECT id FROM t WHERE x=${'1; DROP TABLE t; SELECT pg_sleep(9)'}`]), 'read_only')
  assert.equal(classifyPrisma5RawSqlStatement([['SELECT id FROM t WHERE x=', ''], 'DELETE FROM t']), 'read_only')
  assert.equal(classifyPrisma5RawSqlStatement([{ strings: 'SELECT 1' }]), 'unknown')

  const previousSecret = process.env.NEXTAUTH_SECRET
  process.env.NEXTAUTH_SECRET = 'pure-sql-classifier-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  try {
    const base: TrustedImpersonationContext = { v: 'v1', sessionId: '8f2cae1d-2a25-4c66-8f5c-2d4ce6e2f1f3', actorId: 101, targetId: 202, reason: null, method: 'POST', path: '/api/admin/finanzas/modo-facil/terceros', action: 'confirmar', ip: null, ipSource: 'untrusted_proxy' }
    const valid = resolveSignedImpersonationContext(signTrustedImpersonationContext(base))
    assert.equal(valid.status, 'valid')
    const tx = { pure: true } as unknown as Prisma.TransactionClient
    const run = async (sql: string, transaction: Prisma.TransactionClient | null, live = true) => {
      const calls = { next: 0, verify: 0, append: 0 }
      let error: string | null = null
      try {
        await guardPrismaImpersonationMutation({ action: 'queryRaw', args: [sql], model: null }, async () => { calls.next += 1; return [] }, {
          requestContext: valid, transaction,
          verifyLiveContext: async () => { calls.verify += 1; return live },
          appendSuccess: async () => { calls.append += 1 },
        })
      } catch (caught) { error = caught instanceof Error ? caught.message : 'UNKNOWN' }
      return { ...calls, error }
    }
    // Plain read: no verifier, no receipt, no transaction required.
    assert.deepEqual(await run('SELECT COUNT(*) FROM t', null), { next: 1, verify: 0, append: 0, error: null })
    // Locks: transaction + live verification, never a business receipt.
    assert.deepEqual(await run('SELECT id FROM t FOR UPDATE', tx), { next: 1, verify: 1, append: 0, error: null })
    assert.deepEqual(await run('SELECT id FROM t FOR UPDATE', null), { next: 0, verify: 0, append: 0, error: 'IMPERSONATION_WRITE_TRANSACTION_REQUIRED' })
    assert.deepEqual(await run('SELECT pg_advisory_xact_lock(hashtextextended(CAST(? AS text),0))::text AS locked', tx, false), { next: 0, verify: 1, append: 0, error: 'IMPERSONATION_WRITE_DENIED' })
    // READ ONLY: only inside a transaction, no verifier (FOR SHARE is illegal there).
    assert.deepEqual(await run('SET TRANSACTION READ ONLY', tx), { next: 1, verify: 0, append: 0, error: null })
    assert.deepEqual(await run('SET TRANSACTION READ ONLY', null), { next: 0, verify: 0, append: 0, error: 'IMPERSONATION_WRITE_TRANSACTION_REQUIRED' })
    // Writes: verifier + exactly one SUCCESS receipt.
    assert.deepEqual(await run('INSERT INTO t(a) VALUES (?) RETURNING id', tx), { next: 1, verify: 1, append: 1, error: null })
    // Unknown never executes.
    assert.deepEqual(await run("SELECT set_config('role','x',false)", tx), { next: 0, verify: 0, append: 0, error: 'IMPERSONATION_RAW_SQL_UNREVIEWED' })
    // A tampered MAC is never downgraded to ordinary traffic, even for reads.
    const tampered = resolveSignedImpersonationContext('v1.invalid.invalid')
    assert.equal(tampered.status, 'invalid')
    await assert.rejects(() => guardPrismaImpersonationMutation({ action: 'queryRaw', args: ['SELECT 1'], model: null }, async () => [], { requestContext: tampered, transaction: null }), /IMPERSONATION_WRITE_CONTEXT_INVALID/)
  } finally {
    if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previousSecret
  }
  console.log(JSON.stringify({ passed: true, databaseOperations: 0, classifierCases: cases.length, guardRoutingCases: 9 }))
}

main().catch(error => { console.error(`SQL_CLASSIFIER_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}`); process.exitCode = 1 }).finally(() => prisma.$disconnect())
