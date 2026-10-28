import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { resolve } from 'node:path'
import { adminRenderSurface, ADMIN_RENDER_SURFACE_HEADER, CONCILIAR_READY_SURFACE } from '../lib/admin-render-surface'

async function main() {
  assert.equal(adminRenderSurface('/admin/finanzas/conciliar', true), CONCILIAR_READY_SURFACE)
  for (const path of ['/admin', '/admin/finanzas', '/admin/finanzas/conciliar/', '/admin/finanzas/conciliar/extra', '/api/admin/finanzas/conciliar', '/admin/finanzas/movimientos']) {
    assert.equal(adminRenderSurface(path, true), 'default')
  }
  assert.equal(adminRenderSurface('/admin/finanzas/conciliar', false), 'default')
  const middleware = readFileSync(resolve('middleware.js'), 'utf8')
  const setter = middleware.indexOf('trustedHeaders.set(ADMIN_RENDER_SURFACE_HEADER, adminRenderSurface(')
  assert(setter > middleware.indexOf('if (actingBoundary.response) return actingBoundary.response'))
  assert(setter < middleware.indexOf('const mustCheckEasyOnlyProfile'))
  assert(middleware.includes('targetHasLiveMatrixPermission(policy, live.target.id, route.permission)'))
  assert(middleware.includes('return continueRequest(trustedHeaders)'))
  assert(!existsSync(resolve('app/admin/loading.tsx')), 'no inherited automatic Suspense for the ready projection')
  assert(existsSync(resolve('components/admin/AdminLoading.tsx')))
  const template = readFileSync(resolve('app/admin/template.tsx'), 'utf8')
  const functionText = template.match(/export default async function AdminTemplate[\s\S]*$/)?.[0]
  assert(functionText)
  let conciliarEnabled = true, surface = CONCILIAR_READY_SURFACE
  const jsx = (type: unknown, props: unknown) => ({ type, props })
  const sandbox = { exports: {} as Record<string, any>, require: (name: string) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' }
    if (name === '@/lib/finanzas/conciliar-runtime') return { conciliarRuntimeConfigured: () => conciliarEnabled ? 'production' : null }
    throw new Error(`unexpected import: ${name}`)
  }, conciliarRuntimeConfigured: () => conciliarEnabled ? 'production' : null,
    headers: async () => ({ get: (name: string) => name === ADMIN_RENDER_SURFACE_HEADER ? surface : null }), ADMIN_RENDER_SURFACE_HEADER, CONCILIAR_READY_SURFACE, Suspense: 'suspense', AdminLoading: 'loading' }
  vm.runInNewContext(ts.transpileModule(functionText, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, sandbox)
  const children = { syntheticRows: 50, syntheticCounters: 4 }
  const ready = await sandbox.exports.default({ children })
  assert.equal(ready.type, 'fragment'); assert.equal(ready.props.children, children)
  surface = 'default'
  const normal = await sandbox.exports.default({ children })
  assert.equal(normal.type, 'suspense'); assert.equal(normal.props.children, children)
  surface = CONCILIAR_READY_SURFACE; conciliarEnabled = false
  assert.equal((await sandbox.exports.default({ children })).type, 'suspense', 'sin opt-in Conciliar conserva el fallback')
  const segment = readFileSync(resolve('components/SegmentProvider.tsx'), 'utf8')
  assert(!segment.includes('if (!mounted)'))
  assert(!segment.includes('return <>{children}</>'))
  assert(segment.includes('<SegmentContext.Provider value={{ segment, setSegment }}>'))
  const page = readFileSync(resolve('app/admin/finanzas/conciliar/page.tsx'), 'utf8')
  assert(page.includes("requireB4FinanceAccess('lectura', await requireAuth('admin'))"))
  assert(page.includes('const initialData = await readConciliarProjection(input)'))
  assert(page.includes('initialData={initialData}'))
  console.log('OK: render surface exacta con opt-in Conciliar, hint sobrescrito, ACL viva intacta y fallback sin opt-in')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
