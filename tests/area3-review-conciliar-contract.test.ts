import assert from 'node:assert/strict'
import test from 'node:test'
import { ConciliarValidationError, parseConciliarCommand } from '../lib/finanzas/conciliar-contract'

const decisionHash = 'a'.repeat(64)
const sourceHash = 'b'.repeat(64)
const idempotencyKey = '11111111-1111-4111-8111-111111111111'

test('REVIEW_PREVIEW acepta únicamente id y decisionHash, sin campos de mutación', () => {
  const command = parseConciliarCommand({
    action: 'confirmar',
    review: { kind: 'REVIEW_PREVIEW', id: 'fila-ambar', decisionHash },
  })
  assert.deepEqual(command, {
    action: 'confirmar',
    review: { kind: 'REVIEW_PREVIEW', id: 'fila-ambar', decisionHash },
  })
  assert.throws(() => parseConciliarCommand({
    action: 'confirmar', idempotencyKey,
    review: { kind: 'REVIEW_PREVIEW', id: 'fila-ambar', decisionHash },
  }), (error: unknown) => error instanceof ConciliarValidationError && error.status === 400)
})

test('REVIEW_CONFIRM exige ACK versionado y no acepta importe, documento ni motivo libre del navegador', () => {
  const command = parseConciliarCommand({
    action: 'confirmar', idempotencyKey,
    review: {
      kind: 'REVIEW_CONFIRM', id: 'fila-ambar', decisionHash,
      acknowledgement: {
        schema: 'AREA3_REVIEW_ACK_V1', version: '2026-10-30',
        motivo: 'REFERENCIA_NUMERO_INCOMPLETO', sourceHash,
        advertenciaReconocida: true,
      },
    },
  })
  assert.equal(command.action, 'confirmar')
  assert.ok('review' in command && command.review.kind === 'REVIEW_CONFIRM')

  assert.throws(() => parseConciliarCommand({
    action: 'confirmar', idempotencyKey,
    review: {
      kind: 'REVIEW_CONFIRM', id: 'fila-ambar', decisionHash, importeCentimos: -100,
      acknowledgement: {
        schema: 'AREA3_REVIEW_ACK_V1', version: '2026-10-30',
        motivo: 'REFERENCIA_NUMERO_INCOMPLETO', sourceHash,
        advertenciaReconocida: true,
      },
    },
  }), (error: unknown) => error instanceof ConciliarValidationError && error.status === 400)
})
