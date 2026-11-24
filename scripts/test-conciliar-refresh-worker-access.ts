import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const path = 'lib/finanzas/conciliar-affected-refresh.ts'
const source = readFileSync(path, 'utf8')
const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const declaration = tree.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'refreshAffectedConciliarProjection')
assert.ok(declaration)
const code = ts.transpileModule(declaration.getText(tree).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText
assert.doesNotMatch(declaration.getText(tree), /runWithConciliarSerializableAuthorization|commitConciliarRecoveryIntentTx|prepareConciliarRecoveryIntent/)
assert.match(source, /SELECT rebuilt_at IS NOT NULL AS ready,dirty_at IS NOT NULL AS dirty[\s\S]*LIMIT 1 FOR UPDATE/)

async function check(actorId: number | null, options: { denied?: boolean; runtimeFails?: boolean } = {}) {
  const calls: string[] = []
  const tx = Object.freeze({ workerTransaction: true })
  const fn = vm.runInNewContext(`${code}\nrefreshAffectedConciliarProjection`, {
    Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
    prisma: { $transaction: async (callback: (base: unknown) => unknown, transactionOptions: { isolationLevel: string }) => {
      calls.push('transaction')
      assert.equal(transactionOptions.isolationLevel, 'Serializable')
      return callback(tx)
    } },
    assertConciliarRuntime: async (base: unknown) => {
      assert.equal(base, tx)
      calls.push('runtime')
      if (options.runtimeFails) throw new Error('RUNTIME_DISABLED')
    },
    assertConciliarLiveAccessTx: async (base: unknown, id: number) => {
      assert.equal(base, tx)
      assert.equal(id, actorId)
      calls.push('live-access')
      return options.denied ? { response: { status: 403 } } : { actor: { id } }
    },
    refreshAffectedConciliarProjectionTx: async (base: unknown, id: number) => {
      assert.equal(base, tx)
      assert.equal(id, actorId)
      calls.push('derived-refresh')
      return { projectionSynchronized: true }
    },
  }) as (id: number | null) => Promise<{ projectionSynchronized: boolean }>
  return { calls, run: () => fn(actorId) }
}

async function main() {
  for (const invalid of [null, 0, -1, Number.NaN, 1.5]) {
    const scenario = await check(invalid)
    await assert.rejects(scenario.run, /CONCILIAR_REFRESH_ACTOR_REQUIRED/)
    assert.deepEqual(scenario.calls, [], 'No transaction or derived write before actor validation')
  }
  const denied = await check(3, { denied: true })
  await assert.rejects(denied.run, /CONCILIAR_REFRESH_ACCESS_REVOKED/)
  assert.deepEqual(denied.calls, ['transaction', 'runtime', 'live-access'])
  const disabled = await check(3, { runtimeFails: true })
  await assert.rejects(disabled.run, /RUNTIME_DISABLED/)
  assert.deepEqual(disabled.calls, ['transaction', 'runtime'])
  const valid = await check(3)
  assert.equal((await valid.run()).projectionSynchronized, true)
  assert.deepEqual(valid.calls, ['transaction', 'runtime', 'live-access', 'derived-refresh'])
  console.log(JSON.stringify({ test: 'conciliar-refresh-worker-access', passed: 8, databaseQueries: 0, financialWrites: 0, preserved: ['own-serializable-transaction', 'effective-live-write-acl', 'runtime-fail-closed', 'existing-lock-order', 'no-financial-marker-inheritance'] }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
