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
  isSidebarNavigationGroup,
} from '../components/admin/sidebar-navigation'
import AdminSidebarMenu from '../components/admin/server/AdminSidebarMenu'
import { AdminSidebarPlaceholder } from '../components/admin/presentation/AdminSidebarPlaceholder'

const noPreview = {
  isArea4Owner: false,
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
}), false, 'un permiso hijo no autoriza el enlace del padre; el contenedor conserva el hijo autorizado')
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
}), true, 'GERENTE opera todo el negocio, incluidos Tickets/Gastos, salvo revocación explícita')
const revokedTickets = [{ codigo: 'admin.finanzas.tickets', lectura: false, escritura: false }]
assert.equal(hasAccess({
  section: 'finanzas-tickets',
  effectiveRole: 'GERENTE',
  isSuperAdmin: false,
  userRoles: ['GERENTE'],
  permisosGranulares: revokedTickets,
  tienePermisosGranulares: true,
  ...noPreview,
}), false, 'una revocación explícita con todos los grants false prevalece sobre GERENTE')
assert.equal(hasAccess({
  section: 'portal-empleado',
  effectiveRole: 'VISOR',
  isSuperAdmin: false,
  userRoles: [],
  permisosGranulares: granularOnly,
  tienePermisosGranulares: true,
  ...noPreview,
}), false, 'Portal Empleado no es una excepción universal ante una ACL explícita sin portal')
assert.equal(hasAccess({
  section: 'portal-empleado',
  effectiveRole: 'VISOR',
  isSuperAdmin: false,
  userRoles: [],
  permisosGranulares: [],
  tienePermisosGranulares: false,
  ...noPreview,
}), true, 'Portal Empleado conserva el fallback legacy cuando no existe ACL explícita')
assert.equal(hasAccess({
  section: 'portal-empleado',
  effectiveRole: 'VISOR',
  isSuperAdmin: false,
  userRoles: [],
  permisosGranulares: [{ codigo: 'empleado.portal', lectura: false, escritura: false }],
  tienePermisosGranulares: true,
  ...noPreview,
}), false, 'la revocación explícita del portal tampoco cae al fallback legacy')
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
  isArea4Owner: false,
  userRoles: ['SUPER_ADMIN'],
  permisosGranulares: [],
  tienePermisosGranulares: false,
  isViewingAs: true,
  isViewingAsUser: false,
  viewAsRole: 'GERENTE',
  viewingUser: null,
}), true, 'la previsualización de rol conserva la política legacy')

const actingAsUser = {
  effectiveRole: 'VISOR',
  isSuperAdmin: false,
  isArea4Owner: false,
  isViewingAs: false,
  isViewingAsUser: true,
  viewAsRole: null,
  userRoles: ['VISOR'],
  viewingUser: { id: 42, nombre: 'Usuario efectivo', email: 'efectivo@example.test', rol: 'VISOR', roles: ['VISOR'] },
  permisosGranulares: granularOnly,
  tienePermisosGranulares: true,
}
assert.equal(hasAccess({ ...actingAsUser, section: 'crm.contactos' }), true, 'la actuación real conserva la ACL del usuario efectivo')
assert.equal(hasAccess({ ...actingAsUser, section: 'tarifas' }), false, 'la actuación no hereda accesos ajenos a la ACL efectiva')
assert.equal(hasAccess({ ...actingAsUser, section: 'crm.contactos', viewingUser: null }), false, 'la actuación sin identidad efectiva falla cerrada')
assert.equal(hasAccess({
  ...actingAsUser,
  section: 'crm.contactos',
  isViewingAs: true,
  isViewingAsUser: false,
  viewingUser: null,
  viewAsRole: 'VISOR',
}), false, 'simular sólo un rol descarta los grants y no hereda la ACL del actor')
assert.equal(hasAccess({
  ...actingAsUser,
  section: 'finanzas-tickets',
  effectiveRole: 'GERENTE',
  userRoles: ['GERENTE'],
  viewingUser: { ...actingAsUser.viewingUser, rol: 'GERENTE', roles: ['GERENTE'] },
  permisosGranulares: revokedTickets,
}), false, 'actuar como GERENTE mantiene su revocación explícita de Tickets/Gastos')
assert.equal(hasAccess({
  ...actingAsUser,
  section: 'subida-precios',
  effectiveRole: 'GERENTE',
  userRoles: ['GERENTE'],
  viewingUser: { ...actingAsUser.viewingUser, rol: 'GERENTE', roles: ['GERENTE'] },
  permisosGranulares: [],
  tienePermisosGranulares: false,
}), false, 'la actuación como GERENTE no abre Subida de Precios reservada al rol real')
assert.equal(hasAccess({ ...actingAsUser, section: 'usuarios' }), false, 'la actuación no concede las áreas exclusivas del propietario')
assert.equal(hasAccess({ ...actingAsUser, section: 'rentabilidad' }), false, 'la actuación conserva la restricción de Rentabilidad staging')

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
assert.doesNotMatch(serializedAuthorized, /Tickets\/Gastos/, 'el árbol autorizado no incluye Tickets/Gastos sin permiso')
const crmContainer = authorized.find(entry => entry.name === 'CRM')
assert.ok(crmContainer && isSidebarNavigationGroup(crmContainer), 'CRM permanece como contenedor, no como enlace autorizado')
assert.deepEqual(crmContainer.children.map(item => item.name), ['Contactos'], 'el contenedor promueve únicamente Contactos autorizado')
assert.ok(!('href' in crmContainer), 'el contenedor CRM no convierte el permiso hijo en acceso al root')
const authorizedHtml = renderToStaticMarkup(createElement(AdminSidebarMenu, {
  navigation: authorized,
  user: { name: 'Usuario efectivo', email: 'efectivo@example.test', role: 'VISOR' },
  financeEnvironment: 'staging',
}))
assert.match(authorizedHtml, /href="\/admin\/crm\/contactos"/, 'el HTML SSR mantiene la URL de Contactos')
assert.doesNotMatch(authorizedHtml, /href="\/admin\/crm"/, 'el HTML SSR no emite un enlace al padre no autorizado')
const actingNavigation = filterAuthorizedSidebarNavigation('staging', section => hasAccess({ ...actingAsUser, section }))
assert.deepEqual(actingNavigation, authorized, 'la actuación SSR muestra sólo el mismo árbol autorizado por su ACL efectiva')
const managerNavigation = filterAuthorizedSidebarNavigation('staging', section => hasAccess({
  section,
  effectiveRole: 'GERENTE',
  isSuperAdmin: false,
  userRoles: ['GERENTE'],
  permisosGranulares: revokedTickets,
  tienePermisosGranulares: true,
  ...noPreview,
}))
assert.match(JSON.stringify(managerNavigation), /Finanzas/, 'la revocación de Tickets no elimina el resto del módulo Finanzas')
assert.doesNotMatch(JSON.stringify(managerNavigation), /Tickets\/Gastos/, 'el árbol de GERENTE respeta la revocación explícita de Tickets/Gastos')
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

console.log('admin sidebar evaluator, SSR HTML, actuation ACL, Gerente revocations, Lorena and secure placeholder synthetic tests: ok')
