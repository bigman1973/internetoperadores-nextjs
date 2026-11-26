import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as XLSX from 'xlsx'
import { createTanda3PdfFixture } from './fixtures/tanda3-pdf-fixture'
import { NextRequest, NextResponse } from 'next/server'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as crypto from 'node:crypto'

// Synthetic fixtures only, generated in memory. No env mutation, network, disk or DB writes.
const requireNative = createRequire(import.meta.url)
const ROOT = new URL('../', import.meta.url)
const MANUAL = 'app/api/admin/finanzas/conciliar/confirming-documentos/route.ts'
const LIB = 'lib/finanzas/confirming-documentos.ts'
const UI = 'components/finanzas/conciliar-unificado/ConfirmingDocumentos.tsx'
const ORIGIN = 'https://staging.fixture.invalid'
const PATH = '/api/admin/finanzas/conciliar/confirming-documentos'
const source = (file: string) => readFileSync(new URL(file, ROOT), 'utf8')

function harness() {
  let env: Record<string, string | undefined> = {
    FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview',
    DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@fixture.invalid/io_staging_finanzas',
  }
  let principal: any = { id: 7, activo: true, rol: 'OPERADOR', roles: [] }
  let session: any = { user: { id: '7', userType: 'admin', role: 'SUPER_ADMIN' } }
  let permissions = { lectura: true, escritura: true }
  let identity = { database_name: 'io_staging_finanzas', database_user: 'io_staging_finanzas' }
  let failure = false, identityReads = 0, liveReads = 0, parseCalls = 0, effects = 0
  let onLiveRead: (() => void) | null = null
  const forbidden = () => { effects++; throw new Error('EXTERNAL_EFFECT_FORBIDDEN') }
  const database = {
    $queryRaw: async () => { identityReads++; if (failure) throw new Error('PRIVATE_DB_ERROR'); return [identity] },
    $executeRaw: forbidden, $transaction: forbidden,
    usuarioAdmin: { findUnique: async () => { liveReads++; if (failure) throw new Error('PRIVATE_ADMIN_ERROR'); const row = principal ? { ...principal } : null; onLiveRead?.(); return row }, create: forbidden, update: forbidden, delete: forbidden },
    permisoUsuario: { count: async () => 1 },
  }
  const dependencies: Record<string, any> = {
    'next/server': { NextRequest, NextResponse },
    'next-auth': { getServerSession: async () => session }, '@/lib/auth': { authOptions: {} },
    '@/lib/prisma': { __esModule: true, default: database },
    '@/lib/permisos': { verificarPermisoServer: async () => ({ ...permissions }) },
    react: { ...React, cache: (fn: any) => fn },
    'node:crypto': crypto,
    'pdf-parse': { __esModule: true, default: requireNative('pdf-parse/lib/pdf-parse.js') },
    xlsx: XLSX,
  }
  function load(file: string) {
    const module: any = { exports: {} }
    const compiled = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
    vm.runInNewContext(compiled, {
      module, exports: module.exports,
      require: (name: string) => { if (!(name in dependencies)) throw new Error(`UNEXPECTED_DEPENDENCY:${name}`); return dependencies[name] },
      process: { get env() { return env } },
      Buffer, Headers, URL, Request, Response, TextDecoder, TextEncoder, ReadableStream,
      Uint8Array, ArrayBuffer, FormData, Blob, Date, Set, Map,
      fetch: forbidden, console: { log() {}, error() {}, warn() {} },
    }, { filename: file })
    return module.exports
  }
  dependencies['@/lib/finanzas/prototype-staging'] = load('lib/finanzas/prototype-staging.ts')
  dependencies['@/lib/finanzas/reconciliation-auth'] = load('lib/finanzas/reconciliation-auth.ts')
  const parser = load('lib/finanzas/confirming-parser.ts')
  const nativeParse = parser.parseConfirmingFile
  dependencies['./confirming-parser'] = { ...parser, parseConfirmingFile: async (...args: any[]) => { parseCalls++; return nativeParse(...args) } }
  const lib = load(LIB)
  dependencies['@/lib/finanzas/confirming-documentos'] = lib
  const route = load(MANUAL)
  const uiSession = { useSession: () => ({ data: session }) }
  dependencies['next-auth/react'] = uiSession
  dependencies['react/jsx-runtime'] = requireNative('react/jsx-runtime')
  return {
    lib, route, parser, load, uiSession,
    counts: () => ({ identityReads, liveReads, parseCalls, effects }),
    setEnv: (patch: any) => { env = { ...env, ...patch } },
    setIdentity: (patch: any) => { identity = { ...identity, ...patch } },
    setPrincipal: (patch: any) => { principal = patch === null ? null : { ...principal, ...patch } },
    setSession: (value: any) => { session = value },
    setPermissions: (value: any) => { permissions = value },
    setFailure: () => { failure = true },
    revokeOnRead: () => { onLiveRead = () => { principal.activo = false } },
  }
}

