/* Inspección estática: no importa handlers, Prisma ni proveedores. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const refresh = read('lib/finanzas/conciliar-refresh.ts')
const affected = read('lib/finanzas/conciliar-affected-refresh.ts')
const actions = read('lib/finanzas/conciliar-actions.ts')
const route = read('app/api/admin/finanzas/conciliar/route.ts')
const assembly = read('lib/finanzas/sync-jobs/assembly.ts')
const remesas = read('app/api/admin/finanzas/conciliacion-remesas/importar-pdf/route.ts')
const confirming = read('app/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings/route.ts')

assert.match(refresh, /refreshConciliarProjectionIfDirty/)
assert.match(refresh, /rebuilt: false, projectionSynchronized: false, reason: 'MANUAL_REBUILD_REQUIRED'/)
assert.match(refresh, /scheduleConciliarProjectionRefresh\(_actorId: number \| null\): void/)
assert.doesNotMatch(refresh.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''), /import\s.*next\/server|\bafter\s*\(|refreshAffectedConciliarProjection|rebuildConciliarProjection|fetch|https?:/i, 'el hook no agenda, no reconstruye ni llama red')

assert.match(affected, /SELECT rebuilt_at IS NOT NULL AS ready,dirty_at IS NOT NULL AS dirty/)
assert.match(affected, /WHERE singleton=true LIMIT 1 FOR UPDATE/)
assert.match(affected, /INITIAL_MANUAL_REBUILD_REQUIRED/)
assert.match(affected, /MANUAL_REBUILD_REQUIRED/)
assert.match(affected, /return \{ projectionSynchronized: true as const \}/)
assert.doesNotMatch(affected, /area3_conciliar_projection_changes|rebuildConciliarProjection|fetch|https?:/i, 'sin cola durable no se infiere un scope de refresh')

const command = actions.slice(actions.indexOf('export async function runConciliarTransactionCommand'), actions.indexOf('export type ConciliarActionRunOptions'))
assert.match(command, /result\.idempotent !== true && result\.projectionSynchronized !== true/)
assert.match(command, /SET dirty_at=COALESCE\(dirty_at,CURRENT_TIMESTAMP\)/)
assert.match(command, /dirty_reason=CASE WHEN dirty_at IS NULL THEN 'CONCILIAR_ACCION' ELSE dirty_reason END/)
assert.ok(command.indexOf("dirty_reason=CASE WHEN dirty_at IS NULL THEN 'CONCILIAR_ACCION'") < command.indexOf('refreshAffectedConciliarProjectionTx'), 'dirty se fija antes de la lectura conservadora')
assert.doesNotMatch(route, /scheduleConciliarProjectionRefresh|conciliar-refresh/, 'la ruta Conciliar no agenda rebuild implícito')

assert.match(assembly, /import \{ scheduleConciliarProjectionRefresh \} from '@\/lib\/finanzas\/conciliar-refresh'/)
assert.match(assembly, /finally \{[\s\S]*if \(imported\) scheduleConciliarProjectionRefresh\(null\)/)
assert.match(remesas, /import \{ scheduleConciliarProjectionRefresh \} from '@\/lib\/finanzas\/conciliar-refresh'/)
assert.match(remesas, /if \(actorId !== null\) scheduleConciliarProjectionRefresh\(actorId\)/)
assert.match(remesas, /if \(actorId !== null && \(importados > 0 \|\| actualizados > 0\)\) scheduleConciliarProjectionRefresh\(actorId\)/)
const devoluciones = remesas.slice(remesas.indexOf('async function procesarDevoluciones'), remesas.indexOf('async function procesarRecibosDevueltos'))
assert.doesNotMatch(devoluciones, /scheduleConciliarProjectionRefresh/, 'la vista de devoluciones sin DML no programa ni siquiera el hook vacío')
assert.match(confirming, /C9_CONFIRMING_REQUIERE_CLASIFICACION_Y_CONFIRMACION_HUMANA/)
assert.doesNotMatch(confirming, /scheduleConciliarProjectionRefresh/, 'el confirming bloqueado no programa refrescos ni ejecuta importación')

console.log('Callbacks de refresh de Conciliar verificados: hook compatibilidad no operativo, marcador dirty conservado y rebuild sólo manual; no se abrió red ni base de datos.')
