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
  $transaction: async (work: (tx: unknown) => unknown, options: any) => client.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return work({ $queryRaw: (q: Prisma.Sql) => tx.$queryRaw(q), $executeRaw: () => { throw new Error('Escritura no permitida'); } });
  }, options),
};
vm.runInNewContext(code, { module, exports: module.exports, Buffer, TextEncoder, console, require: (name: string) => {
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
  const purchases = await get(`nivel=compras&facturaId=${id}`);
  const staff = await get(`nivel=personal&facturaId=${id}`);
  assert.equal(purchases.personal.length, 0);
  assert.equal(staff.compras.length, 0);
  assert.ok(purchases.compras.every((row: any) => row.porcentajeDisponible >= 0 && row.porcentajeDisponible <= 100));
  const annualRoot = await get('nivel=servicios', true);
  assert.equal(annualRoot.servicios.length, 4);
  for (const key of ['ventas', 'comprasDirectas', 'comprasCliente', 'personalDirecto', 'personalCliente', 'margenConocido']) assert.equal(Math.round(annualRoot.servicios.reduce((sum: number, row: any) => sum + row[key], 0) * 100), Math.round(annualRoot.kpis[key] * 100), `Conciliación anual ${key}`);
  assert.ok((await get('nivel=clientes&servicioKey=__SIN_DESGLOSE__', true)).clientes.length > 0);
  console.log(JSON.stringify({ apiSQLRealCorrecta: true, cuatroModelosVisibles: true, serviciosConciliados: true, nivelesYFuentesCorrectos: true, anioCompletoCorrecto: true, escriturasReales: 0 }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Prueba no superada'); process.exitCode = 1; }).finally(() => client.$disconnect());
