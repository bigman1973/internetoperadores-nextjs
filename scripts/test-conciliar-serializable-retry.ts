/* Prueba pura del límite P2034: usa callbacks simulados y no escribe en BD. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Prisma } from '@prisma/client'
import { ConciliarActionError, retryConciliarSerializableP2034 } from '../lib/finanzas/conciliar-actions'

function p2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('serializable conflict fixture', { code: 'P2034', clientVersion: 'fixture' })
}

test('P2034 vuelve a ejecutar el mismo callback transaccional y luego devuelve éxito', async () => {
  const idempotencyKey = '11111111-1111-4111-8111-111111111111'
  const body = { action: 'deshacer', idempotencyKey }
  const calls: typeof body[] = []
  const delays: number[] = []
  const result = await retryConciliarSerializableP2034(async () => {
    calls.push(body)
    if (calls.length === 1) throw p2034()
    return { operationId: 'recibo-fixture', idempotencyKey }
  }, async milliseconds => { delays.push(milliseconds) })

  assert.deepEqual(result, { operationId: 'recibo-fixture', idempotencyKey })
  assert.equal(calls.length, 2)
  assert.equal(calls[0], body)
  assert.equal(calls[1], body)
  assert.deepEqual(delays, [25])
})

test('tres P2034 agotan los dos reintentos y propagan el último conflicto', async () => {
  let attempts = 0
  const delays: number[] = []
  const finalConflict = p2034()
  await assert.rejects(
    retryConciliarSerializableP2034(async () => {
      attempts += 1
      if (attempts === 3) throw finalConflict
      throw p2034()
    }, async milliseconds => { delays.push(milliseconds) }),
    error => error === finalConflict,
  )
  assert.equal(attempts, 3)
  assert.deepEqual(delays, [25, 50])
})

test('P2028, un P2034 no Prisma y un error desconocido se propagan sin reintento', async () => {
  for (const nonRetryable of [
    Object.assign(new Error('resultado incierto fixture'), { code: 'P2028' }),
    Object.assign(new Error('P2034 no Prisma fixture'), { code: 'P2034' }),
    new Error('error desconocido fixture'),
  ]) {
    let attempts = 0
    const delays: number[] = []
    await assert.rejects(
      retryConciliarSerializableP2034(async () => {
        attempts += 1
        throw nonRetryable
      }, async milliseconds => { delays.push(milliseconds) }),
      error => error === nonRetryable,
    )
    assert.equal(attempts, 1)
    assert.deepEqual(delays, [])
  }
})

test('un error controlado de Conciliar nunca se reintenta aunque su código coincida', async () => {
  let attempts = 0
  const controlled = new ConciliarActionError(409, 'P2034', 'conflicto de negocio fixture')
  await assert.rejects(
    retryConciliarSerializableP2034(async () => {
      attempts += 1
      throw controlled
    }, async () => { throw new Error('no debe esperar') }),
    error => error === controlled,
  )
  assert.equal(attempts, 1)
})

console.log('OK: retry serializable P2034 validado con mocks; sin BD ni red.')
