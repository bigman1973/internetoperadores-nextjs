import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONCILIAR_SEARCH_DEBOUNCE_MS,
  conciliarSearchHistoryUrl,
  createConciliarSearchMachineState,
  readConciliarSearchHistory,
  reduceConciliarSearchMachine,
} from './conciliar-global-search'

test('vaciar el input limpia q y offset de forma atómica antes de leer otra pestaña', () => {
  const searched = createConciliarSearchMachineState('COBROS', ' factura 42 ', 40, true)
  const cleared = reduceConciliarSearchMachine(searched, { type: 'INPUT', query: '' })

  assert.deepEqual(cleared.view, { tab: 'COBROS', query: '', offset: 0 })
  assert.equal(cleared.view.query, '')
  assert.equal(cleared.phase, 'loading')
  assert.equal(cleared.historyMode, 'replace')

  const pagos = reduceConciliarSearchMachine(cleared, { type: 'TAB', tab: 'PAGOS' })
  assert.deepEqual(pagos.view, { tab: 'PAGOS', query: '', offset: 0 })
  assert.equal(pagos.phase, 'loading')
})

test('la búsqueda es global: conserva una única q al cambiar por las cuatro pestañas', () => {
  let state = createConciliarSearchMachineState('COBROS', '', 0, true)
  state = reduceConciliarSearchMachine(state, { type: 'INPUT', query: 'proveedor común' })
  assert.equal(state.phase, 'pending')
  assert.equal(state.view.query, 'proveedor común')
  assert.equal(state.historyMode, 'replace')

  state = reduceConciliarSearchMachine(state, { type: 'DEBOUNCE_ELAPSED', generation: state.generation })
  assert.equal(state.phase, 'loading')
  assert.equal(CONCILIAR_SEARCH_DEBOUNCE_MS, 180)

  for (const tab of ['EMITIDAS', 'PAGOS', 'RECIBIDAS', 'COBROS'] as const) {
    state = reduceConciliarSearchMachine(state, { type: 'TAB', tab })
    assert.equal(state.view.tab, tab)
    assert.equal(state.view.query, 'proveedor común')
    assert.equal(state.view.offset, 0)
  }
})

test('la caja conserva el espacio mientras se escribe una búsqueda compuesta y normaliza al enviar', () => {
  let state = createConciliarSearchMachineState('COBROS', '', 0, true)
  state = reduceConciliarSearchMachine(state, { type: 'INPUT', query: 'internet ' })
  assert.equal(state.view.query, 'internet ')
  state = reduceConciliarSearchMachine(state, { type: 'INPUT', query: 'internet operadores' })
  assert.equal(state.view.query, 'internet operadores')
  state = reduceConciliarSearchMachine(state, { type: 'INPUT', query: ' internet operadores ' })
  state = reduceConciliarSearchMachine(state, { type: 'SUBMIT' })
  assert.equal(state.view.query, 'internet operadores')
  assert.equal(state.historyMode, 'push')
})

test('las respuestas antiguas no cierran ni sobrescriben la generación actual', () => {
  let state = createConciliarSearchMachineState('COBROS', '', 0, true)
  state = reduceConciliarSearchMachine(state, { type: 'INPUT', query: 'primera' })
  const oldGeneration = state.generation
  state = reduceConciliarSearchMachine(state, { type: 'DEBOUNCE_ELAPSED', generation: oldGeneration })
  state = reduceConciliarSearchMachine(state, { type: 'INPUT', query: 'segunda' })
  const currentGeneration = state.generation

  const staleResolution = reduceConciliarSearchMachine(state, { type: 'RESOLVED', generation: oldGeneration })
  assert.equal(staleResolution, state)
  assert.equal(staleResolution.phase, 'pending')

  state = reduceConciliarSearchMachine(state, { type: 'DEBOUNCE_ELAPSED', generation: currentGeneration })
  state = reduceConciliarSearchMachine(state, { type: 'RESOLVED', generation: currentGeneration })
  assert.equal(state.phase, 'idle')
})

test('enter, clear, pestaña y popstate normalizan URL sin conservar q oculto u offset inválido', () => {
  let state = createConciliarSearchMachineState('COBROS', 'un término', 20, true)
  state = reduceConciliarSearchMachine(state, { type: 'SUBMIT' })
  assert.deepEqual(state.view, { tab: 'COBROS', query: 'un término', offset: 0 })
  assert.equal(state.historyMode, 'push')

  state = reduceConciliarSearchMachine(state, { type: 'CLEAR' })
  assert.deepEqual(state.view, { tab: 'COBROS', query: '', offset: 0 })
  assert.equal(state.historyMode, 'replace')
  assert.equal(conciliarSearchHistoryUrl('https://conciliar.local/admin/finanzas/conciliar?q=oculta&offset=20&x=1', state.view), '/admin/finanzas/conciliar?x=1&tab=COBROS')

  const history = readConciliarSearchHistory('?tab=PAGOS&q=%20nuevo%20&offset=-5', state.view)
  assert.deepEqual(history, { tab: 'PAGOS', query: 'nuevo', offset: 0 })
  const popped = reduceConciliarSearchMachine(state, { type: 'HISTORY', view: history })
  assert.deepEqual(popped.view, history)
  assert.equal(popped.historyMode, 'none')
})
