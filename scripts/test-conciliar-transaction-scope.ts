import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const source = (relative: string) => readFileSync(resolve(root, relative), 'utf8')
const mustContain = (relative: string, fragment: string) => {
  assert.ok(source(relative).includes(fragment), `${relative} must contain ${fragment}`)
}
const mustNotContain = (relative: string, fragment: string) => {
  assert.ok(!source(relative).includes(fragment), `${relative} must not contain ${fragment}`)
}

const auth = 'lib/finanzas/reconciliation-auth.ts'
mustContain(auth, 'database:B4AccessClient=prisma')
mustContain(auth, 'database.usuarioAdmin.findUnique')
mustContain(auth, 'admin.rol, database)')
mustContain(auth, 'database.permisoUsuario.count')

const prototype = 'lib/finanzas/prototype-staging.ts'
mustContain(prototype, 'getFinanceEasyRuntimeContext(identityClient?: FinanceEasyIdentityQueryClient)')
mustContain(prototype, 'identityClient ? await identityFrom(identityClient) : await liveIdentity()')
mustContain(prototype, 'assertFinanceEasyRuntime(identityClient?: FinanceEasyIdentityQueryClient)')

const runtime = 'lib/finanzas/finance-runtime-safety.ts'
mustContain(runtime, 'assertFinanceRuntimeReady(database?: FinanceRuntimeIdentityClient)')
mustContain(runtime, 'assertFinanceRuntimeIdentity(database ?? prisma')

const reconciliation = 'lib/finanzas/easy-reconciliation-db.ts'
mustContain(reconciliation, "requireB4ActorAccess(actorId, 'escritura', tx)")
mustContain(reconciliation, 'await assertFinanceEasyRuntime(work)')
mustContain(reconciliation, "requireB4ActorAccess(actorId, 'escritura', work)")

const counterparty = 'lib/finanzas/easy-counterparty-db.ts'
mustContain(counterparty, "requireB4ActorAccess(actorId, 'escritura', tx)")
mustContain(counterparty, 'await assertFinanceEasyRuntime(work)')
mustContain(counterparty, "requireB4ActorAccess(actorId, 'escritura', work)")

const conciliarCounterparty = 'lib/finanzas/conciliar-counterparty.ts'
mustContain(conciliarCounterparty, "requireB4ActorAccess(input.actorId, 'escritura', work)")

const confirming = 'lib/finanzas/conciliar-confirming.ts'
mustContain(confirming, 'await assertFinanceRuntimeReady(tx as unknown as Prisma.TransactionClient)')
mustContain(confirming, "requireB4ActorAccess(actorId, 'escritura', tx as unknown as Prisma.TransactionClient)")
mustNotContain(confirming, 'await assertFinanceRuntimeReady()')

console.log(JSON.stringify({
  transactionScopedGuardReads: true,
  globalQueriesFromSyntheticTest: 0,
  databaseQueries: 0,
}))
