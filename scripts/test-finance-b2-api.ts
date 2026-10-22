import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const ROOT = process.cwd()
const BASE = 'https://staging.example'
const routePath = 'app/api/admin/finanzas/facturas/calidad/[id]/route.ts'
const historicalId = '10000000-0000-4000-8000-000000000001'
const revisionId = '20000000-0000-4000-8000-000000000002'
const canonicalId = '30000000-0000-4000-8000-000000000003'
const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

class NextRequest extends Request {
  nextUrl: URL
  constructor(input: string, init?: RequestInit) { super(input, init); this.nextUrl = new URL(input) }
}
class KnownRequestError extends Error { code: string; constructor(code: string) { super(code); this.code = code } }
const Prisma = {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: [...strings], values }),
  TransactionIsolationLevel: { Serializable: 'Serializable' },
  PrismaClientKnownRequestError: KnownRequestError,
}

type Invoice = Record<string, any>
type Revision = Record<string, any>
let invoices = new Map<string, Invoice>()
let revisions = new Map<string, Revision>()
let audits: Record<string, any>[] = []
let invoiceCreates = 0
let invoiceUpdates: string[] = []
let revisionUpdates = 0
let isolationCalls = 0
let access: { error?: Response; userId?: number } = { userId: 7 }
const forbiddenModels = { facturaEmitida: 0, movimientoBancario: 0 }

