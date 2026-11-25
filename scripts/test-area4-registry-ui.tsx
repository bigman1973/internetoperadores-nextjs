import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { AREA4_ACTIONS } from '../lib/area4/section-registry'
import type { Area4RegistrySnapshot, SectionAssignmentProposal } from '../lib/area4/section-assignments'
import RegistryAssignments, {
  createRegistryDrafts, REGISTRY_ASSIGNMENT_ROLES, registryApplyAllowed, registryReviewCommand, toggleRegistryAction,
} from '../components/admin/usuarios-maqueta/RegistryAssignments'
import Dialog from '../components/admin/usuarios-maqueta/Dialog'

// Todos los datos son ficticios; nunca se abre una sesión ni se usa HTTP o DB real.
const revision = 'a'.repeat(64)
const registry: Area4RegistrySnapshot = {
  revision, catalogueRevision: 'b'.repeat(64), baselineRevision: 'c'.repeat(64),
  available: true, assignments: [], assigningAllowed: false, warnings: [],
  pending: [{ sectionKey: 'synthetic-registry-only', label: 'Apartado ficticio', group: 'Administración', surfaces: [
    { id: 'page:/admin/apartado-ficticio', path: '/admin/apartado-ficticio', kind: 'page', descriptor: 'synthetic-page', actions: ['V', 'E'] },
    { id: 'api:/api/admin/apartado-ficticio', path: '/api/admin/apartado-ficticio', kind: 'api', descriptor: 'synthetic-api', actions: ['V', 'C', 'X'] },
  ] }],
}
const roles = REGISTRY_ASSIGNMENT_ROLES.map(role => ({ key: role.key, name: role.label }))
const props = { registry, roles, onSaved() {} }
assert.equal(renderToStaticMarkup(<RegistryAssignments {...props} registry={undefined} />), '')
assert.equal(renderToStaticMarkup(<RegistryAssignments {...props} registry={{ ...registry, pending: [] }} />), '')
const notice = renderToStaticMarkup(<RegistryAssignments {...props} />)
assert.match(notice, /Apartados nuevos sin asignar/)
assert.match(notice, /1 apartados pendientes/)
assert.match(notice, />Asignar a roles<\/button>/)
assert.doesNotMatch(notice, /disabled=/) // El flag falso no oculta ni bloquea abrir.
const empty = createRegistryDrafts(registry.pending)
assert.equal(Object.keys(empty[0].roles).length, 6)
assert.ok(Object.values(empty[0].roles).every(value => value === ''))
empty[0].roles.gerente = 'V'
assert.equal(createRegistryDrafts(registry.pending)[0].roles.gerente, '')
for (const letter of ['E', 'C', 'X'] as const) assert.equal(toggleRegistryAction('', letter, true), '')
assert.equal(toggleRegistryAction('VECX', 'V', false), '')
assert.equal(toggleRegistryAction('VX', 'E', true), 'VEX')
assert.equal(toggleRegistryAction('VE', 'E', false), 'V')
assert.deepEqual(Object.keys(registryReviewCommand(empty)).sort(), ['action', 'drafts'])
assert.equal(registryReviewCommand(empty).action, 'preview-sections')

