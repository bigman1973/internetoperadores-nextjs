import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConciliarDocumentPreview from '../components/finanzas/conciliar/ConciliarDocumentPreview';
import { groupConciliarRows } from '../components/finanzas/conciliar/conciliar-ui-helpers';
import type { ConciliarRow } from '../components/finanzas/conciliar/conciliar-contract';
import type { ConciliarDocumentDetail } from '../lib/finanzas/conciliar-document-detail-contract';

const root = process.cwd();
const sha = 'a'.repeat(64);

function row(input: Readonly<Partial<ConciliarRow> & Pick<ConciliarRow, 'id' | 'color' | 'importeCentimos' | 'grupo'>>): ConciliarRow {
  return {
    id: input.id,
    movimientoId: 'movement',
    fecha: '2026-10-28',
    concepto: `Movimiento ${input.id}`,
    banco: 'Banco sintético',
    cuenta: 'ES00',
    importeCentimos: input.importeCentimos,
    pendienteCentimos: input.importeCentimos,
    color: input.color,
    grupo: input.grupo,
    motivo: 'Revisión sintética completa: falta o no cuadra una fuente documental.',
    documento: null,
    propuesta: null,
    seleccionable: false,
    diferenciaCentimos: 0,
    linksMovimiento: [],
    detail: null,
    decisionHash: sha,
    ...input,
  };
}

const remesaDetail: ConciliarDocumentDetail = {
  rowId: 'remesa-grande',
  kind: 'REMESA',
  titulo: 'Remesa sintética R-42',
  bancoEmisor: 'Banco sintético',
  numeroLiquidacion: null,
  referenciaDocumento: null,
  fechaLiquidacion: '2026-10-28',
  cuentaAbono: 'ES00',
  proveedor: null,
  numeroFactura: null,
  fechaFactura: null,
  importeFacturaCentimos: null,
  lineas: [
    { numero: 'REC-1', cliente: 'Cliente sintético A', fechaEmision: '2026-10-01', fechaVencimiento: '2026-10-15', nominalCentimos: 7000 },
    { numero: 'REC-2', cliente: 'Cliente sintético B', fechaEmision: '2026-10-02', fechaVencimiento: '2026-10-16', nominalCentimos: 5000 },
  ],
  nominalCentimos: 12000,
  interesesCentimos: null,
  comisionCentimos: null,
  ivaComisionCentimos: null,
  netoDocumentoCentimos: 12000,
  importeBancoCentimos: 12000,
  cuadreExacto: false,
  avisos: ['Prueba sintética de diferencia.'],
  pdfHref: '/api/admin/finanzas/conciliar/archivo/synthetic_pdf',
};

function renderDetail(detail: ConciliarDocumentDetail, movement: ConciliarRow): string {
  return renderToStaticMarkup(createElement(ConciliarDocumentPreview, {
    document: { row: movement, status: 'ready', detail, error: null },
    onClose: () => undefined,
    onRetry: () => undefined,
  }));
}

function restoreGlobal(name: 'document' | 'HTMLElement' | 'setTimeout' | 'clearTimeout', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete (globalThis as Record<string, unknown>)[name];
}

test('agrupar Remesas canónicas una sola vez conserva colores y orden descendente por magnitud', () => {
  const grouped = groupConciliarRows([
    row({ id: 'remesa-pequena', color: 'ROJO', importeCentimos: 3000, grupo: 'REMESA_PENDIENTE' }),
    row({ id: 'banco', color: 'VERDE', importeCentimos: 9000, grupo: 'COMISION_BANCO' }),
    row({ id: 'remesa-grande', color: 'VERDE', importeCentimos: 12000, grupo: 'remesas cobradas' }),
    row({ id: 'remesa-media', color: 'AMBAR', importeCentimos: -7000, grupo: 'Remesa parcial' }),
  ]);

  const remesas = grouped.filter((group) => group.label === 'Remesas');
  assert.equal(remesas.length, 1, 'las variantes de remesa no se separan por color');
  assert.deepEqual(remesas[0].rows.map((item) => item.id), ['remesa-grande', 'remesa-media', 'remesa-pequena']);
  assert.deepEqual(remesas[0].colorCounts, { VERDE: 1, AMBAR: 1, ROJO: 1 });
  assert.ok(!remesas[0].rows.every((item) => item.color === 'VERDE'), 'un grupo mixto no se clasifica falsamente como verde');
  assert.equal(grouped[0].label, 'Remesas', 'los grupos se ordenan por la mayor magnitud visible');
});

