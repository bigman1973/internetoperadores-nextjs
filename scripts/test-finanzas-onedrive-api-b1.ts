import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import * as inventoryHelpers from '../lib/finanzas/onedrive-inventory';
import { FACTURAS_BASE_PATH } from '../lib/finanzas/microsoft-graph';

const routeSource = fs.readFileSync('app/api/admin/finanzas/sincronizar-onedrive/route.ts', 'utf8');
const routeCode = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const originalEnv = {
  vercel: process.env.VERCEL_ENV,
  sandbox: process.env.FINANCE_STAGING_SANDBOX,
};
const originalFetch = globalThis.fetch;
let outboundAttempts = 0;
globalThis.fetch = (async () => {
  outboundAttempts += 1;
  throw new Error('B1 synthetic API test forbids every outbound request');
}) as typeof fetch;

const userId = 41;
const session = { user: { id: String(userId), userType: 'admin', role: 'SUPER_ADMIN' } };
let authenticated = true;
let active = true;
let readable = true;
let writable = true;
let databaseIdentity = { db: 'io_staging_finanzas', usuario: 'io_staging_finanzas' };
let folderFailures = new Set<string>();
let listCalls = 0;
let downloadCalls = 0;
let ocrCalls = 0;
const lockQueries: string[] = [];
const updatePayloads: Array<{ id: string; data: Record<string, unknown> }> = [];

type Location = {
  carpetaOrigen: string | null;
  archivoOneDrive: string | null;
  oneDriveDriveId: string | null;
  oneDriveRutaActual: string | null;
  estadoCarpeta: string | null;
  etiquetaMateriales: boolean;
};
type Invoice = Location & {
  id: string;
  oneDriveItemId: string | null;
  total: number;
  estado: string;
  imputadoAVentas: boolean;
  deducibleIva: boolean;
  ocrCompletado: boolean;
};
type History = { facturaId: string; autorId: number; motivo: string; anterior: Record<string, unknown>; actual: Record<string, unknown>; createdAt: Date; id: string };
type State = { invoices: Record<string, Invoice>; histories: History[]; folders: Record<string, any[]> };

const metadataKeys = ['carpetaOrigen', 'archivoOneDrive', 'oneDriveDriveId', 'oneDriveRutaActual', 'estadoCarpeta', 'etiquetaMateriales'];
const writableLocationKeys = new Set(metadataKeys);

function invoice(id: string, itemId: string | null, changes: Partial<Invoice> = {}): Invoice {
  return {
    id,
    oneDriveItemId: itemId,
    carpetaOrigen: 'Etiqueta anterior',
    archivoOneDrive: 'ruta/anterior.pdf',
    oneDriveDriveId: 'synthetic-drive',
    oneDriveRutaActual: 'ruta/anterior.pdf',
    estadoCarpeta: 'PENDIENTE_CONTABILIZAR',
    etiquetaMateriales: false,
    total: 987.65,
    estado: 'PAGADA',
    imputadoAVentas: true,
    deducibleIva: false,
    ocrCompletado: false,
    ...changes,
  };
}

function emptyFolders(): Record<string, any[]> {
  return Object.fromEntries(Object.keys(inventoryHelpers.INVOICE_FOLDERS).map(key => [key, []]));
}

function initialState(): State {
  const folders = emptyFolders();
  folders.pendiente = [
    item('located', 'situacion.pdf', `${FACTURAS_BASE_PATH}/${inventoryHelpers.INVOICE_FOLDERS.pendiente.nombre}/Proveedor`),
    item('pending-new', 'nueva.pdf'),
    item('not-an-invoice', 'nota.txt'),
  ];
  folders.materiales = [item('material-new', 'material.PDF')];
  folders.confirming_draxton = [item('confirming-new', 'confirming.pdf')];
  folders.trimestre1 = [item('t1-new', 't1.pdf')];
  folders.trimestre2 = [item('t2-new', 't2.pdf')];
  folders.trimestre3 = [item('t3-new', 't3.pdf')];
  folders.trimestre4 = [item('t4-new', 't4.pdf')];
  folders.raiz = [item('root-new', 'raiz.pdf', FACTURAS_BASE_PATH), item('root-note', 'readme.md', FACTURAS_BASE_PATH)];
  return { invoices: { located: invoice('located', 'located') }, histories: [], folders };
}

