/** ISP origen · lectores/API/editor reales en VM y SSR. Sin Prisma real, SQL, env, HTTP ni proveedores.
 * env -i PATH="$PATH" HOME=/home/ubuntu node_modules/.bin/tsx scripts/test-tanda3-isp-origen-ficha.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const local = createRequire(import.meta.url)
const { transformSync } = createRequire(local.resolve('tsx/package.json'))('esbuild')
let forbidden = 0, passed = 0
const plain = (v: any) => JSON.parse(JSON.stringify(v))
function execute(file: string, deps: Record<string, any> = {}, env: Record<string, string> = {}, globals: Record<string, any> = {}) {
  const module = { exports: {} as any }
  const code = transformSync(readFileSync(file, 'utf8'), { loader: file.endsWith('.tsx') ? 'tsx' : 'ts', jsx: 'automatic', format: 'cjs', target: 'es2022', platform: 'node' }).code
  runInNewContext(code, { module, exports: module.exports, console, Date, Intl, Request, Response, Headers, AbortController, URLSearchParams, process: { env },
    fetch() { forbidden++; throw Error('EXTERNO_PROHIBIDO') }, ...globals,
    require(id: string) { assert.ok(Object.hasOwn(deps, id), `${file}: import no autorizado ${id}`); return deps[id] },
  }, { filename: `${file}:memory`, timeout: 5000 })
  return module.exports
}
const policy = execute('lib/isp-origen-policy.ts')
const identity = execute('lib/area1-isp-identidad.ts', { './isp-origen-policy': policy })
const server = execute('lib/isp-origen-server.ts', { './isp-origen-policy': policy, 'node:async_hooks': { AsyncLocalStorage } })
const fields = execute('lib/crm-empresas.ts', { '@prisma/client': { SegmentoCrm: {} } })
const m365 = execute('lib/area1-m365.ts')
const legacy = execute('lib/m365-legacy-policy.ts')
const ID = 'empresa-fixture', NOW = new Date('2026-11-26T23:23:00Z')
const baseCompany = () => ({ id: ID, activo: true, nombre: 'Nombre CRM conservado', nombreComercial: 'Alias local', nif: 'B11111111', nifNormalizado: 'B11111111', version: 3, tipo: 'SOCIEDAD', segmentoCrm: 'EMPRESA', origen: 'LOCAL', sector: 'Sector local', contactos: [], clientes: [], _count: { contactos: 0, clientes: 0 }, updatedAt: NOW })
const account = (overrides: any = {}) => ({ id: 's1', ispClienteId: 'isp-1', codigo: '99', nombre: 'Razón ISP real', cif: 'B22222222', nif: null, docNormalizado: 'B22222222', crmEmpresaId: ID, clienteWebId: null, fechaInicio: new Date('2020-03-01T00:00:00Z'), fechaFin: null, presenteEnUltimoFichero: true, ultimaImportacionId: 'carga-memory', comercial: 2, contratos: [{ id: 'k1', codigoContratoIsp: '44', estado: 'ALTA', activo: true, fechaBaja: null, importeSinIva: 100, tarifa: 'Fibra', descripcion: 'Sede', periodicidad: 'mensual', formaPago: 'DOMICILIADO', presenteEnUltimoFichero: true }], ...overrides })
const web = (overrides: any = {}) => ({ id: 7, ispGestionId: '701', clienteIdIsp: 'customer701', codigo: '14', nombre: 'Cuenta legacy ISP', cif: 'B33333333', nif: null, activo: true, fechaAlta: new Date('2019-01-01T00:00:00Z'), fechaBaja: null, formaPago: 'DOMICILIADO', ...overrides })
function matches(row: any, where: any): boolean {
  if (!where) return true
  return Object.entries(where).every(([k, v]: any) => k === 'OR' ? v.some((w: any) => matches(row, w)) : k === 'AND' ? v.every((w: any) => matches(row, w))
    : v && typeof v === 'object' ? ('in' in v ? v.in.includes(row[k]) : 'not' in v ? row[k] !== v.not : true) : row[k] === v)
}
function fixture(o: any = {}) {
  const company: any = { ...baseCompany(), ...(o.company || {}) }, isp = o.isp ?? [account()], clientes = o.web ?? []
  const links = o.links ?? clientes.map((c: any) => ({ empresaId: ID, clienteId: c.id, origen: 'MANUAL', cliente: c }))
  company.clientes = links
  const confirmed = o.vinculos ?? [], writes: any[] = [], reads: any[] = []
  const read = (name: string, rows: any[]) => ({ findMany: async (q: any) => { reads.push({ name, q }); if (o.readError === name) throw Error('READ_FAILURE'); return rows.filter(r => matches(r, q.where)) } })
  const empty = { findMany: async () => [] }
  const db: any = {
    crmEmpresa: { ...read('crmEmpresa', [company]), findUnique: async () => company, findFirst: async (q: any) => matches(company, q.where) ? company : null,
      updateMany: async (args: any) => server.guardPrismaIspOrigenMutation({ model: 'CrmEmpresa', action: 'updateMany', args, runInTransaction: true }, async () => { writes.push(args.data); return { count: 1 } }, { db }) },
    ispClienteArea1: read('ispClienteArea1', isp), crmEmpresaCliente: read('crmEmpresaCliente', links), clienteWeb: read('clienteWeb', clientes), ispVinculoArea1: read('ispVinculoArea1', confirmed),
    usuarioAdmin: { findUnique: async () => ({ activo: o.actorActive !== false, rol: 'GERENTE' }) },
    factura: { findMany: async () => [{ id: 'f1', numeroDocumento: 'F-1', fecha: new Date('2026-10-05T00:00:00Z'), base: 100, total: 121, totalPendiente: 21, situacion: 'PENDIENTE' }] },
    crmActividad: { findMany: async () => o.actividades || [] }, crmTarea: empty, crmEmpresaContacto: { count: async () => 1, updateMany: async (q: any) => writes.push(q) },
    area1CrmNegocio: empty, area1CrmConsentimiento: empty, crmNegocioContacto: empty, area1CrmPipeline: empty, devolucionRemesa: empty,
    area1CrmFichaIa: { findUnique: async () => null },
    $queryRaw: async (s: TemplateStringsArray, ...values: unknown[]) => {
      const sql = s.join('?'); assert.match(sql, /^SELECT /); assert.doesNotMatch(sql, /INSERT|DELETE|ALTER|DROP/)
      if (sql.includes('hashtextextended')) {
        assert.equal(sql, 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))::text AS locked')
        assert.deepEqual(values, ['isp-origen:ownership:v1'])
      }
      reads.push({ sql }); return sql.includes('FROM crm_empresas') ? [company] : []
    },
    $transaction: async (fn: any, options: any) => {
      assert.equal(options.isolationLevel, 'Serializable'); const before = writes.length
      try { return await server.runWithIspPrismaTransaction(db, () => fn(db)) } catch (e) { writes.splice(before); throw e }
    },
  }
  const reader = execute('lib/area1-ficha-cliente.ts', { './prisma': { __esModule: true, default: db }, './area1-isp-identidad': identity,
    './area1-subida-cliente': { leerSubidaCliente: async () => null },
    './area1-ficha-rentabilidad': { normalizarCodigoFicha: (s: string) => s, leerRentabilidadFicha: async () => ({ rentabilidad: null, margenContrato: new Map(), margenUltimo: { mes: '2026-10', pct: 20, margen: 20, hayEstimados: true, costeEstimado: 47 } }) },
  })
  const session = o.session === undefined ? { user: { id: '7', userType: 'admin' } } : o.session
  const route = execute('app/api/admin/crm/empresas/[id]/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@prisma/client': { SegmentoCrm: {}, Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } },
    'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { __esModule: true, default: db },
    '@/lib/crm-empresas': fields, '@/lib/crm-empresa-actividad': { registrarActividadEmpresa: () => { throw Error('POST_ACTIVITY_OUT_OF_SCOPE') } },
    '@/lib/crm-empresas-auth': { authorizeCrmEmpresas: async () => ({ user: o.acl === false ? null : { id: 7, name: 'Autor vivo' }, status: 403 }) },
    '@/lib/area1-m365': m365, '@/lib/area1-isp-identidad': identity, '@/lib/isp-origen-server': server,
    '@/lib/permisos': { verificarPermisoServer: async (_id: number, _area: string, _role: string, tx: any) => { assert.equal(tx, db); return { escritura: o.txAcl !== false } } },
  }, o.env || {})
  return { company, isp, links, db, writes, reads, read: (role = 'COMERCIAL') => reader.cargarFichaCliente(ID, role, NOW),
    async patch(extra: any) { const r = await route.PATCH(new Request('https://fixture.invalid/', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 3, ...extra }) }), { params: Promise.resolve({ id: ID }) }); return { status: r.status, data: await r.json() } },
    async get() { const r = await route.GET(new Request('https://fixture.invalid/'), { params: Promise.resolve({ id: ID }) }); return { status: r.status, data: await r.json() } },
  }
}
const icons = { MagnifyingGlassIcon: () => null }
const form = execute('components/admin/CrmCompanyForm.tsx', { react: local('react'), 'react/jsx-runtime': local('react/jsx-runtime'), 'next/navigation': { useRouter: () => ({ refresh() {}, push() {} }) }, '@heroicons/react/24/outline': icons, './RoleContext': { useRole: () => ({ isSuperAdmin: true, hasAreaAccess: () => true }) } })
const ui = execute('components/admin/FichaCliente.tsx', { react: local('react'), 'react/jsx-runtime': local('react/jsx-runtime'), '@/lib/m365-legacy-policy': legacy })
const render = (f: any) => renderToStaticMarkup(createElement(ui.default, { ficha: f, puedeEscribir: true, m365: { conexion: { enabled: false, connected: false, email: null, m365: false, envios: false }, aviso: null, corporativo: 'test@example.invalid', connectUrl: '/fixture' } }))
async function test(name: string, fn: () => any) { await fn(); passed++; console.log(`OK ${name}`) }
async function main() {
  await test('reader directo: razón/NIF de ISP prevalecen en aliases/IA, CRM conservado y aviso literal; sin writes', async () => {
    const h = fixture(), before = JSON.stringify(h.company), f = await h.read()
    assert.equal(f.empresa.nombre, 'Razón ISP real'); assert.equal(f.empresa.nif, 'B22222222'); assert.equal(f.contextoIa.cliente, 'Razón ISP real')
    assert.ok(f.datos.some(([k, v]: any) => k.includes('Razón social') && v === 'Razón ISP real'))
    assert.equal(f.identidadIsp.identidadCrm.nombre, h.company.nombre); assert.ok(f.avisos.some((a: any) => a.titulo === 'discrepancia con ISP'))
    assert.equal(JSON.stringify(h.company), before); assert.equal(h.writes.length, 0)
  })
  await test('legacy actual numérico + vínculo MANUAL/empresa LOCAL: fallback ISP, fecha alta y read-only', async () => {
    const h = fixture({ isp: [], web: [web()] }), f = await h.read()
    assert.equal(f.empresa.nombre, 'Cuenta legacy ISP'); assert.equal(f.empresa.nif, 'B33333333'); assert.equal(f.empresa.clienteDesde, '2019')
    assert.equal(f.empresa.vinculoIsp, 'vinculado'); assert.equal(f.identidadIsp.cuentas[0].fuente, 'legacy')
    assert.equal((await server.readIspEmpresaOwnership(h.db, ID)).linked, true)
  })
  await test('snapshot ligado por ClienteWeb manda sobre fallback; área1 acredita cuenta aunque marker no sea numérico', async () => {
    const h = fixture({ isp: [account({ crmEmpresaId: null, clienteWebId: 7 })], web: [web({ ispGestionId: 'unknown-synthetic' })] }), f = await h.read()
    assert.equal(f.empresa.nombre, 'Razón ISP real'); assert.equal(f.identidadIsp.cuentas.length, 1); assert.equal(f.empresa.vinculoIsp, 'vinculado')
  })
  await test('snapshot source nuevo por ispGestionId persistido, FKs humanos null: prevalece fiscal/contratos sobre legacy stale; mismo accountset guard', async () => {
    const source = account({ ispClienteId: '222', crmEmpresaId: null, clienteWebId: null, nombre: 'NEW ISP NAME', cif: 'B88888888', docNormalizado: 'B88888888', presenteEnUltimoFichero: false })
    const h = fixture({ isp: [source, account({ id: 'unrelated', ispClienteId: '333', crmEmpresaId: null, clienteWebId: null, nombre: 'Otra cuenta no ligada' })], web: [web({ ispGestionId: '222', nombre: 'STALE NATIVE NAME', cif: 'B99999999' })] })
    const before = JSON.stringify({ company: h.company, isp: h.isp }), f = await h.read(), ownership = await server.readIspEmpresaOwnership(h.db, ID)
    assert.equal(f.empresa.nombre, 'NEW ISP NAME'); assert.equal(f.empresa.nif, 'B88888888'); assert.equal(f.contextoIa.cliente, 'NEW ISP NAME')
    assert.deepEqual(plain(f.identidadIsp.cuentas.map((c: any) => c.id)), ['s1']); assert.deepEqual(plain(ownership.cuentas.map((c: any) => c.id)), ['s1'])
    assert.equal(f.identidadIsp.cuentas[0].fuente, 'area1'); assert.equal(f.identidadIsp.cuentas[0].clienteWebId, null); assert.equal(f.identidadIsp.protegida, true)
    assert.equal(f.contratos[0].codigo, '44'); assert.equal(f.kpis[0].valor, '100 €'); assert.ok(f.avisos.some((a: any) => a.titulo === 'Origen ISP histórico'))
    assert.ok(f.avisos.some((a: any) => a.titulo === 'discrepancia con ISP')); assert.doesNotMatch(render(f), /STALE NATIVE NAME|B99999999|Otra cuenta no ligada/)
    const query = h.reads.find((r: any) => r.name === 'ispClienteArea1' && r.q.include).q
    assert.ok(query.where.OR.some((w: any) => w.ispClienteId?.in?.includes('222'))); assert.doesNotMatch(JSON.stringify(query.where), /codigo|nombre|nif|cif|clienteIdIsp/)
    assert.equal(JSON.stringify({ company: h.company, isp: h.isp }), before); assert.equal(h.writes.length, 0)
    assert.equal((await h.get()).data.nombre, 'NEW ISP NAME'); assert.equal((await h.patch({ nombre: 'Cambio inadmisible', sector: 'No aplicar' })).status, 409); assert.equal(h.writes.length, 0)
  })
  await test('todas las cuentas realmente ligadas: nullFK source + directo + fallback ausente, ownership idéntico y múltiples identidades explícitas', async () => {
    const h = fixture({ isp: [account(), account({ id: 's2', ispClienteId: '702', crmEmpresaId: null, clienteWebId: null, codigo: '02', nombre: 'Segunda source', cif: 'B44444444', docNormalizado: 'B44444444' })], web: [web({ id: 8, ispGestionId: '702', nombre: 'Legacy segundo stale' }), web({ id: 9, ispGestionId: '703', nombre: 'Fallback tercero', codigo: '03' })] })
    const f = await h.read(), ownership = await server.readIspEmpresaOwnership(h.db, ID)
    assert.deepEqual(plain(f.identidadIsp.cuentas.map((c: any) => c.id).sort()), plain(ownership.cuentas.map((c: any) => c.fuente === 'LEGACY' ? `legacy:${c.id}` : c.id).sort()))
    assert.deepEqual(plain(f.identidadIsp.cuentas.map((c: any) => c.id).sort()), ['legacy:9', 's1', 's2'])
    assert.equal(f.empresa.nombre, 'Varias identidades ISP'); assert.equal(f.empresa.nif, null); assert.equal(f.identidadIsp.primariaId, 's1'); assert.equal(f.identidadIsp.protegida, true)
    const html = render(f); for (const text of ['Razón ISP real', 'Segunda source', 'Fallback tercero']) assert.ok(html.includes(text), text)
    assert.ok(!html.includes('Legacy segundo stale')); assert.equal(f.contratos.length, 2); assert.equal((await h.patch({ nif: null })).status, 409); assert.equal(h.writes.length, 0)
    const onlyNullFk = fixture({ isp: [account({ ispClienteId: '702', crmEmpresaId: null, clienteWebId: null })], web: [web({ ispGestionId: '702' })] })
    assert.equal((await onlyNullFk.read()).identidadIsp.protegida, true); assert.equal((await onlyNullFk.patch({ nombre: 'No editable' })).status, 409); assert.equal(onlyNullFk.writes.length, 0)
  })
  await test('clave alternativa/marker arbitrario/relación contradictoria no acreditan source ni unen por fiscal/código/nombre', async () => {
    const c = web(), unrelated = account({ crmEmpresaId: null, clienteWebId: null, ispClienteId: c.clienteIdIsp, codigo: c.codigo, nombre: c.nombre, cif: c.cif, docNormalizado: c.cif })
    const h = fixture({ isp: [unrelated], web: [c] }), f = await h.read()
    assert.equal(f.identidadIsp.cuentas[0].id, 'legacy:7'); assert.equal(f.contratos.length, 0); assert.equal(f.empresa.nombre, c.nombre)
    const unknown = fixture({ isp: [account({ ispClienteId: 'arbitrary', crmEmpresaId: null, clienteWebId: null })], web: [web({ ispGestionId: 'arbitrary' })] })
    assert.equal((await unknown.read()).identidadIsp.estadoLectura, 'ORIGEN_NO_VERIFICABLE'); assert.equal(unknown.writes.length, 0)
    const invalid = fixture({ isp: [], web: [c], links: [{ empresaId: ID, clienteId: c.id, cliente: { ...c, id: c.id + 1 } }] })
    assert.equal((await invalid.read()).identidadIsp.estadoLectura, 'ORIGEN_NO_VERIFICABLE'); assert.equal(invalid.writes.length, 0)
  })
  await test('manual UUID vinculado no se eleva a ISP; identidad CRM editable, source values no financieros', async () => {
    const h = fixture({ isp: [], web: [web({ ispGestionId: 'manual-00000000-0000-4000-8000-000000000000', clienteIdIsp: null })] }), f = await h.read()
    assert.equal(f.empresa.nombre, h.company.nombre); assert.equal(f.identidadIsp.protegida, false); assert.equal(f.empresa.codigoIsp, null)
    assert.equal(f.facturacion.hayFacturas, false); assert.equal((await server.readIspEmpresaOwnership(h.db, ID)).linked, false)
  })
  await test('unknown marker/error no equivalen a prospecto local; failclosed UI y PATCH', async () => {
    for (const o of [{ isp: [], web: [web({ ispGestionId: 'fake-source' })] }, { readError: 'ispClienteArea1' }]) {
      const h = fixture(o), f = await h.read(); assert.equal(f.identidadIsp.estadoLectura, 'ORIGEN_NO_VERIFICABLE'); assert.equal(f.identidadIsp.protegida, true)
      const r = await h.patch({ nombre: 'Intento falso', sector: 'No aplicar' }); assert.equal(r.status, 409); assert.equal(r.data.code, 'ISP_ORIGEN_NO_EDITABLE'); assert.equal(h.writes.length, 0)
    }
  })
  await test('pending y similitud nombre/NIF no crean ownership; confirmado sólo si enlace efectivo', async () => {
    const pending = { ispClienteRowId: 's1', destinoId: ID, tipo: 'CRM_EMPRESA', estado: 'PENDIENTE' }
    const h = fixture({ isp: [account({ crmEmpresaId: 'otra-empresa', nombre: baseCompany().nombre, cif: baseCompany().nif })], vinculos: [pending] })
    assert.equal((await h.read()).identidadIsp.protegida, false)
    const valid = fixture({ vinculos: [{ ...pending, estado: 'CONFIRMADO' }] }); assert.equal((await valid.read()).empresa.vinculoIsp, 'vinculado')
    const stale = fixture({ isp: [], vinculos: [{ ...pending, estado: 'CONFIRMADO' }] }); assert.equal((await stale.read()).identidadIsp.estadoLectura, 'ORIGEN_NO_VERIFICABLE')
  })
  await test('múltiples identidades: no primero lexicográfico; principal directo trazable, todas cuentas en SSR', async () => {
    const h = fixture({ isp: [account({ id: 'legacy-s', ispClienteId: 'i2', codigo: '01', nombre: 'Otra razón fiscal', cif: 'B44444444', docNormalizado: 'B44444444', crmEmpresaId: null, clienteWebId: 7 }), account()], web: [web()] }), f = await h.read()
    assert.equal(f.empresa.nombre, 'Varias identidades ISP'); assert.equal(f.empresa.nif, null); assert.equal(f.identidadIsp.primariaId, 's1'); assert.equal(f.identidadIsp.cuentas.length, 2)
    const html = render(f); for (const text of ['Otra razón fiscal', 'Razón ISP real', 'Cuenta 01 de ISP', 'Cuenta 99 de ISP', 'discrepancia con ISP']) assert.ok(html.includes(text), text)
    assert.equal(h.writes.length, 0)
  })
  await test('identidades raw iguales comparten cabecera; variantes de formato no eligen raw arbitrario', async () => {
    const common = fixture({ isp: [account(), account({ id: 's2', ispClienteId: 'isp2', codigo: '01' })] }); assert.equal((await common.read()).empresa.nombre, 'Razón ISP real')
    const variant = fixture({ isp: [account(), account({ id: 's2', ispClienteId: 'isp2', nombre: 'RAZÓN ISP REAL' })] }); assert.equal((await variant.read()).empresa.nombre, 'Varias identidades ISP')
  })
  await test('CIF/NIF contradictorios: no cif||nif silencioso, todos raw visibles y fiscal no inventado', async () => {
    const h = fixture({ isp: [account({ nif: 'B55555555' })] }), f = await h.read()
    assert.equal(f.empresa.nif, null); assert.equal(f.identidadIsp.cuentas[0].conflictoDocumento, true)
    const html = render(f); assert.ok(html.includes('B22222222') && html.includes('B55555555')); assert.match(html, /CIF\/NIF\/documento contradictorios/)
    const missing = fixture({ isp: [account({ cif: null, nif: null, docNormalizado: null })] }); assert.equal((await missing.read()).empresa.nif, null)
  })
  await test('snapshot ausente preserva identidad/protección, advierte periodicidad sin cambiar cuota/saldos', async () => {
    const source = account({ presenteEnUltimoFichero: false }); source.contratos[0].periodicidad = 'anual'
    const h = fixture({ isp: [source] }), f = await h.read()
    assert.equal(f.empresa.nombre, 'Razón ISP real'); assert.equal(f.kpis[0].valor, '100 €'); assert.equal(f.facturacion.cobrado, 100); assert.equal(f.facturacion.pendiente, 21)
    assert.ok(f.avisos.some((a: any) => a.titulo === 'Periodicidad de ISP')); assert.ok(f.avisos.some((a: any) => a.titulo === 'Origen ISP histórico'))
    assert.match(render(f), /no acredita cobro bancario/); assert.equal(h.writes.length, 0)
  })
  await test('resumen local y último contacto nativo se conservan bajo M365 cerrado, TAREA excluida', async () => {
    const a = { id: 'a1', empresaId: ID, contactoId: null, tipo: 'NOTA', origen: 'LOCAL', metadatos: { ambito: 'EMPRESA' }, fechaActividad: NOW, descripcion: 'Nota empresarial', titulo: 'Nota', direccion: null }
    const h = fixture({ actividades: [{ ...a, id: 'task', tipo: 'TAREA' }, a] }), f = await h.read('GERENTE')
    assert.equal(f.resumen.origen, 'local'); assert.ok(f.resumen.puntos.length); assert.equal(f.kpis.find((k: any) => k.etiqueta === 'Último contacto').sub, `nota · ${h.company.nombre}`)
    assert.equal(f.kpis.find((k: any) => k.etiqueta === 'Margen octubre 2026').sub, 'incluye 47 € de coste estimado'); assert.ok(render(f).includes('resumen local'))
  })
  await test('GET actual devuelve ISP preferido y CRM preservado, no writes/calls externos', async () => {
    for (const o of [{}, { isp: [], web: [web()] }, { isp: [] }]) {
      const h = fixture(o), r = await h.get(); assert.equal(r.status, 200); assert.equal(r.data.nombre, (await h.read()).empresa.nombre); assert.equal(r.data.identidadIsp.identidadCrm.nombre, h.company.nombre); assert.equal(h.writes.length, 0)
    }
  })
  for (const o of [{}, { isp: [], web: [web()] }]) await test(`PATCH ${o.web ? 'legacy' : 'directo'}: cambio efectivo/mixed íntegro rejected typed409 sin PII ni write`, async () => {
    for (const change of [{ nombre: 'OTRO NOMBRE PII' }, { nif: 'B66666666' }, { nif: null }, { nombre: 'CAMBIO PII', sector: 'No aplicar' }, { nombre: ' Nombre CRM conservado ' }]) {
      const h = fixture(o), r = await h.patch(change); assert.equal(r.status, 409); assert.equal(r.data.code, 'ISP_ORIGEN_NO_EDITABLE'); assert.equal(h.writes.length, 0); assert.doesNotMatch(JSON.stringify(r.data), /OTRO NOMBRE|CAMBIO PII|B66666666|B11111111/)
    }
  })
  await test('PATCH protegido unchanged raw omite aliases; permite sector y nombreComercial local', async () => {
    const h = fixture(), r = await h.patch({ nombre: h.company.nombre, nif: h.company.nif, nombreComercial: 'Alias nuevo', sector: 'Tecnología' })
    assert.equal(r.status, 200); assert.equal(h.writes.length, 1); assert.equal(h.writes[0].sector, 'Tecnología'); assert.equal(h.writes[0].nombreComercial, 'Alias nuevo')
    for (const k of ['nombre', 'nif', 'nifNormalizado']) assert.ok(!Object.hasOwn(h.writes[0], k))
    const noop = fixture(); assert.equal((await noop.patch({ nombre: noop.company.nombre, nif: noop.company.nif })).status, 200); assert.equal(noop.writes.length, 0)
  })
  await test('PATCH mismo NIF raw con nifNormalizado histórico discrepante no repara ni rechaza panel', async () => {
    const h = fixture({ company: { nifNormalizado: null } })
    const r = await h.patch({ nif: h.company.nif, sector: 'Permitido' }); assert.equal(r.status, 200); assert.equal(h.writes[0].sector, 'Permitido'); assert.ok(!Object.hasOwn(h.writes[0], 'nifNormalizado'))
  })
  await test('PATCH local sin ISP permite razón/NIF; no source flag/version/origen bypass', async () => {
    const h = fixture({ isp: [] }), r = await h.patch({ nombre: 'Nueva sociedad local', nif: 'B77777777' }); assert.equal(r.status, 200); assert.equal(h.writes[0].nombre, 'Nueva sociedad local')
    for (const key of ['razonSocial', 'codigo', 'nifNormalizado', 'allowIsp', 'skipGuard', 'source', 'origen', 'identidadIsp', 'ispClientesArea1']) {
      const f = fixture(); assert.equal((await f.patch({ [key]: true, sector: 'No aplicar' })).status, 400); assert.equal(f.writes.length, 0)
    }
    const v0 = fixture({ company: { version: 0 } }); assert.equal((await v0.patch({ version: 0, nif: 'B77777777' })).status, 409)
  })
  await test('PATCH ACL viva tx/sesión/noacting/readonly/version intactos; deniegan antes de business writes', async () => {
    for (const o of [{ acl: false }, { txAcl: false }, { actorActive: false }, { session: null }, { session: { user: { id: '7', userType: 'admin' }, impersonation: {} } }, { env: { IO_PRODUCTION_READ_ONLY: '1' } }, { env: { FINANCE_DEPLOYMENT_READ_ONLY: '1' } }]) {
      const h = fixture(o); assert.ok((await h.patch({ sector: 'Prohibido' })).status >= 400); assert.equal(h.writes.length, 0)
    }
    const h = fixture(); assert.equal((await h.patch({ version: 2, sector: 'Prohibido' })).status, 409); assert.equal(h.writes.length, 0)
  })
  await test('SSR editor: razón/NIF de ISP disabled + label, local nombreComercial/sector editable', async () => {
    const h = fixture(), f = await h.read(), initial = { ...form.EMPTY_COMPANY, nombre: f.empresa.nombre, nif: f.empresa.nif, nombreComercial: 'Alias local', identidadIsp: f.identidadIsp }
    const html = renderToStaticMarkup(createElement(form.default, { initial, companyId: ID, version: 3 }))
    assert.equal((html.match(/<input[^>]*disabled=""/g) || []).length, 2); assert.match(html, /de ISP, solo lectura/); assert.ok(html.includes('Datos CRM conservados'))
    assert.ok(!/<input[^>]*value="Alias local"[^>]*disabled/.test(html)); assert.match(html, /Sector/)
    const localHtml = renderToStaticMarkup(createElement(form.default, { initial: form.EMPTY_COMPANY, companyId: ID, version: 3 })); assert.ok(!localHtml.includes('disabled=""'))
  })
  await test('editor payload real sólo fields changed locales; no metadata/workspace aliases/readonly en body', async () => {
    const f = await fixture().read(), initial = { ...form.EMPTY_COMPANY, nombre: f.empresa.nombre, nif: f.empresa.nif, identidadIsp: f.identidadIsp, id: ID, version: 3, origen: 'ISP' }
    assert.deepEqual(plain(form.companyFormPayload({ ...initial, nombre: 'Intento visual', nif: 'B77777777', sector: 'Tecnología', nombreComercial: 'Alias nuevo' }, initial, true)), { nombreComercial: 'Alias nuevo', sector: 'Tecnología' })
    assert.deepEqual(plain(form.companyFormPayload({ ...form.EMPTY_COMPANY, nombre: 'Prospecto' }, form.EMPTY_COMPANY, true)), { nombre: 'Prospecto' })
  })
  await test('page ?editar=1 real: props del workspace ISP preferidos + política metadata sin writes de origen', async () => {
    const h = fixture(); const jsx = (type: any, props: any) => ({ type, props })
    const deps: any = {
      'next/navigation': { notFound() { throw Error('NOT_FOUND') } }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' }, '@/lib/prisma': { __esModule: true, default: h.db },
      '@/lib/permisos': { registrarArea: async () => undefined, verificarPermisoServer: async () => ({ escritura: true }) },
      '@/lib/admin-area-auth': { requireAdminAreaRead: async () => ({ user: { id: '7', role: 'GERENTE' } }) },
      '@/lib/crm-empresas-auth': { canAccessCrmRelated: async () => true }, '@/lib/area1-isp-identidad': identity,
      '@/lib/area1-ficha-cliente': { cargarFichaCliente: async () => { throw Error('NEW_FICHA_NOT_IN_EDIT') } }, '@/lib/area1-crm-resumen-vista': { nivelDe: () => 'GERENTE' },
      '@/lib/area1-m365': { avisoAislamiento: () => null }, '@/lib/area1-puertas-produccion': { fichaNuevaHabilitada: () => true, fichaNuevaDisponibleParaRol: () => true },
      '@/lib/email': { getDefaultEmailSender: () => 'fixture@example.invalid' }, '@/lib/outlook-user-connection': { getOutlookConnectionStatus: async () => { throw Error('GRAPH_NOT_IN_EDIT') } },
      '@/components/io-ui/fonts': { ioFontClasses: '' }, '@/components/io-ui/io-ui.css': {}, './area1-ficha.css': {},
    }
    for (const name of ['CrmCompanyWorkspace', 'CrmCompanyContactsMore', 'CrmIspFichaResumen', 'FichaCliente']) deps[`@/components/admin/${name}`] = { __esModule: true, default: name }
    const page = execute('app/admin/crm/empresas/[id]/page.tsx', deps), tree = await page.default({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({ editar: '1' }) })
    const workspace = tree.props.children[0]
    assert.equal(workspace.props.company.nombre, 'Razón ISP real'); assert.equal(workspace.props.company.nif, 'B22222222'); assert.equal(workspace.props.company.nombreComercial, 'Alias local'); assert.equal(workspace.props.company.identidadIsp.protegida, true); assert.equal(h.writes.length, 0)
  })
  assert.equal(forbidden, 0)
  console.log(`PASS ${passed} · Fuentes reales VM/SSR + tx simulada. SQL/red/Graph/ISP reales: 0`)
}
main().catch(e => { console.error(e); process.exitCode = 1 })