const BOUNDARY = '----ConfirmingFixtureBoundary'
function multipart(bytes: Buffer, name = 'Confirming BBVA fixture.pdf', extra = '', headerExtra = '') {
  return Buffer.concat([
    Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="archivo"; filename="${name}"\r\nContent-Type: application/octet-stream${headerExtra}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${BOUNDARY}${extra || '--\r\n'}`),
  ])
}
function request(bytes: Buffer, options: { url?: string; origin?: string | null; length?: string | null; type?: string; chunks?: number } = {}) {
  const headers = new Headers({ 'content-type': options.type ?? `multipart/form-data; boundary=${BOUNDARY}` })
  if (options.origin !== null) headers.set('origin', options.origin ?? ORIGIN)
  if (options.length !== null) headers.set('content-length', options.length ?? String(bytes.length))
  let at = 0
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (at >= bytes.length) { controller.close(); return }
    const end = Math.min(bytes.length, at + (options.chunks ?? bytes.length))
    controller.enqueue(new Uint8Array(bytes.subarray(at, end))); at = end
  } })
  return new NextRequest(options.url ?? `${ORIGIN}${PATH}`, { method: 'POST', headers, body, duplex: 'half' } as any)
}
async function pdf(text: readonly string[], rows: readonly { text: string; x: number; y: number }[] = []) {
  return createTanda3PdfFixture([
    ...text.map((line, index) => ({ text: line, x: 30, y: 770 - index * 20, size: 10 })),
    ...rows.map(row => ({ ...row, size: 10 })),
  ])
}
const bbvaSummary = [
  'Liquidació de bestretes', 'Data de liquidació 10/08/2026',
  'Import nominal 300,00 EUR', 'Import comissió 1,50 EUR',
  'Impostos S/COM (IVA 21%) 0,32 EUR', 'Import interessos 4,00 EUR',
  'Import a deduir 5,82 EUR', 'Líquid a favor seu 294,18 EUR',
]
const bbvaRows = [
  ['Núm.', 40, 500], ['factura', 67, 500], ['Referència', 127, 500],
  ['Data', 194, 500], ['Comissió', 292, 500], ['Interès', 385, 500], ['Tipus', 429, 500], ['Import', 520, 500],
  ['DRAX26/901', 40, 460], ['01/01/2026', 194, 460], ['1,00', 292, 460], ['200,00', 357, 460], ['2.100', 429, 460], ['3,00', 504, 460],
  ['DRAX26/902', 40, 420], ['01/01/2026', 194, 420], ['0,50', 292, 420], ['100,00', 357, 420], ['2.100', 429, 420], ['1,00', 504, 420],
].map(([text, x, y]) => ({ text: String(text), x: Number(x), y: Number(y) }))
const caixaSummary = ['Cliente CLIENTE SINTETICO', 'Fecha liquidación 03 mar 26',
  'Importe factura 1.000,00', 'Intereses 17,00', 'Comisiones 2,50',
  'IVA comisiones 0,50', 'Total a deducir 20,00', 'Importe neto 980,00']
function workbook(bookType: 'xls' | 'xlsx' = 'xlsx', rows?: any[]) {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows ?? [{ 'Núm. factura': 'DRAX26/903', 'Importe factura': '1.000,00', 'Importe neto': '980,50', 'Fecha factura': '15 abr 26' }]), 'Synthetic')
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType }))
}
const memoryOnly = (h: ReturnType<typeof harness>) => assert.equal(h.counts().effects, 0)

// These tests execute the actual guard/auth/route/reader/native parser, not route regex alone.
test('BBVA PDF real in-memory: native coordinates, financial fields and documentary-only cuadre', async () => {
  const h = harness(), bytes = await pdf(bbvaSummary, bbvaRows)
  const response = await h.route.POST(request(multipart(bytes), { chunks: 31 }))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.banco, 'BBVA'); assert.equal(data.tipoDocumento, 'LIQUIDACION')
  assert.equal(data.importes.nominal, 300); assert.equal(data.importes.intereses, 4)
  assert.equal(data.importes.comision, 1.5); assert.equal(data.importes.ivaComision, 0.32)
  assert.equal(data.importes.netoBancario, 294.18); assert.equal(data.importes.deducciones, 5.82)
  assert.equal(data.lineas.length, 2); assert.equal(data.lineas[0].nominal, 200)
  assert.equal(data.lineas[0].intereses, 3); assert.equal(data.cuadre.estado, 'CUADRA')
  assert.equal(data.confirmable, false); assert.equal(data.archivado, false); assert.equal(data.persistido, false)
  assert.deepEqual(data.efectos, { businessWrites: 0, imports: 0, cobrosConfirmados: 0, facturasMarcadasPagadas: 0 })
  assert.equal('rawText' in data, false); assert.equal('cuentaAbono' in data, false)
  assert.equal(h.counts().parseCalls, 1); assert.equal(h.counts().liveReads, 2); memoryOnly(h)
})

test('Caixa PDF real binary: explicit IVA and net bank, discrepancy and absence stay distinct', async () => {
  const h = harness()
  const read = async (lines: string[]) => h.lib.leerConfirmingDocumento({ nombre: 'Confirming Caixa sintético.pdf', extension: 'pdf', bytes: await pdf(lines) })
  const parsed = await read(caixaSummary)
  assert.equal(parsed.banco, 'CaixaBank'); assert.equal(parsed.importes.ivaComision, 0.5)
  assert.equal(parsed.importes.netoBancario, 980); assert.equal(parsed.importes.deducciones, 20)
  assert.equal(parsed.cuadre.estado, 'CUADRA'); assert.equal(parsed.lineas.length, 0)
  const absent = await read(caixaSummary.filter(line => !line.startsWith('IVA') && !line.startsWith('Total')))
  assert.equal(absent.importes.ivaComision, null); assert.equal(absent.importes.deducciones, null)
  assert.equal(absent.cuadre.estado, 'NO_VERIFICABLE')
  const discrepancy = await read(caixaSummary.map(line => line.replace('980,00', '979,99')))
  assert.equal(discrepancy.cuadre.estado, 'DESCUADRE'); assert.equal(discrepancy.cuadre.diferenciaCentimos, 1)
  memoryOnly(h)
})

test('BBVA cesión PDF: nominal only, never liquidación or invented zero finance', async () => {
  const h = harness()
  const bytes = await pdf(['CESIÓN DE CRÉDITOS'], [
    { text: 'NÚM. FACTURA', x: 30, y: 500 }, { text: 'IMPORTE/(EUR)', x: 320, y: 500 },
    { text: 'DRAX26/904', x: 34, y: 450 }, { text: '10-08-2026', x: 237, y: 450 }, { text: '123,45', x: 350, y: 450 },
  ])
  const data = await h.lib.leerConfirmingDocumento({ nombre: 'Confirming BBVA cesion.pdf', extension: 'pdf', bytes })
  assert.equal(data.tipoDocumento, 'AVISO_CESION'); assert.equal(data.importes.nominal, 123.45)
  for (const key of ['intereses', 'comision', 'ivaComision', 'netoBancario', 'deducciones']) assert.equal(data.importes[key], null)
  assert.equal(data.lineas[0].intereses, null); assert.equal(data.cuadre.estado, 'NO_APLICA')
  assert.equal(data.confirmable, false); memoryOnly(h)
})

test('Caixa XLS and XLSX binary fixtures: detail requires PDF, XLS net is not bank net or VAT', async () => {
  const h = harness()
  for (const extension of ['xls', 'xlsx'] as const) {
    const response = await h.route.POST(request(multipart(workbook(extension), `Confirming Caixa fixture.${extension}`), { length: null, chunks: 13 }))
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.equal(data.tipoDocumento, 'DETALLE_FACTURAS'); assert.equal(data.importes.nominal, 1000)
    assert.equal(data.importes.netoDetalleXlsSinIva, 980.5)
    for (const key of ['netoBancario', 'ivaComision', 'deducciones', 'intereses', 'comision']) assert.equal(data.importes[key], null)
    assert.equal(data.lineas[0].intereses, null); assert.equal(data.cuadre.estado, 'NO_VERIFICABLE')
    assert(data.avisos.some((s: string) => s.includes('Requiere el PDF')))
  }
  const incomplete = await h.lib.leerConfirmingDocumento({ nombre: 'Confirming Caixa incomplete.xlsx', extension: 'xlsx', bytes: workbook('xlsx', [
    { 'Núm. factura': 'DRAX26/905', 'Importe factura': '', 'Importe neto': '' },
  ]) })
  assert.equal(incomplete.importes.nominal, null); assert.equal(incomplete.lineas[0].nominal, null)
  assert.equal(incomplete.importes.netoDetalleXlsSinIva, null); memoryOnly(h)
})

test('PDF filename cannot classify unrecognized document as bank liquidation or fabricate nominal zero', async () => {
  const h = harness()
  const data = await h.lib.leerConfirmingDocumento({ nombre: 'Confirming BBVA documento.pdf', extension: 'pdf', bytes: await pdf(['DOCUMENTO SINTETICO SIN LIQUIDACION']) })
  assert.equal(data.tipoDocumento, 'NO_CLASIFICADO'); assert.equal(data.importes.nominal, null)
  assert.equal(data.importes.netoBancario, null); assert.equal(data.cuadre.estado, 'NO_APLICA')
  const missing = await h.lib.leerConfirmingDocumento({ nombre: 'Confirming BBVA sin nominal.pdf', extension: 'pdf', bytes: await pdf(bbvaSummary.filter(line => !line.startsWith('Import nominal'))) })
  assert.equal(missing.importes.nominal, null); assert.equal(missing.cuadre.estado, 'NO_VERIFICABLE')
  assert.equal(missing.cuadre.diferenciaCentimos, undefined)
  memoryOnly(h)
})

test('staging configuration and live DB identity fail closed before native parser', async () => {
  const cases = [
    (h: ReturnType<typeof harness>) => h.setEnv({ VERCEL_ENV: 'production' }),
    (h: ReturnType<typeof harness>) => h.setEnv({ FINANCE_STAGING_SANDBOX: '0' }),
    (h: ReturnType<typeof harness>) => h.setEnv({ FINANCE_MODEL_PRODUCTION_ENABLED: '1' }),
    (h: ReturnType<typeof harness>) => h.setEnv({ DATABASE_URL: 'postgresql://postgres:fake@fixture.invalid/railway' }),
    (h: ReturnType<typeof harness>) => h.setIdentity({ database_name: 'railway' }),
    (h: ReturnType<typeof harness>) => h.setIdentity({ database_user: 'postgres' }),
  ]
  for (const setup of cases) {
    const h = harness(); setup(h)
    const response = await h.route.POST(request(multipart(Buffer.from('%PDF-fixture'))))
    assert.equal(response.status, 404); assert.equal(h.counts().parseCalls, 0); assert.equal(h.counts().liveReads, 0); memoryOnly(h)
  }
})

test('real live B4 auth: no session, nonadmin, inactive, missing L/E, stale JWT and revocation denied', async () => {
  const cases: [((h: ReturnType<typeof harness>) => void), number][] = [
    [h => h.setSession(null), 401], [h => h.setSession({ user: { id: '7', userType: 'cliente' } }), 401],
    [h => h.setSession({ user: { id: 'not-an-id', userType: 'admin' } }), 401],
    [h => h.setPrincipal({ activo: false }), 401], [h => h.setPrincipal(null), 401],
    [h => h.setPermissions({ lectura: true, escritura: false }), 403],
    [h => h.setPermissions({ lectura: false, escritura: true }), 403],
    [h => h.setPermissions({ lectura: false, escritura: false }), 403],
    [h => h.revokeOnRead(), 401],
  ]
  for (const [setup, expected] of cases) {
    const h = harness(); setup(h)
    assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-fixture'))))).status, expected)
    assert.equal(h.counts().parseCalls, 0); memoryOnly(h)
  }
})

test('acting denied even malformed/self envelope; HTTPS exact Origin, no query overrides', async () => {
  for (const envelope of [{}, { actorId: '7', targetId: '7' }, false, 'bad']) {
    const h = harness(); h.setSession({ user: { id: '7', userType: 'admin' }, impersonation: envelope })
    assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-fixture'))))).status, 403)
    assert.equal(h.counts().liveReads, 0); memoryOnly(h)
  }
  for (const options of [
    { origin: null }, { origin: 'null' }, { origin: 'https://elsewhere.fixture.invalid' },
    { origin: `${ORIGIN}/` }, { origin: `${ORIGIN}:443` },
    { origin: 'http://staging.fixture.invalid', url: `http://staging.fixture.invalid${PATH}` },
  ]) {
    const h = harness(); assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-fixture')), options))).status, 403)
    assert.equal(h.counts().parseCalls, 0); memoryOnly(h)
  }
  const h = harness()
  assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-fixture')), { url: `${ORIGIN}${PATH}?verComo=7` }))).status, 400)
  assert.equal(h.counts().parseCalls, 0); memoryOnly(h)
})

