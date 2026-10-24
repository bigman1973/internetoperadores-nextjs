import assert from 'node:assert/strict'
import {
  bankChainGapCountByCode,
  diagnoseBankChainGaps,
  type BankChainGapRow,
} from '../lib/finanzas/bank-chain-gaps-core'

function row(id: string, fecha: string, importeCentimos: number | null, saldoCentimos: number | null): BankChainGapRow {
  return { id, cuentaId: 'CUENTA_PRUEBA', fecha, importeCentimos, saldoCentimos }
}

// Céntimos exactos: 100,00 + 25,00 debe exigir 125,00, nunca una tolerancia.
const jump = diagnoseBankChainGaps([
  row('a', '2026-01-01', 10_000, 10_000),
  row('b', '2026-01-02', 2_500, 13_000),
])
assert.deepEqual(jump.fallos.map(item => item.codigo), ['SALDO_INICIAL_NO_VERIFICABLE', 'SALTO_DE_SALDO'])
const provenJump = jump.fallos[1]!
assert.equal(provenJump.accion, 'REVISAR_EXTRACTO')
assert.equal(provenJump.fechaProblema, '2026-01-02')
assert.equal(provenJump.fechaPrevia, '2026-01-01')
assert.equal(provenJump.fechaPosterior, '2026-01-02')
assert.equal(provenJump.importeCentimos, 2_500)
assert.equal(provenJump.saldoEsperadoCentimos, 12_500)
assert.equal(provenJump.saldoLeidoCentimos, 13_000)
assert.match(provenJump.mensaje, /^Revisar extracto del 2026-01-01 al 2026-01-02\./)
assert.equal(jump.faltaExtracto.estado, 'NO_DEMOSTRADA')
assert.match(jump.faltaExtracto.mensaje, /No se afirma que falte un extracto/)

// Saldo ausente no se reemplaza por cero y deja el siguiente apunte sin puente.
const missing = diagnoseBankChainGaps([
  row('a', '2026-02-01', 100, 100),
  row('b', '2026-02-02', -25, null),
  row('c', '2026-02-03', 75, 150),
])
assert.deepEqual(missing.fallos.map(item => item.codigo), ['SALDO_INICIAL_NO_VERIFICABLE', 'MOVIMIENTO_SIN_SALDO'])
assert.equal(missing.fallos[1]?.accion, 'FALTA_SALDO_APUNTE')
assert.equal(missing.fallos[1]?.fechaProblema, '2026-02-02')
assert.equal(missing.fallos[1]?.importeCentimos, -25)
assert.match(missing.fallos[1]?.mensaje ?? '', /^Falta saldo\/apunte/)
assert.equal(missing.fallos.some(item => item.codigo === 'SALTO_DE_SALDO'), false)

// Si coinciden dos apuntes sin secuencia y uno carece de saldo, ambos hechos se
// conservan: el orden ambiguo no puede ocultar el saldo que falta.
const missingAndAmbiguous = diagnoseBankChainGaps([
  row('first', '2026-02-10', 100, 100),
  row('without-balance', '2026-02-11', -25, null),
  row('same-day', '2026-02-11', 25, 100),
])
assert.deepEqual(missingAndAmbiguous.fallos.map(item => item.codigo), [
  'SALDO_INICIAL_NO_VERIFICABLE',
  'MOVIMIENTO_SIN_SALDO',
  'ORDEN_O_DUPLICADO_AMBIGUO',
])
assert.equal(missingAndAmbiguous.fallos[1]?.accion, 'FALTA_SALDO_APUNTE')
assert.equal(missingAndAmbiguous.fallos[2]?.accion, 'REVISAR_EXTRACTO')

// Dos filas el mismo día no se ordenan por ID ni se califican como salto ficticio.
const ambiguousA = diagnoseBankChainGaps([
  row('z', '2026-03-02', -2_000, 8_000),
  row('first', '2026-03-01', 10_000, 10_000),
  row('a', '2026-03-02', 2_000, 12_000),
  row('last', '2026-03-03', 500, 12_500),
])
const ambiguousB = diagnoseBankChainGaps([
  row('a', '2026-03-02', 2_000, 12_000),
  row('last', '2026-03-03', 500, 12_500),
  row('z', '2026-03-02', -2_000, 8_000),
  row('first', '2026-03-01', 10_000, 10_000),
])
assert.deepEqual(ambiguousA, ambiguousB)
const orderGap = ambiguousA.fallos.find(item => item.codigo === 'ORDEN_O_DUPLICADO_AMBIGUO')!
assert.equal(orderGap.accion, 'REVISAR_EXTRACTO')
assert.equal(orderGap.apuntesMismoDia, 2)
assert.equal(orderGap.fechaProblema, '2026-03-02')
assert.equal(orderGap.fechaPrevia, '2026-03-01')
assert.equal(orderGap.fechaPosterior, '2026-03-03')
assert.match(orderGap.mensaje, /^Revisar extracto del 2026-03-01 al 2026-03-03\./)
assert.equal(ambiguousA.fallos.some(item => item.codigo === 'SALTO_DE_SALDO'), false)

// La primera fila sigue siendo una limitación de cobertura, no una falta inventada.
const openingOnly = diagnoseBankChainGaps([row('opening', '2026-04-04', 0, 0)])
assert.deepEqual(openingOnly.fallos.map(item => item.codigo), ['SALDO_INICIAL_NO_VERIFICABLE'])
assert.equal(openingOnly.fallos[0]?.accion, 'INFORMAR_LIMITACION')

const empty = diagnoseBankChainGaps([])
assert.deepEqual(empty.fallos, [])
assert.equal(empty.faltaExtracto.estado, 'NO_DEMOSTRADA')

assert.deepEqual(bankChainGapCountByCode(jump.fallos), {
  SALDO_INICIAL_NO_VERIFICABLE: 1,
  MOVIMIENTO_SIN_SALDO: 0,
  ORDEN_O_DUPLICADO_AMBIGUO: 0,
  SALTO_DE_SALDO: 1,
})

console.log('OK bank-chain-gaps core: céntimos exactos, saldo inicial no inventado, saldo ausente, orden intradía ambiguo, salto demostrado y falta de extracto no afirmada; sin BD ni escrituras.')
