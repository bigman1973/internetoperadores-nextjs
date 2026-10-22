import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

/**
 * Contrato B3 de importación: ejecuta la ruta transpilada en un VM con Prisma,
 * parsers, permisos y aislamiento simulados. No abre conexiones de BD ni red.
 */
const ROOT = process.cwd()
const BASE = 'https://staging.example'
const ROUTE = 'app/api/admin/finanzas/importar-movimientos/route.ts'
const MB = 1024 * 1024

class NextRequest extends Request {
  nextUrl: URL
  constructor(input: string, init?: RequestInit) {
    super(input, init)
    this.nextUrl = new URL(input)
  }
}

function privateJson(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...(init?.headers || {}) },
  })
}

type Movimiento = {
  fechaOperacion: Date
  fechaValor: Date
  concepto: string
  importe: number
  saldo: number | null
  referencia: string | null
  codigoOperacion: string | null
  infoAdicional: string | null
  tercero: string | null
  hashUnico: string
}

let session: any
let denied: Response | null
let isolationCalls: number
let writeChecks: number
let createCalls: any[]
let updateCalls: any[]
let accountUpdates: any[]
let importLog: any[]
let stored: any[]
let bridgeRows: any[]
let parsed: Movimiento[]
let account: any
let candidateAccounts: any[]
let createFailure: Error | null
let rules: any[]
let ruleUpdates: any[]
let sequence: string[]

function movimiento(overrides: Partial<Movimiento> = {}): Movimiento {
  return {
    fechaOperacion: new Date('2025-01-02T12:00:00.000Z'),
    fechaValor: new Date('2025-01-02T12:00:00.000Z'),
    concepto: 'COMPRA PRUEBA',
    importe: 10,
    saldo: 110,
    referencia: null,
    codigoOperacion: null,
    infoAdicional: null,
    tercero: null,
    hashUnico: 'parser-hash-1',
    ...overrides,
  }
}

function reset() {
  session = { user: { id: '7', userType: 'admin', role: 'CONTABILIDAD' } }
  denied = null
  isolationCalls = 0
  writeChecks = 0
  createCalls = []
  updateCalls = []
  accountUpdates = []
  importLog = []
  stored = []
  bridgeRows = []
  parsed = [movimiento()]
  account = { id: 'cuenta-a', banco: 'Santander', saldoActual: 100, fechaSaldo: null, fechaCorteExtracto: null }
  candidateAccounts = [account]
  createFailure = null
  rules = []
  ruleUpdates = []
  sequence = []
}

reset()

const prisma: any = {
  cuentaBancaria: {
    findUnique: async ({ where, select }: any) => {
      if (select) return { fechaCorteExtracto: account.fechaCorteExtracto }
      return account?.id === where.id ? structuredClone(account) : null
    },
    findMany: async () => structuredClone(candidateAccounts),
    updateMany: async ({ where, data }: any) => {
      sequence.push('cuenta.updateMany')
      accountUpdates.push(structuredClone({ where, data }))
      const isCut = 'fechaCorteExtracto' in data
      const field = isCut ? 'fechaCorteExtracto' : 'fechaSaldo'
      const previous = account[field] as Date | null
      const proposed = data[field] as Date
      if (!previous || previous.getTime() < proposed.getTime()) {
        Object.assign(account, data)
        return { count: 1 }
      }
      return { count: 0 }
    },
  },
  movimientoBancario: {
    findMany: async ({ where }: any) => {
      if (where.id?.in) return stored.filter((row) => where.id.in.includes(row.id)).map((row) => ({ id: row.id, concepto: row.concepto }))
      if (where.fechaOperacion?.lt) return structuredClone(bridgeRows)
      const desde = where.fechaOperacion?.gte?.getTime?.() ?? -Infinity
      const hasta = where.fechaOperacion?.lte?.getTime?.() ?? Infinity
      return stored
        .filter((row) => row.cuentaId === where.cuentaId && row.fechaOperacion.getTime() >= desde && row.fechaOperacion.getTime() <= hasta)
        .map((row) => ({
          fechaOperacion: row.fechaOperacion,
          importe: row.importe,
          saldo: row.saldo,
          concepto: row.concepto,
          referencia: row.referencia,
          hashUnico: row.hashUnico,
        }))
    },
    create: async ({ data }: any) => {
      sequence.push('movimiento.create')
      createCalls.push(structuredClone(data))
      if (createFailure) throw createFailure
      const row = { ...structuredClone(data), id: `mov-${stored.length + 1}` }
      stored.push(row)
      return { id: row.id }
    },
    update: async ({ where, data }: any) => {
      updateCalls.push(structuredClone({ where, data }))
      return { id: where.id }
    },
  },
  reglaImputacion: {
    findMany: async () => structuredClone(rules),
    update: async ({ where, data }: any) => { ruleUpdates.push(structuredClone({ where, data })) },
  },
  importacionExtracto: {
    create: async ({ data }: any) => { sequence.push('importacion.create'); importLog.push(structuredClone(data)); return { id: 'import-1' } },
  },
}

