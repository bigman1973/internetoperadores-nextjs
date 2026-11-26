/**
 * Regresión local: «Conectar mi Outlook» en los cajones de FichaCliente.
 * Ejecutar: pnpm exec tsx scripts/test-tanda-pequena-outlook-render.ts
 *
 * La fuente real tiene UN Drawer (ramas mail/meet), no MailDrawer/MeetDrawer.
 * Se añade su export SOLO al texto en memoria; no se modifica producción.
 * esbuild elimina los tipos y usa JSX automatic. Module + VM cargan el CJS
 * sin archivos intermedios y permiten únicamente React y su runtime JSX.
 * renderToStaticMarkup no ejecuta useEffect ni los manejadores de eventos.
 * Fixtures ficticios, sin red, BD, navegador ni cambios de entorno global.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { Script, createContext } from 'node:vm'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const sourceUrl = new URL('../components/admin/FichaCliente.tsx', import.meta.url)
const sourcePath = fileURLToPath(sourceUrl)
const source = readFileSync(sourceUrl, 'utf8')
assert.match(source, /function Drawer\(/, 'La fuente real debe seguir declarando Drawer')

// esbuild es dependencia local de tsx, no una dependencia directa del proyecto.
const localRequire = createRequire(import.meta.url)
const tsxRequire = createRequire(localRequire.resolve('tsx/package.json'))
const { transformSync } = tsxRequire('esbuild') as {
  transformSync: (input: string, options: {
    loader: 'tsx'; jsx: 'automatic'; format: 'cjs'; platform: 'node'; sourcefile: string
  }) => { code: string }
}
const { code } = transformSync(`${source}\nexport { Drawer }\n`, {
  loader: 'tsx', jsx: 'automatic', format: 'cjs', platform: 'node', sourcefile: sourcePath,
})

const sourceRequire = createRequire(sourceUrl)
const requiredRuntime = new Set<string>()
let networkCalls = 0
const memoryModule = { exports: {} as Record<string, unknown> }
const context = createContext({
  module: memoryModule,
  exports: memoryModule.exports,
  require: (id: string) => {
    assert.ok(id === 'react' || id === 'react/jsx-runtime', `Import de runtime no permitido: ${id}`)
    requiredRuntime.add(id)
    return sourceRequire(id)
  },
  // Si en el futuro aparece una llamada durante el render, la prueba falla.
  fetch: () => {
    networkCalls++
    throw new Error('Esta regresión no permite red ni ejecutar efectos')
  },
})
const execute = new Script(Module.wrap(code), { filename: `${sourcePath}:render-test` }).runInContext(context)
execute(memoryModule.exports, context.require, memoryModule, sourcePath, fileURLToPath(new URL('.', sourceUrl)))
assert.deepEqual([...requiredRuntime].sort(), ['react', 'react/jsx-runtime'], 'Solo se carga React; los imports de tipos se eliminan')

const ficha = {
  empresa: { nombre: 'Empresa Ficticia' },
  personas: [{ id: 'persona-ficticia', nombre: 'Persona Ficticia', papel: 'sin dato', email: 'persona@example.invalid' }],
}
type Conexion = { enabled: boolean; connected: boolean; email: string | null; mail: boolean; m365?: boolean }
type M365 = { conexion: Conexion; aviso: string | null; corporativo: string; connectUrl: string }
type DrawerProps = {
  cajon: { kind: 'mail' | 'meet' | 'ai' }
  ficha: typeof ficha
  m365: M365
  puedeEscribir: boolean
  onClose: () => void
  onOpen: () => void
  toast: () => void
}
assert.equal(typeof memoryModule.exports.Drawer, 'function', 'Drawer queda accesible solo desde el módulo en memoria')
const Drawer = memoryModule.exports.Drawer as ComponentType<DrawerProps>
const noop = () => {}
const connectUrl = '/__test__/outlook/connect'
const fixture = (conexion: Conexion): M365 => ({
  conexion, aviso: null, corporativo: 'corporativo@example.invalid', connectUrl,
})

// Adaptadores de prueba: ambas ramas usan el mismo Drawer real, sin copiar JSX.
const renderDrawer = (kind: 'mail' | 'meet' | 'ai', conexion: Conexion) => {
  const html = renderToStaticMarkup(createElement(Drawer, {
    cajon: { kind }, ficha, m365: fixture(conexion), puedeEscribir: true,
    onClose: noop, onOpen: noop, toast: noop,
  }))
  const title = kind === 'meet' ? 'Nueva reunión' : kind === 'ai' ? 'Correo con IA' : 'Nuevo correo'
  assert.ok(html.includes(`<h2>${title}</h2>`), `Se renderiza el cajón real ${kind}, no una ficha cerrada`)
  assert.ok(html.includes('role="dialog"'), 'Se renderiza el diálogo')
  return html
}
const MailDrawer = (conexion: Conexion) => renderDrawer('mail', conexion)
const MeetDrawer = (conexion: Conexion) => renderDrawer('meet', conexion)
const connectionLinks = (html: string) => [...html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)]
  .filter((match) => match[1] === connectUrl)
  .map((match) => match[2])

const closed: Conexion = { enabled: true, connected: false, email: null, mail: false, m365: false }
const open: Conexion = { ...closed, m365: true }
const { m365: _omitted, ...legacy } = open
const connected: Conexion = { ...open, connected: true, email: 'outlook@example.invalid', mail: true }
const renewal: Conexion = { ...connected, mail: false }
let passed = 0
let failed = 0
const test = (name: string, run: () => void) => {
  try {
    run()
    passed++
    console.log(`OK ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL ${name}`)
    console.error(error instanceof Error ? error.message : error)
  }
}

for (const [name, render] of [['correo', MailDrawer], ['reunión', MeetDrawer]] as const) {
  test(`${name}: m365:false oculta «Conectar mi Outlook» aunque enabled:true`, () => {
    const html = render(closed)
    assert.ok(!html.includes('Conectar mi Outlook'))
    assert.deepEqual(connectionLinks(html), [])
  })
  test(`${name}: m365:true muestra «Conectar mi Outlook» y conserva su URL`, () => {
    assert.deepEqual(connectionLinks(render(open)), ['Conectar mi Outlook'])
  })
  test(`${name}: m365 omitido conserva la conexión (compatibilidad !== false)`, () => {
    assert.deepEqual(connectionLinks(render(legacy)), ['Conectar mi Outlook'])
  })
  test(`${name}: enabled:false no ofrece conexión aunque m365:true`, () => {
    assert.deepEqual(connectionLinks(render({ ...open, enabled: false })), [])
  })
  test(`${name}: conectado y con permiso de correo no ofrece conexión`, () => {
    assert.deepEqual(connectionLinks(render(connected)), [])
  })
  test(`${name}: renovación/concesión de permiso sigue intacta con m365:true`, () => {
    assert.deepEqual(connectionLinks(render(renewal)), name === 'correo' ? ['Conceder permiso de correo'] : [])
  })
  test(`${name}: renovación/concesión de permiso conserva compatibilidad sin m365`, () => {
    const { m365: _gate, ...legacyRenewal } = renewal
    assert.deepEqual(connectionLinks(render(legacyRenewal)), name === 'correo' ? ['Conceder permiso de correo'] : [])
  })
}

test('correo con IA: también oculta la conexión con m365:false sin ejecutar useEffect', () => {
  assert.deepEqual(connectionLinks(renderDrawer('ai', closed)), [])
})
test('correo con IA: muestra la conexión con m365:true sin ejecutar useEffect', () => {
  assert.deepEqual(connectionLinks(renderDrawer('ai', open)), ['Conectar mi Outlook'])
})
test('todos los renders: cero llamadas fetch; el efecto IA no se ha ejecutado', () => {
  assert.equal(networkCalls, 0)
})

console.log(`\n${passed} casos correctos, ${failed} fallos (render real en memoria; sin red ni BD)`)
process.exitCode = failed ? 1 : 0
