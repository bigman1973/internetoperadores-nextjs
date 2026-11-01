/* Prueba estática pura: no importa Prisma, handlers, red ni base de datos. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const db = read('lib/finanzas/conciliar-db.ts')
const reader = read('lib/finanzas/conciliar-projection-read.ts')
const refresh = read('lib/finanzas/conciliar-affected-refresh.ts')
const actions = read('lib/finanzas/conciliar-actions.ts')
const productionSchema = read('prisma/production/20261028-conciliar/01-20261026_conciliar_backend_projection.sql')

const unavailable = [
  'area3_conciliar_projection_changes',
  'read_metadata',
  'read_accounts',
  'materializeConciliarReadMetadata',
  'ConciliarAffectedProjectionScope',
  'ConciliarProjectionChange',
]
for (const source of [db, reader, refresh, actions]) {
  for (const token of unavailable) assert.doesNotMatch(source, new RegExp(token), `no debe requerir ${token}`)
}

assert.match(productionSchema, /CREATE TABLE "conciliar_proyecciones"/)
assert.match(productionSchema, /"source" jsonb NOT NULL/)
assert.match(productionSchema, /CREATE TABLE "estado_proyeccion_conciliar"/)
assert.match(productionSchema, /"dirty_at" timestamptz NULL/)
assert.match(productionSchema, /"projection_version" bigint NOT NULL/)

const readBundle = reader.slice(reader.indexOf('async function readProjectionBundle'), reader.indexOf('async function projectionResponse'))
assert.equal((readBundle.match(/\bclient\.\$queryRaw/g) ?? []).length, 1, 'la portada debe conservar una única SELECT')
assert.match(readBundle, /WITH projection_state AS \(/)
assert.match(readBundle, /effective_projection AS \(/)
assert.match(readBundle, /requested_movements AS \(/)
assert.match(readBundle, /latest_document_request AS \(/)
assert.match(readBundle, /current_request_files AS \(/)
assert.match(readBundle, /account_rows AS \(/)
assert.match(readBundle, /FROM cuentas_bancarias WHERE activa=true/)
assert.match(readBundle, /COALESCE\(\(SELECT json_agg\(row_to_json\(account_rows\)/)
assert.match(readBundle, /COALESCE\(\(SELECT json_agg\(row_to_json\(d\) ORDER BY movimiento_id\) FROM document_requests d\),'\[\]'::json\) AS "documentRequests"/)
assert.doesNotMatch(readBundle, /\b(?:INSERT|UPDATE|DELETE|rebuildConciliarProjection|fetch)\b/i, 'GET no escribe ni reconstruye')

const readResponse = reader.slice(reader.indexOf('async function projectionResponse'), reader.indexOf('export async function readConciliarRow'))
assert.match(readResponse, /jsonRecords\(bundle\.rows, 'Las filas'\)/)
assert.match(readResponse, /parseParaPedirRequestMetadataRows\(jsonRecords\(bundle\.documentRequests/)
assert.match(readResponse, /rows\.map\(row=>projectionRow\(row,!!state\?\.dirtyAt\)\)/)
assert.match(reader, /p\.source->>'g7Precheck'/)
assert.match(reader, /CONCILIAR_GREEN_PENDING_REASON/)
assert.match(reader, /stale: !!state\?\.dirtyAt/)

const actionState = actions.slice(actions.indexOf('async function projectionStateAtActionStart'), actions.indexOf('async function lockOperationOrReplay'))
assert.match(actionState, /WHERE singleton=true LIMIT 1 FOR UPDATE/)
assert.doesNotMatch(actionState, /area3_conciliar_projection_changes/)
assert.match(actionState, /stateAtStart\.wasDirty \|\| kinds\.size !== 1 \|\| !kinds\.has\('COMISION_BANCARIA'\)/)
assert.match(actionState, /WHERE singleton=true AND dirty_at IS NOT NULL/)

const confirm = actions.slice(actions.indexOf('async function confirmStandard'), actions.indexOf('async function confirmHumanOwnTransfers'))
assert.ok(confirm.indexOf('for (const row of selectedRows) await assertConciliarGreenPrecheckTx(tx,row)') < confirm.indexOf('await tryConfirmConciliarBankFeeBatchTx'), 'G7 debe preceder el DML de comisiones')
assert.ok(confirm.indexOf('for (const row of selectedRows) await assertConciliarGreenPrecheckTx(tx,row)') < confirm.indexOf('await deleteConciliarBatchProjectionRowsTx'), 'G7 debe preceder la retirada de filas')
assert.match(confirm, /settleKnownFeeOnlyProjection\(tx, stateAtStart, plan\.kinds\)/)

const ask = actions.slice(actions.indexOf('async function ask('), actions.indexOf('async function undo('))
assert.match(ask, /SET dirty_at=COALESCE\(dirty_at,CURRENT_TIMESTAMP\)/)
assert.match(ask, /dirty_reason=CASE WHEN dirty_at IS NULL THEN 'GESTION_B5' ELSE dirty_reason END/)
assert.match(ask, /const projectionSynchronized = false/)
assert.doesNotMatch(ask, /rebuildConciliarProjection|area3_conciliar_projection_changes|read_metadata/)

const runCommand = actions.slice(actions.indexOf('export async function runConciliarTransactionCommand'), actions.indexOf('export type ConciliarActionRunOptions'))
assert.match(runCommand, /result\.idempotent !== true && result\.projectionSynchronized !== true/)
assert.match(runCommand, /SET dirty_at=COALESCE\(dirty_at,CURRENT_TIMESTAMP\)/)
assert.match(runCommand, /dirty_reason=CASE WHEN dirty_at IS NULL THEN 'CONCILIAR_ACCION' ELSE dirty_reason END/)
assert.ok(runCommand.indexOf("dirty_reason=CASE WHEN dirty_at IS NULL THEN 'CONCILIAR_ACCION'") < runCommand.indexOf('refreshAffectedConciliarProjectionTx'), 'dirty debe fijarse antes del refresco conservador')

assert.match(refresh, /INITIAL_MANUAL_REBUILD_REQUIRED/)
assert.match(refresh, /MANUAL_REBUILD_REQUIRED/)
assert.match(refresh, /return \{ projectionSynchronized: true as const \}/)
assert.doesNotMatch(refresh, /rebuildConciliarProjection|area3_conciliar_projection_changes|fetch|https?:/i)

const rebuild = db.slice(db.indexOf('export async function rebuildConciliarProjectionTx'), db.indexOf('export async function rebuildConciliarProjection('))
assert.match(rebuild, /const sealedRows = await sealConciliarProjectionRowsTx\(tx, guardedRows\)/)
assert.ok(rebuild.indexOf('const sealedRows = await sealConciliarProjectionRowsTx') < rebuild.indexOf('DELETE FROM conciliar_proyecciones'), 'G7 se sella antes de cualquier DML de proyección')
assert.match(rebuild, /INSERT INTO estado_proyeccion_conciliar\(singleton,dirty_at,dirty_reason,rebuilt_at,rebuilt_by_id,projection_version\)/)
assert.match(rebuild, /SET dirty_at=NULL,dirty_reason=NULL/)

console.log(JSON.stringify({
  test: 'conciliar-projection-prod7-schema',
  databaseQueries: 0,
  networkCalls: 0,
  verified: ['absence-of-additive-schema', 'present-prod7-json-state', 'dirty-preserved', 'g7-before-dml', 'single-read-json-bundle'],
}))
