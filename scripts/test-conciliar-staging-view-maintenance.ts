import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { impersonationRequestAllowed } from '../lib/impersonation-policy'

const ROUTE = '/api/admin/finanzas/conciliar/actualizar-vista'
const middleware = readFileSync('middleware.js', 'utf8')
const route = readFileSync('app/api/admin/finanzas/conciliar/actualizar-vista/route.ts', 'utf8')
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
const helperEnd = route.indexOf('\n}\n\nfunction errorResponse', helperStart) + 2
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'el validador puro del mandato debe existir')
const helperJs = transpileModule(route.slice(helperStart, helperEnd), { compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.CommonJS } }).outputText
const isPrepararVistaCommand = new Function(`${helperJs}\nreturn isPrepararVistaCommand`)() as (value: unknown) => boolean
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

assert.match(route, /readJsonLimited\(request\)/)
assert.match(route, /sameOrigin\(request\)/)
assert.match(route, /rebuildConciliarProjection\(liveActor\.id\)/)
assert.match(route, /privateJson\(\{ rows: rebuilt\.rows, rebuiltAt: rebuilt\.rebuiltAt \}\)/, 'el recibo no expone identificadores financieros, actor ni origen')
const receiptStart = route.indexOf('return privateJson({ rows: rebuilt.rows, rebuiltAt: rebuilt.rebuiltAt })')
const receipt = route.slice(receiptStart, route.indexOf('\n', receiptStart))
assert.doesNotMatch(receipt, /(?:actor(?:Id|_id)?|source|cuenta|importe|movimiento|documento)/i, 'el recibo no expone actor, origen ni identificadores financieros')
assert.doesNotMatch(route, /(?:setTimeout|setInterval|performance\.now|Date\.now|console\.)/, 'la ruta no mide ni publica temporizadores')
assert.doesNotMatch(route, /\bfetch\(/, 'la ruta no realiza HTTP ni llama a proveedores')
assert.doesNotMatch(route, /\bcodigo\b/, 'los errores son llanos')

console.log('PASS: mantenimiento de vista cerrado a staging, sesión real SUPER_ADMIN, cuerpo exacto y recibo privado mínimo')
