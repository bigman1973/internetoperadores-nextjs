import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as registry from '../lib/area4/section-registry'
import * as navigation from '../components/admin/sidebar-navigation'
import { extrasProduccionCerrados, rentabilidadReadonlyMenuDisponible } from '../lib/produccion-disponibilidad'

// Synthetic VM only. No project auth/data/Prisma/provider implementation is loaded.
const root = process.cwd()
const gatePath = 'lib/produccion-disponibilidad.ts'
type Env = Record<string, string | undefined>
const production: Env = { VERCEL_ENV: 'production', NODE_ENV: 'production' }
const preview: Env = { VERCEL_ENV: 'preview', NODE_ENV: 'production' }
const staging: Env = { ...preview, FINANCE_STAGING_SANDBOX: '1' }
const productionReadonly: Env = { ...production, RENTABILIDAD_ENABLED: '1', RENTABILIDAD_PRODUCTION_READ_ONLY: '1' }
const inventory: Record<string, string[]> = {
  'app/api/admin/sistemas/servicios/route.ts': ['GET', 'PATCH'],
  'app/api/admin/sistemas/estado-vivo/route.ts': ['GET'],
  'app/api/admin/sistemas/costes/route.ts': ['GET', 'POST', 'DELETE'],
  'app/api/admin/sistemas/incidencias/route.ts': ['GET', 'POST', 'DELETE'],
  'app/api/admin/sistemas/tasas/route.ts': ['GET', 'PUT', 'POST'],
  'app/api/admin/finanzas/impuestos/route.ts': ['GET'],
  'app/api/admin/finanzas/impuestos/presentados/route.ts': ['GET', 'POST', 'DELETE'],
  'app/api/admin/finanzas/presupuesto/versiones/route.ts': ['GET', 'POST'],
  'app/api/admin/finanzas/presupuesto/versiones/[id]/route.ts': ['GET', 'PATCH'],
  'app/api/admin/finanzas/presupuesto/versiones/[id]/lineas/route.ts': ['PATCH', 'POST', 'DELETE'],
  'app/api/admin/finanzas/presupuesto/versiones/[id]/aprobar/route.ts': ['POST'],
  'app/api/admin/finanzas/presupuesto/versiones/[id]/seguimiento/route.ts': ['GET'],
}
const pages = ['app/admin/sistemas/page.tsx', 'app/admin/finanzas/impuestos/page.tsx', 'app/admin/finanzas/presupuesto/page.tsx']
const closedPaths = ['/admin/sistemas', '/admin/finanzas/impuestos', '/admin/finanzas/presupuesto']
const read = (file: string) => readFileSync(join(root, file), 'utf8')
const candidateRevision = 'dddfd6e7d4da5381e238770446e14ed40628f2ed'
const baseline = (file: string) => execFileSync('git', ['show', `${candidateRevision}:${file}`], { cwd: root, encoding: 'utf8' })
const source = (file: string, text = read(file)) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
function execute(file: string, imports: Record<string, any>, env: Env, text = read(file)) {
  const module = { exports: {} as any }
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const forbidden = () => { throw new Error('UNEXPECTED_VM_NETWORK') }
  runInNewContext(js, { module, exports: module.exports, process: { env }, URL, Date, console, fetch: forbidden, require: (name: string) => {
    if (!Object.hasOwn(imports, name)) throw new Error(`UNEXPECTED_IMPORT:${name}`)
    return imports[name]
  } }, { filename: file })
  return module.exports
}
const poisonObject = (label: string, calls: string[]) => new Proxy({}, { get(_target, name) { calls.push(`${label}.${String(name)}`); throw new Error(`UNEXPECTED_ACCESS:${label}.${String(name)}`) } })
function harness(file: string, env: Env, open = false, text = read(file)) {
  const calls: string[] = []
  const forbidden = (name: string) => (..._args: unknown[]) => { calls.push(name); throw new Error(`UNEXPECTED_OPERATION:${name}`) }
  const authDenial = NextResponse.json({ error: 'SYNTH_AUTH_DENIED' }, { status: 401 })
  const auth = (name: string) => async (..._args: unknown[]) => {
    calls.push(name)
    if (!open) throw new Error(`UNEXPECTED_AUTH:${name}`)
    return name.includes('Page') ? { puedeEditar: true, puedeAprobar: false } : { error: authDenial }
  }
  const imports: Record<string, any> = {
    'next/server': { NextResponse },
    'next/navigation': { notFound: () => { calls.push('notFound'); throw new Error('SYNTH_NOT_FOUND') } },
    'react/jsx-runtime': jsx,
    zod: { z },
    '@prisma/client': { Prisma: poisonObject('Prisma', calls) },
    '@/lib/prisma': { prisma: poisonObject('prisma', calls) },
    '@/lib/produccion-disponibilidad': execute(gatePath, {}, env),
  }
  const schema: Record<string, any> = { idSchema: z.string(), fechaSchema: z.string(), mesSchema: z.string(), ejercicioSchema: z.coerce.number() }
  const allowedOperationalImports = ['@/lib/sistemas/auth', '@/lib/sistemas/data', '@/lib/sistemas/vivo', '@/lib/impuestos/auth', '@/lib/impuestos/data', '@/lib/presupuesto/data']
  for (const declaration of source(file, text).statements.filter(ts.isImportDeclaration)) {
    const name = (declaration.moduleSpecifier as ts.StringLiteral).text
    if (Object.hasOwn(imports, name)) continue
    if (name.endsWith('_shared') || name.endsWith('_fin-shared')) {
      const values: Record<string, any> = { ...schema }
      for (const element of (declaration.importClause?.namedBindings as ts.NamedImports).elements) {
        const key = (element.propertyName ?? element.name).text
        if (!(key in values)) values[key] = forbidden(`${name}:${key}`)
      }
      imports[name] = values
    } else if (allowedOperationalImports.includes(name)) {
      const values: Record<string, any> = {}
      for (const element of (declaration.importClause?.namedBindings as ts.NamedImports).elements) {
        const key = (element.propertyName ?? element.name).text
        values[key] = key.startsWith('require') ? auth(key)
          : ['CATEGORIAS', 'ESTADOS', 'ENTORNOS', 'PERIODICIDADES', 'TIPOS_PAGO'].includes(key) ? ['SYNTH']
          : open && key === 'sistemasDisponible' ? async () => { calls.push(key); return true }
          : forbidden(`${name}:${key}`)
      }
      imports[name] = values
    } else if (/^\.\/(SistemasClient|ImpuestosClient|PresupuestoClient)$/.test(name)) {
      imports[name] = { __esModule: true, default: forbidden(name) }
    } else throw new Error(`UNREVIEWED_IMPORT:${name}`)
  }
  return { mod: execute(file, imports, env, text), calls, request: poisonObject('request/body/headers', calls), context: poisonObject('context/params', calls), authDenial }
}

