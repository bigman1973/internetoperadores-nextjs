import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConciliarDocumentPreview from '../components/finanzas/conciliar/ConciliarDocumentPreview';
import type { ConciliarDocumentDetail } from '../lib/finanzas/conciliar-document-detail-contract';
import type { ConciliarRow } from '../components/finanzas/conciliar/conciliar-contract';

const row: ConciliarRow = {
  id: 'sintetico-factura', movimientoId: 'sintetico-movimiento', fecha: '2026-10-01', concepto: 'Pago sintético', banco: 'Banco de prueba', cuenta: 'Cuenta de prueba', importeCentimos: -12000, pendienteCentimos: -12000,
  color: 'VERDE', grupo: 'FACTURA_PROVEEDOR', motivo: 'Prueba de presentación.', documento: null, propuesta: null, seleccionable: false, diferenciaCentimos: 0, linksMovimiento: [], detail: null, decisionHash: 'a'.repeat(64),
};
const base: ConciliarDocumentDetail = {
  rowId: row.id, kind: 'FACTURA', titulo: 'Factura sintética', bancoEmisor: 'Banco de prueba', numeroLiquidacion: null, referenciaDocumento: null, fechaLiquidacion: '2026-10-01', cuentaAbono: null,
  proveedor: 'Proveedor de prueba', numeroFactura: 'TEST-42', fechaFactura: '2026-09-01', importeFacturaCentimos: 12000, lineas: [], nominalCentimos: 12000, interesesCentimos: null, comisionCentimos: null, ivaComisionCentimos: null,
  netoDocumentoCentimos: -12000, importeBancoCentimos: -12000, cuadreExacto: true, avisos: [], pdfHref: null,
};
function render(overrides: Partial<ConciliarDocumentDetail> = {}) {
  return renderToStaticMarkup(createElement(ConciliarDocumentPreview, { document: { row, status: 'ready', detail: { ...base, ...overrides }, error: null }, onClose: () => undefined, onRetry: () => undefined }));
}

test('factura y pago muestran magnitudes sin signos opuestos, con cuadre y signo real conservado en cabecera', () => {
  const html = render();
  assert.match(html, /Importe de factura<\/dt><dd[^>]*>120,00/);
  assert.match(html, /Salida del banco<\/dt><dd[^>]*>120,00/);
  assert.match(html, /Factura 120,00[^<]* = Pago 120,00[^<]* ✔/);
  assert.match(html, /Estado: exacto\./);
  assert.match(html, /signo bancario original/);
  assert.match(html, /Movimiento:[^<]*−120,00/);
});

test('el sello de servidor no sustituye el cuadre exacto ni se muestra igualdad falsa', () => {
  const mismatch = render({ importeBancoCentimos: -12001 });
  assert.match(mismatch, /Factura 120,00[^<]* ≠ Pago 120,01/);
  assert.doesNotMatch(mismatch, /✔/);
  const unsealed = render({ cuadreExacto: false });
  assert.match(unsealed, /Factura 120,00[^<]* = Pago 120,00/);
  assert.match(unsealed, /Estado: revisión\./);
  assert.doesNotMatch(unsealed, /✔|≠/);
});

test('datos ausentes o sentido de ingreso no se disfrazan de pago exacto', () => {
  assert.doesNotMatch(render({ importeBancoCentimos: null }), /✔/);
  const incoming = render({ importeBancoCentimos: 12000 });
  assert.match(incoming, /Ingreso del banco/);
  assert.match(incoming, /revisa el sentido del pago o abono/);
  assert.doesNotMatch(incoming, /✔/);
});