function categoria(value: unknown): any {
  if (value === 'Gastos Financieros') return { ok: true, valor: value }
  if (value === 'Impuestos') return { ok: true, valor: value }
  if (typeof value === 'string' && /^Comisiones /u.test(value)) return { ok: true, valor: value }
  return { ok: false, codigo: 'CATEGORIA_NO_PERMITIDA' }
}
function tipo(value: unknown): any {
  if (value === 'Comisión' || value === 'Factura') return { ok: true, valor: value }
  return { ok: false, codigo: 'TIPO_NO_PERMITIDO' }
}
function detectarComisionEnConcepto(concepto: unknown) {
  const text = typeof concepto === 'string' ? concepto : ''
  if (!/\bcomisi(?:o|ó)n(?:es)?\b/iu.test(text)) return { esComisionPositiva: false, importe: null, motivo: 'SIN_TEXTO_COMISION' }
  const match = text.match(/\bcomisi(?:o|ó)n(?:es)?\b\s*(?:de\s+|por\s+)?([+-]?\d+(?:[,.]\d{1,2})?)/iu)
  if (!match) return { esComisionPositiva: false, importe: null, motivo: 'COMISION_SIN_IMPORTE' }
  const amount = Number(match[1].replace(',', '.'))
  return amount > 0
    ? { esComisionPositiva: true, importe: amount, motivo: 'COMISION_POSITIVA' }
    : { esComisionPositiva: false, importe: amount, motivo: 'COMISION_CERO_O_NEGATIVA' }
}

