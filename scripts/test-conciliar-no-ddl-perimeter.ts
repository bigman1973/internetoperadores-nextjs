import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readBankInvoicingPopulation } from '../lib/finanzas/conciliar-bank-invoicing-db'
import { conciliarDocumentSourceGuardBatchSql } from '../lib/finanzas/conciliar-document-source-guard'

const root = process.cwd()
const text = (p: string) => readFileSync(path.join(root, p), 'utf8')
const forbidden = /document_version_[a-z_]+|area3_conciliar_projection_changes|area3_conciliar_recovery_intents|area3_received_document_hashes|\bread_metadata\b|\bread_accounts\b/
const files = [
  'app/admin/finanzas/conciliar/page.tsx', 'app/api/admin/finanzas/conciliar/route.ts',
  'lib/finanzas/conciliar-actions.ts', 'lib/finanzas/conciliar-db.ts', 'lib/finanzas/conciliar-projection-read.ts',
  'lib/finanzas/conciliar-bank-invoicing-db.ts', 'lib/finanzas/para-pedir-projection-read.ts',
  'lib/finanzas/conciliar-affected-refresh.ts', 'lib/finanzas/conciliar-refresh.ts',
  'lib/finanzas/conciliar-document-source-guard.ts', 'lib/finanzas/area3-review-document-evidence.ts',
]
for (const file of files) assert.ok(!forbidden.test(text(file)), file + ': forbidden schema dependency')
const route = text('app/api/admin/finanzas/conciliar/route.ts')
assert.match(route, /RECUPERACION_NO_DISPONIBLE/)
assert.ok(!/import\([^\n]+conciliar-recovery/.test(route))
assert.ok(!/scheduleConciliarProjectionRefresh/.test(route))
const actions = text('lib/finanzas/conciliar-actions.ts')
assert.ok(!/from ['"]\.\/conciliar-recovery/.test(actions))
assert.ok(!/prepareConciliarRecoveryIntent|commitConciliarRecoveryIntentTx|assertConciliarRecoveryIntentExecutableTx/.test(actions))
assert.match(actions, /lockOperationOrReplay/)
assert.match(actions, /requireLiveWrite\(actorId, tx\)/)
assert.match(actions, /Prisma\.TransactionIsolationLevel\.Serializable/)
const refresh = text('lib/finanzas/conciliar-refresh.ts')
assert.ok(!/import\s.*next\/server|\bafter\s*\(/.test(refresh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')))
assert.match(refresh, /MANUAL_REBUILD_REQUIRED/)
const ddl = /\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:TABLE|TYPE|FUNCTION|INDEX|SCHEMA)\b/i
for (const file of files) assert.ok(!ddl.test(text(file)), file + ': executable DDL')
const sqlConstants = (s: string) => [...s.matchAll(/(?:export )?const ([A-Z_]+_SQL) = ([\s\S]*?)(?=\n(?:export )?const |\nfunction |\n\/\*\*|\nexport )/g)].map(m => [m[1], m[2]])
const existing = sqlConstants(text('lib/finanzas/bank-invoicing-db.ts'))
const isolated = sqlConstants(text('lib/finanzas/conciliar-bank-invoicing-db.ts'))
assert.equal(existing.length, 10)
assert.deepEqual(isolated, existing, 'bounded source queries must not change')
const rendered = conciliarDocumentSourceGuardBatchSql.queryForTests([{ kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: 'pure-source-query-test' }])
assert.ok(rendered && rendered.sql.includes(' UNION ALL '))
assert.ok(!rendered.sql.includes('[object Object]'), 'Prisma separator must be SQL text')
async function main() {
  let queries = 0
  const database = { $queryRawUnsafe: async <T>(_sql: string): Promise<T> => { queries++; throw new Error('NO_SQL_ALLOWED') } }
  await assert.rejects(() => readBankInvoicingPopulation(database, { enabled: false, assertIsolatedStaging: async () => {} }), /B7_READ_DISABLED/)
  assert.equal(queries, 0)
  await assert.rejects(() => readBankInvoicingPopulation(database, { enabled: true, assertIsolatedStaging: async () => { throw new Error('ISOLATION_REJECTED') } }), /ISOLATION_REJECTED/)
  assert.equal(queries, 0)
  console.log(JSON.stringify({ pass: true, files: files.length, sourceSqlQueriesUnchanged: existing.length, databaseQueries: queries, externalCalls: 0, recoveredReceipts: 0 }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