test('el drawer renderiza carga y remesa con cuadro textual, nota completa y solamente enlace PDF de mismo origen', () => {
  const movement = row({ id: 'remesa-grande', color: 'AMBAR', importeCentimos: 12000, grupo: 'REMESA' });
  const loading = renderToStaticMarkup(createElement(ConciliarDocumentPreview, { document: { row: movement, status: 'loading', detail: null, error: null }, onClose: () => undefined, onRetry: () => undefined }));
  assert.match(loading, /role="dialog"/);
  assert.match(loading, /aria-modal="true"/);
  assert.match(loading, /data-testid="conciliar-document-detail-loading"/);
  assert.match(loading, /Nota del movimiento/);
  assert.match(loading, /Revisión sintética completa: falta o no cuadra una fuente documental\./);
  assert.doesNotMatch(loading, /<iframe|<object|<embed|blob:/i);

  const ready = renderDetail(remesaDetail, movement);
  assert.match(ready, /data-testid="conciliar-document-detail-loaded"/);
  assert.match(ready, /Abono bancario/);
  assert.match(ready, /Cuenta de abono/);
  assert.match(ready, /Recibos que constan en este documento/);
  assert.match(ready, /Suma de recibos = ingreso del banco/);
  assert.match(ready, /Estado: desajuste\./);
  assert.match(ready, /Abrir PDF/);
  assert.match(ready, /target="_blank"/);
  assert.match(ready, /rel="noopener noreferrer"/);
  assert.doesNotMatch(ready, /Intereses|IVA de comisión|Neto del documento|Factura de proveedor|No consta/);
  assert.doesNotMatch(ready, /<iframe|<object|<embed|blob:/i);
});

test('confirming BBVA usa la referencia de liquidación y sólo un número explícito, sin tarjeta de factura de proveedor', () => {
  const movement = row({ id: 'confirming-bbva', color: 'VERDE', importeCentimos: 9300, grupo: 'CONFIRMING' });
  const detail: ConciliarDocumentDetail = {
    ...remesaDetail,
    rowId: movement.id,
    kind: 'CONFIRMING',
    titulo: 'Liquidación confirming BBVA',
    bancoEmisor: 'BBVA',
    referenciaDocumento: 'Liquidación documental BBVA de octubre',
    numeroLiquidacion: 'LQ-42',
    proveedor: 'Draxton',
    nominalCentimos: 10000,
    interesesCentimos: 300,
    comisionCentimos: 300,
    ivaComisionCentimos: 100,
    netoDocumentoCentimos: 9300,
    importeBancoCentimos: 9300,
    cuadreExacto: true,
  };
  const ready = renderDetail(detail, movement);
  assert.match(ready, /Liquidación bancaria/);
  assert.match(ready, /Documento de liquidación/);
  assert.match(ready, /Liquidación documental BBVA de octubre/);
  assert.match(ready, /Nº de liquidación/);
  assert.match(ready, /LQ-42/);
  assert.match(ready, /Neto del documento = ingreso del banco/);
  assert.match(ready, /Estado: exacto\./);
  assert.doesNotMatch(ready, /Factura de proveedor|Importe de factura/);

  const filenameAsNumber = renderDetail({ ...detail, numeroLiquidacion: 'liquidacion-bbva-octubre.pdf' }, movement);
  assert.match(filenameAsNumber, /Documento de liquidación/);
  assert.doesNotMatch(filenameAsNumber, /Nº de liquidación/);
});

test('factura de proveedor muestra sólo sus importes aplicables y no campos de confirming o valores no constatados', () => {
  const movement = row({ id: 'factura-proveedor', color: 'VERDE', importeCentimos: -5500, grupo: 'FACTURA' });
  const detail: ConciliarDocumentDetail = {
    ...remesaDetail,
    rowId: movement.id,
    kind: 'FACTURA',
    titulo: 'Factura de proveedor',
    bancoEmisor: 'Banco sintético',
    fechaLiquidacion: '2026-10-28',
    cuentaAbono: 'ES00',
    proveedor: 'Proveedor sintético',
    numeroFactura: 'F-5500',
    fechaFactura: '2026-10-18',
    importeFacturaCentimos: 5500,
    lineas: [],
    nominalCentimos: 5500,
    interesesCentimos: null,
    comisionCentimos: null,
    ivaComisionCentimos: null,
    netoDocumentoCentimos: -5500,
    importeBancoCentimos: -5500,
    cuadreExacto: true,
    pdfHref: null,
  };
  const ready = renderDetail(detail, movement);
  assert.match(ready, /Factura de proveedor/);
  assert.match(ready, /Número de factura/);
  assert.match(ready, /Proveedor sintético/);
  assert.match(ready, /Importe de factura/);
  assert.match(ready, /Salida del banco/);
  assert.doesNotMatch(ready, /Intereses|IVA de comisión|Neto del documento|No consta/);
});

