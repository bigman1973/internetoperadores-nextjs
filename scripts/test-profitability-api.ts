import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import ts from 'typescript';
import * as profitabilityUtils from '../lib/finanzas/sales-profitability';

/**
 * Isolated route test: the route is transpiled into a VM and every Prisma call is
 * dispatched from SQL text below. It never imports the application's Prisma client
 * and cannot write production or development data.
 */
const source = fs.readFileSync('app/api/admin/finanzas/rentabilidad/route.ts', 'utf8');
assert.match(source, /FROM imputaciones_horas ih[\s\S]*?FOR UPDATE OF ih/, 'staff source lock must lock only ih');
assert.match(source, /LIMIT \$\{MAX_DETAIL_LINKS \+ 1\}/, 'detail links must have a bounded read');
assert.match(source, /LEAST\(100, GREATEST\(0, 100 - COALESCE\(alloc\.otros, 0\)\)\)/, 'candidate availability must be SQL-clamped');
assert.match(source, /v\.porcentaje IS NULL OR v\.porcentaje::text = 'NaN'/, 'malformed global allocations must block candidates');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const BASE = 'https://panel.example';
const saleId = 'sale-1';
const purchaseId = 'purchase-1';
let authenticated = true;
let active = true;
let readable = true;
let writable = true;
let adminFails = false;
let writeCheckFails = false;
let purchaseLinks: Array<{ id: string; facturaId: string; porcentaje: number; notas: string | null }> = [];
let auditRows: unknown[] = [];
let writeQueries: string[] = [];
let readQueries: string[] = [];
const session = { user: { id: '1', userType: 'admin', role: 'SUPER_ADMIN' } };

function sqlText(query: any) {
  if (typeof query === 'string') return query;
  return Array.isArray(query?.strings) ? query.strings.join('?') : String(query);
}

function queryRaw(query: any) {
  const tag = sqlText(query).replace(/\s+/g, ' ').trim();
  // Every response is selected by an SQL tag: no database client is available.
  readQueries.push(tag);
  if (tag.includes('SELECT COUNT(*)::int AS total FROM facturas_emitidas fe')) return [{total:1}];
  if (tag.includes('SELECT fe.id, fe.num_factura AS "numFactura", fe.cliente, fe.fecha')) return [{id:saleId,numFactura:'V-1',cliente:'Cliente test',fecha:new Date('2026-10-01'),concepto:'Material test',ventas:200}];
  if (tag.includes('SELECT id, fecha FROM facturas_emitidas')) return [];
  if (tag.includes('SELECT COUNT(*)::int AS total FROM facturas_recibidas fr')) return [{ total: 1 }];
  if (tag.includes('SELECT fr.id, fr.num_factura AS "numFactura", fr.proveedor')) {
    return [{ id: purchaseId, numFactura: 'R-1', proveedor: 'Proveedor test', fecha: new Date('2026-10-01'), base: 100, porcentajeDisponible: 140, bloqueado: false, motivo: null }];
  }
  if (tag.includes('SELECT id, estado::text AS estado FROM facturas_emitidas')) {
    return [{ id: saleId, estado: 'EMITIDA' }];
  }
  if (tag.includes('SELECT cliente_web_id AS "clienteWebId" FROM target_sale')) {
    return [{ clienteWebId: 7 }];
  }
  if (tag.includes('SELECT fr.id, fr.base::float8 AS base, fr.estado::text AS estado')) {
    return [{ id: purchaseId, base: 100, estado: 'RECIBIDA', tiene_cliente: false }];
  }
  if (tag.includes('SELECT id, factura_emitida_id AS "facturaId", porcentaje::float8 AS porcentaje, notas FROM vinculaciones_facturas')) {
    return purchaseLinks.map(link => ({ ...link }));
  }
  if (tag.includes('SELECT id FROM facturas_recibidas WHERE id')) return [{ id: purchaseId }];
  if (tag.includes('SELECT id, porcentaje::float8 AS porcentaje, notas FROM vinculaciones_facturas')) {
    const target = purchaseLinks.find(link => link.facturaId === saleId);
    return target ? [{ id: target.id, porcentaje: target.porcentaje, notas: target.notas }] : [];
  }
  throw new Error(`SQL mock sin despacho: ${tag.slice(0, 180)}`);
}

