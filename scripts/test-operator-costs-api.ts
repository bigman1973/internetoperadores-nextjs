import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import * as operatorCosts from '../lib/finanzas/operator-costs';

const routeSource = fs.readFileSync('app/api/admin/finanzas/costes-operadora/route.ts', 'utf8');
const authSource = fs.readFileSync('lib/finanzas/operator-costs-auth.ts', 'utf8');
const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
const routeCode = ts.transpileModule(routeSource, { compilerOptions }).outputText;
const authCode = ts.transpileModule(authSource, { compilerOptions }).outputText;

const groupId = 'grupo-red';
const userId = 7;
let authenticated = true;
let active = true;
let readable = true;
let writable = true;
let faultAssignments = false;
const session = { user: { id: String(userId), userType: 'admin', role: 'SUPER_ADMIN' } };

type Invoice = {
  id: string; proveedor: string; numFactura: string | null; fecha: Date; base: number; concepto: string | null;
  lineasDetalle: string | null; estado: string; imputadoAVentas: boolean;
};
type Source = {
  id: string; claveOrigen: string; origen: string; empresaPagadora: string; periodo: string; snapshot: any; fuenteVersion: string;
  creadoPor: number; estado: string; notas: string | null; version: number; createdAt: Date;
  documentos: any[]; asignaciones: any[];
};
type State = { invoices: Record<string, Invoice>; sources: Record<string, Source>; reserved: Record<string, string>; saleLinks: Set<string>; clientAllocations: Set<string>; audits: any[] };

function invoice(id: string, base = 100, detail = '[{"descripcion":"Troncal","importe":60},{"descripcion":"Acceso","importe":40}]'): Invoice {
  return { id, proveedor: `Proveedor ${id}`, numFactura: `F-${id}`, fecha: new Date('2026-02-15T00:00:00.000Z'), base, concepto: `Coste ${id}`, lineasDetalle: detail, estado: 'RECIBIDA', imputadoAVentas: false };
}
function initialState(): State {
  const ids = ['inv-original', 'inv-ref', 'inv-secondary', 'inv-ref-reserved', 'inv-success', 'inv-linked', 'inv-rollback'];
  return { invoices: Object.fromEntries(ids.map(id => [id, invoice(id)])), sources: {}, reserved: {}, saleLinks: new Set(), clientAllocations: new Set(), audits: [] };
}
let state = initialState();
const groups = [{ id: groupId, nombre: 'Red propia', clave: 'red', ambito: 'GLOBAL_RED_PROPIA', zona: null, conexion: null }];

function forbidden(model: string, operation: string): never { throw new Error(`GUARD: ${model}.${operation} must never be written by costes-operadora`); }
function sourceWithRelations(source: Source) {
  return {
    ...source,
    documentoPendiente: pendingDoc.fuenteId === source.id ? {id:pendingDoc.id,version:pendingDoc.version,estado:pendingDoc.estado} : null,
    documentos: source.documentos.map(d => ({ ...d, factura: state.invoices[d.facturaId] })),
    asignaciones: source.asignaciones.map(a => ({ ...a, grupo: groups.find(g => g.id === a.grupoId) || { id: a.grupoId, nombre: 'desconocido' } })),
  };
}
function filteredSources() { return Object.values(state.sources); }
function sourceFromWhere(where: any): Source | null {
  if (where?.id) return state.sources[where.id] || null;
  if (where?.claveOrigen) return filteredSources().find(row => row.claveOrigen === where.claveOrigen) || null;
  return null;
}