let state = initialState();

function item(id: string, name: string, relativeFolderPath?: string) {
  const folder = relativeFolderPath || `${FACTURAS_BASE_PATH}/${inventoryHelpers.INVOICE_FOLDERS.pendiente.nombre}`;
  return { id, name, relativeFolderPath: folder, fullPath: `${folder}/${name}`, file: { mimeType: 'application/pdf' } };
}

function cloneInvoice(row: Invoice): Invoice { return structuredClone(row); }
function sqlText(value: any): string {
  if (Array.isArray(value) || Array.isArray(value?.strings)) return (value.strings || value).join('?');
  return String(value);
}

function rawQuery(value: any): any[] {
  const query = sqlText(value);
  if (query.includes('current_database()')) return [structuredClone(databaseIdentity)];
  throw new Error(`Unexpected synthetic root SQL: ${query}`);
}

const tx: any = {
  $queryRaw: async (query: any) => {
    const text = sqlText(query);
    lockQueries.push(text);
    assert.match(text, /SELECT id FROM facturas_recibidas WHERE id = .+ FOR UPDATE/, 'row lock must select a concrete row, never return void');
    return [{ id: 'locked-synthetic-row' }];
  },
  facturaRecibida: {
    findUnique: async ({ where }: any) => state.invoices[where.id] ? cloneInvoice(state.invoices[where.id]) : null,
    update: async ({ where, data }: any) => {
      const keys = Object.keys(data);
      assert.ok(keys.length > 0 && keys.every(key => writableLocationKeys.has(key)), `location operation may only update metadata, got: ${keys.join(', ')}`);
      const current = state.invoices[where.id];
      assert.ok(current, 'synthetic invoice must exist');
      Object.assign(current, data);
      updatePayloads.push({ id: where.id, data: structuredClone(data) });
      return cloneInvoice(current);
    },
    create: async () => { throw new Error('GUARD: OCR creation is forbidden in soloUbicaciones B1 tests'); },
    updateMany: async () => { throw new Error('GUARD: bulk invoice writes are forbidden'); },
    delete: async () => { throw new Error('GUARD: invoice deletes are forbidden'); },
  },
  historialUbicacionFacturaRecibida: {
    create: async ({ data }: any) => {
      const history: History = { id: `history-${state.histories.length + 1}`, createdAt: new Date('2026-06-01T00:00:00.000Z'), ...structuredClone(data) };
      state.histories.push(history);
      return history;
    },
  },
};

const prisma: any = {
  usuarioAdmin: { findUnique: async () => ({ activo: active }) },
  facturaRecibida: {
    findMany: async () => Object.values(state.invoices).filter(row => row.oneDriveItemId !== null).map(cloneInvoice),
    ...tx.facturaRecibida,
  },
  historialUbicacionFacturaRecibida: {
    findMany: async ({ where }: any) => state.histories.filter(row => row.facturaId === where.facturaId).map(row => structuredClone(row)),
  },
  $queryRaw: async (query: any) => rawQuery(query),
  $transaction: async (fn: any) => {
    const before = structuredClone(state);
    const updateCount = updatePayloads.length;
    const lockCount = lockQueries.length;
    try { return await fn(tx); }
    catch (error) {
      state = before;
      updatePayloads.splice(updateCount);
      lockQueries.splice(lockCount);
      throw error;
    }
  },
};

