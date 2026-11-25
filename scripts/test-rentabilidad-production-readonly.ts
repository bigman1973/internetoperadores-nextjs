import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import ts from 'typescript'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import { NextRequest, NextResponse } from 'next/server'
import * as types from '../lib/rentabilidad/types'
import * as engine from '../lib/rentabilidad/engine'
import * as defaults from '../lib/rentabilidad/defaults'
import * as presentation from '../lib/rentabilidad/presentation'
import * as drilldown from '../lib/rentabilidad/desglose'
import * as viewModel from '../app/admin/rentabilidad/view-model'
import * as ioModel from '../app/admin/rentabilidad/io-model'
import { rentabilidadAutomationStatus } from '../lib/rentabilidad/status'
import { createIspReadTransport, readConfiguredLineExport } from '../lib/rentabilidad/isp'

// Only synthetic identities and fixtures. Unknown imports/network/operational reads fail closed.
const production = { DATABASE_URL: 'postgresql://postgres@synthetic.invalid/railway', VERCEL_ENV: 'production', RENTABILIDAD_ENABLED: '1', RENTABILIDAD_PRODUCTION_READ_ONLY: '1', IO_PRODUCTION_READ_ONLY: '1' }
const staging = { DATABASE_URL: 'postgresql://io_staging_finanzas@synthetic.invalid/io_staging_finanzas', VERCEL_ENV: 'preview', FINANCE_STAGING_SANDBOX: '1', RENTABILIDAD_ENABLED: '1' }
function execute(file: string, imports: Record<string, any>, env: Record<string, string | undefined>, globals: Record<string, any> = {}) {
  const module = { exports: {} as any }
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  runInNewContext(js, { module, exports: module.exports, process: { env }, URL, URLSearchParams, Buffer, Date, Intl, console, setTimeout, clearTimeout, ...globals, require: (name: string) => {
    if (!(name in imports)) throw new Error(`UNEXPECTED_IMPORT:${name}`)
    return imports[name]
  } }, { filename: file })
  return module.exports
}
function harness(env: Record<string, string | undefined> = production, identity?: any[]) {
  const calls: string[] = [], queries: any[] = []
  let session: any = { user: { id: '903', userType: 'admin', role: 'SUPER_ADMIN' } }
  let principal: any = { rol: 'SUPER_ADMIN', roles: [], activo: true }
  let snapshots = true
  const payload: any = { period: '2026-10', mode: 'real', readOnly: false, summary: null, products: [], monthly: [], clients: [], contracts: [], comparison: [], alerts: [], rules: [], externalCosts: [], controls: {}, references: [], notices: [] }
  const database = {
    $queryRaw: async (sql: any) => {
      queries.push(sql); calls.push('sql')
      assert.match(sql.sql, /^\s*SELECT\b/)
      if (sql.sql.includes('current_database()')) return identity ?? [{ db: env.VERCEL_ENV === 'production' ? 'railway' : 'io_staging_finanzas', usuario: env.VERCEL_ENV === 'production' ? 'postgres' : 'io_staging_finanzas' }]
      if (sql.sql.includes('rentabilidad_snapshots')) {
        if (!snapshots) return []
        if (sql.sql.trim().startsWith('SELECT payload')) return [{ payload }]
        return [{ id: 'SYNTH-FOTO', kind: 'PROYECCION', month: sql.values[0] ?? '2026-10', version: 1, payload, createdAt: new Date('2026-11-01'), sourceHash: 'synthetic' }]
      }
      if (sql.sql.includes('rentabilidad_ejecuciones')) return [{ id: 'SYNTH-RUN', process: 'RECALCULATE', payload: { estado: 'COMPLETADO' }, createdAt: new Date('2026-11-01') }]
      if (sql.sql.includes('rentabilidad_versiones')) return []
      throw new Error('UNEXPECTED_OPERATIONAL_QUERY')
    },
    $executeRaw: async () => { throw new Error('UNEXPECTED_WRITE') },
    $transaction: async () => { throw new Error('UNEXPECTED_TRANSACTION') },
    usuarioAdmin: { findUnique: async ({ where, select }: any) => { calls.push('live-admin'); assert.equal(where.id, 903); assert.equal(select.rol, true); assert.equal(select.activo, true); return principal } },
    contratoDraxton: { findMany: async () => { throw new Error('UNEXPECTED_REBUILD_SOURCE') } },
  }
  const prismaModule = { prisma: database }
  // Preserve the real validators while normalising prototypes created by another VM realm.
  const realmTypes = { ...types, safePayload: (raw: any, max?: number) => types.safePayload(JSON.parse(JSON.stringify(raw)), max), sourceHash: (raw: any) => types.sourceHash(JSON.parse(JSON.stringify(raw))) }
  const store = execute('lib/rentabilidad/store.ts', { '@prisma/client': { Prisma }, 'node:crypto': { randomUUID: () => { throw new Error('UNEXPECTED_UUID_WRITE') } }, zod: { z }, './types': realmTypes, '../prisma': { get prisma() { calls.push('load-db'); return database } } }, env)
  const auth = execute('lib/rentabilidad/auth.ts', { 'next-auth': { getServerSession: async () => { calls.push('session'); return session } }, 'next/server': { NextResponse }, 'next/navigation': { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }, '@/lib/auth': { authOptions: {} }, '@/lib/prisma': prismaModule, './store': store }, env)
  const report = execute('lib/rentabilidad/report.ts', { '@prisma/client': { Prisma }, '@/lib/prisma': prismaModule, '@/lib/finanzas/invoice-economic-filter': { facturaEconomicaSQL: () => { throw new Error('UNEXPECTED_REBUILD') } }, './store': store, './engine': engine, './defaults': defaults, './presentation': presentation, './status': { rentabilidadAutomationStatus: (runs: any[]) => rentabilidadAutomationStatus(runs, env) } }, env)
  const detail = execute('lib/rentabilidad/desglose-datos.ts', { '@prisma/client': { Prisma }, './types': types, './engine': engine, './store': store, './desglose': drilldown, '../prisma': prismaModule }, env)
  const automation = execute('lib/rentabilidad/automation.ts', { './store': store, './isp': {}, './report': report, './engine': engine, './types': types }, env)
  return { env, calls, queries, database, store, auth, report, detail, automation, setSession: (s: any) => { session = s }, setPrincipal: (p: any) => { principal = p }, setSnapshots: (value: boolean) => { snapshots = value } }
}

