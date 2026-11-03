import assert from 'node:assert/strict';
import test from 'node:test';
import { canAdoptConciliarMutationProjection, conciliarIdentityTransitioning, conciliarUiRowBlocked } from './conciliar-mutation-ui';
import { createConciliarSearchMachineState, reduceConciliarSearchMachine, CONCILIAR_SEARCH_READ_TIMEOUT_MS } from './conciliar-global-search';

const authority = { synchronized: true, requestIdentity: 'usuario:3:valid', currentIdentity: 'usuario:3:valid', requestView: 'COBROS:q:', currentView: 'COBROS:q:', requestGeneration: 0, currentGeneration: 0, requestSequence: 1, currentSequence: 1, pendingCount: 1 };

test('primera autoridad se desbloquea sólo tras reconocerla en estado React', () => {
  const unknown = 'auth-desconocida';
  const identity = 'usuario:3:valid';
  assert.equal(conciliarIdentityTransitioning(unknown, identity), true);
  assert.equal(conciliarIdentityTransitioning(identity, identity), false);
  assert.equal(conciliarIdentityTransitioning(identity, unknown), true);
  assert.equal(conciliarIdentityTransitioning(identity, 'usuario:4:valid'), true);
});

test('recibo sincronizado sólo se adopta en identidad, vista, generación y secuencia exactas', () => {
  assert.equal(canAdoptConciliarMutationProjection(authority), true);
  for (const change of [
    { synchronized: false }, { currentIdentity: null }, { currentIdentity: 'usuario:4:valid' },
    { currentView: 'PAGOS:q:' }, { currentGeneration: 1 }, { currentSequence: 2 }, { pendingCount: 2 },
  ]) assert.equal(canAdoptConciliarMutationProjection({ ...authority, ...change }), false);
});

test('undo bloquea únicamente todos sus destinos conocidos y conserva seguridad si son desconocidos', () => {
  const undo = { key: 'undo-key', action: 'deshacer', operationId: 'operation', rowIds: ['remesa', 'row-2'] };
  assert.equal(conciliarUiRowBlocked([undo], 'remesa'), true);
  assert.equal(conciliarUiRowBlocked([undo], 'row-2'), true);
  assert.equal(conciliarUiRowBlocked([undo], 'otra'), false);
  assert.equal(conciliarUiRowBlocked([{ ...undo, rowIds: [] }], 'otra'), true);
  assert.equal(conciliarUiRowBlocked([{ ...undo, action: 'confirmar' }], 'otra'), true);
  assert.equal(conciliarUiRowBlocked([], 'remesa'), false);
});

test('discard cierra loading y el resultado anterior no habilita la generación descartada', () => {
  const loading = createConciliarSearchMachineState('COBROS');
  const discarded = reduceConciliarSearchMachine(loading, { type: 'DISCARD' });
  assert.equal(discarded.phase, 'error');
  assert.ok(discarded.error);
  assert.equal(reduceConciliarSearchMachine(discarded, { type: 'RESOLVED', generation: loading.generation }), discarded);
  assert.equal(reduceConciliarSearchMachine(discarded, { type: 'REFRESH' }).phase, 'loading');
});

test('TAB/OFFSET sin cambio no requieren cancelar el GET; AbortError activo sale de loading', () => {
  const loading = createConciliarSearchMachineState('COBROS');
  assert.equal(reduceConciliarSearchMachine(loading, { type: 'TAB', tab: 'COBROS' }), loading);
  assert.equal(reduceConciliarSearchMachine(loading, { type: 'OFFSET', offset: 0 }), loading);
  const failed = reduceConciliarSearchMachine(loading, { type: 'FAILED', generation: loading.generation, error: new DOMException('cancelada', 'AbortError') });
  assert.equal(failed.phase, 'error');
  assert.equal(CONCILIAR_SEARCH_READ_TIMEOUT_MS, 45_000);
});
