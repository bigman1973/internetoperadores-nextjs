import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import test from 'node:test'
import {
  AREA4_DRAXTON_TECHNICAL_MENU,
  AREA4_GROUPED_MENU,
  AREA4_MENU_GROUPS,
  AREA4_SECTION_REGISTRY,
  area4RegisteredSurfaceArea,
  area4RegisteredSurfacePaths,
  area4SectionByKey,
} from '../lib/area4/section-registry'

const root = process.cwd()

function files(directory: string, name: RegExp): string[] {
  const absolute = join(root, directory)
  const walk = (current: string): string[] => readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const next = join(current, entry.name)
    if (entry.isDirectory()) return walk(next)
    return name.test(entry.name) ? [next] : []
  })
  return walk(absolute)
}

function surfacePaths(directory: string, name: RegExp, prefix: string): string[] {
  return files(directory, name).map(file => {
    const nested = relative(join(root, directory), dirname(file)).replaceAll('\\', '/')
    return nested ? `${prefix}/${nested}` : prefix
  }).sort()
}

function matchesRegisteredPage(path: string, pattern: string): boolean {
  const expected = pattern.split('/').filter(Boolean)
  const received = path.split('/').filter(Boolean)
  return expected.length === received.length && expected.every((segment, index) => /^\[[^/]+\]$/.test(segment) || segment === received[index])
}

function leaves(): Array<{ name: string; href: string; section: string }> {
  return AREA4_MENU_GROUPS.flatMap(group => AREA4_GROUPED_MENU[group].flatMap(item => [item, ...(item.subitems || [])]))
}

test('cada página y API del panel, portal y peticiones propias figura exactamente una vez', () => {
  const discoveredPages = [
    ...surfacePaths('app/admin', /^page\.(?:tsx?|jsx?)$/, '/admin'),
    ...surfacePaths('app/empleado', /^page\.(?:tsx?|jsx?)$/, '/empleado'),
    ...surfacePaths('app/peticiones', /^page\.(?:tsx?|jsx?)$/, '/peticiones'),
  ].sort()
  const discoveredApis = [
    ...surfacePaths('app/api/admin', /^route\.(?:tsx?|jsx?)$/, '/api/admin'),
    ...surfacePaths('app/api/empleado', /^route\.(?:tsx?|jsx?)$/, '/api/empleado'),
    ...surfacePaths('app/api/peticiones', /^route\.(?:tsx?|jsx?)$/, '/api/peticiones'),
  ].sort()
  // Sin Set: una ruta duplicada también debe hacer fallar esta prueba.
  assert.deepEqual([...area4RegisteredSurfacePaths('page')].sort(), discoveredPages)
  assert.deepEqual([...area4RegisteredSurfacePaths('api')].sort(), discoveredApis)
  const keys = AREA4_SECTION_REGISTRY.map(section => section.key)
  assert.equal(new Set(keys).size, keys.length, 'las claves de sección también son únicas')
})

test('el resolvedor obtiene el área específica de cada superficie y prioriza literales sobre fichas', () => {
  for (const section of AREA4_SECTION_REGISTRY) {
    for (const surface of section.surfaces) {
      const concretePath = surface.path.replace(/\[[^/]+\]/g, '123')
      assert.equal(area4RegisteredSurfaceArea(concretePath, surface.kind), section.areaCode, concretePath)
    }
  }
  assert.equal(area4RegisteredSurfaceArea('/admin/empleados/nominas', 'page'), 'admin.empleados.nominas')
  assert.equal(area4RegisteredSurfaceArea('/admin/empleados/123', 'page'), 'admin.empleados')
  assert.equal(area4RegisteredSurfaceArea('/api/admin/no-existe', 'api'), null)
  assert.equal(area4RegisteredSurfaceArea('/admin/rentabilidad', 'api'), null)
})

