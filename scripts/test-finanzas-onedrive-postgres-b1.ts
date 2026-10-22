import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { Prisma, PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import * as inventory from '../lib/finanzas/onedrive-inventory';
import { FACTURAS_BASE_PATH, CARPETAS } from '../lib/finanzas/microsoft-graph';

if (process.env.B1_STAGING_ROLLBACK_TEST !== '1') throw new Error('Activa B1_STAGING_ROLLBACK_TEST=1');
const p = new PrismaClient({ log: [] });
const rollback = new Error('ROLLBACK_B1_OBLIGATORIO');
async function main() {
  const where = await p.$queryRaw<Array<{ db: string; usuario: string }>>`SELECT current_database() AS db, current_user AS usuario`;
  assert.equal(where[0]?.db, 'io_staging_finanzas');
  assert.equal(where[0]?.usuario, 'io_staging_finanzas');
  const countBefore = await p.facturaRecibida.count();
  const auditsBefore = await p.historialUbicacionFacturaRecibida.count();
  let exercised = false;
  try {
    await p.$transaction(async tx => {
      const actor = await tx.usuarioAdmin.findFirst({ where: { activo: true }, select: { id: true } });
      const invoice = await tx.facturaRecibida.findFirst({ where: { oneDriveItemId: { not: null } } });
      assert(actor && invoice);
      const before = { total: invoice.total, base: invoice.base, importeIva: invoice.importeIva, importeIrpf: invoice.importeIrpf, fecha: invoice.fecha, estado: invoice.estado, imputacion: invoice.imputacion, imputadoAVentas: invoice.imputadoAVentas, datosOcrRaw: invoice.datosOcrRaw, lineasDetalle: invoice.lineasDetalle };
      const source = fs.readFileSync('app/api/admin/finanzas/sincronizar-onedrive/route.ts', 'utf8');
      const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      const module = { exports: {} as any };
      const adapter = new Proxy(tx, { get(target, prop) { if (prop === '$transaction') return (fn: any) => fn(tx); return Reflect.get(target, prop); } });
      const path = `${FACTURAS_BASE_PATH}/${CARPETAS.TRIMESTRE_2}`;
      const item = { id: invoice.oneDriveItemId!, name: 'factura-prueba-rollback.pdf', relativeFolderPath: path, fullPath: `${path}/factura-prueba-rollback.pdf` };
      vm.runInNewContext(code, { module, exports: module.exports, Buffer, TextEncoder, TextDecoder, console, process, require(name: string) {
        if (name === 'next/server') return { NextRequest, NextResponse };
        if (name === '@prisma/client') return { Prisma };
        if (name === 'next-auth') return { getServerSession: async () => ({ user: { userType: 'admin', id: actor.id } }) };
        if (name === '@/lib/auth') return { authOptions: {} };
        if (name === '@/lib/api-admin-area-read') return { checkAdminAreaRead: async () => null, checkAdminAreaWrite: async () => null };
        if (name === '@/lib/prisma') return { prisma: adapter };
        if (name === '@/lib/finanzas/onedrive-inventory') return inventory;
        if (name === '@/lib/finanzas/ocr-facturas') return { extraerDatosFactura: () => { throw new Error('OCR no permitido'); } };
        if (name === '@/lib/finanzas/microsoft-graph') return { FACTURAS_BASE_PATH, resolveInvoiceLibrary: async () => ({ driveId: invoice.oneDriveDriveId || 'drive-prueba' }), listFolderContents: async (_d: string, folder: string) => folder === path ? [item] : [], downloadFile: () => { throw new Error('Descarga no permitida'); } };
        throw new Error('Módulo no permitido: '+name);
      } });
      const send = (confirmed = false) => module.exports.POST(new NextRequest('https://staging.example/api/admin/finanzas/sincronizar-onedrive', { method: 'POST', headers: { origin: 'https://staging.example', 'content-type': 'application/json' }, body: JSON.stringify({ carpeta: 'trimestre2', soloUbicaciones: true, ...(confirmed ? { bibliotecaHistoricaConfirmada: invoice.oneDriveDriveId || 'drive-prueba' } : {}) }) }));
      if (!invoice.oneDriveDriveId) { const blocked = await send(); assert.equal(blocked.status, 409); assert.equal(await tx.historialUbicacionFacturaRecibida.count(), auditsBefore); }
      const first = await send(true); assert.equal(first.status, 200); const firstBody = await first.json(); assert.equal(firstBody.ubicacionesActualizadas, 1);
      const second = await send(); assert.equal(second.status, 200); assert.equal((await second.json()).ubicacionesActualizadas, 0);
      const after = await tx.facturaRecibida.findUniqueOrThrow({ where: { id: invoice.id } });
      for (const [key, value] of Object.entries(before)) assert.deepEqual((after as any)[key], value, 'Campo financiero/validado alterado: '+key);
      assert.equal(after.estadoCarpeta, 'CONTABILIZADA_GESTORIA');
      assert.equal(after.carpetaOrigen, CARPETAS.TRIMESTRE_2);
      assert.equal(await tx.historialUbicacionFacturaRecibida.count(), auditsBefore + 1);
      exercised = true; throw rollback;
    }, { timeout: 45000 });
  } catch (e) { if (e !== rollback) throw e; }
  assert(exercised);
  assert.equal(await p.facturaRecibida.count(), countBefore);
  assert.equal(await p.historialUbicacionFacturaRecibida.count(), auditsBefore);
  console.log('B1 PostgreSQL staging: ubicación/historial correctos e idempotentes; importes, fechas, estados y vínculos conservados; rollback obligatorio sin datos de prueba persistidos.');
}
main().catch(e => { console.error(e instanceof assert.AssertionError ? e.message : 'Prueba B1 no completada; transacción revertida.'); process.exitCode = 1; }).finally(() => p.$disconnect());
