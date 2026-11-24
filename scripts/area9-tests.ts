import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import * as core from '../lib/area9/core'
import * as link from '../lib/area9/link'
import { area9Failure, area9Headers } from '../lib/area9/http'
import { readBody, checkWriteOrigin, Area8InputError } from '../lib/area8/validation'
import { normalizarEstado } from '../lib/peticiones-flujo'
import { capturePublication, canonicalJson, appliedSnapshots, type CaptureContract } from '../lib/area9/capture'
import { localDatetime } from '../components/admin/HistorialDesarrollosClient'

const BASE = 'https://staging.example'
const SHA = 'a'.repeat(40)
const DB = 'b'.repeat(64)
const PUB = 'c' + 'x'.repeat(24)
const FIXED = '2026-11-24T12:00:00.000Z'
class NextRequest extends Request {
  nextUrl: URL
  constructor(input: string, init?: RequestInit) { super(input, init); this.nextUrl = new URL(input) }
}
const next = { NextRequest, NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } }) } }
function load(path: string, modules: Record<string, unknown>) {
  const source = fs.readFileSync(path, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const mod = { exports: {} as any }
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Request, Response, URL, TextEncoder, TextDecoder, Date, Buffer, JSON, console, process: { cwd: () => '/synthetic' },
    require(name: string) { if (name in modules) return modules[name]; throw new Error(`Import no permitido en VM: ${name}`) } }, { filename: path })
  return mod.exports
}
let actor: any, calls: any[], dev: any, request: any, publication: any, existingLink: any, failDb: any
const manual = () => ({ id: 7, titulo: 'Mejora sintética', descripcion: 'Texto de prueba', tipo: 'privada', estado: 'completado', autor: 'Persona de prueba', commitHash: null, rama: null, fecha: new Date(FIXED) })
function reset() {
  actor = { id: 17, email: 'fixture@example.invalid', nombre: 'Persona de prueba', rol: 'SUPER_ADMIN', owner: true, acting: false }
  calls = []; dev = manual(); request = { id: 12, estado: 'resuelta', feedbackSatisfecho: true, fechaCierre: new Date(FIXED) }; publication = { id: PUB }; existingLink = null; failDb = null
}
const prisma: any = {
  desarrolloHistorial: {
    findMany: async (args: any) => { calls.push(['findMany', args]); if (failDb) throw failDb; return dev ? [dev] : [] },
    count: async (args: any) => { calls.push(['count', args]); return dev ? 1 : 0 },
    create: async (args: any) => { calls.push(['create', args]); return { id: 8, ...args.data } },
    findUnique: async (args: any) => { calls.push(['findUnique', args]); return dev },
    findUniqueOrThrow: async () => dev,
    updateMany: async (args: any) => { calls.push(['updateMany', args]); dev = { ...dev, ...args.data }; return { count: 1 } },
    deleteMany: async (args: any) => { calls.push(['deleteMany', args]); return { count: 1 } },
  },
  area9Publicacion: {
    findUnique: async (args: any) => { calls.push(['publication.findUnique', args]); return publication },
    findMany: async (args: any) => { calls.push(['publication.findMany', args]); return [{ ...publication, deploymentKey: 'github:fixture/repo:1', entorno: 'staging', commitHash: SHA, fechaPublicacion: new Date(FIXED), titulo: 'Publicación sintética', resumen: 'Cambios de prueba', fuente: 'github', url: 'https://staging.example/', migraciones: [], createdAt: new Date(FIXED), _count: { peticiones: 1 }, peticiones: [{ peticionId: 12, fecha: new Date(FIXED), confirmadoPorInt: 17, confirmadoNombre: 'Persona de prueba', peticion: { titulo: 'Petición sintética', estado: 'resuelta', fechaCierre: new Date(FIXED) } }] }] },
    count: async () => 1,
  },
  peticionInterna: { findUnique: async (args: any) => { calls.push(['request.findUnique', args]); return request } },
  area9PublicacionPeticion: {
    findUnique: async () => existingLink,
    create: async (args: any) => { calls.push(['link.create', args]); return args.data },
  },
  $transaction: async (fn: any, options: any) => { calls.push(['transaction', options]); return fn(prisma) },
}
const mockPrisma = { TransactionIsolationLevel: { Serializable: 'Serializable' }, sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }), join: (values: unknown[]) => ({ joined: values }) }
const modules = {
  'next/server': next, '@prisma/client': { Prisma: mockPrisma },
  '@/lib/area8/auth': { requireArea8Auth: async (options: any) => { calls.push(['auth', options]); return actor } },
  '@/lib/area8/validation': { readBody, checkWriteOrigin }, '@/lib/prisma': { prisma },
  '@/lib/peticiones-flujo': { normalizarEstado }, '@/lib/area9/core': core, '@/lib/area9/link': link,
  '@/lib/area9/http': { area9Failure, area9Headers }, '@/lib/area9/migrations.server': { readAppliedMigrations: async () => ({ registros: [], total: 0, preparadas: [], totalPreparadas: 0 }) },
}
const api = load('app/api/admin/historial/route.ts', modules)
const detail = load('app/api/admin/historial/[id]/route.ts', modules)
const context = (id = '7') => ({ params: Promise.resolve({ id }) })
const req = (method = 'GET', body?: unknown, suffix = '', origin = BASE) => new NextRequest(`${BASE}/api/admin/historial${suffix}`, { method, headers: { origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const mutations = () => calls.filter(call => ['create', 'updateMany', 'deleteMany', 'link.create'].includes(call[0]))
const authOpts = (write = false) => assert.deepEqual(JSON.parse(JSON.stringify(calls.find(call => call[0] === 'auth')?.[1])), write ? { management: true, write: true, owner: true, area: 'admin.historial' } : { management: true, area: 'admin.historial' })

async function apiTests() {
  for (const status of [401, 403]) {
    reset(); actor = { error: next.NextResponse.json({ error: status === 401 ? 'Inicia sesión' : 'No autorizado' }, { status }) }
    assert.equal((await api.GET(req())).status, status); assert.equal(calls.length, 1)
    assert.equal((await api.POST(req('POST', { titulo: 'Test' }))).status, status); assert.equal(mutations().length, 0)
  }
  reset(); const response = await api.GET(req()); assert.equal(response.status, 200); authOpts()
  const body = await response.json(); assert.equal(body.limit, 50); assert.equal(body.page, 1); assert.equal(body.registros[0].commit_hash, null)
  assert.equal(calls.find(call => call[0] === 'findMany')[1].take, 50)
  for (const query of ['limit=0', 'limit=-1', 'limit=101', 'limit=Infinity', 'limit=500', 'limit=1.5', 'page=NaN', 'page=0', 'page=1000001', 'tipo=%27%20OR%201=1--', 'estado=%27', 'vista=otra', 'vista=publicaciones&entorno=preview']) {
    reset(); assert.equal((await api.GET(req('GET', undefined, `?${query}`))).status, 400, query); assert.equal(calls.filter(call => call[0] === 'findMany').length, 0)
  }
  reset(); assert.equal((await api.GET(req('GET', undefined, '?limit=100&page=2'))).status, 200); assert.equal(calls.find(call => call[0] === 'findMany')[1].skip, 100)
  reset(); const published = await (await api.GET(req('GET', undefined, '?vista=publicaciones'))).json(); assert.equal(published.registros[0].commit_hash, SHA); assert.equal(published.registros[0].vinculos[0].estado, 'hecha')
  reset(); assert.equal((await api.GET(req('GET', undefined, '?vista=migraciones'))).status, 200)
  reset(); failDb = { code: 'P2021', message: 'postgres://sensitive-password/secret' }; const failed = await api.GET(req()); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /password|postgres|secret/)
  for (const extra of [{ commit_hash: SHA }, { rama: 'main' }, { migraciones: [] }, { accion: 'registrar_publicacion' }]) {
    reset(); assert.equal((await api.POST(req('POST', { titulo: 'Test', ...extra }))).status, 400); assert.equal(mutations().length, 0)
  }
  reset(); assert.equal((await api.POST(req('POST', { titulo: 'Test', autor: 'Suplantación' }))).status, 201); authOpts(true); assert.equal(calls.find(call => call[0] === 'create')[1].data.autor, 'Persona de prueba')
  reset(); actor.owner = false; assert.equal((await api.POST(req('POST', { titulo: 'Test' }))).status, 403); assert.equal(mutations().length, 0)
  reset(); actor.acting = true; assert.equal((await api.POST(req('POST', { titulo: 'Test' }))).status, 403); assert.equal(mutations().length, 0)
  reset(); assert.equal((await api.POST(req('POST', { titulo: 'Test' }, '', 'https://evil.example'))).status, 403); assert.equal(mutations().length, 0)
  const linkBody = { accion: 'vincular_peticion', publicacionId: PUB, peticionId: 12, confirmo: true }
  for (const confirmo of [false, 'true', 1, undefined]) {
    reset(); assert.equal((await api.POST(req('POST', { ...linkBody, confirmo }))).status, 400); assert.equal(mutations().length, 0)
  }
  for (const closed of [{ estado: 'en_pruebas' }, { estado: 'hecha', feedbackSatisfecho: false }, { fechaCierre: null }]) {
    reset(); request = { ...request, ...closed }; assert.equal((await api.POST(req('POST', linkBody))).status, 409); assert.equal(mutations().length, 0)
  }
  reset(); assert.equal((await api.POST(req('POST', linkBody))).status, 201); assert.equal(mutations()[0][0], 'link.create'); assert.deepEqual(request, { id: 12, estado: 'resuelta', feedbackSatisfecho: true, fechaCierre: new Date(FIXED) }); assert.equal(calls.find(call => call[0] === 'transaction')[1].isolationLevel, 'Serializable')
  reset(); existingLink = { ...linkBody }; assert.equal((await api.POST(req('POST', linkBody))).status, 200); assert.equal(mutations().length, 0)
  for (const automatic of [{ commitHash: SHA }, { commitHash: '' }, { rama: 'staging' }, { autor: 'Manus AI (auto)' }]) {
    reset(); dev = { ...dev, ...automatic }; assert.equal((await detail.PUT(req('PUT', { titulo: 'Cambio' }), context())).status, 403); assert.equal((await detail.DELETE(req('DELETE'), context())).status, 403); assert.equal(mutations().length, 0)
  }
  reset(); assert.equal((await detail.PUT(req('PUT', { titulo: 'Cambio manual' }), context())).status, 200); authOpts(true); assert.equal(mutations()[0][0], 'updateMany')
  reset(); assert.equal((await detail.DELETE(req('DELETE'), context())).status, 200); authOpts(true); assert.equal(mutations()[0][0], 'deleteMany')
  reset(); assert.equal((await detail.DELETE(req('DELETE', undefined, '', 'https://evil.example'), context())).status, 403); assert.equal(mutations().length, 0)
  reset(); dev = null; assert.equal((await detail.PUT(req('PUT', { titulo: 'Cambio' }), context())).status, 404); assert.equal((await detail.DELETE(req('DELETE'), context())).status, 404)
  reset(); assert.equal((await detail.PUT(req('PUT', { titulo: 'Cambio' }), context(PUB))).status, 400); assert.equal((await detail.DELETE(req('DELETE', undefined, '?vista=publicaciones'), context())).status, 403); assert.equal(mutations().length, 0)
  reset(); actor.owner = false; assert.equal((await detail.PUT(req('PUT', { titulo: 'Cambio' }), context())).status, 403); assert.equal((await detail.DELETE(req('DELETE'), context())).status, 403); assert.equal(mutations().length, 0)
  assert.equal(area9Failure(new Area8InputError('Origen denegado', 403)).status, 403)
  console.log('OK Área9 API VM: auth/área/owner/acting/origen, ORM+paginación, snake_case, cierre+conformidad, transacción, manual vs automático, no leaks.')
}

function captureTests() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const contract: CaptureContract = { version: 1, provider: 'github', scope: 'fixture/repo', providerEnvironment: 'staging', environment: 'staging', databaseIdentityHash: DB, verifierPublicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), verifiedDeploymentContract: true }
  const payload: any = { version: 1, provider: 'github', scope: 'fixture/repo', databaseIdentityHash: DB, verificationMethod: 'authenticated-provider-read', fetchedAt: FIXED,
    deployment: { id: 7, sha: SHA, environment: 'staging', production_environment: false, transient_environment: false },
    status: { deployment_id: 7, state: 'success', created_at: FIXED, environment_url: 'https://staging.example/' }, titulo: 'Cambios de prueba', resumen: 'Ahora se muestran los cambios con claridad.',
    migrations: [{ id: 'm1', migration_name: '20261124_area9_test', checksum: 'c'.repeat(64), finished_at: FIXED, rolled_back_at: null }, { id: 'm2', migration_name: 'fallida', checksum: 'd'.repeat(64), finished_at: null, rolled_back_at: null }, { id: 'm3', migration_name: 'revertida', checksum: 'e'.repeat(64), finished_at: FIXED, rolled_back_at: FIXED }] }
  const signed = (value: unknown) => ({ payload: value, signature: sign(null, Buffer.from(canonicalJson(value)), privateKey).toString('base64') })
  const options = { expectedSha: SHA, expectedDatabaseIdentityHash: DB }
  const result = capturePublication(signed(payload), contract, options)
  assert.equal(result.entorno, 'staging'); assert.equal(result.commitHash, SHA); assert.equal(result.migraciones.length, 1); assert.equal(result.deploymentKey, 'github:fixture/repo:7')
  assert.throws(() => capturePublication(signed(payload), { ...contract, verifiedDeploymentContract: false }, options), /contrato real/)
  assert.throws(() => capturePublication({ payload, signature: 'AA==' }, contract, options), /firmado/)
  assert.throws(() => capturePublication(signed(payload), contract, { ...options, expectedSha: 'f'.repeat(40) }), /SHA/)
  assert.throws(() => capturePublication(signed(payload), contract, { ...options, expectedDatabaseIdentityHash: '0'.repeat(64) }), /BD/)
  for (const change of [{ environment: 'Preview' }, { transient_environment: true }, { production_environment: true }, { sha: 'abc1234' }]) {
    assert.throws(() => capturePublication(signed({ ...payload, deployment: { ...payload.deployment, ...change } }), contract, options))
  }
  for (const state of ['pending', 'failure', 'in_progress', 'error']) assert.throws(() => capturePublication(signed({ ...payload, status: { ...payload.status, state } }), contract, options))
  const production = { ...contract, providerEnvironment: 'Production', environment: 'produccion' as const }
  const prodPayload = { ...payload, deployment: { ...payload.deployment, environment: 'Production', production_environment: true } }
  assert.throws(() => capturePublication(signed(prodPayload), production, options), /dos opt-in/)
  assert.throws(() => capturePublication(signed(prodPayload), production, { ...options, allowProduction: true }), /dos opt-in/)
  assert.equal(capturePublication(signed(prodPayload), production, { ...options, allowProduction: true, confirmProductionSha: SHA }).entorno, 'produccion')
  assert.throws(() => capturePublication(signed({ ...prodPayload, deployment: { ...prodPayload.deployment, environment: 'Preview' } }), { ...production, providerEnvironment: 'Preview' }, { ...options, allowProduction: true, confirmProductionSha: SHA }), /preview/)
  const vercelContract = { ...production, provider: 'vercel' as const, scope: 'project_test', providerEnvironment: 'production' }
  const vercelPayload = { ...payload, provider: 'vercel', scope: 'project_test', deployment: { id: 'dpl_12345678', projectId: 'project_test', target: 'production', readyState: 'READY', ready: Date.parse(FIXED), url: 'staging.example', meta: { githubCommitSha: SHA } } }
  const prodOpts = { ...options, allowProduction: true, confirmProductionSha: SHA }
  assert.equal(capturePublication(signed(vercelPayload), vercelContract, prodOpts).fuente, 'vercel')
  const observedShape = { ...vercelPayload, deployment: { ...vercelPayload.deployment, projectId: undefined, project: { id: 'project_test' } } }
  delete observedShape.deployment.projectId
  assert.equal(capturePublication(signed(observedShape), vercelContract, prodOpts).fuente, 'vercel')
  assert.throws(() => capturePublication(signed({ ...vercelPayload, deployment: { ...vercelPayload.deployment, project: { id: 'another_project' } } }), vercelContract, prodOpts))
  assert.throws(() => capturePublication(signed({ ...vercelPayload, deployment: { ...vercelPayload.deployment, target: 'preview' } }), { ...vercelContract, providerEnvironment: 'preview' }, prodOpts), /preview/)
  assert.throws(() => appliedSnapshots([{ migration_name: 'prepared', checksum: 'c'.repeat(64), finished_at: FIXED, rolled_back_at: null, sql: 'SELECT secret' }]), /metadatos/)
  for (const url of ['javascript:alert(1)', 'http://staging.example', 'https://user:secret@staging.example', 'https://127.0.0.1/', 'https://staging.example/?token=secret', 'https://staging.example/#secret', 'https://staging.example\\evil']) assert.throws(() => core.publicSafeUrl(url), url)
  const temp = mkdtempSync(join(tmpdir(), 'area9-offline-'))
  try {
    const receiptFile = join(temp, 'receipt.json'), contractFile = join(temp, 'contract.json')
    writeFileSync(receiptFile, JSON.stringify(signed(payload))); writeFileSync(contractFile, JSON.stringify(contract))
    // Entorno totalmente explícito y sin conexiones. No hereda secretos del proceso.
    const run = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/area9-capture-publication.ts', '--receipt', receiptFile, '--contract', contractFile, '--sha', SHA, '--expected-db-identity', DB], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: temp, NODE_ENV: 'test' }, timeout: 30_000 })
    assert.equal(run.status, 0, run.stderr); const candidate = JSON.parse(run.stdout); assert.equal(candidate.dryRun, true); assert.equal(candidate.registrado, false)
    assert.doesNotMatch(fs.readFileSync('scripts/area9-capture-publication.ts', 'utf8'), /process\.env\.(DATABASE_URL|DB_HOST|DB_PASSWORD)/)
  } finally { rmSync(temp, { recursive: true, force: true }) }
  console.log('OK Área9 capturador: firma Ed25519, alcance+SHA+BD, success/READY, rechazo preview, producción doble opt-in, migraciones aplicadas, CLI offline por defecto.')
}