const graph = {
  FACTURAS_BASE_PATH,
  resolveInvoiceLibrary: async () => ({
    siteId: 'synthetic-site', siteName: 'Synthetic site', driveId: 'synthetic-drive',
    driveName: 'Synthetic library', rootPath: FACTURAS_BASE_PATH, rootFolderId: 'synthetic-root',
  }),
  listFolderContents: async (_driveId: string, path: string) => {
    listCalls += 1;
    const key = Object.entries(inventoryHelpers.INVOICE_FOLDERS).find(([, config]) =>
      path === (config.nombre === 'Raíz 2026' ? FACTURAS_BASE_PATH : `${FACTURAS_BASE_PATH}/${config.nombre}`),
    )?.[0];
    assert.ok(key, `unexpected synthetic folder path: ${path}`);
    if (folderFailures.has(key!)) throw new Error(`synthetic unreadable folder: ${key}`);
    return structuredClone(state.folders[key!]);
  },
  downloadFile: async () => {
    downloadCalls += 1;
    throw new Error('GUARD: downloads/OCR must not run with soloUbicaciones=true');
  },
};

function permission(write: boolean) {
  return async () => (write ? writable : readable) ? null : NextResponse.json({ error: 'denied' }, { status: 403 });
}

function execute(code: string, require: (name: string) => any) {
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, TextEncoder, TextDecoder, console, process, require });
  return module.exports;
}

const routeModule = execute(routeCode, (name: string): any => {
  if (name === 'next/server') return { NextRequest, NextResponse };
  if (name === 'next-auth') return { getServerSession: async () => authenticated ? session : null };
  if (name === '@prisma/client') return { Prisma };
  if (name === '@/lib/prisma') return { __esModule: true, default: prisma, prisma };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/lib/api-admin-area-read') return { checkAdminAreaRead: permission(false), checkAdminAreaWrite: permission(true) };
  if (name === '@/lib/finanzas/microsoft-graph') return graph;
  if (name === '@/lib/finanzas/ocr-facturas') return { extraerDatosFactura: async () => { ocrCalls += 1; throw new Error('GUARD: OCR forbidden'); } };
  if (name === '@/lib/finanzas/onedrive-inventory') return inventoryHelpers;
  throw new Error(`Unexpected module ${name}`);
});
const { GET, POST } = routeModule;

function get(query = '') { return GET(new NextRequest(`https://panel.synthetic/api/admin/finanzas/sincronizar-onedrive${query}`)); }
function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new NextRequest('https://panel.synthetic/api/admin/finanzas/sincronizar-onedrive', {
    method: 'POST',
    headers: { origin: 'https://panel.synthetic', 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}
function postChunks(chunks: string[], headers: Record<string, string> = {}) {
  const encoded = chunks.map(chunk => new TextEncoder().encode(chunk));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of encoded) controller.enqueue(chunk); controller.close(); },
  });
  return POST(new NextRequest('https://panel.synthetic/api/admin/finanzas/sincronizar-onedrive', {
    method: 'POST',
    headers: { origin: 'https://panel.synthetic', 'content-type': 'application/json', ...headers },
    body: stream,
    // Explicitly exercise the chunked path: no Content-Length header is supplied.
    duplex: 'half',
  } as RequestInit));
}
async function expectStatus(response: Promise<Response>, status: number): Promise<Response> {
  const value = await response;
  assert.equal(value.status, status);
  assert.equal(value.headers.get('cache-control'), 'private, no-store');
  return value;
}
function reset(): void {
  state = initialState();
  folderFailures = new Set();
  listCalls = 0;
  downloadCalls = 0;
  ocrCalls = 0;
  lockQueries.splice(0);
  updatePayloads.splice(0);
  databaseIdentity = { db: 'io_staging_finanzas', usuario: 'io_staging_finanzas' };
}
function financialSnapshot(row: Invoice) {
  return { total: row.total, estado: row.estado, imputadoAVentas: row.imputadoAVentas, deducibleIva: row.deducibleIva, ocrCompletado: row.ocrCompletado };
}

