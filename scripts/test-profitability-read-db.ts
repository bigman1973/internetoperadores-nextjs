import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import * as engine from '../lib/finanzas/sales-profitability';

// Ejecuta solo GET: SQL real de lectura con sesión sintética local; nunca envía operaciones al panel.
const client = new PrismaClient();
const code = ts.transpileModule(fs.readFileSync('app/api/admin/finanzas/rentabilidad/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const module = { exports: {} as any };
const readOnly = {
  usuarioAdmin: { findUnique: async () => ({ activo: true }) },
  $queryRaw: (q: Prisma.Sql) => client.$queryRaw(q),
  $transaction: async (work: (tx: unknown) => unknown, options: any) => client.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return work({ $queryRaw: (q: Prisma.Sql) => tx.$queryRaw(q), $executeRaw: () => { throw new Error('Escritura no permitida'); } });
  }, options),
};
vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, Date, Buffer, TextEncoder, console, require: (name: string) => {
  if (name === 'next/server') return { NextRequest, NextResponse };
  if (name === 'next-auth') return { getServerSession: async () => ({ user: { id: '1', userType: 'admin' } }) };
  if (name === '@prisma/client') return { Prisma };
  if (name === '@/lib/auth') return { authOptions: {} };
  if (name === '@/lib/prisma') return { prisma: readOnly };
  if (name === '@/lib/finanzas/sales-profitability') return engine;
  if (name === '@/lib/api-admin-area-read') return { checkAdminAreaRead: async () => null, checkAdminAreaWrite: async () => null };
  if (name === 'node:crypto') return require('node:crypto');
  throw new Error('Módulo inesperado');
}});
async function get(params: string, annual = false) {
  const period = annual ? 'desde=2026-01-01&hasta=2026-12-31' : 'desde=2026-09-01&hasta=2026-09-30';
  const res = await module.exports.GET(new NextRequest(`https://panel.test/api/admin/finanzas/rentabilidad?${period}&${params}`));
  assert.equal(res.status, 200, `GET ${params.split('&')[0]} debe devolver 200`);
  return res.json();
}
async function main() {
  const root = await get('nivel=servicios');
  assert.equal(root.servicios.length, 4);
  for (const key of ['ventas', 'comprasDirectas', 'comprasCliente', 'personalDirecto', 'personalCliente', 'margenConocido']) assert.equal(Math.round(root.servicios.reduce((sum: number, row: any) => sum + row[key], 0) * 100), Math.round(root.kpis[key] * 100), `Conciliación ${key}`);
  const clients = await get('nivel=clientes&servicioKey=__SIN_DESGLOSE__');
  assert.ok(clients.clientes.length > 0);
  const invoices = await get(`nivel=facturas&servicioKey=__SIN_DESGLOSE__&clienteKey=${encodeURIComponent(clients.clientes[0].key)}`);
  assert.ok(invoices.facturas.length > 0);
  const id = invoices.facturas[0].id;
  const detail = await get(`nivel=detalle&facturaId=${id}`);
  assert.equal(detail.factura.id, id);
  const flat = await get('nivel=seleccionar');
  assert.ok(flat.facturas.length > 0);
  assert.ok(flat.facturas.length <= 25);
  const exact = await get(`nivel=seleccionar&buscar=${encodeURIComponent(detail.factura.numFactura)}`);
  assert.ok(exact.facturas.some((row:any)=>row.id===id));
  const directRes = await module.exports.GET(new NextRequest(`https://panel.test/api/admin/finanzas/rentabilidad?ventaId=${id}`));
  assert.equal(directRes.status, 200, 'ventaId directo');
  assert.equal((await directRes.json()).factura.id, id);
  const mapping = await client.$queryRaw<{id:number}[]>(Prisma.sql`SELECT f.id FROM facturas f JOIN facturas_emitidas fe ON fe.id_externo=f.isp_gestion_id::text AND LOWER(BTRIM(fe.origen_sistema))='ispgestion' WHERE fe.id=${id} LIMIT 1`);
  assert.equal(mapping.length, 1);
  const ispRes = await module.exports.GET(new NextRequest(`https://panel.test/api/admin/finanzas/rentabilidad?facturaIspId=${mapping[0].id}`));
  assert.equal(ispRes.status, 200, 'facturaIspId directo');
  assert.equal((await ispRes.json()).factura.id, id);
  const invalid = await module.exports.GET(new NextRequest('https://panel.test/api/admin/finanzas/rentabilidad?facturaIspId=1 OR 1=1'));
  assert.equal(invalid.status, 400);
  const ambiguous = await module.exports.GET(new NextRequest(`https://panel.test/api/admin/finanzas/rentabilidad?ventaId=${id}&facturaIspId=1`));
  assert.equal(ambiguous.status, 400);
  const absent = await module.exports.GET(new NextRequest('https://panel.test/api/admin/finanzas/rentabilidad?ventaId=no-existing-sale'));
  assert.equal(absent.status, 404);
  const purchases = await get(`nivel=compras&facturaId=${id}`);
  const staff = await get(`nivel=personal&facturaId=${id}`);
  assert.equal(purchases.personal.length, 0);
  assert.equal(staff.compras.length, 0);
  assert.ok(purchases.compras.every((row: any) => row.porcentajeDisponible >= 0 && row.porcentajeDisponible <= 100));
  const supplier = purchases.compras[0]?.proveedor;
  assert.ok(supplier);
  const supplierPurchases = await get(`nivel=compras&facturaId=${id}&proveedor=${encodeURIComponent(supplier.trim().toLowerCase())}`);
  assert.ok(supplierPurchases.compras.length > 0);
  assert.ok(supplierPurchases.compras.every((row:any) => row.proveedor.trim().toLowerCase() === supplier.trim().toLowerCase()));
  const expected = await client.$queryRaw<{count:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM facturas_emitidas WHERE fecha >= '2026-10-01' AND fecha < '2026-11-01' AND estado::text NOT IN ('ANULADA','BORRADOR')`);
  const seen = new Set<string>();
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const response = await module.exports.GET(new NextRequest(`https://panel.test/api/admin/finanzas/rentabilidad?nivel=seleccionar&desde=2026-10-01&hasta=2026-10-31&page=${page}&limit=50`));
    assert.equal(response.status, 200);
    const body = await response.json();
    pages = body.totalPages;
    assert.equal(body.total, expected[0].count);
    for (const invoice of body.facturas) { assert.ok(!seen.has(invoice.id)); seen.add(invoice.id); assert.ok(Array.isArray(invoice.proveedores)); }
  }
  assert.equal(seen.size, expected[0].count, 'Todas las ventas de octubre sin pérdidas ni duplicados');
  const allDates = await get('nivel=seleccionar&todasFechas=1');
  assert.ok(allDates.total >= seen.size);
  const annualRoot = await get('nivel=servicios', true);
  assert.equal(annualRoot.servicios.length, 4);
  for (const key of ['ventas', 'comprasDirectas', 'comprasCliente', 'personalDirecto', 'personalCliente', 'margenConocido']) assert.equal(Math.round(annualRoot.servicios.reduce((sum: number, row: any) => sum + row[key], 0) * 100), Math.round(annualRoot.kpis[key] * 100), `Conciliación anual ${key}`);
  assert.ok((await get('nivel=clientes&servicioKey=__SIN_DESGLOSE__', true)).clientes.length > 0);
  console.log(JSON.stringify({ accesoDirectoSinArbol:true, identidadIspInequivoca:true, seleccionConDatosReales:true, apiSQLRealCorrecta: true, cuatroModelosVisibles: true, serviciosConciliados: true, nivelesYFuentesCorrectos: true, anioCompletoCorrecto: true, escriturasReales: 0 }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Prueba no superada'); process.exitCode = 1; }).finally(() => client.$disconnect());
