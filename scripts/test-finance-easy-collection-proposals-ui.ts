import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCollectionConfirmPayload,
  buildCollectionUndoPayload,
  parseCollectionProposalsRead,
  replaceCollectionSelection,
  retryCollectionAction,
  sortCollectionProposals,
} from '../components/finanzas/easy/NewCollectionProposalsWorkspace';

const key = '123e4567-e89b-42d3-a456-426614174000';
const propuestaId = '123e4567-e89b-42d3-a456-426614174001';
const bloqueId = '123e4567-e89b-42d3-a456-426614174002';
const movimientoId = 'movimiento-cobro-01';
const fingerprint = 'a'.repeat(64);

function response(overrides: Record<string, unknown> = {}) {
  return {
    generacion: { id: '123e4567-e89b-42d3-a456-426614174003', creadaAt: '2026-10-24T10:00:00.000Z', fuente: 'prueba' },
    totales: {
      pendientes: 2, pendientesImporteCentimos: 35000,
      exactas: 1, exactasImporteCentimos: 30000,
      revisar: 1, revisarImporteCentimos: 5000,
      porMetodo: [{ metodo: 'REMESA_VENCIMIENTO', etiqueta: 'Remesa de recibos', exactas: 1, revisar: 0, importeCentimos: 30000 }],
    },
    items: [{
      propuestaId, movimientoId, fecha: '2026-10-20', banco: 'Banco de pruebas', cuentaAlias: 'Operativa', concepto: 'Cobro de clientes', importeMovimientoCentimos: 30000,
      metodo: 'REMESA_VENCIMIENTO', etiquetaMetodo: 'Remesa de recibos', nivel: 'EXACTA', explicacion: 'La remesa incluye las facturas que se muestran.',
      lineas: [{ tipo: 'DOCUMENTO', referencia: 'REMESA-01', importeCentimos: 30000 }],
      composicion: [{ numFactura: 'F-2026-01', cliente: 'Cliente de prueba', importeCentimos: 30000, vencimiento: '2026-10-15', facturaEmitidaId: null }],
      composicionTotal: 1, composicionImporteCentimos: 30000, par: null, fingerprint, seleccionable: true, motivoNoSeleccionable: null,
    }],
    limit: 25, offset: 0, previewToken: 'token-firmado-de-prueba', bloquesRecientes: [{ bloqueId, at: '2026-10-24T10:00:00.000Z', confirmadas: 1, importeCentimos: 30000, revertido: false }],
    ...overrides,
  };
}

test('la cola de cobros exige todos los datos publicados antes de habilitar una acción', () => {
  const parsed = parseCollectionProposalsRead(response());
  assert.equal(parsed.items[0].etiquetaMetodo, 'Remesa de recibos');
  assert.equal(parsed.items[0].composicion[0].numFactura, 'F-2026-01');
  assert.equal(parsed.bloquesRecientes[0].bloqueId, bloqueId);
  assert.equal(sortCollectionProposals([{ ...parsed.items[0], propuestaId: '123e4567-e89b-42d3-a456-426614174004', movimientoId: 'pequeno', importeMovimientoCentimos: 20 }, parsed.items[0]])[0].movimientoId, movimientoId);
  assert.throws(() => parseCollectionProposalsRead(response({ previewToken: '' })), /previewToken/);
  assert.throws(() => parseCollectionProposalsRead(response({ items: [{ ...response().items[0] as object, fingerprint: 'incompleto' }] })), /fingerprint/);
  assert.throws(() => parseCollectionProposalsRead(response({ bloquesRecientes: [{ ...response().bloquesRecientes[0] as object, bloqueId: 'no-es-uuid' }] })), /bloqueId/);
});

test('confirmar y deshacer conservan exactamente el cuerpo firmado de la acción', () => {
  const parsed = parseCollectionProposalsRead(response());
  const item = parsed.items[0];
  const selection = {
    propuestaId: item.propuestaId, movimientoId: item.movimientoId, fingerprint: item.fingerprint,
    fecha: item.fecha, concepto: item.concepto, importeMovimientoCentimos: item.importeMovimientoCentimos, etiquetaMetodo: item.etiquetaMetodo, nivel: item.nivel,
  } as const;
  const payload = buildCollectionConfirmPayload(key, parsed.previewToken, [selection]);
  assert.deepEqual(payload, {
    action: 'confirmar_bloque', confirmacion: true, idempotencyKey: key, previewToken: 'token-firmado-de-prueba',
    items: [{ propuestaId, movimientoId, fingerprint }],
  });
  assert.ok(Object.isFrozen(payload));
  assert.ok(Object.isFrozen(payload?.items));
  assert.equal(retryCollectionAction(payload), payload);
  assert.equal(buildCollectionConfirmPayload('no-es-uuid', parsed.previewToken, [selection]), null);
  assert.equal(buildCollectionConfirmPayload(key, parsed.previewToken, []), null);
  assert.deepEqual(buildCollectionUndoPayload(key, bloqueId), { action: 'deshacer_bloque', confirmacion: true, idempotencyKey: key, bloqueId });
  assert.equal(buildCollectionUndoPayload(key, 'bloque visible sin forma válida'), null);
});

test('la actualización reemplaza filas seleccionadas por la versión recién cargada', () => {
  const parsed = parseCollectionProposalsRead(response());
  const original = parsed.items[0];
  const selection = {
    propuestaId: original.propuestaId, movimientoId: original.movimientoId, fingerprint: original.fingerprint,
    fecha: original.fecha, concepto: original.concepto, importeMovimientoCentimos: original.importeMovimientoCentimos, etiquetaMetodo: original.etiquetaMetodo, nivel: original.nivel,
  } as const;
  const fresh = { ...original, fingerprint: 'b'.repeat(64) };
  const next = replaceCollectionSelection({ [original.propuestaId]: selection }, [fresh]);
  assert.equal(next[original.propuestaId].fingerprint, fresh.fingerprint);
});

console.log('test-finance-easy-collection-proposals-ui: OK');
