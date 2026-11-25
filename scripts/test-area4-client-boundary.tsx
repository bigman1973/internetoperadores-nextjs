import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createElement } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { RoleProvider, useRole } from '../components/admin/RoleContext'
import * as roleModule from '../components/admin/RoleContext'
import * as registry from '../lib/area4/section-registry'
import * as policy from '../lib/area4/policy'
import * as seedContract from '../lib/admin-permissions-ssr-contract'
import * as surfaceContract from '../lib/area4/surface-access-contract'
import * as roleModuleForHooks from '../components/admin/sidebar-access-evaluator'

let currentPath = '/admin/finanzas/conciliar'
const source = readFileSync('components/admin/ProtectedRoute.tsx', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const mod: any = { exports: {} }
vm.runInNewContext(code, {
  module: mod, exports: mod.exports,
  require(name: string) {
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'next/navigation') return { usePathname: () => currentPath }
    if (name === './RoleContext') return roleModule
    if (name === '@/lib/area4/section-registry') return registry
    if (name === '@/lib/area4/policy') return policy
    throw new Error(`Unexpected module ${name}`)
  },
})
const ProtectedRoute = mod.exports.default
let checks = 0
const base = { userRole: 'VISOR', userRoles: [], userId: 100, isArea4Owner: false, initialPermissionsLoaded: true, permissionsAdopted: true }
const deniedFinance = [{ codigo: 'admin.finanzas', lectura: false, escritura: false, confirmar: false, exportar: false }]
const readFinance = [{ codigo: 'admin.finanzas', lectura: true, escritura: false, confirmar: false, exportar: false }]
function Probe() {
  const context = useRole()
  return createElement('output', null, JSON.stringify({ acting: context.isViewingAsUser, adoptedPolicy: context.tienePermisosGranulares,
    financeV: context.hasAreaAccess('admin.finanzas.conciliacion'), financeE: context.hasAreaAccess('admin.finanzas.conciliacion', 'escritura'),
    financeC: context.hasAreaAccess('admin.finanzas.conciliacion', 'confirmar'), financeX: context.hasAreaAccess('admin.finanzas.conciliacion', 'exportar'),
    taxV: context.hasAreaAccess('admin.finanzas.impuestos'), taxE: context.hasAreaAccess('admin.finanzas.impuestos', 'escritura'),
    taxC: context.hasAreaAccess('admin.finanzas.impuestos', 'confirmar'), taxX: context.hasAreaAccess('admin.finanzas.impuestos', 'exportar'),
    budgetC: context.hasAreaAccess('admin.finanzas.presupuesto', 'confirmar'),
    subida: context.hasAccess('subida-precios'), usuarios: context.hasAccess('usuarios') }))
}
function html(path: string, props: Record<string, unknown>) {
  currentPath = path
  return renderToStaticMarkup(createElement(RoleProvider, { ...base, ...props, children:
    createElement('div', null, createElement(Probe), createElement(ProtectedRoute, null, createElement('strong', null, 'SYNTHETIC_PROTECTED_CONTENT'))) } as any))
}
function denied(path: string, props: Record<string, unknown>) {
  const markup = html(path, props)
  assert.match(markup, /Acceso denegado/)
  assert.doesNotMatch(markup, /SYNTHETIC_PROTECTED_CONTENT/)
  checks++
}
function allowed(path: string, props: Record<string, unknown>) {
  const markup = html(path, props)
  assert.match(markup, /SYNTHETIC_PROTECTED_CONTENT/)
  assert.doesNotMatch(markup, /Acceso denegado/)
  checks++
  return markup
}
assert.equal(mod.exports.pathToAreaCode('/admin/finanzas/conciliar'), 'admin.finanzas.conciliacion')
assert.equal(mod.exports.pathToAreaCode('/admin/finanzas/para-pedir'), 'admin.finanzas.conciliacion')
checks += 2
denied('/admin/clientes', { initialPermissions: [] })
denied('/admin/finanzas/conciliar', { userRole: 'GERENTE', initialPermissions: deniedFinance })
denied('/admin/finanzas/conciliar', { userRole: 'GERENTE', initialPermissions: [] })
allowed('/admin/finanzas/conciliar', { userRole: 'GERENTE', initialPermissions: [], permissionsAdopted: false })
denied('/admin/usuarios', { userRole: 'GERENTE', initialPermissions: [] })
denied('/admin/sistemas', { userRole: 'GERENTE', initialPermissions: [] })
const contacts = [{ codigo: 'admin.crm.contactos', lectura: true, escritura: true, confirmar: false, exportar: false }]
denied('/admin/crm', { initialPermissions: contacts })
allowed('/admin/crm/contactos', { initialPermissions: contacts })
const vOnly = allowed('/admin/finanzas/conciliar', { initialPermissions: readFinance })
assert.match(vOnly, /financeV&quot;:true/)
for (const capability of ['financeE', 'financeC', 'financeX']) assert.match(vOnly, new RegExp(`${capability}&quot;:false`))
checks += 4
const effectiveUser = { id: 100, nombre: 'Area4 Test', email: 'area4@example.test', rol: 'GERENTE', roles: [] }
const acting = allowed('/admin/finanzas/conciliar', { userRole: 'GERENTE', actingUser: effectiveUser, initialPermissions: readFinance })
assert.match(acting, /acting&quot;:true/)
assert.match(acting, /subida&quot;:false/)
checks += 2
denied('/admin/subida-precios', { userRole: 'GERENTE', actingUser: effectiveUser, initialPermissions: [] })
denied('/admin/sistemas', { userRole: 'GERENTE', actingUser: effectiveUser, initialPermissions: [] })
denied('/admin/finanzas/conciliar', { userRole: 'GERENTE', actingUser: effectiveUser, initialPermissions: deniedFinance })
const unknown = html('/admin/finanzas/conciliar', { userRole: 'GERENTE', initialPermissionsLoaded: false, initialPermissions: [] })
assert.doesNotMatch(unknown, /SYNTHETIC_PROTECTED_CONTENT/)
assert.match(unknown, /subida&quot;:false/)
checks++
const fullFinance = [{ codigo: 'admin.finanzas', lectura: true, escritura: true, confirmar: true, exportar: true }]
denied('/admin/finanzas/impuestos', { initialPermissions: fullFinance })
denied('/admin/finanzas/presupuesto', { initialPermissions: fullFinance })
for (const secondary of [false, true]) {
  const props = { userRole: secondary ? 'VISOR' : 'CONTABILIDAD', userRoles: secondary ? ['CONTABILIDAD'] : [], initialPermissions: fullFinance }
  const tax = allowed('/admin/finanzas/impuestos', props)
  assert.match(tax, /taxV&quot;:true/)
  for (const capability of ['taxE', 'taxC', 'taxX', 'budgetC']) assert.match(tax, new RegExp(`${capability}&quot;:false`))
  checks += 5
  denied('/admin/finanzas/presupuesto', props)
  denied('/admin/finanzas/impuestos', { ...props, initialPermissions: [...fullFinance, { codigo: 'admin.finanzas.impuestos', lectura: false, escritura: false }] })
}
const budget = allowed('/admin/finanzas/presupuesto', { userRole: 'GERENTE', initialPermissions: fullFinance })
assert.match(budget, /budgetC&quot;:false/); checks++
denied('/admin/finanzas/impuestos', { userRole: 'GERENTE', initialPermissions: [] })
allowed('/admin/finanzas/impuestos', { userRole: 'GERENTE', initialPermissions: [], permissionsAdopted: false })
denied('/admin/finanzas/presupuesto', { userRole: 'GERENTE', initialPermissions: [...fullFinance, { codigo: 'admin.finanzas.presupuesto', lectura: false, escritura: false }] })
for (const role of ['GERENTE', 'CONTABILIDAD']) {
  const target = { ...effectiveUser, rol: role }
  denied('/admin/finanzas/impuestos', { userRole: role, actingUser: target, initialPermissions: fullFinance })
  denied('/admin/finanzas/presupuesto', { userRole: role, actingUser: target, initialPermissions: fullFinance })
}
const ownerBudget = allowed('/admin/finanzas/presupuesto', { userRole: 'SUPER_ADMIN', userId: 3, isArea4Owner: true, initialPermissions: [] })
assert.match(ownerBudget, /budgetC&quot;:true/); checks++
denied('/admin/finanzas/impuestos', { userRole: 'SUPER_ADMIN', initialPermissions: fullFinance })