function exportedHandlers(file: string) {
  return source(file).statements.filter(ts.isFunctionDeclaration).filter(node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))
}
test('inventario exacto 12 archivos / 25 handlers y puerta como primera instrucción en cada handler y página', () => {
  const walk = (directory: string): string[] => readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : entry.name === 'route.ts' ? [`${directory}/${entry.name}`] : [])
  assert.deepEqual(['app/api/admin/sistemas', 'app/api/admin/finanzas/impuestos', 'app/api/admin/finanzas/presupuesto'].flatMap(walk).sort(), Object.keys(inventory).sort())
  assert.equal(Object.values(inventory).flat().length, 25)
  for (const [file, methods] of Object.entries(inventory)) {
    const handlers = exportedHandlers(file)
    assert.deepEqual(handlers.map(fn => fn.name!.text), methods, file)
    for (const handler of handlers) {
      const first = handler.body!.statements[0]
      assert.ok(ts.isIfStatement(first), file)
      assert.equal(first.expression.getText(), 'extrasProduccionCerrados()')
      assert.match(first.thenStatement.getText(), /return NextResponse\.json/)
      assert.match(first.thenStatement.getText(), /status: 404/)
      assert.match(first.thenStatement.getText(), /private, no-store/)
    }
  }
  for (const file of pages) {
    const first = exportedHandlers(file)[0].body!.statements[0]
    assert.ok(ts.isIfStatement(first), file)
    assert.equal(first.expression.getText(), 'extrasProduccionCerrados()')
    assert.equal(first.thenStatement.getText(), 'notFound();')
  }
})
test('puerta pura: producción incondicional aun con todos los opt-ins/sandbox; preview/staging no cambia', () => {
  const code = source(gatePath)
  assert.ok(!code.statements.some(ts.isImportDeclaration))
  for (const env of [production, { ...production, FINANCE_STAGING_SANDBOX: '1', SISTEMAS_PRODUCCION: '1', IMPUESTOS_PRODUCCION: '1', PRESUPUESTO_PRODUCCION: '1' }, { NODE_ENV: 'production' }]) assert.equal(extrasProduccionCerrados(env), true)
  for (const env of [preview, staging, { VERCEL_ENV: 'development', NODE_ENV: 'production' }, { NODE_ENV: 'development' }, {}]) assert.equal(extrasProduccionCerrados(env), false)
})
for (const [file, methods] of Object.entries(inventory)) for (const method of methods) {
  test(`handler real producción ${method} ${file}: 404/no-store antes auth/body/BD/red/params`, async () => {
    for (const env of [production, { ...productionReadonly, FINANCE_STAGING_SANDBOX: '1' }, { NODE_ENV: 'production' }]) {
      const h = harness(file, env)
      const response = await h.mod[method](h.request, h.context)
      assert.equal(response.status, 404)
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
      assert.deepEqual(await response.json(), { error: 'No encontrado.' })
      assert.deepEqual(h.calls, [])
    }
  })
  test(`handler real staging/preview ${method} ${file}: conserva auth antes del cuerpo`, async () => {
    for (const env of [preview, staging, { VERCEL_ENV: 'development' }]) {
      const changed = harness(file, env, true), original = harness(file, env, true, baseline(file))
      assert.equal(await changed.mod[method](changed.request, changed.context), changed.authDenial)
      assert.equal(await original.mod[method](original.request, original.context), original.authDenial)
      assert.deepEqual(changed.calls, original.calls)
      assert.equal(changed.calls.length, 1)
      assert.match(changed.calls[0], /^require/)
    }
  })
}
for (const file of pages) {
  test(`página real producción ${file}: notFound antes auth/lecturas/render cliente`, async () => {
    for (const env of [production, { ...productionReadonly, FINANCE_STAGING_SANDBOX: '1' }, { NODE_ENV: 'production' }]) {
      const h = harness(file, env)
      await assert.rejects(() => h.mod.default(), /SYNTH_NOT_FOUND/)
      assert.deepEqual(h.calls, ['notFound'])
    }
  })
  test(`página real staging/preview ${file}: mismo resultado y llamadas que candidata revisada`, async () => {
    for (const env of [preview, staging]) {
      const changed = harness(file, env, true), original = harness(file, env, true, baseline(file))
      const changedTree = await changed.mod.default(), originalTree = await original.mod.default()
      assert.equal(JSON.stringify(changedTree.props), JSON.stringify(originalTree.props))
      assert.deepEqual(changed.calls, original.calls)
      assert.ok(changed.calls[0].startsWith('require'))
      assert.ok(!changed.calls.includes('notFound'))
    }
  })
}
test('cuerpo original íntegro: quitar solo imports/puertas restaura los 15 entrypoints de la candidata revisada', () => {
  for (const file of [...Object.keys(inventory), ...pages]) {
    const restored = read(file)
      .replace(/^import \{ extrasProduccionCerrados \} from '@\/lib\/produccion-disponibilidad';\n/m, '')
      .replace(/^import \{ notFound \} from 'next\/navigation';\n/m, '')
      .replace(/^import \{ NextResponse \} from 'next\/server';\n/m, '')
      .replace('import { NextRequest, NextResponse }', 'import { NextRequest }')
      .replace(/^  if \(extrasProduccionCerrados\(\)\).+\n/gm, '')
    assert.equal(restored, baseline(file), file)
  }
})
function leafItems(tree: navigation.SidebarNavigationEntry[]): navigation.SidebarNavigationItem[] {
  const nested = (item: navigation.SidebarNavigationItem): navigation.SidebarNavigationItem[] => [item, ...(item.subitems ?? []).flatMap(nested)]
  return tree.flatMap(entry => navigation.isSidebarNavigationGroup(entry) ? entry.children.flatMap(nested) : nested(entry))
}
function hrefs(tree: navigation.SidebarNavigationEntry[]) { return leafItems(tree).filter(item => !item.containerOnly).map(item => item.href) }
const presentations = ['historico', 'agrupado'] as const
for (const presentation of presentations) {
  test(`proyección ${presentation}: Sistemas/Impuestos/Presupuesto ocultos fuera staging sin arrastrar Finanzas`, () => {
    const onStage = hrefs(navigation.getSidebarNavigation('staging', true, presentation))
    for (const path of closedPaths) assert.ok(onStage.includes(path), path)
    for (const runtime of ['production', null] as const) {
      const paths = hrefs(navigation.getSidebarNavigation(runtime, false, presentation))
      for (const path of closedPaths) assert.ok(!paths.some(href => href === path || href.startsWith(path + '/')), path)
      assert.ok(paths.includes('/admin/finanzas'))
      assert.ok(paths.includes('/admin/finanzas/movimientos'))
    }
    const original = execute('components/admin/sidebar-navigation.ts', { '@/lib/area4/section-registry': registry }, {}, baseline('components/admin/sidebar-navigation.ts'))
    assert.equal(JSON.stringify(navigation.getSidebarNavigation('staging', true, presentation)), JSON.stringify(original.getSidebarNavigation('staging', true, presentation)))
  })
  test(`N4 ${presentation}: opt-in readonly no permite otras staging-only y jamás concede ACL`, () => {
    for (const runtime of ['production', null] as const) {
      assert.ok(!hrefs(navigation.getSidebarNavigation(runtime, false, presentation)).includes('/admin/rentabilidad'))
      const visible = navigation.getSidebarNavigation(runtime, false, presentation, true)
      assert.ok(hrefs(visible).includes('/admin/rentabilidad'))
      assert.equal(leafItems(visible).find(item => item.href === '/admin/rentabilidad')!.name, 'Rentabilidad · solo lectura')
      const otherStagingOnly = registry.area4RegistrySurfaceMatches().filter(match => match.surface.kind === 'page'
        && match.surface.availability?.stagingOnly && match.surface.path !== '/admin/rentabilidad').map(match => match.surface.path)
      for (const path of [...closedPaths, ...otherStagingOnly]) assert.ok(!hrefs(visible).includes(path), path)
      assert.ok(!hrefs(navigation.filterAuthorizedSidebarNavigation(runtime, () => false, false, presentation, () => true, true)).includes('/admin/rentabilidad'))
      assert.ok(!hrefs(navigation.filterAuthorizedSidebarNavigation(runtime, () => true, false, presentation, () => false, true)).includes('/admin/rentabilidad'))
      assert.ok(hrefs(navigation.filterAuthorizedSidebarNavigation(runtime, () => true, false, presentation, () => true, true)).includes('/admin/rentabilidad'))
    }
    assert.equal(JSON.stringify(navigation.getSidebarNavigation('staging', true, presentation, true)), JSON.stringify(navigation.getSidebarNavigation('staging', true, presentation)))
  })
}
test('N4 servidor: únicamente runtime financiero fiable production + flags exactos; off/ambiguo oculta', () => {
  assert.equal(rentabilidadReadonlyMenuDisponible('production', productionReadonly), true)
  for (const runtime of ['staging', null] as const) assert.equal(rentabilidadReadonlyMenuDisponible(runtime, productionReadonly), false)
  for (const patch of [{ RENTABILIDAD_ENABLED: undefined }, { RENTABILIDAD_ENABLED: '0' }, { RENTABILIDAD_ENABLED: 'true' }, { RENTABILIDAD_PRODUCTION_READ_ONLY: undefined }, { RENTABILIDAD_PRODUCTION_READ_ONLY: '0' }, { RENTABILIDAD_PRODUCTION_READ_ONLY: 'true' }, { FINANCE_STAGING_SANDBOX: '1' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: undefined }]) assert.equal(rentabilidadReadonlyMenuDisponible('production', { ...productionReadonly, ...patch }), false)
})
const icon = () => null
function renderSidebar(presentation: navigation.SidebarPresentation, runtime: navigation.FinanceEnvironment, enabled: boolean, canAccess = true, canSurface = true) {
  const tree = navigation.filterAuthorizedSidebarNavigation(runtime, () => canAccess, runtime === 'staging', presentation, () => canSurface, enabled)
  const server = execute('components/admin/server/AdminSidebarMenu.tsx', {
    'react/jsx-runtime': jsx, '../presentation/AdminSidebarIcon': { AdminSidebarIcon: icon, AdminSidebarChevron: icon }, '../sidebar-navigation': navigation,
  }, production)
  const user = { name: 'Synthetic', email: 'synthetic@example.invalid', role: 'SUPER_ADMIN' }
  const ssr = renderToStaticMarkup(React.createElement(server.default, { navigation: tree, user }))
  const allOpenGroups = registry.AREA4_MENU_GROUPS as readonly string[]
  const openItems = leafItems(tree).map(item => `item:${item.href}`)
  const client = execute('components/admin/lazy/InteractiveAdminSidebarMenu.tsx', {
    'react/jsx-runtime': jsx,
    react: { useMemo: (fn: () => any) => fn(), useEffect() {}, useState: () => [[...allOpenGroups, ...openItems, 'Finanzas'], () => {}] },
    'next/link': { __esModule: true, default: ({ href, children, prefetch: _prefetch, ...props }: any) => React.createElement('a', { ...props, href }, children) },
    'next/navigation': { usePathname: () => '/admin' },
    '../RoleContext': { useRole: () => ({ hasAccess: () => canAccess, hasSurfaceAccess: () => canSurface, effectiveRole: 'SUPER_ADMIN', isViewingAs: false }) },
    '../presentation/AdminSidebarIcon': { AdminSidebarIcon: icon, AdminSidebarChevron: icon }, '../sidebar-navigation': navigation,
  }, production)
  const interactive = renderToStaticMarkup(client.default({ user, financeEnvironment: runtime, conciliarEnabled: runtime === 'staging', menuPresentation: presentation, rentabilidadReadonlyEnabled: enabled }))
  return { ssr, interactive }
}
for (const presentation of presentations) test(`render real SSR + cliente ${presentation}: mismo cierre, semilla readonly, flags off y ACL denegada`, () => {
  for (const runtime of ['production', null, 'staging'] as const) for (const enabled of [false, true]) {
    const output = renderSidebar(presentation, runtime, enabled)
    for (const html of Object.values(output)) {
      for (const path of closedPaths) assert.equal(html.includes(`href="${path}"`), runtime === 'staging', path)
      assert.equal(html.includes('href="/admin/rentabilidad"'), runtime === 'staging' || enabled)
      if (runtime !== 'staging' && enabled) assert.ok(html.includes('Rentabilidad · solo lectura'))
    }
  }
  for (const [canAccess, canSurface] of [[false, true], [true, false]]) {
    for (const html of Object.values(renderSidebar(presentation, 'production', true, canAccess, canSurface))) assert.ok(!html.includes('href="/admin/rentabilidad"'))
  }
})
test('N4 mismo booleano server a SSR y menú cliente; no NEXT_PUBLIC/env cliente, permisos intactos', () => {
  const layout = read('app/admin/layout.tsx'), controller = read('components/admin/AdminSidebar.tsx'), client = read('components/admin/lazy/InteractiveAdminSidebarMenu.tsx')
  assert.match(layout, /rentabilidadReadonlyMenuDisponible\(financeEnvironment \?\? profileEnvironment\)/)
  assert.match(layout, /hasSurfaceAccess|area4SurfaceSeedAllows/)
  assert.match(layout, /menuPresentation, href => isOwner \|\| area4SurfaceSeedAllows\(surfacePermissions, href\), rentabilidadReadonlyEnabled/)
  assert.match(layout, /rentabilidadReadonlyEnabled=\{rentabilidadReadonlyEnabled\}/)
  assert.match(controller, /rentabilidadReadonlyEnabled=\{rentabilidadReadonlyEnabled\}/)
  assert.match(client, /menuPresentation, hasSurfaceAccess, rentabilidadReadonlyEnabled/)
  assert.match(client, /hasSurfaceAccess, rentabilidadReadonlyEnabled\]\)/)
  assert.ok(!/process\.env|NEXT_PUBLIC/.test(client))
})
test('registry físico y hashes baseline/identidades permanecen exactos, sin rebaseline', () => {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  assert.equal(hash(read('lib/area4/section-registry.ts')), '148b210cf37a3abb21505d5e74b0c4a4a70ad9915176493e0258803227e17031')
  assert.equal(read('lib/area4/section-registry.ts'), baseline('lib/area4/section-registry.ts'))
  const reverted: string[] = JSON.parse(read('scripts/fixtures-area5-revertida-descriptores.json'))
  const descriptors = registry.area4RegistrySurfaceMatches().flatMap(match => match.surface.baselineDescriptor ? [match.surface.baselineDescriptor] : [])
  assert.equal(hash(JSON.stringify([...descriptors, ...reverted].sort())), registry.AREA4_BASELINE_DESCRIPTORS_SHA256)
  assert.equal(hash(JSON.stringify(registry.AREA4_SECTION_REGISTRY.map(section => section.baselineIdentity).sort())), registry.AREA4_BASELINE_IDENTITIES_SHA256)
})
