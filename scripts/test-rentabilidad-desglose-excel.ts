import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { unzipSync, strFromU8 } from 'fflate';
import { exportTable, type ExportOptions } from '../app/admin/rentabilidad/export-table';
import type { Column, Row } from '../app/admin/rentabilidad/view-model';

const columns: Column[] = [{ key: 'factura', label: 'Factura' }, { key: 'importe', label: 'Importe', kind: 'money' }, { key: 'porcentaje', label: 'Porcentaje', kind: 'percent' }, { key: 'alta', label: 'Alta' }];
const options: ExportOptions = { missingText: 'sin dato', source: 'rentabilidad_snapshots; 2026-10; foto ficticia v7', metadata: [{ label: 'Foto', value: 'foto-ficticia' }, { label: 'Versión', value: 7 }, { label: 'Mes', value: '2026-10' }] };
async function capture(rows: Row[], opts: ExportOptions = options, failDownload = false) {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL, fetch = globalThis.fetch;
  let blob: Blob | null = null, filename = '', clicks = 0;
  const link = { href: '', download: '', click() { filename = this.download; clicks++; }, remove() {} };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => link, body: { appendChild() {} } } });
  URL.createObjectURL = value => { if (failDownload) throw new Error('DOWNLOAD_TEST_FAILURE'); blob = value as Blob; return 'blob:fictional-export'; };
  URL.revokeObjectURL = () => {};
  globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
  try {
    await exportTable('Facturado prueba', columns, rows, '2026-10', opts);
    assert.equal(clicks, 1); assert.ok(blob);
    const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
    return { book: XLSX.read(bytes, { type: 'array', cellStyles: true, cellNF: true }), files: unzipSync(bytes), filename };
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete (globalThis as any).document;
    URL.createObjectURL = create; URL.revokeObjectURL = revoke; globalThis.fetch = fetch;
  }
}
const row = () => ({ factura: 'F26/PRUEBA', fecha: '2026-10-01', importe: 123.45, porcentaje: 25, alta: null });
test('Excel del desglose: null se conserva como sin dato, no cero ni celda vacía', async () => {
  const { book } = await capture([{ factura: null, importe: null, porcentaje: null, alta: '' }]);
  const sheet = book.Sheets.Rentabilidad;
  for (const address of ['A2', 'B2', 'C2', 'D2']) assert.equal(sheet[address].v, 'sin dato');
});
test('importes y porcentajes son números Excel, también cero y negativos', async () => {
  const { book } = await capture([row(), { factura: 'R', importe: -12.3, porcentaje: 0, alta: null }]);
  const s = book.Sheets.Rentabilidad;
  assert.equal(s.B2.t, 'n'); assert.equal(s.B2.v, 123.45); assert.equal(s.C2.v, 0.25);
  assert.equal(s.B3.v, -12.3); assert.equal(s.C3.v, 0); assert.match(String(s.B2.z), /0\.00/);
});
test('cada valor de fuente incluye comentario con mes, foto y localizador de fila', async () => {
  const { book } = await capture([row()]); const s = book.Sheets.Rentabilidad;
  for (const a of ['A2', 'B2', 'C2', 'D2']) {
    assert.match(s[a].c?.[0].t ?? '', /rentabilidad_snapshots.*2026-10.*v7/);
    assert.match(s[a].c?.[0].t ?? '', /F26\/PRUEBA/);
  }
});
test('valores de entrada azules sin perder los formatos de número', async () => {
  const { files, book } = await capture([row()]);
  assert.match(strFromU8(files['xl/styles.xml']), /color rgb="FF0000FF"/);
  assert.equal(book.Sheets.Rentabilidad.B2.s?.fgColor, undefined);
  const styles = strFromU8(files['xl/styles.xml']); assert.match(styles, /applyFont="1"/);
  assert.match(strFromU8(files['xl/worksheets/sheet1.xml']), /<c[^>]*r="B2"[^>]*s="\d+"/);
  assert.equal(book.Sheets.Rentabilidad.B2.t, 'n');
});
test('Foto y notas identifica exactamente la exportación y preserva versión numérica', async () => {
  const { book } = await capture([row()]); assert.deepEqual(book.SheetNames, ['Rentabilidad', 'Foto y notas']);
  const s = book.Sheets['Foto y notas']; assert.equal(s.B2.v, 'foto-ficticia'); assert.equal(s.B3.v, 7);
  assert.match(s.B3.c?.[0].t ?? '', /2026-10/);
});
test('la descarga neutraliza las fórmulas inyectadas en texto, no convierte negativos numéricos en texto', async () => {
  const { book, files } = await capture([{ ...row(), factura: '=HYPERLINK("https://example.invalid")', alta: ' @SUM(A1)' }, { ...row(), factura: '+cmd', alta: '-texto', importe: -1 }]);
  const s = book.Sheets.Rentabilidad; assert.equal(s.A2.t, 's'); assert.match(s.A2.v, /^'/);
  assert.match(s.D2.v, /^'/); assert.match(s.A3.v, /^'/); assert.match(s.D3.v, /^'/); assert.equal(s.B3.t, 'n');
  assert.ok(!strFromU8(files['xl/worksheets/sheet1.xml']).includes('<f>'));
});
test('cero contratos se exporta como listado vacío con cabeceras y contexto, sin fila falsa', async () => {
  const { book } = await capture([]); const s = book.Sheets.Rentabilidad;
  assert.equal(s['!ref'], 'A1:D1'); assert.equal(s.A2, undefined); assert.equal(book.SheetNames.length, 2);
});
test('exportación antigua sin opciones conserva guion y una sola hoja', async () => {
  const { book, files } = await capture([{ factura: null, importe: 0, porcentaje: 0, alta: null }], {});
  assert.equal(book.Sheets.Rentabilidad.A2.v, '—'); assert.deepEqual(book.SheetNames, ['Rentabilidad']);
  assert.ok(!strFromU8(files['xl/styles.xml']).includes('FF0000FF'));
});
test('el nombre de archivo se normaliza y no contiene caracteres de ruta', async () => {
  const { filename } = await capture([row()]); assert.match(filename, /^rentabilidad-2026-10-[a-z0-9-]+\.xlsx$/);
});
test('un fallo de descarga se propaga para que el panel lo muestre, sin segunda descarga', async () => {
  await assert.rejects(capture([row()], options, true), /DOWNLOAD_TEST_FAILURE/);
});