test('CRM, Rentabilidad y Subida de precios incorporan las superficies reales de staging', () => {
  const expected: Array<[string, 'page' | 'api', string]> = [
    ['/admin/crm/isp', 'page', 'admin.crm'],
    ['/api/admin/crm/isp/importar', 'api', 'admin.crm'],
    ['/api/admin/crm/isp/vinculos', 'api', 'admin.crm'],
    ['/admin/crm/pipelines', 'page', 'admin.crm'],
    ['/api/admin/crm/pipelines', 'api', 'admin.crm'],
    ['/api/admin/crm/pipelines/123', 'api', 'admin.crm'],
    ['/api/admin/crm/pipelines/123/negocios', 'api', 'admin.crm'],
    ['/api/admin/crm/pipelines/buscar', 'api', 'admin.crm'],
    ['/api/admin/crm/pipelines/negocios/123', 'api', 'admin.crm'],
    ['/api/admin/crm/leads/soluciones/123', 'api', 'admin.crm'],
    ['/admin/crm/contactos', 'page', 'admin.crm.contactos'],
    ['/api/admin/crm/contactos/123/actividades', 'api', 'admin.crm.contactos'],
    ['/admin/crm/empresas', 'page', 'admin.crm.empresas'],
    ['/api/admin/crm/empresas/sync', 'api', 'admin.crm.empresas'],
    ['/admin/crm/listas', 'page', 'admin.crm.listas'],
    ['/admin/crm/partners', 'page', 'admin.crm.partners'],
    ['/admin/rentabilidad', 'page', 'admin.rentabilidad'],
    ['/api/admin/rentabilidad', 'api', 'admin.rentabilidad'],
    ['/api/admin/rentabilidad/exceptions', 'api', 'admin.rentabilidad'],
    ['/api/admin/rentabilidad/external-costs', 'api', 'admin.rentabilidad'],
    ['/api/admin/rentabilidad/recalculate', 'api', 'admin.rentabilidad'],
    ['/api/admin/rentabilidad/rules', 'api', 'admin.rentabilidad'],
    ['/api/admin/rentabilidad/sync', 'api', 'admin.rentabilidad'],
    ['/admin/subida-precios', 'page', 'admin.subida_precios'],
    ['/api/admin/subida-precios/dataset', 'api', 'admin.subida_precios'],
    ['/api/admin/subida-precios/escenarios', 'api', 'admin.subida_precios'],
    ['/api/admin/subida-precios/escenarios/123', 'api', 'admin.subida_precios'],
    ['/api/admin/subida-precios/escenarios/123/aprobar', 'api', 'admin.subida_precios'],
    ['/api/admin/subida-precios/escenarios/123/export', 'api', 'admin.subida_precios'],
    ['/api/admin/subida-precios/tipo-cliente', 'api', 'admin.subida_precios'],
    ['/admin/sistemas', 'page', 'admin.sistemas'],
    ['/api/admin/sistemas/servicios', 'api', 'admin.sistemas'],
    ['/api/admin/sistemas/estado-vivo', 'api', 'admin.sistemas'],
    ['/api/admin/sistemas/costes', 'api', 'admin.sistemas'],
    ['/api/admin/sistemas/incidencias', 'api', 'admin.sistemas'],
    ['/api/admin/sistemas/tasas', 'api', 'admin.sistemas'],
    ['/admin/finanzas/impuestos', 'page', 'admin.finanzas.impuestos'],
    ['/api/admin/finanzas/impuestos', 'api', 'admin.finanzas.impuestos'],
    ['/api/admin/finanzas/impuestos/presentados', 'api', 'admin.finanzas.impuestos'],
    ['/admin/finanzas/presupuesto', 'page', 'admin.finanzas.presupuesto'],
    ['/api/admin/finanzas/presupuesto/versiones', 'api', 'admin.finanzas.presupuesto'],
    ['/api/admin/finanzas/presupuesto/versiones/123', 'api', 'admin.finanzas.presupuesto'],
    ['/api/admin/finanzas/presupuesto/versiones/123/lineas', 'api', 'admin.finanzas.presupuesto'],
    ['/api/admin/finanzas/presupuesto/versiones/123/aprobar', 'api', 'admin.finanzas.presupuesto'],
    ['/api/admin/finanzas/presupuesto/versiones/123/seguimiento', 'api', 'admin.finanzas.presupuesto'],
  ]
  for (const [path, kind, area] of expected) assert.equal(area4RegisteredSurfaceArea(path, kind), area, path)
  // La rentabilidad financiera anterior no se reclasifica como el nuevo módulo aislado.
  assert.equal(area4RegisteredSurfaceArea('/api/admin/finanzas/rentabilidad', 'api'), 'admin.finanzas')
})

