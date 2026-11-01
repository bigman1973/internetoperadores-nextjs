/* Prueba estática pura: no importa Prisma, handlers, red ni base de datos. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const actions = readFileSync(resolve(root, 'lib/finanzas/conciliar-actions.ts'), 'utf8')
const projection = readFileSync(resolve(root, 'lib/finanzas/conciliar-db.ts'), 'utf8')
const helper = readFileSync(resolve(root, 'lib/finanzas/conciliar-fee-undo.ts'), 'utf8')
const route = readFileSync(resolve(root, 'app/api/admin/finanzas/conciliar/route.ts'), 'utf8')
const affectedRefresh = readFileSync(resolve(root, 'lib/finanzas/conciliar-affected-refresh.ts'), 'utf8')

const confirm = actions.slice(actions.indexOf('async function confirmStandard'), actions.indexOf('async function confirmHumanOwnTransfers'))
const undo = actions.slice(actions.indexOf('async function undo('), actions.indexOf('export async function runConciliarAction'))
const restore = projection.slice(projection.indexOf('export async function restoreLiveBankFeeProjectionBatchTx'), projection.indexOf('type StrictTransferLeg'))
const constructor = helper.slice(helper.indexOf('export function buildBankFeeProjectionSeed'), helper.length)
const command = actions.slice(actions.indexOf('export async function runConciliarTransactionCommand'), actions.indexOf('export type ConciliarActionRunOptions'))

assert.match(confirm, /sourceKind: row\.source\.kind/, 'la confirmación persiste el kind de cada pata para no reclasificar recibos históricos')
assert.match(undo, /if \(receipt\.replay\) return[\s\S]*const stateAtStart = await projectionStateAtActionStart\(tx\)/, 'un replay se resuelve antes de capturar/restaurar')
assert.match(undo, /const stateAtStart = await projectionStateAtActionStart\(tx\)[\s\S]*for \(const leg of legs\)/, 'la foto se bloquea antes de P1/B4 undo')
assert.match(undo, /undoConciliarDocumentaryCounterpartyTx[\s\S]*undoB4Leg[\s\S]*UPDATE operaciones_conciliar[\s\S]*restoreKnownFeeOnlyProjection/, 'P1, B4 y auditoría conservan su orden antes de restaurar')
assert.match(undo, /const projectionSynchronized = await restoreKnownFeeOnlyProjection\(tx, stateAtStart, legs\)/)
assert.match(actions, /knownBankFeeUndoMovements[\s\S]*restoreLiveBankFeeProjectionBatchTx/, 'undo single y lote pasan por la misma guarda y restauración')
assert.match(restore, /movimientoIds\.length < 1 \|\| movimientoIds\.length > 100 \|\| new Set\(movimientoIds\)\.size !== movimientoIds\.length/, 'el SQL sólo recibe lotes 1..100 sin ids repetidos')
assert.match(restore, /const ids = Prisma\.join\(movimientoIds\.map\(movimientoId => Prisma\.sql`\$\{movimientoId\}`\)\)/, 'los ids se interpolan como fragmentos Prisma parametrizados')
assert.doesNotMatch(restore, /\$queryRawUnsafe|\$executeRawUnsafe/, 'el lote no admite SQL inseguro')
assert.match(restore, /WHERE m\.id IN \(\$\{ids\}\)[\s\S]*FOR UPDATE OF m,c/, 'todas las fuentes vivas se bloquean en una consulta parametrizada')
assert.match(restore, /movements\.length !== movimientoIds\.length[\s\S]*currentByMovementId\.size !== movimientoIds\.length/, 'toda fuente debe estar presente y ser única antes de insertar')
assert.match(restore, /decisiones_tercero_modo_facil[\s\S]*d\.movimiento_id IN \(\$\{ids\}\)[\s\S]*FOR UPDATE OF d/, 'P1 vigente bloquea la restauración completa')
assert.match(restore, /conciliar_proyecciones[\s\S]*movimiento_id IN \(\$\{ids\}\)[\s\S]*FOR UPDATE/, 'una fila existente para cualquier movimiento impide restaurar')
assert.match(restore, /for \(const movimientoId of movimientoIds\)[\s\S]*buildBankFeeProjectionSeed[\s\S]*rows\.push[\s\S]*const sealedRows = await sealConciliarProjectionRowsTx\(tx, rows\)[\s\S]*insertProjectionBatches\(tx, sealedRows\)/, 'todas las fuentes se reclasifican y pasan G7 antes de una inserción canónica')
assert.match(restore, /restoreLiveBankFeeProjectionBatchTx\(base, \[movimientoId\]\)/, 'el caso single usa exactamente la vía batch')
assert.doesNotMatch(restore, /decisionHash|sourceFingerprint\s*:\s*.*old|cached/i, 'la restauración no reutiliza hash ni fingerprint histórico')
assert.match(helper, /input\.wasDirty \|\| input\.legs\.length < 1 \|\| input\.legs\.length > MAX_BANK_FEE_UNDO_LEGS/, 'dirty previo, vacío o más de 100 patas caen al rebuild manual')
assert.match(helper, /movementIds\.has\(movimientoId\) \|\| operationB4Ids\.has\(operationB4Id\)/, 'duplicados de fuente o B4 caen al rebuild manual')
assert.match(helper, /sourceKind\(leg\.result\) !== 'COMISION_BANCARIA'/, 'recibos legacy o de otro tipo conservan dirty')
assert.match(helper, /knownBankFeeUndoMovements\(input\)/, 'la garantía single se delega en el clasificador batch')
assert.match(helper, /parsed\.toISOString\(\)\.slice\(0, 10\) === value/, 'la fecha de fuente debe ser civilmente válida, no sólo ISO superficial')
assert.match(constructor, /isConciliarBankFee\(/, 'la fuente viva vuelve a pasar la regla de comisión')
assert.match(projection, /const fee = buildBankFeeProjectionSeed\(/, 'el rebuild global comparte el mismo constructor')
assert.match(command, /refreshAffectedConciliarProjectionTx\(tx, actorId\)/, 'las acciones cierran la cola derivada dentro de su transacción')
assert.match(affectedRefresh, /area3_conciliar_projection_changes/)
assert.match(affectedRefresh, /rebuildConciliarProjectionTx\(tx, actorId, scope\)/)
assert.doesNotMatch(affectedRefresh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''), /\b(fetch|https?:|azure|graph|email|correo|webhook|importar|sync)\b/i)
assert.match(route, /scheduleConciliarActionProjectionRefresh/, 'el handler sólo agenda el cierre afectado posterior a su acción')
assert.doesNotMatch(route, /scheduleConciliarProjectionRefresh\(/, 'el handler no llama la compatibilidad inerte ni agenda desde GET')

console.log(JSON.stringify({
  test: 'conciliar-fee-undo-static', databaseQueries: 0, networkCalls: 0,
  verified: ['sourceKind-persisted', 'replay-before-restore', 'for-update-clean-baseline', 'p1-b4-audit-order', 'batch-1-100', 'parameterized-sql-fragments', 'locked-live-sources', 'all-or-nothing-revalidation', 'one-canonical-insert', 'single-compatible', 'civil-date', 'no-historical-hash', 'shared-constructor', 'manual-rebuild-fallback'],
}))
