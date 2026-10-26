/* Transferencias propias Conciliar: pruebas puras. Sin Prisma, DB, red ni datos reales. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exactTransferAmountsMatch,
  parseConciliarPairedTransferLegResult,
  parseConciliarTransferSource,
  strictPairedTransferProof,
} from '../lib/finanzas/conciliar-transfers'
import { selectBilateralTransfers, type EasyAutoMovement } from '../lib/finanzas/easy-auto-core'

const PRIMARY = 'movement-synthetic-primary'
const PAIRED = 'movement-synthetic-paired'
const FINGERPRINT = 'a'.repeat(64)
const PRIMARY_OPERATION = '11111111-1111-4111-8111-111111111111'
const PAIRED_OPERATION = '22222222-2222-4222-8222-222222222222'

function movement(input: Partial<EasyAutoMovement> & Pick<EasyAutoMovement, 'id' | 'cuentaId' | 'fecha' | 'importeCentimos'>): EasyAutoMovement {
  return {
    versionB4: 1,
    concepto: 'TRANSFERENCIA INTERNA',
    referencia: null,
    infoAdicional: null,
    tercero: null,
    bancoCuenta: 'Banco sintético',
    ...input,
  }
}

const source = parseConciliarTransferSource({
  kind: 'TRANSFERENCIA_PROPIA',
  movimientoId: PRIMARY,
  movimientoParId: PAIRED,
  transferFingerprint: FINGERPRINT,
  versionB4: 7,
})
if (!source) throw new Error('Fixture de fuente de transferencia inválido.')

function reciprocalProofs(): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>([
    [PRIMARY, { movementId: PRIMARY, oppositeMovementId: PAIRED, fingerprint: FINGERPRINT }],
    [PAIRED, { movementId: PAIRED, oppositeMovementId: PRIMARY, fingerprint: FINGERPRINT }],
  ])
}

test('los importes de las dos patas son exactamente el esperado y su opuesto', () => {
  assert.equal(exactTransferAmountsMatch(12_345, -12_345, 12_345), true)
  assert.equal(exactTransferAmountsMatch(-12_345, 12_345, -12_345), true)
  assert.equal(exactTransferAmountsMatch(12_345, -12_344, 12_345), false)
  assert.equal(exactTransferAmountsMatch(12_345, -12_345, 0), false)
  assert.equal(exactTransferAmountsMatch(12.5, -12, 12), false)
})

test('la bilateralidad existente del core limita el par a tres días y rechaza ambigüedad', () => {
  const left = movement({ id: PRIMARY, cuentaId: 'account-a', fecha: '2026-10-10', importeCentimos: -50_000 })
  const withinThreeDays = movement({ id: PAIRED, cuentaId: 'account-b', fecha: '2026-10-13', importeCentimos: 50_000 })
  const afterFourDays = movement({ id: 'movement-too-late', cuentaId: 'account-c', fecha: '2026-10-14', importeCentimos: 50_000 })

  assert.equal(selectBilateralTransfers([left, withinThreeDays]).length, 1)
  assert.equal(selectBilateralTransfers([left, afterFourDays]).length, 0)
  assert.equal(selectBilateralTransfers([left, withinThreeDays, movement({ id: 'movement-ambiguous', cuentaId: 'account-c', fecha: '2026-10-12', importeCentimos: 50_000 })]).length, 0)
})

test('una prueba bilateral debe ser recíproca y conservar el fingerprint exacto', () => {
  assert.ok(strictPairedTransferProof(source, reciprocalProofs()))
  assert.equal(strictPairedTransferProof(source, new Map([[PRIMARY, { movementId: PRIMARY, oppositeMovementId: PAIRED, fingerprint: FINGERPRINT }]])), null, 'una pata sin prueba no puede confirmar')
  assert.equal(strictPairedTransferProof(source, new Map([
    [PRIMARY, { movementId: PRIMARY, oppositeMovementId: PAIRED, fingerprint: FINGERPRINT }],
    [PAIRED, { movementId: PAIRED, oppositeMovementId: PRIMARY, fingerprint: 'b'.repeat(64) }],
  ])), null, 'el fingerprint de ambas patas debe coincidir con la fuente')
})

test('el recibo de pata sólo acepta JSON propio completo, UUID y marcador de transferencia', () => {
  const valid = {
    state: 'confirmada',
    sourceKind: 'TRANSFERENCIA_PROPIA',
    pairedOperationB4Id: PAIRED_OPERATION,
    pairedMovementId: PAIRED,
    primaryMovementId: PRIMARY,
    transferFingerprint: FINGERPRINT,
  }
  assert.deepEqual(parseConciliarPairedTransferLegResult(JSON.stringify(valid)), valid)
  assert.equal(parseConciliarPairedTransferLegResult('{'), null, 'JSON roto falla de forma segura')
  assert.equal(parseConciliarPairedTransferLegResult({ ...valid, sourceKind: 'COMISION_BANCARIA' }), null)
  assert.equal(parseConciliarPairedTransferLegResult({ ...valid, pairedOperationB4Id: 'no-uuid' }), null)
  assert.equal(parseConciliarPairedTransferLegResult({ ...valid, unexpected: true }), null, 'una clave desconocida no puede ampliar el recibo')
  assert.equal(parseConciliarPairedTransferLegResult({ ...valid, primaryMovementId: PAIRED }), null)
})

console.log('test-conciliar-transfers: importes firmados, ventana bilateral, prueba recíproca y recibos malformados verificados sin BD.')
