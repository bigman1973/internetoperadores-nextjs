import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as registry from '../lib/area4/section-registry'
import {
  AREA4_ACTIONS, AREA4_BASELINE_DESCRIPTORS_SHA256, AREA4_BASELINE_IDENTITIES_SHA256,
  AREA4_BASELINE_SOURCE, AREA4_DRAXTON_TECHNICAL_MENU, AREA4_GROUPED_MENU,
  AREA4_HISTORICAL_MENU, AREA4_MENU_GROUPS, AREA4_REGISTRY_USERS_SECTIONS,
  AREA4_REQUEST_CONTRACT, AREA4_SECTION_REGISTRY, area4CodeIsBaseline,
  area4RegisteredSurface, area4RegistrySurfaceMatches, area4RegistryUsersSections,
  area4SectionByKey, area4SurfaceDescriptor, area4UsersRowIsBaseline,
  type Area4Section, type Area4Surface,
} from '../lib/area4/section-registry'
import { APPROVED_ROLES, USERS_SECTIONS, approvedCodePermissions, mergeRolePermissions } from '../lib/area4/approved-roles'
import { area4CommandBodyLimit, area4RequestCapabilities } from '../lib/area4/request-policy'
import {
  filterAuthorizedSidebarNavigation, getEasyOnlySidebarNavigation, getSidebarNavigation,
  isSidebarNavigationGroup, type SidebarNavigationEntry, type SidebarNavigationItem,
} from '../components/admin/sidebar-navigation'
import type { ApprovedRole } from '../lib/area4/users-contract'

const root = process.cwd()
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const leaves = (tree: readonly SidebarNavigationEntry[]): SidebarNavigationItem[] => {
  const nested = (item: SidebarNavigationItem): SidebarNavigationItem[] => [item, ...(item.subitems || []).flatMap(nested)]
  return tree.flatMap(entry => isSidebarNavigationGroup(entry) ? entry.children.flatMap(nested) : nested(entry))
}
function discoveredPaths(directory: string, filename: RegExp, prefix: string): string[] {
  const base = join(root, directory)
  const walk = (current: string): string[] => readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const path = join(current, entry.name)
    return entry.isDirectory() ? walk(path) : filename.test(entry.name) ? [path] : []
  })
  return walk(base).map(file => {
    const nested = relative(base, dirname(file)).replaceAll('\\', '/')
    return nested ? `${prefix}/${nested}` : prefix
  })
}

test('source4d03 exacto: 439 descriptores y 79 identidades literales, SHA256 locked independiente', () => {
  assert.equal(AREA4_BASELINE_SOURCE, '4d03c9a3')
  const allMatches = area4RegistrySurfaceMatches()
  const matches = allMatches.filter(match => match.surface.baselineDescriptor !== undefined)
  assert.equal(matches.length, 439)
  assert.equal(AREA4_SECTION_REGISTRY.length, 79)
  const changedContracts = ['/api/admin/crm/hubspot/historial', '/api/admin/crm/isp/importar']
  assert.deepEqual(matches.filter(match => !match.baseline).map(match => match.surface.path).sort(), changedContracts)
  assert.equal(matches.filter(match => match.baseline).length, 437)
  assert.ok(allMatches.filter(match => match.surface.baselineDescriptor === undefined).every(match => !match.baseline), 'las altas nuevas no entran en la evidencia source4d03')
  const expectedSurfaces = '46f6730c0eb75836ee9fbf311d6ebb38b1b5e70babedc56591f6d6c97854a92f'
  const expectedIdentities = '1fd44a77bd14022b2e72de292e7081daf5b7590ec2f8c11c6416844afba0470c'
  assert.equal(AREA4_BASELINE_DESCRIPTORS_SHA256, expectedSurfaces)
  assert.equal(AREA4_BASELINE_IDENTITIES_SHA256, expectedIdentities)
  assert.equal(digest(matches.map(match => match.surface.baselineDescriptor).sort()), expectedSurfaces)
  assert.equal(digest(AREA4_SECTION_REGISTRY.map(section => section.baselineIdentity).sort()), expectedIdentities)
  for (const match of matches) {
    assert.deepEqual(Object.keys(match).sort(), ['baseline', 'descriptor', 'id', 'section', 'surface'])
    assert.equal(match.id, `${match.surface.kind}:${match.surface.path}`)
    if (changedContracts.includes(match.surface.path)) assert.notEqual(match.descriptor, match.surface.baselineDescriptor)
    else assert.equal(match.descriptor, match.surface.baselineDescriptor)
    assert.equal(area4RegisteredSurface(match.surface.path, match.surface.kind)?.id, match.id)
  }
})