async function migrationTests() {
  const queries: any[] = []
  const fakeDb = { $queryRaw: async (sql: any) => {
    queries.push(sql)
    if (sql.strings.join('').includes('COUNT')) return [{ total: 1 }]
    return [{ id: 'm1', nombre: '20261124_aplicada', checksum: 'abc', aplicadaAt: new Date(FIXED) }]
  } }
  const migrationModule = load('lib/area9/migrations.server.ts', {
    'node:crypto': { createHash: () => ({ update: () => ({ digest: () => 'abc' }) }) },
    'node:fs/promises': { readdir: async () => ['20261124_aplicada', '20261125_preparada'].map(name => ({ name, isDirectory: () => true })), readFile: async () => Buffer.from('-- synthetic sql, never exposed') },
    'node:path': { join }, '@prisma/client': { Prisma: mockPrisma }, '@/lib/prisma': { prisma: fakeDb }, './core': core,
  })
  const result = await migrationModule.readAppliedMigrations({ page: 1, limit: 50, skip: 0 })
  assert.equal(result.registros[0].estado, 'aplicada'); assert.equal(result.preparadas.find((row: any) => row.nombre === '20261125_preparada').estado, 'preparada')
  assert.equal(result.preparadas.find((row: any) => row.nombre === '20261124_aplicada').estado, 'aplicada')
  assert.doesNotMatch(JSON.stringify(result), /SELECT|synthetic sql|logs/)
  for (const sql of queries) { const text = sql.strings.join(''); assert.match(text, /finished_at IS NOT NULL AND rolled_back_at IS NULL/); assert.match(text, /LIMIT/); assert.doesNotMatch(text, /SELECT \*|logs|script/); }
  console.log('OK Área9 migraciones VM: finished_at/no rollback/checksum, lectura limitada, preparada≠aplicada, sin SQL/filas de negocio.')
}