// Ejecuta el componente real con hooks sintéticos como las pruebas de frontera del repo.
// Dialog conserva su implementación real en SSR; no afirmamos evidencia de navegador.
const source = readFileSync('components/admin/usuarios-maqueta/RegistryAssignments.tsx', 'utf8')
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText
const state: unknown[] = []; const refs: { current: unknown }[] = []; const dependencies: unknown[][] = []
let stateIndex = 0; let refIndex = 0; let effectIndex = 0; let effects: (() => void)[] = []
const requests: { url: string; command: any }[] = []
let saved = 0
let applyResponse: (() => void) | undefined
let failReview = false
let failApply = true
let legacyEnvelope = false
const moduleObject: { exports: any } = { exports: {} }
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data })
function makeProposal(drafts: any): SectionAssignmentProposal {
  return {
    revision: 'd'.repeat(64), assignmentRevision: revision,
    catalogueRevision: registry.catalogueRevision, baselineRevision: registry.baselineRevision, drafts,
    rows: [{ ...registry.pending[0], before: { ...createRegistryDrafts(registry.pending)[0].roles, gerente: 'VEC' }, roles: drafts[0].roles }],
  }
}
vm.runInNewContext(code, {
  module: moduleObject, exports: moduleObject.exports,
  require(name: string) {
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'react') return { ...React,
      useState(initial: unknown) {
        const index = stateIndex++
        if (!(index in state)) state[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
        return [state[index], (next: unknown) => { state[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(state[index]) : next }]
      },
      useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }) },
      useEffect(effect: () => void, next: unknown[]) {
        const index = effectIndex++; const previous = dependencies[index]
        if (!previous || next.some((value, i) => !Object.is(value, previous[i]))) { dependencies[index] = next; effects.push(effect) }
      },
    }
    if (name === '@/lib/area4/section-registry') return { AREA4_ACTIONS }
    if (name === './Dialog') return { __esModule: true, default: Dialog }
    // También demuestra que los imports type no cargan crypto, Prisma ni el backend.
    throw new Error(`Import de runtime inesperado: ${name}`)
  },
  fetch: async (url: string, options: { body: string }) => {
    assert.equal(url, '/api/admin/usuarios/propuestas')
    const command = JSON.parse(options.body)
    requests.push({ url, command })
    if (command.action === 'preview-sections') {
      if (failReview) return reply({ error: 'Error ficticio de revisión' }, false)
      return reply(legacyEnvelope ? { proposal: makeProposal(command.drafts) } : { sectionProposal: makeProposal(command.drafts) })
    }
    assert.equal(command.action, 'assign-sections')
    return new Promise(resolve => { applyResponse = () => resolve(failApply
      ? reply({ error: 'Error ficticio de asignación' }, false)
      : reply({ ok: true, registry: { ...registry, pending: [] } })) })
  },
})
let liveProps = { ...props, onSaved: async () => { saved++ } }
function render() {
  let tree: React.ReactElement = <></>
  for (let pass = 0; pass < 5; pass++) {
    stateIndex = 0; refIndex = 0; effectIndex = 0; effects = []
    tree = moduleObject.exports.default(liveProps)
    if (!effects.length) return tree
    for (const effect of effects) effect()
  }
  throw new Error('Efectos sintéticos no estabilizados')
}
function nodes(tree: unknown): React.ReactElement<any>[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!React.isValidElement<{ children?: React.ReactNode }>(tree)) return []
  return [tree, ...nodes(tree.props.children)]
}
function button(tree: unknown, text: string) {
  const found = nodes(tree).find(node => node.type === 'button' && node.props.children === text)
  assert.ok(found, `Botón ausente: ${text}`)
  return found!
}
function checkbox(tree: unknown, role: string, letter: string) {
  const found = nodes(tree).find(node => node.type === 'input' && node.props['aria-label'] === `${role} · Apartado ficticio · ${letter} · ${AREA4_ACTIONS.find(action => action.letter === letter)!.label}`)
  assert.ok(found)
  return found!
}
function confirmation(tree: unknown) {
  const found = nodes(tree).find(node => node.type === 'input' && !node.props['aria-label'])
  assert.ok(found, 'Confirmación ausente')
  return found!
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve))

