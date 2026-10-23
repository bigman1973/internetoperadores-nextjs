import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HISTORICAL_BULK_LIMIT,
  buildConfirmarExactasPayload,
  buildDeshacerBloquePayload,
  parseHistoricalBulkConfirmation,
  parseHistoricalBulkPreview,
  parseHistoricalBulkUndo,
  puedeEnviarConfirmacion,
  puedeEnviarDeshacer,
} from '../components/finanzas/reconciliation-v2/historical-bulk-contract';

const key = '123e4567-e89b-42d3-a456-426614174000';
const blockId = '123e4567-e89b-42d3-a456-426614174001';
const previewToken = 'preview-token-test';

function preview(overrides: Record<string, unknown> = {}) {
  return {
    previewToken,
    items: [{
      historicoId: 'historico-1',
      movimientoId: 'movimiento-1',
      fingerprint: 'exacta:movimiento-1:documento-1',
      fechaOperacion: '2026-10-23',
      concepto: 'Cargo de factura heredada',
      banco: 'Banco de prueba',
      cuentaAlias: 'Principal',
      importeMovimientoCentimos: -12_345,
      version: 7,
      documentos: [{
        tipo: 'FACTURA_RECIBIDA',
        sourceId: 'factura-1',
        referencia: 'F-2026-001',
        tercero: 'Proveedor, S.L.',
        fecha: '2026-10-01',
        fechaVencimiento: '2026-10-20',
        importeObjetivoCentimos: -12_345,
        documentoConciliableId: 'documento-b4-1',
      }],
    }],
    totalExactas: 1,
    totalPropuestas: 3,
    totalCargosCentimos: '-12345',
    totalCobrosCentimos: '0',
    excluidasPorMotivo: { SIN_ARCHIVO_HISTORICO: 2 },
    limit: HISTORICAL_BULK_LIMIT,
    offset: 0,
    maxBloque: HISTORICAL_BULK_LIMIT,
    criterio: 'Un documento vigente, capacidad íntegra e importe firmado exactamente igual.',
    ...overrides,
  };
}

test('parseHistoricalBulkPreview accepts bounded exact signed cents and document dates', () => {
  const parsed = parseHistoricalBulkPreview(preview());
  assert.equal(parsed.ok, true);
  if ('error' in parsed) throw new Error(typeof parsed.error === 'string' ? parsed.error : 'Parser de prueba inválido');
  assert.equal(parsed.value.limit, 25);
  assert.equal(parsed.value.items[0].importeMovimientoCentimos, -12_345);
  assert.equal(parsed.value.totalCargosCentimos, '-12345');
  assert.equal(parsed.value.totalCobrosCentimos, '0');
  assert.equal(parsed.value.previewToken, previewToken);
  assert.equal(parsed.value.items[0].documentos[0].fechaVencimiento, '2026-10-20');
});

test('parseHistoricalBulkPreview fails closed for unsafe cents, malformed totals, sign changes and incoherent pages', () => {
  assert.equal(parseHistoricalBulkPreview(preview({ totalCargosCentimos: '-123.45' })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ totalCargosCentimos: '12345' })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ totalCobrosCentimos: '-1' })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ items: [{ ...preview().items[0], importeMovimientoCentimos: 12.5 }] })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ items: [{ ...preview().items[0], documentos: [{ ...preview().items[0].documentos[0], fecha: '23/10/2026' }] }] })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ limit: 26 })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ offset: 1, totalExactas: 1 })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ items: Array.from({ length: 26 }, (_, index) => ({ ...preview().items[0], historicoId: `h-${index}`, movimientoId: `m-${index}` })), totalExactas: 26 })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ previewToken: undefined })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ previewToken: ' token-con-espacio' })).ok, false);
  assert.equal(parseHistoricalBulkPreview(preview({ previewToken: 'a'.repeat(24_001) })).ok, false);
});

