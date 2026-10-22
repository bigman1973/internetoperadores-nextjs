import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const ROOT = process.cwd()
const BASE = 'https://staging.example'
const routePath = 'app/api/admin/finanzas/movimientos/[id]/route.ts'
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

class NextRequest extends Request {
  nextUrl: URL
  constructor(input: string, init?: RequestInit) {
    super(input, init)
    this.nextUrl = new URL(input)
  }
}

let isolationCalls = 0
let writeChecks = 0
let updateCalls: Array<{ id: string; data: Record<string, unknown> }> = []
let session: any = { user: { id: '7', userType: 'admin', role: 'CONTABILIDAD' } }
let denied: Response | null = null

const prisma: any = {
  movimientoBancario: {
    update: async ({ where, data }: any) => {
      updateCalls.push({ id: where.id, data: structuredClone(data) })
      return {
        id: where.id,
        categoria: data.categoria ?? 'IMPUESTOS',
        tipoPago: data.tipoPago ?? 'Nomina',
        metodoPago: data.metodoPago ?? 'Debito',
        cuenta: { banco: 'Pruebas', alias: 'TEST' },
      }
    },
  },
}

function reset() {
  isolationCalls = 0
  writeChecks = 0
  updateCalls = []
  session = { user: { id: '7', userType: 'admin', role: 'CONTABILIDAD' } }
  denied = null
}

function privateJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } })
}

const source = fs.readFileSync(routePath, 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const module = { exports: {} as any }
vm.runInNewContext(code, {
  module, exports: module.exports, Request, Response, URL, TextEncoder, TextDecoder, JSON, console,
  require(name: string) {
    if (name === 'next/server') return { NextRequest, NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } }) } }
    if (name === 'next-auth') return { getServerSession: async () => session }
    if (name === '@/lib/auth') return { authOptions: {} }
    if (name === '@/lib/prisma') return { prisma }
    if (name === '@/lib/api-admin-area-read') return { checkAdminAreaWrite: async () => { writeChecks++; return denied } }
    if (name === '@/lib/finanzas/staging-safety') return { assertFinanceStagingIsolated: async () => { isolationCalls++ } }
    if (name === '@/lib/finanzas/movement-catalog') return {
      validarCategoriaNueva: (value: unknown) => value === 'IMPUESTOS' ? { ok: true, valor: 'Impuestos', fueAlias: true } : value === 'Impuestos' ? { ok: true, valor: value } : { ok: false, codigo: 'CATEGORIA_NO_PERMITIDA', mensaje: 'Categoría no permitida' },
      validarTipoMovimientoNuevo: (value: unknown) => value === 'Nomina' ? { ok: true, valor: 'Nómina', fueAlias: true } : value === 'Débito' ? { ok: true, valor: value } : { ok: false, codigo: 'TIPO_NO_PERMITIDO', mensaje: 'Tipo no permitido' },
      presentarCategoriaHistorica: (value: unknown) => value === 'IMPUESTOS' ? { valor: 'Impuestos', valorOriginal: value, esLegacy: false, fueAlias: true } : { valor: value ?? null, valorOriginal: value, esLegacy: false, fueAlias: false },
      presentarTipoMovimientoHistorico: (value: unknown) => value === 'Nomina' ? { valor: 'Nómina', valorOriginal: value, esLegacy: false, fueAlias: true } : value === 'Debito' ? { valor: 'Débito', valorOriginal: value, esLegacy: false, fueAlias: true } : { valor: value ?? null, valorOriginal: value, esLegacy: false, fueAlias: false },
    }
    throw new Error(`Módulo inesperado en test B3 API: ${name}`)
  },
})