test('la guardia global de páginas/APIs usa el registro y evalúa V/E/C/X antes de high-risk', () => {
  const middleware = readFileSync(join(root, 'middleware.js'), 'utf8')
  const start = middleware.indexOf('async function area4RegisteredAdminApiBoundary(request)')
  const end = middleware.indexOf('export async function middleware(request)')
  assert.ok(start >= 0 && end > start, 'la guardia global debe existir')
  const boundary = middleware.slice(start, end)
  assert.match(boundary, /pathname === '\/admin' \|\| pathname\.startsWith\('\/admin\/'\)/)
  assert.match(boundary, /pathname\.startsWith\('\/api\/admin\/'\)/)
  assert.match(boundary, /area4RegisteredSurfaceArea\(pathname, isApi \? 'api' : 'page'\)/)
  assert.match(boundary, /if \(!codigoArea\).*Superficie administrativa no registrada/)
  assert.match(boundary, /isArea4OwnerOnlyArea\(codigoArea\)/)
  assert.match(boundary, /area4CanReadOwnPermissionSnapshot/)
  assert.match(boundary, /effectiveId: userId/)
  assert.match(boundary, /if \(!marker\?\.permisosArea4Vivos\) return surfaceMatch\.baseline \? null : privateBoundary/)
  assert.match(boundary, /isArea4MissingAdoptionColumn\(error\)/)
  assert.doesNotMatch(boundary, /includes\('permisos_area4_vivos'\)/)
  assert.ok(boundary.indexOf('if (!surfaceMatch.baseline)') < boundary.indexOf('let marker;'), 'las superficies nuevas se cierran antes de leer el marcador o admitir compatibilidad')
  assert.match(boundary, /readArea4SurfaceAccessUser\(prisma, userId\)/)
  assert.match(boundary, /validateArea4NewSurfaceConsent\(prisma, surfaceUser, surfaceMatch, capability/)
  assert.ok(boundary.indexOf('isArea4OwnerOnlyArea(codigoArea)') < boundary.indexOf('if (!marker?.permisosArea4Vivos)'), 'las áreas de control se protegen incluso antes de adopción')
  assert.match(boundary, /area4RequestCapabilities/)
  assert.match(boundary, /for \(const capability of capabilities\)/)
  assert.match(boundary, /evaluateArea4Capability\(\{ principal: user, grants, codigoArea, capability, isImpersonating, permissionsAdopted: true,[\s\S]*newSurfaceConsent: consent, requireExactGrant: !surfaceMatch\.baseline/)
  assert.match(boundary, /area4FinanceModuleAllows\(\{ principal, codigoArea, capability, isImpersonating \}\)/)
  assert.ok(boundary.indexOf('area4FinanceModuleAllows') < boundary.indexOf('if (!marker?.permisosArea4Vivos)'), 'las restricciones E preceden a la compatibilidad pre-migración')
  assert.match(boundary, /if \(pathname === '\/api\/admin\/actuar-como'\) return null/)
  assert.doesNotMatch(boundary, /pathname\.startsWith\('\/api\/admin\/finanzas/)
  const dispatch = middleware.slice(end)
  const area4Call = dispatch.indexOf('await area4RegisteredAdminApiBoundary(request)')
  const highRiskCall = dispatch.indexOf('await highRiskApiBoundary(request)')
  assert.ok(area4Call >= 0 && highRiskCall > area4Call, 'Área 4 debe evaluarse antes de high-risk')
  assert.match(dispatch, /if \(area4RegisteredDenied\) return area4RegisteredDenied/)
})

test('el menú conserva siete grupos y solo enlaza páginas existentes sin ampliar permisos', () => {
  assert.deepEqual(Object.keys(AREA4_GROUPED_MENU), [...AREA4_MENU_GROUPS])
  for (const item of leaves()) {
    const section = area4SectionByKey(item.section)
    assert.ok(section, `${item.name} referencia una sección inexistente: ${item.section}`)
    const href = item.href.split('?')[0]
    const registered = area4RegisteredSurfacePaths('page').some(pattern => matchesRegisteredPage(href, pattern))
    assert.ok(registered, `${item.name} cambia o inventa la URL ${item.href}`)
    // Una variante CRM por query y las normas de la página [norma] tienen áreas
    // ya existentes distintas del patrón físico compartido; no duplicamos páginas.
    if (item.section === 'crm.particulares' || item.section === 'certificaciones.iso_27001' || item.section === 'certificaciones.tisax') continue
    assert.equal(area4RegisteredSurfaceArea(href, 'page'), section.areaCode, item.name)
  }
})

test('Finanzas agrupadas usa Conciliar y Para pedir sin duplicar flujos heredados', () => {
  const finance = AREA4_GROUPED_MENU.Finanzas.flatMap(item => [item, ...(item.subitems || [])])
  const hrefs = finance.map(item => item.href)
  assert.ok(hrefs.includes('/admin/finanzas/conciliar'))
  assert.ok(hrefs.includes('/admin/finanzas/para-pedir'))
  assert.ok(hrefs.includes('/admin/rentabilidad'))
  assert.ok(!hrefs.includes('/admin/finanzas/modo-facil'))
  assert.ok(!hrefs.includes('/admin/finanzas/conciliacion'))
  assert.ok(!hrefs.includes('/admin/finanzas/conciliacion-v2'))
})

test('las ocho áreas técnicas tienen enlaces concretos y no incluyen roots ni Proyectos singulares', () => {
  const expected = ['actualizaciones', 'contrato_guardias', 'informes', 'kpis', 'organigrama', 'personal', 'proyectos', 'seguimiento']
  const actual = AREA4_DRAXTON_TECHNICAL_MENU.map(item => {
    const section = area4SectionByKey(item.section)
    assert.ok(section)
    assert.equal(area4RegisteredSurfaceArea(item.href, 'page'), section.areaCode, item.href)
    assert.ok(section.surfaces.some(surface => surface.kind === 'api'), `${section.key} carece de API registrada`)
    return section.areaCode.split('.').at(-1)
  }).sort()
  assert.deepEqual(actual, expected.sort())
  assert.equal(area4RegisteredSurfaceArea('/admin/clientes/ggcc/draxton/proyectos-singulares', 'page'), 'admin.clientes.ggcc.draxton.proyectos_singulares')
})

test('las peticiones propias nunca se confunden con la lista administrativa', () => {
  assert.equal(area4RegisteredSurfaceArea('/peticiones', 'page'), 'empleado.peticiones')
  assert.equal(area4RegisteredSurfaceArea('/api/peticiones', 'api'), 'empleado.peticiones')
  assert.equal(area4RegisteredSurfaceArea('/admin/peticiones', 'page'), 'admin.peticiones')
  assert.equal(area4RegisteredSurfaceArea('/api/admin/peticiones', 'api'), 'admin.peticiones')
})

test('Sistemas usa solo su URL real y Finanzas exige las URLs reales de Presupuesto e Impuestos', () => {
  for (const path of ['/admin/sistemas-servicios', '/admin/sistemas-y-servicios', '/admin/presupuesto', '/admin/impuestos', '/admin/impuestos/presupuesto', '/admin/finanzas/impuesto', '/admin/finanzas/presupuestos']) {
    assert.equal(area4RegisteredSurfaceArea(path, 'page'), null, path)
  }
  assert.equal(area4RegisteredSurfaceArea('/admin/aapp/hacienda', 'page'), 'admin.aapp')
  assert.equal(area4RegisteredSurfaceArea('/admin/finanzas/impuestos', 'page'), 'admin.finanzas.impuestos')
  assert.equal(area4RegisteredSurfaceArea('/admin/finanzas/presupuesto', 'page'), 'admin.finanzas.presupuesto')
})