test('inventario físico exacto, sin duplicados ni rutas ausentes registradas como reales', () => {
  const actual = area4RegistrySurfaceMatches()
  for (const kind of ['page', 'api'] as const) {
    const paths = actual.filter(match => match.surface.kind === kind).map(match => match.surface.path).sort()
    const filename = kind === 'page' ? /^page\.(?:tsx?|jsx?)$/ : /^route\.(?:tsx?|jsx?)$/
    const discovered = kind === 'page'
      ? [...discoveredPaths('app/admin', filename, '/admin'), ...discoveredPaths('app/empleado', filename, '/empleado'), ...discoveredPaths('app/peticiones', filename, '/peticiones')]
      : [...discoveredPaths('app/api/admin', filename, '/api/admin'), ...discoveredPaths('app/api/empleado', filename, '/api/empleado'), ...discoveredPaths('app/api/peticiones', filename, '/api/peticiones')]
    assert.deepEqual(paths, discovered.sort())
    assert.equal(new Set(paths).size, paths.length)
  }
})

test('Usuarios es un alias derivado: conserva 41 claves/nombres/membresías exactas, con grupos canónicos', () => {
  assert.equal(USERS_SECTIONS, AREA4_REGISTRY_USERS_SECTIONS)
  assert.deepEqual(USERS_SECTIONS, area4RegistryUsersSections())
  assert.equal(USERS_SECTIONS.length, 41)
  assert.equal(digest(USERS_SECTIONS.map(({ key, label, codes }) => ({ key, label, codes }))),
    '57c158ff63a8d85c8ee9f628d3d9ed9ec057c730b91cbb4e7c9decab4d583536')
  for (const section of AREA4_SECTION_REGISTRY) {
    const row = USERS_SECTIONS.find(candidate => candidate.codes.includes(section.areaCode))
    assert.ok(row, section.key)
    const anchor = AREA4_SECTION_REGISTRY.find(candidate => candidate.usersRow?.key === row.key)
    assert.equal(row.group, anchor?.group)
  }
  assert.deepEqual(USERS_SECTIONS.find(row => row.key === 'gastos')?.codes, [], 'no se fabrica un código Gastos inexistente')
})

test('el baseline por código incluye variantes vacías actuales, no un descendiente futuro', () => {
  for (const section of AREA4_SECTION_REGISTRY) assert.equal(area4CodeIsBaseline(section.areaCode), true, section.key)
  for (const code of ['admin.crm.particulares', 'admin.certificaciones.iso_27001', 'admin.certificaciones.tisax']) {
    assert.equal(area4CodeIsBaseline(code), true)
  }
  assert.equal(area4CodeIsBaseline('admin.crm.futuro'), false)
  assert.equal(area4CodeIsBaseline('admin.clientes.futuro'), false)
  assert.equal(area4CodeIsBaseline('admin.desconocido'), false)
})

test('una ruta nueva dentro de CRM histórico no hereda baseline, ni copiando su evidencia', () => {
  const crm = area4SectionByKey('crm')!
  const surfaces = crm.surfaces as Area4Surface[]
  const original = crm.surfaces.find(surface => surface.kind === 'api')!
  surfaces.push({ ...original, path: '/api/admin/crm/nuevo-no-asignado' })
  try {
    const match = area4RegisteredSurface('/api/admin/crm/nuevo-no-asignado', 'api')!
    assert.equal(match.section.areaCode, 'admin.crm')
    assert.equal(match.id, 'api:/api/admin/crm/nuevo-no-asignado')
    assert.equal(match.baseline, false)
    assert.equal(area4CodeIsBaseline('admin.crm'), true, 'baseline del código no concede la nueva superficie')
  } finally { surfaces.pop() }
})

