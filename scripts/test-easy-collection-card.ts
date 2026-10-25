import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildCollectionConfirmPayload,
  buildCollectionUndoPayload,
  parseEasyReadResponse,
  type EasyCollectionProposal,
} from '../components/finanzas/easy/easy-contract';

const key = '123e4567-e89b-42d3-a456-426614174000';
const propuestaId = '123e4567-e89b-42d3-a456-426614174001';
const blockId = '123e4567-e89b-42d3-a456-426614174002';
const fingerprint = 'a'.repeat(64);

function collectionProposal(overrides: Record<string, unknown> = {}) {
  return {
    rol: 'PRINCIPAL',
    propuestaId,
    movimientoId: 'movimiento-cobro-01',
    fingerprint,
    previewToken: 'token-firmado-solo-servidor',
    metodo: 'REMESA_VENCIMIENTO',
    etiquetaMetodo: 'Remesa de recibos',
    nivel: 'EXACTA',
    explicacion: 'La remesa contiene las facturas indicadas.',
    importeMovimientoCentimos: 30000,
    lineas: [
      { tipo: 'DOCUMENTO', referencia: 'Remesa 209', importeCentimos: 29500 },
      { tipo: 'DIFERENCIA', referencia: 'Diferencia por comisión', importeCentimos: 500 },
    ],
    composicion: [{
      numFactura: 'F-2026-01', cliente: 'Cliente de prueba', importeCentimos: 29500,
      vencimiento: '2026-10-15', facturaEmitidaId: 'factura-prueba-01', totalFacturaCentimos: 30000, fechaFactura: '2026-10-01',
    }],
    composicionTotal: 2,
    composicionImporteCentimos: 29500,
    clientesDistintos: 2,
    diferenciaCentimos: 500,
    par: null,
    seleccionable: true,
    motivoNoSeleccionable: null,
    ...overrides,
  };
}

function easyResponse(proposal?: unknown) {
  return {
    stagingOnly: true,
    automaticas: false,
    criterio: 'sólo movimientos SIN_DOCUMENTO',
    periodo: { desde: '2026-01-01', hasta: '2026-10-08' },
    total: 1,
    limit: 25,
    offset: 0,
    totales: { cargos: 0, cobros: 1, cargosCentimos: '0', cobrosCentimos: '30000' },
    meses: [{ mes: '2026-10', pendientes: 1, justificados: 0, noRequiere: 0, importeJustificadoCentimos: '0', importePendienteCentimos: '30000', coberturaVerificada: false, semaforo: 'AMARILLO', mensaje: 'Pendiente' }],
    reglas: [],
    movimientos: [{
      id: 'movimiento-cobro-01', version: 1, fecha: '2026-10-20', concepto: 'Cobro de clientes', importeCentimos: 30000, contraparte: 'Varios clientes',
      cuenta: { id: 'cuenta-01', banco: 'Banco de pruebas', alias: 'Operativa' }, tarjeta: null, responsableTarjeta: null, versionGestion: 1,
      estado: 'SIN_DOCUMENTO', reglaAplicadaId: null, sugerencias: [],
      ...(proposal === undefined ? {} : { propuestaCobro: proposal }),
    }],
  };
}

test('el contrato antiguo se conserva si el servidor aún no publica propuestaCobro', () => {
  const parsed = parseEasyReadResponse(easyResponse());
  assert.equal(parsed.movimientos[0].propuestaCobro, undefined);
});

test('la tarjeta acepta el DTO 1→N y conserva todos los céntimos como enteros seguros', () => {
  const parsed = parseEasyReadResponse(easyResponse(collectionProposal()));
  const proposal = parsed.movimientos[0].propuestaCobro;
  assert.ok(proposal);
  assert.equal(proposal.composicion.length, 1, 'La respuesta publica como máximo la previsualización de composición disponible.');
  assert.equal(proposal.composicionTotal, 2);
  assert.equal(proposal.clientesDistintos, 2);
  assert.equal(proposal.diferenciaCentimos, 500);
  assert.equal(proposal.composicion[0].totalFacturaCentimos, 30000);
  assert.throws(() => parseEasyReadResponse(easyResponse(collectionProposal({ diferenciaCentimos: 0.5 }))), /entero seguro/);
  assert.throws(() => parseEasyReadResponse(easyResponse(collectionProposal({ composicion: Array.from({ length: 61 }, () => collectionProposal().composicion[0]), composicionTotal: 61 }))), /composicion/);
  assert.throws(() => parseEasyReadResponse(easyResponse(collectionProposal({ previewToken: null, seleccionable: true }))), /previewToken/);
});

test('confirmar usa sólo un ítem y el token firmado del servidor; REVISAR sigue siendo individual', () => {
  const proposal = parseEasyReadResponse(easyResponse(collectionProposal({ nivel: 'REVISAR' }))).movimientos[0].propuestaCobro as EasyCollectionProposal;
  const payload = buildCollectionConfirmPayload(proposal, key);
  assert.deepEqual(payload, {
    action: 'confirmar_bloque',
    confirmacion: true,
    idempotencyKey: key,
    previewToken: 'token-firmado-solo-servidor',
    items: [{ propuestaId, movimientoId: 'movimiento-cobro-01', fingerprint }],
  });
  assert.ok(Object.isFrozen(payload));
  assert.ok(Object.isFrozen(payload?.items));
  assert.equal(payload?.items.length, 1);
  assert.equal(buildCollectionConfirmPayload({ ...proposal, previewToken: null }, key), null);
  assert.equal(buildCollectionConfirmPayload({ ...proposal, seleccionable: false }, key), null);
  assert.equal(buildCollectionConfirmPayload(proposal, 'no-es-uuid'), null);
  assert.deepEqual(buildCollectionUndoPayload(blockId, key), { action: 'deshacer_bloque', confirmacion: true, idempotencyKey: key, bloqueId: blockId });
  assert.equal(buildCollectionUndoPayload('bloque-no-valido', key), null);
});

test('la tarjeta aplaza las filas de facturas, exige diálogo y usa el endpoint especializado', () => {
  const workspace = readFileSync('components/finanzas/easy/EasyReconciliationWorkspace.tsx', 'utf8');
  assert.match(workspace, /function CollectionCompositionDetails/);
  assert.match(workspace, /\{open && <div/);
  assert.match(workspace, /Confirmar estas facturas/);
  assert.match(workspace, /CollectionConfirmationDialog/);
  assert.match(workspace, /\/api\/admin\/finanzas\/modo-facil\/cobros/);
  assert.match(workspace, /buildCollectionConfirmPayload/);
  assert.match(workspace, /buildCollectionUndoPayload/);
  assert.match(workspace, /Revisión obligatoria/);
  assert.match(workspace, /Reglas guardadas/);
  assert.doesNotMatch(workspace, />Propuestas guardadas</);
});

console.log('test-easy-collection-card: OK');
