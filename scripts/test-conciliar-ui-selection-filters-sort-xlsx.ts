/*
 * Pruebas puras con fixtures sintéticas: no rutas, navegador, BD, red ni datos financieros reales.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { parseConciliarGetInput } from '../lib/finanzas/conciliar-contract';
import type { ConciliarRow } from '../components/finanzas/conciliar/conciliar-contract';
import {
  areAllVisibleGreensSelected,
  groupConciliarRows,
  humanGroup,
  reviewSelectionForCurrentRows,
  setRowSelected,
  setVisibleGreenSelected,
  shouldRenderConciliarGroups,
  sortConciliarRowsForFixture,
} from '../components/finanzas/conciliar/conciliar-ui-helpers';
import { CONCILIAR_XLSX_HEADERS, createConciliarXlsx } from '../components/finanzas/conciliar/conciliar-xlsx';

const hash = (letter: string) => letter.repeat(64);
function row(input: Readonly<Partial<ConciliarRow> & Pick<ConciliarRow, 'id'>>): ConciliarRow {
  return {
    id: input.id,
    movimientoId: input.id,
    fecha: '2026-10-28',
    concepto: `Concepto sintético ${input.id}`,
    banco: 'Banco sintético',
    cuenta: 'Cuenta sintética',
    importeCentimos: 100,
    pendienteCentimos: 100,
    color: 'VERDE',
    grupo: 'PROVEEDOR',
    motivo: 'Nota sintética para comprobar la exportación.',
    documento: { referencia: `DOC-${input.id}`, tercero: 'Tercero sintético', importeCentimos: 100, fecha: '2026-10-28', href: null },
    propuesta: 'Propuesta sintética',
    seleccionable: true,
    diferenciaCentimos: 0,
    linksMovimiento: [],
    detail: null,
    decisionHash: hash('a'),
    ...input,
  };
}

test('selección: refresco conserva el hash original; misma identidad con candidato cambiado exige reselección', () => {
  const before = row({ id: 'misma-fila', decisionHash: hash('a') });
  const refreshed = row({ id: 'misma-fila', decisionHash: hash('b'), propuesta: 'Candidato sintético actualizado' });
  const selection = setRowSelected(new Map(), before, true);

  assert.equal(selection.get(before.id), hash('a'), 'no se sustituye silenciosamente el hash seleccionado');
  const review = reviewSelectionForCurrentRows(selection, [refreshed]);
  assert.equal(review.changedCount, 1);
  assert.equal(review.confirmableRows.length, 0, 'el mismo id con decisión distinta no se puede confirmar');
  const bulkSelected = setVisibleGreenSelected(selection, [refreshed], true);
  assert.equal(bulkSelected.get(refreshed.id), hash('a'), 'el gesto Todos visibles tampoco reautoriza un hash cambiado');

  const reselected = setRowSelected(selection, refreshed, true);
  const afterReview = reviewSelectionForCurrentRows(reselected, [refreshed]);
  assert.equal(afterReview.changedCount, 0);
  assert.equal(afterReview.confirmableRows[0]?.decisionHash, hash('b'), 'sólo una reselección humana actualiza el hash');
});

test('selección: refresco y filtros conservan ids ocultos, pero nunca los devuelven para confirmar', () => {
  const visible = row({ id: 'visible', decisionHash: hash('c') });
  const hidden = row({ id: 'oculta', decisionHash: hash('d') });
  const selection = setVisibleGreenSelected(new Map(), [visible, hidden], true);
  const review = reviewSelectionForCurrentRows(selection, [visible]);

  assert.equal(selection.size, 2, 'la selección conserva una fila que salió del filtro');
  assert.equal(review.hiddenCount, 1);
  assert.deepEqual(review.confirmableRows.map((item) => item.id), ['visible']);
  assert.equal(areAllVisibleGreensSelected(selection, [visible]), true);
  const withoutVisible = setVisibleGreenSelected(selection, [visible], false);
  assert.equal(withoutVisible.has('oculta'), true, 'desmarcar visibles no borra la selección explícita oculta');
});

test('orden global: fecha, tercero/proveedor y importe tienen dirección estable y desempate por id', () => {
  const fixture = [
    row({ id: 'c', fecha: '2026-10-02', concepto: 'Zulu', importeCentimos: -200, documento: { referencia: 'DOC-C', tercero: 'Zeta sintético', importeCentimos: -200, fecha: '2026-10-02', href: null } }),
    row({ id: 'a', fecha: '2026-10-01', concepto: 'Bravo', importeCentimos: 300, documento: { referencia: 'DOC-A', tercero: 'Álvaro sintético', importeCentimos: 300, fecha: '2026-10-01', href: null } }),
    row({ id: 'b', fecha: '2026-10-01', concepto: 'Alfa', importeCentimos: 300, documento: { referencia: 'DOC-B', tercero: 'Álvaro sintético', importeCentimos: 300, fecha: '2026-10-01', href: null } }),
  ];
  assert.deepEqual(sortConciliarRowsForFixture(fixture, 'FECHA', 'ASC').map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(sortConciliarRowsForFixture(fixture, 'CONCEPTO', 'ASC').map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(sortConciliarRowsForFixture(fixture, 'IMPORTE', 'DESC').map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(sortConciliarRowsForFixture(fixture, 'IMPORTE', 'ASC').map((item) => item.id), ['c', 'a', 'b']);
});

test('presentación: etiquetas de Cobros claras, remesas mixtas canónicas y orden explícito sin cabeceras de grupo', () => {
  const grouped = groupConciliarRows([
    row({ id: 'remesa-roja', grupo: 'REMESA_PENDIENTE', color: 'ROJO', importeCentimos: 2_000 }),
    row({ id: 'remesa-verde', grupo: 'remesas cobradas', color: 'VERDE', importeCentimos: 9_000 }),
    row({ id: 'remesa-ambar', grupo: 'Remesa parcial', color: 'AMBAR', importeCentimos: -5_000 }),
    row({ id: 'cliente-importante', grupo: 'CLIENTE_IMPORTE', importeCentimos: 7_000 }),
    row({ id: 'cliente-repetido', grupo: 'cliente importe', importeCentimos: 3_000 }),
    row({ id: 'referencia', grupo: 'REF_FACTURA', importeCentimos: 1_000 }),
  ]);

  assert.equal(humanGroup('CLIENTE_IMPORTE'), 'Mismo cliente e importe');
  assert.equal(humanGroup('REF_FACTURA'), 'El banco cita el nº de factura');
  const remesas = grouped.filter((group) => group.label === 'Remesas');
  assert.equal(remesas.length, 1, 'las etiquetas repetidas de remesa se reúnen una sola vez');
  assert.deepEqual(remesas[0]?.rows.map((item) => item.id), ['remesa-verde', 'remesa-ambar', 'remesa-roja']);
  assert.deepEqual(remesas[0]?.colorCounts, { VERDE: 1, AMBAR: 1, ROJO: 1 }, 'un grupo puede conservar colores mixtos');
  assert.equal(grouped.filter((group) => group.label === 'Mismo cliente e importe').length, 1, 'las variantes repetidas usan una etiqueta canónica única');
  assert.equal(shouldRenderConciliarGroups(grouped, false), true, 'por defecto se agrupa cuando hay varias filas de una regla');
  assert.equal(shouldRenderConciliarGroups(grouped, true), false, 'cualquier orden explícito muestra una lista plana');
  assert.equal(shouldRenderConciliarGroups(groupConciliarRows([row({ id: 'sola', grupo: 'BANCO' })]), false), false, 'una sola fila no recibe una cabecera de grupo redundante');
});

test('contrato GET: estado, grupo y orden son cerrados y quedan en la vista paginada', () => {
  const input = parseConciliarGetInput({
    tab: 'PAGOS', estado: 'VERDE', grupo: 'TARJETA', orden: 'IMPORTE', direccion: 'ASC', limit: '20', offset: '40',
  });
  assert.deepEqual(input, { tab: 'PAGOS', estado: 'VERDE', grupo: 'TARJETA', orden: 'IMPORTE', direccion: 'ASC', cutoffDate: '2026-01-01', historic: false, limit: 20, offset: 40 });
  assert.throws(() => parseConciliarGetInput({ grupo: 'cualquier-grupo' }));
  assert.throws(() => parseConciliarGetInput({ estado: 'AZUL' }));
  assert.throws(() => parseConciliarGetInput({ orden: 'NOMBRE_COLUMNA' }));
  assert.throws(() => parseConciliarGetInput({ direccion: 'LATERAL' }));
});

test('XLSX: columnas reales, texto protegido, importe numérico, autofiltro y fila congelada se verifican en OOXML', async () => {
  const bytes = await createConciliarXlsx(XLSX, 'Sintético', [row({ id: 'formula', concepto: '=1+1', importeCentimos: 12345 })]);
  const files = unzipSync(bytes);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);

  assert.match(sheet, /<autoFilter ref="A1:I2"\/>/, 'el autofiltro cubre exactamente las columnas exportadas');
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/, 'la fila de cabecera se congela en el XML final');
  assert.match(sheet, /<c r="H2"[^>]*><v>123\.45<\/v><\/c>/, 'importe se escribe como número, no texto');
  assert.match(sheet, /Fecha/);
  assert.match(sheet, /Estado/);
  assert.match(sheet, /Grupo \/ tipo/);
  assert.match(sheet, /Tercero \/ proveedor/);
  assert.match(sheet, /Concepto/);
  assert.match(sheet, /Cuenta/);
  assert.match(sheet, /Documento/);
  assert.match(sheet, /Importe/);
  assert.match(sheet, /Nota/);
  assert.match(sheet, /&apos;=1\+1/, 'los textos que parecen fórmula quedan prefijados');
  assert.deepEqual(CONCILIAR_XLSX_HEADERS, ['Fecha', 'Estado', 'Grupo / tipo', 'Tercero / proveedor', 'Concepto', 'Cuenta', 'Documento', 'Importe', 'Nota']);
});

console.log('OK: selección, filtros, orden y XLSX de Conciliar validados con fixtures sintéticas; sin red, BD ni navegador.');
