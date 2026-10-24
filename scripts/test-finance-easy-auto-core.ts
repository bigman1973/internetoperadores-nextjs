import assert from 'node:assert/strict'
import {
  EASY_AUTO_DATA_FROM,
  EASY_AUTO_DATA_UNTIL,
  EasyAutoValidationError,
  centsFromExactSqlText,
  parseEasyAutoInput,
  proveLocalBalanceNeighborhoods,
  reviewHash,
  selectBilateralTransfers,
  selectPureBankCommissions,
  type EasyAutoBalanceRow,
  type EasyAutoMovement,
} from '../lib/finanzas/easy-auto-core'

const UUID = '11111111-1111-4111-8111-111111111111'
function movement(input: Partial<EasyAutoMovement> & Pick<EasyAutoMovement, 'id' | 'cuentaId' | 'fecha' | 'importeCentimos'>): EasyAutoMovement {
  return {
    versionB4: 1, concepto: null, referencia: null, infoAdicional: null, tercero: null, bancoCuenta: 'Banco Prueba', ...input,
  }
}
function balance(id: string, cuentaId: string, fecha: string, importeCentimos: number | null, saldoCentimos: number | null): EasyAutoBalanceRow {
  return { id, cuentaId, fecha, importeCentimos, saldoCentimos }
}
function errorCode(work: () => unknown): string | null {
  try { work() } catch (error) { return error instanceof EasyAutoValidationError ? error.code : String(error) }
  return null
}

// Exact SQL amounts never round through JS Float.
assert.equal(centsFromExactSqlText('-12.34', 'importe'), -1234)
assert.equal(centsFromExactSqlText('12.3', 'importe'), 1230)
assert.equal(errorCode(() => centsFromExactSqlText('12.345', 'importe')), 'IMPORTE_FUENTE_NO_EXACTO')
assert.equal(errorCode(() => centsFromExactSqlText('1e2', 'importe')), 'IMPORTE_FUENTE_NO_EXACTO')

// Same-day rows are accepted when their exact balance edges imply one path; the
// source row order/IDs are intentionally scrambled and never serve as an ordinal.
const uniqueSameDay = [
  balance('after', 'A', '2026-06-03', -300, 1_200), // 1,500 -> 1,200
  balance('before', 'A', '2026-06-02', 500, 1_500), // 1,000 -> 1,500
  balance('target', 'A', '2026-06-03', -200, 1_000), // 1,200 -> 1,000
  balance('next', 'A', '2026-06-04', 100, 1_100), // 1,000 -> 1,100
]
const localUnique = proveLocalBalanceNeighborhoods(uniqueSameDay, ['target'])
assert.deepEqual(localUnique.get('target'), { ok: true, code: null })

// A branch at the same saldo is multiple possible ordering, never resolved by ID.
const branchAtTarget = [...uniqueSameDay, balance('branch-at-target', 'A', '2026-06-03', -200, 1_200)] // 1,400 -> 1,200, alternate predecessor of target
assert.deepEqual(proveLocalBalanceNeighborhoods(branchAtTarget, ['target']).get('target'), { ok: false, code: 'CADENA_SALDO_AMBIGUA' })

// A connected cycle cannot prove a chronological chain even with exact cents.
const cycle = [
  balance('cycle-before', 'C', '2026-06-02', 100, 100), // 0 -> 100
  balance('cycle-target', 'C', '2026-06-02', -50, 50), // 100 -> 50
  balance('cycle-next', 'C', '2026-06-02', -50, 0), // 50 -> 0 (closes graph)
]
assert.deepEqual(proveLocalBalanceNeighborhoods(cycle, ['cycle-target']).get('cycle-target'), { ok: false, code: 'CADENA_SALDO_CICLICA' })
assert.deepEqual(proveLocalBalanceNeighborhoods([balance('x', 'A', '2026-06-02', null, null)], ['x']).get('x'), { ok: false, code: 'SALDO_NO_EXACTO_O_AUSENTE' })
assert.deepEqual(proveLocalBalanceNeighborhoods(uniqueSameDay, ['missing']).get('missing'), { ok: false, code: 'SALDO_NO_EXACTO_O_AUSENTE' })

// A distant malformed account row does not veto the exact local transfer neighborhood.
const withDistantMissing = [...uniqueSameDay, balance('far-missing', 'A', '2026-01-05', null, null)]
assert.deepEqual(proveLocalBalanceNeighborhoods(withDistantMissing, ['target']).get('target'), { ok: true, code: null })