async function testAuthAndRequestGuards(): Promise<void> {
  reset();
  authenticated = false; await expectStatus(get(), 401); await expectStatus(post({}), 401);
  authenticated = true; active = false; await expectStatus(get(), 401); await expectStatus(post({}), 401); active = true;
  readable = false; await expectStatus(get(), 403); readable = true;
  writable = false; await expectStatus(post({}), 403);
  const readOnly = await expectStatus(get(), 200);
  assert.equal((await readOnly.json()).canWrite, false, 'read is allowed but must not advertise write access');
  writable = true;

  // The route rejects origin, media type, byte length, JSON and every invalid parameter before inventory/mutations.
  await expectStatus(post({}, { origin: 'https://foreign.synthetic' }), 403);
  await expectStatus(post({}, { 'content-type': 'text/plain' }), 415);
  await expectStatus(post('{'), 400);
  await expectStatus(post(' '.repeat(4097)), 413);
  const beforeOversizedInventory = listCalls;
  await expectStatus(postChunks(['{"carpeta":"', 'x'.repeat(4090), '"}']), 413);
  await expectStatus(post('x'.repeat(4097), { 'content-length': '4097' }), 413);
  assert.equal(listCalls, beforeOversizedInventory, 'oversized request guards must run before inventory');
  for (const body of [null, [], { limite: 0 }, { limite: 21 }, { limite: 1.1 }, { soloUbicaciones: 'yes' }, { carpeta: 'other' }]) {
    await expectStatus(post(body), 400);
  }
  assert.equal(updatePayloads.length, 0);
  assert.equal(state.histories.length, 0);

  await expectStatus(get(`?facturaId=${'x'.repeat(101)}`), 400);
  state.histories.push({ id: 'h-existing', facturaId: 'located', autorId: userId, motivo: 'EXISTENTE', anterior: {}, actual: {}, createdAt: new Date() });
  const history = await expectStatus(get('?facturaId=located'), 200);
  assert.equal((await history.json()).historial.length, 1);
  state.histories.splice(0);
}

async function testCompleteAndIncompleteInventory(): Promise<void> {
  reset();
  folderFailures.add('trimestre3');
  const partial = await expectStatus(get(), 200);
  const partialBody = await partial.json();
  assert.equal(partialBody.inventarioCompleto, false);
  assert.equal(partialBody.errores.length, 1);
  assert.equal(partialBody.errores[0].carpeta, 'trimestre3');
  for (const total of ['totalNuevos', 'totalArchivos', 'totalImportados', 'totalAdmitidos']) assert.equal(partialBody[total], null, `${total} must be null for any incomplete inventory`);
  assert.equal(partialBody.trimestre3.total, null);

  folderFailures.clear();
  const complete = await expectStatus(get(), 200);
  const body = await complete.json();
  assert.equal(body.inventarioCompleto, true);
  assert.equal(Object.keys(inventoryHelpers.INVOICE_FOLDERS).length, 8, 'the complete inventory includes seven configured folders plus the 2026 root');
  assert.equal(body.totalArchivos, 11, 'all non-folder Graph items count as inventory files');
  assert.equal(body.totalAdmitidos, 9, 'only allowed invoice extensions count as admitted');
  assert.equal(body.totalImportados, 1);
  assert.equal(body.totalNuevos, 8);
  assert.equal(body.pendiente.admitidos, 2);
  assert.equal(body.raiz.admitidos, 1);
  assert.equal(body.raiz.total, 2);
}