test('payload de confirmación is exact, bounded and rejects malformed or repeated identities', () => {
  const source = [{ historicoId: 'historico-1', movimientoId: 'movimiento-1', fingerprint: 'fp-1' }];
  const payload = buildConfirmarExactasPayload(key, source, previewToken);
  assert.deepEqual(payload, {
    action: 'confirmar_exactas',
    confirmacion: true,
    idempotencyKey: key,
    previewToken,
    items: source,
  });
  assert.ok(Object.isFrozen(payload));
  assert.equal(buildConfirmarExactasPayload('not-a-uuid', source, previewToken), null);
  assert.equal(buildConfirmarExactasPayload(key, [], previewToken), null);
  assert.equal(buildConfirmarExactasPayload(key, Array.from({ length: 26 }, () => source[0]), previewToken), null);
  assert.equal(buildConfirmarExactasPayload(key, [source[0], source[0]], previewToken), null);
  assert.equal(buildConfirmarExactasPayload(key, [{ ...source[0], fingerprint: '' }], previewToken), null);
  assert.equal(buildConfirmarExactasPayload(key, source, undefined), null);
  assert.equal(buildConfirmarExactasPayload(key, source, '   '), null);
  assert.equal(buildConfirmarExactasPayload(key, source, 'a'.repeat(24_001)), null);
});

test('payload de reversión only accepts UUID receipt and preserves the exact retry body', () => {
  const payload = buildDeshacerBloquePayload(key, blockId);
  assert.deepEqual(payload, { action: 'deshacer_bloque', confirmacion: true, idempotencyKey: key, bloqueId: blockId });
  assert.ok(Object.isFrozen(payload));
  assert.equal(buildDeshacerBloquePayload(key, 'bloque-visible-no-valido'), null);
  assert.equal(buildDeshacerBloquePayload('mal', blockId), null);
});

test('action gates require permission, explicit human acknowledgment and a valid payload', () => {
  const confirmation = buildConfirmarExactasPayload(key, [{ historicoId: 'h', movimientoId: 'm', fingerprint: 'f' }], previewToken);
  const undo = buildDeshacerBloquePayload(key, blockId);
  assert.equal(puedeEnviarConfirmacion(false, true, confirmation), false);
  assert.equal(puedeEnviarConfirmacion(true, false, confirmation), false);
  assert.equal(puedeEnviarConfirmacion(true, true, null), false);
  assert.equal(puedeEnviarConfirmacion(true, true, confirmation), true);
  assert.equal(puedeEnviarDeshacer(false, true, undo), false);
  assert.equal(puedeEnviarDeshacer(true, false, undo), false);
  assert.equal(puedeEnviarDeshacer(true, true, null), false);
  assert.equal(puedeEnviarDeshacer(true, true, undo), true);
});

test('confirmation and undo parsers reject unverified API results and retain signed totals separately', () => {
  const confirmation = parseHistoricalBulkConfirmation({
    ok: true,
    bloqueId: blockId,
    confirmadas: 1,
    idempotente: false,
    totalCargosCentimos: '-12345',
    totalCobrosCentimos: '6789',
  });
  assert.equal(confirmation.ok, true);
  if (confirmation.ok) {
    assert.equal(confirmation.value.totalCargosCentimos, '-12345');
    assert.equal(confirmation.value.totalCobrosCentimos, '6789');
  }
  assert.equal(parseHistoricalBulkConfirmation({ ok: true, bloqueId: blockId, confirmadas: 1, idempotente: false, totalCargosCentimos: '1.2', totalCobrosCentimos: '0' }).ok, false);
  assert.equal(parseHistoricalBulkConfirmation({ ok: true, bloqueId: blockId, confirmadas: 26, idempotente: false, totalCargosCentimos: '0', totalCobrosCentimos: '0' }).ok, false);
  assert.equal(parseHistoricalBulkUndo({ ok: true, bloqueId: blockId, revertidas: 1, idempotente: false }).ok, true);
  assert.equal(parseHistoricalBulkUndo({ ok: true, bloqueId: 'no-es-uuid', revertidas: 1, idempotente: false }).ok, false);
});
