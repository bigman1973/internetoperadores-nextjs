/* Prueba estática pura: no importa Prisma, handlers, red ni base de datos. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const actions = readFileSync(resolve(root, 'lib/finanzas/conciliar-actions.ts'), 'utf8')
const projection = readFileSync(resolve(root, 'lib/finanzas/conciliar-db.ts'), 'utf8')
const helper = readFileSync(resolve(root, 'lib/finanzas/conciliar-fee-undo.ts'), 'utf8')
const route = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliar/route.ts'), 'utf8')

const confirm = actions.slice(actions.indexOf('async function confirm('), actions.indexOf('async function ask('))
const undo = actions.slice(actions.indexOf('async function undo('), actions.indexOf('export async function runConciliarAction'))
const restore = projection.slice(projection.indexOf('export async function restoreLiveBankFeeProjectionTx'), projection.indexOf('type StrictTransferLeg'))
const constructor = helper.slice(helper.indexOf('export function buildBankFeeProjectionSeed'), helper.length)

assert.match(confirm, /sourceKind: row\.source\.kind/, 'la confirmación debe persistir el kind de cada pata')
assert.match(undo, /if \(receipt\.replay\) return[\s\S]*const stateAtStart = await projectionStateAtActionStart\(tx\)/, 'un replay se resuelve antes de capturar/restaurar')
assert.match(undo, /const stateAtStart = await projectionStateAtActionStart\(tx\)[\s\S]*for \(const leg of legs\)/, 'la foto se bloquea antes de P1/B4 undo')
assert.match(undo, /undoConciliarDocumentaryCounterpartyTx[\s\S]*undoB4Leg[\s\S]*UPDATE operaciones_conciliar[\s\S]*restoreKnownFeeOnlyProjection/, 'P1, B4 y auditoría conservan su orden antes de restaurar')
assert.match(undo, /const projectionSynchronized = await restoreKnownFeeOnlyProjection\(tx, stateAtStart, legs\)/)
assert.match(restore, /COALESCE\(e\.estado::text,'SIN_DOCUMENTO'\)='SIN_DOCUMENTO'/)
assert.match(restore, /m\.id AS "movimientoId"/, 'la fila SQL viva debe alimentar el constructor con el nombre de campo esperado')
assert.match(restore, /FOR UPDATE OF m,c/)
assert.match(restore, /decisiones_tercero_modo_facil[\s\S]*LIMIT 1 FOR UPDATE/, 'P1 vigente es una incompatibilidad bloqueada')
assert.match(restore, /conciliar_proyecciones WHERE movimiento_id=\$\{movimientoId\}[\s\S]*FOR UPDATE/, 'una fila existente para el movimiento es incompatibilidad')
assert.match(restore, /buildBankFeeProjectionSeed\(current\)[\s\S]*insertProjectionBatches\(tx, \[row\]\)/, 'la reinserción usa la construcción y serialización canónicas')
assert.doesNotMatch(restore, /decisionHash|sourceFingerprint\s*:\s*.*old|cached/i, 'la restauración no reutiliza hash ni fingerprint histórico')
assert.match(helper, /input\.wasDirty \|\| input\.legs\.length !== 1/, 'dirty previo o varias patas deben caer al rebuild')
assert.match(helper, /sourceKind\(leg\.result\) !== 'COMISION_BANCARIA'/, 'recibos legacy o de otro tipo deben caer al rebuild')
assert.match(helper, /parsed\.toISOString\(\)\.slice\(0, 10\) === value/, 'la fecha de fuente debe ser civilmente válida, no sólo ISO superficial')
assert.match(constructor, /isConciliarBankFee\(/, 'la fuente viva vuelve a pasar la regla de comisión')
assert.match(projection, /const fee = buildBankFeeProjectionSeed\(/, 'el rebuild global comparte el mismo constructor')
assert.match(route, /scheduleConciliarProjectionRefresh\(access\.actor\.id\)/, 'el fallback full rebuild tras dirty sigue programado')

console.log(JSON.stringify({
  test: 'conciliar-fee-undo-static', databaseQueries: 0, networkCalls: 0,
  verified: ['sourceKind-persisted', 'replay-before-restore', 'for-update-clean-baseline', 'p1-b4-audit-order', 'live-sql-shape', 'civil-date', 'locked-live-source', 'no-historical-hash', 'shared-constructor', 'full-rebuild-fallback'],
}))