async function main() {
  for (const path of ['app/api/admin/historial/route.ts', 'app/api/admin/historial/[id]/route.ts']) assert.doesNotMatch(fs.readFileSync(path, 'utf8'), /\$queryRawUnsafe|\$executeRawUnsafe|requireAuth\('admin'\)|error\.message/)
  const sql = fs.readFileSync('prisma/migrations/20261124_area9_historial_publicaciones/migration.sql', 'utf8')
  assert.doesNotMatch(sql, /area9_sis_|^\s*(?:DROP |ALTER TABLE|UPDATE |DELETE FROM|INSERT INTO)/m)
  assert.match(sql, /ON DELETE RESTRICT/)
  assert.deepEqual(core.pagination(new URLSearchParams()), { page: 1, limit: 50, skip: 0 })
  const oldTimezone = process.env.TZ
  process.env.TZ = 'Europe/Madrid'
  assert.equal(new Date(localDatetime(new Date(FIXED))).toISOString(), FIXED)
  if (oldTimezone === undefined) delete process.env.TZ
  else process.env.TZ = oldTimezone
  const ui = fs.readFileSync('components/admin/HistorialDesarrollosClient.tsx', 'utf8')
  assert.match(ui, /\[overflow-wrap:anywhere\]/)
  assert.match(ui, /min-w-0 flex-1/)
  assert.match(fs.readFileSync('scripts/area9-capture-publication.ts', 'utf8'), /io_staging_finanzas/)
  await apiTests(); captureTests(); await migrationTests()
  console.log('PASS Área9: pruebas exclusivamente sintéticas, sin BD, Git, browser, env secrets ni red.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
