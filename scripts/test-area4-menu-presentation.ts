import assert from 'node:assert/strict'
import test from 'node:test'
import { AREA4_MENU_CONFIGURATION_ID, readArea4MenuConfiguration, resolveArea4MenuPresentation } from '../lib/area4/menu-presentation'
import { evaluateArea4Capability } from '../lib/area4/policy'
import { AREA4_TEMPLATES } from '../lib/area4/templates'
import { AREA4_DRAXTON_TECHNICAL_MENU, AREA4_MENU_GROUPS } from '../lib/area4/section-registry'
import { hasAccess, checkGranularAccess, type AdminSidebarAccessInput, type AdminSidebarPermission } from '../components/admin/sidebar-access-evaluator'
import { filterAuthorizedSidebarNavigation, getSidebarNavigation, isSidebarNavigationGroup, type SidebarNavigationEntry, type SidebarNavigationItem, type SidebarPresentation } from '../components/admin/sidebar-navigation'

const owner = { id: 3, activo: true, rol: 'SUPER_ADMIN' }
const manager = { id: 8, activo: true, rol: 'GERENTE' }
process.env.AREA4_OWNER_USER_ID = '3'

const base: AdminSidebarAccessInput = {
  section: 'finanzas', effectiveRole: 'VISOR', isSuperAdmin: false, isArea4Owner: false,
  isViewingAs: false, isViewingAsUser: false, viewAsRole: null, viewingUser: null,
  userRoles: ['VISOR'], permisosGranulares: [], tienePermisosGranulares: false,
}

function access(section: string, overrides: Partial<AdminSidebarAccessInput> = {}): boolean {
  return hasAccess({ ...base, ...overrides, section })
}

function grantsForTemplate(id: string): AdminSidebarPermission[] {
  const template = AREA4_TEMPLATES.find(item => item.id === id)
  assert.ok(template)
  return template.permisos.map(grant => ({ ...grant, codigo: grant.areaCodigo }))
}

function leafItems(tree: SidebarNavigationEntry[]): SidebarNavigationItem[] {
  const nested = (item: SidebarNavigationItem): SidebarNavigationItem[] => [...(item.containerOnly ? [] : [item]), ...(item.subitems || []).flatMap(nested)]
  return tree.flatMap(entry => isSidebarNavigationGroup(entry) ? entry.children.flatMap(nested) : nested(entry))
}

function menu(presentation: SidebarPresentation, overrides: Partial<AdminSidebarAccessInput> = {}) {
  return filterAuthorizedSidebarNavigation('staging', section => access(section, overrides), true, presentation)
}

test('el menú histórico es el valor seguro por defecto', () => {
  assert.equal(resolveArea4MenuPresentation(null, owner), 'historico')
  assert.equal(resolveArea4MenuPresentation({ menuAgrupadoParaPropietario: false, menuAgrupadoParaTodos: false }, owner), 'historico')
  assert.deepEqual(getSidebarNavigation('staging'), getSidebarNavigation('staging', true, 'historico'))
})

test('la prueba inicial del agrupado se limita al propietario canónico', () => {
  const config = { menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: false }
  assert.equal(resolveArea4MenuPresentation(config, owner), 'agrupado')
  assert.equal(resolveArea4MenuPresentation(config, manager), 'historico')
  assert.equal(resolveArea4MenuPresentation(config, { ...owner, id: 4 }), 'historico')
})

test('la activación global solo cambia presentación, nunca concede enlaces', () => {
  const config = { menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: true }
  assert.equal(resolveArea4MenuPresentation(config, owner), 'agrupado')
  assert.equal(resolveArea4MenuPresentation(config, manager), 'agrupado')
  const grants = grantsForTemplate('area4-empleado-portal-peticiones')
  const hrefs = leafItems(menu('agrupado', { permisosGranulares: grants, tienePermisosGranulares: true })).map(item => item.href)
  assert.deepEqual(hrefs.sort(), ['/empleado', '/peticiones'])
})

