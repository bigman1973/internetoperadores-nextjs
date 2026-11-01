import assert from 'node:assert/strict'
import test from 'node:test'
import { parseConciliarReviewPreviewResponse } from './conciliar-contract'

const decisionHash = 'a'.repeat(64)
const sourceHash = 'b'.repeat(64)

function response(overrides: Record<string, unknown> = {}) {
  return {
    reviewPreview: {
      id: 'fila-ambar', decisionHash, color: 'AMBAR',
      puedeConfirmarRevision: true, confirmableGreen: false,
      codigo: 'ACK_REQUERIDO',
      mensaje: 'El proveedor y el importe coinciden, pero el banco no cita una factura; revísala antes de confirmar.',
      sourceHash,
      acknowledgement: {
        schema: 'AREA3_REVIEW_ACK_V2', version: '2026-11-01',
        motivo: 'SIN_REFERENCIA_DOCUMENTAL', sourceHash,
      },
      ...overrides,
    },
  }
}

test('el parser cliente acepta sólo una previsualización ámbar con ACK sellado y sin verde', () => {
  const preview = parseConciliarReviewPreviewResponse(response())
  assert.equal(preview.puedeConfirmarRevision, true)
  assert.equal(preview.confirmableGreen, false)
  assert.equal(preview.acknowledgement?.sourceHash, sourceHash)
})

test('el parser cliente rechaza incoherencias que podrían habilitar la excepción sin ACK vigente', () => {
  assert.throws(() => parseConciliarReviewPreviewResponse(response({ color: 'VERDE' })))
  assert.throws(() => parseConciliarReviewPreviewResponse(response({ acknowledgement: null })))
  assert.throws(() => parseConciliarReviewPreviewResponse(response({ sourceHash: 'c'.repeat(64) })))
  assert.throws(() => parseConciliarReviewPreviewResponse(response({ confirmableGreen: true })))
})
