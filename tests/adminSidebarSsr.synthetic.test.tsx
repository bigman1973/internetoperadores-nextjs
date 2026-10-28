import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import {
  hasAccess,
  permissionSignature,
} from '../components/admin/sidebar-access-evaluator'
import {
  filterAuthorizedSidebarNavigation,
  getEasyOnlySidebarNavigation,
} from '../components/admin/sidebar-navigation'
import AdminSidebarMenu from '../components/admin/server/AdminSidebarMenu'
import { AdminSidebarPlaceholder } from '../components/admin/presentation/AdminSidebarPlaceholder'

const noPreview = {
  isViewingAs: false,
  isViewingAsUser: false,
  viewAsRole: null,
  viewingUser: null,
}

const granularOnly = [{ codigo: 'admin.crm.contactos', lectura: true, escritura: false }]
assert.equal(hasAccess({
  section: 'crm',
  effectiveRole: 'VISOR',
  isSuperAdmin: false,
  userRoles: ['VISOR'],
  permisosGranulares: granularOnly,
  tienePermisosGranulares: true,
  ...noPreview,
}), true, 'un permiso hijo mantiene visible el grupo padre por herencia')
assert.equal(hasAccess({
  section: 'tarifas',
  effectiveRole: 'VENTAS',
  isSuperAdmin: false,
  userRoles: ['VENTAS'],
  permisosGranulares: granularOnly,
  tienePermisosGranulares: true,
  ...noPreview,
}), false, 'una ACL granular existente no cae al rol legacy para rutas no concedidas')
assert.equal(hasAccess({
  section: 'finanzas-tickets',
  effectiveRole: 'GERENTE',
  isSuperAdmin: false,
  userRoles: ['GERENTE'],
  permisosGranulares: [],
  tienePermisosGranulares: false,
  ...noPreview,
}), false, 'GERENTE real conserva la exclusión granular de Tickets/Gastos')
assert.equal(hasAccess({
  section: 'portal-empleado',
  effectiveRole: 'VISOR',
  isSuperAdmin: false,
  userRoles: [],
  permisosGranulares: granularOnly,
  tienePermisosGranulares: true,
  ...noPreview,
}), true, 'Portal Empleado conserva su excepción de acceso')
assert.equal(hasAccess({
  section: 'crm.contactos',
  effectiveRole: 'VENTAS',
  isSuperAdmin: false,
  userRoles: ['VENTAS'],
  permisosGranulares: [{ codigo: 'admin.crm.contactos', lectura: false, escritura: true }],
  tienePermisosGranulares: true,
  ...noPreview,
}), false, 'escritura sin lectura no hace visible una entrada granular')
assert.equal(hasAccess({
  section: 'finanzas',
  effectiveRole: 'GERENTE',
  isSuperAdmin: true,
  userRoles: ['SUPER_ADMIN'],
  permisosGranulares: [],
  tienePermisosGranulares: false,
  isViewingAs: true,
  isViewingAsUser: false,
  viewAsRole: 'GERENTE',
  viewingUser: null,
}), true, 'la previsualización de rol conserva la política legacy')

const authorized = filterAuthorizedSidebarNavigation('staging', section => hasAccess({
  section,
  effectiveRole: 'VISOR',
  isSuperAdmin: false,
  userRoles: ['VISOR'],
  permisosGranulares: granularOnly,
  tienePermisosGranulares: true,
  ...noPreview,
}))
const serializedAuthorized = JSON.stringify(authorized)
assert.match(serializedAuthorized, /Contactos/, 'el árbol autorizado conserva la entrada granular concedida')
assert.doesNotMatch(serializedAuthorized, /Tarifas/, 'el árbol autorizado omite enlaces no concedidos')
assert.doesNotMatch(serializedAuthorized, /Tickets\/Gastos/, 'el árbol autorizado no filtra una excepción negativa')
assert.equal(permissionSignature(granularOnly), permissionSignature([...granularOnly].reverse()), 'la firma de semilla no depende del orden de lectura')

const lorenaNavigation = getEasyOnlySidebarNavigation('staging')
assert.deepEqual(lorenaNavigation.map(item => item.name), ['Conciliar', 'Para pedir'], 'Lorena conserva exactamente los dos enlaces en staging')
const lorenaHtml = renderToStaticMarkup(createElement(AdminSidebarMenu, {
  navigation: lorenaNavigation,
  user: { name: 'Lorena', email: 'lorena@example.test', role: 'CONTABILIDAD' },
  easyOnly: true,
  financeEnvironment: 'staging',
}))
assert.match(lorenaHtml, /href="\/admin\/finanzas\/conciliar"/, 'el HTML SSR de Lorena incluye Conciliar en staging')
assert.match(lorenaHtml, /href="\/admin\/finanzas\/para-pedir"/, 'el HTML SSR de Lorena incluye Para pedir')
assert.match(lorenaHtml, />Lorena</, 'el HTML SSR conserva la identidad del usuario')
assert.doesNotMatch(lorenaHtml, /next\/link|prefetch/i, 'el HTML SSR no requiere el cliente de Link ni solicita prefetch')

const placeholderHtml = renderToStaticMarkup(createElement(AdminSidebarPlaceholder))
assert.match(placeholderHtml, /data-admin-sidebar-placeholder/, 'el fallback expone un marcador explícito de carga segura')
assert.doesNotMatch(placeholderHtml, /href=/, 'el fallback durante una ACL viva no emite enlaces potencialmente no autorizados')

console.log('admin sidebar evaluator, SSR HTML, Lorena and secure placeholder synthetic tests: ok')