function executeRaw(query: any) {
  const tag = sqlText(query).replace(/\s+/g, ' ').trim();
  writeQueries.push(tag);
  if (tag.includes('UPDATE vinculaciones_facturas SET porcentaje')) {
    purchaseLinks = purchaseLinks.map(link => link.facturaId === saleId
      ? { ...link, porcentaje: 20, notas: 'después' }
      : link);
    return 1;
  }
  if (tag.includes('DELETE FROM vinculaciones_facturas WHERE id')) {
    purchaseLinks = purchaseLinks.filter(link => link.facturaId !== saleId);
    return 1;
  }
  if (tag.includes('INSERT INTO rentabilidad_auditoria')) {
    auditRows.push({ tag, values: query.values });
    return 1;
  }
  if (tag.includes('INSERT INTO vinculaciones_facturas')) {
    purchaseLinks.push({ id: 'new-link', facturaId: saleId, porcentaje: 20, notas: 'después' });
    return 1;
  }
  throw new Error(`Escritura SQL mock sin despacho: ${tag.slice(0, 180)}`);
}

const tx = { $queryRaw: async (query: any) => queryRaw(query), $executeRaw: async (query: any) => executeRaw(query) };
const prisma = {
  $queryRaw: async (query:any) => queryRaw(query),
  usuarioAdmin: {
    findUnique: async () => {
      if (adminFails) throw new Error('database unavailable');
      return { activo: active };
    },
  },
  $transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
    const linksBefore = JSON.stringify(purchaseLinks);
    const auditsBefore = auditRows.length;
    const writesBefore = writeQueries.length;
    try {
      return await work(tx);
    } catch (error) {
      purchaseLinks = JSON.parse(linksBefore);
      auditRows.splice(auditsBefore);
      writeQueries.splice(writesBefore);
      throw error;
    }
  },
};

const module = { exports: {} as any };
vm.runInNewContext(code, {
  module,
  exports: module.exports,
  Buffer,
  Date,
  URLSearchParams,
  TextEncoder,
  console,
  require: (name: string) => {
    if (name === 'next/server') return { NextRequest, NextResponse };
    if (name === 'next-auth') return { getServerSession: async () => authenticated ? session : null };
    if (name === 'node:crypto') return crypto;
    if (name === '@prisma/client') return { Prisma };
    if (name === '@/lib/auth') return { authOptions: {} };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/finanzas/sales-profitability') return profitabilityUtils;
    if (name === '@/lib/api-admin-area-read') return {
      checkAdminAreaRead: async () => readable ? null : NextResponse.json({}, { status: 403 }),
      checkAdminAreaWrite: async () => {
        if (writeCheckFails) throw new Error('permission database unavailable');
        return writable ? null : NextResponse.json({}, { status: 403 });
      },
    };
    throw new Error(`Módulo inesperado: ${name}`);
  },
});

const { GET, POST, DELETE } = module.exports as {
  GET: (request: NextRequest) => Promise<Response>;
  POST: (request: NextRequest) => Promise<Response>;
  DELETE: (request: NextRequest) => Promise<Response>;
};