async function main() {
  let tree = render()
  button(tree, 'Asignar a roles').props.onClick()
  tree = render()
  const modal = renderToStaticMarkup(tree)
  assert.match(modal, /<dialog[^>]+aria-labelledby=/)
  assert.match(modal, /Cerrar diálogo/)
  assert.match(modal, /\/api\/admin\/apartado-ficticio/)
  assert.match(modal, /\/admin\/apartado-ficticio/)
  assert.match(modal, /synthetic-registry-only/)
  assert.equal(nodes(tree).filter(node => node.type === 'input').length, 24)
  assert.ok(nodes(tree).filter(node => node.type === 'input').every(node => node.props.checked === false))
  assert.equal(checkbox(tree, 'Gerente', 'E').props.disabled, true)
  assert.equal(button(tree, 'Confirmar y asignar plantillas').props.disabled, true)
  checkbox(tree, 'Gerente', 'V').props.onChange({ target: { checked: true } })
  tree = render()
  checkbox(tree, 'Gerente', 'E').props.onChange({ target: { checked: true } })
  tree = render()
  const reviewButton = button(tree, 'Revisar en servidor (sin aplicar)')
  assert.equal(reviewButton.props.disabled, false)
  reviewButton.props.onClick(); reviewButton.props.onClick()
  await tick()
  assert.equal(requests.length, 1, 'No doble preview')
  assert.deepEqual(requests[0].command, { action: 'preview-sections', drafts: [{ sectionKey: 'synthetic-registry-only', roles: {
    superadmin: '', gerente: 'VE', contabilidad: '', comercial: '', draxton: '', empleado: '',
  } }] })
  tree = render()
  assert.equal(confirmation(tree).props.checked, false, 'Nunca confirma automáticamente')
  assert.match(renderToStaticMarkup(tree), /Diferencias por rol y superficie/)
  assert.match(renderToStaticMarkup(tree), /Retirar C/)
  confirmation(tree).props.onChange({ target: { checked: true } })
  tree = render()
  assert.equal(button(tree, 'Confirmar y asignar plantillas').props.disabled, true, 'Flag falso bloquea apply')
  button(tree, 'Confirmar y asignar plantillas').props.onClick()
  await tick()
  assert.equal(requests.length, 1)
  liveProps = { ...liveProps, registry: { ...registry, assigningAllowed: true } }
  tree = render()
  assert.equal(button(tree, 'Confirmar y asignar plantillas').props.disabled, false)
  checkbox(tree, 'Gerente', 'E').props.onChange({ target: { checked: false } })
  tree = render()
  assert.equal(button(tree, 'Confirmar y asignar plantillas').props.disabled, true, 'Editar invalida revisión')
  assert.ok(!nodes(tree).some(node => node.type === 'input' && !node.props['aria-label']))
  failReview = true
  button(tree, 'Revisar en servidor (sin aplicar)').props.onClick()
  await tick()
  tree = render()
  assert.match(renderToStaticMarkup(tree), /role="alert">Error ficticio de revisión/)
  failReview = false
  legacyEnvelope = true // Envoltura de la ruta local al comenzar este trabajo.
  button(tree, 'Revisar en servidor (sin aplicar)').props.onClick()
  await tick()
  tree = render()
  assert.equal(confirmation(tree).props.checked, false)
  confirmation(tree).props.onChange({ target: { checked: true } })
  tree = render()
  const proposal = makeProposal(requests.at(-1)!.command.drafts)
  assert.equal(registryApplyAllowed({ assigningAllowed: true, proposal, confirmed: true, busy: true }), false)
  assert.equal(registryApplyAllowed({ assigningAllowed: true, proposal, confirmed: true, busy: false, registryRevision: 'e'.repeat(64) }), false)
  assert.equal(registryApplyAllowed({ assigningAllowed: true, proposal: null, confirmed: true, busy: false }), false)
  const applyButton = button(tree, 'Confirmar y asignar plantillas')
  applyButton.props.onClick(); applyButton.props.onClick()
  await tick()
  assert.equal(requests.filter(request => request.command.action === 'assign-sections').length, 1, 'No doble apply')
  const applyCommand = requests.at(-1)!.command
  assert.deepEqual(Object.keys(applyCommand).sort(), ['action', 'confirmed', 'drafts', 'revision'])
  assert.equal(applyCommand.confirmed, true)
  assert.equal(applyCommand.revision, proposal.revision)
  assert.equal(saved, 0)
  assert.ok(applyResponse)
  applyResponse!()
  await tick()
  tree = render()
  assert.match(renderToStaticMarkup(tree), /Error ficticio de asignación/)
  assert.equal(saved, 0)
  assert.equal(button(tree, 'Confirmar y asignar plantillas').props.disabled, true)
  assert.equal(requests.filter(request => request.command.action === 'assign-sections').length, 1, 'No reintento automático tras error')
  button(tree, 'Revisar en servidor (sin aplicar)').props.onClick()
  await tick()
  tree = render()
  assert.equal(confirmation(tree).props.checked, false)
  confirmation(tree).props.onChange({ target: { checked: true } })
  tree = render()
  failApply = false
  button(tree, 'Confirmar y asignar plantillas').props.onClick()
  await tick()
  applyResponse!()
  await tick()
  tree = render()
  assert.equal(saved, 1, 'Callback único tras la confirmación del servidor')
  assert.match(renderToStaticMarkup(tree), /No se han adoptado usuarios/)
  assert.ok(!nodes(tree).some(node => node.type === Dialog))
  assert.ok(requests.every(request => ['preview-sections', 'assign-sections'].includes(request.command.action)))
  const parent = readFileSync('components/admin/UsuariosAdminClient.tsx', 'utf8')
  assert.match(parent, /<RegistryAssignments[^\n]+await workspace\.refreshSnapshot\(true\); await audit\.load\(\)/)
  console.log(JSON.stringify({ ok: true, evidence: 'SYNTHETIC_REGISTRY_UI_SSR_AND_IN_MEMORY_INTERACTIONS', roles: 6,
    httpRequests: 0, databaseWrites: 0, browserAcceptance: false, realSessions: false }))
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
