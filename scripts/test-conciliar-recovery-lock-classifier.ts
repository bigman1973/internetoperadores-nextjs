import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { Prisma } from '@prisma/client'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'

const root = resolve(import.meta.dirname, '..')
const recoveryPath = resolve(root, 'lib/finanzas/conciliar-recovery.ts')
const source = readFileSync(recoveryPath, 'utf8')
const parsed = ts.createSourceFile(recoveryPath, source, ts.ScriptTarget.Latest, true)
const templates: string[][] = []

const visit = (node: ts.Node): void => {
  if (ts.isTaggedTemplateExpression(node) && node.tag.getText(parsed) === 'Prisma.sql') {
    const strings = ts.isNoSubstitutionTemplateLiteral(node.template)
      ? [node.template.text]
      : [node.template.head.text, ...node.template.templateSpans.map(span => span.literal.text)]
    if (/^\s*WITH barrier AS MATERIALIZED\s*\(/i.test(strings[0]!)) templates.push(strings)
  }
  ts.forEachChild(node, visit)
}
visit(parsed)
assert.equal(templates.length, 2, 'recovery mantiene exactamente dos plantillas CTE advisory cerradas')

function asPrismaSql(strings: readonly string[], overrideText?: string) {
  const parts = overrideText === undefined ? [...strings] : overrideText.split(/\$\d+/)
  const template = Object.assign(parts, { raw: [...parts] }) as unknown as TemplateStringsArray
  return Prisma.sql(template, ...parts.slice(1).map((_, index) => `bound-${index}`))
}

const rendered = templates.map(strings => asPrismaSql(strings))
for (const query of rendered) {
  assert.equal(classifyPrisma5RawSqlStatement([query]), 'advisory_lock', 'la plantilla real Prisma.sql se clasifica como advisory_lock')
}

const legacy = rendered.find(query => query.text.includes('legacy_receipt'))
const executable = rendered.find(query => !query.text.includes('legacy_receipt'))
assert.ok(legacy && executable, 'las plantillas distinguen prepare con legado y executable sin legado')
assert.match(legacy.text, /WITH barrier AS MATERIALIZED \(\s*SELECT pg_advisory_xact_lock/s)
assert.match(legacy.text, /FROM barrier LEFT JOIN intent i ON true LEFT JOIN legacy_flags ON true/)
assert.match(executable.text, /FROM barrier LEFT JOIN intent i ON true/)
assert.equal((legacy.text.match(/pg_advisory_xact_lock/g) ?? []).length, 1, 'prepare coalesce advisory y lecturas en una sola query')
assert.equal((executable.text.match(/pg_advisory_xact_lock/g) ?? []).length, 1, 'execute coalesce advisory y lectura en una sola query')
assert.match(legacy.text, /barrier\.locked IS NOT NULL[\s\S]*FOR UPDATE OF i/)
assert.match(legacy.text, /barrier\.locked IS NOT NULL[\s\S]*FOR UPDATE OF o/)
assert.match(executable.text, /barrier\.locked IS NOT NULL[\s\S]*FOR UPDATE OF i/)

const base = legacy.text
const negative: Array<[string, string]> = [
  ['condition', base.replace('barrier.locked IS NOT NULL', 'barrier.locked IS NULL')],
  ['advisory function', base.replace('pg_advisory_xact_lock', 'pg_advisory_lock')],
  ['hash seed', base.replace(',0))::text', ',1))::text')],
  ['materialized barrier', base.replace('barrier AS MATERIALIZED', 'barrier AS')],
  ['intent order', base.replace('ORDER BY i.idempotency_key ASC', 'ORDER BY i.idempotency_key DESC')],
  ['legacy order', base.replace('ORDER BY o.id ASC', 'ORDER BY o.id DESC')],
  ['intent predicate', base.replace('i.actor_effective_id=$2', 'i.actor_real_id=$2')],
  ['row lock target', base.replace('FOR UPDATE OF i', 'FOR UPDATE OF o')],
  ['intent alias', base.replace('recovery_intents i', 'recovery_intents x')],
  ['comment', base.replace('WITH barrier', 'WITH /* closed */ barrier')],
  ['multiple statements', `${base}; SELECT 1`],
  ['literal', base.replace('$1', "'literal-key'")],
  ['schema-qualified function', base.replace('pg_advisory_xact_lock', 'pg_catalog.pg_advisory_xact_lock')],
  ['second query CTE', base.replace('), intent AS MATERIALIZED', '), extra AS MATERIALIZED (SELECT 1), intent AS MATERIALIZED')],
  ['extended output columns', base.replace('legacy_flags."hasLegacyReceipt"', 'legacy_flags."hasLegacyReceipt",barrier.locked')],
]
for (const [label, text] of negative) {
  const kind = classifyPrisma5RawSqlStatement([asPrismaSql([], text)])
  assert.notEqual(kind, 'advisory_lock', `${label}: nunca alcanza el reconocedor exacto`)
  assert.notEqual(kind, 'read_only', `${label}: nunca se degrada a lectura autorizada`)
  assert.ok(kind === 'unknown' || kind === 'mutating', `${label}: sólo puede quedar desconocida o auditada como DML`)
}

console.log(JSON.stringify({
  passed: true,
  databaseOperations: 0,
  recoveryTemplates: templates.length,
  advisoryReadCoalesced: true,
  exactNegativeVariantsRejected: negative.length,
  prismaSqlExtractor: true,
}))