const pendingDocumentId = '12345678-1234-4234-8234-123456789012';
const pendingDoc: any = { id: pendingDocumentId, estado: 'LISTO', version: 1, fuenteId: null, drive: 'synthetic-drive', item: 'synthetic-item', hash: 'e'.repeat(64), nombre: 'original-synthetic.pdf', resultado: { proveedor: 'Proveedor externo', destinatario: 'Empresa externa', numFactura: 'DOC-12', fecha: '2026-04-20', base: 100, concepto: 'Red compartida', lineas: [{descripcion: 'Troncal externa', importe: 100}] } };
const tx: any = {
  documentoRefacturacionPendiente: {
    findUnique: async ({ where }: any) => where.id === pendingDoc.id ? structuredClone(pendingDoc) : null,
    update: async ({ data }: any) => { pendingDoc.fuenteId = data.fuenteId; pendingDoc.version += data.version?.increment || 0; return pendingDoc; },
  },
  $queryRaw: async (sql: Prisma.Sql) => {
    const query = sql.strings.join('?');
    if (query.includes('pg_advisory_xact_lock')) {
      assert.match(query, /SELECT 1::int AS locked FROM pg_advisory_xact_lock/, 'no devolver void a Prisma');
      return [{ locked: 1 }];
    }
    return [];
  },
  facturaRecibida: {
    findUnique: async ({ where }: any) => state.invoices[where.id] || null,
    create: async () => forbidden('facturaRecibida', 'create'), update: async () => forbidden('facturaRecibida', 'update'),
    updateMany: async () => forbidden('facturaRecibida', 'updateMany'), delete: async () => forbidden('facturaRecibida', 'delete'), deleteMany: async () => forbidden('facturaRecibida', 'deleteMany'),
  },
  fuenteCosteOperadora: {
    findUnique: async ({ where, include, select }: any) => {
      const source = sourceFromWhere(where);
      if (!source) return null;
      if (select) return { id: source.id };
      return include ? sourceWithRelations(source) : { ...source };
    },
    findUniqueOrThrow: async ({ where, include }: any) => {
      const source = sourceFromWhere(where);
      if (!source) throw new Error('not found');
      return include ? sourceWithRelations(source) : { ...source };
    },
    create: async ({ data }: any) => {
      if (state.sources[data.id]) throw new Error('duplicate source');
      state.sources[data.id] = { ...data, createdAt: new Date(), documentos: [], asignaciones: [] };
      return state.sources[data.id];
    },
    update: async ({ where, data }: any) => Object.assign(state.sources[where.id], data),
    findMany: async () => filteredSources().map(sourceWithRelations),
    count: async () => filteredSources().length,
    groupBy: async () => {
      const by = new Map<string, number>();
      for (const row of filteredSources()) by.set(`${row.origen}/${row.estado}`, (by.get(`${row.origen}/${row.estado}`) || 0) + 1);
      return [...by].map(([key, count]) => { const [origen, estado] = key.split('/'); return { origen, estado, _count: { _all: count } }; });
    },
  },
  grupoCosteOperadora: {
    findMany: async ({ where }: any = {}) => where?.id?.in ? groups.filter(group => where.id.in.includes(group.id)) : groups,
    upsert: async ({ where, create }: any) => groups.find(group => group.clave === where.clave) || ({ ...create } as any),
  },
  documentoCosteOperadora: {
    findUnique: async ({ where }: any) => state.reserved[where.facturaId] ? { fuenteId: state.reserved[where.facturaId] } : null,
    deleteMany: async ({ where }: any) => {
      const source = state.sources[where.fuenteId];
      for (const doc of source.documentos) delete state.reserved[doc.facturaId];
      source.documentos = [];
      return { count: 1 };
    },
    createMany: async ({ data }: any) => {
      for (const doc of data) {
        state.reserved[doc.facturaId] = doc.fuenteId;
        state.sources[doc.fuenteId].documentos.push({ ...doc });
      }
      return { count: data.length };
    },
  },
  articuloCosteOperadora: {
    deleteMany: async ({ where }: any) => { state.sources[where.fuenteId].asignaciones = []; return { count: 1 }; },
    createMany: async ({ data }: any) => {
      if (faultAssignments) throw new Error('simulated assignment persistence failure');
      for (const assignment of data) state.sources[assignment.fuenteId].asignaciones.push({ ...assignment });
      return { count: data.length };
    },
    aggregate: async () => ({ _sum: { importe: filteredSources().flatMap(row => row.asignaciones).reduce((total, row) => total + Number(row.importe), 0) } }),
  },
  vinculacionFactura: {
    count: async ({ where }: any) => state.saleLinks.has(where.facturaRecibidaId) ? 1 : 0,
    create: async () => forbidden('vinculacionFactura', 'create'), update: async () => forbidden('vinculacionFactura', 'update'),
    delete: async () => forbidden('vinculacionFactura', 'delete'), deleteMany: async () => forbidden('vinculacionFactura', 'deleteMany'),
  },
  imputacionCosteCliente: {
    count: async ({ where }: any) => state.clientAllocations.has(where.facturaId) && where.confirmado === true ? 1 : 0,
    create: async () => forbidden('imputacionCosteCliente', 'create'), update: async () => forbidden('imputacionCosteCliente', 'update'),
    delete: async () => forbidden('imputacionCosteCliente', 'delete'), deleteMany: async () => forbidden('imputacionCosteCliente', 'deleteMany'),
  },
  auditoriaCosteOperadora: { create: async ({ data }: any) => { state.audits.push(data); return data; } },
  venta: { create: async () => forbidden('venta', 'create'), update: async () => forbidden('venta', 'update'), delete: async () => forbidden('venta', 'delete') },
  persona: { create: async () => forbidden('persona', 'create'), update: async () => forbidden('persona', 'update'), delete: async () => forbidden('persona', 'delete') },
};
const prisma: any = {
  ...tx,
  usuarioAdmin: { findUnique: async () => ({ activo: active }) },
  facturaRecibida: {
    ...tx.facturaRecibida,
    findMany: async ({ skip = 0, take = 25 }: any) => Object.values(state.invoices).filter(row => row.estado !== 'RECHAZADA').slice(skip, skip + take).map(row => ({ ...row, documentosOperadora: state.reserved[row.id] ? [{ id: state.reserved[row.id] }] : [] })),
    count: async () => Object.values(state.invoices).filter(row => row.estado !== 'RECHAZADA').length,
  },
  $transaction: async (fn: any) => {
    const before = structuredClone(state);
    try { return await fn(tx); }
    catch (error) { state = before; throw error; }
  },
};