test('sección/código/acción/contrato nuevos quedan cerrados; una etiqueta cosmética no cambia permisos', () => {
  const old = area4SectionByKey('crm')!
  const page = old.surfaces.find(surface => surface.kind === 'page')!
  const future: Area4Section = { key: 'crm-futuro', areaCode: 'admin.crm.futuro', label: 'Nuevo apartado', group: 'Comercial', surfaces: [{ path: '/admin/crm/futuro', kind: 'page' }] }
  const match = area4RegistrySurfaceMatches([future])[0]
  assert.equal(match.baseline, false)
  assert.deepEqual(match.surface.actions || [], [])
  assert.equal(area4RegistrySurfaceMatches([{ ...old, areaCode: 'admin.crm.nuevo-codigo', surfaces: [page] }])[0].baseline, false)
  assert.equal(area4RegistrySurfaceMatches([{ ...old, surfaces: [{ ...page, actions: ['V', 'E'] }] }])[0].baseline, false)
  assert.equal(area4RegistrySurfaceMatches([{ ...old, surfaces: [{ ...page, request: { commandBodyLimit: 99 } }] }])[0].baseline, false)
  assert.equal(area4SurfaceDescriptor({ ...old, label: 'Otro rótulo', group: 'Inicio' }, page), area4SurfaceDescriptor(old, page))
  assert.equal(area4RegistrySurfaceMatches([{ ...old, label: 'Otro rótulo', surfaces: [page] }])[0].baseline, true)
})

test('una nueva acción de selector cambia el descriptor exacto y exige revisión, no herencia VECX', () => {
  const actions = AREA4_REQUEST_CONTRACT.confirmActions as unknown as string[]
  const path = '/api/admin/crm/pipelines'
  assert.equal(area4RegisteredSurface(path, 'api')?.baseline, true)
  actions.push('confirmacion_futura')
  try {
    assert.equal(area4RegisteredSurface(path, 'api')?.baseline, false)
    assert.deepEqual(area4RequestCapabilities({ path, method: 'POST', action: 'confirmacion_futura' }), ['lectura', 'escritura', 'confirmar'])
  } finally { actions.pop() }
})

test('cada sección futura genera su propia fila, incluso si declara una agrupación CRM vieja', () => {
  const future: Area4Section = { key: 'crm-futuro', areaCode: 'admin.crm.futuro', label: 'CRM futuro', group: 'Comercial', usersRowKey: 'crm', surfaces: [] }
  const rows = area4RegistryUsersSections([...AREA4_SECTION_REGISTRY, future])
  assert.deepEqual(rows.find(row => row.key === 'crm-futuro')?.codes, ['admin.crm.futuro'])
  assert.deepEqual(rows.find(row => row.key === 'crm')?.codes, USERS_SECTIONS.find(row => row.key === 'crm')?.codes)
  assert.equal(area4UsersRowIsBaseline(rows.find(row => row.key === 'crm-futuro')!), false)
  const reused = { ...future, areaCode: 'admin.crm' }
  assert.equal(area4UsersRowIsBaseline(area4RegistryUsersSections([...AREA4_SECTION_REGISTRY, reused]).find(row => row.key === 'crm-futuro')!), false)
})