test('la lectura falla al histórico si la migración todavía no está aplicada', async () => {
  const config = await readArea4MenuConfiguration({
    configuracionPanelArea4: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        assert.equal(where.id, AREA4_MENU_CONFIGURATION_ID)
        throw new Error('tabla todavía no aplicada')
      },
    },
  } as never)
  assert.deepEqual(config, { menuAgrupadoParaPropietario: false, menuAgrupadoParaTodos: false })
})

test('el propietario real ve exactamente siete contenedores agrupados', () => {
  const tree = menu('agrupado', { effectiveRole: 'SUPER_ADMIN', isSuperAdmin: true, isArea4Owner: true })
  assert.deepEqual(tree.map(entry => entry.name), [...AREA4_MENU_GROUPS])
  assert.ok(tree.every(isSidebarNavigationGroup))
})

test('un SUPER_ADMIN secundario no concede acceso total al real ni al usuario simulado', () => {
  const secondary = { userRoles: ['VISOR', 'SUPER_ADMIN'] }
  assert.equal(access('finanzas', secondary), false)
  assert.equal(access('usuarios', secondary), false)
  assert.equal(access('finanzas', {
    ...secondary, isSuperAdmin: true, isArea4Owner: true, isViewingAs: true, isViewingAsUser: true,
    viewingUser: { id: 12, nombre: 'Técnico', email: 'tecnico@example.test', rol: 'VISOR', roles: ['VISOR', 'SUPER_ADMIN'] },
  }), false)
  assert.equal(access('finanzas', { effectiveRole: 'SUPER_ADMIN', isSuperAdmin: true, isArea4Owner: false }), false)
  assert.equal(access('finanzas', {
    effectiveRole: 'SUPER_ADMIN', isSuperAdmin: true, isArea4Owner: true,
    isViewingAs: true, viewAsRole: 'SUPER_ADMIN',
  }), false)
})

test('la actuación usa los grants de la persona efectiva, no los privilegios de Víctor', () => {
  const grants = grantsForTemplate('area4-tecnico-draxton-8')
  const simulated = {
    effectiveRole: 'VISOR', isSuperAdmin: true, isArea4Owner: true,
    isViewingAs: true, isViewingAsUser: true,
    userRoles: ['SUPER_ADMIN'],
    viewingUser: { id: 12, nombre: 'Técnico', email: 'tecnico@example.test', rol: 'VISOR', roles: ['VISOR', 'SUPER_ADMIN'] },
    permisosGranulares: grants, tienePermisosGranulares: true,
  }
  assert.equal(access('admin.clientes.ggcc.draxton.informes', simulated), true)
  assert.equal(access('clientes', simulated), false)
  assert.equal(access('admin.usuarios', simulated), false)
  assert.equal(access('admin.permisos.perfiles', simulated), false)
  assert.equal(access('rentabilidad', simulated), false)
  assert.equal(access('subida-precios', simulated), false)
})

test('la previsualización de rol VISOR no hereda grants ni roles del propietario inicial', () => {
  const preview = {
    effectiveRole: 'VISOR', isSuperAdmin: true, isArea4Owner: true,
    isViewingAs: true, viewAsRole: 'VISOR', userRoles: ['SUPER_ADMIN', 'GERENTE'],
    permisosGranulares: [{ codigo: 'admin', lectura: true, escritura: true }],
    tienePermisosGranulares: true,
  }
  assert.equal(access('finanzas', preview), false)
  assert.equal(access('crm', preview), false)
  assert.equal(access('usuarios', preview), false)
  assert.deepEqual(leafItems(menu('agrupado', preview)).map(item => item.href).sort(), ['/empleado', '/peticiones'])
})

