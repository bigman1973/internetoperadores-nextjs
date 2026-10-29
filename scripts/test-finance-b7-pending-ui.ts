import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCents, leerItemsB5 } from '../components/finanzas/pendientes/types';

function baseB7Emitted() {
  return {
    vista: 'FACTURAS_EMITIDAS_SIN_COBRO',
    cobertura: 'TODAS',
    total: 1,
    limit: 50,
    offset: 0,
    coberturaCuentas: { cuentas: [], sinCoberturaVerificableCount: 0 },
    coberturaBanco: { status: 'UNKNOWN', asOf: null, activeAccountCount: 1, accountsWithKnownCutoff: 0 },
    calculoBanco: 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA',
    ambitoCuentaFacturas: 'POBLACION_GLOBAL_FACTURAS_EMITIDAS_SIN_CUENTA_INFERIDA',
    criterioBanco: 'Cobro documental B7: B4 vigente y B6 explícita.',
    items: [{
      tipo: 'FACTURA_EMITIDA',
      id: 'fi-sin-total',
      documentoConciliableId: null,
      documentoConciliableNoInferido: true,
      referencia: 'FE-NULL-1',
      tercero: 'SIN_CLIENTE_FUENTE',
      cliente: null,
      cif: null,
      concepto: null,
      fecha: null,
      fechaVencimiento: null,
      importeObjetivoCentimos: null,
      importeAsignadoActivoCentimos: null,
      importePendienteCentimos: null,
      importeNoVerificable: true,
      estadoCobroBanco: 'PENDIENTE_COBRO_REVISION',
      estadoCobroBancoEtiqueta: 'Pendiente de cobro: requiere revisión bancaria',
      fuentesCobroBanco: [],
      motivosRevisionBanco: ['IMPORTE_FUENTE_INEXACTO_O_AUSENTE'],
    }],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('FE B7 conserva envoltorio null, todos los importes null y el indicador explícito de no verificable', () => {
  const parsed = leerItemsB5(baseB7Emitted());
  const row = parsed.items[0];
  if (row.tipo !== 'FACTURA_EMITIDA') throw new Error('Se esperaba factura emitida B7.');
  assert.equal(row.documentoConciliableId, null);
  assert.equal(row.importeObjetivoCentimos, null);
  assert.equal(row.importeAsignadoActivoCentimos, null);
  assert.equal(row.importePendienteCentimos, null);
  assert.equal(row.importeNoVerificable, true);
  assert.equal(row.estadoCobroBanco, 'PENDIENTE_COBRO_REVISION');
  assert.equal(row.estadoCobroBancoEtiqueta, 'Pendiente de cobro: requiere revisión bancaria');
  assert.deepEqual(row.fuentesCobroBanco, []);
  assert.deepEqual(row.motivosRevisionBanco, ['IMPORTE_FUENTE_INEXACTO_O_AUSENTE']);
  assert.equal(parsed.coberturaBanco?.asOf, null);
});

test('cero conocido se conserva como importe y no toma la etiqueta de no verificable', () => {
  const dto = baseB7Emitted();
  dto.items[0] = {
    ...dto.items[0],
    importeObjetivoCentimos: 0,
    importeAsignadoActivoCentimos: 0,
    importePendienteCentimos: 0,
    importeNoVerificable: false,
    estadoCobroBanco: 'PENDIENTE_COBRO_REVISION',
    estadoCobroBancoEtiqueta: 'Pendiente de cobro: requiere revisión bancaria',
    motivosRevisionBanco: ['TOTAL_CERO_NOCobro'],
  };
  const parsed = leerItemsB5(dto);
  const row = parsed.items[0];
  if (row.tipo !== 'FACTURA_EMITIDA') throw new Error('Se esperaba factura emitida B7.');
  assert.equal(row.importePendienteCentimos, 0);
  assert.equal(row.importeNoVerificable, false);
  assert.equal(formatCents(0), '+0,00 €');
  assert.notEqual(formatCents(0), 'Importe no verificable');
  assert.equal(formatCents(null), 'Importe no verificable');
});

test('FR B5 sigue exigiendo documento conciliable e importes enteros presentes', () => {
  const dto = baseB7Emitted();
  dto.vista = 'FACTURAS_RECIBIDAS_SIN_PAGO';
  dto.items[0] = {
    tipo: 'FACTURA_RECIBIDA',
    id: 'fr-1',
    documentoConciliableId: null,
    referencia: 'FR-1',
    tercero: 'Proveedor',
    cif: null,
    concepto: null,
    fecha: '2026-10-01',
    fechaVencimiento: null,
    importeObjetivoCentimos: 100,
    importeAsignadoActivoCentimos: 0,
    importePendienteCentimos: 100,
  } as never;
  assert.throws(() => leerItemsB5(dto), /documentoConciliableId/);
});

test('FE B5 heredada sin estado B7 conserva su envoltorio e importes estrictos', () => {
  const dto = baseB7Emitted();
  dto.items[0] = {
    tipo: 'FACTURA_EMITIDA',
    id: 'fe-b5-legacy',
    documentoConciliableId: 'dc-fi-1',
    referencia: 'FE-B5-1',
    tercero: 'Cliente legado',
    cliente: 'Cliente legado',
    cif: null,
    concepto: null,
    fecha: '2026-10-01',
    fechaVencimiento: null,
    importeObjetivoCentimos: 500,
    importeAsignadoActivoCentimos: 0,
    importePendienteCentimos: 500,
  } as never;
  const parsed = leerItemsB5(dto);
  const row = parsed.items[0];
  if (row.tipo !== 'FACTURA_EMITIDA') throw new Error('Se esperaba factura emitida B5.');
  assert.equal(row.documentoConciliableId, 'dc-fi-1');
  assert.equal(row.estadoCobroBanco, undefined);
  assert.equal(row.importePendienteCentimos, 500);
});

test('FE B7 rechaza un céntimo indefinido y no lo sustituye por cero', () => {
  const dto = clone(baseB7Emitted()) as { items: Array<Record<string, unknown>> };
  delete dto.items[0].importePendienteCentimos;
  assert.throws(() => leerItemsB5(dto), /importePendienteCentimos/);
});


test('FR expone bruto B4 y neto tras rectificativa como campos separados', () => {
  const dto = baseB7Emitted(); dto.vista = 'FACTURAS_RECIBIDAS_SIN_PAGO';
  dto.items[0] = { tipo:'FACTURA_RECIBIDA', id:'fr-rect', documentoConciliableId:'dc-fr', referencia:'FR-RECT', tercero:'Proveedor', cif:null, concepto:null, fecha:'2026-10-01', fechaVencimiento:null, importeObjetivoCentimos:-10000, importeAsignadoActivoCentimos:-3000, importePendienteCentimos:-7000, creditNoteState:'PARCIAL', rectificationCents:-2000, importePendienteTrasRectificativasCentimos:-5000, creditNoteReviewReasons:[] } as never;
  const row = leerItemsB5(dto).items[0]; if (row.tipo !== 'FACTURA_RECIBIDA') throw new Error('Se esperaba FR.');
  assert.deepEqual([row.importePendienteCentimos,row.rectificationCents,row.importePendienteTrasRectificativasCentimos],[-7000,-2000,-5000]);
});
test('extensión rectificativa incompleta se rechaza y nunca inventa neto', () => {
  const dto = baseB7Emitted() as { items: Array<Record<string, unknown>> }; dto.items[0].creditNoteState='PARCIAL';
  assert.throws(() => leerItemsB5(dto), /rectificativa incompleta/);
});
