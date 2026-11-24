/* Inspección estática: no importa handlers, Prisma ni proveedores. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const typescriptFiles = (directory: string): string[] => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
  const path = `${directory}/${entry.name}`
  return entry.isDirectory() ? typescriptFiles(path) : entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
})

const refresh = read('lib/finanzas/conciliar-refresh.ts')
const conciliar = read('app/api/admin/finanzas/conciliar/route.ts')
const assembly = read('lib/finanzas/sync-jobs/assembly.ts')
const remesas = read('app/api/admin/finanzas/conciliacion-remesas/importar-pdf/route.ts')
const confirming = read('app/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings/route.ts')

assert.match(refresh, /import \{ after \} from 'next\/server'/)
assert.match(refresh, /export async function refreshConciliarProjectionIfDirty\(actorId: number \| null\)/)
assert.match(refresh, /export function scheduleConciliarActionProjectionRefresh\(actorId: number \| null\)[\s\S]*after\(async \(\) =>[\s\S]*refreshConciliarProjectionIfDirty\(actorId\)/)
assert.doesNotMatch(refresh, /assertPrototypeStaging/, 'El refresco de acción no depende del antiguo contrato de staging.')
assert.doesNotMatch(refresh, /\b(fetch|https?:|graph|email|correo)\b/i, 'El callback no llama HTTP, Graph ni correo')

const legacyScheduler = refresh.slice(refresh.indexOf('export function scheduleConciliarProjectionRefresh'))
assert.match(legacyScheduler, /export function scheduleConciliarProjectionRefresh\(_actorId: number \| null\): void \{\}/)
assert.doesNotMatch(legacyScheduler, /\bafter\s*\(|refreshConciliarProjectionIfDirty|refreshAffectedConciliarProjection/, 'El scheduler heredado debe ser estrictamente inerte.')

const conciliarPost = conciliar.slice(conciliar.indexOf('export async function POST'), conciliar.indexOf('export async function PUT'))
assert.match(conciliarPost, /const \{ scheduleConciliarActionProjectionRefresh \} = await import\('@\/lib\/finanzas\/conciliar-refresh'\)/)
assert.match(conciliarPost, /projectionSynchronized\?: unknown \}\)\.projectionSynchronized !== true\)\s*scheduleConciliarActionProjectionRefresh\(access\.actor\.id\)/)

const actionSchedulerUsers = [...typescriptFiles('app'), ...typescriptFiles('lib')]
  .filter(path => read(path).includes('scheduleConciliarActionProjectionRefresh'))
  .sort()
assert.deepEqual(actionSchedulerUsers, [
  'app/api/admin/finanzas/conciliar/route.ts',
  'lib/finanzas/conciliar-refresh.ts',
], 'Sólo POST Conciliar puede adquirir el scheduler de acción; los hooks heredados no pueden promoverse.')

assert.match(assembly, /import \{ scheduleConciliarProjectionRefresh \} from '@\/lib\/finanzas\/conciliar-refresh'/)
assert.match(assembly, /const result = await runtime\.service\.runBudgetedWorker\(/)
assert.match(assembly, /imported = result\.appliedItems > 0/)
assert.match(assembly, /finally \{[\s\S]*if \(imported\) scheduleConciliarProjectionRefresh\(null\)/)
assert.doesNotMatch(assembly, /scheduleConciliarActionProjectionRefresh/, 'El worker heredado sólo conserva su hook inerte.')

assert.match(remesas, /import \{ scheduleConciliarProjectionRefresh \} from '@\/lib\/finanzas\/conciliar-refresh'/)
assert.match(remesas, /const actor = Number\.isSafeInteger\(sessionActorId\) && sessionActorId > 0/)
assert.match(remesas, /select: \{ id: true, activo: true \}/)
assert.match(remesas, /const actorId = actor\?\.activo \? actor\.id : null/)
assert.match(remesas, /async function procesarRemesas\([^)]*actorId: number \| null\)/)
assert.match(remesas, /if \(actorId !== null\) scheduleConciliarProjectionRefresh\(actorId\)/)
assert.match(remesas, /if \(actorId !== null && \(importados > 0 \|\| actualizados > 0\)\) scheduleConciliarProjectionRefresh\(actorId\)/)
assert.doesNotMatch(remesas, /scheduleConciliarActionProjectionRefresh/, 'Las importaciones de remesas no pueden programar el refresco de acción.')
const devoluciones = remesas.slice(remesas.indexOf('async function procesarDevoluciones'), remesas.indexOf('async function procesarRecibosDevueltos'))
assert.doesNotMatch(devoluciones, /scheduleConciliarProjectionRefresh/, 'La vista de devoluciones sin DML no programa una reconstrucción')

assert.match(confirming, /C9_CONFIRMING_REQUIERE_CLASIFICACION_Y_CONFIRMACION_HUMANA/)
assert.doesNotMatch(confirming, /scheduleConciliar(?:Action)?ProjectionRefresh/, 'El confirming bloqueado no programa refrescos ni ejecuta importación')

console.log('Contrato de refresco Conciliar verificado: sólo POST agenda acción; los hooks heredados permanecen inertes.')
