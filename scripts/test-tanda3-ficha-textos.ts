/** Tanda 3 · textos/resumen/contacto. Fuentes reales en VM + SSR/hooks; imports allowlist.
 * Ejecutar: env -i PATH="$PATH" HOME=/home/ubuntu node_modules/.bin/tsx scripts/test-tanda3-ficha-textos.ts
 * Sin .env, Prisma real, BD, HTTP, Graph, OpenAI ni timers/navegación reales.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const local = createRequire(import.meta.url)
const { transformSync } = createRequire(local.resolve('tsx/package.json'))('esbuild')
const plain = (v: any) => JSON.parse(JSON.stringify(v))
let forbidden = 0, passed = 0
function execute(file: string, deps: Record<string, any> = {}, env: Record<string, string> = {}, globals: Record<string, any> = {}, suffix = '') {
  const module = { exports: {} as any }
  const code = transformSync(readFileSync(file, 'utf8') + suffix, { loader: file.endsWith('tsx') ? 'tsx' : 'ts', jsx: 'automatic', format: 'cjs', platform: 'node', target: 'es2022' }).code
  runInNewContext(code, {
    module, exports: module.exports, Date, Intl, Request, Response, Headers, URL, URLSearchParams, AbortController, TextDecoder, console, process: { env },
    fetch() { forbidden++; throw Error('RED_BD_PROVEEDORES_PROHIBIDOS') },
    ...globals,
    require(id: string) { assert.ok(Object.hasOwn(deps, id), `Import no autorizado: ${file}: ${id}`); return deps[id] },
  }, { filename: `${file}:memory`, timeout: 5000 })
  return module.exports
}
const core = execute('lib/crm-empresa-actividad-core.ts')
const policy = execute('lib/m365-legacy-policy.ts')
const area1 = execute('lib/area1-m365.ts')
const ispPolicy = execute('lib/isp-origen-policy.ts')
const identity = execute('lib/area1-isp-identidad.ts', { './isp-origen-policy': ispPolicy })
const NOW = new Date('2026-11-26T23:23:00Z')
const COMPANY = 'empresa-fixture'
const closed = { enabled: true, connected: false, email: null, mail: false, m365: false, envios: false }
const open = { ...closed, m365: true, envios: true }
const body = (extra: any = {}) => ({ action: 'registrar_actividad', type: 'NOTA', description: 'Nota nativa de empresa', clientRequestId: 'memory-request-123', activityDate: NOW.toISOString(), ...extra })
async function test(name: string, fn: () => any) { await fn(); passed++; console.log(`OK ${name}`) }
function fixture(o: any = {}) {
  const rows: any[] = [], writes: any[] = [], reads: any[] = []
  const company: any = { id: COMPANY, nombre: 'Empresa sola', tipo: 'SOCIEDAD', origen: 'LOCAL', nif: null, contactos: o.person ? [{ contactoId: 'persona-fixture', papel: null, contacto: { id: 'persona-fixture', nombre: 'Persona', email: null, propiedades: {} } }] : [], clientes: [] }
  const noWrites = new Proxy({}, { get(_t, key) { forbidden++; throw Error(`ESCRITURA_PROHIBIDA:${String(key)}`) } })
  const db: any = {
    crmEmpresa: { findFirst: async () => { reads.push('empresa-post'); return o.missing ? null : { id: COMPANY } }, findUnique: async () => o.missing ? null : company },
    crmEmpresaCliente: { findMany: async ({ where }: any) => { assert.equal(where.empresaId, COMPANY); return [] } },
    ispVinculoArea1: { findMany: async ({ where }: any) => { assert.equal(where.destinoId, COMPANY); return [] } },
    ispClienteArea1: { findMany: async ({ where }: any) => { assert.ok(where.OR.some((w: any) => w.crmEmpresaId === COMPANY)); return o.isp === false ? [] : [{ id: 'source-cliente', ispClienteId: '701', codigo: '14', nombre: 'Empresa sola', cif: null, nif: null, docNormalizado: null, clienteWebId: null, crmEmpresaId: COMPANY, fechaInicio: null, contratos: [{ id: 'contrato', codigoContratoIsp: '44', activo: true, importeSinIva: 100, tarifa: 'Fibra', descripcion: 'Sede local' }] }] } },
    factura: { findMany: async () => o.noInvoices ? [] : [{ id: 'f', numeroDocumento: 'F-1', fecha: new Date('2026-10-05T10:00:00Z'), base: 100, total: 121, totalPendiente: o.pending ?? 0, situacion: 'COBRADA' }] },
    devolucionRemesa: { findMany: async () => [] },
    crmActividad: {
      findUnique: async () => rows[0] || null,
      create: async ({ data }: any) => { writes.push(data); const row = { id: `activity-${rows.length}`, ...data }; rows.push(row); return row },
      findMany: async (q: any) => { reads.push({ activity: q }); return [...rows, ...(o.activities || [])].sort((a, b) => b.fechaActividad.getTime() - a.fechaActividad.getTime()) },
    },
    crmEmpresaContacto: { findMany: async () => [] },
    crmTarea: { findMany: async () => o.tasks || [] }, area1CrmNegocio: { findMany: async () => [] }, area1CrmPipeline: { findMany: async () => [] },
    area1CrmConsentimiento: { findMany: async () => [] }, crmNegocioContacto: { findMany: async () => [] },
    area1CrmFichaIa: { findUnique: async (q: any) => { reads.push({ cache: q }); if (o.cacheError) throw Error('TABLA_NO_DISPONIBLE'); return o.cache || null }, upsert: noWrites, create: noWrites, update: noWrites },
    $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, 'Serializable'); return fn(db) },
  }
  const rent = { mes: '2026-10', meses: ['2026-10'], ingreso: [100], coste: [80], costeReal: [33], costeEstimado: [o.estimated ?? 47], snapshot: { id: 'foto-oct', month: '2026-10', kind: 'PROYECCION', version: 11, createdAt: null }, fotos: [{ id: 'foto-oct', month: '2026-10', kind: 'PROYECCION', version: 11 }], estados: ['DISPONIBLE'] }
  const model = execute('lib/area1-ficha-cliente.ts', {
    './prisma': { __esModule: true, default: db }, './area1-subida-cliente': { leerSubidaCliente: async () => null },
    './area1-isp-identidad': identity,
    './area1-ficha-rentabilidad': { normalizarCodigoFicha: (s: string) => s, leerRentabilidadFicha: async () => ({ rentabilidad: rent, margenContrato: new Map(), margenUltimo: { mes: '2026-10', pct: 20, margen: 20, hayEstimados: o.hasEstimated !== false, costeEstimado: o.estimated === null ? null : o.estimated ?? 47 } }) },
  })
  const session = o.session === undefined ? { user: { id: '7', userType: 'admin' } } : o.session
  const handler = execute('lib/crm-empresa-actividad.ts', {
    'next-auth': { getServerSession: async () => session }, 'next/server': { NextResponse: { json: Response.json } }, '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } }, 'node:crypto': { createHash },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { __esModule: true, default: db },
    '@/lib/crm-empresas-auth': { authorizeCrmEmpresas: async (write: boolean) => { assert.equal(write, true); return o.permission === false ? { status: 403, user: null } : { status: 200, user: { id: o.authorId ?? 7, name: 'Autor vivo' } } }, canAccessCrmRelated: async () => false },
    '@/lib/area1-m365': area1, '@/lib/m365-legacy-policy': policy, '@/lib/crm-empresa-actividad-core': core,
  }, o.env || {})
  return { model, rows, writes, reads, company, async read(nivel = 'SUPERADMIN') { return model.cargarFichaCliente(COMPANY, nivel, NOW) }, async post(extra: any = {}) {
    const r = await handler.registrarActividadEmpresa(new Request('https://fixture.invalid/api/admin/crm/empresas/empresa-fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body(extra)) }), { params: Promise.resolve({ id: COMPANY }) })
    return { status: r.status, data: await r.json() }
  } }
}
const browser = { setTimeout() { return 0 }, clearTimeout() {}, crypto: { randomUUID: () => 'memory-ui-request' }, history: { replaceState() {} }, location: { hash: '', reload() {} }, document: { addEventListener() {}, removeEventListener() {} }, window: { scrollTo() {}, print() {} } }
function ui(react = local('react'), runtime = local('react/jsx-runtime'), globals: any = {}) {
  return execute('components/admin/FichaCliente.tsx', { react, 'react/jsx-runtime': runtime, '@/lib/m365-legacy-policy': policy }, {}, { ...browser, ...globals }, '\nexport { Drawer, Timeline }\n')
}
const real = ui()
const props = (ficha: any, conexion: any = closed) => ({ ficha, m365: { conexion: { ...conexion }, aviso: null, corporativo: 'fixture@example.invalid', connectUrl: '/fixture/connect' }, puedeEscribir: true, puedeEscribirContactos: false })
const render = (ficha: any, conexion: any = closed) => renderToStaticMarkup(createElement(real.default, props(ficha, conexion)))
const same = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
class Hooks {
  index = 0; slots: any[] = []; pending = new Map<number, () => void>()
  memo(fn: any, deps: any[]) { const i = this.index++; if (!this.slots[i] || !same(this.slots[i].deps, deps)) this.slots[i] = { deps, value: fn() }; return this.slots[i].value }
  api = {
    useState: (initial: any) => { const i = this.index++; if (!this.slots[i]) this.slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [this.slots[i].value, (v: any) => { this.slots[i].value = typeof v === 'function' ? v(this.slots[i].value) : v }] },
    useRef: (current: any) => { const i = this.index++; return this.slots[i] ||= { current } },
    useMemo: (fn: any, deps: any[]) => this.memo(fn, deps), useCallback: (fn: any, deps: any[]) => this.memo(() => fn, deps),
    useEffect: (fn: any, deps: any[]) => { const i = this.index++, old = this.slots[i]; if (old && same(old.deps, deps)) return; this.slots[i] = { deps, cleanup: old?.cleanup }; this.pending.set(i, () => { this.slots[i].cleanup?.(); this.slots[i].cleanup = fn() }) },
  }
  flush() { const q = [...this.pending.values()]; this.pending.clear(); q.forEach(fn => fn()) }
}
function nodes(v: any): any[] { return Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : [] }
function text(v: any): string { return Array.isArray(v) ? v.map(text).join('') : v && typeof v === 'object' ? text(v.props?.children) : v == null || typeof v === 'boolean' ? '' : String(v) }
function harness(ficha: any, conexion = closed, drawer = false, defer = false) {
  const hooks = new Hooks(), calls: any[] = [], deferred: any[] = []
  let reloads = 0, tree: any
  const p: any = { ...props(ficha, conexion), ...(drawer ? { cajon: { kind: 'meet' }, onClose() {}, onOpen() {}, toast() {} } : {}) }
  const jsx = (type: any, props: any) => ({ type, props })
  const module = ui(hooks.api, { jsx, jsxs: jsx, Fragment: 'fragment' }, { location: { hash: '', reload() { reloads++ } }, setTimeout(fn: any, ms: number) { if (ms < 1000) fn(); return 0 }, fetch(url: string, init: any) {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
    assert.ok(url.endsWith('/resumen-ia') || (url === `/api/admin/crm/empresas/${COMPANY}` && init.method === 'POST'), `URL mock no permitida: ${url}`)
    if (defer) return new Promise(resolve => deferred.push(resolve))
    return Promise.resolve({ ok: true, json: async () => ({ success: true, puntos: ['Resumen legacy ficticio'] }) })
  } })
  const h = { hooks, calls, deferred, props: p, render() { hooks.index = 0; tree = module[drawer ? 'Drawer' : 'default'](p); return nodes(tree) }, get all() { return nodes(tree) }, get reloads() { return reloads }, find(fn: any) { const n = nodes(tree).find(fn); assert.ok(n, 'Control UI no encontrado'); return n }, button(label: string) { return this.find((n: any) => n.type === 'button' && text(n) === label) }, update(gate: any) { p.m365 = { ...p.m365, conexion: { ...p.m365.conexion, ...gate } }; this.render() } }
  h.render(); return h
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
async function main() {
  await test('margen: sólo importe estimado dinámico 47 EUR y precisión decimal; sin texto técnico bajo KPI', async () => {
    for (const [value, expected] of [[47, 'incluye 47 € de coste estimado'], [83.25, 'incluye 83,25 € de coste estimado'], [0, 'incluye 0 € de coste estimado']] as const) {
      const f = await fixture({ estimated: value }).read(), k = f.kpis.find((k: any) => k.go === 'rentabilidad' && k.etiqueta.startsWith('Margen'))
      assert.equal(k.sub, expected); const html = render(f); const header = html.slice(0, html.indexOf('</header>'))
      assert.ok(header.includes(expected)); assert.doesNotMatch(header, /foto PROYECCION|no acredita cierre certificado|mes cerrado por calendario/)
      assert.match(html, /foto PROYECCION v11/); assert.match(html, /no acredita cierre certificado/)
    }
    for (const o of [{ estimated: null }, { hasEstimated: false }]) assert.doesNotMatch((await fixture(o).read()).kpis.find((k: any) => k.etiqueta.startsWith('Margen')).sub, /incluye/)
  })
  await test('resumen local nativo en lector/SSR con puertas cerradas; sin cifra ni cero inventados', async () => {
    const f = await fixture({ tasks: [{ titulo: 'Revisar servicio', venceAt: new Date('2026-11-28T10:00:00Z') }] }).read()
    assert.equal(f.identidadIsp.estadoLectura, 'ISP'); assert.equal(f.identidadIsp.cuentas[0].id, 'source-cliente')
    assert.equal(f.resumen.origen, 'local'); assert.ok(f.resumen.puntos.some((p: string) => p.includes('cuota mensual 100,00 €'))); assert.ok(f.resumen.puntos.some((p: string) => p.includes('Facturado') && p.includes('100,00 €')))
    const html = render(f), sum = html.slice(html.indexOf('id="aiSum"'), html.indexOf('</ul>', html.indexOf('id="aiSum"')))
    assert.match(sum, /Revisar servicio/); assert.doesNotMatch(sum, /Envio pendiente|Preparando|margen|coste/i); assert.match(html, /resumen local/)
    const empty = await fixture({ isp: false, noInvoices: true }).read('COMERCIAL')
    assert.doesNotMatch(empty.resumen.puntos.join(' '), /0,00 €|100,00 €/); assert.match(empty.resumen.puntos.join(' '), /No constan contratos activos/)
  })
  await test('resumen comercial: no incluye márgenes, rentabilidad ni acceso lateral a su foto', async () => {
    const f = await fixture().read('COMERCIAL'); assert.equal(f.rentabilidad, null); assert.equal(f.verMargen, false); assert.doesNotMatch(JSON.stringify(f.resumen), /coste|margen|foto-oct/i)
  })
  await test('resumen local seguro: texto libre de tareas/productos no expone costes ni márgenes', async () => {
    const f = fixture({ tasks: [{ titulo: 'Revisar margen privado y coste', venceAt: NOW }], activities: [{ id: 'sensible', tipo: 'NOTA', titulo: 'Coste interno', descripcion: 'Rentabilidad privada', fechaActividad: NOW }] })
    const v = await f.read('COMERCIAL')
    assert.doesNotMatch(JSON.stringify(v.resumen), /coste|margen|rentabilidad|privad/i)
    assert.ok(v.resumen.puntos.some((p: string) => p.includes('Próxima tarea registrada')))
    assert.doesNotMatch(f.model.resumirFichaLocal({ ...v.contextoIa, productos: ['Fibra', 'Coste interno'] }).join(' '), /Coste interno/)
  })
  await test('cache del día válida leída en servidor y visible bajo cierre sin invocar IA; sin escrituras', async () => {
    const f = fixture({ cache: { puntos: ['Dato realmente guardado'], createdAt: NOW } }), view = await f.read()
    assert.equal(view.resumen.origen, 'guardado'); assert.deepEqual(plain(view.resumen.puntos), ['Dato realmente guardado'])
    const q = f.reads.find((r: any) => r.cache).cache
    assert.equal(q.where.empresaId_dia.empresaId, COMPANY); assert.equal(q.where.empresaId_dia.dia.toISOString(), '2026-11-27T00:00:00.000Z'); assert.deepEqual(plain(q.select), { puntos: true, createdAt: true })
    assert.match(render(view), /resumen guardado/); assert.match(render(view), /Dato realmente guardado/); assert.equal(f.writes.length, 0)
  })
  await test('cache ausente/error/corrupta/con costes: fallback local, no proveedores ni fallos de ficha', async () => {
    for (const o of [{ cacheError: true }, { cache: { puntos: 'texto' } }, { cache: { puntos: [] } }, { cache: { puntos: [7] } }, { cache: { puntos: ['El margen es 20'] } }, { cache: { puntos: [' '] } }]) {
      const f = await fixture(o).read(); assert.equal(f.resumen.origen, 'local'); assert.ok(f.resumen.puntos.length)
    }
    const model = fixture().model
    assert.equal(model.puntosResumenGuardado(['coste oculto']), null)
    assert.deepEqual(plain(model.puntosResumenGuardado(['Escribir a persona@example.invalid o 600 000 000'])), ['Escribir a [correo] o [teléfono]'])
  })
  for (const type of ['NOTA', 'LLAMADA', 'REUNION']) await test(`${type} POST empresa sin persona → recarga lector → último contacto KPI y UI`, async () => {
    const f = fixture(); const before = await f.read(); assert.equal(before.kpis.find((k: any) => k.etiqueta === 'Último contacto').valor, 'sin dato')
    const r = await f.post({ type, ...(type === 'LLAMADA' ? { direction: 'SALIENTE', result: 'CONTACTADO' } : {}) })
    assert.equal(r.status, 200); assert.equal(r.data.success, true); assert.equal(f.writes[0].empresaId, COMPANY); assert.equal(f.writes[0].contactoId, null); assert.equal(f.writes[0].metadatos.ambito, 'EMPRESA'); assert.equal(f.writes[0].origen, 'LOCAL')
    const view = await f.read(), k = view.kpis.find((k: any) => k.etiqueta === 'Último contacto')
    assert.equal(k.valor, 'hoy'); assert.match(k.sub, /Empresa sola/); assert.doesNotMatch(k.sub, /sin dato/); assert.ok(render(view).includes(k.sub))
    assert.equal(view.eventos[0].contactoId, null); assert.equal(view.personas.length, 0)
    assert.equal((await f.post({ type, ...(type === 'LLAMADA' ? { direction: 'SALIENTE', result: 'CONTACTADO' } : {}) })).data.duplicate, true); assert.equal(f.writes.length, 1)
  })
  await test('TAREA local no acredita último contacto ni borra contacto anterior; personas también excluyen tareas', async () => {
    const old = { id: 'old', empresaId: COMPANY, contactoId: 'persona-fixture', contacto: { nombre: 'Persona' }, tipo: 'LLAMADA', origen: 'LOCAL', metadatos: {}, fechaActividad: new Date('2026-11-20T10:00:00Z'), direccion: 'SALIENTE' }
    const f = fixture({ person: true, activities: [old] }); assert.equal((await f.post({ type: 'TAREA', followUp: { dueAt: '2026-11-28T10:00:00Z' } })).status, 200)
    const v = await f.read(); assert.equal(v.kpis.find((k: any) => k.etiqueta === 'Último contacto').sub, 'llamada · Persona'); assert.match(v.personas[0].ultimo, /^Llamada /)
    f.rows[0].contactoId = 'persona-fixture'; assert.match((await f.read()).personas[0].ultimo, /^Llamada /)
    const solo = fixture(); await solo.post({ type: 'TAREA', followUp: { dueAt: '2026-11-28T10:00:00Z' } }); assert.equal((await solo.read()).kpis.find((k: any) => k.etiqueta === 'Último contacto').valor, 'sin dato')
  })
  await test('nota ajena/importada/sin ámbito no se eleva a contacto; contrato legado de comunicaciones preservado', () => {
    const m = fixture().model
    for (const a of [{ tipo: 'NOTA', origen: 'HUBSPOT', empresaId: COMPANY, metadatos: { ambito: 'EMPRESA' } }, { tipo: 'NOTA', origen: 'LOCAL', metadatos: { ambito: 'EMPRESA' } }, { tipo: 'NOTA', origen: 'LOCAL', empresaId: COMPANY, metadatos: {} }, { tipo: 'TAREA', origen: 'LOCAL', empresaId: COMPANY, metadatos: { ambito: 'EMPRESA' } }]) assert.equal(m.cuentaComoContactoFicha(a), false)
    for (const tipo of ['CORREO', 'REUNION', 'LLAMADA', 'WHATSAPP', 'SMS']) assert.equal(m.cuentaComoContactoFicha({ tipo }), true)
  })
  await test('auth viva/mutación, noacting y readonly existentes deniegan antes de escritura', async () => {
    for (const o of [{ session: null }, { permission: false }, { authorId: 8 }, { session: { user: { id: '7', userType: 'admin' }, impersonation: {} } }, { env: { IO_PRODUCTION_READ_ONLY: '1' } }, { env: { FINANCE_DEPLOYMENT_READ_ONLY: '1' } }, { env: { FINANCE_STAGING_SANDBOX: '1' } }]) { const f = fixture(o); assert.ok((await f.post()).status >= 400); assert.equal(f.writes.length, 0); assert.equal(f.reads.length, 0) }
  })
  await test('M365 duro: correo/Graph/invitaciones externos no se degradan a éxito local', async () => {
    for (const extra of [{ type: 'CORREO' }, { syncOutlook: true }, { viaOutlook: true }, { onlineMeeting: true }, { inviteAttendees: true }, { prepareExternalChannel: true }]) { const f = fixture(); const r = await f.post(extra); assert.equal(r.status, 503); assert.equal(r.data.code, 'M365_LEGACY_PENDING'); assert.equal(f.writes.length, 0) }
  })
  await test('UI local/guardado: SSR y efectos sin GET IA incluso con apertura preexistente o cierre posterior', async () => {
    for (const o of [{}, { cache: { puntos: ['Cache conservada'], createdAt: NOW } }]) for (const gate of [closed, open, { ...open, envios: false }, { ...open, m365: false }]) {
      const v = await fixture(o).read(), h = harness(v, gate); h.hooks.flush(); await settle(); h.render(); assert.equal(h.calls.length, 0); assert.ok(h.all.some((n: any) => n.props.id === 'aiSum' && text(n).includes(v.resumen.puntos[0])))
      h.update({ envios: false, m365: false }); h.hooks.flush(); h.render(); assert.equal(h.calls.length, 0); assert.ok(text(h.find((n: any) => n.props.id === 'aiSum')).includes(v.resumen.puntos[0]))
    }
  })
  await test('UI cerrada oculta salidas, conserva controles locales y callbacks viejos no abren IA/correo', async () => {
    const v = await fixture().read(), html = render(v); assert.doesNotMatch(html, /data-open="mail"|data-open="ai"|Envio pendiente de activar/)
    const h = harness(v, open), callbacks = h.all.filter((n: any) => n.type === 'button' && ['mail', 'ai'].includes(n.props['data-open'])).map((n: any) => n.props.onClick)
    h.update({ envios: false, m365: false }); callbacks.forEach((fn: any) => fn()); h.hooks.flush(); await settle(); h.render(); assert.equal(h.calls.length, 0); assert.ok(!h.all.some((n: any) => n.type?.name === 'Drawer'))
    for (const label of ['Nota', 'Llamada', 'Tarea', 'Nueva reunión']) assert.ok(html.includes(label))
  })
  for (const [label, type] of [['Nota', 'NOTA'], ['Llamada', 'LLAMADA'], ['Tarea', 'TAREA']]) await test(`UI ${label} empresa sin persona mantiene POST local bajo cierre; resumen no dispara fetch`, async () => {
    const h = harness(await fixture().read()); h.button(label).props.onClick(); h.render(); h.find((n: any) => n.type === 'textarea').props.onChange({ target: { value: 'Actividad solo empresa' } }); h.render(); h.hooks.flush(); await h.button('Guardar').props.onClick(); await settle(); h.render()
    assert.equal(h.calls.length, 1); assert.equal(h.calls[0].body.type, type); assert.equal(h.calls[0].body.contactId, null); assert.equal(h.calls[0].body.action, 'registrar_actividad'); assert.equal(h.reloads, 1)
  })
  await test('UI reunión local sin personas guarda sin Outlook/Teams/invitaciones; elección Outlook cerrada no envía', async () => {
    const v = await fixture().read(), h = harness(v, closed, true)
    await h.button('Crear reunión').props.onClick(); await settle(); assert.equal(h.calls.length, 1); const b = h.calls[0].body; assert.equal(b.type, 'REUNION'); assert.deepEqual(b.contactIds, []); assert.equal(b.syncOutlook, false); assert.equal(b.onlineMeeting, false); assert.equal(b.inviteAttendees, false)
    const retained = harness(v, closed, true); retained.find((n: any) => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); retained.render(); await retained.button('Crear reunión').props.onClick(); assert.equal(retained.calls.length, 0)
  })
  await test('payload legacy cerrado: sin resumen muestra sin dato, nunca aviso de envío ni GET IA', async () => {
    const v = await fixture().read(); delete v.resumen; const h = harness(v); h.hooks.flush(); await settle(); h.render(); assert.equal(h.calls.length, 0); assert.match(text(h.find((n: any) => n.props.id === 'aiSum')), /sin dato/); assert.doesNotMatch(render(v), /Envio pendiente/)
  })
  await test('GET legacy retenido conserva aborto/cierre; resumen local nuevo prevalece sobre respuesta vieja', async () => {
    const v = await fixture().read(), old = { ...v }; delete old.resumen; const h = harness(old, open, false, true); h.hooks.flush(); assert.equal(h.calls.length, 1)
    h.props.ficha = v; h.update({ envios: false }); h.hooks.flush(); assert.equal(h.calls[0].init.signal.aborted, true)
    h.deferred[0]({ ok: true, json: async () => ({ puntos: ['RESPUESTA_ANTIGUA_NO_MOSTRAR'] }) }); await settle(); h.render(); assert.doesNotMatch(text(h.find((n: any) => n.props.id === 'aiSum')), /RESPUESTA_ANTIGUA/)
  })
  assert.equal(forbidden, 0)
  console.log(`PASS ${passed} pruebas; BD/HTTP/Graph/OpenAI/proveedores reales: 0`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