function check(write: boolean) {
  return async () => (write ? writable : readable) ? null : NextResponse.json({ error: 'denied' }, { status: 403 });
}
function execute(code: string, require: (name: string) => any) {
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, Buffer, TextEncoder, console, require });
  return module.exports;
}
const commonRequire = (name: string): any => {
  if (name === 'next/server') return { NextRequest, NextResponse };
  if (name === 'next-auth') return { getServerSession: async () => authenticated ? session : null };
  if (name === '@prisma/client') return { Prisma };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/lib/prisma') return { __esModule: true, default: prisma, prisma };
  if (name === '@/lib/finanzas/operator-costs') return operatorCosts;
  if (name === './operator-costs') return operatorCosts;
  if (name === '@/lib/api-admin-area-read') return { checkAdminAreaRead: check(false), checkAdminAreaWrite: check(true) };
  throw new Error(`Unexpected module ${name}`);
};
const authModule = execute(authCode, commonRequire);
const routeModule = execute(routeCode, (name: string) => name === '@/lib/finanzas/operator-costs-auth' ? authModule : commonRequire(name));
const { GET, POST } = routeModule;

const sourceId = (char: string) => `${char.repeat(8)}-${char.repeat(4)}-4111-8111-${char.repeat(12)}`;
function ownBody(id: string, invoiceId: string, overrides: Record<string, unknown> = {}) {
  const inv = state.invoices[invoiceId];
  return {
    action: 'guardar', id, origen: 'PROPIA', periodo: '2026-02', facturaId: invoiceId,
    facturaVersion: operatorCosts.digest(operatorCosts.invoiceSnapshot(inv)),
    asignaciones: [{ indice: 0, grupoId: groupId }], estado: 'BORRADOR', ...overrides,
  };
}
function thirdPartyBody(id: string, periodo = '2026-02') {
  return {
    action: 'guardar', id, origen: 'TERCERO', empresaPagadora: 'Internet Operadores', periodo,
    tercero: {
      proveedor: 'Operadora externa', numFactura: 'TER-42', fecha: '2026-02-15', base: 100,
      concepto: 'Acceso mayorista', lineas: [{ descripcion: 'Acceso', importe: 100 }],
    },
    asignaciones: [{ indice: 0, grupoId: groupId }], estado: 'BORRADOR',
  };
}
function get(query = '') { return GET(new NextRequest(`https://panel.example/api/admin/finanzas/costes-operadora${query}`)); }
function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new NextRequest('https://panel.example/api/admin/finanzas/costes-operadora', {
    method: 'POST', headers: { origin: 'https://panel.example', 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
}
async function expectStatus(response: Promise<Response>, status: number) {
  const result = await response;
  assert.equal(result.status, status);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  return result;
}

async function main() {
  // Authentication, active-account and split read/write permission behavior use the real auth helper in VM.
  authenticated = false; await expectStatus(get(), 401); await expectStatus(post({}), 401);
  authenticated = true; active = false; await expectStatus(get(), 401); active = true;
  readable = false; await expectStatus(get(), 403); readable = true;
  writable = false; await expectStatus(post({}), 403);
  const readOnly = await expectStatus(get(), 200); assert.equal((await readOnly.json()).canWrite, false); writable = true;

  // Route envelopes are private/no-store for valid and rejected list requests; page/action validation is bounded.
  await expectStatus(get('?page=0'), 400);
  await expectStatus(get('?page=100001'), 400);
  await expectStatus(get('?action=desconocida'), 400);
  const list = await expectStatus(get('?page=1'), 200); assert.equal((await list.json()).page, 1);
  const catalog = await expectStatus(get('?action=facturas&periodo=2026-02&page=1'), 200); assert.equal((await catalog.json()).page, 1);

  // Same-origin + JSON + hard byte cap are checked before parsing/persisting.
  await expectStatus(post({}, { origin: 'https://other.example' }), 403);
  await expectStatus(post({}, { 'content-type': 'text/plain' }), 415);
  await expectStatus(post('{'), 400);
  await expectStatus(post(' '.repeat(128 * 1024 + 1)), 413);

  // Current invoice snapshot hashes prevent saving an invoice that changed after the picker response.
  const originalAuditCount = state.audits.length;
  await expectStatus(post(ownBody(sourceId('a'), 'inv-original', { facturaVersion: '0'.repeat(64) })), 409);
  assert.equal(state.audits.length, originalAuditCount);
  assert.equal(Object.keys(state.sources).length, 0);

  // An original or refactura already reserved by another source can never be reused.
  state.reserved['inv-original'] = 'different-source';
  await expectStatus(post(ownBody(sourceId('b'), 'inv-original')), 409);
  delete state.reserved['inv-original'];
  state.reserved['inv-ref-reserved'] = 'different-source';
  await expectStatus(post(ownBody(sourceId('c'), 'inv-secondary', {
    refacturaId: 'inv-ref-reserved', facturaVersion: operatorCosts.digest(operatorCosts.invoiceSnapshot(state.invoices['inv-secondary'])),
    refacturaVersion: operatorCosts.digest(operatorCosts.invoiceSnapshot(state.invoices['inv-ref-reserved'])),
  })), 409);
  delete state.reserved['inv-ref-reserved'];

  // Existing sales links block an otherwise valid received invoice, without touching that link/invoice.
  state.saleLinks.add('inv-linked');
  await expectStatus(post(ownBody(sourceId('d'), 'inv-linked')), 409);
  state.saleLinks.delete('inv-linked');
  assert.equal(Object.keys(state.sources).length, 0);
  assert.equal(state.audits.length, originalAuditCount);

  state.clientAllocations.add('inv-linked');
  await expectStatus(post(ownBody(sourceId('9'), 'inv-linked')), 409);
  state.clientAllocations.delete('inv-linked');
  assert.equal(Object.keys(state.sources).length, 0);
  assert.equal(state.audits.length, originalAuditCount);

  // Period is not invoice identity: a normalized third-party original is still duplicate next month.
  await expectStatus(post(thirdPartyBody(sourceId('e'))), 200);
  assert.equal(state.audits.length, 1);
  await expectStatus(post(thirdPartyBody(sourceId('f'), '2026-03')), 409);
  assert.equal(state.audits.length, 1);

  // A successful write is atomic and generates exactly one audit; retrying the same desired state is idempotent.
  const savedId = sourceId('1');
  const body = ownBody(savedId, 'inv-success');
  const saved = await expectStatus(post(body), 200);
  assert.equal((await saved.json()).success, true);
  assert.equal(state.audits.length, 2);
  assert.equal(state.sources[savedId].asignaciones.length, 1);
  assert.equal(state.reserved['inv-success'], savedId);
  await expectStatus(post(body), 200);
  assert.equal(state.audits.length, 2, 'same desired state must not create a second audit');
  // Compatibility observation: the current route compares idempotency before checking the submitted
  // immutable own-invoice snapshot token. Keep this observable without accepting it as a contract.
  const mismatchedRetry = await post({ ...body, facturaVersion: 'f'.repeat(64) });
  assert.equal(mismatchedRetry.status, 409, 'idempotent retry rejects a mismatched original snapshot version');
  assert.equal(state.audits.length, 2);
  await expectStatus(post({ ...body, notas: 'actualización concurrente', version: 99 }), 409);
  assert.equal(state.audits.length, 2);
  assert.equal(state.sources[savedId].notas, null);

  // Un centro no pertenece a un mes: se deriva de la fecha del documento si no se pide período.
  const automaticBody = ownBody(sourceId('6'), 'inv-secondary');
  delete (automaticBody as any).periodo;
  const automaticSaved = await expectStatus(post(automaticBody), 200);
  const automaticSource = (await automaticSaved.json()).fuente;
  assert.equal(automaticSource.periodo, '2026-02');
  await expectStatus(post({ ...automaticBody, version: automaticSource.version, notas: 'Centro multimes' }), 200);
  assert.equal(state.sources[sourceId('6')].periodo, '2026-02');
  const legacyBody = ownBody(sourceId('7'), 'inv-ref', { periodo: '2026-10' });
  await expectStatus(post(legacyBody), 200);
  const legacyEdit = { ...legacyBody, version: 1, notas: 'Conservar período anterior' };
  delete (legacyEdit as any).periodo;
  await expectStatus(post(legacyEdit), 200);
  assert.equal(state.sources[sourceId('7')].periodo, state.invoices['inv-ref'].fecha.toISOString().slice(0, 7), 'alta deriva fecha aunque cliente envíe mes manual');

  // Un documento de otra empresa se transforma en fuente solo con selección explícita, sin crear facturas recibidas.
  const pendingBody = { action: 'guardar', id: sourceId('8'), origen: 'TERCERO', empresaPagadora: 'Empresa externa', documentoPendienteId: pendingDoc.id, documentoPendienteVersion: 1, asignaciones: [{ indice: 0, grupoId: groupId }], estado: 'BORRADOR' };
  const pendingSaved = await expectStatus(post(pendingBody), 200);
  const pendingSource = (await pendingSaved.json()).fuente;
  assert.equal(pendingSource.periodo, '2026-04');
  assert.equal(pendingSource.situacionRefacturacion, 'PENDIENTE_REFACTURACION');
  assert.equal(pendingSource.documentos.length, 0);
  assert.equal(pendingDoc.fuenteId, pendingBody.id);
  await expectStatus(post(pendingBody), 200);
  await expectStatus(post({...pendingBody,version:1,notas:'Cambio con versión documental antigua'}),409);
  await expectStatus(post({ ...pendingBody, id: sourceId('9'), documentoPendienteVersion: pendingDoc.version }), 409);

  // A failure after creating the parent row rolls the entire transaction back and emits no audit.
  faultAssignments = true;
  const beforeRollbackAudits = state.audits.length;
  await expectStatus(post(ownBody(sourceId('2'), 'inv-rollback')), 500);
  faultAssignments = false;
  assert.equal(state.sources[sourceId('2')], undefined);
  assert.equal(state.reserved['inv-rollback'], undefined);
  assert.equal(state.audits.length, beforeRollbackAudits);

  console.log('API costes operadora: VM+Prisma simulado cubre sesión/permisos, no-store, origen/JSON/tamaño, hashes, reservas, ventas, idempotencia, versión y rollback; sin DB ni escrituras de facturas/ventas/personas.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
