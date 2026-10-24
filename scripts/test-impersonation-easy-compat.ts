/**
 * Pure SQL compatibility regression: no dotenv, DB, provider, HTTP, or writes.
 *   node_modules/.bin/tsx scripts/test-impersonation-easy-compat.ts
 *   node_modules/.bin/tsx scripts/test-impersonation-easy-compat.ts --require-compatible
 * The first mode reports current guard gaps (a green harness is NOT compatibility).
 * The second additionally fails if any reviewed real SQL remains blocked.
 * Original SQL-producing functions are extracted with the TypeScript AST and
 * executed in an isolated factory, with Prisma.sql real and query endpoints fake.
 * The reference purpose registry is test-only; it is NOT installed on Prisma.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { Prisma } from '@prisma/client'
import prisma, { classifyPrisma5RawSqlArgs, guardPrismaImpersonationMutation } from '../lib/prisma'
import { resolveSignedImpersonationContext, signTrustedImpersonationContext, type TrustedImpersonationContext } from '../lib/impersonation-context'

type Purpose = 'easy.read' | 'easy.tx-lock' | 'easy.bulk-readonly'
type Fixture = { name: string; sql: Prisma.Sql; purpose: Purpose; source: string }
const root = path.resolve(__dirname, '..')
const fixtures: Fixture[] = []
const input = { desde: '2026-01-01', hasta: '2026-12-31', sentido: 'TODOS', q: null, tarjeta: null, limit: 25, offset: 0 }
const uuid = '8f2cae1d-2a25-4c66-8f5c-2d4ce6e2f1f3'
const movement = { id: 'pure-movement', fecha: '2026-10-01', importeCentimos: -100, cuentaId: 'pure-account', tercero: 'PURE', concepto: 'PURE' }
let label = '', purpose: Purpose = 'easy.read', source = ''
const fakeDb = {
  async $queryRaw(statement: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) {
    const sql = Array.isArray(statement) ? Prisma.sql(statement as TemplateStringsArray, ...values) : statement as Prisma.Sql
    assert(Array.isArray(sql.strings), 'Capture must use Prisma.Sql or tagged raw, never a fabricated SQL object')
    fixtures.push({ name: `${label}:${fixtures.filter(f => f.name.startsWith(`${label}:`)).length + 1}`, sql, purpose, source })
    return []
  },
}
/** Only selected original function declarations enter this factory. No module
 * imports, top-level side effects, auth providers or Prisma client are evaluated. */
