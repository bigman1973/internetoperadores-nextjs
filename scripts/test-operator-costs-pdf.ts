import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ID } from '../lib/finanzas/operator-costs';

let permission = true; let writes = 0; let uploads = 0;
const pdf = Buffer.from('%PDF-1.7\nsynthetic test only\n%%EOF');
const hash = createHash('sha256').update(pdf).digest('hex');
let record: any = { origen: 'TERCERO', periodo: '2026-10', estado: 'BORRADOR', documentoHash: null };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const tx = {
  fuenteCosteOperadora: { updateMany: async ({ data }: any) => { record = { ...record, ...data }; writes++; return { count: 1 }; } },
  auditoriaCosteOperadora: { create: async () => {} },
};
const prisma = {
  fuenteCosteOperadora: { findUnique: async ({ where }: any) => where.documentoHash ? null : record },
  $transaction: async (fn: any) => fn(tx),
};
const source = fs.readFileSync('app/api/admin/finanzas/costes-operadora/[id]/pdf/route.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const module = { exports: {} as any };
vm.runInNewContext(code, { module, exports: module.exports, Buffer, File, require: (name: string) => {
  if (name === 'node:crypto') return { createHash };
  if (name === 'next/server') return { NextRequest, NextResponse };
  if (name === '@prisma/client') return { Prisma };
  if (name === '@/lib/prisma') return { __esModule: true, default: prisma };
  if (name === '@/lib/finanzas/operator-costs-auth') return { operatorAuth: async () => permission ? { userId: 1 } : json({}, 403), operatorJson: json };
  if (name === '@/lib/finanzas/operator-costs') return { ID };
  if (name === '@/lib/finanzas/operator-costs-documents') return { uploadOperatorPdf: async () => { uploads++; return { drive: 'private-drive', item: 'private-item', name: 'original.pdf', hash }; }, downloadOperatorPdf: async () => pdf };
  throw new Error(name);
} });
const ctx = { params: Promise.resolve({ id: 'source-test' }) };
const get = () => module.exports.GET(new NextRequest('https://panel.example/api'), ctx);
const post = (bytes: Buffer = pdf, name = 'original.pdf', origin = 'https://panel.example') => {
  const form = new FormData(); form.append('file', new File([new Uint8Array(bytes)], name, { type: 'application/pdf' }));
  return module.exports.POST(new NextRequest('https://panel.example/api', { method: 'POST', headers: { origin }, body: form }), ctx);
};
async function main() {
  permission = false; assert.equal((await get()).status, 403); assert.equal((await post()).status, 403); permission = true;
  assert.equal((await get()).status, 404);
  assert.equal((await post(pdf, 'original.pdf', 'https://other.example')).status, 403);
  assert.equal((await post(Buffer.from('not-pdf'))).status, 400);
  assert.equal((await post(pdf, 'original.txt')).status, 400);
  assert.equal(writes, 0); assert.equal(uploads, 0);
  assert.equal((await post()).status, 200); assert.equal(writes, 1); assert.equal(uploads, 1);
  assert.equal((await post()).status, 200); assert.equal(writes, 1); assert.equal(uploads, 1);
  assert.equal((await post(Buffer.from('%PDF-1.7 other content'))).status, 409);
  const response = await get(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  record.documentoHash = '0'.repeat(64); assert.equal((await get()).status, 409);
  record = { origen: 'PROPIA' }; assert.equal((await post()).status, 404);
  console.log('PDF operadora: permisos, origen, firma, no-store, hash, idempotencia y no sustitución correctos con almacenamiento y Prisma simulados.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