test('stream multipart: 4 MiB exact file accepted, +1 denied, huge/lying length, duplicate/extra fields rejected', async () => {
  const h = harness(), exact = Buffer.alloc(h.lib.CONFIRMING_FILE_MAX_BYTES, 32); exact.write('%PDF-')
  assert.equal(h.lib.CONFIRMING_FILE_MAX_BYTES, 4 * 1024 * 1024)
  assert.ok(h.lib.CONFIRMING_BODY_MAX_BYTES < 4_500_000)
  assert.equal((await h.lib.readConfirmingDocumentosMultipart(request(multipart(exact), { chunks: 65536 }))).bytes.length, exact.length)
  assert.equal((await h.route.POST(request(multipart(Buffer.concat([exact, Buffer.from('x')])), { chunks: 65536 }))).status, 413)
  for (const options of [{ length: String(h.lib.CONFIRMING_BODY_MAX_BYTES + 1) }, { length: '10' }, { length: '-1' }]) {
    const response = await h.route.POST(request(multipart(Buffer.from('%PDF-fixture')), options))
    assert([400, 413].includes(response.status))
  }
  for (const extra of [
    `\r\nContent-Disposition: form-data; name="actorId"\r\n\r\n7\r\n--${BOUNDARY}--\r\n`,
    `\r\nContent-Disposition: form-data; name="archivo"; filename="Confirming BBVA second.pdf"\r\n\r\n%PDF-x\r\n--${BOUNDARY}--\r\n`,
  ]) assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-fixture'), 'Confirming BBVA fixture.pdf', extra), { chunks: 7 }))).status, 400)
  assert.equal(h.counts().parseCalls, 0); memoryOnly(h)
})