test('semilla reejecutada ante filas futuras: Gerente y otros roles vacíos; solo Superadmin todo', () => {
  const future: Area4Section = { key: 'crm-futuro', areaCode: 'admin.crm.futuro', label: 'CRM futuro', group: 'Comercial', surfaces: [] }
  const futureRegistry = [...AREA4_SECTION_REGISTRY, future]
  const exports: Record<string, unknown> = {}
  const source = readFileSync(join(root, 'lib/area4/approved-roles.ts'), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(compiled, { exports, require: (id: string) => {
    assert.equal(id, './section-registry', 'el constructor de semilla permanece puro')
    return { ...registry, AREA4_SECTION_REGISTRY: futureRegistry, AREA4_REGISTRY_USERS_SECTIONS: area4RegistryUsersSections(futureRegistry) }
  } })
  for (const role of exports.APPROVED_ROLES as ApprovedRole[]) {
    assert.equal(role.permissions['crm-futuro'], role.key === 'superadmin' ? 'VECX' : '', role.key)
  }
  assert.equal(registry.area4TechnicalMenu([...AREA4_SECTION_REGISTRY, { ...future, technicalOrder: 8,
    surfaces: [{ path: '/admin/crm/futuro', kind: 'page', actions: ['V', 'E'] }] }]).length, 8)
})

test('plantillas opcionales componen permisos sin mutar la semilla; códigos desconocidos y extras amplios cerrados', () => {
  const before = JSON.stringify(APPROVED_ROLES)
  const templates = APPROVED_ROLES.map(role => ({ ...role, permissions: { ...role.permissions, crm: role.key === 'comercial' ? 'V' : role.permissions.crm } }))
  assert.equal(mergeRolePermissions('comercial', {}, templates).crm, 'V')
  assert.equal(approvedCodePermissions('comercial', {}, ['admin.crm'], templates)['admin.crm'], 'V')
  assert.equal(approvedCodePermissions('contabilidad', { clientes: 'V' }, ['admin.clientes.futuro'])['admin.clientes.futuro'], '')
  assert.equal(approvedCodePermissions('gerente', {}, ['admin.crm.futuro'])['admin.crm.futuro'], '')
  assert.equal(JSON.stringify(APPROVED_ROLES), before)
})

test('ocho técnicos exactos sin Clientes/Draxton padre; Lorena Clientes V y salarios denegados', () => {
  const codes = [...new Set(AREA4_SECTION_REGISTRY.map(section => section.areaCode))]
  const technical = AREA4_DRAXTON_TECHNICAL_MENU.map(item => area4SectionByKey(item.section)!.areaCode)
  assert.equal(technical.length, 8)
  assert.deepEqual(technical.map(code => code.split('.').at(-1)).sort(), ['actualizaciones', 'contrato_guardias', 'informes', 'kpis', 'organigrama', 'personal', 'proyectos', 'seguimiento'])
  const draxton = approvedCodePermissions('draxton', {}, codes)
  assert.equal(draxton['admin.clientes'], '')
  assert.equal(draxton['admin.clientes.ggcc.draxton'], '')
  assert.equal(draxton['admin.clientes.ggcc.draxton.proyectos_singulares'], '')
  for (const code of technical) assert.equal(draxton[code], 'VE', code)
  const lorena = approvedCodePermissions('contabilidad', { clientes: 'V', personal: 'VEC', imputaciones: 'VEC' }, codes)
  for (const code of codes.filter(code => code === 'admin.clientes' || code.startsWith('admin.clientes.'))) assert.equal(lorena[code], 'V', code)
  for (const code of codes.filter(code => /nomina|salari/i.test(code))) assert.equal(lorena[code], '', code)
})

test('las dos proyecciones y todas sus variantes se apoyan en superficies reales baseline', () => {
  assert.deepEqual(Object.keys(AREA4_GROUPED_MENU), AREA4_MENU_GROUPS)
  assert.equal(AREA4_HISTORICAL_MENU.length, 26)
  for (const presentation of ['historico', 'agrupado'] as const) {
    const items = leaves(getSidebarNavigation('staging', true, presentation))
    for (const item of items) assert.equal(area4RegisteredSurface(item.href, 'page')?.baseline, true, item.href)
    assert.equal(items.find(item => item.href === '/admin/clientes?segmento=PARTICULAR')?.section, 'admin.crm.particulares')
    assert.equal(items.find(item => item.href === '/admin/certificaciones/iso-27001')?.section, 'admin.certificaciones.iso_27001')
    assert.equal(items.find(item => item.href === '/admin/certificaciones/tisax')?.section, 'admin.certificaciones.tisax')
    for (const item of AREA4_DRAXTON_TECHNICAL_MENU) assert.ok(items.some(candidate => candidate.href === item.href))
  }
  assert.equal(area4RegisteredSurface('/admin/empleados/nominas?origen=menu', 'page')?.section.areaCode, 'admin.empleados.nominas')
  assert.equal(area4RegisteredSurface('/admin/empleados/123#ficha', 'page')?.section.areaCode, 'admin.empleados')
})

test('el callback surface-aware cierra una acción nueva pese al permiso padre y promueve hijos autorizados', () => {
  const section = area4SectionByKey('crm')!
  const page = section.surfaces.find(surface => surface.path === '/admin/crm')!
  const actions = page.actions as string[]
  actions.push('E')
  try {
    for (const presentation of ['historico', 'agrupado'] as const) {
      assert.ok(!leaves(filterAuthorizedSidebarNavigation('staging', () => true, true, presentation)).some(item => item.href === '/admin/crm'))
      assert.ok(leaves(filterAuthorizedSidebarNavigation('staging', () => true, true, presentation, () => true)).some(item => item.href === '/admin/crm'))
    }
  } finally { actions.pop() }
  const promoted = leaves(filterAuthorizedSidebarNavigation('staging', () => true, true, 'agrupado', href => href === '/admin/crm/contactos'))
  assert.deepEqual(promoted.map(item => item.href), ['/admin/crm/contactos'])
})

test('navegación fácil deriva rutas y códigos del mismo registro', () => {
  assert.deepEqual(getEasyOnlySidebarNavigation('staging', true).map(item => [item.name, item.href]), [['Conciliar', '/admin/finanzas/conciliar'], ['Para pedir', '/admin/finanzas/para-pedir']])
  assert.deepEqual(getEasyOnlySidebarNavigation('production', false).map(item => [item.name, item.href]), [['Modo fácil', '/admin/finanzas/modo-facil'], ['Para pedir', '/admin/finanzas/para-pedir']])
  for (const item of getEasyOnlySidebarNavigation('staging', true)) assert.equal(item.section, area4RegisteredSurface(item.href, 'page')?.section.areaCode)
})

test('clasificador conserva límites individuales, GET/HEAD/OPTIONS, V+E mutante y labels C/X', () => {
  assert.deepEqual(AREA4_ACTIONS.map(({ letter, capability }) => [letter, capability]), [['V', 'lectura'], ['E', 'escritura'], ['C', 'confirmar'], ['X', 'exportar']])
  assert.deepEqual(AREA4_REQUEST_CONTRACT.selectors, ['action', 'accion'])
  assert.equal(area4CommandBodyLimit('/api/admin/finanzas/conciliar', 'POST'), 16 * 1024)
  assert.equal(area4CommandBodyLimit('/api/admin/crm/isp/vinculos', 'POST'), 8 * 1024 * 1024)
  assert.equal(area4CommandBodyLimit('/api/admin/finanzas/importar-movimientos', 'POST'), null)
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(area4CommandBodyLimit('/api/admin/finanzas/conciliar', method), null)
  for (const method of ['GET', 'HEAD']) assert.deepEqual(area4RequestCapabilities({ path: '/api/admin/crm/pipelines', method }), ['lectura'])
  assert.deepEqual(area4RequestCapabilities({ path: '/api/admin/crm/pipelines', method: 'OPTIONS', action: 'confirmar' }), [])
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.deepEqual(area4RequestCapabilities({ path: '/api/admin/crm/pipelines', method }), ['lectura', 'escritura'])
  for (const action of AREA4_REQUEST_CONTRACT.confirmActions) assert.deepEqual(area4RequestCapabilities({ path: '/api/admin/crm/pipelines', method: 'POST', action }), ['lectura', 'escritura', 'confirmar'])
  for (const action of AREA4_REQUEST_CONTRACT.exportActions) assert.deepEqual(area4RequestCapabilities({ path: '/api/admin/crm/pipelines', method: 'GET', queryAction: action }), ['lectura', 'exportar'])
})

test('M365 real es nuevo sin baseline; GET borrador exige V y E igual que su handler', () => {
  const eventPath = '/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365'
  const draftPath = '/api/admin/crm/contactos/[id]/m365/borrador'
  for (const path of [eventPath, draftPath]) {
    const match = area4RegisteredSurface(path, 'api')!
    assert.equal(match.section.areaCode, 'admin.crm.contactos')
    assert.equal(match.baseline, false)
    assert.equal(match.surface.baselineDescriptor, undefined)
  }
  assert.deepEqual(area4RequestCapabilities({ path: eventPath, method: 'GET' }), ['lectura'])
  assert.deepEqual(area4RequestCapabilities({ path: eventPath, method: 'POST' }), ['lectura', 'escritura'])
  for (const method of ['GET', 'HEAD']) assert.deepEqual(area4RequestCapabilities({ path: draftPath, method }), ['lectura', 'escritura'])
  assert.deepEqual(area4RequestCapabilities({ path: draftPath, method: 'OPTIONS' }), [])
})

test('REVIEW_PREVIEW solo V tras parseo cerrado real; preview falsificado no rebaja una mutación', () => {
  const preview = { action: 'confirmar', review: { kind: 'REVIEW_PREVIEW', id: 'fila-sintetica', decisionHash: 'a'.repeat(64) } }
  const input = { path: '/api/admin/finanzas/conciliar', method: 'POST', action: 'confirmar' }
  assert.deepEqual(area4RequestCapabilities({ ...input, body: preview }), ['lectura'])
  assert.deepEqual(area4RequestCapabilities({ ...input, body: { ...preview, idempotencyKey: 'extra-no-admitido' } }), ['lectura', 'escritura', 'confirmar'])
  assert.deepEqual(area4RequestCapabilities({ ...input, path: '/api/admin/crm/pipelines', body: preview }), ['lectura', 'escritura', 'confirmar'])
})

test('importaciones reales: HubSpot POST VEC y solo el comando mínimo ISP simular conserva V', () => {
  const isp = { path: '/api/admin/crm/isp/importar', method: 'POST' }
  const hub = { path: '/api/admin/crm/hubspot/historial', method: 'POST' }
  assert.deepEqual(area4RequestCapabilities({ ...isp, body: { modo: 'simular' } }), ['lectura'])
  for (const body of [undefined, { modo: 'aplicar' }, { modo: 'simular', preview: true }, { modo: 'otro' }]) {
    assert.deepEqual(area4RequestCapabilities({ ...isp, body }), ['lectura', 'escritura', 'confirmar'])
  }
  for (const body of [undefined, { confirmar: true }, { confirmar: false }, { modo: 'simular' }]) {
    assert.deepEqual(area4RequestCapabilities({ ...hub, body }), ['lectura', 'escritura', 'confirmar'])
  }
  assert.deepEqual(area4RequestCapabilities({ path: '/api/admin/crm/pipelines', method: 'POST', body: { modo: 'simular', confirmar: true } }), ['lectura', 'escritura'], 'no heurística global basada en modo o booleanos')
  for (const path of [isp.path, hub.path]) {
    assert.equal(area4RegisteredSurface(path, 'api')?.baseline, false)
    for (const method of ['GET', 'HEAD']) assert.deepEqual(area4RequestCapabilities({ path, method }), ['lectura'])
    assert.deepEqual(area4RequestCapabilities({ path, method: 'OPTIONS' }), [])
  }
})

test('los consumidores no conservan catálogos independientes de rutas, filas, etiquetas ni selectores', () => {
  const approved = readFileSync(join(root, 'lib/area4/approved-roles.ts'), 'utf8')
  const sidebar = readFileSync(join(root, 'components/admin/sidebar-navigation.ts'), 'utf8')
  const requests = readFileSync(join(root, 'lib/area4/request-policy.ts'), 'utf8')
  assert.match(approved, /USERS_SECTIONS = AREA4_REGISTRY_USERS_SECTIONS/)
  assert.doesNotMatch(approved, /const children\s*=|section\('inicio'|section\('crm'/)
  assert.doesNotMatch(sidebar, /href:\s*['"]\/(?:admin|empleado|peticiones)|const navigation\s*=|GROUP_ICONS/)
  assert.match(sidebar, /AREA4_HISTORICAL_MENU/)
  assert.match(sidebar, /AREA4_GROUPED_MENU/)
  assert.doesNotMatch(requests, /JSON_COMMAND_PATHS|CONFIRM_ACTIONS|EXPORT_ACTIONS|\/api\/admin\/finanzas\//)
  assert.match(requests, /AREA4_REQUEST_CONTRACT/)
  assert.match(requests, /parseConciliarCommand\(body\)/)
})
