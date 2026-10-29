import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS,
  shouldLoadDeferredAdminHeaderControls,
} from './admin-header-deferred-controls'

test('los controles privilegiados no se descargan para un rol no superadministrador', () => {
  assert.equal(shouldLoadDeferredAdminHeaderControls({
    isSuperAdmin: false,
    idleReached: true,
  }), false)
})

test('los controles privilegiados se habilitan tras idle para un superadministrador', () => {
  assert.equal(ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS > 0, true)
  assert.equal(shouldLoadDeferredAdminHeaderControls({
    isSuperAdmin: true,
    idleReached: true,
  }), true)
})

test('un superadministrador espera el temporizador antes de solicitar la isla', () => {
  assert.equal(shouldLoadDeferredAdminHeaderControls({
    isSuperAdmin: true,
    idleReached: false,
  }), false)
})
