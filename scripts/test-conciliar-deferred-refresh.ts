/* Producto puro: ejecuta funciones reales extraídas por AST; los proveedores y
 * la transacción son dobles en memoria. No importa Prisma/handlers ni abre BD/red. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { parseConciliarCommand } from '../lib/finanzas/conciliar-contract'
import { conciliarVisualGreenIsCurrent, CONCILIAR_GREEN_PRECHECK_STAMP } from '../lib/finanzas/conciliar-precheck-visual'

const root = resolve(__dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const actions = read('lib/finanzas/conciliar-actions.ts')
const route = read('app/api/admin/finanzas/conciliar/route.ts')
const refresh = read('lib/finanzas/conciliar-refresh.ts')
const affected = read('lib/finanzas/conciliar-affected-refresh.ts')
const projectionDb = read('lib/finanzas/conciliar-db.ts')
const projectionReader = read('lib/finanzas/conciliar-projection-read.ts')
const ast = ts.createSourceFile('actions.ts', actions, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
function functions(text: string, names: readonly string[]): string {
  const source = ts.createSourceFile('source.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return names.map(name => {
    const node = source.statements.find((item): item is ts.FunctionDeclaration => ts.isFunctionDeclaration(item) && item.name?.text === name)
    assert(node, `real function ${name} must exist`)
    return node.getText(source).replace(/^export /, '')
  }).join('\n')
}
const names = ['confirmStandard', 'confirm', 'responseProjection', 'runConciliarTransactionCommand', 'runConciliarAction', 'requireLiveWrite', 'requireMovement']
const code = ts.transpileModule(functions(actions, names), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const seam = functions(actions, ['runConciliarTransactionCommand'])
assert.doesNotMatch(actions, /from ['"]\.\/conciliar-affected-refresh['"]/, 'financial service must not import full affected refresh')
assert.doesNotMatch(seam, /refreshAffectedConciliarProjection|rebuildConciliarProjection|DELETE FROM area3_conciliar_projection_changes/, 'fallback neither rebuilds nor consumes durable dirty IDs')
assert.ok(seam.indexOf('commitConciliarRecoveryIntentTx(') < seam.indexOf('const projection = await responseProjection('), 'recovery DML remains inside financial tx before transient view')
assert.match(functions(actions, ['undo']), /rebuildConciliarProjectionTx\(tx, actorId, \{\s*movementIds, manualPairsOnly: true/, 'manual-pair-only undo fastpath remains narrow')
assert.match(route, /onPhase: actionPhase/g, 'JSON and native streaming propagate the safe observer')
assert.match(route, /projectionSynchronized\?: unknown \}\)\.projectionSynchronized !== true\) scheduleConciliarActionProjectionRefresh\(access.actor.id\)/)
assert.match(affected, /LIMIT 1 FOR UPDATE/, 'no background projection lock relaxation')
assert.match(affected, /consumedChanges[\s\S]*rebuildConciliarProjectionTx\(tx, actorId, scope\)/, 'durable work scope retained')
// All direct raw writes in the existing rebuild are derived. Helper calls remain
// covered by existing G7/documentary suites; this assertion is not a DB audit.
const rebuild = functions(projectionDb, ['rebuildConciliarProjectionTx'])
const directWriteTargets = [...rebuild.matchAll(/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+([a-z_][a-z_0-9]*)/g)].map(match => match[1])
assert(directWriteTargets.length > 0)
assert(directWriteTargets.every(table => ['conciliar_proyecciones', 'estado_proyeccion_conciliar', 'area3_conciliar_projection_changes'].includes(table)))

const preparedGet = functions(projectionReader, ['readProjectionBundle'])
assert.match(preparedGet, /p\.color='VERDE'[\s\S]*dirty_at IS NOT NULL[\s\S]*AS needs_g7_review/)
assert.match(preparedGet, /CASE WHEN p\.needs_g7_review THEN 'AMBAR' ELSE p\.color END AS color/)
assert.match(preparedGet, /CASE WHEN g7\.needs_g7_review THEN false ELSE p\.seleccionable END AS seleccionable/)
assert.doesNotMatch(preparedGet, /\b(?:INSERT|UPDATE|DELETE|rebuildConciliarProjection|refreshAffectedConciliarProjection)\b/, 'prepared GET remains read-only during dirty')
const source = { kind: 'COMISION_BANCARIA' as const, g7Precheck: CONCILIAR_GREEN_PRECHECK_STAMP }
assert.equal(conciliarVisualGreenIsCurrent({ source, dirty: true }), false, 'a restored queue row cannot become UI green before settlement')
assert.equal(conciliarVisualGreenIsCurrent({ source, dirty: false }), true)
assert.equal(conciliarVisualGreenIsCurrent({ source: { ...source, g7Precheck: undefined }, dirty: false }), false)

const key = '11111111-1111-4111-8111-111111111111'
const receiptId = '22222222-2222-4222-8222-222222222222'
const raw = { action: 'confirmar', idempotencyKey: key, items: [{ id: 'pure-row', decisionHash: 'a'.repeat(64) }], responseView: { tab: 'COBROS', limit: 50, offset: 0, cutoffDate: '2026-01-01', historic: false } }
const command = parseConciliarCommand(raw)
const actors = { actorRealId: 1, actorEffectiveId: 1 }
type State = { recovery: string | null; finance: number; p1: number; queue: string[]; rows: string[]; receipt: unknown }
async function scenario(input: { synchronized?: boolean; replay?: boolean; failure?: 'recovery' | 'projection'; observerThrows?: boolean; revoked?: boolean } = {}) {
  let durable: State = { recovery: null, finance: 0, p1: 0, queue: [], rows: ['pure-row'], receipt: null }
  const events: string[] = []
  const phases: Array<{ name: string; elapsedMs: number }> = []
  let projectionReads = 0
  let g7Reads = 0
  const row = { id: 'pure-row', movimientoId: 'pure-movement', importeCentimos: 1, source: { kind: 'PAGO_FACTURA_RECIBIDA', movimientoId: 'pure-movement' } }
  const recovery = { identity: { actorEffectiveId: 1 }, intent: { idempotencyKey: key, action: 'CONFIRMAR', targetConfirmationOperationId: null } }
  const globals = {
    Date, Set, Map, parseConciliarCommand,
    fail: (_status: number, code: string) => { throw new Error(code) },
    asTx: (tx: unknown) => tx,
    Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
    conciliarHistoryActors: async () => actors,
    resolveConciliarRecoveryIdentity: async () => actors,
    prepareConciliarRecoveryIntent: async () => { events.push('pending'); durable.recovery = 'PENDING'; return recovery },
    assertConciliarLiveAccessTx: async () => { events.push('live-access'); return input.revoked ? { response: { status: 403 } } : {} },
    runWithConciliarSerializableAuthorization: async (_tx: unknown, callback: () => Promise<unknown>) => callback(),
    retryConciliarSerializableP2034: async (callback: () => Promise<unknown>) => callback(),
    waitForSerializableRetry: async () => {},
    assertConciliarRecoveryIntentExecutableTx: async () => { events.push('intent-lock'); return key },
    lockOperationOrReplay: async () => ({ id: receiptId, replay: input.replay === true, result: { ok: true, projectionSynchronized: true, outcomes: [{ id: row.id, ok: true }] } }),
    conciliarRequestHash: () => 'pure-hash',
    conciliarHistoryActorSnapshot: async () => ({}),
    projectionStateAtActionStart: async () => ({ wasDirty: false }),
    readConciliarConfirmBatchForActionTx: async () => ({ rows: [row], onlyBankFees: false, movementIds: ['pure-movement'], kinds: new Set([row.source.kind]) }),
    assertConciliarGreenPrechecksBatchTx: async () => { events.push('g7-live'); g7Reads++ },
    applyConfirmRow: async (tx: { state: State }) => { events.push('financial-write'); tx.state.finance++; tx.state.queue.push('pure-movement'); return { operationB4Id: 'pure-b4', result: { state: 'confirmada' } } },
    assignConciliarDocumentaryCounterpartyTx: async (tx: { state: State }) => { events.push('p1-write'); tx.state.p1++; return null },
    conciliarHistoryLegSnapshot: () => ({}),
    appendLegs: async () => { events.push('legs') },
    deleteConciliarBatchProjectionRowsTx: async (tx: { state: State }) => { events.push('delete-confirmed'); tx.state.rows = [] },
    settleKnownFeeOnlyProjection: async (tx: { state: State }) => { if (input.synchronized) tx.state.queue = []; return input.synchronized === true },
    complete: async (tx: { state: State }, _id: string, _state: string, result: unknown) => { events.push('receipt'); tx.state.receipt = result },
    commitConciliarRecoveryIntentTx: async (tx: { state: State }) => { events.push('recovery-write'); tx.state.recovery = 'COMMITTED'; if (input.failure === 'recovery') throw new Error('fixture-recovery-failure') },
    readConciliarProjectionTx: async () => { events.push('projection-read'); projectionReads++; if (input.failure === 'projection') throw new Error('fixture-projection-failure'); return { rows: [], updatedAt: '2026-01-01T00:00:00.000Z' } },
    db: () => ({ $transaction: async (callback: (tx: { state: State }) => Promise<unknown>, options: { isolationLevel: string }) => {
      assert.equal(durable.recovery, 'PENDING', 'independent prepare is durable before business callback')
      assert.equal(options.isolationLevel, 'Serializable')
      events.push('tx-start')
      const state = structuredClone(durable)
      const result = await callback({ state })
      events.push('tx-commit')
      durable = state
      return result
    } }),
  }
  const run = vm.runInNewContext(code + '\nrunConciliarAction;', globals) as (actor: number, raw: unknown, options: unknown) => Promise<Record<string, unknown>>
  let result: Record<string, unknown> | undefined
  let error: unknown
  try { result = await run(1, command, { onPhase: (name: string, elapsedMs: number) => { phases.push({ name, elapsedMs }); if (input.observerThrows) throw new Error('diagnostic-only') } }) } catch (failure) { error = failure }
  return { durable, events, phases, result, error, projectionReads, g7Reads }
}

async function testFinancialSeam() {
  const deferred = await scenario()
  assert.equal(deferred.error, undefined)
  assert.equal(deferred.result?.projectionSynchronized, false)
  assert.equal(deferred.result?.projection, undefined)
  assert.equal(deferred.projectionReads, 0)
  assert.equal(deferred.g7Reads, 1, 'live G7 retained')
  assert.deepEqual(deferred.durable.queue, ['pure-movement'], 'derived IDs persist after financial COMMIT')
  assert.deepEqual(deferred.durable.rows, [], 'confirmed row removal is atomic with finance/receipt')
  assert.equal(deferred.durable.recovery, 'COMMITTED')
  assert.equal(deferred.durable.finance, 1)
  assert.equal(deferred.durable.p1, 1)
  const before = (left: string, right: string) => assert(deferred.events.indexOf(left) < deferred.events.indexOf(right), `${left} precedes ${right}`)
  before('pending', 'tx-start'); before('live-access', 'g7-live'); before('g7-live', 'financial-write')
  before('p1-write', 'legs'); before('legs', 'delete-confirmed'); before('receipt', 'recovery-write'); before('recovery-write', 'tx-commit')
  const phaseNames = deferred.phases.map(phase => phase.name)
  for (const name of ['require-live-write', 'g7-precheck', 'apply-writes', 'receipt', 'business-result-ready', 'derived-fallback-eliminated', 'recovery-committed', 'response-ready', 'financial-transaction']) assert(phaseNames.includes(name), name)
  assert(deferred.phases.every(phase => Number.isFinite(phase.elapsedMs) && phase.elapsedMs >= 0))

  const fast = await scenario({ synchronized: true })
  assert.equal(fast.result?.projectionSynchronized, true)
  assert.equal(fast.projectionReads, 1)
  assert(fast.events.indexOf('recovery-write') < fast.events.indexOf('projection-read'))
  assert(fast.events.indexOf('projection-read') < fast.events.indexOf('tx-commit'))
  const replay = await scenario({ replay: true })
  assert.equal(replay.result?.projectionSynchronized, false, 'historical replay flag cannot assert today clean')
  assert.equal(replay.projectionReads, 0)
  assert.equal(replay.g7Reads, 0, 'replay does not repeat financial decisions')
  assert.equal(replay.durable.finance, 0)
  assert.equal(replay.durable.recovery, 'COMMITTED')
  for (const failure of ['recovery', 'projection'] as const) {
    const rolledBack = await scenario({ failure, synchronized: failure === 'projection' })
    assert(rolledBack.error)
    assert.equal(rolledBack.durable.recovery, 'PENDING', 'independent prepare survives financial rollback')
    assert.equal(rolledBack.durable.finance, 0)
    assert.equal(rolledBack.durable.p1, 0)
    assert.equal(rolledBack.durable.receipt, null)
    assert.deepEqual(rolledBack.durable.rows, ['pure-row'])
    assert.deepEqual(rolledBack.durable.queue, [])
    assert(!rolledBack.events.includes('tx-commit'))
  }
  const revoked = await scenario({ revoked: true })
  assert(revoked.error)
  assert.equal(revoked.g7Reads, 0)
  assert.equal(revoked.durable.recovery, 'PENDING')
  const diagnostic = await scenario({ observerThrows: true })
  assert.equal(diagnostic.error, undefined, 'telemetry observer failure cannot alter financial COMMIT')
  assert.equal(diagnostic.durable.recovery, 'COMMITTED')
}

async function testNativeWorker() {
  const workerCode = ts.transpileModule(functions(refresh, ['refreshConciliarProjectionIfDirty', 'scheduleConciliarActionProjectionRefresh', 'scheduleConciliarProjectionRefresh']), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const staging of ['1', '0']) {
    let callback: (() => Promise<void>) | undefined
    let calls = 0
    let failRefresh = false
    const logs: unknown[][] = []
    const warnings: unknown[][] = []
    let durableQueue = ['pure-movement']
    const api = vm.runInNewContext(workerCode + '\n({ scheduleConciliarActionProjectionRefresh, scheduleConciliarProjectionRefresh });', {
      Date, process: { env: { FINANCE_STAGING_SANDBOX: staging } },
      console: { info: (...args: unknown[]) => logs.push(args), warn: (...args: unknown[]) => warnings.push(args) },
      after: (task: () => Promise<void>) => { assert.equal(callback, undefined, 'one native after registration per scheduler call'); callback = task },
      refreshAffectedConciliarProjection: async () => { calls++; if (failRefresh) throw new Error('pure-failure'); durableQueue = []; return { projectionSynchronized: true } },
    })
    api.scheduleConciliarProjectionRefresh(1)
    assert.equal(callback, undefined, 'legacy scheduler remains inert')
    api.scheduleConciliarActionProjectionRefresh(1)
    assert.equal(calls, 0, 'no bare fire-and-forget promise before native after')
    assert(callback)
    failRefresh = true
    await callback()
    assert.deepEqual(durableQueue, ['pure-movement'], 'failed worker retains durable pending work')
    assert.equal(warnings.length, 1)
    callback = undefined
    api.scheduleConciliarActionProjectionRefresh(1)
    assert(callback)
    failRefresh = false
    await callback()
    assert.deepEqual(durableQueue, [], 'next authorized scheduling can retry persisted work')
    assert.equal(calls, 2)
    assert.equal(logs.length, staging === '1' ? 4 : 0)
    for (const log of logs) {
      assert.equal(log[0], 'CONCILIAR_REFRESH_PHASE')
      assert(['refresh-start', 'refresh-end'].includes(String(log[1])))
      assert.deepEqual(Object.keys(JSON.parse(String(log[2]))), ['elapsedMs'])
    }
  }
}

function testLoggingContract() {
  const routeAst = ts.createSourceFile('route.ts', route, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  function find(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
    if (predicate(node)) return node
    let result: ts.Node | undefined
    ts.forEachChild(node, child => { if (!result) result = find(child, predicate) })
    return result
  }
  const observer = find(routeAst, node => ts.isVariableDeclaration(node) && node.name.getText(routeAst) === 'actionPhase') as ts.VariableDeclaration
  assert(observer?.initializer)
  const guard = find(observer.initializer, ts.isIfStatement) as ts.IfStatement
  assert.equal(guard.expression.getText(routeAst), "process.env.FINANCE_STAGING_SANDBOX === '1'")
  const logger = find(guard, node => ts.isCallExpression(node) && node.expression.getText(routeAst) === 'console.info') as ts.CallExpression
  assert.equal(logger.arguments[0].getText(routeAst), "'CONCILIAR_ACTION_PHASE'")
  const serialization = logger.arguments[2] as ts.CallExpression
  assert.equal(serialization.expression.getText(routeAst), 'JSON.stringify')
  assert.equal(serialization.arguments[0].getText(routeAst), '{ elapsedMs }')
  const ids: string[] = []
  function collect(node: ts.Node) { if (ts.isIdentifier(node)) ids.push(node.text); ts.forEachChild(node, collect) }
  collect(observer.initializer)
  assert(!ids.some(id => ['request', 'command', 'parsed', 'access', 'actorId', 'result', 'body', 'idempotencyKey'].includes(id)))
  const phaseType = ast.statements.find((node): node is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(node) && node.name.text === 'ConciliarActionPhase')
  assert(phaseType && ts.isUnionTypeNode(phaseType.type))
  assert(phaseType.type.types.every(type => ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)), 'observer phase names are a closed technical list')
}

async function main() {
  testLoggingContract()
  await testFinancialSeam()
  await testNativeWorker()
  console.log(JSON.stringify({ test: 'conciliar-deferred-refresh', databaseQueries: 0, networkCalls: 0, passed: true, verified: ['no-full-fallback-in-financial-tx', 'live-access-and-g7', 'atomic-p1-b4-removal-receipt-recovery', 'rollback-remains-pending', 'replay-safe-view', 'local-fastpath-preserved', 'derived-write-targets-only', 'native-after-retry', 'staging-only-relative-phases'] }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