test('strict multipart header bounds, malformed closures and binary signatures rejected before parse', async () => {
  const h = harness()
  for (const name of ['file.exe', '../Confirming BBVA.pdf', 'C:\\Confirming BBVA.pdf', 'Confirming BBVA.pdf:stream']) {
    assert([400, 415].includes((await h.route.POST(request(multipart(Buffer.from('%PDF-x'), name)))).status))
  }
  assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-x'), 'Confirming BBVA.pdf', '', `\r\nContent-Type: ${'a'.repeat(4200)}`)))).status, 413)
  for (const extension of ['pdf', 'xls', 'xlsx']) assert.equal((await h.route.POST(request(multipart(Buffer.from('NOT-A-BANK-FILE'), `Confirming Caixa.${extension}`)))).status, 415)
  assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-x')).subarray(0, -7)))).status, 400)
  assert.equal((await h.route.POST(request(Buffer.concat([multipart(Buffer.from('%PDF-x')), Buffer.from('extra')])))).status, 400)
  assert.equal((await h.route.POST(request(multipart(Buffer.from('%PDF-x')), { type: 'application/json' }))).status, 415)
  assert.equal(h.counts().parseCalls, 0); memoryOnly(h)
})

test('XLSX expansion/dimension fences and ZIP masquerade do not enter native parser', async () => {
  const h = harness(), bytes = workbook()
  const bomb = Buffer.from(bytes), central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  bomb.writeUInt32LE(26 * 1024 * 1024, central + 24)
  assert.equal((await h.route.POST(request(multipart(bomb, 'Confirming Caixa.xlsx')))).status, 413)
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.json_to_sheet([{ 'Núm. factura': 'DRAX26/900', 'Importe factura': 1 }]); sheet['!ref'] = 'A1:IZ2'
  XLSX.utils.book_append_sheet(book, sheet, 'Oversized')
  const wide = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
  assert.equal((await h.route.POST(request(multipart(wide, 'Confirming Caixa.xlsx')))).status, 413)
  assert.equal(h.counts().parseCalls, 0); memoryOnly(h)
})

