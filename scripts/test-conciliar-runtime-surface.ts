import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
function loadSurface(pathname: string) {
  const source = ts.transpileModule(read('components/RootRuntimeSurface.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const exports: Record<string, any> = {}
  const fakeRequire = (id: string) => {
    if (id === 'next/dynamic') return () => (props: any) => React.createElement('section', { 'data-public-runtime': true }, props.children)
    if (id === 'next/navigation') return { usePathname: () => pathname }
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return require('react/jsx-runtime')
    throw new Error(`Unexpected import ${id}`)
  }
  vm.runInNewContext(source, { exports, require: fakeRequire })
  return exports.default
}

test('el componente real no monta proveedores públicos en admin, pero sí en rutas públicas', () => {
  for (const pathname of ['/admin', '/admin/finanzas/conciliar', '/admin/usuarios']) {
    const Component = loadSurface(pathname)
    const html = renderToStaticMarkup(React.createElement(Component, { assistantEnabled: false }, React.createElement('p', null, 'SSR visible')))
    assert.ok(html.includes('SSR visible'))
    assert.equal(html.includes('data-public-runtime'), false)
  }
  for (const pathname of ['/', '/tarifas/empresa', '/login', '/administracion-publica']) {
    const Component = loadSurface(pathname)
    assert.ok(renderToStaticMarkup(React.createElement(Component, { assistantEnabled: false }, 'SSR')).includes('data-public-runtime'))
  }
})

test('el contexto de actuación extraído conserva literalmente interceptor, recuperación y notificación anteriores', () => {
  const previous = execFileSync('git', ['show', 'd16397c:components/impersonation/ImpersonationBanner.tsx'], { encoding: 'utf8' })
  let exact = previous.slice(previous.indexOf('type ActuationContextValue'), previous.indexOf('const GLOBAL_SAFE_SPACE_CSS'))
  const helperStart = exact.indexOf('function requestKey():')
  const helperEnd = exact.indexOf('/**\n * Estado compartido')
  exact = exact.slice(0, helperStart) + exact.slice(helperEnd)
  const current = read('components/impersonation/ActuationProvider.tsx')
  assert.equal(current.slice(current.indexOf('type ActuationContextValue')), exact)
  assert.ok(current.includes("headers.set('x-io-acting-session', expectedSession)"))
  assert.ok(current.includes('window.location.reload()'))
  const ui = read('components/impersonation/ImpersonationBannerUi.tsx')
  assert.ok(ui.includes('actuationControlHeaders()'))
  assert.ok(ui.includes('retryExitAttempt(attempt)'))
  assert.ok(ui.includes('expiresAt - Date.now()'))
  assert.ok(ui.includes('Estás actuando como {active.targetName}'))
})

test('la banda activa no usa ssr:false y el panel recibe la sesión efectiva antes del proveedor', () => {
  const gate = read('components/impersonation/ImpersonationBanner.tsx')
  assert.ok(gate.includes('return active ? <BannerUi /> : null'))
  assert.equal(gate.includes('ssr: false'), false)
  const layout = read('app/admin/layout.tsx')
  assert.ok(layout.indexOf('<SessionProvider session={session}>') < layout.indexOf('<ActuationProvider>'))
  assert.ok(layout.includes("const session = await requireAuth('admin')"))
  assert.ok(layout.includes('key={`effective-actor:${session.user.id}`}'))
})

test('consentimiento público conservado y fuentes locales con swap y sin preloads globales innecesarios', () => {
  const publicRuntime = read('components/PublicRuntimeProviders.tsx')
  assert.ok(publicRuntime.includes('data-blockingmode="auto" strategy="beforeInteractive"'))
  assert.ok(publicRuntime.includes('assistantEnabled && <AssistantLauncher'))
  const layout = read('app/layout.js')
  assert.equal(layout.includes('Cookiebot'), false)
  assert.ok(layout.includes('assistantPublicEnabled()'))
  assert.equal(layout.includes('next/font/google'), false)
  const page = read('app/admin/finanzas/conciliar/page.tsx')
  assert.ok(page.includes('rel="preload" href="/fonts/RobotoLatin-VF.woff2"'))
  assert.equal(page.includes('next/font/google'), false)
  assert.ok(read('app/globals.css').includes('font-display: swap'))
  assert.ok(read('app/globals.css').includes("font-family: 'IO Roboto'"))
  assert.ok(fs.statSync(path.join(root, 'public/fonts/RobotoLatin-VF.woff2')).size > 30000)
  assert.ok(read('public/fonts/OFL-Roboto.txt').includes('SIL OPEN FONT LICENSE'))
})

test('el encabezado tiene contraste explícito antes de establecer una clase de tema', () => {
  const css = read('app/globals.css')
  const workspace = read('components/finanzas/conciliar/ConciliarWorkspace.tsx')
  assert.ok(workspace.includes('<header data-conciliar-heading'))
  assert.ok(workspace.includes('data-conciliar-subtitle'))
  assert.ok(css.includes('@media (prefers-color-scheme: dark)'))
  assert.ok(css.includes('--conciliar-heading-fg: #f8fafc'))
  assert.ok(css.includes('--conciliar-heading-muted: #cbd5e1'))
  assert.ok(css.includes('.light [data-conciliar-heading]'))
})