test('un permiso hijo nunca habilita enlaces a roots padre ni a áreas hermanas', () => {
  const grants = [{ codigo: 'admin.clientes.ggcc.draxton.informes', lectura: true, escritura: true }]
  assert.equal(checkGranularAccess('clientes', grants), false)
  assert.equal(checkGranularAccess('admin', grants), false)
  assert.equal(checkGranularAccess('clientes.ggcc.draxton', grants), false)
  assert.equal(checkGranularAccess('admin.clientes.ggcc.draxton.informes', grants), true)
  assert.equal(checkGranularAccess('admin.clientes.ggcc.draxton.kpis', grants), false)
})

test('el grant más específico revoca una hija y coincide con la política compartida', () => {
  const grants = [
    { codigo: 'admin.clientes', lectura: true, escritura: true },
    { codigo: 'admin.clientes.ggcc.draxton.informes', lectura: false, escritura: false },
  ]
  const overrides = { permisosGranulares: grants, tienePermisosGranulares: true }
  for (const section of ['admin.clientes', 'admin.clientes.ggcc.draxton.informes', 'admin.clientes.ggcc.draxton.kpis']) {
    const expected = evaluateArea4Capability({ principal: { id: 12, activo: true, rol: 'VISOR' }, grants, codigoArea: section, capability: 'lectura', ownerId: 3 })
    assert.equal(access(section, overrides), expected, section)
    assert.equal(access(section, { ...overrides, permisosGranulares: [...grants].reverse() }), expected, section)
  }
  for (const presentation of ['historico', 'agrupado'] as const) {
    const hrefs = leafItems(menu(presentation, overrides)).map(item => item.href)
    assert.ok(hrefs.includes('/admin/clientes/ggcc/draxton/kpis'))
    assert.ok(!hrefs.includes('/admin/clientes/ggcc/draxton/informes'))
  }
})

test('Gerente adoptado respeta revocaciones y no recupera apartados no concedidos', () => {
  const grants = [
    { codigo: 'admin.finanzas', lectura: false, escritura: false },
    { codigo: 'admin.finanzas.facturas', lectura: true, escritura: true },
  ]
  const overrides = { effectiveRole: 'GERENTE', userRoles: ['GERENTE'], permisosGranulares: grants, tienePermisosGranulares: true }
  for (const area of ['admin.finanzas', 'admin.finanzas.facturas', 'admin.finanzas.movimientos', 'admin.clientes', 'admin.usuarios']) {
    const expected = evaluateArea4Capability({ principal: manager, grants, codigoArea: area, capability: 'lectura', ownerId: 3, permissionsAdopted: true })
    assert.equal(access(area, overrides), expected, area)
  }
  const hrefs = leafItems(menu('agrupado', overrides)).map(item => item.href)
  assert.ok(hrefs.includes('/admin/finanzas/facturas'))
  assert.ok(!hrefs.includes('/admin/finanzas'))
  assert.ok(!hrefs.includes('/admin/finanzas/movimientos'))
})

test('los grants explícitos false o solo escritura no caen al fallback legacy', () => {
  for (const grant of [
    { codigo: 'admin.crm', lectura: false, escritura: false },
    { codigo: 'admin.crm', lectura: false, escritura: true },
  ]) {
    assert.equal(access('crm', { effectiveRole: 'VENTAS', userRoles: ['VENTAS', 'SUPER_ADMIN'], permisosGranulares: [grant], tienePermisosGranulares: false }), false)
  }
  assert.equal(access('finanzas', { effectiveRole: 'MARKETING', userRoles: ['MARKETING', 'SUPER_ADMIN'] }), false)
  assert.equal(access('crm', { effectiveRole: 'MARKETING', userRoles: ['MARKETING', 'SUPER_ADMIN'] }), true)
})

