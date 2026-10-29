import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS,
  scheduleDeferredAdminHeaderControls,
  shouldLoadDeferredAdminHeaderControls,
  type AdminHeaderIdleHost,
} from '../components/admin/admin-header-deferred-controls'

test('admin shell: un rol no privilegiado nunca solicita controles diferidos', () => {
  assert.equal(shouldLoadDeferredAdminHeaderControls({
    isSuperAdmin: false,
    idleReached: true,
  }), false)
})

test('admin shell: requestIdleCallback recibe el límite y su cleanup se cancela', () => {
  let receivedTimeout: number | undefined
  let idleCallback: (() => void) | undefined
  let cancelled: number | undefined
  let calls = 0
  const host: AdminHeaderIdleHost = {
    requestIdleCallback: (callback, options) => {
      idleCallback = callback
      receivedTimeout = options.timeout
      return 41
    },
    cancelIdleCallback: handle => { cancelled = handle },
    setTimeout: () => { throw new Error('No debe usar el fallback si hay requestIdleCallback') },
    clearTimeout: () => {},
  }

  const cancel = scheduleDeferredAdminHeaderControls(() => { calls += 1 }, host)
  assert.equal(receivedTimeout, ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS)
  assert.ok(idleCallback)
  idleCallback!()
  assert.equal(calls, 1)
  cancel()
  assert.equal(cancelled, 41)
})

test('admin shell: sin requestIdleCallback conserva un fallback cancelable', () => {
  let receivedDelay: number | undefined
  let timeoutCallback: (() => void) | undefined
  let cleared: number | undefined
  const host: AdminHeaderIdleHost = {
    setTimeout: (callback, delay) => {
      timeoutCallback = callback
      receivedDelay = delay
      return 73
    },
    clearTimeout: handle => { cleared = handle },
  }

  const cancel = scheduleDeferredAdminHeaderControls(() => {}, host)
  assert.equal(receivedDelay, ADMIN_HEADER_CONTROLS_IDLE_TIMEOUT_MS)
  assert.ok(timeoutCallback)
  cancel()
  assert.equal(cleared, 73)
})