test('producción admite únicamente lectura explícita railway/postgres, ambos protocolos y sandbox ausente/no1', () => {
  const h = harness()
  for (const env of [production, { ...production, DATABASE_URL: 'postgres://postgres@synthetic.invalid/railway' }, { ...production, FINANCE_STAGING_SANDBOX: '0' }, { ...production, IO_PRODUCTION_READ_ONLY: undefined }]) assert.equal(h.store.assertRentabilidadReadConfiguration(env), 'production-read-only')
  for (const patch of [{ RENTABILIDAD_PRODUCTION_READ_ONLY: undefined }, { RENTABILIDAD_PRODUCTION_READ_ONLY: 'true' }, { FINANCE_STAGING_SANDBOX: '1' }, { DATABASE_URL: 'mysql://postgres@synthetic.invalid/railway' }, { DATABASE_URL: 'postgres://other@synthetic.invalid/railway' }, { DATABASE_URL: 'postgres://postgres@synthetic.invalid/other' }, { DATABASE_URL: staging.DATABASE_URL }, { DATABASE_URL: 'invalid' }]) assert.throws(() => h.store.assertRentabilidadReadConfiguration({ ...production, ...patch }), /READ_CONFIGURATION_REQUIRED/)
  assert.equal(h.calls.length, 0)
})
test('preview, development y VERCEL_ENV ambiguo contra BD producción nunca habilitan lectura ni auth', async () => {
  for (const value of ['preview', 'development', 'Production', 'production ', undefined]) {
    const h = harness({ ...production, VERCEL_ENV: value })
    assert.throws(() => h.store.assertRentabilidadReadConfiguration(), /STAGING_REQUIRED/)
    assert.equal(h.auth.rentabilidadAvailable(), false)
    assert.equal((await h.auth.requireRentabilidadAdmin()).error.status, 404)
    await assert.rejects(() => h.store.listSnapshots(), /STAGING_REQUIRED/)
    assert.equal(h.calls.length, 0)
  }
})
test('guard de escritores conserva semántica estricta y staging intacto con flag nuevo irrelevante', async () => {
  const h = harness(staging)
  assert.equal(h.store.assertRentabilidadReadConfiguration(), 'staging')
  assert.doesNotThrow(() => h.store.assertRentabilidadConfiguration())
  assert.doesNotThrow(() => h.store.assertRentabilidadConfiguration({ ...staging, RENTABILIDAD_PRODUCTION_READ_ONLY: '1' }))
  for (const env of [production, { ...staging, VERCEL_ENV: 'production' }, { ...staging, FINANCE_STAGING_SANDBOX: '0' }, { ...staging, IO_PRODUCTION_READ_ONLY: '1' }, { ...staging, DATABASE_URL: production.DATABASE_URL }]) assert.throws(() => h.store.assertRentabilidadConfiguration(env), /STAGING_REQUIRED/)
  const auth = await h.auth.requireRentabilidadAdmin({ write: true })
  assert.equal(auth.userId, 903); assert.equal(auth.readOnly, false)
  assert.equal((await h.report.getRentabilidadReport('2026-10')).readOnly, false)
})
test('todos los lectores reutilizados verifican identidad y solo consultan SELECT acotados en producción', async () => {
  const h = harness()
  await h.store.listSnapshots('2026-10'); await h.store.listRecentRuns(50)
  await h.store.getRuleHistory(undefined, 100); await h.store.getExternalCostHistory(undefined, 100); await h.store.listResolvedExceptions(100)
  assert.equal(h.queries.filter(q => q.sql.includes('current_database()')).length, 5)
  assert.ok(h.queries.every(q => /\bLIMIT\b/.test(q.sql)))
  assert.ok(h.queries.every(q => !/INSERT|UPDATE|DELETE|FOR SHARE|pg_advisory/.test(q.sql)))
})
test('identidad runtime incorrecta deniega cada lector, desglose y auth antes de datos de negocio', async () => {
  for (const identity of [[], [{ db: 'other', usuario: 'postgres' }], [{ db: 'railway', usuario: 'other' }], [{ db: 'railway', usuario: 'postgres' }, { db: 'railway', usuario: 'postgres' }]]) {
    const h = harness(production, identity)
    for (const read of [() => h.store.listSnapshots(), () => h.store.listRecentRuns(), () => h.store.getRuleHistory(), () => h.store.getExternalCostHistory(), () => h.store.listResolvedExceptions(), () => h.detail.fotoCompleta('2026-10'), () => h.detail.leerDatos({}, 'cliente', 'SYNTH', 'coste', '2026-10')]) await assert.rejects(read, /READ_CONFIGURATION_REQUIRED/)
    assert.equal((await h.auth.requireRentabilidadAdmin()).error.status, 404)
    assert.ok(!h.calls.includes('live-admin'))
    assert.ok(h.queries.every(q => q.sql.includes('current_database()')))
  }
  const h = harness(staging, [{ db: 'railway', usuario: 'postgres' }])
  await assert.rejects(() => h.store.listSnapshots(), /STAGING_REQUIRED/)
})
test('SA vivo mantiene acceso, JWT o roles secundarios no elevan y acting permanece bloqueado', async () => {
  const h = harness()
  const auth = await h.auth.requireRentabilidadAdmin()
  assert.equal(auth.userId, 903); assert.equal(auth.readOnly, true)
  assert.deepEqual(h.calls, ['session', 'sql', 'live-admin'])
  for (const principal of [null, { rol: 'SUPER_ADMIN', activo: false }, { rol: 'GERENTE', roles: ['SUPER_ADMIN'], activo: true }]) {
    h.setPrincipal(principal)
    assert.equal((await h.auth.requireRentabilidadAdmin()).error.status, 403)
  }
  h.setSession({ user: { id: '903', userType: 'admin', role: 'SUPER_ADMIN' }, impersonation: { actorId: 903 } })
  h.calls.length = 0
  assert.equal((await h.auth.requireRentabilidadAdmin()).error.status, 403)
  assert.deepEqual(h.calls, ['session'])
  h.setSession(null)
  assert.equal((await h.auth.requireRentabilidadAdmin()).error.status, 401)
  const disabled = harness({ ...production, RENTABILIDAD_ENABLED: '0' })
  assert.equal((await disabled.auth.requireRentabilidadAdmin()).error.status, 404)
  assert.equal(disabled.calls.length, 0)
})
test('informe conserva readOnly servidor en meses/modos y ausencia de foto sin recálculo', async () => {
  const h = harness()
  for (const month of ['2026-10', '2026-11']) for (const mode of ['real', 'contratado']) {
    const report = await h.report.getRentabilidadReport(month, mode)
    assert.equal(report.readOnly, true); assert.equal(report.period, month); assert.equal(report.mode, mode)
    assert.equal(report.syncStatus.scheduler.registered, false)
  }
  h.setSnapshots(false)
  const empty = await h.report.getRentabilidadReport('2026-09')
  assert.equal(empty.readOnly, true); assert.equal(empty.summary, null)
  assert.match(empty.notices[0], /no se recalcula/)
  assert.ok(h.queries.every(q => !/facturas|rentabilidad_lineas/.test(q.sql)))
})
test('desglose y GET autenticados consultan fotos guardadas sin escribir ni recalcular', async () => {
  const h = harness()
  assert.equal((await h.detail.fotoCompleta('2026-10')).period, '2026-10')
  const get = execute('app/api/admin/rentabilidad/route.ts', { '@/lib/rentabilidad/auth': h.auth, './_shared': { parseQuery: (req: NextRequest) => Object.fromEntries(req.nextUrl.searchParams), reply: (data: any) => NextResponse.json(data), viewReport: h.report.getRentabilidadReport, failure: (e: any) => { throw e } }, '@/lib/rentabilidad/desglose-datos': h.detail }, production)
  const response = await get.GET(new NextRequest('https://synthetic.invalid/api/admin/rentabilidad?month=2026-10&mode=real'))
  assert.equal(response.status, 200); assert.equal((await response.json()).readOnly, true)
  const detail = await get.GET(new NextRequest('https://synthetic.invalid/api/admin/rentabilidad?month=2026-10&detalle=cliente&clave=SYNTH&vista=coste'))
  assert.equal(detail.status, 200)
  assert.equal((await detail.json()).tipo, 'cliente')
  h.setSession({ user: { id: '903', userType: 'admin' }, impersonation: {} })
  h.calls.length = 0
  assert.equal((await get.GET(new NextRequest('https://synthetic.invalid/api/admin/rentabilidad?month=2026-10'))).status, 403)
  assert.deepEqual(h.calls, ['session'])
})
test('todos los POST deniegan antes de cuerpo, proveedores, lectura del informe o logs, incluido sync bloqueado', async () => {
  const h = harness()
  const forbidden = () => { throw new Error('UNEXPECTED_SIDE_EFFECT') }
  for (const route of ['rules', 'exceptions', 'external-costs', 'recalculate', 'sync']) {
    const mod = execute(`app/api/admin/rentabilidad/${route}/route.ts`, { '@/lib/rentabilidad/auth': h.auth, '@/lib/rentabilidad/store': { saveRule: forbidden, resolveException: forbidden, appendRun: forbidden, importInitial: forbidden }, '@/lib/rentabilidad/report': { getRentabilidadReport: forbidden, rebuildRentabilidadReport: forbidden }, '@/lib/rentabilidad/presentation': presentation, '@/lib/rentabilidad/types': types, '@/lib/rentabilidad/isp': { ispAvailability: forbidden, readConfiguredLineExport: forbidden }, zod: { z }, '../_shared': { readJson: forbidden, failure: (e: any) => { throw e } } }, production)
    const response = await mod.POST({ get body() { return forbidden() } })
    assert.equal(response.status, 403, route)
    assert.match((await response.json()).error, /solo lectura/)
  }
  assert.equal(h.calls.length, 0)
})
test('escritores directos, readInputs y recálculo siguen bloqueados antes de conexión o fuentes', async () => {
  const h = harness()
  const writes = [() => h.store.readInputs(), () => h.store.importInitial({}, 903), () => h.store.saveRule({ type: 'externalCost', key: 'SYNTH', sociedadPagadora: 'Vola' }, 903), () => h.store.ensureExceptions([{ key: 'SYNTH' }], 903), () => h.store.resolveException({ exceptionKey: 'SYNTH', action: 'DESCARTAR' }, 903), () => h.store.appendRun({ actorId: 903, process: 'SYNTH' }), () => h.store.saveSnapshot('2026-10', {}, 903), () => h.report.rebuildRentabilidadReport('2026-10', 903)]
  for (const write of writes) await assert.rejects(write, /STAGING_REQUIRED/)
  assert.equal(h.calls.length, 0)
})
test('cron y diario/sync de automatización rechazan producción incluso con secretos e interruptores activos', async () => {
  const env = { ...production, RENTABILIDAD_STAGING_CRON_SECRET: 'SYNTH-TOKEN', RENTABILIDAD_SYSTEM_ACTOR_ID: '903', RENTABILIDAD_SYNC_APPROVED: '1' }
  const h = harness(env), forbidden = async () => { throw new Error('UNEXPECTED_AUTOMATION') }
  assert.throws(() => h.automation.assertAutomationEnabled(), /STAGING_REQUIRED/)
  await assert.rejects(() => h.automation.synchronizeRentabilidad(903, { env, append: forbidden, lines: forbidden, readInputs: forbidden }), /STAGING_REQUIRED/)
  await assert.rejects(() => h.automation.runRentabilidadDaily(903, new Date(), { env, append: forbidden, rebuild: forbidden, sync: forbidden }), /STAGING_REQUIRED/)
  const cron = execute('app/api/cron/rentabilidad-daily/route.ts', { 'next/server': { NextResponse }, 'node:crypto': { timingSafeEqual: () => { throw new Error('UNEXPECTED_TOKEN_CHECK') } }, '@/lib/rentabilidad/automation': { assertAutomationEnabled: h.automation.assertAutomationEnabled, runRentabilidadDaily: forbidden } }, env)
  assert.equal((await cron.GET({ headers: { get: () => { throw new Error('UNEXPECTED_AUTH_HEADER') } } })).status, 404)
  assert.equal(h.calls.length, 0)
})
test('transportes ISP y export configurados siguen denegados sin una sola petición', async () => {
  let requests = 0
  const env = { ...production, RENTABILIDAD_ISP_ADVANCED_REACCREDITED: '1', ISPGESTION_API_URL: 'https://isp.synthetic.invalid/api/', ISPGESTION_API_USER: 'synthetic', ISPGESTION_API_HASH: 'synthetic', RENTABILIDAD_EXPORT_ENABLED: '1', RENTABILIDAD_EXPORT_URL: 'https://export.synthetic.invalid/lines', RENTABILIDAD_EXPORT_ALLOWED_HOST: 'export.synthetic.invalid', RENTABILIDAD_EXPORT_TOKEN: 'synthetic' }
  const http = async () => { requests++; throw new Error('UNEXPECTED_NETWORK') }
  await assert.rejects(() => createIspReadTransport(env, http as any)('contratos_todos', 'GET', { mostrar: 1, pagina: 1 }), /STAGING_REQUIRED/)
  await assert.rejects(() => readConfiguredLineExport(env, http as any), /STAGING_REQUIRED/)
  assert.equal(requests, 0)
})