// Execute the actual provider across successive SSR seeds. Only React hooks are
// synthetic; this is not browser/HTTP evidence and never issues a permissions GET.
const state: any[] = []
let stateIndex = 0; let effectIndex = 0
const effectDependencies: any[][] = []
let effects: Array<() => unknown> = []
const hookModule: any = { exports: {} }
const providerCode = ts.transpileModule(readFileSync('components/admin/RoleContext.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
vm.runInNewContext(providerCode, {
  module: hookModule, exports: hookModule.exports,
  require(name: string) {
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'react') return {
      createContext: (value: any) => ({ Provider: 'synthetic-provider', value }), useContext: (context: any) => context.value,
      useCallback: (callback: any) => callback,
      useState: (initial: any) => {
        const index = stateIndex++
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
        return [state[index], (value: any) => { state[index] = typeof value === 'function' ? value(state[index]) : value }]
      },
      useEffect: (callback: () => unknown, dependencies: any[]) => {
        const index = effectIndex++; const previous = effectDependencies[index]
        if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) effects.push(callback)
        effectDependencies[index] = dependencies
      },
    }
    if (name === '@/lib/area4/policy') return policy
    if (name === '@/lib/area4/section-registry') return registry
    if (name === '@/lib/area4/surface-access-contract') return surfaceContract
    if (name === '@/lib/admin-permissions-ssr-contract') return seedContract
    if (name === './sidebar-access-evaluator') return { hasAccess: (input: any) => roleModuleForHooks.hasAccess(input) }
    throw new Error(`Unexpected provider module ${name}`)
  },
  fetch: () => { throw new Error('Unexpected real permission fetch in synthetic SSR seed test') },
})
function seeded(props: Record<string, unknown>) {
  let tree: any
  for (let pass = 0; pass < 3; pass++) {
    stateIndex = 0; effectIndex = 0; effects = []
    tree = hookModule.exports.RoleProvider({ ...base, userRole: 'CONTABILIDAD', children: null, ...props })
    const pending = effects
    if (!pending.length) break
    for (const effect of pending) effect()
  }
  return tree.props.value
}
const legacySeed = seeded({ initialPermissions: [], permissionsAdopted: false })
assert.equal(legacySeed.hasAccess('finanzas.impuestos'), true); checks++
const adoptedSeed = seeded({ initialPermissions: [], permissionsAdopted: true })
assert.equal(adoptedSeed.tienePermisosGranulares, true); checks++
assert.equal(adoptedSeed.hasAccess('finanzas.impuestos'), false); checks++
const missingMarkerSeed = seeded({ initialPermissions: [], permissionsAdopted: undefined })
assert.equal(missingMarkerSeed.tienePermisosGranulares, true); checks++
// Only an in-memory metadata mutation of an existing real page. No handler,
// account, HTTP request or permanent registry entry is created by these cases.
const contactPage = registry.area4RegisteredSurface('/admin/crm/contactos', 'page')!
const pageActions = contactPage.surface.actions as string[]
pageActions.push('E')
try {
  const changedPage = registry.area4RegisteredSurface('/admin/crm/contactos', 'page')!
  assert.equal(changedPage.baseline, false); checks++
  const consent = { id: changedPage.id, descriptor: changedPage.descriptor, actions: 'V' }
  const props = { initialPermissions: contacts, initialSurfacePermissions: [consent] }
  denied('/admin/crm/contactos', { initialPermissions: contacts })
  denied('/admin/crm/contactos', { ...props, permissionsAdopted: false, userRole: 'GERENTE' })
  denied('/admin/crm/contactos', { ...props, initialPermissions: [{ codigo: 'admin.crm', lectura: true, escritura: true }] })
  denied('/admin/crm/contactos', { ...props, initialSurfacePermissions: [{ ...consent, descriptor: 'stale' }] })
  denied('/admin/crm/contactos', { ...props, initialSurfacePermissions: [{ ...consent, actions: 'E' }] })
  denied('/admin/crm/contactos', { ...props, initialPermissionsLoaded: true, initialPermissions: [{ ...contacts[0], lectura: false }] })
  allowed('/admin/crm/contactos', props)
  allowed('/admin/crm/contactos', { userRole: 'SUPER_ADMIN', userId: 3, isArea4Owner: true, initialPermissions: [] })
  denied('/admin/crm/contactos', { userRole: 'SUPER_ADMIN', userId: 3, isArea4Owner: true, actingUser: effectiveUser, initialPermissions: contacts })
  const before = seeded(props)
  assert.equal(before.hasSurfaceAccess('/admin/crm/contactos'), true); checks++
  const revoked = seeded({ ...props, initialSurfacePermissions: [] })
  assert.equal(revoked.hasSurfaceAccess('/admin/crm/contactos'), false); checks++
} finally { pageActions.pop() }
console.log(JSON.stringify({ ok: true, checks, evidence: 'REAL_CLIENT_COMPONENTS_SYNTHETIC_SSR', browser: false, httpAcceptance: false, databaseWrites: false }))
