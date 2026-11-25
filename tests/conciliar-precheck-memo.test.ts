import assert from 'node:assert/strict'
import test from 'node:test'
import {
  conciliarPrecheckMemoKey,
  memoizedConciliarPrecheckDecision,
  precheckConciliarRowTx,
  type ConciliarPrecheck,
  type ConciliarPrecheckRow,
} from '../lib/finanzas/conciliar-precheck'

function row(overrides: Partial<ConciliarPrecheckRow> = {}): ConciliarPrecheckRow {
  return {
    id: 'row-fixture', movimientoId: 'movement-fixture', fecha: '2026-10-30', concepto: 'COMISION',
    banco: 'BANCO', cuenta: 'CUENTA', importeCentimos: -125, pendienteCentimos: -125,
    color: 'VERDE', grupo: 'BANCO', motivo: 'Comisión exacta', documento: null, propuesta: null,
    seleccionable: true, diferenciaCentimos: 0, detail: null, decisionHash: 'd'.repeat(64),
    sourceFingerprint: 'f'.repeat(64),
    source: { kind: 'COMISION_BANCARIA', movimientoId: 'movement-fixture', versionB4: 1 },
    ...overrides,
  }
}
const green: ConciliarPrecheck = {
  schema: 'CONCILIAR_PRECHECK_V1', confirmable: true, mode: 'ESTANDAR', code: 'CONFIRMABLE', motivo: 'ok',
}
const red: ConciliarPrecheck = {
  schema: 'CONCILIAR_PRECHECK_V1', confirmable: false, mode: 'BLOQUEADA', code: 'FUENTE_CAMBIADA', motivo: 'bloqueada',
}

test('G7 memo identifica exactamente la misma foto sellada y separa cambios de fuente', () => {
  const base = row()
  assert.equal(conciliarPrecheckMemoKey(base), conciliarPrecheckMemoKey({ ...base }))
  assert.notEqual(
    conciliarPrecheckMemoKey(base),
    conciliarPrecheckMemoKey({ ...base, source: { ...base.source, versionB4: 2 } }),
  )
  assert.notEqual(
    conciliarPrecheckMemoKey(base),
    conciliarPrecheckMemoKey({ ...base, sourceFingerprint: 'e'.repeat(64) }),
  )
  assert.notEqual(
    conciliarPrecheckMemoKey(base),
    conciliarPrecheckMemoKey({ ...base, importeCentimos: -126 }),
  )
})

test('G7 memo conserva negativos y sólo dura la invocación que entrega su Map', async () => {
  const subject = row(), memo = new Map<string, ConciliarPrecheck>()
  let reads = 0
  const first = await memoizedConciliarPrecheckDecision(subject, memo, async () => { reads++; return red })
  const second = await memoizedConciliarPrecheckDecision(subject, memo, async () => { reads++; return green })
  assert.equal(first, red)
  assert.equal(second, red)
  assert.equal(reads, 1)

  const nextInvocation = new Map<string, ConciliarPrecheck>()
  const third = await memoizedConciliarPrecheckDecision(subject, nextInvocation, async () => { reads++; return green })
  assert.equal(third, green)
  assert.equal(reads, 2)
})

test('G7 evalúa ciclo antes de memoizar y no consulta una promesa recursiva', async () => {
  const subject = row({ id: 'cyclic-row' })
  const cached = new Map([[conciliarPrecheckMemoKey(subject), green]])
  const result = await precheckConciliarRowTx({} as never, subject, { memo: cached, visited: new Set([subject.id]) })
  assert.deepEqual(result, {
    schema: 'CONCILIAR_PRECHECK_V1', confirmable: false, mode: 'BLOQUEADA',
    code: 'ENLACE_CIRCULAR', motivo: 'No se puede comprobar el movimiento propuesto para este documento.',
  })
  assert.equal(cached.get(conciliarPrecheckMemoKey(subject)), green)
})