const source = fs.readFileSync(ROUTE, 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText
const module = { exports: {} as any }
vm.runInNewContext(code, {
  module, exports: module.exports, Request, Response, URL, FormData, Blob, ReadableStream, Buffer,
  Date, TextEncoder, JSON, console, structuredClone,
  require(name: string) {
    if (name === 'next/server') return { NextRequest, NextResponse: { json: privateJson } }
    if (name === 'next-auth') return { getServerSession: async () => session }
    if (name === 'node:crypto') return crypto
    if (name === 'xlsx') return { read: () => ({ SheetNames: [], Sheets: {} }), utils: { sheet_to_json: () => [], sheet_to_csv: () => '' } }
    if (name === '@/lib/prisma') return { prisma }
    if (name === '@/lib/auth') return { authOptions: {} }
    if (name === '@/lib/api-admin-area-read') return {
      checkAdminAreaWrite: async () => { writeChecks++; return denied },
      checkAdminAreaRead: async () => denied,
    }
    if (name === '@/lib/finanzas/staging-safety') return {
      assertFinanceStagingIsolated: async () => { isolationCalls++; sequence.push('isolation') },
    }
    if (name === '@/lib/finanzas/vivid-statement-validation') return { validateVividStatement: () => ({ ok: true }) }
    if (name === '@/lib/finanzas/parsers') return {
      detectarFormato: () => 'santander',
      parseSantanderTXT: () => structuredClone(parsed),
      parseSantanderXLSX: () => structuredClone(parsed),
      parseCaixaBankXLS: () => structuredClone(parsed),
      parseCaixaGuissonaCSV: () => structuredClone(parsed),
      parseBBVACSV: () => structuredClone(parsed),
      parseVividCSV: () => structuredClone(parsed),
      parseWiseXLSX: () => structuredClone(parsed),
      parseNorma43: () => structuredClone(parsed),
    }
    if (name === '@/lib/finanzas/bank-balance-chain') return require(`${ROOT}/lib/finanzas/bank-balance-chain.ts`)
    if (name === '@/lib/finanzas/movement-catalog') return {
      detectarComisionEnConcepto,
      validarCategoriaNueva: categoria,
      validarTipoMovimientoNuevo: tipo,
      presentarCategoriaHistorica: (value: unknown) => ({ valor: value ?? null, valorOriginal: value, esLegacy: false, fueAlias: false }),
      presentarTipoMovimientoHistorico: (value: unknown) => ({ valor: value ?? null, valorOriginal: value, esLegacy: false, fueAlias: false }),
    }
    throw new Error(`Módulo inesperado en test B3 import: ${name}`)
  },
})

const { POST } = module.exports as { POST: (request: NextRequest) => Promise<Response> }

function formRequest(cuentaId = account.id, banco = 'santander') {
  const form = new FormData()
  form.append('archivo', new Blob(['movimientos de prueba'], { type: 'text/plain' }), 'extracto.txt')
  form.append('banco', banco)
  if (cuentaId) form.append('cuentaId', cuentaId)
  return new NextRequest(`${BASE}/api/admin/finanzas/importar-movimientos`, {
    method: 'POST', headers: { origin: BASE }, body: form,
  })
}
async function post(cuentaId = account.id, banco = 'santander') {
  return POST(formRequest(cuentaId, banco))
}
async function body(response: Response) { return response.json() as Promise<any> }

async function main() {
  // Contratos estructurales: el lector acota streaming real y no delega req.formData.
  assert.match(source, /req\.body\?\.getReader\(\)/)
  assert.match(source, /reader\.cancel\('Formulario demasiado grande'\)/)
  assert.doesNotMatch(source, /await req\.formData\(\)/)
  assert.match(source, /fechaOperacion: \{ lt: fechaMin \}/)
  assert.match(source, /take: 2/)
  assert.match(source, /hashMovimientoCuenta/)
  assert.match(source, /updateMany/)
  assert.match(source, /cache-control': 'private, no-store'/)

  reset(); session = null
  let response = await post()
  assert.equal(response.status, 401)
  assert.equal(isolationCalls, 0); assert.equal(createCalls.length, 0)

  reset(); denied = privateJson({ error: 'denegado' }, { status: 403 })
  response = await post()
  assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(isolationCalls, 0); assert.equal(createCalls.length, 0)

  // Sin Content-Length, el stream físico de más de 10 MB se cancela antes de parser/DML.
  reset()
  const tooLarge = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(10 * MB + 1)); controller.close() } })
  response = await POST(new NextRequest(`${BASE}/api/admin/finanzas/importar-movimientos`, {
    method: 'POST', headers: { origin: BASE, 'content-type': 'multipart/form-data; boundary=b3' },
    body: tooLarge as any, duplex: 'half' as any,
  } as any))
  assert.equal(response.status, 413, 'cap real sin Content-Length')
  assert.equal(isolationCalls, 0); assert.equal(createCalls.length, 0)

  // Todas las filas se validan antes de create; NaN saldo no se convierte en cero.
  reset(); parsed = [movimiento(), movimiento({ hashUnico: 'bad', saldo: Number.NaN })]
  response = await post()
  assert.equal(response.status, 400)
  assert.equal(isolationCalls, 1); assert.equal(createCalls.length, 0); assert.equal(accountUpdates.length, 0)

  // Cuenta implícita ambigua: debe requerir cuentaId, no elegir findFirst.
  reset(); candidateAccounts = [account, { ...account, id: 'cuenta-b' }]
  response = await post('')
  assert.equal(response.status, 400); assert.equal(createCalls.length, 0)

  // Formato conocido y cuenta distinta se rechazan; Norma 43 no fuerza banco alguno.
  reset(); account = { ...account, banco: 'BBVA' }
  response = await post()
  assert.equal(response.status, 400); assert.equal(createCalls.length, 0)
  reset(); account = { ...account, banco: 'BBVA' }
  response = await post(account.id, 'norma43')
  assert.equal(response.status, 200)

  // El propio extracto no se usa como puente: consulta estrictamente anterior.
  reset()
  stored.push({ ...movimiento({ saldo: 100, hashUnico: 'historico-mismo-dia' }), id: 'old', cuentaId: account.id })
  bridgeRows = [{ fechaOperacion: new Date('2025-01-01T12:00:00.000Z'), saldo: 100 }]
  response = await post()
  assert.equal(response.status, 200)
  assert.equal(accountUpdates.length, 2, 'puente ajeno permite corte y saldo')

  // Dos candidatos del último día anterior son ambiguos: nunca se elige uno.
  reset()
  bridgeRows = [
    { fechaOperacion: new Date('2025-01-01T18:00:00.000Z'), saldo: 100 },
    { fechaOperacion: new Date('2025-01-01T09:00:00.000Z'), saldo: 90 },
  ]
  response = await post()
  assert.equal(response.status, 200)
  assert.equal(accountUpdates.length, 1, 'puente intradía ambiguo sólo puede avanzar corte')
  assert.ok('fechaCorteExtracto' in accountUpdates[0].data)

  // Un hueco deja avanzar el corte, pero no el saldo; ambos DML son independientes.
  reset(); bridgeRows = [{ fechaOperacion: new Date('2025-01-01T12:00:00.000Z'), saldo: 50 }]
  parsed = [movimiento({ importe: 10, saldo: 100 })]
  response = await post()
  assert.equal(response.status, 200)
  assert.equal(accountUpdates.length, 1)
  assert.ok('fechaCorteExtracto' in accountUpdates[0].data)
  assert.equal((await body(response)).resumen.saldoActualizado, false)

  // Error no único conserva lo insertado previo, informa parcial y no adelanta nada.
  reset(); createFailure = new Error('fallo de persistencia')
  response = await post()
  assert.equal(response.status, 207)
  assert.equal((await body(response)).success, false)
  assert.equal(accountUpdates.length, 0)
  assert.deepEqual(sequence.slice(0, 2), ['isolation', 'movimiento.create'], 'aislamiento antes de escritura')

  // Hash B3 por cuenta: dos cuentas aceptan el mismo parser hash; reimportar una no.
  reset(); const accountA = structuredClone(account); const accountB = { ...accountA, id: 'cuenta-b' }
  response = await post(accountA.id)
  assert.equal(response.status, 200)
  account = accountB; candidateAccounts = [accountB]
  response = await post(accountB.id)
  assert.equal(response.status, 200)
  account = accountA; candidateAccounts = [accountA]
  response = await post(accountA.id)
  assert.equal(response.status, 200)
  assert.equal(createCalls.length, 2)
  assert.notEqual(createCalls[0].hashUnico, createCalls[1].hashUnico)
  assert.equal((await body(response)).resumen.duplicadosHash, 1)

  // Catálogo: una regla inválida no escribe clasificación alguna.
  reset(); rules = [{ id: 'bad-catalog', activa: true, confianza: 10, patron: 'COMPRA', imputacion: 'Libre', tipoPago: 'Factura' }]
  response = await post()
  assert.equal(response.status, 200); assert.equal(updateCalls.length, 0)

  // Comisión cero, -cero y sin cifra bloquean regla financiera/a tipo Comisión; positiva aplica.
  for (const [concepto, expected] of [
    ['COMISION 0,00', 0],
    ['COMISION -0,00', 0],
    ['COMISION SIN CIFRA', 0],
    ['COMISION 1,25', 1],
  ] as const) {
    reset()
    parsed = [movimiento({ concepto, hashUnico: `fee-${concepto}` })]
    rules = [{ id: 'fee', activa: true, confianza: 10, patron: 'COMISION', imputacion: 'Gastos Financieros', tipoPago: 'Comisión' }]
    response = await post()
    assert.equal(response.status, 200)
    assert.equal(updateCalls.length, expected, concepto)
  }

  console.log('OK import B3 VM: multipart acotado, aislamiento, validación total, cuentas/puentes, corte-saldo atómico, parcial, hash por cuenta y catálogo/comisiones sin BD ni red.')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
