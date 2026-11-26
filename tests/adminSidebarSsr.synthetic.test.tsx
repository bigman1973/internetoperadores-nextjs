import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { AREA4_DRAXTON_TECHNICAL_MENU, area4SectionByKey } from '../lib/area4/section-registry'
import * as sidebarNavigation from '../components/admin/sidebar-navigation'
import * as sidebarIcons from '../components/admin/presentation/AdminSidebarIcon'
import {
  hasAccess,
  permissionSignature,
} from '../components/admin/sidebar-access-evaluator'
import {
  filterAuthorizedSidebarNavigation,
  getEasyOnlySidebarNavigation,
  isSidebarNavigationGroup,
  getSidebarNavigation,
  sidebarItemContainsActivePath,
  type SidebarNavigationEntry,
  type SidebarNavigationItem,
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
  permisosGranulares: [
    { codigo: 'admin.finanzas', lectura: true, escritura: false, confirmar: false, exportar: true },
    ...revokedTickets,
  ],
  tienePermisosGranulares: true,
  ...noPreview,
}))
assert.match(JSON.stringify(managerNavigation), /Finanzas/, 'la revocación de Tickets no elimina el resto del módulo Finanzas')
assert.doesNotMatch(JSON.stringify(managerNavigation), /Tickets\/Gastos/, 'el árbol de GERENTE respeta la revocación explícita de Tickets/Gastos')
assert.equal(permissionSignature(granularOnly), permissionSignature([...granularOnly].reverse()), 'la firma de semilla no depende del orden de lectura')

const lorenaNavigation = getEasyOnlySidebarNavigation('staging')
assert.deepEqual(lorenaNavigation.map(item => item.name), ['Conciliar'], 'Lorena ve solo Conciliar en staging (pedir y remesas son vistas de la misma pantalla)')
const lorenaHtml = renderToStaticMarkup(createElement(AdminSidebarMenu, {
  navigation: lorenaNavigation,
  user: { name: 'Lorena', email: 'lorena@example.test', role: 'CONTABILIDAD' },
  easyOnly: true,
  financeEnvironment: 'staging',
}))
assert.match(lorenaHtml, /href="\/admin\/finanzas\/conciliar"/, 'el HTML SSR de Lorena incluye Conciliar en staging')
assert.doesNotMatch(lorenaHtml, /href="\/admin\/finanzas\/para-pedir"/, 'Para pedir ya no es enlace de menú: es una vista de Conciliar')
assert.match(lorenaHtml, />Lorena</, 'el HTML SSR conserva la identidad del usuario')
assert.doesNotMatch(lorenaHtml, /next\/link|prefetch/i, 'el HTML SSR no requiere el cliente de Link ni solicita prefetch')

const placeholderHtml = renderToStaticMarkup(createElement(AdminSidebarPlaceholder))
assert.match(placeholderHtml, /data-admin-sidebar-placeholder/, 'el fallback expone un marcador explícito de carga segura')
assert.doesNotMatch(placeholderHtml, /href=/, 'el fallback durante una ACL viva no emite enlaces potencialmente no autorizados')

const closedManager = { ...noPreview, effectiveRole: 'GERENTE', isSuperAdmin: false, userRoles: ['GERENTE'], permisosGranulares: [], tienePermisosGranulares: true, permissionsAdopted: true }
assert.equal(hasAccess({ ...closedManager, section: 'clientes' }), false, 'una ACL adoptada vacía no recupera menú por GERENTE')
for (const explicit of [false, true]) {
  assert.equal(hasAccess({ ...closedManager, section: 'admin.futura', tienePermisosGranulares: explicit, permissionsAdopted: explicit }), false, 'un código futuro sin consentimiento no abre por rol')
  assert.equal(hasAccess({ ...closedManager, section: 'admin.futura', permisosGranulares: [{ codigo: 'admin.futura', lectura: true, escritura: true }] }), false, 'un grant exacto solo no demuestra consentimiento futuro')
}
assert.equal(hasAccess({ ...closedManager, section: 'admin.futura', surfacePermissions: [{ id: 'page:/admin/futura', descriptor: 'inventado', actions: 'VECX' }], permisosGranulares: [{ codigo: 'admin.futura', lectura: true, escritura: true }] }), false, 'una semilla inventada no coincide con superficie canónica')

console.log('admin sidebar evaluator, SSR HTML, actuation ACL, Gerente revocations, Lorena and secure placeholder synthetic tests: ok')

