/** Documentos: catálogo real, capacidades reales y SSR de fuentes nativas en VM.
 * Sin .env, sesión real, HTTP, BD ni Graph. No sustituye aceptación autenticada.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { area4RegisteredSurface, area4RegistrySurfaceMatches, AREA4_BASELINE_DESCRIPTORS_SHA256, AREA4_BASELINE_IDENTITIES_SHA256 } from '../lib/area4/section-registry'
import { area4RequestCapabilities, area4CommandBodyLimit } from '../lib/area4/request-policy'
import * as nativeViews from '../lib/finanzas/conciliar-unificado'
const local = createRequire(import.meta.url)
const { transformSync } = createRequire(local.resolve('tsx/package.json'))('esbuild')
const realReact = local('react'), jsx = local('react/jsx-runtime')
const paths = ['/api/admin/finanzas/conciliar/confirming-documentos', '/api/admin/finanzas/documentos', '/api/admin/finanzas/documentos/[id]', '/api/admin/finanzas/documentos/comparacion']
let providers = 0
const forbidden = () => { providers++; throw new Error('PROVEEDOR/BD/HTTP PROHIBIDO') }
function load(sourcePath: string, state: Record<number, unknown>, acting = false, session: any = null, viewAs = false) {
  let index = 0
  const react = { ...realReact, useState: (initial: any) => { const i = index++; return [Object.hasOwn(state, i) ? state[i] : typeof initial === 'function' ? initial() : initial, () => {}] }, useRef: (value: any) => ({ current: value }), useEffect: () => {}, useMemo: (fn: any) => fn(), useCallback: (fn: any) => fn }
  const module = { exports: {} as any }
  const code = transformSync(readFileSync(sourcePath, 'utf8'), { loader: 'tsx', format: 'cjs', jsx: 'automatic', platform: 'node', target: 'es2022' }).code
  runInNewContext(code, { module, exports: module.exports, console, Intl, Date, Map, Set, URLSearchParams, AbortController, fetch: forbidden, crypto: { randomUUID: () => 'fixture' }, window: { location: { search: viewAs ? '?verComo=1' : '' } }, setTimeout: () => 0, clearTimeout: () => {},
    require(id: string) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return jsx
      if (id === 'next-auth/react') return { useSession: () => ({ data: session }) }
      if (id === 'next/dynamic') return () => (props: any) => createElement('div', { 'data-documentos-tool': 'mounted', 'data-can-write': props.canUpload ?? props.canWrite ?? !props.readOnly, 'data-staging': props.stagingOnly, 'data-acting': props.acting })
      if (id === 'next/navigation') return { useRouter: () => ({ refresh: forbidden }) }
      if (id === '@/components/impersonation/ActuationProvider') return { useActuation: () => ({ active: acting ? { sessionId: 'acting-fixture' } : null }) }
      if (id === '@/lib/finanzas/conciliar-unificado') return nativeViews
      if (id === '@/components/io-ui/kit') return { Menu: () => null, Panel: (p: any) => createElement('section', null, p.children), Toast: () => null, eur: (v: number) => `${v} €` }
      if (id === '@/components/finanzas/easy/easy-two-step-client') return { parseEasyAccessProfile: forbidden }
      if (id === '@/components/finanzas/easy/easy-contract') return { canConfirmSuggestion: forbidden, noRequireReasonLabel: () => '', suggestionEvidenceLabel: () => '' }
      if (id === '@/components/finanzas/conciliar/conciliar-ui-helpers') return { hasHumanOwnTransferConfirmation: () => false, requiresSeparateRemesaConfirmation: () => false }
      if (id === '@/components/finanzas/conciliar/conciliar-contract') return { makeIdempotencyKey: forbidden, parseConciliarRemesaPreviewResponse: forbidden, parseConciliarReviewPreviewResponse: forbidden }
      if (id === './api') return { API_CONCILIAR: '/api/admin/finanzas/conciliar', API_FACIL: '/api/admin/finanzas/modo-facil', getJson: forbidden, leerModoFacilDia: forbidden, leerParaPedir: forbidden, leerProyeccion: forbidden, postJson: forbidden }
      throw new Error(`Import no permitido: ${id}`)
    },
  }, { timeout: 5000 })
  return module.exports.default
}
const workspacePath = 'components/finanzas/conciliar-unificado/DocumentosWorkspace.tsx'
const parentPath = 'components/finanzas/conciliar-unificado/ConciliarUnificado.tsx'
const props = { hoy: '2026-11-26', vistaInicial: 'bandeja', qInicial: '', resumen: { movimientos: 0, entranCentimos: 0, salenCentimos: 0, conciliados: 0, sinTercero: 0 }, cuentas: [], conteos: { reglas: 0, rojas: 0, verdes: 0, cobros: 0, pagos: 0 }, remesas: [] }
function render(component: any, p: any) { return renderToStaticMarkup(createElement(component, p)) }
test('las cuatro rutas son NEW, sin menú/baseline y en sus áreas exactas', () => {
  paths.forEach((path, i) => { const m = area4RegisteredSurface(path, 'api')!; assert.ok(m); assert.equal(m.baseline, false); assert.equal(m.surface.menu, undefined); assert.equal(m.section.areaCode, i === 0 ? 'admin.finanzas.conciliacion' : 'admin.finanzas.facturas'); assert.equal(m.surface.availability?.stagingOnly, true) })
  // Los contratos CRM cambiados son NEW sin perder su descriptor histórico.
  // La evidencia congelada contiene 439; current.baseline es otro contador.
  assert.equal(area4RegistrySurfaceMatches().filter(m => m.surface.baselineDescriptor !== undefined).length, 439)
  assert.equal(AREA4_BASELINE_DESCRIPTORS_SHA256, '46f6730c0eb75836ee9fbf311d6ebb38b1b5e70babedc56591f6d6c97854a92f')
  assert.equal(AREA4_BASELINE_IDENTITIES_SHA256, '1fd44a77bd14022b2e72de292e7081daf5b7590ec2f8c11c6416844afba0470c')
})
test('lectura V, Guardar V/E y Validar/Archivar V/E/C sólo en el documento nuevo', () => {
  const path = '/api/admin/finanzas/documentos/documento_fixture'
  assert.deepEqual(area4RequestCapabilities({ path, method: 'GET' }), ['lectura'])
  assert.deepEqual(area4RequestCapabilities({ path, method: 'POST', action: 'GUARDAR' }), ['lectura', 'escritura'])
  for (const action of ['VALIDAR', 'ARCHIVAR']) assert.deepEqual(area4RequestCapabilities({ path, method: 'POST', action }), ['lectura', 'escritura', 'confirmar'])
  assert.deepEqual(area4RequestCapabilities({ path: '/api/admin/finanzas/conciliar/confirming-documentos', method: 'POST' }), ['lectura', 'escritura'])
  assert.equal(area4CommandBodyLimit(path, 'POST'), 16384)
  assert.equal(area4RequestCapabilities({ path: '/api/admin/crm/empresas', method: 'POST', action: 'ARCHIVAR' }).includes('confirmar'), false)
})
test('abrir el espacio no monta herramientas ni consulta correo/carpetas', () => {
  const html = render(load(workspacePath, {}), { stagingOnly: true, acting: false, canWrite: true, onClose() {} })
  assert.match(html, /Lectura del correo pendiente de permiso y prueba/); assert.match(html, /30\/11/); assert.match(html, /9\/12/)
  assert.doesNotMatch(html, /data-documentos-tool/); assert.equal(providers, 0)
})
test('las tres herramientas se montan sólo en la selección y sin inventar escritura', () => {
  for (const tab of ['manual', 'confirmings', 'comparacion']) {
    const html = render(load(workspacePath, { 0: tab }), { stagingOnly: true, acting: false, canWrite: false, onClose() {} })
    assert.equal((html.match(/data-documentos-tool/g) ?? []).length, 1)
    if (tab !== 'comparacion') assert.match(html, /data-can-write="false"/)
  }
  assert.equal(providers, 0)
})
test('Production, actuación, claim malformado o Ver como no montan el espacio', () => {
  for (const option of [{ stagingOnly: false }, { acting: true }]) assert.equal(render(load(workspacePath, { 0: 'manual' }), { stagingOnly: true, acting: false, canWrite: true, onClose() {}, ...option }), '')
  for (const claim of [{}, false, 0, '']) assert.equal(render(load(workspacePath, { 0: 'manual' }, false, { impersonation: claim }), { stagingOnly: true, acting: false, canWrite: true, onClose() {} }), '')
  assert.equal(render(load(workspacePath, { 0: 'manual' }, false, null, true), { stagingOnly: true, acting: false, canWrite: true, onClose() {} }), '')
})
test('padre no ofrece Documentos sin fence servidor/perfil Stage avanzado; seis vistas intactas', () => {
  const profile = { easyOnly: false, canWrite: true, canManageAutomation: false, environment: 'staging' }
  for (const [enabled, p, acting] of [[false, profile, false], [true, null, false], [true, { ...profile, environment: 'production' }, false], [true, { ...profile, easyOnly: true }, false], [true, profile, true]] as const) {
    const html = render(load(parentPath, { 4: true, 5: p }, acting), { ...props, documentosHabilitados: enabled })
    assert.doesNotMatch(html, />Documentos<|data-documentos-tool/)
  }
  const html = render(load(parentPath, { 4: true, 5: profile }), { ...props, documentosHabilitados: true })
  assert.match(html, />Documentos</); assert.match(html, /data-documentos-tool/)
  assert.deepEqual([...nativeViews.VISTAS], ['bandeja', 'cobros', 'pagos', 'remesas', 'pedir', 'cuentas']); assert.equal(providers, 0)
})