test('el técnico Draxton ve las ocho páginas específicas en ambos menús, sin root Clientes', () => {
  const grants = grantsForTemplate('area4-tecnico-draxton-8')
  const expected = AREA4_DRAXTON_TECHNICAL_MENU.map(item => item.href).sort()
  assert.equal(expected.length, 8)
  for (const presentation of ['historico', 'agrupado'] as const) {
    const tree = menu(presentation, { permisosGranulares: grants, tienePermisosGranulares: true })
    const hrefs = leafItems(tree).map(item => item.href).sort()
    assert.deepEqual(hrefs, expected, presentation)
    assert.ok(!hrefs.includes('/admin/clientes'))
    assert.ok(!hrefs.includes('/admin/clientes/ggcc/draxton'))
    assert.ok(tree.every(entry => !isSidebarNavigationGroup(entry) || entry.children.length > 0))
  }
})

test('empleado ve solo portal y /peticiones propias, jamás /admin/peticiones', () => {
  const grants = grantsForTemplate('area4-empleado-portal-peticiones')
  for (const presentation of ['historico', 'agrupado'] as const) {
    const hrefs = leafItems(menu(presentation, { permisosGranulares: grants, tienePermisosGranulares: true })).map(item => item.href).sort()
    assert.deepEqual(hrefs, ['/empleado', '/peticiones'], presentation)
  }
  assert.equal(access('peticiones', { permisosGranulares: grants, tienePermisosGranulares: true }), false)
})

test('CRM granular conserva su hijo sin conceder el resumen ni las áreas hermanas', () => {
  const grants = [{ codigo: 'admin.crm.contactos', lectura: true, escritura: false }]
  for (const presentation of ['historico', 'agrupado'] as const) {
    const hrefs = leafItems(menu(presentation, { permisosGranulares: grants, tienePermisosGranulares: true })).map(item => item.href)
    assert.deepEqual(hrefs, ['/admin/crm/contactos'], presentation)
  }
})

test('Rentabilidad y Subida de precios conservan las restricciones reales de staging', () => {
  const realOwner = { effectiveRole: 'SUPER_ADMIN', isSuperAdmin: true, isArea4Owner: true }
  assert.equal(access('rentabilidad', realOwner), true)
  assert.equal(access('admin.rentabilidad', { ...realOwner, isViewingAsUser: true }), false)
  assert.equal(access('rentabilidad', { effectiveRole: 'GERENTE' }), false)
  assert.equal(access('rentabilidad', { permisosGranulares: [{ codigo: 'admin', lectura: true, escritura: true }], tienePermisosGranulares: true }), false)
  assert.equal(access('subida-precios', { effectiveRole: 'GERENTE' }), true)
  assert.equal(access('subida-precios', { ...realOwner, isViewingAs: true, viewAsRole: 'GERENTE' }), false)
  assert.equal(access('subida-precios', { permisosGranulares: [{ codigo: 'admin.subida_precios', lectura: true, escritura: true }], tienePermisosGranulares: true }), false)
})

test('las banderas de entorno de staging se conservan en histórico y agrupado', () => {
  for (const presentation of ['historico', 'agrupado'] as const) {
    const production = leafItems(getSidebarNavigation('production', false, presentation))
    const staging = leafItems(getSidebarNavigation('staging', true, presentation))
    const unavailable = leafItems(getSidebarNavigation(null, false, presentation))
    assert.ok(staging.some(item => item.href === '/admin/rentabilidad'))
    assert.ok(staging.some(item => item.href === '/admin/finanzas/conciliar'))
    assert.ok(staging.some(item => item.href === '/admin/finanzas/analitica-cliente'))
    assert.ok(staging.some(item => item.href === '/admin/finanzas/para-pedir' && item.name.endsWith(' · staging')))
    assert.ok(!production.some(item => ['/admin/rentabilidad', '/admin/finanzas/conciliar', '/admin/finanzas/analitica-cliente'].includes(item.href)))
    assert.ok(!unavailable.some(item => ['/admin/rentabilidad', '/admin/finanzas/modo-facil', '/admin/finanzas/para-pedir', '/admin/finanzas/reparto-clientes'].includes(item.href)))
  }
})