// Draxton is registry-driven in both presentations; structure is not a parent grant.
const draxtonRoot = '/admin/clientes/ggcc/draxton'
const financeDraxton = '/admin/finanzas/clientes/ggcc-draxton'
const expectedTechnical = AREA4_DRAXTON_TECHNICAL_MENU.map(item => item.href).sort()
assert.equal(expectedTechnical.length, 8, 'el catálogo técnico ACL sigue exactamente ocho')
const technicalGrants = AREA4_DRAXTON_TECHNICAL_MENU.map(item => ({
  codigo: area4SectionByKey(item.section)!.areaCode, lectura: true, escritura: true,
}))
const technicalAccess = (grants = technicalGrants) => (section: string) => hasAccess({
  ...noPreview, section, effectiveRole: 'VISOR', isSuperAdmin: false, userRoles: ['VISOR'],
  permisosGranulares: grants, tienePermisosGranulares: true,
})
const allNodes = (tree: readonly SidebarNavigationEntry[]): SidebarNavigationItem[] => {
  const visit = (item: SidebarNavigationItem): SidebarNavigationItem[] => [item, ...(item.subitems || []).flatMap(visit)]
  return tree.flatMap(entry => isSidebarNavigationGroup(entry) ? entry.children.flatMap(visit) : visit(entry))
}
const links = (tree: readonly SidebarNavigationEntry[]) => allNodes(tree).filter(item => !item.containerOnly).map(item => item.href).sort()
const ssrHtml = (navigation: SidebarNavigationEntry[]) => renderToStaticMarkup(createElement(AdminSidebarMenu, {
  navigation, user: { name: 'Sintético', email: 'sintetico@example.test', role: 'VISOR' }, financeEnvironment: 'staging',
}))
const clientSource = ts.transpileModule(readFileSync('components/admin/lazy/InteractiveAdminSidebarMenu.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText
function clientRender(presentation: 'historico' | 'agrupado', canRead: (section: string) => boolean, opened = true, pathname = financeDraxton) {
  const navigation = filterAuthorizedSidebarNavigation('staging', canRead, true, presentation)
  const initialOpen = opened ? [...navigation.map(entry => entry.name), ...allNodes(navigation).map(item => `item:${item.href}`)] : []
  let autoOpened: string[] = []
  const exports: Record<string, any> = {}
  runInNewContext(clientSource, { exports, React, require: (id: string) => {
    if (id === 'react') return { ...React, useState: () => [initialOpen, (update: (prev: string[]) => string[]) => { autoOpened = update(initialOpen) }], useMemo: (fn: () => unknown) => fn(), useEffect: (fn: () => void) => fn() }
    if (id === 'next/link') return { default: ({ href, children, className, ...props }: any) => createElement('a', { href, className, 'aria-label': props['aria-label'] }, children) }
    if (id === 'next/navigation') return { usePathname: () => pathname }
    if (id === '../RoleContext') return { useRole: () => ({ hasAccess: canRead, hasSurfaceAccess: () => true, effectiveRole: 'VISOR', isViewingAs: false }) }
    if (id === '../sidebar-navigation') return sidebarNavigation
    if (id === '../presentation/AdminSidebarIcon') return sidebarIcons
    throw new Error(`Dependencia cliente inesperada: ${id}`)
  } })
  const html = renderToStaticMarkup(createElement(exports.default, { user: { name: 'Sintético', email: 'sintetico@example.test' }, financeEnvironment: 'staging', conciliarEnabled: true, menuPresentation: presentation }))
  return { html, autoOpened }
}
for (const presentation of ['historico', 'agrupado'] as const) {
  const ownerAccess = (section: string) => hasAccess({ ...noPreview, section, isArea4Owner: true, isSuperAdmin: true, effectiveRole: 'SUPER_ADMIN', userRoles: ['SUPER_ADMIN'], permisosGranulares: [], tienePermisosGranulares: false })
  const ownerNavigation = filterAuthorizedSidebarNavigation('staging', ownerAccess, true, presentation)
  const ownerRoot = allNodes(ownerNavigation).filter(item => item.href === draxtonRoot)
  assert.equal(ownerRoot.length, 1, `${presentation}: único root Draxton`)
  assert.equal(ownerRoot[0].name, 'GGCC Draxton')
  assert.equal(ownerRoot[0].collapsible, true)
  assert.equal(ownerRoot[0].preserveContainer, true)
  assert.ok(!ownerRoot[0].containerOnly)
  assert.deepEqual(ownerRoot[0].subitems!.slice(0, 8).map(item => item.name), ['Actualizaciones', 'Contrato de guardias', 'Informes', 'KPIs', 'Organigrama', 'Personal', 'Proyectos', 'Seguimiento'])
  assert.equal(ownerRoot[0].subitems![8].name, 'Finanzas Draxton')
  assert.equal(ownerRoot[0].subitems![8].href, financeDraxton)
  for (const suffix of ['contratos', 'finanzas', 'proyectos-singulares']) assert.ok(ownerRoot[0].subitems!.some(item => item.href === `${draxtonRoot}/${suffix}`), `${presentation}: conserva ${suffix}`)
  const finance = getSidebarNavigation('staging', true, presentation).find(entry => entry.name === 'Finanzas')!
  assert.ok(!allNodes([finance]).some(item => item.href === financeDraxton), 'Finanzas Draxton ya no aparece bajo Finanzas')
  const ownerHtml = ssrHtml(ownerNavigation)
  assert.equal((ownerHtml.match(/data-admin-sidebar-item="GGCC Draxton"/g) || []).length, 1)
  assert.match(ownerHtml, /<details data-admin-sidebar-item="GGCC Draxton">/)
  assert.match(ownerHtml, /aria-label="Desplegar GGCC Draxton"/)
  assert.equal((ownerHtml.match(/href="\/admin\/clientes\/ggcc\/draxton"/g) || []).length, 1, 'el propietario mantiene exactamente un enlace al root')
  assert.match(ownerHtml, /href="\/admin\/finanzas\/clientes\/ggcc-draxton"/)
  const technicalNavigation = filterAuthorizedSidebarNavigation('staging', technicalAccess(), true, presentation)
  const technicalRoot = allNodes(technicalNavigation).filter(item => item.href === draxtonRoot)
  assert.equal(technicalRoot.length, 1)
  assert.equal(technicalRoot[0].containerOnly, true, 'href canónico no implica enlace autorizado')
  assert.deepEqual(links(technicalNavigation), expectedTechnical, 'técnico: ocho enlaces exactos sin Finanzas ni root')
  const technicalHtml = ssrHtml(technicalNavigation)
  assert.match(technicalHtml, /<details data-admin-sidebar-item="GGCC Draxton">/)
  assert.doesNotMatch(technicalHtml, /href="\/admin\/clientes\/ggcc\/draxton"|href="\/admin\/finanzas\/clientes\/ggcc-draxton"/)
  const htmlLinks = [...technicalHtml.matchAll(/href="([^"]+)"/g)].map(match => match[1]).filter(href => href !== '/admin').sort()
  assert.deepEqual(htmlLinks, expectedTechnical)
  const revoked = technicalGrants.map(grant => ({ ...grant, lectura: grant.codigo.endsWith('.informes') ? false : grant.lectura }))
  const revokedNavigation = filterAuthorizedSidebarNavigation('staging', technicalAccess(revoked), true, presentation)
  assert.equal(links(revokedNavigation).length, 7)
  assert.doesNotMatch(ssrHtml(revokedNavigation), /href="\/admin\/clientes\/ggcc\/draxton\/informes"/)
  const surfaceRevoked = filterAuthorizedSidebarNavigation('staging', technicalAccess(), true, presentation, href => href !== `${draxtonRoot}/kpis`)
  assert.equal(links(surfaceRevoked).length, 7)
  assert.ok(!links(surfaceRevoked).includes(`${draxtonRoot}/kpis`))
  const empty = filterAuthorizedSidebarNavigation('staging', () => false, true, presentation)
  assert.deepEqual(empty, [])
  assert.doesNotMatch(ssrHtml(empty), /GGCC Draxton/, 'root sin V ni hijos desaparece')
  const crm = filterAuthorizedSidebarNavigation('staging', section => section === 'admin.crm.contactos', true, presentation)
  assert.deepEqual(links(crm), ['/admin/crm/contactos'])
  assert.doesNotMatch(ssrHtml(crm), /href="\/admin\/crm"/)
  assert.equal(sidebarItemContainsActivePath(ownerRoot[0], financeDraxton), true, 'autoapertura recursiva detecta URL Finanzas externa al prefix')
  const ownerClient = clientRender(presentation, ownerAccess)
  assert.match(ownerClient.html, /aria-label="Desplegar GGCC Draxton" aria-expanded="true"|aria-expanded="true" aria-label="Desplegar GGCC Draxton"/)
  assert.match(ownerClient.html, /href="\/admin\/clientes\/ggcc\/draxton"/)
  const technicalClient = clientRender(presentation, technicalAccess())
  const clientLinks = [...technicalClient.html.matchAll(/href="([^"]+)"/g)].map(match => match[1]).filter(href => href !== '/admin').sort()
  assert.deepEqual(clientLinks, expectedTechnical, 'cliente: mismos ocho enlaces exactos, sin ancla al contenedor')
  assert.ok(clientRender(presentation, ownerAccess, false).autoOpened.includes(`item:${draxtonRoot}`), 'cliente autoabre Draxton para Finanzas, aunque la URL no comparte prefix')
}
console.log('Draxton registry tree, SSR/client links, recursive autoopen, exact eight technical ACL and CRM promotion: ok')
