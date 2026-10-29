import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ConciliarDetailMemoryCache,
  formatConciliarUpdatedAt,
} from './conciliar-detail-client'
import {
  assertConciliarDocumentDetailActor,
  ConciliarDocumentDetailError,
} from '../../../lib/finanzas/conciliar-document-detail-access'

test('la caché LRU acotada conserva el uso reciente y expulsa la entrada más antigua', () => {
  const cache = new ConciliarDetailMemoryCache<string>(2, 100)
  cache.set('fila-a', 'A', 1_000)
  cache.set('fila-b', 'B', 1_000)

  assert.equal(cache.get('fila-a', 1_010), 'A')
  cache.set('fila-c', 'C', 1_010)

  assert.equal(cache.get('fila-a', 1_011), 'A')
  assert.equal(cache.get('fila-b', 1_011), undefined)
  assert.equal(cache.get('fila-c', 1_011), 'C')
  assert.equal(cache.size(1_011), 2)
})

test('cancelar e invalidar una generación aborta la carga y no repuebla resultados privados', async () => {
  const cache = new ConciliarDetailMemoryCache<string>(1, 100)
  let signal: AbortSignal | undefined
  let resolveLoad: ((value: string) => void) | undefined

  const pending = cache.load('fila-privada', async (receivedSignal) => {
    signal = receivedSignal
    return new Promise<string>((resolve) => { resolveLoad = resolve })
  }, 1_000)
  await Promise.resolve()

  cache.clear()
  assert.equal(signal?.aborted, true)
  resolveLoad?.('resultado-anterior')
  await assert.doesNotReject(pending)

  assert.equal(cache.get('fila-privada', 1_001), undefined)
  assert.equal(cache.pendingSize(), 0)
})

test('la capacidad cancela una precarga antigua antes de admitir otra distinta', async () => {
  const cache = new ConciliarDetailMemoryCache<string>(1, 100)
  let firstSignal: AbortSignal | undefined
  let resolveFirst: ((value: string) => void) | undefined

  const first = cache.load('fila-a', async (signal) => {
    firstSignal = signal
    return new Promise<string>((resolve) => { resolveFirst = resolve })
  }, 1_000)
  await Promise.resolve()
  const second = cache.load('fila-b', async () => 'B', 1_000)

  assert.equal(firstSignal?.aborted, true)
  resolveFirst?.('A')
  await assert.doesNotReject(first)
  assert.equal(await second, 'B')
  assert.equal(cache.get('fila-a', 1_001), undefined)
  assert.equal(cache.get('fila-b', 1_001), 'B')
})

test('el lector rechaza con 403 antes de consultar una proyección cuando no hay actor B4 efectivo', () => {
  assert.throws(
    () => assertConciliarDocumentDetailActor(0),
    (error: unknown) => error instanceof ConciliarDocumentDetailError
      && error.status === 403
      && error.code === 'SIN_PERMISO_ACTUAL',
  )
})

test('el aviso de actualización deriva la hora de un timestamp verificable y no promete recálculo', () => {
  assert.equal(
    formatConciliarUpdatedAt('2026-10-29T14:05:00.000Z', { locale: 'es-ES', timeZone: 'UTC' }),
    'Cifras actualizadas a las 14:05',
  )
  assert.equal(formatConciliarUpdatedAt('no-es-fecha'), 'Cifras sin fecha de actualización verificable.')
})
