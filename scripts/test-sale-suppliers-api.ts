import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as supplierUtils from '../lib/finanzas/sale-suppliers';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

const source = fs.readFileSync('app/api/admin/finanzas/rentabilidad/proveedores/route.ts', 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

let authenticated = true;
let active = true;
let readable = true;
let writable = true;
let audits = 0;
let referenceCounter = 0;
const invoiceId = '11111111-1111-4111-8111-111111111111';
const invoice = { id: invoiceId, numFactura: 'FV-1', fecha: new Date('2026-10-01'), estado: 'EMITIDA' };
const receivedCatalog = [
  { proveedorKey: 'acme s.l.', nombre: 'Acme S.L.', facturas: BigInt(2) },
  { proveedorKey: 'beta', nombre: 'Beta', facturas: BigInt(1) },
];
let references: any[] = [];
const session = { user: { id: '1', userType: 'admin', role: 'SUPER_ADMIN' } };

const tx = {
  facturaEmitida: { findUnique: async () => invoice },
  proveedorVentaReferencia: {
    findMany: async () => [...references].sort((a, b) => a.proveedorKey.localeCompare(b.proveedorKey) || a.id.localeCompare(b.id)),
    deleteMany: async () => { references = []; },
    createMany: async ({ data }: any) => {
      references.push(...data.map((row: any) => ({ id: `supplier-${++referenceCounter}`, ...row })));
    },
  },
  rentabilidadAuditoria: { create: async () => { audits++; } },
  $queryRaw: async () => [{ id: invoiceId }],
};
const prisma = {
  usuarioAdmin: { findUnique: async () => ({ activo: active }) },
  $queryRaw: async (_query: unknown) => {
    // The route runs the catalog page and count SQL in this order.
    return catalogCalls++ % 2 === 0 ? receivedCatalog : [{ total: BigInt(2) }];
  },
  $transaction: async (fn: any) => {
    const before = JSON.stringify(references);
    const oldAudits = audits;
    try { return await fn(tx); } catch (error) { references = JSON.parse(before); audits = oldAudits; throw error; }
  },
};
let catalogCalls = 0;
const module = { exports: {} as any };
vm.runInNewContext(code, {
  module,
  exports: module.exports,
  Buffer,
  TextEncoder,
  console,
  require: (name: string) => {
    if (name === 'next/server') return { NextRequest, NextResponse };
    if (name === 'next-auth') return { getServerSession: async () => authenticated ? session : null };
    if (name === '@prisma/client') return { Prisma };
    if (name === '@/lib/auth') return { authOptions: {} };
    if (name === '@/lib/prisma') return { __esModule: true, default: prisma, prisma };
    if (name === '@/lib/finanzas/sale-suppliers') return supplierUtils;
    if (name === '@/lib/api-admin-area-read') return {
      checkAdminAreaRead: async () => readable ? null : NextResponse.json({}, { status: 403 }),
      checkAdminAreaWrite: async () => writable ? null : NextResponse.json({}, { status: 403 }),
    };
    throw Error(`Módulo inesperado: ${name}`);
  },
});

const { GET, POST } = module.exports;
const get = (query = '') => GET(new NextRequest(`https://panel.example/api${query}`));
const post = (body: unknown, origin = 'https://panel.example') => POST(new NextRequest('https://panel.example/api', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
}));

async function main() {
  authenticated = false;
  assert.equal((await get()).status, 401);
  assert.equal((await post({})).status, 401);
  authenticated = true;
  active = false; assert.equal((await get()).status, 401); active = true;
  readable = false; assert.equal((await get()).status, 403); readable = true;
  writable = false;
  assert.equal((await post({})).status, 403);
  assert.equal((await (await get()).json()).canWrite, false);
  writable = true;
  assert.equal((await post({}, 'https://otro.example')).status, 403);

  const catalog = await (await get()).json();
  assert.deepEqual(catalog.proveedores, [{ nombre: 'Acme S.L.', proveedorKey: 'acme s.l.', facturas: 2 }, { nombre: 'Beta', proveedorKey: 'beta', facturas: 1 }]);
  assert.equal(catalog.total, 2); assert.equal(catalog.totalPages, 1); assert.equal(catalog.page, 1);
  const before = await (await get(`?facturaId=${invoiceId}`)).json();
  assert.deepEqual(before.referencias, []);
  assert.match(before.version, /^[a-f0-9]{64}$/);

  const body = { facturaId: invoiceId, version: before.version, nombres: ['  Acme S.L. ', 'Beta'] };
  assert.equal((await post(body)).status, 200);
  assert.equal(references.length, 2); assert.equal(audits, 1);
  const current = await (await get(`?facturaId=${invoiceId}&buscar=acme`)).json();
  assert.deepEqual(current.referencias.map((row: any) => row.nombre), ['Acme S.L.', 'Beta']);
  assert.equal(current.proveedores[0].proveedorKey, 'acme s.l.');
  assert.equal((await post(body)).status, 200); // stale identical desired state
  assert.equal(audits, 1);
  assert.equal((await post({ ...body, nombres: ['Otro'] })).status, 409);
  assert.equal((await post({ facturaId: invoiceId, version: current.version, nombres: Array.from({ length: 11 }, (_, i) => `P ${i}`) })).status, 400);
  assert.equal((await post({ facturaId: invoiceId, version: current.version, nombres: ['ACME S.L.', ' acme s.l. '] })).status, 400);
  assert.equal((await get('?page=100001')).status, 400);
  assert.equal((await get('?page=NaN')).status, 400);
  assert.equal(audits, 1);
  console.log('API proveedores venta: sesión, permisos, catálogo, origen, límites, versión, idempotencia y auditoría sin importes correctos; cero compras o vinculaciones.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