async function testMetadataOnlyLocationsAndIdempotency(): Promise<void> {
  reset();
  const before = financialSnapshot(state.invoices.located);
  const first = await expectStatus(post({ carpeta: 'pendiente', limite: 1, soloUbicaciones: true }), 200);
  const result = await first.json();
  assert.deepEqual({ procesados: result.procesados, errores: result.errores, ubicacionesActualizadas: result.ubicacionesActualizadas, normalizadas: result.normalizadas }, {
    procesados: 0, errores: 0, ubicacionesActualizadas: 1, normalizadas: 0,
  });
  assert.equal(downloadCalls, 0, 'soloUbicaciones must not download Graph content');
  assert.equal(ocrCalls, 0, 'soloUbicaciones must not invoke OCR');
  assert.equal(state.histories.length, 1);
  assert.deepEqual(financialSnapshot(state.invoices.located), before, 'existing invoice amount/state/imputation/OCR fields are immutable here');
  assert.deepEqual(Object.keys(updatePayloads[0].data).sort(), metadataKeys.slice().sort());
  assert.deepEqual(Object.keys(state.histories[0].anterior).sort(), metadataKeys.slice().sort());
  assert.deepEqual(Object.keys(state.histories[0].actual).sort(), metadataKeys.slice().sort());
  assert.equal(lockQueries.length, 1);
  assert.match(lockQueries[0], /FOR UPDATE/, 'the simulated row lock returns a concrete row instead of void');

  const retry = await expectStatus(post({ carpeta: 'pendiente', limite: 1, soloUbicaciones: true }), 200);
  assert.equal((await retry.json()).ubicacionesActualizadas, 0);
  assert.equal(state.histories.length, 1, 'retrying the same location state must not duplicate history');
  assert.equal(updatePayloads.length, 1);
}

async function testHistoricalDriveVerificationAndInvalidIds(): Promise<void> {
  reset();
  state.invoices.located.oneDriveDriveId = null;
  const original = structuredClone(state);
  const blocked = await expectStatus(post({ carpeta: 'pendiente', soloUbicaciones: true }), 409);
  assert.equal((await blocked.json()).requiereConfirmarBiblioteca, true);
  assert.deepEqual(state, original, 'no atribuir una biblioteca a un ID histórico sin confirmación');
  await expectStatus(post({ carpeta: 'pendiente', soloUbicaciones: true, bibliotecaHistoricaConfirmada: 'wrong-drive' }), 409);
  assert.deepEqual(state, original);
  await expectStatus(post({ carpeta: 'pendiente', soloUbicaciones: true, bibliotecaHistoricaConfirmada: 'synthetic-drive' }), 200);
  assert.equal(state.invoices.located.oneDriveDriveId, 'synthetic-drive');
  assert.equal(state.histories[0].motivo, 'VERIFICACION_BIBLIOTECA_HISTORICA');
  for (const id of [undefined, null, 7, '', ' ']) {
    reset();
    state.folders.pendiente[0].id = id as any;
    const before = structuredClone(state);
    await expectStatus(post({ carpeta: 'pendiente', soloUbicaciones: true }), 503);
    assert.deepEqual(state, before);
    assert.equal(updatePayloads.length, 0);
  }
  reset();
  state.folders.materiales.push(structuredClone(state.folders.pendiente[0]));
  const beforeDuplicate = structuredClone(state);
  await expectStatus(post({ carpeta: 'todas', soloUbicaciones: true }), 503);
  assert.deepEqual(state, beforeDuplicate, 'un ID visto en dos carpetas no debe producir cambios parciales');
  assert.equal(downloadCalls, 0);
  assert.equal(ocrCalls, 0);
}

async function testInvisibleAliasesAndAtomicFailures(): Promise<void> {
  reset();
  for (const [number, alias] of ['T1', 'T2', 'T3', 'T4'].entries()) {
    const id = `alias-${number + 1}`;
    state.invoices[id] = invoice(id, `invisible-${number + 1}`, { carpetaOrigen: `${alias}/Proveedor oculto` });
  }
  for (const key of Object.keys(state.folders)) state.folders[key] = [];
  const financialBefore = Object.fromEntries(Object.entries(state.invoices).map(([id, row]) => [id, financialSnapshot(row)]));
  const normalized = await expectStatus(post({ carpeta: 'todas', limite: 1, soloUbicaciones: true }), 200);
  assert.equal((await normalized.json()).normalizadas, 4);
  for (const number of [1, 2, 3, 4]) {
    const changed = state.invoices[`alias-${number}`];
    assert.equal(changed.carpetaOrigen, `${inventoryHelpers.INVOICE_FOLDERS[`trimestre${number}` as keyof typeof inventoryHelpers.INVOICE_FOLDERS].nombre}/Proveedor oculto`);
    assert.deepEqual(financialSnapshot(changed), financialBefore[`alias-${number}`]);
  }
  assert.equal(downloadCalls, 0);
  assert.equal(ocrCalls, 0);
  assert.ok(updatePayloads.every(change => Object.keys(change.data).length === 1 && change.data.carpetaOrigen), 'invisible aliases only update their label metadata');

  reset();
  state.invoices.located.oneDriveDriveId = 'other-drive';
  const mismatchBefore = structuredClone(state);
  await expectStatus(post({ carpeta: 'pendiente', limite: 1, soloUbicaciones: true }), 503);
  assert.deepEqual(state, mismatchBefore, 'a known item from another drive must make no location edit');
  assert.equal(updatePayloads.length, 0);

  reset();
  folderFailures.add('pendiente');
  const failureBefore = structuredClone(state);
  const failed = await expectStatus(post({ carpeta: 'pendiente', limite: 1, soloUbicaciones: true }), 503);
  const failedBody = await failed.json();
  assert.deepEqual(failedBody.carpetasError, ['pendiente']);
  assert.deepEqual(state, failureBefore, 'a failed selected folder must return before every mutation');
  assert.equal(updatePayloads.length, 0);
  assert.equal(downloadCalls, 0);
  assert.equal(ocrCalls, 0);
}

