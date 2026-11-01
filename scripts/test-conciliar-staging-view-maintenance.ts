import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { impersonationRequestAllowed } from '../lib/impersonation-policy'

const ROUTE = '/api/admin/finanzas/conciliar/actualizar-vista'
const middleware = readFileSync('middleware.js', 'utf8')
const route = readFileSync('app/api/admin/finanzas/conciliar/actualizar-vista/route.ts', 'utf8')
const rebuildDb = readFileSync('lib/finanzas/conciliar-db.ts', 'utf8')
const liveSuperAdmin = readFileSync('lib/impersonation.ts', 'utf8')
const approvedMiddleware = execFileSync('git', ['show', '8c2cd41f:middleware.js'], { encoding: 'utf8' })
const allowlistLine = `      || (path === '${ROUTE}' && request.method === 'POST')\n`

assert.equal(middleware.split(ROUTE).length - 1, 1, 'middleware sólo contiene el literal autorizado una vez')
assert.ok(middleware.includes(allowlistLine), 'sólo se habilita el POST exacto en staging')
assert.equal(middleware.replace(allowlistLine, ''), approvedMiddleware, 'el diff de middleware debe ser exclusivamente la allowlist exacta')

assert.match(route, /export const maxDuration = 180/)
assert.match(route, /export const preferredRegion = 'sfo1'/)
assert.match(route, /assertConciliarRuntime\(\)/)
assert.match(route, /process\.env\.VERCEL_ENV === 'production'\) return privateJson\(\{ error: 'No disponible\.' \}, 404\)/, 'producción se cierra antes de tocar runtime o DB')
assert.match(route, /runtimeContext\.runtime !== 'staging'\) return privateJson\(\{ error: 'No disponible\.' \}, 404\)/, 'producción siempre responde 404')
assert.match(route, /getServerSession\(authOptions\)/)
assert.match(route, /requireB4FinanceAccess\('escritura'/)
assert.match(route, /getToken\(\{ req: request, secret: process\.env\.NEXTAUTH_SECRET, cookieName: nextAuthSessionCookieName\(\) \}\)/)
assert.match(route, /requireLiveSuperAdmin\(token\)/, 'el helper vivo rechaza actuación antes del rebuild')
assert.match(route, /access\.actor\.id !== liveActor\.id/, 'actor real y efectivo deben ser el mismo')
assert.match(liveSuperAdmin, /readImpersonationClaims\(token\)/, 'el helper vivo no acepta una sesión de actuación')
assert.match(liveSuperAdmin, /current\.effective\.role !== 'SUPER_ADMIN'/, 'el helper vivo verifica el rol actual')
assert.match(liveSuperAdmin, /if \(!token \|\| token\.userType !== 'admin' \|\| readImpersonationClaims\(token\)\)/, 'actuación, incluida Lorena, no puede alcanzar el rebuild')
assert.match(liveSuperAdmin, /if \(!current\.effective \|\| !current\.active \|\| current\.effective\.role !== 'SUPER_ADMIN'\)/, 'un rol no-superadministrador actual queda denegado')
assert.equal(impersonationRequestAllowed(ROUTE, 'POST'), false, 'la matriz de actuación no admite este mantenimiento en ninguna dirección')
assert.equal(impersonationRequestAllowed(ROUTE, 'POST', new URLSearchParams(), 10, 'preparar-vista' as never), false, 'ninguna acción de cuerpo abre la ruta durante actuación')

const helperStart = route.indexOf('function isPrepararVistaCommand(')
const helperEnd = route.indexOf('\n}\n\nfunction safeRebuildErrorCode', helperStart) + 2
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'el validador puro del mandato debe existir')
const helperJs = transpileModule(route.slice(helperStart, helperEnd), { compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.CommonJS } }).outputText
type PrepararVistaValidator = (value: unknown) => boolean
const evaluatedValidator: unknown = runInNewContext(`${helperJs}\nisPrepararVistaCommand`)
assert.equal(typeof evaluatedValidator, 'function', 'el validador transpila como función')
const isPrepararVistaCommand = evaluatedValidator as PrepararVistaValidator
assert.equal(isPrepararVistaCommand({ action: 'preparar-vista' }), true)
for (const body of [
  null,
  [],
  {},
  { action: 'otra' },
  { action: 'preparar-vista', actorId: 1 },
  { action: 'preparar-vista', actor_id: 1 },
  { action: 'preparar-vista', actor: 1 },
  { action: 'preparar-vista', source: 'browser' },
  { action: 'preparar-vista', rows: 1 },
]) assert.equal(isPrepararVistaCommand(body), false, 'el cuerpo sólo admite action exacta')
assert.doesNotMatch(route, /new Function/, 'la prueba no depende de evaluación Function sin tipar')

assert.match(route, /readJsonLimited\(request\)/)
assert.match(route, /sameOrigin\(request\)/)
const streamReturn = route.indexOf('return streamConciliarViewRebuild(liveActor.id)')
assert.ok(streamReturn > 0, 'el éxito usa el stream NDJSON')
for (const guard of [
  "process.env.VERCEL_ENV === 'production'",
  'assertConciliarRuntime()',
  'runtimeContext.runtime !== \'staging\'',
  'sameOrigin(request)',
  'readJsonLimited(request)',
  'isPrepararVistaCommand(command)',
  "requireB4FinanceAccess('escritura'",
  'requireLiveSuperAdmin(token)',
  'access.actor.id !== liveActor.id',
]) assert.ok(route.indexOf(guard) < streamReturn, `la guardia ${guard} se mantiene antes de iniciar el stream`)