const transferLeft = movement({ id: 'transfer-left', cuentaId: 'A', fecha: '2026-06-03', importeCentimos: -2_000, concepto: 'Transferencia interna' })
const transferRight = movement({ id: 'transfer-right', cuentaId: 'B', fecha: '2026-06-06', importeCentimos: 2_000, referencia: 'TRASPASO ENTRE CUENTAS' })
const transfers = selectBilateralTransfers([transferRight, transferLeft])
assert.equal(transfers.length, 1)
assert.equal(transfers[0]?.clase, 'TRASPASO_PROPIO')
assert.equal(transfers[0]?.movimientos[0].id, 'transfer-left')
assert.equal(transfers[0]?.motivoNoRequiere, 'TRASPASO_INTERNO_SIN_DOCUMENTO')
assert.equal(selectBilateralTransfers([transferLeft, transferRight, movement({ id: 'ambiguous', cuentaId: 'C', fecha: '2026-06-05', importeCentimos: 2_000, concepto: 'TRASPASO' })]).length, 0)

// Commissions derive solely from CuentaBancaria.banco. They never read m.tercero
// and do not require a prior bank ledger row or a transfer/balance proof.
const commission = movement({ id: 'commission', cuentaId: 'SANTANDER', fecha: '2026-06-01', importeCentimos: -125, concepto: 'Comisión bancaria de mantenimiento', tercero: null, bancoCuenta: 'Banco Santander, S.A.' })
const commissionCandidates = selectPureBankCommissions([commission])
assert.equal(commissionCandidates.length, 1)
assert.equal(commissionCandidates[0]?.bancoCobradorNormalizado, 'BANCO SANTANDER, S.A.')
assert.equal(commissionCandidates[0]?.motivoNoRequiere, 'COMISION_BANCARIA')
assert.equal(selectPureBankCommissions([movement({ ...commission, id: 'card', concepto: 'Compra tarjeta comisión bancaria' })]).length, 0)
assert.equal(selectPureBankCommissions([movement({ ...commission, id: 'interest', concepto: 'Comisión intereses crédito' })]).length, 0)
assert.equal(selectPureBankCommissions([movement({ ...commission, id: 'zero', concepto: 'Comisión 0,00' })]).length, 0)
for (const concepto of ['Comisión 0,60', 'Comisión 0.08', 'Comisión: 0,90']) {
  assert.equal(selectPureBankCommissions([movement({ ...commission, id: 'subeuro', concepto })]).length, 1)
}
for (const concepto of ['Comisión 0', 'Comisión: 0.00', 'Comisión 0,0000', 'Compra TPV comisión 0,60']) {
  assert.equal(selectPureBankCommissions([movement({ ...commission, id: 'zero-or-card', concepto })]).length, 0)
}
assert.equal(selectPureBankCommissions([movement({ ...commission, id: 'no-bank', bancoCuenta: null })]).length, 0)

const preview = parseEasyAutoInput({ action: 'previsualizar', desde: EASY_AUTO_DATA_FROM, hasta: EASY_AUTO_DATA_UNTIL, limite: 10 })
assert.deepEqual(preview, { action: 'previsualizar', desde: '2026-01-01', hasta: '2026-10-08', limite: 10 })
assert.equal(errorCode(() => parseEasyAutoInput({ action: 'registrar_tercero_banco', cuentaId: 'x', nombreBancoCobrador: 'Banco', referenciaEvidencia: 'referencia suficiente', confirmacion: true })), 'VALIDATION_ERROR')
const hash = reviewHash('22222222-2222-4222-8222-222222222222', [commissionCandidates[0]!])
assert.match(hash, /^[a-f0-9]{64}$/)
assert.equal(errorCode(() => parseEasyAutoInput({ action: 'ejecutar', desde: EASY_AUTO_DATA_FROM, hasta: EASY_AUTO_DATA_UNTIL, limite: 1, idempotencyKey: UUID, reviewHash: hash, confirmacion: false })), 'CONFIRMACION_REQUERIDA')

console.log('Easy Auto core: 22 aserciones de céntimos, saldo local intradía único, ambigüedad/ciclo, traspasos y comisión derivada de CuentaBancaria verificadas sin BD.')
