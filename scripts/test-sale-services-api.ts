import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import * as serviceUtils from '../lib/finanzas/sale-services';
const source = fs.readFileSync('app/api/admin/finanzas/rentabilidad/servicios/route.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
let authenticated = true, active = true, readable = true, writable = true, audits = 0;
let components: any[] = [];
const invoiceId = '11111111-1111-4111-8111-111111111111';
const invoice = { id: invoiceId, base: 40, estado: 'EMITIDA', cif: null, serie: 'TEST', concepto: 'Pack', lineas: null, fecha: new Date('2026-10-01') };
const session = { user: { id: '1', userType: 'admin', role: 'SUPER_ADMIN' } };
const tx = {
  facturaEmitida: { findUnique: async () => invoice, findMany: async () => [] },
  componenteVentaServicio: {
    findMany: async () => [...components].sort((a,b) => a.id.localeCompare(b.id)),
    deleteMany: async ({ where }: any) => { components = components.filter(row => where.id?.notIn?.includes(row.id)); },
    create: async ({ data }: any) => { const row = { id: 'component' + (components.length + 1), ...data }; components.push(row); return row; },
    update: async ({ where, data }: any) => { components = components.map(row => row.id === where.id ? { ...row, ...data } : row); },
  },
  rentabilidadAuditoria: { create: async () => { audits++; } },
  $queryRaw: async () => [{ id: invoiceId }],
};
const prisma = {
  usuarioAdmin: { findUnique: async () => ({ activo: active }) },
  $transaction: async (fn: any) => { const before = JSON.stringify(components), oldAudits = audits; try { return await fn(tx); } catch (err) { components = JSON.parse(before); audits = oldAudits; throw err; } },
};
const module = { exports: {} as any };
vm.runInNewContext(code, { module, exports: module.exports, Buffer, TextEncoder, console, require: (name: string) => {
  if (name === 'next/server') return { NextRequest, NextResponse };
  if (name === 'next-auth') return { getServerSession: async () => authenticated ? session : null };
  if (name === 'node:crypto') return crypto;
  if (name === '@prisma/client') return { Prisma };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/lib/prisma') return { __esModule: true, default: prisma };
  if (name === '@/lib/finanzas/sale-services') return serviceUtils;
  if (name === '@/lib/api-admin-area-read') return {
    checkAdminAreaRead: async () => readable ? null : NextResponse.json({}, { status: 403 }),
    checkAdminAreaWrite: async () => writable ? null : NextResponse.json({}, { status: 403 }),
  };
  throw Error('Módulo inesperado: ' + name);
}});
const { GET, POST } = module.exports;
const get = () => GET(new NextRequest(`https://panel.example/api?facturaId=${invoiceId}`));
const post = (body: any, origin = 'https://panel.example') => POST(new NextRequest('https://panel.example/api', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
async function main() {
  authenticated = false; assert.equal((await get()).status, 401); assert.equal((await post({})).status, 401); authenticated = true;
  active = false; assert.equal((await get()).status, 401); active = true;
  readable = false; assert.equal((await get()).status, 403); readable = true;
  writable = false; assert.equal((await post({})).status, 403); assert.equal((await (await get()).json()).canWrite, false); writable = true;
  assert.equal((await post({}, 'https://otro.example')).status, 403);
  const before = await (await get()).json();
  const body = { facturaId: invoiceId, version: before.version, componentes: [{ nombre: 'Radio', tipo: 'TELECO_RED_PROPIA', base: 25 }, { nombre: 'Móvil', tipo: 'TELECO_INTERMEDIACION', base: 15 }] };
  assert.equal((await post(body)).status, 200); assert.equal(components.length, 2); assert.equal(audits, 1);
  assert.equal((await post(body)).status, 200); assert.equal(audits, 1);
  const current = await (await get()).json(); assert.equal(current.mixto, true); assert.equal(current.pendiente, 0);
  assert.equal((await post({ ...body, componentes: [{ nombre: 'Otro', tipo: 'PROYECTO', base: 40 }] })).status, 409); assert.equal(audits, 1);
  const wrongId = { facturaId: invoiceId, version: current.version, componentes: [{ id: 'ajeno', nombre: 'Ajeno', tipo: 'PROYECTO', base: 40 }] };
  assert.equal((await post(wrongId)).status, 409); assert.equal(components.length, 2);
  assert.equal((await post({ ...body, version: current.version, componentes: [{ nombre: 'Exceso', tipo: 'PROYECTO', base: 41 }] })).status, 400); assert.equal(audits, 1);
  console.log('API servicios: sesión activa, permisos, origen, propiedad, límites, versiones e idempotencia correctos; cero escrituras reales.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