const streamStart = route.indexOf('function streamConciliarViewRebuild(')
const streamEnd = route.indexOf('\n}\n\nfunction errorResponse', streamStart) + 2
const stream = route.slice(streamStart, streamEnd)
assert.ok(streamStart >= 0 && streamEnd > streamStart, 'el stream de mantenimiento debe existir')
assert.match(stream, /new ReadableStream<Uint8Array>/)
assert.match(stream, /emit\(\{ type: 'preparando' \}\)/, 'el primer estado es el aviso privado de preparación')
assert.match(stream, /setInterval\(/)
assert.match(route, /REBUILD_HEARTBEAT_MS = 10_000/)
assert.match(route, /MAX_REBUILD_HEARTBEATS = 12/, 'el keepalive no puede superar los 120 segundos de transacción')
assert.match(stream, /heartbeatCount === MAX_REBUILD_HEARTBEATS[\s\S]*clearInterval\(heartbeat\)/, 'el temporizador se acota a doce latidos')
assert.match(stream, /const rebuilt = await rebuildConciliarProjection\(liveActorId\)/, 'la única promesa de negocio se espera dentro de start')
assert.equal((stream.match(/rebuildConciliarProjection\(/g) ?? []).length, 1, 'el stream llama una sola vez al rebuild')
assert.match(stream, /finally \{[\s\S]*if \(heartbeat\) clearInterval\(heartbeat\)/, 'el intervalo siempre se limpia al terminar')
assert.match(stream, /cancel\(\) \{\s*clientClosed = true/, 'la cancelación sólo deja de enviar al cliente')
assert.doesNotMatch(stream, /\b(?:after|setTimeout|AbortController|abort|rollback|cron)\b/i, 'no hay trabajos diferidos, bucles, cancelación de negocio ni cron')
assert.doesNotMatch(stream, /\bcache\b(?!-control)/i, 'no hay caché de aplicación; sólo la cabecera privada Cache-Control')
assert.match(stream, /'content-type': 'application\/x-ndjson; charset=utf-8'/)
assert.match(stream, /'cache-control': 'private, no-store'/)
assert.match(stream, /'x-content-type-options': 'nosniff'/)
assert.match(stream, /'content-encoding': 'identity'/)
assert.match(stream, /'x-accel-buffering': 'no'/)
assert.match(stream, /emit\(\{ type: 'terminado', rows: rebuilt\.rows, rebuiltAt: rebuilt\.rebuiltAt \}\)/, 'el terminal sólo entrega filas y momento de commit')
const terminalStart = stream.indexOf("emit({ type: 'terminado'")
const terminal = stream.slice(terminalStart, stream.indexOf('\n', terminalStart))
assert.doesNotMatch(terminal, /(?:actor(?:Id|_id)?|source|cuenta|importe|movimiento|documento)/i, 'el terminal no expone actor, origen ni identificadores financieros')
assert.match(stream, /emit\(\{ type: 'error', error: 'No se pudo preparar la vista\.', code \}\)/)
assert.match(route, /type SafeRebuildErrorCode = 'P2028' \| 'CONCILIAR_REBUILD_FAILED'/, 'los únicos códigos publicados están en allowlist')
assert.match(route, /\(error as \{ code\?: unknown \}\)\.code === 'P2028'/)
const errorEventStart = stream.indexOf("emit({ type: 'error'")
const errorEvent = stream.slice(errorEventStart, stream.indexOf('\n', errorEventStart))
assert.doesNotMatch(errorEvent, /(?:stack|message|sql|actorId|liveActorId)/i, 'el evento de error no filtra detalle técnico ni identidad')
assert.match(route, /console\.info\('conciliar-view-maintenance', \{ event, [\s\S]*elapsedMs \}\)/, 'el log sólo registra evento, código seguro opcional y duración')
assert.doesNotMatch(route, /console\.(?:error|warn)\(/, 'no se registran objetos Error ni datos de usuario')
assert.doesNotMatch(route, /\bfetch\(/, 'la ruta no realiza HTTP ni llama a proveedores')

const publicRebuild = rebuildDb.slice(rebuildDb.indexOf('export async function rebuildConciliarProjection('))
assert.match(publicRebuild, /\$transaction\(tx => rebuildConciliarProjectionTx\(tx, rebuiltById\), \{ isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable, maxWait: 10_000, timeout: 120_000 \}\)/, 'la reconstrucción pública conserva su presupuesto de 120 segundos')
const g7Rebuild = rebuildDb.slice(rebuildDb.indexOf('export async function rebuildConciliarProjectionTx'), rebuildDb.indexOf('export async function rebuildConciliarProjection('))
assert.match(g7Rebuild, /const sealedRows = await sealConciliarProjectionRowsTx\(tx, guardedRows\)/)
assert.ok(g7Rebuild.indexOf('const sealedRows = await sealConciliarProjectionRowsTx') < g7Rebuild.indexOf('DELETE FROM conciliar_proyecciones'), 'G7 sigue sellando antes de cualquier DML de proyección')

console.log('PASS: mantenimiento NDJSON cerrado a staging, sesión real SUPER_ADMIN, cuerpo exacto, keepalive acotado y recibos privados')
