import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createHash } from 'node:crypto'
import {
  COMPARACION_LIMITS, MANUAL_ROOT_COMPARACION, NOMINAS_ROOT_CONOCIDA, RangoComparacionError,
  compararInventariosDocumentales, comparacionDocumentosCsv, crearProveedorPanelComparacion,
  crearProveedoresGraphComparacion, documentoDesdeFilaNativa, ejecutarComparacionDocumental, opaqueDocumentoId, parseRangoComparacion,
  type DocumentoInventarioComparacion, type InventarioComparacion,
} from '../lib/finanzas/documentos-panel-comparacion'
import * as comparison from '../lib/finanzas/documentos-panel-comparacion'

// Todas las dependencias remotas están cerradas. No env, DB, Graph, SQL real ni builds.
let outbound = 0
const originalFetch = globalThis.fetch
globalThis.fetch = (async () => { outbound += 1; throw new Error('PROHIBIDA_RED_REAL') }) as typeof fetch
const range = parseRangoComparacion()
const H = 'a'.repeat(64), H2 = 'b'.repeat(64), ROOT = 'LegacyFacturas2026'
const seenTests: string[] = []
async function test(name: string, fn: () => unknown | Promise<unknown>) { await fn(); seenTests.push(name); console.log(`OK ${name}`) }
function doc(id: string, overrides: Partial<DocumentoInventarioComparacion> = {}): DocumentoInventarioComparacion {
  return { id, nombre: `${id}.pdf`, referencia: { driveId: 'drive-test', itemId: id, path: `${ROOT}/${id}.pdf` }, sha256: H,
    hashProvenancia: 'DB_METADATA', fechaFactura: '2026-11-30', fechaFacturaProvenancia: 'DOCUMENTO', modifiedAt: '2026-11-30T20:00:00Z', createdAt: '2026-11-01', origen: 'synthetic', incidencias: [], ...overrides }
}
function inv(key: InventarioComparacion['key'], documents: readonly DocumentoInventarioComparacion[] = [], overrides: Partial<InventarioComparacion> = {}): InventarioComparacion {
  return { key, scope: key === 'carpetas' ? ROOT : key, completo: true, truncado: false, documentos: documents, incidencias: [], ...overrides }
}
function compare(panel: readonly DocumentoInventarioComparacion[], folders: readonly DocumentoInventarioComparacion[], manual: readonly DocumentoInventarioComparacion[] = []) {
  return compararInventariosDocumentales(range, [inv('panel', panel), inv('carpetas', folders), inv('manual', manual)], '2026-11-26T20:30:00Z')
}
async function run() {
  await test('rango inclusivo <=31 días, calendario y parámetros ISO; semana por defecto', () => {
    assert.deepEqual(range, { from: '2026-11-30', to: '2026-12-04' })
    assert.deepEqual(parseRangoComparacion('2026-01-01', '2026-01-31'), { from: '2026-01-01', to: '2026-01-31' })
    for (const pair of [['2026-01-01', '2026-02-01'], ['2026-12-04', '2026-11-30'], ['2026-02-30', '2026-03-02'], ['2026-11-30', null], ['30/11/2026', '2026-12-04'], ['', '']]) {
      assert.throws(() => parseRangoComparacion(pair[0], pair[1]), RangoComparacionError)
    }
  })
  await test('faltan en panel y carpetas: ID/hash exactos, no importes', () => {
    const result = compare([doc('panel-only', { sha256: H2 })], [doc('legacy-only')])
    assert.equal(result.faltanEnPanel.length, 1); assert.equal(result.faltanEnCarpetas.length, 1)
    assert.equal(result.estado, 'DIFERENCIAS'); assert.equal(result.semanaCompleta, false)
    assert.equal(result.businessWrites, 0); assert.equal(result.imports, 0); assert.equal(result.graphMutations, 0)
  })
  await test('ID Graph presente, misma referencia no cuenta como copia ni certifica semana', () => {
    const result = compare([doc('db:1', { referencia: doc('g1').referencia })], [doc('g1')])
    assert.equal(result.faltanEnPanel.length, 0); assert.equal(result.faltanEnCarpetas.length, 0)
    assert.equal(result.copiasHuella.length, 0); assert.equal(result.coincidencias[0].evidencia, 'REFERENCIA_ID')
    assert.equal(result.alcanceSinFaltas, true); assert.equal(result.semanaCompleta, false)
  })
  await test('SHA256 disponible permite comparar objetos distintos; copias warning sin borrar', () => {
    const result = compare([doc('panel')], [doc('copy1'), doc('copy2')])
    assert.equal(result.faltanEnPanel.length, 0); assert.equal(result.faltanEnCarpetas.length, 0)
    assert.equal(result.coincidencias[0].evidencia, 'SHA256'); assert.equal(result.copiasHuella.length, 1)
    assert.equal(result.copiasHuella[0].documentos.length, 3); assert.match(result.copiasHuella[0].aviso, /no borrar/)
  })
  await test('no hash: NAME_MATCH sólo aviso, no igualdad ni falsa ausencia resuelta', () => {
    const result = compare([doc('p', { nombre: 'igual.pdf', sha256: null })], [doc('f', { nombre: 'igual.pdf', sha256: null })])
    assert.equal(result.faltanEnPanel[0].evidencia, 'NAME_MATCH_NO_VERIFICADO')
    assert.equal(result.faltanEnCarpetas.length, 1); assert.equal(result.NO_VERIFICABLE.length, 2)
    assert.equal(result.hashesCompletos, false); assert.equal(result.alcanceSinFaltas, false); assert.equal(result.estado, 'INCOMPLETO')
  })
  await test('ID sin hash es referencia, nunca igualdad de bytes', () => {
    const d = doc('g', { sha256: null })
    const result = compare([d], [d]); assert.equal(result.faltanEnPanel.length, 0)
    assert.equal(result.coincidencias[0].evidencia, 'REFERENCIA_ID'); assert.equal(result.NO_VERIFICABLE.length, 2)
    assert.equal(result.estado, 'INCOMPLETO')
  })
  await test('fecha factura DOCUMENTO distinta de createdAt; archivo modifiedAt independiente', () => {
    const d = doc('by-doc', { modifiedAt: '2026-10-01T00:00:00Z', createdAt: '2026-01-01' })
    assert.equal(compare([], [d]).faltanEnPanel[0].seleccion, 'FECHA_DOCUMENTO')
    const modified = doc('by-modified', { fechaFactura: '2026-10-01', createdAt: '2026-12-20' })
    assert.equal(compare([], [modified]).faltanEnPanel[0].seleccion, 'MODIFICACION_ARCHIVO')
    assert.equal(compare([], [modified]).faltanEnPanel[0].fechaFactura, '2026-10-01')
    const createdOnly = doc('created-only', { fechaFactura: null, fechaFacturaProvenancia: null, modifiedAt: null, createdAt: '2026-12-01' })
    const result = compare([createdOnly], [])
    assert.equal(result.NO_VERIFICABLE[0].seleccion, 'NO_VERIFICABLE'); assert.equal(result.semanaCompleta, false)
    const outside = doc('outside', { fechaFactura: '2026-10-01', modifiedAt: '2026-10-01T00:00:00Z', createdAt: '2026-12-01' })
    assert.equal(compare([], [outside]).faltanEnPanel.length, 0)
    const historic = doc('historic', { fechaFacturaProvenancia: 'HISTORICA', modifiedAt: null })
    assert.equal(compare([historic], []).NO_VERIFICABLE[0].seleccion, 'NO_VERIFICABLE')
  })
  await test('nombre/hash/ref faltantes no trasladan fecha de una fila ajena', () => {
    const p = doc('p', { nombre: 'igual.pdf', referencia: null, sha256: null })
    const f = doc('f', { nombre: 'igual.pdf', referencia: null, sha256: null, fechaFactura: null, fechaFacturaProvenancia: null, modifiedAt: null })
    const result = compare([p], [f]); assert.equal(result.faltanEnPanel[0].seleccion, 'NO_VERIFICABLE')
  })
  await test('fecha documental panel selecciona objeto Graph referenciado aunque modified fuera', () => {
    const p = doc('p', { referencia: doc('g').referencia, modifiedAt: null })
    const g = doc('g', { fechaFactura: null, fechaFacturaProvenancia: null, modifiedAt: '2026-10-01T00:00:00Z' })
    const result = compare([p], [g]); assert.equal(result.coincidencias.length, 2)
    assert.equal(result.coincidencias.find(r => r.origen === 'synthetic')?.seleccion, 'FECHA_DOCUMENTO')
  })
  await test('drift ruta/hash por ID incluye cambios externos fuera del rango', () => {
    const p = doc('p', { referencia: { driveId: 'drive-test', itemId: 'item', path: `${ROOT}/old.pdf` }, fechaFactura: '2026-10-01', modifiedAt: '2026-10-01T00:00:00Z' })
    const g = doc('item', { referencia: { driveId: 'drive-test', itemId: 'item', path: `${ROOT}/new.pdf` }, sha256: H2, fechaFactura: null, fechaFacturaProvenancia: null, modifiedAt: '2026-10-02T00:00:00Z' })
    const result = compare([p], [g]); assert.equal(result.cambiosFuera.length, 1)
    assert.equal(result.cambiosFuera[0].seleccion, 'FUERA_RANGO'); assert.equal(result.alcanceSinFaltas, false)
    assert.match(result.cambiosFuera[0].motivos.join(' '), /SHA256_DIFIERE/)
  })
  await test('manual namespace no se confunde con carpeta legacy; sin prometer doble archivo', () => {
    const manual = doc('manual', { referencia: { driveId: 'drive-test', itemId: 'manual', path: `${MANUAL_ROOT_COMPARACION}/Pendientes/manual.pdf` } })
    const result = compare([manual], [], [manual]); assert.equal(result.faltanEnCarpetas.length, 1)
    assert.match(result.faltanEnCarpetas[0].motivos.join(' '), /namespace manual/)
    assert.equal(result.faltanEnPanel.length, 0)
  })
  await test('fallo proveedor/descendiente no se silencia; inventario incompleto explícito', async () => {
    const result = await ejecutarComparacionDocumental(range, [
      { key: 'panel', scope: 'panel', read: async () => inv('panel') },
      { key: 'carpetas', scope: ROOT, read: async () => { throw new Error('FAILED_CHILD+SECRET') } },
      { key: 'manual', scope: 'manual', read: async () => inv('manual') },
    ])
    assert.equal(result.resultado.estado, 'INCOMPLETO'); assert.equal(result.resultado.inventarioCompleto, false)
    assert.equal(result.inventarios[1].documentos.length, 0)
    assert.match(result.inventarios[1].incidencias[0], /PROVIDER_READ_FAILED/)
    assert.ok(!JSON.stringify(result).includes('SECRET'))
  })
  await test('truncado y falta proveedor requerido nunca son completos', () => {
    const result = compararInventariosDocumentales(range, [inv('panel'), inv('carpetas', [], { truncado: true, completo: true }), inv('manual')], 'now')
    assert.equal(result.inventarioCompleto, false); assert.equal(result.semanaCompleta, false)
    assert.equal(compararInventariosDocumentales(range, [inv('panel'), inv('carpetas')], 'now').estado, 'INCOMPLETO')
  })
  await test('JSON contractual manual y auditoría documental, no huellaSolicitud', () => {
    const native = documentoDesdeFilaNativa({ id: 'db', datosOcrRaw: JSON.stringify({ schema: 'documentos-panel/v1', hash: H, estado: 'ARCHIVADA', actual: { driveId: 'drive', itemId: 'item', ruta: `${MANUAL_ROOT_COMPARACION}/Archivadas/validada.pdf`, hash: H } }), fecha: new Date('2026-11-30T12:00:00Z'), createdAt: new Date('2026-12-04T12:00:00Z') }, 'RevisionLecturaFacturaRecibida')
    assert.equal(native.sha256, H); assert.equal(native.hashProvenancia, 'JSON_PANEL'); assert.equal(native.fechaFacturaProvenancia, 'DOCUMENTO')
    assert.equal(native.referencia?.itemId, 'item'); assert.equal(native.nombre, 'validada.pdf')
    const auditOnly = documentoDesdeFilaNativa({ id: 'db2' }, 'FacturaRecibida', [{ facturaId: 'db2', huellaSolicitud: H, detalle: { ubicacion: { itemId: 'item' }, hash: H2 } }])
    assert.equal(auditOnly.sha256, H2); assert.equal(auditOnly.hashProvenancia, 'AUDITORIA')
    assert.equal(documentoDesdeFilaNativa({ id: 'db2' }, 'FacturaRecibida', [{ facturaId: 'db2', huellaSolicitud: H, detalle: {} }]).sha256, null)
    const incomplete = documentoDesdeFilaNativa({ id: 'pending', datosOcrRaw: JSON.stringify({ schema: 'documentos-panel/v1', hash: H, estado: 'SUBIDA_RESERVADA' }) }, 'RevisionLecturaFacturaRecibida')
    assert.equal(incomplete.referencia, null); assert.match(incomplete.incidencias.join(' '), /SUBIDA_RESERVADA/)
  })
  await test('DB SELECT metadata paginado y cap conservador; ningún método de escritura', async () => {
    const calls: any[] = []
    const rows = Array.from({ length: COMPARACION_LIMITS.dbRowsPerModel + 1 }, (_, n) => ({ id: `row-${String(n).padStart(5, '0')}` }))
    const model = { async findMany(args: any) { calls.push(args); assert.ok(args.take <= COMPARACION_LIMITS.dbPage); assert.ok(args.skip >= 0); assert.equal(args.select.total, undefined); assert.equal(args.select.base, undefined); return rows.slice(args.skip, args.skip + args.take) } }
    const empty = { findMany: async () => [] }
    const provider = crearProveedorPanelComparacion({ facturaRecibida: model, revisionLecturaFacturaRecibida: empty, auditoriaCalidadFactura: empty })
    const result = await provider.read(range)
    assert.equal(result.completo, false); assert.equal(result.truncado, true); assert.equal(result.documentos.length, 5000)
    assert.ok(calls.some(c => c.skip === 5000 && c.take === 1))
    assert.equal(calls[0].orderBy.id, 'asc')
    const exactly = crearProveedorPanelComparacion({ facturaRecibida: { findMany: async (a: any) => rows.slice(0, 5000).slice(a.skip, a.skip + a.take) }, revisionLecturaFacturaRecibida: empty, auditoriaCalidadFactura: empty })
    assert.equal((await exactly.read(range)).completo, true)
  })
  await test('MVP no devuelve nóminas: omite registro protegido y no consulta modelos payroll', async () => {
    const empty = { findMany: async () => [] }, protectedRefs = new Set<string>()
    const provider = crearProveedorPanelComparacion({ facturaRecibida: empty,
      revisionLecturaFacturaRecibida: { findMany: async () => [{ id: 'protected', oneDriveDriveId: 'drive-test', oneDriveItemId: 'private-payroll', oneDriveRutaActual: 'private-nombre.pdf', datosOcrRaw: JSON.stringify({ schema: 'documentos-panel/v1', tipo: 'NOMINA', hash: H }) }] },
      auditoriaCalidadFactura: empty,
      nominaDocumento: { findMany: async () => { throw new Error('PAYROLL_QUERY_FORBIDDEN') } },
    }, false, 'drive-test', protectedRefs)
    const inventory = await provider.read(range)
    assert.equal(inventory.completo, false); assert.equal(inventory.documentos.length, 0)
    assert.ok(!JSON.stringify(inventory).includes('private-nombre'))
    assert.ok(protectedRefs.has('drive-test\u0000private-payroll'))
  })
  await test('Graph oficial exacto, recursive true, manual/nóminas sólo scope conocido y hashes acotados', async () => {
    const listing: any[] = [], hashing: any[] = []; let resolved = 0
    const bytes = Buffer.from('archivo sintetico'), sha = createHash('sha256').update(bytes).digest('hex')
    const graph = { resolveInvoiceLibrary: async () => { resolved += 1; return { driveId: 'drive-test', rootPath: ROOT } },
      listFolderContents: async (driveId: string, path: string, recursive: boolean) => { listing.push({ driveId, path, recursive }); return [{ id: 'file-1', name: 'archivo.pdf', fullPath: `${path}/archivo.pdf`, size: bytes.length, lastModifiedDateTime: '2026-12-01T00:00:00Z' }] },
      readBytes: async (driveId: string, itemId: string, max: number) => { hashing.push({ driveId, itemId, max }); return bytes },
    }
    const providers = crearProveedoresGraphComparacion(graph, ROOT, true)
    for (const p of providers) { const i = await p.read(range); assert.equal(i.completo, true); assert.equal(i.documentos[0].sha256, sha) }
    assert.equal(resolved, 1); assert.deepEqual(listing.map(c => c.path), [ROOT, MANUAL_ROOT_COMPARACION, NOMINAS_ROOT_CONOCIDA])
    assert.ok(listing.every(c => c.recursive === true)); assert.ok(hashing.every(c => c.max <= COMPARACION_LIMITS.hashBytesPerFile))
    const noPayroll = crearProveedoresGraphComparacion(graph, ROOT, false)
    const p = await noPayroll[2].read(range); assert.equal(p.completo, false); assert.equal(listing.length, 3)
  })
  await test('hash de puntero en semana documental aunque modifiedAt sea anterior', async () => {
    const selected = new Set<string>(), protectedRefs = new Set<string>(), empty = { findMany: async () => [] }
    const panel = crearProveedorPanelComparacion({ facturaRecibida: { findMany: async () => [{ id: 'invoice', oneDriveDriveId: 'drive-test', oneDriveItemId: 'old-file', fecha: new Date('2026-12-01T12:00:00Z'), fechaProvenancia: 'DOCUMENTO' }] }, revisionLecturaFacturaRecibida: empty, auditoriaCalidadFactura: empty }, false, 'drive-test', protectedRefs, selected)
    await panel.read(range); assert.ok(selected.has('drive-test\u0000old-file'))
    let reads = 0
    const graph = crearProveedoresGraphComparacion({ resolveInvoiceLibrary: async () => ({ driveId: 'drive-test', rootPath: ROOT }), listFolderContents: async () => [{ id: 'old-file', name: 'old.pdf', fullPath: `${ROOT}/old.pdf`, size: 1, lastModifiedDateTime: '2026-10-01T00:00:00Z' }], readBytes: async () => { reads += 1; return Buffer.from('x') } }, ROOT, false, protectedRefs, selected)
    const inventory = await graph[0].read(range)
    assert.equal(reads, 1); assert.equal(inventory.documentos[0].hashProvenancia, 'BYTES_GRAPH')
  })
  await test('Graph child failure, wrong root, invalid metadata and cap never falsely complete', async () => {
    const base = { resolveInvoiceLibrary: async () => ({ driveId: 'drive-test', rootPath: ROOT }) }
    const fail = crearProveedoresGraphComparacion({ ...base, listFolderContents: async () => { throw new Error('child failed') } }, ROOT)[0]
    await assert.rejects(() => fail.read(range), /child failed/)
    const wrong = crearProveedoresGraphComparacion({ resolveInvoiceLibrary: async () => ({ driveId: 'drive-test', rootPath: 'other' }), listFolderContents: async () => [] }, ROOT)[0]
    await assert.rejects(() => wrong.read(range), /GRAPH_ROOT_MISMATCH/)
    const bad = crearProveedoresGraphComparacion({ ...base, listFolderContents: async () => [{ id: 'id', name: 'a.pdf', fullPath: 'unapproved/a.pdf' }] }, ROOT)[0]
    await assert.rejects(() => bad.read(range), /GRAPH_SCOPE_METADATA_INVALID/)
    const many = crearProveedoresGraphComparacion({ ...base, listFolderContents: async () => Array.from({ length: 5001 }, (_, n) => ({ id: String(n), name: `${n}.pdf`, fullPath: `${ROOT}/${n}.pdf` })) }, ROOT)[0]
    const result = await many.read(range); assert.equal(result.documentos.length, 5000); assert.equal(result.completo, false); assert.equal(result.truncado, true)
  })
  await test('Hash cap y archivo ilegible no ocultan falta de verificación', async () => {
    const graph = { resolveInvoiceLibrary: async () => ({ driveId: 'drive-test', rootPath: ROOT }),
      listFolderContents: async () => Array.from({ length: 41 }, (_, n) => ({ id: String(n), name: `${n}.pdf`, fullPath: `${ROOT}/${n}.pdf`, size: 1, lastModifiedDateTime: '2026-12-01T00:00:00Z' })), readBytes: async () => Buffer.from('x') }
    const inventory = await crearProveedoresGraphComparacion(graph, ROOT)[0].read(range)
    assert.equal(inventory.completo, true); assert.equal(inventory.documentos[40].sha256, null); assert.match(inventory.documentos[40].incidencias[0], /HASH_CAP/)
    assert.equal(compare([], inventory.documentos).hashesCompletos, false)
    const unreadable = await crearProveedoresGraphComparacion({ ...graph, readBytes: async () => { throw new Error('secret') } }, ROOT)[0].read(range)
    assert.match(unreadable.documentos[0].incidencias[0], /HASH_READ_FAILED/)
    assert.ok(!JSON.stringify(unreadable).includes('secret'))
  })
  await test('CSV mínimo seguro, IDs opacos, sin raw IDs, webUrl, descarga ni credenciales', () => {
    const result = compare([], [doc('SECRET_RAW_GRAPH_ITEM', { nombre: '=HYPERLINK("evil")' })])
    assert.match(result.faltanEnPanel[0].id, /^[a-f0-9]{32}$/)
    assert.ok(!JSON.stringify(result).includes('SECRET_RAW_GRAPH_ITEM'))
    const csv = comparacionDocumentosCsv(result)
    assert.match(csv, /semana_completa/); assert.match(csv, /'=/); assert.ok(!csv.includes('archivoUrlPrivada'))
    assert.ok(!csv.includes('SECRET_RAW_GRAPH_ITEM')); assert.ok(!csv.includes('Bearer'))
    assert.ok(!csv.includes('https://')); assert.ok(csv.endsWith('\r\n'))
  })

  // La ruta real se transpila en VM y sólo puede importar mocks de lectura permitidos.
  const routeFile = 'app/api/admin/finanzas/documentos/comparacion/route.ts'
  const source = fs.readFileSync(routeFile, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  let authenticated = true, active = true, invoiceRead = true, b4Read = true, payrollRead = false, stage = true, acting = false
  let providerReads = 0, bytesReads = 0, stageChecks = 0, dbReads = 0
  let downloadSize = 1, oversizedReport = false, nativeLimitError = false
  class StageError extends Error { status = 404; code = 'STAGING_PROTOTYPE_ONLY' }
  class DownloadError extends Error { code = 'ARCHIVO_FUERA_DE_LIMITE' }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const emptyDb = { findMany: async (args: any) => { dbReads += 1; assert.ok(args.select); assert.ok(args.take > 0); return [] } }
  const fakeDb = new Proxy({ facturaRecibida: emptyDb, revisionLecturaFacturaRecibida: emptyDb, auditoriaCalidadFactura: emptyDb, nominaDocumento: emptyDb, documentoEmpleado: emptyDb }, { get(target, key) { if (key in target) return (target as any)[key]; throw new Error(`NO_DB_WRITES_OR_OTHER_MODELS: ${String(key)}`) } })
  const mocks: Record<string, any> = {
    'next/server': {},
    'next-auth': { getServerSession: async () => authenticated ? { user: { id: '7', userType: 'admin', role: 'STALE_ROLE' }, ...(acting ? { impersonation: {} } : {}) } : null },
    '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { __esModule: true, default: fakeDb },
    '@/lib/api-admin-area-read': { checkAdminAreaRead: async (area: string, _roles: any, session: any) => { assert.equal(session.user.role, 'LIVE_ROLE'); return (area === 'admin.finanzas.facturas' ? invoiceRead : payrollRead) ? null : json({ error: 'denied' }, 403) } },
    '@/lib/finanzas/prototype-staging': { PrototypeStagingError: StageError, assertPrototypeStaging: async () => { stageChecks += 1; if (!stage) throw new StageError() } },
    '@/lib/finanzas/reconciliation-auth': { privateJson: json, requireB4FinanceAccess: async (kind: string, session: any) => { assert.equal(kind, 'lectura'); return session && active && b4Read ? { actor: { id: 7, rol: 'LIVE_ROLE', roles: [] } } : { response: json({ error: 'denied' }, session && active ? 403 : 401) } } },
    '@/lib/finanzas/microsoft-graph': { FACTURAS_BASE_PATH: ROOT, resolveInvoiceLibrary: async () => { providerReads += 1; return { driveId: 'drive-test', rootPath: ROOT } }, listFolderContents: async (_drive: string, path: string, recursive: boolean) => { providerReads += 1; assert.equal(recursive, true); return [{ id: 'private-file', name: 'p.pdf', fullPath: `${path}/p.pdf`, size: 1, lastModifiedDateTime: '2026-12-01T00:00:00Z' }] } },
    '@/lib/finanzas/descarga-privada-graph': { DescargaPrivadaGraphError: DownloadError, descargarGraphPrivadoAcotado: async (_drive: string, _item: string, max: number) => { bytesReads += 1; assert.equal(max, 4 * 1024 * 1024); if (nativeLimitError) throw new DownloadError(); return Buffer.alloc(downloadSize, 'x') } },
    '@/lib/finanzas/documentos-panel-comparacion': { ...comparison, ejecutarComparacionDocumental: async (...args: Parameters<typeof ejecutarComparacionDocumental>) => {
      const result = await ejecutarComparacionDocumental(...args)
      if (oversizedReport) result.resultado = { ...result.resultado, avisos: ['x'.repeat(4 * 1024 * 1024)] }
      return result
    } },
  }
  const routeExports: any = {}
  const context = vm.createContext({ exports: routeExports, require: (name: string) => { if (!(name in mocks)) throw new Error(`UNEXPECTED_IMPORT ${name}`); return mocks[name] }, Response, Headers, URL, Buffer, console, process: { env: { SHAREPOINT_DRIVE_ID: 'drive-test' } } })
  new vm.Script(code, { filename: routeFile }).runInContext(context)
  const req = (search = '', headers: Record<string, string> = {}) => ({ nextUrl: new URL(`https://stage.test/api/admin/finanzas/documentos/comparacion${search}`), headers: new Headers(headers) })
  const expectClosed = async (request: any, expected: number) => {
    const before = { providerReads, dbReads, bytesReads }
    const response = await routeExports.GET(request); assert.equal(response.status, expected)
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual({ providerReads, dbReads, bytesReads }, before)
  }
  await test('GET exige autenticación activa VFactura+B4Read, staging y no acting antes de providers', async () => {
    authenticated = false; await expectClosed(req(), 401); authenticated = true
    active = false; await expectClosed(req(), 401); active = true
    b4Read = false; await expectClosed(req(), 403); b4Read = true
    invoiceRead = false; await expectClosed(req(), 403); invoiceRead = true
    acting = true; await expectClosed(req(), 403); acting = false
    await expectClosed(req('', { 'x-io-acting-session': '' }), 403)
    await expectClosed(req('?verComo=8'), 403)
    await expectClosed(req('?actingAs=8'), 403)
    await expectClosed(req('?actorId=8'), 403)
    stage = false; await expectClosed(req(), 404); stage = true
  })
  await test('GET rango/format/ID duplicado inválido400; no Graph ni DB documentos', async () => {
    for (const search of ['?from=2026-01-01&to=2026-02-01', '?from=2026-11-30', '?from=2026-11-30&from=2026-11-30&to=2026-12-04', '?drive=evil', '?format=xlsx', '?archivo=realGraphId', `?archivo=${'a'.repeat(32)}&format=csv`]) await expectClosed(req(search), 400)
  })
  await test('GET permitido sólo lecturas; nóminas denegadas explícitas y error naranja', async () => {
    const response = await routeExports.GET(req()); assert.equal(response.status, 200)
    const result = await response.json(); assert.equal(result.version, 'documentos-comparacion/v1')
    assert.equal(result.estado, 'INCOMPLETO'); assert.equal(result.semanaCompleta, false)
    assert.equal(result.businessWrites, 0); assert.equal(result.graphMutations, 0)
    assert.equal(result.inventoryCompleteness.find((i: any) => i.proveedor === 'nominas').completo, false)
    assert.ok(providerReads > 0); assert.ok(dbReads > 0); assert.ok(stageChecks > 0)
    assert.ok(!JSON.stringify(result).includes('private-file')); assert.ok(!JSON.stringify(result).includes('drive-test'))
  })
  await test('CSV servidor y archivo por inventario privado; ID DB huérfano rechazado', async () => {
    const csv = await routeExports.GET(req('?format=csv')); assert.equal(csv.status, 200)
    assert.match(csv.headers.get('content-type')!, /text\/csv/); assert.match(await csv.text(), /semana_completa/)
    const first = await routeExports.GET(req()); const result = await first.json(); const id = result.faltanEnPanel[0].id
    const download = await routeExports.GET(req(`?archivo=${id}`)); assert.equal(download.status, 200)
    assert.equal(download.headers.get('content-type'), 'application/octet-stream'); assert.equal(await download.text(), 'x')
    const invalid = await routeExports.GET(req(`?archivo=${'0'.repeat(32)}`)); assert.equal(invalid.status, 404)
    assert.ok(!download.headers.has('location'))
  })
  await test('Vercel: descarga exacta 4 MiB, +1 y error nativo413; informe grande nunca truncado/verde', async () => {
    assert.equal(COMPARACION_LIMITS.hashBytesPerFile, 4 * 1024 * 1024)
    const result = await (await routeExports.GET(req())).json(), id = result.faltanEnPanel[0].id
    downloadSize = 4 * 1024 * 1024
    const exact = await routeExports.GET(req(`?archivo=${id}`)); assert.equal(exact.status, 200)
    assert.equal((await exact.arrayBuffer()).byteLength, downloadSize)
    downloadSize += 1
    assert.equal((await routeExports.GET(req(`?archivo=${id}`))).status, 413)
    downloadSize = 1; nativeLimitError = true
    assert.equal((await routeExports.GET(req(`?archivo=${id}`))).status, 413)
    nativeLimitError = false; oversizedReport = true
    for (const query of ['', '?format=csv']) {
      const response = await routeExports.GET(req(query)); assert.equal(response.status, 413)
      const body = await response.json(); assert.equal(body.semanaCompleta, false)
      assert.equal(body.codigo, 'DOCUMENTOS_COMPARACION_RESPONSE_LIMIT')
    }
    oversizedReport = false
  })
  await test('métodos mutadores405 sin lectura ni writes, UI sólo fetch manual y CSV snapshot', async () => {
    const before = { dbReads, providerReads, bytesReads }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await routeExports[method]()).status, 405)
    assert.deepEqual({ dbReads, providerReads, bytesReads }, before)
    const ui = fs.readFileSync('components/finanzas/conciliar-unificado/DocumentosComparacion.tsx', 'utf8')
    assert.equal((ui.match(/await fetch\(/g) ?? []).length, 1)
    assert.match(ui, /onClick=\{\(\) => void compare\(\)\}/); assert.match(ui, /useEffect\(\(\) => \{ if \(!allowed\)/)
    assert.ok(!ui.includes('bg-green')); assert.match(ui, /bg-orange-50/); assert.match(ui, /Semana completa: NO CERTIFICADA/)
    assert.match(ui, /csvSnapshot\(result\)/); assert.match(ui, /eligible\?: boolean; canRead\?: boolean; acting\?: boolean/)
    assert.ok(!source.includes('readMailbox')); assert.ok(!source.includes('$transaction')); assert.ok(!source.includes('.create('))
  })
  assert.equal(outbound, 0)
  console.log(`PASS ${seenTests.length} pruebas sintéticas; red real=0, DB real=0, Graph real=0, escrituras=0.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { globalThis.fetch = originalFetch })