async function testIsolationAndStaticNoOutboundGuards(): Promise<void> {
  reset();
  // Preview without the B1 flag and a B1 flag connected to a different database/user both fail closed before Graph work.
  delete process.env.FINANCE_STAGING_SANDBOX;
  process.env.VERCEL_ENV = 'preview';
  const beforePreviewLists = listCalls;
  await expectStatus(get(), 503);
  assert.equal(listCalls, beforePreviewLists);

  process.env.FINANCE_STAGING_SANDBOX = '1';
  databaseIdentity = { db: 'production', usuario: 'production_user' };
  const beforeBadConnectionLists = listCalls;
  await expectStatus(get(), 503);
  await expectStatus(post({ carpeta: 'pendiente', limite: 1, soloUbicaciones: true }), 503);
  assert.equal(listCalls, beforeBadConnectionLists);
  assert.equal(updatePayloads.length, 0);
  databaseIdentity = { db: 'io_staging_finanzas', usuario: 'io_staging_finanzas' };

  // Static regression checks cover the two B1 no-outbound perimeter controls without importing/running them.
  const middleware = fs.readFileSync('middleware.js', 'utf8');
  assert.match(middleware, /FINANCE_STAGING_SANDBOX === '1'/);
  assert.match(middleware, /path === '\/api\/admin\/finanzas\/sincronizar-onedrive'/);
  assert.match(middleware, /path\.startsWith\('\/api\/cron\/'\)/);
  const historyGuard = fs.readFileSync('scripts/update-historial.js', 'utf8');
  assert.match(historyGuard, /STAGING_DATABASE_URL exclusivo/);
  assert.match(historyGuard, /url\.pathname !== '\/io_staging_finanzas'/);
  assert.match(historyGuard, /result\.rows\[0\]\?\.db !== 'io_staging_finanzas'/);
}

async function main(): Promise<void> {
  try {
    process.env.FINANCE_STAGING_SANDBOX = '1';
    process.env.VERCEL_ENV = 'preview';
    await testAuthAndRequestGuards();
    await testCompleteAndIncompleteInventory();
    await testMetadataOnlyLocationsAndIdempotency();
    await testHistoricalDriveVerificationAndInvalidIds();
    await testInvisibleAliasesAndAtomicFailures();
    await testIsolationAndStaticNoOutboundGuards();
    assert.equal(outboundAttempts, 0, 'all B1 API assertions must stay inside VM mocks/static source reads');
    console.log('B1 OneDrive API synthetic tests: VM auth/request guards, complete inventory, metadata-only idempotence, atomic failures, isolation and no-outbound guards: OK');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = originalEnv.vercel;
    if (originalEnv.sandbox === undefined) delete process.env.FINANCE_STAGING_SANDBOX; else process.env.FINANCE_STAGING_SANDBOX = originalEnv.sandbox;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
