import { readFileSync, writeFileSync } from 'node:fs'
import { AREA4_SECTION_REGISTRY } from '../lib/area4/section-registry'
import { AREA4_TEMPLATES } from '../lib/area4/templates'
import { evaluateArea4Capability } from '../lib/area4/policy'

/** Real HTTP acceptance. No login, session forgery, user creation, DB writes,
 * synchronization or notification is performed by this runner.
 * Run ONLY against the single staging using supplied authorized test sessions.
 * JSON config/cookies must stay outside Git. All dynamic page fixtures required.
 * This checks HTTP/SSR, not browser interactions or client-side API workflows.
 */
type Profile = { key: string; templateId?: string; role: string; id: number; cookie: string }
type Config = {
  baseUrl: string
  authorizedTestSessions: true
  testDataOnly: true
  ownerId: number
  profiles: Profile[]
  fixtures: Record<string, string>
}
const arg = process.argv[2]
if (!arg) {
  console.error('PENDING_AUTHORIZED_HTTP_FIXTURES: provide a private config file; no HTTP acceptance has been run.')
  process.exit(2)
}
const config = JSON.parse(readFileSync(arg, 'utf8')) as Config
const base = new URL(config.baseUrl)
if (base.origin !== 'https://staging.internetoperadores.com' || base.pathname !== '/' || base.search || base.hash
  || config.authorizedTestSessions !== true || config.testDataOnly !== true) throw new Error('Only authorized test fixtures on the single staging are allowed')
const required = ['superadmin', ...AREA4_TEMPLATES.map(t => t.id)]
if (required.some(key => !config.profiles.some(p => p.key === key))) throw new Error('All five role profiles must be supplied; no omissions allowed')
const requiredRoles: Record<string, string> = { superadmin: 'SUPER_ADMIN', 'area4-gerente-operativo': 'GERENTE',
  'area4-contabilidad-clientes-rrhh': 'CONTABILIDAD', 'area4-empleado-portal-peticiones': 'VISOR', 'area4-tecnico-draxton-8': 'VISOR' }
for (const key of required) {
  const profile = config.profiles.find(p => p.key === key)!
  if (profile.role !== requiredRoles[key] || (key === 'superadmin' && profile.id !== config.ownerId)) throw new Error(`Template role or canonical owner mismatch for ${key}`)
}
const pages = AREA4_SECTION_REGISTRY.flatMap(section => section.surfaces.filter(s => s.kind === 'page').map(s => ({ ...s, areaCode: section.areaCode })))
const apiAnonymous = ['/api/admin/usuarios', '/api/admin/permisos', '/api/admin/auditoria', '/api/admin/facturacion', '/api/admin/clientes/ggcc/draxton/finanzas', '/api/admin/finanzas/conciliar', '/api/admin/finanzas/impuestos', '/api/admin/finanzas/presupuesto/versiones']
const output: any[] = []
function fixture(path: string): string {
  const actual = config.fixtures[path] || path
  if (actual.includes('[') || !actual.startsWith('/') || actual.startsWith('//') || /[?#]/.test(actual)) throw new Error(`Missing/invalid synthetic fixture for ${path}`)
  if (new URL(actual, base).origin !== base.origin) throw new Error(`Fixture leaves the single staging: ${path}`)
  return actual
}
// Validate the complete fixture set BEFORE making the first request.
for (const page of pages) fixture(page.path)
async function request(path: string, cookie?: string) {
  const url = new URL(path, base)
  if (url.origin !== base.origin) throw new Error('HTTP request leaves the single staging')
  return fetch(url, { method: 'GET', redirect: 'manual',
    headers: { ...(cookie ? { Cookie: cookie } : {}), Accept: 'text/html', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20_000) })
}
async function run() {
  for (const path of apiAnonymous) {
    const res = await request(path)
    output.push({ profile: 'anonymous', path, expected: 401, status: res.status, ok: res.status === 401 })
    await res.body?.cancel()
  }
  for (const profile of config.profiles) {
    if (!Number.isSafeInteger(profile.id) || !profile.cookie) throw new Error('An explicitly authorized session is required for every profile')
    const sessionRes = await request('/api/auth/session', profile.cookie)
    const session: any = await sessionRes.json()
    if (Number(session?.user?.id) !== profile.id || session?.user?.userType !== 'admin') throw new Error(`Invalid authorized session for profile ${profile.key}`)
    if (session.user.role !== profile.role || session.impersonation) throw new Error(`Role or actuation mismatch for profile ${profile.key}`)
    const template = AREA4_TEMPLATES.find(t => t.id === (profile.templateId || profile.key))
    const grants = (template?.permisos || []).map(({ areaCodigo, ...grant }) => ({ codigo: areaCodigo, ...grant }))
    const principal = { id: profile.id, activo: true, rol: profile.role, roles: session.user.roles || [] }
    for (const page of pages) {
      const actualPath = fixture(page.path)
      const allowed = page.path === '/admin'
        ? (profile.role === 'GERENTE' || (profile.role === 'SUPER_ADMIN' && profile.id === config.ownerId) || grants.some(g => g.codigo.startsWith('admin.') && g.lectura))
        : page.path.startsWith('/empleado') || page.path.startsWith('/peticiones')
          ? true // native self-service guards must still validate resource ownership
          : evaluateArea4Capability({ principal, grants, codigoArea: page.areaCode, capability: 'lectura', ownerId: config.ownerId, permissionsAdopted: true })
      let status = 0; let ok = false; let failure: string | undefined
      try {
        const res = await request(actualPath, profile.cookie)
        status = res.status
        if (allowed) {
          const html = await res.text()
          ok = status === 200 && /text\/html/.test(res.headers.get('content-type') || '')
            && !html.includes('NEXT_HTTP_ERROR_FALLBACK')
            && (!page.path.startsWith('/admin') || html.includes('data-admin-shell'))
        } else { ok = status === 403; await res.body?.cancel() }
        if (!ok) failure = res.headers.get('location') ? 'UNEXPECTED_REDIRECT' : 'LOAD_OR_AUTHORIZATION_MISMATCH'
      } catch { failure = 'HTTP_REQUEST_FAILED' }
      output.push({ profile: profile.key, path: page.path, expected: allowed ? 'LOAD' : 403, status, ok, ...(failure ? { failure } : {}) })
    }
  }
  const result = { ok: output.every(r => r.ok), evidence: 'REAL_HTTP_SSR', browserInteractionTested: false,
    registeredPages: pages.length, profiles: config.profiles.length, checks: output.length, failures: output.filter(r => !r.ok), results: output }
  const file = process.env.AREA4_HTTP_REPORT || '/tmp/area4-http-acceptance.json'
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ ok: result.ok, evidence: result.evidence, pages: pages.length, profiles: config.profiles.length, checks: output.length, failures: result.failures.length, report: file }))
  if (!result.ok) process.exitCode = 1
}
run().catch(error => { console.error(error.message); process.exitCode = 2 })
