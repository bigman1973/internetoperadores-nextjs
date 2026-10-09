import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { Prisma, PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import * as costs from '../lib/finanzas/operator-costs';

// Opt-in: esta prueba usa PostgreSQL configurado, siempre dentro de rollback.
if (process.env.OPERATOR_POSTGRES_ROLLBACK_TEST !== '1') throw new Error('Activa explícitamente OPERATOR_POSTGRES_ROLLBACK_TEST=1.');
const prisma = new PrismaClient({ log: [] });
const rollback = new Error('ROLLBACK_OBLIGATORIO_TEST_OPERADORA');
const counts = async () => ({ sources: await prisma.fuenteCosteOperadora.count(), articles: await prisma.articuloCosteOperadora.count(), documents: await prisma.documentoCosteOperadora.count(), audits: await prisma.auditoriaCosteOperadora.count(), invoices: await prisma.facturaRecibida.count(), groups: await prisma.grupoCosteOperadora.count(), links: await prisma.vinculacionFactura.count() });
async function main() {
  const before = await counts();
  const invoice = await prisma.facturaRecibida.findFirst({ where: { proveedor: { contains: 'Cogent', mode: 'insensitive' }, estado: { not: 'RECHAZADA' }, imputadoAVentas: false, documentosOperadora: { none: {} } }, select: { id: true, proveedor: true, numFactura: true, fecha: true, base: true, concepto: true, lineasDetalle: true }, orderBy: { fecha: 'desc' } });
  const group = await prisma.grupoCosteOperadora.findFirst({ select: { id: true } });
  const user = await prisma.usuarioAdmin.findFirst({ where: { activo: true, rol: 'SUPER_ADMIN' }, select: { id: true } });
  assert(invoice && group && user, 'faltan referencias de solo lectura para la prueba');
  const id = randomUUID();
  const snapshot = costs.invoiceSnapshot(invoice);
  const valid = snapshot.lineas.find(l => l.importe !== null && l.importe >= 0 && l.importe <= snapshot.base);
  const assignments = valid ? [{ indice: valid.index, grupoId: group.id }] : [];
  let completed = false;
  try {
    await prisma.$transaction(async tx => {
      const source = fs.readFileSync('app/api/admin/finanzas/costes-operadora/route.ts', 'utf8');
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      const module = { exports: {} as any };
      const adapter = new Proxy(tx, { get(target, prop) { if (prop === '$transaction') return (fn: any) => fn(tx); return Reflect.get(target, prop); } });
      vm.runInNewContext(code, { module, exports: module.exports, Buffer, TextEncoder, console, require(name: string) {
        if (name === 'next/server') return { NextRequest, NextResponse };
        if (name === '@prisma/client') return { Prisma };
        if (name === '@/lib/prisma') return { __esModule: true, default: adapter };
        if (name === '@/lib/finanzas/operator-costs') return costs;
        if (name === '@/lib/finanzas/operator-costs-auth') return { operatorAuth: async () => ({ userId: user.id, canWrite: true }), operatorJson: (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } }) };
        throw new Error('Módulo no permitido: ' + name);
      } });
      const send = (body: any) => module.exports.POST(new NextRequest('https://panel.example/api/admin/finanzas/costes-operadora', { method: 'POST', headers: { origin: 'https://panel.example', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
      const body = { action: 'guardar', id, origen: 'PROPIA', facturaId: invoice.id, facturaVersion: costs.digest(snapshot), asignaciones: assignments, estado: 'BORRADOR' };
      const created = await send(body);
      assert.equal(created.status, 200, 'el guardado completo debe funcionar con PostgreSQL real');
      const data = await created.json();
      assert.equal(data.success, true);
      assert.equal(data.fuente.periodo, snapshot.fecha.slice(0, 7), 'mes derivado de la factura, no del filtro de pantalla');
      assert.equal(data.fuente.documentos.length, 1);
      assert.equal(data.fuente.asignaciones.length, assignments.length);
      assert.equal(await tx.auditoriaCosteOperadora.count({ where: { fuenteId: id } }), 1);
      assert.equal((await send(body)).status, 200, 'reintento idempotente');
      assert.equal((await send({ ...body, id: randomUUID() })).status, 409, 'documento duplicado bloqueado');
      assert.equal((await send({ ...body, version: data.fuente.version, notas: 'Prueba transaccional revertida' })).status, 200, 'edición funciona');
      assert.equal((await tx.facturaRecibida.findUniqueOrThrow({ where: { id: invoice.id }, select: { proveedor: true, numFactura: true, fecha: true, base: true, concepto: true, lineasDetalle: true } })).lineasDetalle, invoice.lineasDetalle);
      completed = true;
      throw rollback;
    }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) { if (error !== rollback) throw error; }
  assert(completed, 'la transacción debe probar el flujo completo antes de revertirse');
  assert.equal(await prisma.fuenteCosteOperadora.count({ where: { id } }), 0, 'ningún registro de prueba persistido');
  assert.deepEqual(await counts(), before, 'conteos intactos después del rollback');
  console.log('PostgreSQL real: guardado Cogent, artículos, documento, auditoría, reintento, duplicado y edición correctos. Rollback obligatorio confirmado; cero datos de prueba persistidos.');
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : 'Error técnico en prueba transaccional; transacción revertida.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
