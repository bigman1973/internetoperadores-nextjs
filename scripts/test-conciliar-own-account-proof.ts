/* Pruebas puras: sin Prisma, BD, red, datos reales, B4 ni DDL. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE,
  humanOwnTransferPairSource,
  manualOwnAccountProof,
} from '../lib/finanzas/conciliar-own-account-proof-core'
import { classifyConciliarOwnTransferReviews, type ConciliarTransferReviewMovement } from '../lib/finanzas/conciliar-transfer-classifier'

const PAIR = 'a'.repeat(64)

function movement(input: Readonly<Pick<ConciliarTransferReviewMovement, 'id' | 'cuentaId' | 'fecha' | 'importeCentimos'>>): ConciliarTransferReviewMovement {
  return {
    ...input, versionB4: 1, concepto: null, referencia: null, infoAdicional: null, tercero: null, bancoCuenta: null,
    thirdPartyConfirmed: false, documentaryLinked: false, ownRecipientExplicit: false,
  }
}

test('sólo la última declaración humana confirmada acredita una cuenta activa', () => {
  const proof = manualOwnAccountProof([
    { accountId: 'synthetic-account-a', version: 1, state: 'DECLARADA', confirmationDeclared: true },
    { accountId: 'synthetic-account-a', version: 2, state: 'DECLARADA', confirmationDeclared: true },
    { accountId: 'synthetic-account-b', version: 1, state: 'DECLARADA', confirmationDeclared: false },
    { accountId: 'synthetic-account-c', version: 1, state: 'DECLARADA', confirmationDeclared: true },
    { accountId: 'synthetic-account-c', version: 2, state: 'REVOCADA', confirmationDeclared: false },
  ])
  assert.equal(proof.source, CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE)
  assert.deepEqual([...proof.accountIds], ['synthetic-account-a'])
})

test('una versión actual ambigua, malformada o sin confirmación nunca acredita titularidad', () => {
  const proof = manualOwnAccountProof([
    { accountId: 'synthetic-ambiguous', version: 4, state: 'DECLARADA', confirmationDeclared: true, sameVersionCount: 2 },
    { accountId: 'synthetic-missing-confirmation', version: 1, state: 'DECLARADA', confirmationDeclared: false },
    { accountId: 'synthetic-valid', version: 1, state: 'DECLARADA', confirmationDeclared: true },
    { accountId: 'not an account id', version: 2, state: 'DECLARADA', confirmationDeclared: true },
  ])
  assert.deepEqual([...proof.accountIds], ['synthetic-valid'])
})

test('el clasificador humano usa la prueba manual para una pareja exacta, sin abrir la ruta automática', () => {
  const proof = manualOwnAccountProof([
    { accountId: 'synthetic-own-a', version: 1, state: 'DECLARADA', confirmationDeclared: true },
    { accountId: 'synthetic-own-b', version: 1, state: 'DECLARADA', confirmationDeclared: true },
  ])
  const left = movement({ id: 'synthetic-leg-out', cuentaId: 'synthetic-own-a', fecha: '2026-10-10', importeCentimos: -12_345 })
  const right = movement({ id: 'synthetic-leg-in', cuentaId: 'synthetic-own-b', fecha: '2026-10-13', importeCentimos: 12_345 })
  const reviews = classifyConciliarOwnTransferReviews({ movements: [left, right], attestedOwnAccountIds: proof.accountIds })
  assert.equal(reviews.get(left.id)?.kind, 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA')
  assert.equal(reviews.get(right.id)?.movimientoParId, left.id)
  assert.match(reviews.get(left.id)?.transferFingerprint ?? '', /^[a-f0-9]{64}$/)
})

test('la fuente humana persiste pareja y procedencia manual, pero no representa una aprobación B4', () => {
  const source = humanOwnTransferPairSource({
    movimientoId: 'synthetic-leg-out',
    movimientoParId: 'synthetic-leg-in',
    pairId: PAIR,
    versionB4: 7,
  })
  assert.deepEqual(source, {
    kind: 'TRANSFERENCIA_PROPIA_MANUAL',
    movimientoId: 'synthetic-leg-out',
    movimientoParId: 'synthetic-leg-in',
    pairId: PAIR,
    source: CONCILIAR_MANUAL_OWN_ACCOUNT_PROOF_SOURCE,
    versionB4: 7,
  })
  assert.equal(humanOwnTransferPairSource({ movimientoId: 'same', movimientoParId: 'same', pairId: PAIR, versionB4: 1 }), null)
  assert.equal(humanOwnTransferPairSource({ movimientoId: 'a', movimientoParId: 'b', pairId: 'not-a-hash', versionB4: 1 }), null)
})

console.log('OK: declaración manual confirmada/revocada, ambigüedad y fuente de pareja humana verificadas con fixtures sintéticas.')
