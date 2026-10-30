/* Inspección estática: no importa handlers, Prisma ni proveedores. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const refresh = read('lib/finanzas/conciliar-refresh.ts')
const assembly = read('lib/finanzas/sync-jobs/assembly.ts')
const remesas = read('app/api/admin/finanzas/conciliacion-remesas/importar-pdf/route.ts')
const confirming = read('app/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings/route.ts')
const migration = read('prisma/migrations/20261030_area3_conciliar_work_projection/migration.sql')

assert.match(refresh, /import \{ after \} from 'next\/server'/)
assert.match(refresh, /import \{ refreshAffectedConciliarProjection \} from '\.\/conciliar-affected-refresh'/)
assert.match(refresh, /const result = await refreshAffectedConciliarProjection\(actorId\)/)
assert.match(refresh, /scheduleConciliarProjectionRefresh\(actorId: number \| null\)/)
assert.doesNotMatch(refresh, /\b(fetch|https?:|graph|email|correo|importar|sync)\b/i, 'El callback no llama HTTP, Graph, correo, importadores ni sincronizaciones')
const triggerFunction = migration.slice(migration.indexOf('CREATE FUNCTION area3_conciliar_record_projection_change'), migration.indexOf('CREATE TRIGGER area3_conciliar_change_movement'))
assert.ok(triggerFunction.indexOf("UPDATE estado_proyeccion_conciliar SET dirty_at=CURRENT_TIMESTAMP") < triggerFunction.indexOf('INSERT INTO area3_conciliar_projection_changes'), 'El trigger bloquea estado antes de la cola, igual que acciones y refrescos.')

assert.match(assembly, /import \{ scheduleConciliarProjectionRefresh \} from '@\/lib\/finanzas\/conciliar-refresh'/)
assert.match(assembly, /const result = await runtime\.service\.runBudgetedWorker\(/)
assert.match(assembly, /imported = result\.appliedItems > 0/)
assert.match(assembly, /finally \{[\s\S]*if \(imported\) scheduleConciliarProjectionRefresh\(null\)/)

assert.match(remesas, /import \{ scheduleConciliarProjectionRefresh \} from '@\/lib\/finanzas\/conciliar-refresh'/)
assert.match(remesas, /const actor = Number\.isSafeInteger\(sessionActorId\) && sessionActorId > 0/)
assert.match(remesas, /select: \{ id: true, activo: true \}/)
assert.match(remesas, /const actorId = actor\?\.activo \? actor\.id : null/)
assert.match(remesas, /async function procesarRemesas\([^)]*actorId: number \| null\)/)
assert.match(remesas, /if \(actorId !== null\) scheduleConciliarProjectionRefresh\(actorId\)/)
assert.match(remesas, /if \(actorId !== null && \(importados > 0 \|\| actualizados > 0\)\) scheduleConciliarProjectionRefresh\(actorId\)/)
const devoluciones = remesas.slice(remesas.indexOf('async function procesarDevoluciones'), remesas.indexOf('async function procesarRecibosDevueltos'))
assert.doesNotMatch(devoluciones, /scheduleConciliarProjectionRefresh/, 'La vista de devoluciones sin DML no programa una reconstrucción')

assert.match(confirming, /C9_CONFIRMING_REQUIERE_CLASIFICACION_Y_CONFIRMACION_HUMANA/)
assert.doesNotMatch(confirming, /scheduleConciliarProjectionRefresh/, 'El confirming bloqueado no programa refrescos ni ejecuta importación')

console.log('Callbacks nativos de refresco Conciliar verificados estáticamente; no se abrió red ni base de datos.')
