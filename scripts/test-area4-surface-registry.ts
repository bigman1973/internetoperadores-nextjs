import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import test from 'node:test'
import {
  AREA4_GROUPED_MENU,
  AREA4_MENU_GROUPS,
  AREA4_SECTION_REGISTRY,
  area4RegisteredSurfaceArea,
  area4RegisteredSurfacePaths,
} from '../lib/area4/section-registry'

const root = process.cwd()

function files(directory: string, name: string): string[] {
  const absolute = join(root, directory)
  const walk = (current: string): string[] => readdirSync(current, { withFileTypes: true }).flatMap(entry => {
    const next = join(current, entry.name)
    if (entry.isDirectory()) return walk(next)
    return entry.name === name ? [next] : []
  })
  return walk(absolute)
}

function surfacePaths(directory: string, name: string, prefix: '/admin' | '/empleado' | '/api/admin' | '/api/empleado'): string[] {
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

test('cada página y API del panel figura exactamente una vez en el registro estático', () => {
  const discoveredPages = [
    ...surfacePaths('app/admin', 'page.tsx', '/admin'),
    ...surfacePaths('app/empleado', 'page.tsx', '/empleado'),
  ].sort()
  const discoveredApis = [
    ...surfacePaths('app/api/admin', 'route.ts', '/api/admin'),
    ...surfacePaths('app/api/empleado', 'route.ts', '/api/empleado'),
  ].sort()
  assert.deepEqual([...new Set(area4RegisteredSurfacePaths('page'))].sort(), discoveredPages)
  assert.deepEqual([...new Set(area4RegisteredSurfacePaths('api'))].sort(), discoveredApis)
})

test('el resolvedor de servidor obtiene el área declarada para cada página y API registrada', () => {
  for (const section of AREA4_SECTION_REGISTRY) {
    for (const surface of section.surfaces) {
      const concretePath = surface.path.replace(/\[[^/]+\]/g, '123')
      assert.equal(area4RegisteredSurfaceArea(concretePath, surface.kind), section.areaCode, concretePath)
    }
  }
})

test('la guardia de API usa el registro, falla cerrada y solo activa la matriz tras adopción explícita', () => {
  const middleware = readFileSync(join(root, 'middleware.js'), 'utf8')
  assert.match(middleware, /area4RegisteredAdminApiBoundary/)
  assert.match(middleware, /area4RegisteredSurfaceArea\(pathname, 'api'\)/)
  assert.match(middleware, /API administrativa no registrada/)
  assert.match(middleware, /if \(!user\.permisosArea4Vivos\) return null/)
  assert.match(middleware, /const area4RegisteredDenied = await area4RegisteredAdminApiBoundary\(request\)/)
})

test('el menú agrupado conserva los siete grupos aprobados y enlaza solo a páginas registradas', () => {
  assert.deepEqual(Object.keys(AREA4_GROUPED_MENU), [...AREA4_MENU_GROUPS])
  const sections = new Map(AREA4_SECTION_REGISTRY.map(section => [section.key, section]))
  for (const item of leaves()) {
    const section = sections.get(item.section)
    assert.ok(section, `${item.name} referencia una sección inexistente: ${item.section}`)
    const href = item.href.split('?')[0]
    assert.ok(section.surfaces.some(surface => surface.kind === 'page' && matchesRegisteredPage(href, surface.path)), `${item.name} cambia o inventa la URL ${item.href}`)
  }
})

test('Finanzas agrupadas usa Conciliar y Para pedir, sin duplicar Modo fácil ni Conciliación heredida', () => {
  const finance = AREA4_GROUPED_MENU.Finanzas.flatMap(item => [item, ...(item.subitems || [])])
  const hrefs = finance.map(item => item.href)
  assert.ok(hrefs.includes('/admin/finanzas/conciliar'))
  assert.ok(hrefs.includes('/admin/finanzas/para-pedir'))
  assert.ok(!hrefs.includes('/admin/finanzas/modo-facil'))
  assert.ok(!hrefs.includes('/admin/finanzas/conciliacion'))
  assert.ok(!hrefs.includes('/admin/finanzas/conciliacion-v2'))
})

test('las ocho subáreas Draxton se representan con sus códigos concretos para la plantilla técnica', () => {
  const expected = [
    'actualizaciones', 'contrato_guardias', 'informes', 'kpis',
    'organigrama', 'personal', 'proyectos', 'seguimiento',
  ]
  const actual = AREA4_SECTION_REGISTRY
    .map(section => section.areaCode)
    .filter(code => code.startsWith('admin.clientes.ggcc.draxton.'))
    .map(code => code.split('.').at(-1))
    .sort()
  assert.deepEqual(actual, expected.sort())
})
