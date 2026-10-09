import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assessPendingInvoice,
  accountingSiteNameMatches,
  normalizeScopeFolderName,
  parsePendingInvoiceResult,
  PENDING_REFACTORING_SCOPE,
  sanitizePendingResult,
} from '../lib/finanzas/pending-refactoring';

const valid = {
  proveedor: 'Operadora de prueba, S.A.',
  destinatario: 'Vola Telecomunicaciones, S.L.',
  numFactura: 'F-2026-0001',
  fecha: '2026-02-28',
  base: 100,
  iva: 21,
  total: 121,
  moneda: 'EUR',
  confianza: 0.96,
  concepto: 'Servicios de red',
  lineas: [{ descripcion: 'Circuito de prueba', importe: 100 }],
};

function expectRejected(value: unknown) {
  assert.throws(() => parsePendingInvoiceResult(JSON.stringify(value)));
}

function main() {
  assert.equal(PENDING_REFACTORING_SCOPE, '2. Contabilidad y finanzas/2. Facturas recibidas/2. Facturas recibidas- Vola/2026');
  assert.equal(normalizeScopeFolderName(' 2. Facturas recibidas - VOLA '), normalizeScopeFolderName('2. Facturas recibidas‐Vola'));
  assert.notEqual(normalizeScopeFolderName('2. Facturas recibidas-Vola'), normalizeScopeFolderName('2. Facturas recibidas-Internet Operadores'));

  assert.equal(accountingSiteNameMatches('IO: Accounting & Finances'), true);
  assert.equal(accountingSiteNameMatches('IO_AccountingFinances'), true);
  assert.equal(accountingSiteNameMatches('Other Accounting'), false);
  const parsed = parsePendingInvoiceResult('```json\n' + JSON.stringify(valid) + '\n```');
  assert.deepEqual(parsed, valid);
  assert.deepEqual(assessPendingInvoice(parsed), { estado: 'LISTO', incidencia: null });
  assert.equal(sanitizePendingResult({ ...valid, total: Infinity }), null, 'untrusted JSON is never surfaced');
  expectRejected({ ...valid, fecha: '2026-02-30' });
  expectRejected({ ...valid, base: 100.001 });
  expectRejected({ ...valid, sorpresa: true });
  assert.equal(assessPendingInvoice(parsePendingInvoiceResult(JSON.stringify({ ...valid, lineas: [{ descripcion: 'x', importe: null }] }))).estado, 'REVISION');

  const unreadable = parsePendingInvoiceResult(JSON.stringify({ ...valid, destinatario: null }));
  assert.equal(assessPendingInvoice(unreadable).estado, 'REVISION', 'null values remain null and cannot become LISTO');
  assert.equal(assessPendingInvoice(parsePendingInvoiceResult(JSON.stringify({ ...valid, confianza: 0.84 }))).estado, 'REVISION');
  assert.equal(assessPendingInvoice(parsePendingInvoiceResult(JSON.stringify({ ...valid, moneda: 'USD' }))).estado, 'REVISION');
  assert.match(assessPendingInvoice(parsePendingInvoiceResult(JSON.stringify({ ...valid, destinatario: 'Internet Operadores, S.L.' }))).incidencia || '', /Internet Operadores/);
  assert.equal(assessPendingInvoice(parsePendingInvoiceResult(JSON.stringify({ ...valid, lineas: [{ descripcion: 'x', importe: 99.97 }] }))).estado, 'REVISION');
  assert.equal(assessPendingInvoice(parsePendingInvoiceResult(JSON.stringify({ ...valid, total: 121.03 }))).estado, 'REVISION');
  assert.equal(assessPendingInvoice(parsePendingInvoiceResult(JSON.stringify({ ...valid, total: 121.02 }))).estado, 'LISTO', 'two-cent arithmetic tolerance is permitted');

  const sources = [
    'lib/finanzas/pending-refactoring.ts',
    'app/api/admin/finanzas/costes-operadora/pendientes/route.ts',
    'app/api/admin/finanzas/costes-operadora/pendientes/[id]/pdf/route.ts',
  ].map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /\.(?:facturaRecibida|vinculacionFactura|articuloCosteOperadora)\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/, 'pending discovery/analysis must never write invoices, links, or articles');
  assert.doesNotMatch(sources, /moveFile\s*\(|method:\s*['"](?:PATCH|PUT)['"]/, 'pending discovery never moves or overwrites Graph files');
  assert.doesNotMatch(sources, /extraerDatosFactura/, 'the unsafe legacy invoice extractor must not be reused');
  console.log('Pendientes refacturación: alcance fijo, JSON crudo estricto, nulos, tolerancias, revisión fail-closed y guardas sin escrituras contables correctos.');
}
main();
