/** Fuentes reales ejecutadas en VM con imports allowlist. Nunca env, BD, HTTP ni proveedores reales. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
const req = createRequire(import.meta.url)
const { transformSync } = createRequire(req.resolve('tsx/package.json'))('esbuild')
let forbidden = 0, passed = 0
function load(file: string, deps: Record<string, any> = {}, env: Record<string, string> = {}) {
  const module = { exports: {} as any }
  runInNewContext(transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs', platform: 'node', target: 'es2022' }).code, {
    module, exports: module.exports, Request, Response, Headers, Date, URL, Intl, TextDecoder, console, process: { env },
    fetch() { forbidden++; throw Error('RED/PROVEEDORES PROHIBIDOS') },
    require(id: string) { assert.ok(Object.hasOwn(deps, id), `Import prohibido: ${file}: ${id}`); return deps[id] },
  }, { filename: file, timeout: 5000 })
  return module.exports
}
const core = load('lib/crm-empresa-actividad-core.ts')
const legacy = load('lib/m365-legacy-policy.ts')
const area1 = load('lib/area1-m365.ts')
const NOW = new Date('2026-11-26T10:00:00Z')
const body = (extra: any = {}) => ({ action: 'registrar_actividad', type: 'NOTA', description: 'Contenido local', clientRequestId: 'memory-request-123', ...extra })
async function test(name: string, fn: () => any) { await fn(); passed++; console.log(`OK ${name}`) }
function fixture(o: any = {}) {
  const rows: any[] = [], writes: any[] = [], reads: any[] = []
  const user = { id: 7, name: 'Autor memoria', role: 'GERENTE' }
  const session = o.session === undefined ? { user: { id: '7', userType: 'admin' } } : o.session
  const db: any = {
    crmEmpresa: { async findFirst({ where }: any) { reads.push('empresa'); return o.missing || where.id !== 'empresa-fixture' ? null : { id: where.id } } },
    crmEmpresaContacto: { async findMany({ where }: any) { reads.push({ linkWhere: where }); return o.badContacts ? [] : where.contactoId.in.map((contactoId: string) => ({ contactoId })) } },
    crmActividad: {
      async findUnique() { reads.push('existing'); return o.existing || rows[0] || null },
      async create({ data }: any) { writes.push(data); const a = { id: 'activity-memory', ...data }; rows.push(a); if (o.race) throw Object.assign(new Error('Unique'), { code: 'P2002' }); return a },
    },
    async $transaction(fn: any, options: any) { assert.equal(options.isolationLevel, 'Serializable'); if (o.rollback) throw Error('ROLLBACK'); return fn(db) },
  }
  const handler = load('lib/crm-empresa-actividad.ts', {
    'next-auth': { getServerSession: async () => session }, 'next/server': { NextResponse: { json: Response.json } },
    '@prisma/client': { Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } } }, 'node:crypto': { createHash },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { __esModule: true, default: db },
    '@/lib/crm-empresas-auth': { authorizeCrmEmpresas: async (write: boolean) => { assert.equal(write, true); return o.permission === false ? { status: 403, user: null } : { status: 200, user } },
      canAccessCrmRelated: async (u: any, area: string, write: boolean) => { assert.equal(u, user); assert.equal(area, 'admin.crm.contactos'); assert.equal(write, true); return o.contactPermission !== false } },
    '@/lib/area1-m365': area1, '@/lib/m365-legacy-policy': { ...legacy, m365LegacyLocalSandboxEnabled: () => o.sandboxAllowed === true }, '@/lib/crm-empresa-actividad-core': core,
  }, o.env || {})
  return { rows, writes, reads, async post(value: any, options: any = {}) {
    const request = new Request('https://memory.example.invalid/api/admin/crm/empresas/empresa-fixture', { method: 'POST', headers: { 'content-type': 'application/json', ...options.headers }, body: options.raw ?? JSON.stringify(value) })
    const r = await handler.registrarActividadEmpresa(request, { params: Promise.resolve({ id: options.id || 'empresa-fixture' }) })
    return { status: r.status, data: await r.json() }
  } }
}
async function main() {
  for (const type of ['NOTA', 'LLAMADA', 'TAREA', 'REUNION']) {
    await test(`${type} sin persona: guarda empresa nativa y autor; seguimiento atómico`, async () => {
      const f = fixture({ contactPermission: false })
      const r = await f.post(body({ type, ...(type === 'LLAMADA' ? { direction: 'SALIENTE', result: 'CONTACTADO' } : {}), ...(type === 'TAREA' ? { followUp: { dueAt: new Date(Date.now() + 86_400_000).toISOString(), priority: 'ALTA' } } : {}), syncOutlook: false }))
      assert.equal(r.status, 200); assert.equal(r.data.success, true); assert.equal(f.writes.length, 1)
      const d = f.writes[0]
      assert.equal(d.empresaId, 'empresa-fixture'); assert.equal(d.contactoId, null); assert.equal(d.contactos, undefined); assert.equal(d.origen, 'LOCAL'); assert.equal(d.creadoPorId, 7); assert.equal(d.creadoPorNombre, 'Autor memoria')
      if (type === 'TAREA') { assert.equal(d.tareaSeguimiento.create.empresaId, d.empresaId); assert.equal(d.tareaSeguimiento.create.contactoId, null); assert.equal(d.tareaSeguimiento.create.asignadoAId, 7) }
    })
  }
  await test('persona seleccionada: enlace activo empresa/persona y relaciones nativas', async () => {
    const f = fixture(); const r = await f.post(body({ contactId: 'persona-fixture', contactIds: ['persona-fixture', 'otra-persona'] }))
    assert.equal(r.status, 200); const d = f.writes[0]
    assert.equal(d.contactoId, 'persona-fixture'); assert.equal(d.empresaId, 'empresa-fixture'); assert.deepEqual(JSON.parse(JSON.stringify(d.contactos.create)), [{ contactoId: 'persona-fixture' }, { contactoId: 'otra-persona' }])
    const where = f.reads.find(x => typeof x === 'object').linkWhere
    assert.equal(where.empresaId, 'empresa-fixture'); assert.equal(where.activo, true); assert.equal(where.contacto.objectTypeId, '0-1')
  })
  for (const o of [{ session: null }, { session: { user: { id: '7', userType: 'cliente' } } }, { permission: false }, { session: { user: { id: '7', userType: 'admin' }, impersonation: {} } }, { env: { IO_PRODUCTION_READ_ONLY: '1' } }, { env: { FINANCE_DEPLOYMENT_READ_ONLY: '1' } }, { env: { FINANCE_STAGING_SANDBOX: '1' } }]) {
    await test(`auth/no actuación/readonly ${JSON.stringify(o)} sin escritura`, async () => { const f = fixture(o); assert.ok((await f.post(body())).status >= 400); assert.equal(f.writes.length, 0); assert.equal(f.reads.length, 0) })
  }
  for (const o of [{ contactPermission: false }, { badContacts: true }]) await test(`persona exige permiso y pertenencia ${JSON.stringify(o)}`, async () => { const f = fixture(o); assert.ok((await f.post(body({ contactId: 'persona-fixture' }))).status >= 400); assert.equal(f.writes.length, 0) })
  await test('empresa inexistente: no escritura', async () => { const f = fixture({ missing: true }); assert.equal((await f.post(body())).status, 404); assert.equal(f.writes.length, 0) })
  for (const extra of [{ type: 'CORREO' }, ...['syncOutlook', 'viaOutlook', 'prepareExternalChannel', 'onlineMeeting', 'inviteAttendees'].flatMap(k => [true, 'false', 0, null].map(v => ({ [k]: v })))]) await test(`M365/externo ambiguo ${JSON.stringify(extra)} cerrado incluso flags abiertos`, async () => {
    const f = fixture({ env: { M365_LEGACY_CRM_EXTERNAL_ENABLED: '1', M365_STAGING_CALENDARIO: '1' } })
    const r = await f.post(body(extra)); assert.equal(r.status, 503); assert.equal(r.data.code, 'M365_LEGACY_PENDING'); assert.equal(f.writes.length, 0); assert.equal(f.reads.length, 0)
  })
  for (const extra of [{ action: 'editar' }, { accion: 'confirmar' }, { type: 'WHATSAPP' }, { description: '' }, { clientRequestId: 'bad' }, { activityDate: 'fecha-no-valida' }, { durationMinutes: 10_081 }, { durationMinutes: true }, { type: 'LLAMADA', direction: 'OTRA', result: 'CONTACTADO' }, { type: 'LLAMADA', direction: 'ENTRANTE', result: 'OTRO_INVALIDO' }, { type: 'TAREA' }, { followUp: { dueAt: 'bad' } }, { contactIds: [1] }, { contactIds: Array(51).fill('c') }, { dealIds: ['deal'] }]) await test(`validación ${JSON.stringify(extra).slice(0, 100)} sin escritura`, async () => { const f = fixture(); assert.equal((await f.post(body(extra))).status, 400); assert.equal(f.writes.length, 0) })
  await test('JSON roto y tamaño real acotado sin content-length', async () => { const f = fixture(); assert.equal((await f.post(body(), { raw: '{broken' })).status, 400); assert.equal((await f.post(body({ padding: 'x'.repeat(17 * 1024) }))).status, 413); assert.equal(f.writes.length, 0) })
  await test('reintento idempotente local: una escritura; contenido distinto conflicto', async () => { const f = fixture(); assert.equal((await f.post(body())).status, 200); assert.equal((await f.post(body())).data.duplicate, true); assert.equal(f.writes.length, 1); assert.equal((await f.post(body({ description: 'Otro texto' }))).status, 409); assert.equal(f.writes.length, 1) })
  for (const existing of [{ empresaId: 'otra-empresa', creadoPorId: 7 }, { empresaId: 'empresa-fixture', creadoPorId: 8 }, { empresaId: null, creadoPorId: 7 }]) await test(`requestId ajeno ${JSON.stringify(existing)} no se reasocia`, async () => { const f = fixture({ existing }); assert.equal((await f.post(body())).status, 409); assert.equal(f.writes.length, 0) })
  await test('carrera unique recupera reintento exacto sin segunda escritura', async () => { const f = fixture({ race: true }); const r = await f.post(body()); assert.equal(r.status, 200); assert.equal(r.data.duplicate, true); assert.equal(f.writes.length, 1) })
  await test('validaciones cronológicas preservadas', () => {
    assert.throws(() => core.parseEmpresaLocalActivity(body({ activityDate: '2026-12-01T10:00:00Z' }), NOW))
    assert.throws(() => core.parseEmpresaLocalActivity(body({ type: 'TAREA', followUp: { dueAt: '2026-11-25T10:00:00Z' } }), NOW))
    assert.equal(core.parseEmpresaLocalActivity(body({ type: 'REUNION', activityDate: '2026-12-01T10:00:00Z' }), NOW).type, 'REUNION')
  })
  await test('recarga historial: consulta empresa sin personas; mantiene legado y excluye otra empresa', async () => {
    let activityQuery: any, taskQuery: any
    const company = { id: 'empresa-fixture', nombre: 'Empresa sola', tipo: 'SOCIEDAD', segmentoCrm: 'EMPRESA', nif: null, contactos: [], clientes: [] }
    const db = { crmEmpresa: { findUnique: async () => company }, ispClienteArea1: { findMany: async () => [] }, crmActividad: { findMany: async (q: any) => { activityQuery = q; return [{ id: 'local', empresaId: company.id, contactoId: null, tipo: 'REUNION', titulo: 'Reunión sola', descripcion: 'Local', fechaActividad: NOW, origen: 'LOCAL', creadoPorNombre: 'Autor', metadatos: {}, direccion: null }] } }, crmTarea: { findMany: async (q: any) => { taskQuery = q; return [{ titulo: 'Tarea sola', venceAt: NOW }] } }, area1CrmNegocio: { findMany: async () => [] }, area1CrmPipeline: { findMany: async () => [] } }
    const loaded = load('lib/area1-ficha-cliente.ts', { './prisma': { __esModule: true, default: db }, './area1-ficha-rentabilidad': { leerRentabilidadFicha: async () => ({ rentabilidad: null }), normalizarCodigoFicha: (s: string) => s }, './area1-subida-cliente': { leerSubidaCliente: async () => null } })
    const f = await loaded.cargarFichaCliente(company.id, 'COMERCIAL', NOW)
    assert.equal(f.eventos[0].titulo, 'Reunión sola'); assert.equal(f.eventos[0].quien, company.nombre); assert.equal(f.eventos[0].contactoId, null); assert.equal(f.tareas[0].titulo, 'Tarea sola')
    assert.equal(activityQuery.where.OR[0].empresaId, company.id); assert.equal(taskQuery.where.OR[0].empresaId, company.id)
    company.contactos = [{ contactoId: 'persona', papel: null, contacto: { nombre: 'Persona', email: null, propiedades: {} } }] as any
    Object.assign(db, { area1CrmConsentimiento: { findMany: async () => [] }, crmNegocioContacto: { findMany: async () => [] } })
    await loaded.cargarFichaCliente(company.id, 'COMERCIAL', NOW)
    assert.equal(activityQuery.where.OR[1].empresaId, null); assert.equal(activityQuery.where.OR[1].OR[0].contactoId.in[0], 'persona'); assert.equal(taskQuery.where.OR[1].empresaId, null)
  })
  await test('Mi día: tareas y reuniones nativas enlazan empresa, legado sigue contacto', async () => {
    const empty = { count: async () => 0, findMany: async () => [], groupBy: async () => [] }
    const db: any = Object.fromEntries(['crmRegistroHubspot', 'crmEmpresa', 'crmLista', 'area1CrmPipeline', 'clienteWeb', 'ispClienteArea1', 'leadMigracionWeb', 'leadSolucion', 'leadPartner', 'asistenteLead', 'area1CrmNegocio', 'ispVinculoArea1', 'crmCaptacionWeb'].map(k => [k, empty]))
    db.crmActividad = { ...empty, findMany: async () => [{ id: 'reunion', empresaId: 'empresa-fixture', contactoId: null, empresa: { nombre: 'Empresa sola' }, titulo: 'Reunión', descripcion: '', fechaActividad: NOW }, { id: 'old', contactoId: 'persona', contacto: { nombre: 'Persona' }, titulo: 'Histórico', descripcion: '', fechaActividad: NOW }] }
    db.crmTarea = { ...empty, findMany: async () => [{ id: 'tarea', empresaId: 'empresa-fixture', contactoId: null, empresa: { nombre: 'Empresa sola' }, titulo: 'Tarea sola', venceAt: NOW }, { id: 'oldtask', contactoId: 'persona', contacto: { nombre: 'Persona' }, titulo: 'Legado', venceAt: NOW }] }
    const loaded = load('lib/area1-crm-resumen.ts', { '@prisma/client': {}, '@/lib/prisma': { __esModule: true, default: db }, '@/lib/brevo-listas-io': { BREVO_LISTAS_IO_POR_DEFECTO: [] }, '@/lib/area1-crm-resumen-vista': load('lib/area1-crm-resumen-vista.ts') })
    const d = await loaded.cargarResumenCrm({ usuarioId: 7, alcance: 'MIO', puede: {} }, NOW)
    assert.equal(d.reunionesHoy[0].href, '/admin/crm/empresas/empresa-fixture'); assert.equal(d.tareas[0].href, '/admin/crm/empresas/empresa-fixture'); assert.equal(d.tareas[0].detalle, 'Empresa sola'); assert.equal(d.reunionesHoy[1].href, '/admin/crm/contactos/persona'); assert.equal(d.tareas[1].href, '/admin/crm/contactos/persona')
  })
  await test('auth empresa nativa: cuenta viva, área exacta y E sin fallback lectura', async () => {
    for (const account of [null, { activo: false, rol: 'GERENTE' }, { activo: true, rol: 'VENTAS', email: 'memoria@example.invalid' }]) {
      const permissions: any[] = []
      const auth = load('lib/crm-empresas-auth.ts', {
        'next-auth': { getServerSession: async () => ({ user: { id: '7', userType: 'admin', role: 'SUPER_ADMIN' } }) }, '@/lib/auth': { authOptions: {} },
        '@/lib/prisma': { __esModule: true, default: { usuarioAdmin: { findUnique: async () => account }, permisoUsuario: { count: async () => { throw Error('No fallback de lectura para escritura') } } } },
        '@/lib/permisos': { verificarPermisoServer: async (id: any, area: any, role: any) => { permissions.push([id, area, role]); return { lectura: true, escritura: false } } },
      })
      const denied = await auth.authorizeCrmEmpresas(true)
      assert.equal(denied.user, null)
      if (account?.activo) { assert.equal(denied.status, 403); assert.deepEqual(permissions, [[7, 'admin.crm.empresas', 'VENTAS']]) }
      else assert.equal(denied.status, 401)
    }
  })
  await test('ruta empresa existente: POST delega local y PATCH sigue disponible', async () => {
    const calls: any[] = []
    const route = load('app/api/admin/crm/empresas/[id]/route.ts', {
      'next/server': { NextResponse: { json: Response.json } }, '@prisma/client': {}, '@/lib/prisma': {},
      '@/lib/crm-empresas-auth': {}, '@/lib/crm-empresas': {}, '@/lib/crm-empresa-actividad': { registrarActividadEmpresa: async (...args: any[]) => { calls.push(args); return 'local-memory' } },
    })
    const request = new Request('https://memory.example.invalid', { method: 'POST' })
    const context = { params: Promise.resolve({ id: 'empresa-fixture' }) }
    assert.equal(await route.POST(request, context), 'local-memory'); assert.equal(calls[0][0], request); assert.equal(calls[0][1], context); assert.equal(typeof route.PATCH, 'function')
  })
  await test('modelo nativo/migración: destino no nulo y down nunca borra datos', () => {
    const migration = readFileSync('prisma/migrations/20261206_crm_actividades_empresa/migration.sql', 'utf8')
    const down = readFileSync('prisma/migrations/20261206_crm_actividades_empresa/down.sql', 'utf8')
    assert.ok(migration.includes('CHECK ("contacto_id" IS NOT NULL OR "empresa_id" IS NOT NULL)'))
    assert.ok(migration.includes('ON DELETE RESTRICT'))
    assert.ok(!/DELETE FROM|UPDATE |TRUNCATE/i.test(migration.replace(/--[^\n]*/g, '').replace(/ON UPDATE CASCADE/g, '')))
    assert.ok(down.includes('RAISE EXCEPTION') && down.includes('LOCK TABLE'))
    assert.ok(!/DELETE FROM|UPDATE |TRUNCATE/i.test(down.replace(/--[^\n]*/g, '')))
  })
  assert.equal(forbidden, 0)
  console.log(`PASS ${passed} pruebas; red/proveedores/BD reales: 0`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
