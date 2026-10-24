import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBulkAcceptPayload,
  buildBulkUndoPayload,
  buildManualUndoPayload,
  manualUndoFromConfirmation,
  pageRange,
  parseThirdPartyBulkRead,
  replaceBulkSelection,
  retryExactAction,
  sortThirdPartyBulkItems,
  type BulkItem,
} from '../components/finanzas/easy/newThirdPartyWorkspace';

const key = '123e4567-e89b-42d3-a456-426614174000';
const lotId = '123e4567-e89b-42d3-a456-426614174001';
const decisionId = '123e4567-e89b-42d3-a456-426614174002';
const token = 'signed-preview-token';
const proposalId = `p1_${'a'.repeat(64)}`;
const fingerprint = 'b'.repeat(64);

function item(overrides: Partial<BulkItem> = {}): BulkItem {
  return {
    movimientoId: 'movimiento-1',
    version: 7,
    sugerenciaId: proposalId,
    fingerprint,
    fecha: '2026-10-23',
    importeCentimos: -12_345,
    tipoTercero: 'PROVEEDOR',
    etiqueta: 'Proveedor acreditado',
    concepto: 'Compra de red',
    banco: 'Banco de pruebas',
    alias: 'Operativa',
    ...overrides,
  };
}

function preview(overrides: Record<string, unknown> = {}) {
  return {
    stagingOnly: true,
    automaticas: false,
    total: 26,
    totalPropuestosTexto: 31,
    totalElegibles: 26,
    totalAmbiguos: 2,
    totalSinCoincidencia: 3,
    limit: 25,
    offset: 0,
    maxBloque: 25,
    previewToken: token,
    items: [item()],
    ...overrides,
  };
}

test('la lista rápida exige el contexto visible de revisión y conserva sólo datos comprobables', () => {
  const parsed = parseThirdPartyBulkRead(preview());
  assert.equal(parsed.items[0].concepto, 'Compra de red');
  assert.equal(parsed.items[0].banco, 'Banco de pruebas');
  assert.equal(parsed.items[0].alias, 'Operativa');
  assert.equal(parsed.items[0].etiqueta, 'Proveedor acreditado');
  assert.equal(parsed.previewToken, token);
  assert.throws(() => {
    const invalid = preview({ items: [{ ...item(), concepto: undefined }] });
    parseThirdPartyBulkRead(invalid);
  });
  assert.throws(() => parseThirdPartyBulkRead(preview({ items: [{ ...item(), fingerprint: 'not-a-fingerprint' }] })));
  assert.throws(() => parseThirdPartyBulkRead(preview({ items: [item(), { ...item(), etiqueta: 'Duplicado' }] })));
});

test('la paginación muestra los límites reales: no simula que la segunda página cabe en la primera', () => {
  assert.deepEqual(pageRange(51, 0, 25), { from: 1, to: 25, previousOffset: 0, nextOffset: 25 });
  assert.deepEqual(pageRange(51, 25, 25), { from: 26, to: 50, previousOffset: 0, nextOffset: 50 });
  assert.deepEqual(pageRange(51, 50, 25), { from: 51, to: 51, previousOffset: 25, nextOffset: null });
  assert.deepEqual(pageRange(0, 0, 25), { from: 0, to: 0, previousOffset: 0, nextOffset: null });
  assert.equal(sortThirdPartyBulkItems([item({ movimientoId: 'late', importeCentimos: 200, fecha: '2026-10-20' }), item({ movimientoId: 'large', importeCentimos: -900, fecha: '2026-10-19' })])[0].movimientoId, 'large');
});

test('una actualización sustituye la selección con las filas recién firmadas y elimina las que ya no están', () => {
  const old = item({ fingerprint: 'c'.repeat(64), version: 7 });
  const current = { [old.movimientoId]: old, gone: item({ movimientoId: 'gone', fingerprint: 'd'.repeat(64) }) };
  const fresh = item({ fingerprint: 'e'.repeat(64), version: 8 });
  const next = replaceBulkSelection(current, [fresh]);
  assert.deepEqual(Object.keys(next), ['movimiento-1']);
  assert.equal(next['movimiento-1'], fresh, 'la selección debe usar el objeto recién leído, no la versión anterior');
  assert.notEqual(next['movimiento-1'].fingerprint, old.fingerprint);
});

test('aceptar y reintentar conservan exactamente el mismo envío cerrado', () => {
  const payload = buildBulkAcceptPayload(key, token, [item()]);
  assert.ok(payload);
  assert.deepEqual(payload, {
    action: 'aceptar_seleccionados',
    confirmacion: true,
    idempotencyKey: key,
    previewToken: token,
    items: [{ movimientoId: 'movimiento-1', version: 7, sugerenciaId: proposalId, fingerprint }],
  });
  assert.ok(Object.isFrozen(payload));
  assert.ok(Object.isFrozen(payload?.items));
  assert.equal(retryExactAction(payload), payload, 'un fallo incierto debe reenviar exactamente el mismo cuerpo');
  assert.equal(buildBulkAcceptPayload('no-es-uuid-v4', token, [item()]), null);
  assert.equal(buildBulkAcceptPayload(key, token, []), null);
  assert.equal(buildBulkAcceptPayload(key, token, [item(), item()]), null);
});

test('los payloads de deshacer son cerrados y la reversión manual usa la versión tras confirmar', () => {
  const bulkUndo = buildBulkUndoPayload(key, lotId);
  assert.deepEqual(bulkUndo, { action: 'deshacer_lote', confirmacion: true, idempotencyKey: key, loteId: lotId });
  assert.ok(Object.isFrozen(bulkUndo));
  assert.equal(buildBulkUndoPayload(key, 'lote visible pero no válido'), null);

  const manualUndo = buildManualUndoPayload(key, decisionId, 8);
  assert.deepEqual(manualUndo, { action: 'revertir', confirmacion: true, idempotencyKey: key, decisionId, version: 8 });
  assert.ok(Object.isFrozen(manualUndo));
  assert.equal(buildManualUndoPayload(key, decisionId, 0), null);

  const fromReceipt = manualUndoFromConfirmation({ ok: true, accion: 'CONFIRMADA', movimientoId: 'movimiento-1', decisionId, reversible: true }, { movimientoId: 'movimiento-1', version: 7 }, key);
  assert.deepEqual(fromReceipt, { action: 'revertir', confirmacion: true, idempotencyKey: key, decisionId, version: 8 });
  assert.equal(manualUndoFromConfirmation({ ok: true, accion: 'CONFIRMADA', movimientoId: 'otro', decisionId, reversible: true }, { movimientoId: 'movimiento-1', version: 7 }, key), null);
});