test('generic errors are sanitized; other methods never read business data', async () => {
  const h = harness(); h.setFailure()
  const response = await h.route.POST(request(multipart(Buffer.from('%PDF-private'))))
  assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /PRIVATE_DB_ERROR/)
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) assert.equal((await h.route[method]()).status, 405)
  assert.equal(h.counts().parseCalls, 0); memoryOnly(h)
  const clean = harness()
  const invalid = await clean.route.POST(request(multipart(Buffer.from('%PDF-not-a-valid-document'))))
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).codigo, 'CONFIRMING_PARSE_FAILED'); memoryOnly(clean)
})

test('actual component SSR: staging/acting fail closed; no mount-time folder GET/upload or green confirmation', () => {
  const h = harness(), Component = h.load(UI).default
  const render = (props: any) => renderToStaticMarkup(React.createElement(Component, props))
  assert.equal(render({ stagingOnly: false, acting: false, canUpload: true }), '')
  assert.equal(render({ stagingOnly: true, acting: true, canUpload: true }), '')
  const html = render({ stagingOnly: true, acting: false, canUpload: true })
  assert.match(html, /Leer carpetas/); assert.match(html, /Analizar lectura manual/)
  assert.doesNotMatch(html, /Confirmar cobro|btn primary|green|emerald/)
  assert.doesNotMatch(source(UI), /useEffect|localStorage|sessionStorage/)
  assert.match(source(UI), /onClick=\{\(\) => void readFolders\(\)\}/)
  assert.match(source(UI), /fetch\(INVENTORY_API, \{ method: 'GET'/)
  assert.doesNotMatch(source(LIB) + source(MANUAL), /microsoft-graph|openai|confirmarB4|confirmSupport|liquidation-persist|writeFile|\$executeRaw|\.\$transaction/)
  memoryOnly(h)
})
