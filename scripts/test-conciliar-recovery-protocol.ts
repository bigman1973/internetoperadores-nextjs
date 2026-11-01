/*
 * Recuperación Conciliar en producción v1 — pruebas estáticas puras, sin BD/red.
 * Ejecutar: ./node_modules/.bin/tsx scripts/test-conciliar-recovery-protocol.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const route = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliar/route.ts'), 'utf8')
const actions = readFileSync(resolve(root, 'lib/finanzas/conciliar-actions.ts'), 'utf8')
const recoveryCore = readFileSync(resolve(root, 'lib/finanzas/conciliar-recovery-core.ts'), 'utf8')
const recoveryRuntime = readFileSync(resolve(root, 'lib/finanzas/conciliar-recovery.ts'), 'utf8')

const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function PUT'))
const transaction = actions.slice(actions.indexOf('export async function runConciliarTransactionCommand'), actions.indexOf('export type ConciliarActionRunOptions'))
const actionHost = actions.slice(actions.indexOf('export async function runConciliarAction'), actions.indexOf('export function conciliarActionErrorResponse'))

assert.match(get, /await assertConciliarRuntime\(\)/)
assert.match(get, /requireB4FinanceAccess\('lectura', await getServerSession\(authOptions\)\)/)
assert.match(get, /if \(query\.recover !== undefined\)[\s\S]*RECUPERACION_NO_DISPONIBLE[\s\S]*503/, 'recovery responde 503 ordinario sin afirmar terminalidad')
assert.ok(get.indexOf("requireB4FinanceAccess('lectura'") < get.indexOf('if (query.recover !== undefined)'), 'ACL de lectura precede la respuesta de recovery')
assert.doesNotMatch(get, /readConciliarRecoveryIntent|parseConciliarRecoveryLookup|COMMITTED|NOT_COMMITTED|PENDING/, 'GET no consulta estados terminales ni inventa historia')
assert.doesNotMatch(route, /conciliar-recovery|prepareConciliarRecoveryIntent|commitConciliarRecoveryIntentTx|assertConciliarRecoveryIntentExecutableTx/, 'la ruta no importa ni prepara recovery durable')

assert.match(post, /if \(!sameOrigin\(request\)\) return privateJson\([\s\S]*INVALID_ORIGIN[\s\S]*403\)/)
assert.match(post, /const parsed = parseConciliarCommand\(command\)/)
assert.match(post, /requireB4FinanceAccess\(reviewPreview \? 'lectura' : 'escritura'/)
assert.ok(post.indexOf('if (!sameOrigin(request))') < post.indexOf('const parsed = parseConciliarCommand(command)'), 'origen se valida antes de preparar negocio')
assert.ok(post.indexOf('const parsed = parseConciliarCommand(command)') < post.indexOf("await import('@/lib/finanzas/conciliar-actions')"), 'no hay preparación de intent antes del comando validado y ACL')

assert.match(actions, /async function lockOperationOrReplay[\s\S]*pg_advisory_xact_lock[\s\S]*FROM operaciones_conciliar[\s\S]*LIMIT 1 FOR UPDATE/, 'la idempotencia ordinaria conserva advisory lock y recibo bloqueado')
assert.match(actions, /IDEMPOTENCY_PAYLOAD_MISMATCH/)
assert.doesNotMatch(actions, /from ['"]\.\/conciliar-recovery|prepareConciliarRecoveryIntent|commitConciliarRecoveryIntentTx|assertConciliarRecoveryIntentExecutableTx/, 'las acciones no preparan intención durable de recovery')
assert.match(actionHost, /Prisma\.TransactionIsolationLevel\.Serializable/)
assert.match(actionHost, /await requireLiveWrite\(actorId, tx\)/)
assert.match(transaction, /Production-v1 receipts provide ordinary POST idempotency only/)
assert.match(transaction, /No durable[\s\S]*terminal recovery result is fabricated/)

for (const relative of [
  'app/api/admin/finanzas/conciliar/route.ts',
  'lib/finanzas/conciliar-actions.ts',
] as const) {
  const source = readFileSync(resolve(root, relative), 'utf8')
  const transpiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true })
  assert.equal(transpiled.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error).length ?? 0, 0, `${relative} debe ser sintácticamente transpirable`)
}

assert.match(recoveryCore, /CONCILIAR_RECEIPT_RECOVERY_V2/, 'el núcleo legacy puro puede permanecer aislado para compatibilidad')
assert.match(recoveryRuntime, /area3_conciliar_recovery_intents/, 'el runtime legacy no se promociona a ruta activa')

console.log(JSON.stringify({
  passed: true,
  databaseOperations: 0,
  networkOperations: 0,
  recoveryRouteDisabled503: true,
  ordinaryPostIdempotencyPreserved: true,
  authenticatedAccessPrecedesRecoveryResponse: true,
  noTerminalRecoveryClaims: true,
  noActiveRecoveryImportsOrIntentPreparation: true,
  serializableAclPreserved: true,
  changedTypeScriptSyntaxTranspiles: true,
}))
