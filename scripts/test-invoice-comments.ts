import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
const source = fs.readFileSync('app/api/admin/finanzas/facturas/[id]/comentarios/route.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const id = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
let authenticated = true, active = true, writable = true, readable = true, previous: any = null, writes = 0;
const session = { user: { id: '1', userType: 'admin', role: 'SUPER_ADMIN' } };
const prisma = {
  usuarioAdmin: { findUnique: async () => ({ activo: active, nombre: 'Usuario de prueba' }) },
  facturaRecibida: { findUnique: async () => ({ id, proveedor: 'Proveedor de prueba', cif: null }) },
  comentarioFacturaRecibida: {
    findMany: async () => [], count: async () => 41,
    findUnique: async () => previous,
    upsert: async ({ create }: any) => { writes++; return { ...create, id: key, createdAt: new Date(), autor: { nombre: 'Usuario de prueba' } }; },
  },
};
const module = { exports: {} as any };
vm.runInNewContext(code, { module, exports: module.exports, TextEncoder, require: (name: string) => {
  if (name === 'next/server') return { NextRequest, NextResponse };
  if (name === 'next-auth') return { getServerSession: async () => authenticated ? session : null };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/lib/prisma') return { __esModule: true, default: prisma };
  if (name === '@/lib/api-admin-area-read') return {
    checkAdminAreaRead: async () => readable ? null : NextResponse.json({}, { status: 403 }),
    checkAdminAreaWrite: async () => writable ? null : NextResponse.json({}, { status: 403 }),
  };
  throw Error('Módulo inesperado en prueba: ' + name);
}});
const { GET, POST } = module.exports;
const context = { params: Promise.resolve({ id }) };
const get = (q = '') => GET(new NextRequest(`https://panel.example/api/${id}?${q}`), context);
const post = (body: unknown, origin = 'https://panel.example') => POST(new NextRequest(`https://panel.example/api/${id}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), context);
async function main() {
  authenticated = false; assert.equal((await get()).status, 401); assert.equal((await post({})).status, 401);
  authenticated = true; active = false; assert.equal((await get()).status, 401); active = true;
  readable = false; assert.equal((await get()).status, 403); readable = true;
  writable = false; assert.equal((await post({ texto: 'nota', solicitudId: key })).status, 403);
  const readOnly = await (await get()).json(); assert.equal(readOnly.puedeComentar, false); writable = true;
  assert.equal((await post({ texto: 'nota', solicitudId: key }, 'https://otro.example')).status, 403);
  for (const q of ['page=0', 'page=100001', 'page=1e2', 'limit=51', 'limit=-1', 'page=Infinity']) assert.equal((await get(q)).status, 400);
  assert.equal((await (await get('page=2&limit=20')).json()).totalPages, 3);
  for (const texto of ['', ' '.repeat(10), 'x'.repeat(4001), 'nota\u0000']) assert.equal((await post({ texto, solicitudId: key })).status, 400);
  assert.equal((await post({ texto: 'nota\nsegunda línea', solicitudId: key })).status, 201); assert.equal(writes, 1);
  previous = { id: key, texto: 'nota', autorId: 1, createdAt: new Date(), autor: { nombre: 'Usuario de prueba' } };
  assert.equal((await post({ texto: 'nota', solicitudId: key })).status, 200); assert.equal(writes, 1);
  assert.equal((await post({ texto: 'nota distinta', solicitudId: key })).status, 409);
  previous.autorId = 2; assert.equal((await post({ texto: 'nota', solicitudId: key })).status, 409); assert.equal(writes, 1);
  console.log('Comentarios: permisos, usuario activo, origen, límites, paginación e idempotencia correctos; sin base de datos');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
