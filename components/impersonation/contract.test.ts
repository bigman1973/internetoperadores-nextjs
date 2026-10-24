import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createExitAttempt,
  createStartAttempt,
  minutesUntil,
  parseActuationState,
  retryExitAttempt,
  retryStartAttempt,
  safeInternalRedirect,
} from './contract'

test('parsea sólo un estado de actuación completo procedente del servidor', () => {
  const state = parseActuationState({
    enabled: true,
    canStart: false,
    active: {
      sessionId: 'session-1',
      actorName: 'Víctor',
      targetName: 'Lorena',
      targetId: 12,
      expiresAt: '2026-10-24T18:45:00.000Z',
    },
  })

  assert.equal(state.active?.targetName, 'Lorena')
  assert.equal(state.targets.length, 0)
  assert.throws(() => parseActuationState({ enabled: true, canStart: true, active: { targetId: '12' } }))
})

test('un reintento de inicio mantiene destino, motivo y clave de idempotencia', () => {
  const attempt = createStartAttempt(12, '  Comprobación autorizada  ', () => 'key-inicio')
  const retry = retryStartAttempt(attempt)

  assert.deepEqual(attempt, { targetId: 12, motivo: 'Comprobación autorizada', idempotencyKey: 'key-inicio' })
  assert.equal(retry, attempt)
})

test('un reintento de salida conserva la misma clave de idempotencia', () => {
  const attempt = createExitAttempt(() => 'key-salida')
  assert.equal(retryExitAttempt(attempt), attempt)
})

test('el temporizador de la banda no informa minutos negativos y no sigue redirecciones externas', () => {
  const now = Date.parse('2026-10-24T18:00:00.000Z')
  assert.equal(minutesUntil('2026-10-24T18:01:01.000Z', now), 2)
  assert.equal(minutesUntil('2026-10-24T17:59:59.000Z', now), 0)
  assert.equal(safeInternalRedirect('/admin/finanzas'), '/admin/finanzas')
  assert.equal(safeInternalRedirect('https://invalid.example'), '/admin')
  assert.equal(safeInternalRedirect('//invalid.example'), '/admin')
})
