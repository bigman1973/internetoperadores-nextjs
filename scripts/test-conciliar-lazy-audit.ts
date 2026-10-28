import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'

async function main() {
  const scope = new AsyncLocalStorage<boolean>()
  const observed: boolean[] = []
  const lazy = (): PromiseLike<number> => ({ then(resolve: any) { observed.push(scope.getStore() === true); return Promise.resolve(resolve(1)) } })
  await scope.run(true, () => lazy())
  assert.equal(observed.pop(), false, 'Una PrismaPromise perezosa retorna antes de evaluarse dentro del contexto')
  await scope.run(true, async () => await lazy())
  assert.equal(observed.pop(), true, 'La consulta se evalúa dentro del contexto con await interno')
  const source = readFileSync('lib/prisma.ts', 'utf8')
  assert.equal((source.match(/auditScope\.run\(true, async \(\) => await tx\.\$(?:queryRaw|executeRaw)/g) ?? []).length, 2)
  assert.equal((source.match(/auditScope\.run\(true, \(\) => tx\./g) ?? []).length, 0)
  assert.ok(source.includes('FOR SHARE OF s'), 'La protección frente a salida concurrente se mantiene')
  assert.ok(source.includes('await append(tx, context'), 'La auditoría de éxito sigue siendo transaccional')
  console.log(JSON.stringify({ lazyQueryScopeRegression: true, internalGuardQueriesAwaitedInsideScope: 2, liveSessionLockPreserved: true, databaseQueries: 0 }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
