import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'

// Todas las identidades y filas son ficticias. Los módulos externos no se cargan.
const BASE = 'https://preview.example.invalid'
let session: any
let grants: any[] = []
let rows: any[] = []
let accounts: any[] = []
let writes = 0
let failEvent = false
let conflict = false
let targetArea: { activo: boolean } | null = { activo: true }
let databaseFailure: string | null = null
const env = { AREA4_OWNER_USER_ID: '9001' }
const db: any = {}
const modules = new Map<string, any>()
function load(file: string): any {
  const resolved = path.resolve(file)
  if (modules.has(resolved)) return modules.get(resolved)
  const mod = { exports: {} as any }
  modules.set(resolved, mod.exports)
  const source = fs.readFileSync(resolved, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, Buffer, Date, URL, Request, Response, Error, TextEncoder, TextDecoder, console,
    process: { env },
    require(name: string) {
      if (name === 'next/server') return { NextRequest, NextResponse }
      if (name === 'next-auth') return { getServerSession: async () => session }
      if (name === '@/lib/auth') return { authOptions: {} }
      if (name === '@/lib/prisma') return { __esModule: true, default: db, prisma: db }
      if (name === '@prisma/client') return { Prisma: {} }
      const target = name.startsWith('@/') ? name.substring(2) : name.startsWith('.') ? path.resolve(path.dirname(resolved), name) : null
      if (target) return load(target.endsWith('.ts') ? target : `${target}.ts`)
      throw new Error(`Dependencia externa bloqueada: ${name}`)
    },
  }, { filename: resolved })
  modules.set(resolved, mod.exports)
  return mod.exports
}
function match(row: any, where: any): boolean {
  if (!where) return true
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.usuarioEmail && row.usuarioEmail.toLowerCase() !== where.usuarioEmail.equals.toLowerCase()) return false
  if (typeof where.estado === 'string' && row.estado !== where.estado) return false
  if (where.estado?.in && !where.estado.in.includes(row.estado)) return false
  if (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime()) return false
  if (where.eventos?.none && row.eventos.length > 0) return false
  if (where.tramitadaAt === null && row.tramitadaAt != null) return false
  if (where.responsableId === null && row.responsableId != null) return false
  if (where.notasAdmin === null && row.notasAdmin != null) return false
  if (where.mensajes?.none && row.mensajes.some((message: any) => message.autorTipo === 'admin')) return false
  return true
}
function hydrate(row: any) { return { ...row, responsable: accounts.find(account => account.id === row.responsableId) ? { id: row.responsableId, nombre: 'Responsable de prueba' } : null } }
function getRows(where: any) {
  if (databaseFailure) throw Object.assign(new Error('secret should not leak'), { code: databaseFailure })
  return rows.filter(row => match(row, where))
}
db.usuarioAdmin = {
  findUnique: async ({ where }: any) => accounts.find(account => account.id === where.id),
  findFirst: async ({ where }: any) => accounts.find(account => account.activo && account.email.toLowerCase() === where.email.equals.toLowerCase()),
  findMany: async () => accounts.filter(account => account.activo).map(({ id, nombre }: any) => ({ id, nombre })),
}
db.permisoArea = { findUnique: async () => targetArea }
db.permisoUsuario = { findMany: async () => grants }
db.peticionInterna = {
  findFirst: async ({ where }: any) => { const row = getRows(where)[0]; return row ? hydrate(row) : null },
  findUnique: async ({ where }: any) => { const row = getRows(where)[0]; return row ? structuredClone(row) : null },
  findUniqueOrThrow: async ({ where }: any) => { const row = getRows(where)[0]; if (!row) throw new Error('not found'); return hydrate(row) },
  findMany: async ({ where, take, skip = 0 }: any) => getRows(where).slice(skip, skip + take).map(hydrate),
  count: async ({ where }: any) => getRows(where).length,
  groupBy: async ({ by }: any) => {
    const grouped: any = {}
    for (const row of rows) grouped[row[by[0]]] = (grouped[row[by[0]]] || 0) + 1
    return Object.entries(grouped).map(([key, count]) => ({ [by[0]]: key, _count: { _all: count } }))
  },
  create: async ({ data }: any) => {
    if (databaseFailure) throw Object.assign(new Error('secret should not leak'), { code: databaseFailure })
    writes++
    const row = { id: 100 + rows.length, createdAt: new Date(), updatedAt: new Date(), eventos: [], mensajes: [], responsableId: null, tramitadaAt: null, notasAdmin: null, feedbackSatisfecho: null, fechaCierre: null, ...data }
    rows.push(row)
    return hydrate(row)
  },
  updateMany: async ({ where, data }: any) => {
    if (conflict) return { count: 0 }
    const selected = getRows(where)
    selected.forEach(row => { Object.assign(row, data, { updatedAt: new Date() }); writes++ })
    return { count: selected.length }
  },
  deleteMany: async ({ where }: any) => { const selected = getRows(where); rows = rows.filter(row => !selected.includes(row)); writes += selected.length; return { count: selected.length } },
}
db.peticionMensaje = { create: async ({ data }: any) => { writes++; rows.find(row => row.id === data.peticionId).mensajes.push({ id: `msg-${writes}`, ...data }); return data } }
db.area8PeticionEvento = {
  create: async ({ data }: any) => { if (failEvent) throw new Error('event unavailable'); writes++; rows.find(row => row.id === data.peticionId).eventos.push({ id: `event-${writes}`, createdAt: new Date(), leidoAt: null, ...data }); return data },
  updateMany: async () => ({ count: 0 }),
}
let serial = Promise.resolve()
db.$transaction = async (work: (tx: any) => Promise<any>) => {
  const current = serial
  let release: () => void = () => {}
  serial = new Promise<void>(resolve => { release = resolve })
  await current
  const snapshot = structuredClone(rows)
  const before = writes
  try { return await work(db) } catch (error) { rows = snapshot; writes = before; throw error } finally { release() }
}
const own = load('app/api/peticiones/route.ts')
const admin = load('app/api/admin/peticiones/route.ts')
const flow = load('lib/peticiones-flujo.ts')
const validation = load('lib/area8/validation.ts')
const policy = load('lib/area8/policy.ts')
function reset(role = 'VISOR', id = 9002) {
  session = { user: { id: String(id), email: `user${id}@example.invalid`, userType: 'admin', role: 'SUPER_ADMIN', name: 'Usuario de prueba' } }
  accounts = [9001, 9002, 9003].map(accountId => ({ id: accountId, email: `user${accountId}@example.invalid`, nombre: 'Usuario de prueba', activo: true, rol: accountId === id ? role : 'VISOR', roles: [] }))
  grants = []; writes = 0; rows = []; failEvent = false; conflict = false; databaseFailure = null
  targetArea = { activo: true }
}
function fixture(state = 'nueva', email = 'user9002@example.invalid') {
  const row = { id: 11, estado: state, usuarioEmail: email, usuarioNombre: 'Solicitante de prueba', titulo: 'Mejora de prueba', descripcion: 'Solo texto ficticio.', tipo: 'mejora', seccion: 'panel_admin', prioridad: 'media', urgencia: 'media', paginaUrl: '/admin/ejemplo', captura: null, responsableId: null, tramitadaAt: null, notasAdmin: null, createdAt: new Date(0), updatedAt: new Date(0), mensajes: [], eventos: [], feedbackSatisfecho: null, fechaCierre: null }
  rows.push(row); return row
}
function request(method = 'GET', body?: any, route = '/api/peticiones', origin = BASE) {
  return new NextRequest(`${BASE}${route}`, { method, headers: { origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
let apiCases = 0
async function status(response: Promise<Response>, expected: number) {
  const result = await response
  assert.equal(result.status, expected, await result.clone().text())
  apiCases++
  return result
}
async function main() {
  let pureCases = 0
  for (const state of flow.ESTADOS_PETICION) { assert.equal(flow.normalizarEstado(state), state); pureCases++ }
  for (const [from, to] of Object.entries({ pendiente: 'nueva', pendiente_validacion: 'en_pruebas', ajustes_solicitados: 'en_desarrollo', resuelta: 'hecha' })) { assert.equal(flow.normalizarEstado(from), to); pureCases++ }
  assert.equal(flow.estadoTrasFeedback(true), 'hecha'); assert.equal(flow.estadoTrasFeedback(false), 'en_desarrollo'); pureCases += 2
  for (const value of ['__proto__', 'constructor', 'toString']) { assert.equal(flow.normalizarEstado(value), null); pureCases++ }
  for (const state of ['hecha', 'resuelta', 'en_pruebas', 'descartada']) for (const destination of flow.ESTADOS_PETICION) { assert.equal(flow.transicionAdminPermitida(state, destination), false); pureCases++ }
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.invalid', 'https://name:pass@example.invalid/', '/x\nHeader']) { assert.throws(() => validation.pageUrl(value)); pureCases++ }
  for (const value of ['0', '-1', '1.5', '12abc', {}, '9007199254740992']) { assert.throws(() => validation.positiveId(value)); pureCases++ }
  assert.equal(validation.pageUrl('/admin/peticiones'), '/admin/peticiones'); pureCases++
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOQAAAAASUVORK5CYII='
  assert.equal(validation.screenshot(png), png); pureCases++
  for (const value of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,PHN2Zz4=', 'data:image/jpeg;base64,AAAA', `data:image/png;base64,${'A'.repeat(8 * 1024 * 1024)}`]) { assert.throws(() => validation.screenshot(value)); pureCases++ }
  const account = { id: 9001, activo: true, email: 'test@example.invalid', rol: 'SUPER_ADMIN' }
  assert.equal(policy.isArea8Owner(account, false, env), true)
  assert.equal(policy.isArea8Owner(account, true, env), false)
  assert.equal(policy.area8OwnerId({ IMPERSONATION_ALLOWED_ACTOR_IDS: '1,2' }), null)
  assert.equal(policy.canManageArea8({ ...account, rol: 'VISOR' }, [], true), false)
  assert.equal(policy.canManageArea8({ ...account, rol: 'GERENTE' }, [], true), true)
  assert.equal(policy.canManageArea8({ ...account, rol: 'GERENTE' }, [{ lectura: true, escritura: true, area: { codigo: 'admin' } }, { lectura: false, escritura: false, area: { codigo: 'admin.peticiones' } }], true), false)
  pureCases += 6
  assert.equal(policy.canManageArea8({ ...account, rol: 'GERENTE' }, [], true, 'admin.peticiones', true), false)
  assert.equal(policy.canManageArea8({ ...account, rol: 'GERENTE' }, [{ lectura: true, escritura: true, area: { codigo: 'admin.clientes' } }], true), true)
  assert.equal(policy.canManageArea8({ ...account, id: 9002 }, [{ lectura: true, escritura: true, area: { codigo: 'admin' } }], true), false)
  assert.equal(policy.canManageArea8({ ...account, rol: 'VISOR' }, [{ lectura: true, escritura: false, area: { codigo: 'admin.peticiones' } }], true), false)
  pureCases += 4

  reset(); session = null
  await status(own.GET(request()), 401); await status(own.POST(request('POST', {})), 401); await status(admin.GET(request()), 401); assert.equal(writes, 0)
  reset(); accounts[1].activo = false
  await status(own.GET(request()), 403)
  reset(); session.user.userType = 'cliente'
  await status(own.GET(request()), 401)
  reset(); session.user.id = '9002abc'
  await status(own.GET(request()), 401)
  reset(); session.user.email = 'other@example.invalid'
  await status(own.GET(request()), 403)
  reset(); fixture(); fixture('nueva', 'user9003@example.invalid')
  const mine = await (await status(own.GET(request()), 200)).json()
  assert.equal(mine.peticiones.length, 1)
  await status(own.GET(request('GET', undefined, '/api/peticiones?as=user9003@example.invalid')), 403)
  await status(admin.GET(request()), 403)
  await status(own.PUT(request('PUT', { id: 11, titulo: '' })), 400)
  await status(own.PUT(request('PUT', { id: 11, tipo: 'error', seccion: 'web_publica' })), 200)
  assert.equal(rows[0].tipo, 'error'); assert.equal(rows[0].seccion, 'web_publica')
  await status(own.PUT(request('PUT', { id: 11, tipo: 'inventado' })), 400)
  await status(own.PUT(request('PUT', { id: 11, seccion: 'inventada' })), 400)
  await status(own.POST(request('POST', { titulo: 'Prueba', descripcion: 'Prueba', tipo: 'inventado' })), 400)
  await status(own.POST(request('POST', { titulo: 'Prueba', descripcion: 'Prueba', captura: 'data:image/svg+xml;base64,AAAA' })), 400)
  await status(own.POST(request('POST', { titulo: 'Prueba', descripcion: 'Prueba' }, undefined, 'https://evil.example.invalid')), 403)
  const created = await (await status(own.POST(request('POST', { titulo: 'Prueba', descripcion: 'Prueba', paginaUrl: '/admin/prueba', urgencia: 'critica', prioridad: 'critica', captura: png })), 201)).json()
  assert.equal(created.peticion.estado, 'nueva'); assert.equal(created.peticion.urgencia, 'critica'); assert.equal(created.peticion.prioridad, 'media')
  reset(); fixture('pendiente_validacion')
  assert.equal((await (await status(own.GET(request()), 200)).json()).peticiones[0].estado, 'en_pruebas')
  await status(own.PATCH(request('PATCH', { id: 11, satisfecho: false })), 400)
  await status(own.PATCH(request('PATCH', { id: 11, satisfecho: true })), 200)
  assert.equal(rows[0].estado, 'hecha'); assert.equal(rows[0].eventos.length, 1); assert.equal(rows[0].mensajes[0].tipo, 'conformidad')
  await status(own.PATCH(request('PATCH', { id: 11, satisfecho: true })), 409)
  reset(); fixture('en_pruebas'); failEvent = true
  await status(own.PATCH(request('PATCH', { id: 11, satisfecho: true })), 500)
  assert.equal(rows[0].estado, 'en_pruebas'); assert.equal(writes, 0)
  reset(); fixture('en_pruebas'); conflict = true
  await status(own.PATCH(request('PATCH', { id: 11, satisfecho: true })), 409); assert.equal(writes, 0)
  reset(); fixture('en_pruebas')
  const raced = await Promise.all([own.PATCH(request('PATCH', { id: 11, satisfecho: true })), own.PATCH(request('PATCH', { id: 11, satisfecho: true }))])
  assert.deepEqual(raced.map(response => response.status).sort(), [200, 409]); apiCases += 2
  assert.equal(rows[0].eventos.length, 1); assert.equal(rows[0].mensajes.length, 1)
  reset(); fixture('en_pruebas')
  await status(own.PATCH(request('PATCH', { id: 11, satisfecho: false, comentario: 'Necesita un ajuste de prueba.' })), 200)
  assert.equal(rows[0].estado, 'en_desarrollo'); assert.equal(rows[0].fechaCierre, null)
  reset(); fixture(); session.impersonation = { verified: true }
  await status(own.POST(request('POST', { titulo: 'Prueba', descripcion: 'Prueba' })), 403)
  await status(admin.GET(request()), 403)
  reset('GERENTE'); fixture('en_analisis')
  await status(admin.POST(request('POST', { action: 'cambiar_prioridad', id: 11, prioridad: 'alta' })), 403)
  await status(admin.POST(request('POST', { action: 'cambiar_estado', id: 11, estado: 'hecha' })), 400)
  await status(admin.POST(request('POST', { action: 'cambiar_estado', id: 11, estado: 'aprobada' })), 200)
  assert.equal(rows[0].eventos.length, 1)
  await status(admin.POST(request('POST', { action: 'enviar_validacion', id: 11, mensaje: 'Cambio de prueba entregado.' })), 200)
  assert.equal(rows[0].estado, 'en_pruebas'); assert.equal(rows[0].eventos.length, 2)
  await status(admin.POST(request('POST', { action: 'cambiar_estado', id: 11, estado: 'descartada' })), 409)
  reset('GERENTE'); fixture(); grants = [{ lectura: true, escritura: true, area: { codigo: 'admin' } }, { lectura: false, escritura: false, area: { codigo: 'admin.peticiones' } }]
  await status(admin.GET(request()), 403); await status(admin.POST(request('POST', { action: 'cambiar_estado', id: 11, estado: 'en_analisis' })), 403)
  reset('GERENTE'); accounts[1].permisosArea4Vivos = true
  await status(admin.GET(request()), 403)
  reset('GERENTE'); grants = [{ lectura: true, escritura: true, area: { codigo: 'admin.clientes' } }]
  await status(admin.GET(request()), 200)
  reset('GERENTE'); fixture(); accounts[1].permisosArea4Vivos = true; grants = [{ lectura: true, escritura: false, area: { codigo: 'admin.peticiones' } }]
  await status(admin.GET(request()), 200); await status(admin.POST(request('POST', { action: 'cambiar_estado', id: 11, estado: 'en_analisis' })), 403)
  reset('SUPER_ADMIN'); grants = [{ lectura: true, escritura: true, area: { codigo: 'admin' } }]
  await status(admin.GET(request()), 403)
  reset('GERENTE'); targetArea = null
  await status(admin.GET(request()), 403)
  reset('GERENTE'); targetArea = { activo: false }
  await status(admin.GET(request()), 403)
  reset('SUPER_ADMIN', 9001); fixture()
  await status(admin.POST(request('POST', { action: 'cambiar_prioridad', id: 11, prioridad: 'critica' })), 200)
  assert.equal(rows[0].prioridad, 'critica')
  await status(admin.POST(request('POST', { action: 'asignar_responsable', id: 11, responsableId: 9003 })), 200)
  assert.equal(rows[0].responsableId, 9003)
  accounts[2].activo = false
  await status(admin.POST(request('POST', { action: 'asignar_responsable', id: 11, responsableId: 9003 })), 400)
  await status(admin.POST(request('POST', { action: 'eliminar', id: 11 })), 409)
  reset('GERENTE'); fixture(); await status(admin.POST(request('POST', { action: 'comentario', id: 11, mensaje: 'Revisión del equipo.' })), 200)
  assert.ok(rows[0].tramitadaAt)
  await status(own.DELETE(request('DELETE', undefined, '/api/peticiones?id=11')), 409)
  reset('GERENTE'); fixture(); await status(admin.GET(request('GET', undefined, '/api/admin/peticiones?estado=constructor')), 400)
  reset('SUPER_ADMIN', 9001); fixture('nueva', 'user9001@example.invalid')
  await status(admin.POST(request('POST', { action: 'asignar_responsable', id: 11, responsableId: 9003 })), 200)
  await status(admin.POST(request('POST', { action: 'asignar_responsable', id: 11, responsableId: null })), 200)
  await status(own.DELETE(request('DELETE', undefined, '/api/peticiones?id=11')), 409)
  reset(); fixture(); rows[0].eventos.push({ id: 'e' })
  await status(own.DELETE(request('DELETE', undefined, '/api/peticiones?id=11')), 409)
  reset(); fixture(); rows[0].mensajes.push({ autorTipo: 'admin' })
  await status(own.DELETE(request('DELETE', undefined, '/api/peticiones?id=11')), 409)
  reset(); fixture()
  await status(own.DELETE(request('DELETE', undefined, '/api/peticiones?id=11', 'https://evil.example.invalid')), 403)
  await status(own.DELETE(request('DELETE', undefined, '/api/peticiones?id=11')), 200)
  reset(); databaseFailure = 'P2022'
  const missing = await status(own.POST(request('POST', { titulo: 'Prueba', descripcion: 'Prueba' })), 503)
  assert.doesNotMatch(await missing.text(), /secret/)
  const source = fs.readFileSync('app/api/admin/peticiones/route.ts', 'utf8')
  assert.doesNotMatch(source, /notificarPeticion|sendEmail|fetch\(/)
  console.log(JSON.stringify({ ok: true, pureCases, apiCases, database: 'in-memory-only', actualHttpRequests: 0, outboundNotifications: 0, migrationsApplied: false }))
}
main().catch(error => { console.error(error); process.exit(1) })