function request(method: 'POST' | 'DELETE', body: unknown, origin = BASE) {
  return new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad`, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function status(response: Promise<Response>) { return (await response).status; }
function reset() {
  authenticated = true;
  active = true;
  readable = true;
  writable = true;
  adminFails = false;
  writeCheckFails = false;
  purchaseLinks = [];
  auditRows = [];
  writeQueries = [];
  readQueries = [];
}

async function main() {
  const link = { action: 'vincular_compra', facturaId: saleId, fuenteId: purchaseId, porcentaje: 20, notas: 'después' };
  const unlink = { action: 'quitar_compra', facturaId: saleId, fuenteId: purchaseId };

  reset();
  authenticated = false;
  assert.equal(await status(POST(request('POST', link))), 401, 'inactive session is rejected');
  authenticated = true;
  active = false;
  assert.equal(await status(POST(request('POST', link))), 401, 'inactive admin is rejected');
  active = true;
  readable = false;
  assert.equal(await status(GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad`))), 403, 'read permission is required');
  readable = true;
  writable = false;
  assert.equal(await status(POST(request('POST', link))), 403, 'write permission is required');
  writable = true;

  const flat = await (await GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad?desde=2026-10-01&hasta=2026-10-31&nivel=seleccionar`))).json();
  assert.equal(flat.facturas.length,1);
  assert.equal(flat.facturas[0].numFactura,'V-1');
  assert.equal(flat.canWrite,true);
  authenticated=false;
  assert.equal(await status(GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad?ventaId=${saleId}`))),401);
  authenticated=true;
  readable=false;
  assert.equal(await status(GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad?ventaId=${saleId}`))),403);
  readable=true;
  assert.equal(await status(GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad?ventaId=invalid!`))),400);
  assert.equal(await status(GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad?ventaId=${saleId}&facturaIspId=1`))),400);
  assert.equal(await status(GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad?ventaId=not-found`))),404);
  assert.equal(writeQueries.length,0);
  const candidates = await (await GET(new NextRequest(`${BASE}/api/admin/finanzas/rentabilidad?desde=2026-10-01&hasta=2026-10-31&nivel=compras&facturaId=${saleId}`))).json();
  assert.equal(candidates.total, 1, 'candidate total comes from the selected purchase family');
  assert.equal(candidates.compras.length, 1);
  assert.equal(candidates.personal.length, 0, 'purchase candidate view omits the other family');
  assert.equal(candidates.compras[0].porcentajeDisponible, 100, 'defensive candidate mapper clamps availability');
  assert.equal(readQueries.filter(tag => tag.includes('imputaciones_horas')).length, 0, 'purchase candidates issue no staff-family query');

  assert.equal(await status(POST(request('POST', link, 'https://other.example'))), 403, 'cross-origin write is rejected');
  assert.equal(writeQueries.length, 0);
  assert.equal(await status(POST(request('POST', unlink))), 400, 'POST only permits vincular actions');
  assert.equal(await status(DELETE(request('DELETE', link))), 400, 'DELETE only permits quitar actions');
  assert.equal(await status(POST(request('POST', { ...link, porcentaje: 1.234 }))), 400, 'three-decimal percentage is rejected');
  assert.equal(await status(POST(request('POST', { ...link, porcentaje: Number.POSITIVE_INFINITY }))), 400, 'non-finite percentage is rejected');
  assert.equal(writeQueries.length, 0, 'validation and method errors do not write');

  purchaseLinks = [{ id: 'other-link', facturaId: 'sale-2', porcentaje: 90, notas: null }];
  assert.equal(await status(POST(request('POST', link))), 409, 'over-allocation is rejected');
  assert.equal(writeQueries.length, 0, 'over-allocation rolls back with no writes');

  purchaseLinks = [{ id: 'target-link', facturaId: saleId, porcentaje: 10, notas: 'antes' }];
  assert.equal(await status(POST(request('POST', link))), 200, 'existing allocation updates');
  assert.equal(auditRows.length, 1, 'update has one audit event');
  assert.match(JSON.stringify(auditRows[0]), /antes/, 'update audit preserves the prior notes');
  assert.match(JSON.stringify(auditRows[0]), /después/, 'update audit preserves the new notes');
  assert.equal(await status(POST(request('POST', link))), 200, 'same update is idempotent');
  assert.equal(auditRows.length, 1, 'idempotent update has no extra audit');
  assert.equal(await status(DELETE(request('DELETE', unlink))), 200, 'allocation deletes');
  assert.equal(auditRows.length, 2, 'delete has one before/after audit event');
  assert.match(JSON.stringify(auditRows[1]), /después/, 'delete audit preserves the removed percentage and notes');
  assert.equal(await status(DELETE(request('DELETE', unlink))), 200, 'same delete is idempotent');
  assert.equal(auditRows.length, 2, 'idempotent delete has no extra audit');

  adminFails = true;
  assert.equal(await status(POST(request('POST', link))), 500, 'auth database failures are safely converted to JSON errors');
  adminFails = false;
  writeCheckFails = true;
  assert.equal(await status(POST(request('POST', link))), 500, 'permission database failures are safely converted to JSON errors');

  console.log('Profitability API: VM SQL dispatch validated session/active/permissions/origin, methods, percentage and over-allocation rejection, update/delete audit idempotence, and safe auth failures; zero real writes.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
