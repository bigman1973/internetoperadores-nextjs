/* Prueba estática pura: no importa handlers, Prisma, red ni base de datos. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'lib/finanzas/conciliar-actions.ts'), 'utf8')
const batch = readFileSync(resolve(root, 'lib/finanzas/conciliar-batch.ts'), 'utf8')
const stateLock = source.slice(source.indexOf('async function projectionStateAtActionStart'), source.indexOf('async function settleKnownFeeOnlyProjection'))
const fastPath = source.slice(source.indexOf('async function settleKnownFeeOnlyProjection'), source.indexOf('async function lockOperationOrReplay'))
const confirm = source.slice(source.indexOf('async function confirm('), source.indexOf('async function ask('))

assert.match(stateLock, /WHERE singleton=true LIMIT 1 FOR UPDATE/)
assert.doesNotMatch(stateLock, /LIMIT 1 FOR SHARE/, 'la acción no debe retener un bloqueo compartido antes de que los triggers necesiten actualizar el marcador')
assert.match(fastPath, /stateAtStart\.wasDirty \|\| kinds\.size !== 1 \|\| !kinds\.has\('COMISION_BANCARIA'\)/)
assert.match(fastPath, /WHERE singleton=true AND dirty_at IS NOT NULL/)
assert.match(fastPath, /SET dirty_at=NULL,dirty_reason=NULL/)
assert.doesNotMatch(fastPath, /rebuildConciliarProjection|fetch|https?:/i)
assert.match(confirm, /const stateAtStart = await projectionStateAtActionStart\(tx\)/)
assert.match(confirm, /const plan = await readConciliarConfirmBatchForActionTx\(tx, command\.items, fail\)/)
assert.match(batch, /const kinds = new Set<ConciliarProjectionSource\['kind'\]>/)
assert.match(batch, /kinds\.add\(row\.source\.kind\)/)
assert.match(confirm, /await deleteConciliarBatchProjectionRowsTx\(tx, plan\.movementIds\)/)
assert.match(batch, /DELETE FROM conciliar_proyecciones\s+WHERE movimiento_id IN/)
assert.match(confirm, /await settleKnownFeeOnlyProjection\(tx, stateAtStart, plan\.kinds\)/)

console.log(JSON.stringify({ test: 'conciliar-fee-fast-refresh', databaseQueries: 0, networkCalls: 0, verified: ['only-clean-fee-batch', 'same-transaction-removal', 'dirty-marker-retained-otherwise'] }))
