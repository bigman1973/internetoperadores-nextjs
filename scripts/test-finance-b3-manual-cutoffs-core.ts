import assert from 'node:assert/strict'
import test from 'node:test'
import { coverageFromCutoffs, effectiveCutoff, exactCents, listBalanceJumps } from '../lib/finanzas/bank-cutoffs-core'

test('conserva el corte importado explícito sin inferir fechas de movimientos', () => {
  const cutoff = effectiveCutoff({ accountId: 'santander-1', importedCutoffDate: '2026-10-08', manual: null })
  assert.equal(cutoff.importedCutoffDate, '2026-10-08')
  assert.equal(cutoff.effectiveCutoffDate, '2026-10-08')
  assert.equal(cutoff.source, 'EXTRACTO_IMPORTADO')
  assert.deepEqual(coverageFromCutoffs([cutoff]), { status: 'KNOWN', asOf: '2026-10-08', activeAccountCount: 1, accountsWithKnownCutoff: 1 })
})

test('un corte manual usa fecha y saldo humanos sin igualarlos al último movimiento', () => {
  const cutoff = effectiveCutoff({ accountId: 'santander-1', importedCutoffDate: '2026-10-08', manual: { cutoffDate: '2026-10-10', balanceCents: -12_345, actorId: 9, confirmedAt: '2026-10-23T12:00:00.000Z' } })
  assert.equal(cutoff.effectiveCutoffDate, '2026-10-10')
  assert.equal(cutoff.manual?.balanceCents, -12_345)
  assert.equal(cutoff.source, 'MANUAL_CONFIRMADO')
})

test('sólo acepta céntimos exactos y no redondea', () => {
  assert.equal(exactCents('1.234,56'), 123_456)
  assert.equal(exactCents('-0,01'), -1)
  assert.equal(exactCents('1.234'), null)
  assert.equal(exactCents('NaN'), null)
})

test('lista un salto Santander con fecha, importe, esperado y leído', () => {
  const jumps = listBalanceJumps([
    { id: 'a', fechaOperacion: '2026-01-01', createdAt: '2026-01-02T09:00:00Z', importeText: '100.00', saldoText: '1000.00' },
    { id: 'b', fechaOperacion: '2026-01-02', createdAt: '2026-01-03T09:00:00Z', importeText: '-20.00', saldoText: '970.00' },
  ])
  assert.equal(jumps.length, 1)
  assert.deepEqual(jumps[0], {
    movimientoId: 'b', fecha: '2026-01-02', importeCentimos: -2_000, saldoEsperadoCentimos: 98_000,
    saldoLeidoCentimos: 97_000, diferenciaCentimos: -1_000, tipo: 'SALTO_SALDO',
    ordenIntradiaNoVerificado: false, ordenPresentacion: 'FECHA_CREATED_AT_ID',
  })
})

test('mismo día es candidato de revisión y nunca prueba orden intradía', () => {
  const jumps = listBalanceJumps([
    { id: 'a', fechaOperacion: '2026-01-01', createdAt: '2026-01-02T09:00:00Z', importeText: '100.00', saldoText: '1000.00' },
    { id: 'b', fechaOperacion: '2026-01-02', createdAt: '2026-01-03T09:00:00Z', importeText: '-20.00', saldoText: '970.00' },
    { id: 'c', fechaOperacion: '2026-01-02', createdAt: '2026-01-03T10:00:00Z', importeText: '10.00', saldoText: '990.00' },
  ])
  assert.equal(jumps[0].ordenIntradiaNoVerificado, true)
  assert.equal(jumps[0].saldoEsperadoCentimos, 98_000)
  assert.equal(jumps[1].ordenIntradiaNoVerificado, true)
})

console.log('OK: cortes manuales y candidatos de salto preservan exactitud, incertidumbre intradía e independencia de saldos originales.')
