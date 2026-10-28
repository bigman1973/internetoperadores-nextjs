/* Pruebas puras: fixtures sintéticas; no red, navegador, BD ni datos financieros reales. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { parseParaPedirInput, parseParaPedirRead, type ParaPedirMovimiento } from '../lib/finanzas/para-pedir-contract';
import { PARA_PEDIR_XLSX_HEADERS, createParaPedirXlsx, paraPedirExportValues } from '../components/finanzas/easy/para-pedir-xlsx';

const movement = (overrides: Partial<ParaPedirMovimiento> = {}): ParaPedirMovimiento => ({
  movimientoId: 'movimiento-sintetico', tab: 'PAGOS', fecha: '2026-10-28', concepto: 'Compra sintética',
  banco: 'Banco sintético', cuenta: 'Cuenta sintética', tercero: 'Proveedor sintético', grupoTercero: 'Proveedor sintético',
  referenciaDocumento: 'DOC-SINTETICO', importeCentimos: -12345, pendienteCentimos: -12345,
  motivo: 'Falta revisión documental sintética.', estadoPedido: 'PEDIDO',
  pedido: { dia: '2026-10-01', actorNombre: 'Actor sintético', diasTranscurridos: 27 },
  conciliarPedir: null,
  ...overrides,
});

test('entrada: sólo admite filtros cerrados y no acepta actor, fecha inventada ni parámetros adicionales', () => {
  assert.deepEqual(parseParaPedirInput({ estado: 'PEDIDO_MAS_15_DIAS', q: 'Proveedor', tercero: 'Proveedor', limit: '100', offset: '0' }), {
    estado: 'PEDIDO_MAS_15_DIAS', q: 'Proveedor', tercero: 'Proveedor', limit: 100, offset: 0,
  });
  assert.throws(() => parseParaPedirInput({ estado: 'FUTURO' }));
  assert.throws(() => parseParaPedirInput({ actor: '1' }));
  assert.throws(() => parseParaPedirInput({ limit: '101' }));
});

test('respuesta: un pedido exige auditoría B5; el estado sin auditoría no recibe fecha ni actor falsos', () => {
  const source = {
    stagingOnly: true, automaticas: false, accionExterna: 'NINGUNA', criterio: 'Fixture',
    filtro: { estado: 'TODOS', q: null, tercero: null }, total: 2, limit: 50, offset: 0, totalPagina: 2,
    resumen: { movimientos: 2, pendienteCentimos: -1200 },
    proyeccion: { actualizadaEn: '2026-10-28T10:00:00.000Z', version: 7, pendienteActualizacion: false },
    agrupaciones: [{ tercero: 'Proveedor sintético', movimientos: 2, pendienteCentimos: -1200, pedidos: 1, pedidosMas15Dias: 1 }],
    movimientos: [movement(), movement({ movimientoId: 'sin-auditoria', estadoPedido: 'PEDIDO_SIN_AUDITORIA', pedido: null })],
  };
  const parsed = parseParaPedirRead(source);
  assert.equal(parsed.movimientos[0].pedido?.actorNombre, 'Actor sintético');
  assert.equal(parsed.movimientos[1].pedido, null);
  assert.throws(() => parseParaPedirRead({ ...source, movimientos: [movement({ pedido: null })] }));
});

test('respuesta: sólo una fila sin pedir puede transportar el rowId opaco y hash sellado de Conciliar', () => {
  const source = {
    stagingOnly: true, automaticas: false, accionExterna: 'NINGUNA', criterio: 'Fixture',
    filtro: { estado: 'TODOS', q: null, tercero: null }, total: 1, limit: 50, offset: 0, totalPagina: 1,
    resumen: { movimientos: 1, pendienteCentimos: -1200 },
    proyeccion: { actualizadaEn: '2026-10-28T10:00:00.000Z', version: 7, pendienteActualizacion: false },
    agrupaciones: [{ tercero: 'Proveedor sintético', movimientos: 1, pendienteCentimos: -1200, pedidos: 0, pedidosMas15Dias: 0 }],
    movimientos: [movement({ estadoPedido: 'SIN_PEDIR', pedido: null, conciliarPedir: { rowId: 'fila-opaca-sintetica', decisionHash: 'a'.repeat(64) } })],
  };
  const parsed = parseParaPedirRead(source);
  assert.deepEqual(parsed.movimientos[0].conciliarPedir, { rowId: 'fila-opaca-sintetica', decisionHash: 'a'.repeat(64) });
  assert.throws(() => parseParaPedirRead({ ...source, movimientos: [movement({ conciliarPedir: { rowId: 'fila', decisionHash: 'a'.repeat(64) } })] }));
  assert.throws(() => parseParaPedirRead({ ...source, movimientos: [movement({ estadoPedido: 'SIN_PEDIR', pedido: null, conciliarPedir: { rowId: 'fila', decisionHash: 'no-es-hash' } })] }));
});

test('XLSX: exporta una petición de tercero con importes numéricos, texto protegido y cabecera congelada', async () => {
  const values = paraPedirExportValues([movement({ concepto: '=SUMA(A1:A2)' })]);
  assert.equal(values[0][6], "'=SUMA(A1:A2)");
  const bytes = await createParaPedirXlsx(XLSX, 'Solicitud sintética', [movement({ concepto: '=SUMA(A1:A2)' })]);
  const files = unzipSync(bytes);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /<autoFilter ref="A1:J2"\/>/);
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<c r="I2"[^>]*><v>-123\.45<\/v><\/c>/);
  assert.match(sheet, /&apos;=SUMA\(A1:A2\)/);
  assert.deepEqual(PARA_PEDIR_XLSX_HEADERS, ['Fecha', 'Estado de pedido', 'Pedido registrado el', 'Registrado por', 'Proveedor / tercero', 'Referencia documental', 'Concepto bancario', 'Cuenta', 'Importe pendiente', 'Motivo de revisión']);
});

console.log('OK: contrato, auditoría y XLSX de Para pedir verificados con fixtures sintéticas; sin red, BD ni navegador.');