const { PATCH, PUT, DELETE } = module.exports as {
  PATCH: (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>
  PUT: () => Promise<Response>
  DELETE: () => Promise<Response>
}

function request(body: unknown, origin = BASE, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`${BASE}/api/admin/finanzas/movimientos/${ID}`, {
    method: 'PATCH',
    headers: { origin, 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })
}
async function send(body: unknown, origin = BASE, extraHeaders: Record<string, string> = {}) {
  return PATCH(request(body, origin, extraHeaders), { params: Promise.resolve({ id: ID }) })
}

async function main() {
  // Contratos fuente: importación protegida y sin Blob/outbound/conciliación heredada.
  const importSource = fs.readFileSync('app/api/admin/finanzas/importar-movimientos/route.ts', 'utf8')
  assert.match(importSource, /checkAdminAreaWrite\(AREA_IMPORTAR/)
  assert.match(importSource, /assertFinanceStagingIsolated\(\)/)
  assert.match(importSource, /req\.headers\.get\('origin'\) !== req\.nextUrl\.origin/)
  assert.match(importSource, /MAX_ARCHIVO_BYTES/)
  assert.match(importSource, /avisosSaldo/)
  assert.match(importSource, /continuidadSaldo/)
  assert.match(importSource, /fechaCorteExtracto/)
  assert.match(importSource, /detectarComisionEnConcepto/)
  assert.doesNotMatch(importSource, /@vercel\/blob|conciliacion\/auto|sendMail|sendEmail|microsoft-graph/i)

  reset(); session = null
  assert.equal((await send({ categoria: 'Impuestos' })).status, 401, 'sin sesión no alcanza permisos, aislamiento ni DML')
  assert.equal(writeChecks, 0); assert.equal(isolationCalls, 0); assert.equal(updateCalls.length, 0)

  reset(); denied = privateJson({ error: 'Denegado' }, 403)
  assert.equal((await send({ categoria: 'Impuestos' })).status, 403, 'permiso denegado no alcanza aislamiento ni DML')
  assert.equal(isolationCalls, 0); assert.equal(updateCalls.length, 0)

  reset()
  assert.equal((await send({ categoria: 'Impuestos' }, 'https://evil.example')).status, 403, 'same-origin obligatorio antes de DML')
  assert.equal(isolationCalls, 0); assert.equal(updateCalls.length, 0)

  reset()
  assert.equal((await send({ conciliado: true })).status, 400, 'B4/legacy conciliado queda fuera de allowlist')
  assert.equal((await send({ facturaId: ID })).status, 400, 'vínculos B4/B6 quedan fuera de allowlist')
  assert.equal((await send({ categoria: 'Centro de coste libre' })).status, 400, 'desconocido no crea categoría')
  assert.equal(isolationCalls, 0); assert.equal(updateCalls.length, 0)

  reset()
  assert.equal((await send({ categoria: 'IMPUESTOS', tipoPago: 'Nomina', metodoPago: 'Débito' })).status, 200)
  assert.equal(isolationCalls, 1, 'aislamiento se exige justo antes de escritura')
  assert.deepEqual(updateCalls, [{ id: ID, data: { categoria: 'Impuestos', tipoPago: 'Nómina', metodoPago: 'Débito' } }])

  reset()
  assert.equal((await send({ categoria: null, tipoPago: null, metodoPago: null })).status, 200, 'null explícito es el único borrado B3')
  assert.deepEqual(updateCalls[0]?.data, { categoria: null, tipoPago: null, metodoPago: null })
  assert.equal((await PUT()).status, 405, 'PUT no habilita mutación general')
  assert.equal((await DELETE()).status, 405, 'DELETE no habilita eliminación')

  reset()
  assert.equal((await send({ categoria: 'Impuestos' }, BASE, { 'content-length': '99999' })).status, 413, 'límite JSON antes de aislamiento/DML')
  assert.equal(isolationCalls, 0); assert.equal(updateCalls.length, 0)

  reset()
  assert.equal((await send({ categoria: 'x'.repeat(20000) })).status, 413, 'límite real sin Content-Length')
  assert.equal((await send({ categoria: 'Impuestos' }, BASE, { 'content-type': 'text/plain' })).status, 415)
  assert.equal(isolationCalls, 0); assert.equal(updateCalls.length, 0)

  console.log('OK API B3 VM: sesión/permisos/origen/límites, allowlist catálogo/aliases/null, aislamiento previo, sin conciliación/vínculos/PUT/DELETE ni red/BD.')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
