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
  let staging = '1', surface = CONCILIAR_READY_SURFACE
  const jsx = (type: unknown, props: unknown) => ({ type, props })
  const sandbox = { exports: {} as Record<string, any>, require: (name: string) => { assert.equal(name, 'react/jsx-runtime'); return { jsx, jsxs: jsx, Fragment: 'fragment' } }, headers: async () => ({ get: (name: string) => name === ADMIN_RENDER_SURFACE_HEADER ? surface : null }), process: { env: { get FINANCE_STAGING_SANDBOX() { return staging } } }, ADMIN_RENDER_SURFACE_HEADER, CONCILIAR_READY_SURFACE, Suspense: 'suspense', AdminLoading: 'loading' }
  vm.runInNewContext(ts.transpileModule(functionText, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, sandbox)
  const children = { syntheticRows: 50, syntheticCounters: 4 }
  const ready = await sandbox.exports.default({ children })
  assert.equal(ready.type, 'fragment'); assert.equal(ready.props.children, children)
  surface = 'default'
  const normal = await sandbox.exports.default({ children })
  assert.equal(normal.type, 'suspense'); assert.equal(normal.props.children, children)
  surface = CONCILIAR_READY_SURFACE; staging = '0'
  assert.equal((await sandbox.exports.default({ children })).type, 'suspense', 'production keeps its fallback and is not opted into Conciliar')
  const segment = readFileSync(resolve('components/SegmentProvider.tsx'), 'utf8')
  assert(!segment.includes('if (!mounted)'))
  assert(!segment.includes('return <>{children}</>'))
  assert(segment.includes('<SegmentContext.Provider value={{ segment, setSegment }}>'))
  const page = readFileSync(resolve('app/admin/finanzas/conciliar/page.tsx'), 'utf8')
  assert(page.includes("requireB4FinanceAccess('lectura', await requireAuth('admin'))"))
  assert(page.includes('const initialData = await readConciliarProjection(input)'))
  assert(page.includes('initialData={initialData}'))
  console.log('OK: exact staging render surface, overwritten hint, live ACL unchanged, no automatic hidden projection, normal fallback retained, stable SSR provider')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