test('el efecto usa globalThis.document aunque la prop se llame document y restaura foco y scroll en un DOM simulado', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  const previousSetTimeout = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
  const previousClearTimeout = Object.getOwnPropertyDescriptor(globalThis, 'clearTimeout');
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previousDispatcher = internals.H;
  const effects: Array<() => void | (() => void)> = [];
  let scheduled: (() => void) | null = null;

  class FakeHTMLElement {
    focused = 0;
    focus(): void {
      this.focused += 1;
      fakeDocument.activeElement = this;
    }
  }
  const opener = new FakeHTMLElement();
  const fakeDocument: { activeElement: FakeHTMLElement; body: { style: { overflow: string } } } = {
    activeElement: opener,
    body: { style: { overflow: 'auto' } },
  };

  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
    Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: FakeHTMLElement });
    Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: (callback: () => void) => { scheduled = callback; return 1; } });
    Object.defineProperty(globalThis, 'clearTimeout', { configurable: true, value: () => undefined });
    internals.H = {
      useRef: (initialValue: unknown) => ({ current: initialValue }),
      useEffect: (effect: () => void | (() => void)) => { effects.push(effect); },
    };

    assert.doesNotThrow(() => ConciliarDocumentPreview({
      document: { row: row({ id: 'effect', color: 'VERDE', importeCentimos: 100, grupo: 'OTRO' }), status: 'loading', detail: null, error: null },
      onClose: () => undefined,
      onRetry: () => undefined,
    }));
    assert.equal(effects.length, 1, 'el componente registra su efecto de foco');
    const cleanup = effects[0]!();
    assert.equal(fakeDocument.body.style.overflow, 'hidden', 'el efecto bloquea scroll con globalThis.document.body');
    scheduled?.();
    assert.doesNotThrow(() => { if (typeof cleanup === 'function') cleanup(); });
    assert.equal(fakeDocument.body.style.overflow, 'auto', 'el cleanup restaura el scroll previo');
    assert.equal(opener.focused, 1, 'el cleanup devuelve el foco al elemento que abrió el drawer');
  } finally {
    internals.H = previousDispatcher;
    restoreGlobal('document', previousDocument);
    restoreGlobal('HTMLElement', previousHTMLElement);
    restoreGlobal('setTimeout', previousSetTimeout);
    restoreGlobal('clearTimeout', previousClearTimeout);
  }
});

test('la implementación mantiene carga bajo demanda, offset de actuación, foco, Escape y PDF seguro', () => {
  const workspace = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarWorkspace.tsx'), 'utf8');
  const drawer = readFileSync(resolve(root, 'components/finanzas/conciliar/ConciliarDocumentPreview.tsx'), 'utf8');
  assert.match(workspace, /parseConciliarDocumentDetail/);
  assert.match(workspace, /\$\{DOCUMENT_DETAIL_API\}\/\$\{encodeURIComponent\(currentRow\.id\)\}/);
  assert.match(workspace, /detailCache\.current\.cancel\(detailRequestKey\.current\)/);
  assert.match(workspace, /sequence !== detailSequence\.current/);
  assert.match(workspace, /groupConciliarRows\(rows\)/);
  assert.doesNotMatch(workspace, /parseConciliarDetailResponse/);
  assert.match(drawer, /document: drawer/);
  assert.match(drawer, /globalThis\.document\.body/);
  assert.match(drawer, /return undefined/);
  assert.match(drawer, /z-\[90\]/);
  assert.match(drawer, /--actuation-banner-height/);
  assert.match(drawer, /h-full max-h-full/);
  assert.match(drawer, /data-testid="conciliar-document-detail-loading"/);
  assert.match(drawer, /data-testid="conciliar-document-detail-loaded"/);
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /target="_blank" rel="noopener noreferrer"/);
  assert.match(drawer, /w-max min-w-\[760px\]/);
  assert.doesNotMatch(drawer, /<iframe|<object|<embed|blob:/i);
});
