import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';

let permitted = true;
let writePermitted = true;
let discoveryCalls = 0;
let analysisCalls = 0;
const result = {
  proveedor: 'Proveedor', destinatario: 'Empresa pagadora, S.L.', numFactura: 'V-1', fecha: '2026-01-31', base: 100, iva: 21, total: 121,
  moneda: 'EUR', confianza: 0.95, concepto: 'Servicio', lineas: [{ descripcion: 'Servicio', importe: 100 }],
};
const rows: any[] = [
  { id: 'pending-1', ruta: '2. Contabilidad y finanzas/.../prueba.pdf', nombre: 'prueba.pdf', mime: 'application/pdf', size: 99, modificadoAt: new Date('2026-01-31'), estado: 'LISTO', incidencia: null, version: 3, fuenteId: null, resultado: result, createdAt: new Date('2026-01-31') },
  { id: 'pending-2', ruta: '2. Contabilidad y finanzas/.../revision.pdf', nombre: 'revision.pdf', mime: 'application/pdf', size: 99, modificadoAt: new Date('2026-01-30'), estado: 'REVISION', incidencia: 'Revisar', version: 1, fuenteId: 'source-1', resultado: { ...result, base: Infinity }, createdAt: new Date('2026-01-30') },
];
const prisma = {
  documentoRefacturacionPendiente: {
    findMany: async ({ select, skip = 0, take = 25 }: any) => rows.slice(skip, skip + take).map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]]))),
    count: async () => rows.length,
  },
};
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const source = fs.readFileSync('app/api/admin/finanzas/costes-operadora/pendientes/route.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const module = { exports: {} as any };
vm.runInNewContext(code, {
  module, exports: module.exports, Buffer, Promise, Date, Object, Math, Array,
  require(name: string) {
    if (name === 'next/server') return { NextRequest, NextResponse };
    if (name === '@/lib/prisma') return { __esModule: true, default: prisma };
    if (name === '@/lib/finanzas/operator-costs-auth') return {
      operatorAuth: async (write: boolean) => permitted && (!write || writePermitted) ? { userId: 1, canWrite: writePermitted } : json({ error: 'Sin permiso' }, 403),
      operatorJson: json,
    };
    if (name === '@/lib/finanzas/pending-refactoring') return {
      PENDING_STATES: ['DETECTADO', 'ANALIZANDO', 'CAMBIADO', 'REVISION', 'LISTO'], DISCOVERY_LIMIT: 2000,
      PendingRefactoringError: class PendingRefactoringError extends Error { constructor(message: string, public status = 400) { super(message); } },
      sanitizePendingResult: (value: any) => value?.base === Infinity ? null : value,
      discoverPendingDocuments: async () => { discoveryCalls++; return { discovered: 2, skippedUnsupported: 1, incomplete: false, limit: 2000 }; },
      analyzePendingDocument: async (_db: unknown, input: any) => { analysisCalls++; return { id: input.id, estado: 'LISTO', resultado: result, incidencia: null, version: input.version + 1 }; },
    };
    throw new Error(name);
  },
});

const get = (query = '') => module.exports.GET(new NextRequest(`https://panel.example/api${query}`));
const post = (body: unknown, origin = 'https://panel.example', type = 'application/json') => module.exports.POST(new NextRequest('https://panel.example/api', { method: 'POST', headers: { origin, 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) }));

async function main() {
  permitted = false;
  assert.equal((await get()).status, 403);
  assert.equal((await post({ action: 'descubrir' })).status, 403);
  permitted = true;

  const catalog = await get('?buscar=proveedor&estado=LISTO&page=1');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get('cache-control'), 'private, no-store');
  const body = await catalog.json();
  assert.equal(body.documentos[0].drive, undefined);
  assert.equal(body.documentos[0].item, undefined);
  assert.equal(body.documentos[0].hash, undefined);
  assert.equal(body.documentos[0].hasResultado, true);
  assert.equal(body.resumen.basePendiente, 100);
  assert.equal(body.resumen.totalPendiente, 121);
  assert.equal(body.resumen.asignados, 1);
  assert.equal(body.documentos[1].hasResultado, false, 'invalid stored JSON is never exposed by the catalog');
  assert.equal(body.documentos[1].resultado, null);
  assert.equal((await get('?buscar=' + 'x'.repeat(161))).status, 400);
  assert.equal((await get('?estado=FACTURA')).status, 400);

  assert.equal((await post({ action: 'descubrir' }, 'https://other.example')).status, 403);
  assert.equal((await post({ action: 'descubrir' }, 'https://panel.example', 'text/plain')).status, 415);
  assert.equal((await post('{')).status, 400);
  assert.equal((await post({ action: 'descubrir', path: 'arbitrary' })).status, 400, 'scope accepts no caller paths');
  assert.equal((await post({ action: 'descubrir' })).status, 200);
  assert.equal(discoveryCalls, 1);
  assert.equal((await post({ action: 'analizar', id: 'pending-1', version: 3 })).status, 200);
  assert.equal(analysisCalls, 1);
  assert.equal((await post({ action: 'analizar', id: 'pending-1', version: 0 })).status, 400);
  assert.equal((await post({ action: 'analizar', id: 'pending-1', version: 3, unexpected: true })).status, 400);
  writePermitted = false;
  assert.equal((await post({ action: 'descubrir' })).status, 403);

  const all = [source, fs.readFileSync('lib/finanzas/pending-refactoring.ts', 'utf8')].join('\n');
  assert.doesNotMatch(all, /(?:facturaRecibida|vinculacionFactura|articuloCosteOperadora)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
  console.log('API pendientes: permisos, no-store, JSON/origen, filtros, catálogo saneado, resumen anual, acciones explícitas y guardas sin escrituras contables correctos en VM.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