function clone<T>(value: T): T { return structuredClone(value) }
function reset() {
  invoices = new Map(); revisions = new Map(); audits = []; invoiceCreates = 0; invoiceUpdates = []; revisionUpdates = 0; isolationCalls = 0
  access = { userId: 7 }; forbiddenModels.facturaEmitida = 0; forbiddenModels.movimientoBancario = 0
}
function validCorrection(overrides: Record<string, unknown> = {}) {
  return { solicitudId: UUID, version: 1, proveedor: 'Proveedor de pruebas S.L.', cif: 'B-12345678', numFactura: 'B2/2026-1', fecha: '2026-02-28', base: 100, tipoIva: 21, importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121, concepto: 'Corrección sintética', ...overrides }
}
function revision(id = revisionId, overrides: Record<string, unknown> = {}): Revision {
  return { id, version: 1, resueltaAt: null, facturaResueltaId: null, oneDriveItemId: `item-${id}`, oneDriveDriveId: 'drive-synthetic', oneDriveRutaActual: '/privada/factura.pdf', archivoOneDrive: '/privada/factura.pdf', carpetaOrigen: '2. Pendiente', estadoCarpeta: 'PENDIENTE', proveedor: 'ERROR_OCR', cif: null, numFactura: null, fecha: null, base: null, tipoIva: null, importeIva: null, tipoIrpf: null, importeIrpf: null, total: null, concepto: 'ERROR_OCR: prueba', ocrConfianza: 0, datosOcrRaw: '{"concepto":"ERROR_OCR: prueba"}', motivoRevision: 'PROVEEDOR_NO_LEIDO', ...overrides }
}
function invoice(id: string, overrides: Record<string, unknown> = {}): Invoice {
  return { id, proveedor: 'Proveedor de pruebas S.L.', cif: 'B12345678', numFactura: 'B2/2026-1', fecha: new Date('2026-02-28T12:00:00.000Z'), base: 100, tipoIva: 21, importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121, concepto: 'Preexistente', estado: 'PENDIENTE_REVISION', calidad: 'VALIDA', canonKey: 'CIF:B12345678|NUM:B2/2026-1', copiaDeId: null, conflictoIdentidad: false, duplicadoExterno: false, versionCalidad: 1, datosOcrRaw: '{"origen":"preexistente"}', ocrCompletado: false, createdAt: new Date('2026-01-01T12:00:00.000Z'), movimientos: [], confirmingLineas: [], documentosOperadora: [], ...overrides }
}
function plan(rows: Invoice[]) {
  const valid = rows.filter(row => row.calidad === 'VALIDA' && !row.copiaDeId)
  const canonical = [...valid].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0] || null
  const conflict = rows.length > 1 && new Set(rows.map(row => JSON.stringify([row.proveedor.trim().toUpperCase(), row.fecha.toISOString().slice(0, 10), row.base, row.importeIva, row.importeIrpf, row.total]))).size > 1
  return { canonica: canonical, copias: canonical ? rows.filter(row => row.id !== canonical.id) : [], conflicto: conflict }
}
function canon(cif: unknown, number: unknown): string | null {
  if (typeof cif !== 'string' || typeof number !== 'string') return null
  const a = cif.toUpperCase().replace(/[\s._\-/]+/g, ''), b = number.toUpperCase().replace(/\s+/g, '')
  return a && b ? `CIF:${a}|NUM:${b}` : null
}
function fingerprint(value: unknown) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function privateJson(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } }) }
async function bounded(req: Request) {
  const length = req.headers.get('content-length')
  if (length !== null && /^\d+$/.test(length) && Number(length) > 8 * 1024) return { status: 413 }
  try { return { body: JSON.parse(await req.text()) } } catch { return { status: 400 } }
}
function apply(target: Record<string, any>, data: Record<string, any>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) target[key] = (target[key] || 0) + Number((value as any).increment)
    else target[key] = value
  }
}
const tx: any = {
  $queryRaw: async (query: any) => {
    const text = query.strings.join('?')
    const id = query.values[0] as string
    if (text.includes('FROM "revisiones_lectura_facturas_recibidas"')) { const r = revisions.get(id); return r ? [{ id, version: r.version }] : [] }
    if (text.includes('FROM "facturas_recibidas"')) { const f = invoices.get(id); return f ? [{ id, version: f.versionCalidad }] : [] }
    throw new Error(`Consulta mock no despachada: ${text.slice(0, 100)}`)
  },
  auditoriaCalidadFactura: {
    findFirst: async ({ where }: any) => [...audits].reverse().find(row => row.actorId === where.actorId && row.solicitudId === where.solicitudId) || null,
    create: async ({ data }: any) => { const audit = { id: `audit-${audits.length + 1}`, ...clone(data) }; audits.push(audit); return audit },
  },
  facturaRecibida: {
    findUnique: async ({ where }: any) => invoices.get(where.id) || null,
    update: async ({ where, data }: any) => { const item = invoices.get(where.id); if (!item) throw new Error('invoice not found'); const updated = clone(item); apply(updated, data); invoices.set(where.id, updated); invoiceUpdates.push(where.id); return updated },
    create: async ({ data }: any) => { const id = `created-${invoiceCreates + 1}`; const item = { id, createdAt: new Date('2026-03-01T12:00:00.000Z'), versionCalidad: 1, copiaDeId: null, conflictoIdentidad: false, duplicadoExterno: false, ...clone(data) }; invoices.set(id, item); invoiceCreates++; return item },
  },
  revisionLecturaFacturaRecibida: {
    findUnique: async ({ where }: any) => revisions.get(where.id) || null,
    updateMany: async ({ where, data }: any) => { const item = revisions.get(where.id); if (!item || item.version !== where.version || item.resueltaAt || item.facturaResueltaId) return { count: 0 }; apply(item, data); revisionUpdates++; return { count: 1 } },
  },
}
const prisma: any = new Proxy({
  $transaction: async (work: (client: typeof tx) => Promise<unknown>) => {
    const before = { invoices: clone([...invoices]), revisions: clone([...revisions]), audits: clone(audits), invoiceCreates, invoiceUpdates: clone(invoiceUpdates), revisionUpdates }
    try { return await work(tx) } catch (error) { invoices = new Map(before.invoices); revisions = new Map(before.revisions); audits = before.audits; invoiceCreates = before.invoiceCreates; invoiceUpdates = before.invoiceUpdates; revisionUpdates = before.revisionUpdates; throw error }
  },
}, {
  get(target, property, receiver) {
    if (property === 'facturaEmitida' || property === 'movimientoBancario') { forbiddenModels[property]++; throw new Error(`${String(property)} no debe tocarse en B2`) }
    return Reflect.get(target, property, receiver)
  },
})