function clientHarness(initialReport: any) {
  const state: any[] = [], requests: any[] = [], exports: any[] = []
  let index = 0
  const hooks = { ...React, useState: (initial: any) => { const i = index++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], (next: any) => { state[i] = typeof next === 'function' ? next(state[i]) : next }] }, useEffect: () => {}, useMemo: (fn: any) => fn(), useRef: (value: any) => { const i = index++; if (!(i in state)) state[i] = { current: value }; return state[i] } }
  const forbidden = () => { throw new Error('UNEXPECTED_EDITOR_OR_SYNC_CONTROL') }
  const passthrough = (props: any) => React.createElement('div', null, props.children)
  const mod = execute('app/admin/rentabilidad/RentabilidadClient.tsx', { react: hooks, 'react/jsx-runtime': jsx, '@/components/io-ui/kit': { FilterTable: passthrough, IoShell: passthrough, Note: passthrough, Toast: passthrough, TopBar: passthrough, eur: (v: any) => String(v ?? '—'), monthLabel: (v: any) => v, MESES: Array(12).fill('mes'), MESES_LARGO: Array(12).fill('mes') }, './Editors': { AlertAction: forbidden, ExternalCostsEditor: forbidden, RulesEditor: forbidden }, './Legacy': { Comparison: passthrough, SystemState: forbidden }, './Desglose': { __esModule: true, default: passthrough }, './charts': {}, './io-model': ioModel, './view-model': viewModel, './export-table': { exportTable: async (...args: any[]) => { exports.push(args) } } }, production, {
    window: { history: { replaceState() {} }, location: { hash: '' }, confirm: forbidden },
    fetch: async (url: string, options: any) => { requests.push({ url, options }); assert.equal(options.method, 'GET'); return { ok: true, json: async () => ({ ...initialReport, period: '2026-09', readOnly: false }) } },
  })
  function render() { index = 0; return mod.default({ initialReport }) }
  function nodes(node: any): any[] { if (Array.isArray(node)) return node.flatMap(nodes); if (!node || typeof node !== 'object') return []; return [node, ...nodes(node.props?.children), ...nodes(node.props?.controls)] }
  return { state, requests, exports, render, nodes }
}
test('UI producción oculta acciones escritoras, conserva export y readOnly al cambiar mes', async () => {
  const initialReport = { readOnly: true, period: '2026-10', mode: 'real', products: [], monthly: [], clients: [], alerts: [], summary: null }
  const h = clientHarness(initialReport)
  let tree = h.nodes(h.render())
  const options = tree.filter(n => n.type === 'option').map(n => n.props.value)
  assert.ok(options.includes('excel')); assert.ok(options.includes('estado')); assert.ok(options.includes('reglas'))
  for (const option of ['recalc', 'cierre', 'sync']) assert.ok(!options.includes(option))
  const actions = tree.find(n => n.type === 'select' && n.props['aria-label'] === 'Acciones')
  for (const action of ['recalc', 'cierre', 'sync']) actions.props.onChange({ target: { value: action } })
  assert.equal(h.requests.length, 0)
  actions.props.onChange({ target: { value: 'excel' } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.exports.length, 1)
  tree = h.nodes(h.render())
  await tree.find(n => n.type === 'button' && n.props['aria-label'] === 'Mes anterior').props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.requests.length, 1); assert.equal(h.state[0].period, '2026-09'); assert.equal(h.state[0].readOnly, true)
  tree = h.nodes(h.render())
  assert.ok(!tree.some(n => n.type === 'option' && ['recalc', 'cierre', 'sync'].includes(n.props.value)))
  tree.find(n => n.type === 'select' && n.props['aria-label'] === 'Acciones').props.onChange({ target: { value: 'reglas' } })
  tree = h.nodes(h.render())
  assert.ok(tree.some(n => n.type?.name === 'ReadOnlyRecords'))
  assert.ok(!tree.some(n => ['RulesEditor', 'ExternalCostsEditor', 'SystemState'].includes(n.type?.name)))
})
test('UI staging mantiene acciones de escritura y SSR transmite readOnly desde servidor', async () => {
  const h = clientHarness({ readOnly: false, period: '2026-10', mode: 'real', products: [], monthly: [], clients: [], alerts: [], summary: null })
  const options = h.nodes(h.render()).filter(n => n.type === 'option').map(n => n.props.value)
  for (const option of ['recalc', 'cierre', 'sync', 'excel']) assert.ok(options.includes(option))
  const server = harness()
  const page = execute('app/admin/rentabilidad/page.tsx', { 'react/jsx-runtime': jsx, '@/lib/rentabilidad/auth': server.auth, '@/lib/rentabilidad/report': server.report, '@/lib/rentabilidad/types': types, '@/lib/rentabilidad/status': { rentabilidadAutomationStatus: () => { throw new Error('UNEXPECTED_FALLBACK') } }, './RentabilidadClient': { __esModule: true, default: () => null } }, production)
  const result = await page.default({ searchParams: Promise.resolve({ month: '2026-10' }) })
  assert.equal(result.props.initialReport.readOnly, true)
})