function factory(relative: string, names: string[], bindings: Record<string, unknown>) {
  const file = path.join(root, relative)
  const text = readFileSync(file, 'utf8')
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const declarations = names.map(name => {
    const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
    assert(node, `Original function missing: ${relative}#${name}`)
    return node.getText(ast).replace(/^export\s+/, '')
  })
  const code = ts.transpileModule(`${declarations.join('\n')}\nreturn {${names.join(',')}}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  return new Function('Prisma', ...Object.keys(bindings), code)(Prisma, ...Object.values(bindings)) as Record<string, (...args: any[]) => any>
}
async function capture(name: string, file: string, p: Purpose, callback: () => Promise<unknown> | unknown) {
  label = name; source = file; purpose = p
  try { await callback() } catch (error) {
    // Empty fake rows intentionally stop lock helpers after all their SQL has
    // rendered. No database error or permission bypass is simulated.
    if (!(error instanceof Error) || error.message !== 'PURE_EMPTY_RESULT') throw error
  }
}
function registerSql(name: string, file: string, p: Purpose, sql: Prisma.Sql) {
  fixtures.push({ name, source: file, purpose: p, sql })
}
async function collectOriginalSql() {
  const recFile = 'lib/finanzas/easy-reconciliation-db.ts'
  const rec = factory(recFile, ['activeAllocations', 'activeRuleCuesTx', 'candidatesForMovementTx', 'queryMovements', 'countQueue', 'readMonths', 'readRules', 'lockMovement', 'replayReceipt', 'incrementMatchingRules', 'operationForRule'], {
    db: () => fakeDb,
    UUID: /^[0-9a-f-]{36}$/i,
    MAX_SUGGESTIONS_PER_MOVEMENT: 25, MAX_RULES: 100,
    exactInteger: (value: unknown) => Number(value),
    counterpartyFromMovement: () => 'PURE', sign: (n: number) => n < 0 ? -1 : n > 0 ? 1 : null,
    // Import the original economic SQL builder separately, without module effects.
    facturaEconomicaSQL: factory('lib/finanzas/invoice-economic-filter.ts', ['facturaEconomicaSQL'], { CARPETA_CONFIRMING_DRAXTON_2026: '3. Confirming Draxton 2026' }).facturaEconomicaSQL,
    fail: () => { throw new Error('PURE_EMPTY_RESULT') },
  })
  for (const sentido of ['TODOS', 'CARGOS', 'COBROS']) for (const q of [null, 'pure search']) for (const tarjeta of [null, '1234']) {
    const variant = { ...input, sentido, q, tarjeta }
    const tag = `${sentido}-${q === null ? 'q0' : 'q1'}-${tarjeta === null ? 'card0' : 'card1'}`
    await capture(`reconciliation.movements.${tag}`, recFile, 'easy.read', () => rec.queryMovements(variant, 25, 0))
    await capture(`reconciliation.queue.${tag}`, recFile, 'easy.read', () => rec.countQueue(variant))
  }
  await capture('reconciliation.months', recFile, 'easy.read', () => rec.readMonths(input))
  await capture('reconciliation.rules', recFile, 'easy.read', () => rec.readRules())
  await capture('reconciliation.cues', recFile, 'easy.read', () => rec.activeRuleCuesTx(fakeDb, movement))
  for (const n of [1, 2, 25, 100]) await capture(`reconciliation.allocations.n${n}`, recFile, 'easy.read', () => rec.activeAllocations(fakeDb, Array.from({ length: n }, (_, i) => `${uuid.slice(0, -12)}${i.toString(16).padStart(12, '0')}`)))
  for (const cents of [-100, 100]) await capture(`reconciliation.candidates.${cents < 0 ? 'charge' : 'credit'}`, recFile, 'easy.read', () => rec.candidatesForMovementTx(fakeDb, { ...movement, importeCentimos: cents }))
  await capture('reconciliation.lockMovement', recFile, 'easy.tx-lock', () => rec.lockMovement(fakeDb, movement.id))
  await capture('reconciliation.replay', recFile, 'easy.tx-lock', () => rec.replayReceipt(fakeDb, 202, { idempotencyKey: uuid }))
  await capture('reconciliation.ruleLocks', recFile, 'easy.tx-lock', () => rec.incrementMatchingRules(fakeDb, 202, movement, 'FACTURA_RECIBIDA', uuid))
  await capture('reconciliation.ruleOperation', recFile, 'easy.tx-lock', () => rec.operationForRule(fakeDb, 202, uuid))

  const cpFile = 'lib/finanzas/easy-counterparty-db.ts'
  const cp = factory(cpFile, ['tableReady', 'directionClause', 'cardClause', 'baseMovementWhere', 'sourceRelations', 'decisionRelations', 'decisionFields', 'sourceFields', 'movementProjection', 'readP2CountersTx', 'stableSearchCandidatesTx', 'currentVersionTx', 'canReverseAnotherActorTx', 'receiptReplay', 'lockedMovement'], {
    exactInteger: (n: unknown) => Number(n),
    tableReady: () => true,
    p2Direction: () => ({ movimientos: 0, importeCentimos: '0' }),
    dedupeCandidates: (rows: unknown[]) => rows,
    fail: () => { throw new Error('PURE_EMPTY_RESULT') },
  })
  await capture('counterparty.tableReady', cpFile, 'easy.read', () => cp.tableReady(fakeDb, 'decisiones_tercero_modo_facil'))
  for (const withDecisions of [false, true]) for (const withProof of [false, true]) for (const sentido of ['TODOS', 'CARGOS', 'COBROS']) for (const q of [null, 'pure']) for (const tarjeta of [null, '1234']) {
    const variant = { ...input, sentido, q, tarjeta }
    const tag = `d${+withDecisions}-p${+withProof}-${sentido}-q${+(q !== null)}-card${+(tarjeta !== null)}`
    registerSql(`counterparty.projection.${tag}`, cpFile, 'easy.read', cp.movementProjection(variant, 25, 0, withDecisions, withProof))
    registerSql(`counterparty.lockedProjection.${tag}`, cpFile, 'easy.tx-lock', cp.movementProjection(variant, 25, 0, withDecisions, withProof, true))
  }
  for (const sentido of ['TODOS', 'CARGOS', 'COBROS']) for (const q of [null, 'pure']) for (const tarjeta of [null, '1234']) {
    await capture(`counterparty.p2Counters.${sentido}-q${+(q !== null)}-card${+(tarjeta !== null)}`, cpFile, 'easy.read', () => cp.readP2CountersTx(fakeDb, { ...input, sentido, q, tarjeta }))
  }
  for (const term of [null, 'pure']) for (const proof of [false, true]) await capture(`counterparty.search.q${+(term !== null)}-p${+proof}`, cpFile, 'easy.read', () => cp.stableSearchCandidatesTx(fakeDb, movement.id, term, 25, proof))
  await capture('counterparty.version', cpFile, 'easy.read', () => cp.currentVersionTx(fakeDb, movement.id))
  await capture('counterparty.replay', cpFile, 'easy.tx-lock', () => cp.receiptReplay(fakeDb, 202, { idempotencyKey: uuid }))
  await capture('counterparty.lockedMovement', cpFile, 'easy.tx-lock', () => cp.lockedMovement(fakeDb, movement.id, true, true))
  // Source-anchored fixed statements in transitive runtime / reviewed bulk GET.
  const runtimeText = readFileSync(path.join(root, 'lib/finanzas/prototype-staging.ts'), 'utf8')
  assert(runtimeText.includes('SELECT current_database() AS database_name, current_user AS database_user LIMIT 1'))
  registerSql('runtime.liveIdentity', 'lib/finanzas/prototype-staging.ts:130', 'easy.read', Prisma.sql`SELECT current_database() AS database_name, current_user AS database_user LIMIT 1`)
  const bulkText = readFileSync(path.join(root, 'lib/finanzas/easy-counterparty-bulk-db.ts'), 'utf8')
  assert(bulkText.includes('await base.$executeRaw`SET TRANSACTION READ ONLY`'))
  registerSql('bulk.setReadOnly', 'lib/finanzas/easy-counterparty-bulk-db.ts:315', 'easy.bulk-readonly', Prisma.sql`SET TRANSACTION READ ONLY`)
  registerSql('b4.lockMovement', 'lib/finanzas/reconciliation-db.ts:189', 'easy.tx-lock', Prisma.sql`SELECT id FROM movimientos_bancarios WHERE id = CAST(${movement.id} AS text) FOR UPDATE`)
  registerSql('b4.lockDocument', 'lib/finanzas/reconciliation-db.ts:198', 'easy.tx-lock', Prisma.sql`SELECT id FROM documentos_conciliables WHERE id = CAST(${uuid} AS uuid) FOR UPDATE`)
  registerSql('b4.activeNet', 'lib/finanzas/reconciliation-db.ts:385', 'easy.read', Prisma.sql`SELECT documento_conciliable_id AS "documentoConciliableId", COALESCE(SUM(importe_centimos), 0) AS total FROM vinculos_movimiento_documento WHERE activo = true AND documento_conciliable_id IN (CAST(${uuid} AS uuid)) GROUP BY documento_conciliable_id`)
}
/** Keep literal and quoted identifier bytes, collapse whitespace ONLY outside them.
 * Reject comments, dollar quoting and multi-statement SQL for registry matching.
 * Bound data NEVER enters this key: only actual Prisma.Sql string parts do. */
function fingerprint(sql: Prisma.Sql): string | null {
  const template = sql.strings.join('?')
  let out = '', quote = '', space = false
  for (let i = 0; i < template.length; i++) {
    const c = template[i]
    if (quote) {
      out += c
      if (c === quote) { if (template[i + 1] === quote) out += template[++i]; else quote = '' }
      continue
    }
    if (c === ';' || template.slice(i, i + 2) === '--' || template.slice(i, i + 2) === '/*' || /^\$[a-z_]*\$/i.test(template.slice(i))) return null
    if (/\s/.test(c)) { space = true; continue }
    if (space && out) out += ' '
    space = false
    out += c
    if (c === "'" || c === '"') quote = c
  }
  return quote ? null : out.trim()
}
function purposeAllowed(p: Purpose, context: TrustedImpersonationContext, inTx: boolean): boolean {
  const getPaths = ['/api/admin/finanzas/modo-facil', '/api/admin/finanzas/modo-facil/para-pedir', '/api/admin/finanzas/modo-facil/terceros', '/api/admin/finanzas/modo-facil/terceros/bloque']
  const actions: Record<string, string[]> = {
    '/api/admin/finanzas/modo-facil': ['confirmar_factura', 'no_requiere'],
    '/api/admin/finanzas/modo-facil/deshacer': ['deshacer'],
    '/api/admin/finanzas/modo-facil/reglas': ['crear', 'desactivar'],
    '/api/admin/finanzas/modo-facil/terceros': ['confirmar', 'revertir'],
    '/api/admin/finanzas/modo-facil/terceros/bloque': ['aceptar_seleccionados', 'deshacer_lote'],
  }
  const read = ['GET', 'HEAD'].includes(context.method) && getPaths.includes(context.path)
  const manual = context.method === 'POST' && !!actions[context.path]?.includes(context.action ?? '')
  if (p === 'easy.bulk-readonly') return inTx && ['GET', 'HEAD'].includes(context.method) && context.path === '/api/admin/finanzas/modo-facil/terceros/bloque'
  if (p === 'easy.tx-lock') return inTx && manual
  return read || manual
}
async function main() {
  await collectOriginalSql()
  const previousSecret = process.env.NEXTAUTH_SECRET
  process.env.NEXTAUTH_SECRET = 'pure-easy-compat-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  try {
    const base: TrustedImpersonationContext = { v: 'v1', sessionId: uuid, actorId: 101, targetId: 202, reason: 'Prueba pura', method: 'POST', path: '/api/admin/finanzas/modo-facil/terceros', action: 'confirmar', ip: null, ipSource: 'untrusted_proxy' }
    const signed = signTrustedImpersonationContext(base)
    const valid = resolveSignedImpersonationContext(signed)
    assert.equal(valid.status, 'valid')
    const invalid = resolveSignedImpersonationContext(`${signed.slice(0, -1)}${signed.endsWith('A') ? 'B' : 'A'}`)
    assert.equal(invalid.status, 'invalid')
    const tx = { pure: true } as unknown as Prisma.TransactionClient
    const registry = new Map<string, Set<Purpose>>()
    for (const f of fixtures) {
      const key = fingerprint(f.sql)
      assert(key, `Reviewed real SQL fingerprint invalid: ${f.name}`)
      const purposes = registry.get(key) ?? new Set<Purpose>()
      purposes.add(f.purpose); registry.set(key, purposes)
    }
    const reference = (sql: Prisma.Sql, context: TrustedImpersonationContext, inTx: boolean) => {
      const key = fingerprint(sql)
      return !!key && [...(registry.get(key) ?? [])].some(p => purposeAllowed(p, context, inTx))
    }
    const gaps: Array<{ name: string; classification: string; source: string; sha256: string }> = []
    for (const f of fixtures) {
      const args = [f.sql]
      const classification = classifyPrisma5RawSqlArgs(args)
      const reconciliation = f.name.startsWith('reconciliation.') || f.name.startsWith('b4.')
      const rules = f.name.startsWith('reconciliation.rule')
      const context: TrustedImpersonationContext = f.purpose === 'easy.bulk-readonly'
        ? { ...base, method: 'GET', path: '/api/admin/finanzas/modo-facil/terceros/bloque', action: null }
        : f.purpose === 'easy.read'
          ? { ...base, method: 'GET', path: reconciliation ? '/api/admin/finanzas/modo-facil/para-pedir' : '/api/admin/finanzas/modo-facil/terceros', action: null }
          : rules
            ? { ...base, path: '/api/admin/finanzas/modo-facil/reglas', action: 'crear' }
            : reconciliation
              ? { ...base, path: '/api/admin/finanzas/modo-facil', action: 'confirmar_factura' }
              : base
      const actualTx = f.purpose === 'easy.read' ? null : tx
      assert(reference(f.sql, context, true), `Exact reference registry must accept ${f.name}`)
      if (f.purpose !== 'easy.read') assert(!reference(f.sql, context, false), 'Preparation never allowed outside tx')
      assert(!reference(f.sql, { ...base, path: '/api/admin/configuracion' }, true), 'Unreviewed purpose never inherits allowance')
      const fixtureContext = resolveSignedImpersonationContext(signTrustedImpersonationContext(context))
      let next = 0, verify = 0, append = 0
      const call = (requestContext = fixtureContext) => guardPrismaImpersonationMutation({ action: f.purpose === 'easy.bulk-readonly' ? 'executeRaw' : 'queryRaw', args, model: null }, async () => { next++; return 'fake-result' }, { requestContext, transaction: actualTx, verifyLiveContext: async () => { verify++; return true }, appendSuccess: async () => { append++ } })
      let denied: unknown = null
      try { await call() } catch (error) { denied = error }
      if (denied) {
        assert.match(denied instanceof Error ? denied.message : '', /IMPERSONATION_RAW_SQL_UNREVIEWED/)
        assert.deepEqual([next, verify, append], [0, 0, 0])
        gaps.push({ name: f.name, classification, source: f.source, sha256: createHash('sha256').update(fingerprint(f.sql)!).digest('hex') })
      } else {
        assert.equal(next, 1)
        assert.equal(append, 0, 'Reads and preparation must not create BUSINESS_MUTATION receipts')
        if (f.purpose === 'easy.tx-lock') assert.equal(verify, 1, 'Reviewed lock requires live context verification')
        else assert.equal(verify, 0, 'Read-only and READ ONLY setup do not run write verifier/FOR SHARE')
      }
      await assert.rejects(() => call(invalid), /IMPERSONATION_WRITE_CONTEXT_INVALID/)
    }
    const negatives = [
      Prisma.sql`SELECT unknown_writes(${1})`, Prisma.sql`SELECT pg_advisory_lock(${1})`,
      Prisma.sql`SELECT set_config('role','postgres',false)`, Prisma.sql`SET TRANSACTION READ WRITE`,
      Prisma.sql`SET LOCAL session_replication_role = replica`, Prisma.sql`SET CONSTRAINTS ALL DEFERRED`,
      Prisma.sql`WITH x AS (DELETE FROM movimientos_bancarios RETURNING id) SELECT * FROM x`,
      Prisma.sql`SELECT COUNT(*) FROM decisiones_tercero_modo_facil; DELETE FROM decisiones_tercero_modo_facil`,
      Prisma.sql`SELECT current_database() AS database_name, current_user AS database_user LIMIT 2`,
      Prisma.sql`SELECT to_regclass(${1}) IS NOT NULL AS ready /* unreviewed extension */`,
    ]
    for (const sql of negatives) assert(!reference(sql, base, true), 'Unknown grammar/function/SET must remain outside exact registry')
    const parameter = Prisma.sql`SELECT COUNT(*)::int AS version FROM decisiones_tercero_modo_facil WHERE movimiento_id=${'DELETE FROM usuarios_admin; SELECT unknown_writes()'}`
    assert(reference(parameter, base, true), 'Parameter content is not executable SQL or classifier input')
    const plain = Prisma.sql`SELECT id FROM movimientos_bancarios WHERE id=${'DELETE FROM elsewhere'}`
    assert.equal(classifyPrisma5RawSqlArgs([plain]), 'read_only')
    let verify = 0, append = 0
    await guardPrismaImpersonationMutation({ action: 'queryRaw', args: [Prisma.sql`INSERT INTO decisiones_tercero_modo_facil (movimiento_id) VALUES (${movement.id}) RETURNING id`] }, async () => 'pure-business', { requestContext: valid, transaction: tx, verifyLiveContext: async () => { verify++; return true }, appendSuccess: async () => { append++ } })
    assert.deepEqual([verify, append], [1, 1], 'INSERT RETURNING retains live verification + one success receipt')
    console.log(JSON.stringify({ pureHarnessPassed: true, databaseOperations: 0, realSqlShapes: fixtures.length, exactRegistryKeys: registry.size, referenceNegativeCases: negatives.length, actualGuardCompatible: gaps.length === 0, actualGuardBlocked: gaps.length, sampleBlocked: gaps.filter(g => /runtime|queue.TODOS-q0-card0|months|tableReady|version|lockMovement|bulk.setReadOnly/.test(g.name)), requireCompatible: process.argv.includes('--require-compatible') }, null, 2))
    if (process.argv.includes('--print-sql')) for (const f of fixtures) console.log(JSON.stringify({ name: f.name, purpose: f.purpose, source: f.source, classification: classifyPrisma5RawSqlArgs([f.sql]), template: fingerprint(f.sql) }))
    if (process.argv.includes('--require-compatible')) assert.equal(gaps.length, 0, 'Real Easy/Para pedir SQL still blocked; apply reviewed purpose registry before claiming compatibility')
  } finally {
    if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = previousSecret
  }
}
main().catch(error => { console.error(`EASY_COMPAT_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}`); process.exitCode = 1 }).finally(() => prisma.$disconnect())
