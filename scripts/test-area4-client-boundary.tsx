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
allowed('/admin/finanzas/conciliar', { userRole: 'GERENTE', initialPermissions: [] })
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
const acting = allowed('/admin/finanzas/conciliar', { userRole: 'GERENTE', actingUser: effectiveUser, initialPermissions: [] })
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
console.log(JSON.stringify({ ok: true, checks, evidence: 'REAL_CLIENT_COMPONENTS_SYNTHETIC_SSR', browser: false, httpAcceptance: false, databaseWrites: false }))
