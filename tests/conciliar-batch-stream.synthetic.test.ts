import assert from 'node:assert/strict'
import { planConciliarConfirmBatch } from '../lib/finanzas/conciliar-batch'
import { acceptsConciliarNdjson, streamConciliarConfirmation } from '../lib/finanzas/conciliar-stream'

const hash = 'a'.repeat(64)
const fail = (status: number, code: string, message: string): never => {
  const error = Object.assign(new Error(message), { status, code })
  throw error
}

function row(id: string, movementId: string, kind: 'COMISION_BANCARIA' | 'COBRO_PROPUESTA' = 'COMISION_BANCARIA', extras: Record<string, unknown> = {}) {
  return {
    id,
    movimientoId: movementId,
    fecha: '2026-10-28',
    concepto: 'Comisión',
    banco: 'Banco',
    cuenta: 'Cuenta',
    importeCentimos: -100,
    pendienteCentimos: -100,
    color: 'VERDE' as const,
    grupo: null,
    motivo: 'Exacta',
    documento: null,
    propuesta: null,
    seleccionable: true,
    diferenciaCentimos: 0,
    detail: null,
    decisionHash: hash,
    source: { kind, movimientoId: movementId, versionB4: 1, ...extras },
    sourceFingerprint: 'b'.repeat(64),
    updatedAt: '2026-10-28T00:00:00.000Z',
  }
}

const planned = planConciliarConfirmBatch(
  [{ id: 'fila-a', decisionHash: hash }, { id: 'fila-b', decisionHash: hash }],
  [row('fila-b', 'mov-b'), row('fila-a', 'mov-a')],
  fail,
)
assert.deepEqual(planned.rows.map(item => item.id), ['fila-a', 'fila-b'], 'La selección cerrada conserva su orden canónico, no el orden accidental de SQL.')
assert.deepEqual(planned.movementIds, ['mov-a', 'mov-b'], 'Los locks/borrados de movimiento siguen un orden estable.')
assert.equal(planned.onlyBankFees, true)

assert.throws(() => planConciliarConfirmBatch(
  [{ id: 'fila-a', decisionHash: hash }, { id: 'fila-b', decisionHash: hash }],
  [row('fila-a', 'mismo'), row('fila-b', 'mismo')],
  fail,
), (error: unknown) => (error as { code?: string }).code === 'MOVIMIENTO_REPETIDO')

assert.throws(() => planConciliarConfirmBatch(
  [{ id: 'remesa', decisionHash: hash }, { id: 'fila-b', decisionHash: hash }],
  [row('remesa', 'mov-r', 'COBRO_PROPUESTA', { remesaId: 42, proposalCompositionHash: 'c'.repeat(64) }), row('fila-b', 'mov-b')],
  fail,
), (error: unknown) => (error as { code?: string }).code === 'REMESA_REQUIERE_CONFIRMACION_INDIVIDUAL')

assert.equal(acceptsConciliarNdjson('application/json, application/x-ndjson;q=0.9'), true)
assert.equal(acceptsConciliarNdjson('application/json'), false)

async function lines(response: Response) {
  return (await response.text()).trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
}

async function main() {
  const committed = await lines(streamConciliarConfirmation({
    total: 2,
    execute: async onProgress => {
      onProgress({ kind: 'row-applied', completed: 1, total: 2, rowId: 'fila-a' })
      onProgress({ kind: 'row-applied', completed: 2, total: 2, rowId: 'fila-b' })
      return {
        operationId: '11111111-1111-4111-8111-111111111111',
        outcomes: [{ id: 'fila-a', ok: true, code: 'HECHO', message: 'Hecho.' }, { id: 'fila-b', ok: true, code: 'HECHO', message: 'Hecho.' }],
        refreshedAt: '2026-10-28T00:00:00.000Z', projectionSynchronized: false,
      }
    },
    actionResponse: result => result,
    actionErrorResponse: () => ({ error: 'No debería fallar.', codigo: 'UNEXPECTED' }),
  }))
  assert.deepEqual(committed.map(item => item.type), ['started', 'progress', 'progress', 'committed'])
  assert.equal(committed[1]?.provisional, true)
  assert.equal(committed[2]?.message, 'Confirmando 2 de 2…')
  assert.equal(Object.prototype.hasOwnProperty.call(committed[1]!, 'outcomes'), false, 'El avance no revela resultados antes del commit.')
  assert.deepEqual((committed[3]?.result as { outcomes: unknown[] }).outcomes.map((item: any) => item.id), ['fila-a', 'fila-b'])

  const rolledBack = await lines(streamConciliarConfirmation({
    total: 2,
    execute: async onProgress => {
      onProgress({ kind: 'row-applied', completed: 1, total: 2, rowId: 'fila-a' })
      throw Object.assign(new Error('La evidencia cambió.'), { code: 'DECISION_CAMBIADA' })
    },
    actionResponse: result => result,
    actionErrorResponse: error => ({ error: (error as Error).message, codigo: (error as { code?: string }).code }),
  }))
  assert.deepEqual(rolledBack.map(item => item.type), ['started', 'progress', 'rolled_back'])
  assert.equal(rolledBack[2]?.provisional, false)
  assert.equal(Object.prototype.hasOwnProperty.call(rolledBack[2]!, 'outcomes'), false, 'Un rollback no presenta resultados parciales como definitivos.')
  assert.match(String(rolledBack[2]?.message), /No se confirmó ninguna fila/)

  console.log('conciliar batch/stream synthetic test: ok')
}

void main()