const source = fs.readFileSync(routePath, 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const module = { exports: {} as any }
vm.runInNewContext(code, {
  module, exports: module.exports, Buffer, Date, URL, TextDecoder, console,
  require(name: string) {
    if (name === 'next/server') return { NextRequest }
    if (name === '@prisma/client') return { Prisma }
    if (name === '@/lib/prisma') return { prisma }
    if (name === '@/lib/finanzas/staging-safety') return { assertFinanceStagingIsolated: async () => { isolationCalls++ } }
    if (name === '@/lib/finanzas/invoice-quality') return {
      esFechaDocumentoIso: (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value,
      esImporteCentimosFinito: (value: unknown) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7,
      fechaDocumentoUtc: (value: string) => new Date(`${value}T12:00:00.000Z`), claveCanonicaFactura: canon,
      totalCuadraEnCentimos: (base: number, iva: number, irpf: number, total: number) => Math.round(total * 100) === Math.round(base * 100) + Math.round(iva * 100) - Math.round(irpf * 100),
    }
    if (name === '@/lib/finanzas/invoice-quality-db') return {
      UUID_V4_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      auditarCambioB2: async (client: any, data: any) => client.auditoriaCalidadFactura.create({ data }), buscarIdentidadBloqueada: async (_client: any, key: string) => [...invoices.values()].filter(row => row.canonKey === key),
      huellaSolicitud: fingerprint, jsonPrivado: privateJson, planDeduplicacion: plan, readBoundedJsonB2: bounded,
      requireFacturaAccess: async () => access.error ? { error: access.error } : { userId: access.userId }, serializeFacturaCalidad: (value: any) => ({ ...value, incluidaEnTotales: value.calidad === 'VALIDA' && !value.copiaDeId }),
    }
    throw new Error(`Módulo no permitido en prueba API B2: ${name}`)
  },
})
const { PATCH } = module.exports as { PATCH: (req: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response> }
function request(id: string, body: unknown, origin = BASE, headers: Record<string, string> = {}) {
  return new NextRequest(`${BASE}/api/admin/finanzas/facturas/calidad/${id}`, { method: 'PATCH', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
async function send(id: string, body: unknown, origin = BASE, headers: Record<string, string> = {}) { return PATCH(request(id, body, origin, headers), { params: Promise.resolve({ id }) }) }
async function status(id: string, body: unknown, origin = BASE, headers: Record<string, string> = {}) { return (await send(id, body, origin, headers)).status }

async function main() {
  // También se revisan los contratos de las rutas GET/PDF finales: ningún PDF B2 es
  // URL pública ni muta OneDrive, y la cola oculta importes de cuarentena.
  const queueSource = fs.readFileSync('app/api/admin/finanzas/facturas/calidad/route.ts', 'utf8')
  const pdfSource = fs.readFileSync('app/api/admin/finanzas/facturas/calidad/[id]/pdf/route.ts', 'utf8')
  assert.match(queueSource, /requireFacturaAccess\(false\)/); assert.match(queueSource, /base: null, importeIva: null, importeIrpf: null, total: null/)
  const pdfExecutable = pdfSource.replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(pdfSource, /requireFacturaAccess\(false\)/); assert.match(pdfSource, /downloadFile\(document\.oneDriveDriveId, document\.oneDriveItemId\)/); assert.match(pdfSource, /private, no-store/); assert.doesNotMatch(pdfExecutable, /archivoUrl/)
  let pdfDownload: string[] = []
  const pdfPrisma = {
    revisionLecturaFacturaRecibida: { findFirst: async ({ where }: any) => where.id === revisionId ? { oneDriveItemId: 'pdf-item', oneDriveDriveId: 'pdf-drive', archivoOneDrive: '/privada/documento.pdf' } : null },
    facturaRecibida: { findFirst: async () => null },
  }
  const pdfModule = { exports: {} as any }
  const pdfCode = ts.transpileModule(pdfSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(pdfCode, { module: pdfModule, exports: pdfModule.exports, Uint8Array, require(name: string) {
    if (name === 'next/server') return { NextRequest, NextResponse: Response }
    if (name === '@/lib/prisma') return { prisma: pdfPrisma }
    if (name === '@/lib/finanzas/microsoft-graph') return { downloadFile: async (drive: string, item: string) => { pdfDownload.push(`${drive}/${item}`); return Buffer.from('%PDF-synthetic') } }
    if (name === '@/lib/finanzas/invoice-quality-db') return { jsonPrivado: privateJson, requireFacturaAccess: async () => ({ userId: 7 }) }
    throw new Error(`Módulo inesperado PDF B2: ${name}`)
  } })
  const PDF_GET = pdfModule.exports.GET as (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>
  const pdf = await PDF_GET(new NextRequest(`${BASE}/api/admin/finanzas/facturas/calidad/${revisionId}/pdf`), { params: Promise.resolve({ id: revisionId }) })
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('cache-control'), 'private, no-store'); assert.equal(pdf.headers.get('content-type'), 'application/pdf'); assert.deepEqual(pdfDownload, ['pdf-drive/pdf-item'])
  assert.equal((await PDF_GET(new NextRequest(`${BASE}/api/admin/finanzas/facturas/calidad/20000000-0000-4000-8000-000000000099/pdf`), { params: Promise.resolve({ id: '20000000-0000-4000-8000-000000000099' }) })).status, 404, 'PDF no revela documentos por otro ID')

  reset(); access = { error: privateJson({ error: 'Sin permiso' }, 403) }
  assert.equal(await status(revisionId, validCorrection()), 403, 'permiso denegado no inicia mutación')
  assert.equal(isolationCalls, 0); assert.equal(audits.length, 0)

  reset(); revisions.set(revisionId, revision())
  assert.equal(await status(revisionId, validCorrection(), 'https://evil.example'), 403, 'origen cruzado rechazado')
  assert.equal(await status(revisionId, validCorrection(), BASE, { 'content-length': '99999' }), 413, 'cuerpo sobredimensionado rechazado antes de transacción')
  assert.equal(await status(revisionId, validCorrection({ version: undefined })), 400, 'version obligatoria')
  assert.equal(await status(revisionId, validCorrection({ solicitudId: 'no-es-uuid' })), 400, 'UUID de solicitud estricto')
  assert.equal(audits.length, 0); assert.equal(invoiceCreates, 0); assert.equal(revisionUpdates, 0)

  reset(); revisions.set(revisionId, revision(revisionId, { version: 2 }))
  assert.equal(await status(revisionId, validCorrection({ version: 1 })), 409, 'conflicto de versión no escribe')
  assert.equal(audits.length, 0); assert.equal(invoiceCreates, 0); assert.equal(revisionUpdates, 0)

  reset(); revisions.set(revisionId, revision()); invoices.set(canonicalId, invoice(canonicalId, { total: 199, importeIva: 99 }))
  assert.equal(await status(revisionId, validCorrection()), 409, 'identidad destino con fecha/importes distintos queda en cola')
  assert.equal(revisions.get(revisionId)?.resueltaAt, null); assert.equal(revisions.get(revisionId)?.facturaResueltaId, null); assert.equal(invoiceCreates, 0); assert.equal(audits.length, 0)

  reset(); revisions.set(revisionId, revision())
  assert.equal(await status(revisionId, validCorrection({ proveedor: 'DESCONOCIDO' })), 400, 'proveedor fallback nunca crea una factura')
  assert.equal(invoiceCreates, 0); assert.equal(revisionUpdates, 0); assert.equal(audits.length, 0)
  const first = await send(revisionId, validCorrection())
  assert.equal(first.status, 201, 'cuarentena válida crea factura canónica')
  const created = await first.json() as any
  assert.equal(created.factura.calidad, 'VALIDA'); assert.equal(invoiceCreates, 1); assert.equal(revisionUpdates, 1); assert.equal(audits.length, 1)
  assert.equal(audits[0].accion, 'RESOLVER_CUARENTENA'); assert.equal(audits[0].revisionId, revisionId); assert.equal(revisions.get(revisionId)?.facturaResueltaId, created.factura.id)
  assert.equal(await status(revisionId, validCorrection()), 200, 'segunda llamada devuelve idempotencia')
  assert.equal(invoiceCreates, 1); assert.equal(revisionUpdates, 1); assert.equal(audits.length, 1, 'idempotencia no duplica auditoría')

  reset(); const oldRaw = '{"concepto":"ERROR_OCR: legado","valor":77}'
  invoices.set(historicalId, invoice(historicalId, { calidad: 'REVISAR_LECTURA', versionCalidad: 3, datosOcrRaw: oldRaw, canonKey: null, proveedor: 'ERROR_OCR', cif: null, numFactura: null, total: 0, base: 0, importeIva: 0 }))
  const historicBody = validCorrection({ version: 3, solicitudId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
  assert.equal(await status(historicalId, historicBody), 201, 'histórico se corrige sobre su ID exacto')
  assert.equal(invoiceCreates, 0, 'histórico no duplica factura'); assert.deepEqual(invoiceUpdates, [historicalId]); assert.equal(invoices.size, 1)
  assert.equal(invoices.get(historicalId)?.calidad, 'VALIDA'); assert.equal(audits.length, 1); assert.equal(audits[0].accion, 'RESOLVER_HISTORICA'); assert.equal(audits[0].facturaId, historicalId)
  assert.equal(audits[0].detalle.antes.datosOcrRaw, oldRaw, 'auditoría conserva el OCR histórico exacto')
  assert.equal(await status(historicalId, historicBody), 200); assert.equal(audits.length, 1); assert.equal(invoiceCreates, 0)
  assert.equal(forbiddenModels.facturaEmitida, 0); assert.equal(forbiddenModels.movimientoBancario, 0, 'B2 no escribe FacturaEmitida ni Movimientos')

  console.log('OK API B2 VM: permisos/origen/tamaño/UUID/versión, conflictos de identidad, cola válida, histórico por ID, auditoría idempotente y aislamiento FacturaEmitida/Movimientos; cero BD/Graph/red.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
