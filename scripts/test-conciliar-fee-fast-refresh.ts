/* Prueba estática pura: no importa handlers, Prisma, red ni base de datos. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const source = readFileSync(resolve(root, 'lib/finanzas/conciliar-actions.ts'), 'utf8')
const batch = readFileSync(resolve(root, 'lib/finanzas/conciliar-batch.ts'), 'utf8')
const stateLock = source.slice(source.indexOf('async function projectionStateAtActionStart'), source.indexOf('async function settleKnownFeeOnlyProjection'))
const fastPath = source.slice(source.indexOf('async function settleKnownFeeOnlyProjection'), source.indexOf('async function lockOperationOrReplay'))
const confirmStandard = source.slice(source.indexOf('async function confirmStandard'), source.indexOf('async function confirmHumanOwnTransfers'))
const undo = source.slice(source.indexOf('async function undo('), source.indexOf('export async function runConciliarAction'))
const command = source.slice(source.indexOf('export async function runConciliarTransactionCommand'), source.indexOf('export type ConciliarActionRunOptions'))

assert.match(stateLock, /WHERE singleton=true LIMIT 1 FOR UPDATE/)
assert.match(stateLock, /SELECT COUNT\(\*\)::bigint AS total FROM area3_conciliar_projection_changes LIMIT 1/)
assert.doesNotMatch(stateLock, /LIMIT 1 FOR SHARE/, 'la acción no debe retener un bloqueo compartido antes de que los triggers necesiten actualizar el marcador')
assert.match(fastPath, /stateAtStart\.wasDirty \|\| kinds\.size !== 1 \|\| !kinds\.has\('COMISION_BANCARIA'\)/)
assert.match(fastPath, /WHERE singleton=true AND dirty_at IS NOT NULL/)
assert.match(fastPath, /SET dirty_at=NULL,dirty_reason=NULL/)
assert.match(fastPath, /DELETE FROM area3_conciliar_projection_changes WHERE kind='MOVEMENT' AND source_id IN/)
assert.doesNotMatch(fastPath, /source_id NOT IN/, 'una comisión no puede borrar entradas de cola fuera de su lote exacto')
assert.doesNotMatch(fastPath, /rebuildConciliarProjection|fetch|https?:/i)
assert.match(confirmStandard, /const stateAtStart = await projectionStateAtActionStart\(tx\)/)
assert.match(confirmStandard, /const plan = await readConciliarConfirmBatchForActionTx\(tx, command\.items, fail\)/)
assert.match(batch, /const kinds = new Set<ConciliarProjectionSource\['kind'\]>/)
assert.match(batch, /kinds\.add\(row\.source\.kind\)/)
assert.match(confirmStandard, /await deleteConciliarBatchProjectionRowsTx\(tx, plan\.movementIds\)/)
assert.match(batch, /DELETE FROM conciliar_proyecciones\s+WHERE movimiento_id IN/)
assert.match(confirmStandard, /await settleKnownFeeOnlyProjection\(tx, stateAtStart, plan\.kinds, plan\.movementIds\)/)
assert.match(fastPath, /knownBankFeeUndoMovements[\s\S]*restoreLiveBankFeeProjectionBatchTx/, 'undo debe restaurar inmediatamente tanto lote como single mediante la misma vía')
assert.match(undo, /UPDATE operaciones_conciliar[\s\S]*restoreKnownFeeOnlyProjection/, 'la restauración inmediata sigue después de auditoría')
assert.match(command, /refreshAffectedConciliarProjectionTx\(tx, actorId\)/, 'el resto de acciones recibe cierre afectado dentro de la misma transacción')
assert.match(command, /const projection = await responseProjection\(/, 'la UI recibe una foto posterior sólo desde la transacción ya cerrada')

console.log(JSON.stringify({ test: 'conciliar-fee-fast-refresh', databaseQueries: 0, networkCalls: 0, verified: ['only-clean-fee-batch', 'exact-queue-deletion', 'same-transaction-removal', 'batch-and-single-immediate-undo-restore', 'dirty-marker-retained-otherwise'] }))
