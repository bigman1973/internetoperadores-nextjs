/* Traspasos propios Conciliar: fixtures puras, sin Prisma, BD, red, build ni tsc. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  classifyConciliarOwnTransferReviews,
  hasExactOwnRecipientEvidence,
  normalizedRegisteredOwnIban,
  type ConciliarTransferReviewMovement,
} from '../lib/finanzas/conciliar-transfer-classifier'
import {
  assignConciliarProviderPayments,
  type ConciliarProviderPayment,
} from '../lib/finanzas/conciliar-proveedor-asignacion'

const OWN = new Set(['cuenta-propia-a', 'cuenta-propia-b', 'cuenta-propia-c'])
const OWN_IBAN = normalizedRegisteredOwnIban('ES91 2100 0418 4502 0005 1332')
if (!OWN_IBAN) throw new Error('Fixture de IBAN propio inválida.')

function movement(input: Readonly<Partial<ConciliarTransferReviewMovement> & Pick<ConciliarTransferReviewMovement, 'id' | 'cuentaId' | 'fecha' | 'importeCentimos'>>): ConciliarTransferReviewMovement {
  return {
    id: input.id,
    cuentaId: input.cuentaId,
    fecha: input.fecha,
    importeCentimos: input.importeCentimos,
    versionB4: 1,
    concepto: 'TRANSFERENCIA INTERNA',
    referencia: null,
    infoAdicional: null,
    tercero: null,
    bancoCuenta: 'Banco sintético',
    thirdPartyConfirmed: false,
    documentaryLinked: false,
    ownRecipientExplicit: false,
    ...input,
  }
}
function review(...movements: readonly ConciliarTransferReviewMovement[]) {
  return classifyConciliarOwnTransferReviews({ movements, attestedOwnAccountIds: OWN })
}

test('pareja atestada, recíproca, céntimos opuestos exactos y tres días conserva fingerprint único', () => {
  const cargo = movement({ id: 'cargo-propio', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: -50_000 })
  const cobro = movement({ id: 'cobro-propio', cuentaId: 'cuenta-propia-b', fecha: '2026-10-13', importeCentimos: 50_000 })
  const result = review(cargo, cobro)
  assert.deepEqual(result.get(cargo.id), {
    kind: 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA', movimientoId: cargo.id, movimientoParId: cobro.id,
    transferFingerprint: result.get(cargo.id)?.transferFingerprint,
  })
  assert.deepEqual(result.get(cobro.id), {
    kind: 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA', movimientoId: cobro.id, movimientoParId: cargo.id,
    transferFingerprint: result.get(cobro.id)?.transferFingerprint,
  })
  assert.match(result.get(cargo.id)?.transferFingerprint ?? '', /^[a-f0-9]{64}$/)
  assert.equal(result.get(cargo.id)?.transferFingerprint, result.get(cobro.id)?.transferFingerprint)
})

test('cuatro días o un céntimo no forman pareja: sólo evidencia propia explícita deja ámbar sin pareja', () => {
  const fourDays = movement({ id: 'cargo-cuatro-dias', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: -12_345, ownRecipientExplicit: true })
  const late = movement({ id: 'cobro-cuatro-dias', cuentaId: 'cuenta-propia-b', fecha: '2026-10-14', importeCentimos: 12_345, ownRecipientExplicit: true })
  const cent = movement({ id: 'cargo-centimo', cuentaId: 'cuenta-propia-c', fecha: '2026-10-10', importeCentimos: -13_000, ownRecipientExplicit: true })
  const wrongCent = movement({ id: 'cobro-centimo', cuentaId: 'cuenta-propia-b', fecha: '2026-10-11', importeCentimos: 12_999, ownRecipientExplicit: true })
  const result = review(fourDays, late, cent, wrongCent)
  for (const leg of [fourDays, late, cent, wrongCent]) assert.deepEqual(result.get(leg.id), { kind: 'SIN_PAREJA_VERIFICADA', movimientoId: leg.id })
})

test('una contrapartida no se reutiliza: ninguna ambigüedad se resuelve por orden, texto o importe', () => {
  const cargo = movement({ id: 'cargo-ambiguo', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: -70_000 })
  const cobroB = movement({ id: 'cobro-ambiguo-b', cuentaId: 'cuenta-propia-b', fecha: '2026-10-11', importeCentimos: 70_000 })
  const cobroC = movement({ id: 'cobro-ambiguo-c', cuentaId: 'cuenta-propia-c', fecha: '2026-10-12', importeCentimos: 70_000 })
  const result = review(cargo, cobroB, cobroC)
  for (const leg of [cargo, cobroB, cobroC]) assert.deepEqual(result.get(leg.id), { kind: 'PAREJAS_VERIFICADAS_AMBIGUAS', movimientoId: leg.id })
})

test('varias patas opuestas con redacción genérica de pago quedan ámbar y fuera de Para pedir; una P1 o vínculo documental real continúa vetando', () => {
  const credit = movement({ id: 'abono-ambiguo-sin-origen', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: 71_000, concepto: 'TRANSFERENCIA RECIBIDA' })
  const paymentB = movement({ id: 'cargo-pago-generico-b', cuentaId: 'cuenta-propia-b', fecha: '2026-10-11', importeCentimos: -71_000, concepto: 'PAGO TRANSFERENCIA' })
  const paymentC = movement({ id: 'cargo-pago-generico-c', cuentaId: 'cuenta-propia-c', fecha: '2026-10-12', importeCentimos: -71_000, concepto: 'PAGO TRANSFERENCIA' })
  const result = review(credit, paymentB, paymentC)
  assert.deepEqual(result.get(credit.id), { kind: 'PAREJAS_VERIFICADAS_AMBIGUAS', movimientoId: credit.id })
  assert.equal(result.has(paymentB.id), false)
  assert.equal(result.has(paymentC.id), false)

  const p1Partner = { ...paymentB, id: 'cargo-p1-tercero', thirdPartyConfirmed: true }
  const blocked = review(credit, p1Partner)
  assert.equal(blocked.has(credit.id), false)
  assert.equal(blocked.has(p1Partner.id), false)
})

test('literal fijo de compañía o IBAN atestado permiten revisión; nombre aproximado y cuenta no atestada no', () => {
  const literal = movement({ id: 'literal-propio', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: -9_000, concepto: 'Transferencia Inmediata A Favor De Internet Operadores' })
  const literalSinPista = movement({ id: 'literal-propio-sin-pista', cuentaId: 'cuenta-propia-c', fecha: '2026-10-10', importeCentimos: -9_002, concepto: 'A Favor De Internet Operadores' })
  const iban = movement({ id: 'iban-propio', cuentaId: 'cuenta-propia-b', fecha: '2026-10-10', importeCentimos: 9_000, referencia: 'ES91 2100 0418 4502 0005 1332' })
  const parecido = movement({ id: 'nombre-parecido', cuentaId: 'cuenta-propia-c', fecha: '2026-10-10', importeCentimos: -9_001, tercero: 'Internet Operadora Similar' })
  const noAtestado = movement({ id: 'cuenta-no-atestada', cuentaId: 'cuenta-ajena', fecha: '2026-10-11', importeCentimos: 9_000, tercero: 'Internet Operadores' })
  const ibans = new Set([OWN_IBAN])
  assert.equal(hasExactOwnRecipientEvidence(literal, ibans), true)
  assert.equal(hasExactOwnRecipientEvidence(literalSinPista, ibans), true)
  assert.equal(hasExactOwnRecipientEvidence(iban, ibans), true)
  assert.equal(hasExactOwnRecipientEvidence(parecido, ibans), false)
  const result = review(
    { ...literal, ownRecipientExplicit: hasExactOwnRecipientEvidence(literal, ibans) },
    { ...iban, ownRecipientExplicit: hasExactOwnRecipientEvidence(iban, ibans) },
    { ...literalSinPista, ownRecipientExplicit: hasExactOwnRecipientEvidence(literalSinPista, ibans) },
    parecido, noAtestado,
  )
  assert.equal(result.get(literal.id)?.kind, 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA')
  assert.equal(result.get(iban.id)?.kind, 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA')
  assert.deepEqual(result.get(literalSinPista.id), { kind: 'SIN_PAREJA_VERIFICADA', movimientoId: literalSinPista.id })
  assert.equal(result.has(parecido.id), false)
  assert.equal(result.has(noAtestado.id), false)
})

test('nombre o IBAN del ordenante en metadatos no son evidencia de destinatario propio', () => {
  const external = movement({ id: 'tercero-emisor-en-info', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: -8_100, concepto: 'Transferencia a favor de Empresa de Prueba', infoAdicional: 'Ordenante Internet Operadores ES91 2100 0418 4502 0005 1332' })
  assert.equal(hasExactOwnRecipientEvidence(external, new Set([OWN_IBAN])), false)
})

test('abono identifica sólo un ordenante/remitente propio completo con IBAN propio registrado; el mismo metadato nunca acredita un cargo', () => {
  const credit = movement({
    id: 'abono-ordenante-propio', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: 8_100,
    concepto: 'TRANSFERENCIA RECIBIDA', infoAdicional: 'ORDENANTE: Internet Operadores, S.L. ES91-2100-0418-4502-0005-1332',
  })
  const debit = { ...credit, id: 'cargo-con-mismo-ordenante', importeCentimos: -8_100 }
  const incomplete = { ...credit, id: 'abono-razon-incompleta', infoAdicional: 'REMITENTE Internet Operadores ES91 2100 0418 4502 0005 1332' }
  const appendedParty = { ...credit, id: 'abono-tercero-adjunto', infoAdicional: 'ORDENANTE Internet Operadores, S.L. y Tercero ES91 2100 0418 4502 0005 1332' }
  const unregisteredIban = { ...credit, id: 'abono-iban-no-registrado', infoAdicional: 'ORDENANTE Internet Operadores, S.L. ES00 0000 0000 0000 0000 0000' }
  const ibans = new Set([OWN_IBAN])
  assert.equal(hasExactOwnRecipientEvidence(credit, ibans), true)
  assert.equal(hasExactOwnRecipientEvidence(debit, ibans), false)
  assert.equal(hasExactOwnRecipientEvidence(incomplete, ibans), false)
  assert.equal(hasExactOwnRecipientEvidence(appendedParty, ibans), false)
  assert.equal(hasExactOwnRecipientEvidence(unregisteredIban, ibans), false)
})

test('contrapartida propia admite sólo los dos literales fijos autoritativos; la abreviatura exacta queda en revisión ámbar, no verde', () => {
  const exactComma = movement({ id: 'contrapartida-propia-coma', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: 8_200, tercero: 'Internet Operadores, S.L.' })
  const exactPunctuation = movement({ id: 'contrapartida-propia-puntuacion', cuentaId: 'cuenta-propia-b', fecha: '2026-10-10', importeCentimos: 8_201, tercero: 'internet-operadores s.l.' })
  const authoritativeAbbreviation = movement({ id: 'contrapartida-abreviatura-autoritativa', cuentaId: 'cuenta-propia-c', fecha: '2026-10-10', importeCentimos: 8_202, tercero: 'Internet Operadores' })
  const contained = movement({ id: 'contrapartida-con-tercero', cuentaId: 'cuenta-propia-c', fecha: '2026-10-10', importeCentimos: 8_203, tercero: 'Tercero Internet Operadores, S.L.' })
  const suffixed = movement({ id: 'contrapartida-con-sufijo', cuentaId: 'cuenta-propia-c', fecha: '2026-10-10', importeCentimos: 8_204, tercero: 'Internet Operadores, S.L. y Asociados' })
  assert.equal(hasExactOwnRecipientEvidence(exactComma, new Set()), true)
  assert.equal(hasExactOwnRecipientEvidence(exactPunctuation, new Set()), true)
  assert.equal(hasExactOwnRecipientEvidence(authoritativeAbbreviation, new Set()), true)
  assert.equal(hasExactOwnRecipientEvidence(contained, new Set()), false)
  assert.equal(hasExactOwnRecipientEvidence(suffixed, new Set()), false)
  assert.deepEqual(review({ ...authoritativeAbbreviation, ownRecipientExplicit: true }).get(authoritativeAbbreviation.id), {
    kind: 'SIN_PAREJA_VERIFICADA', movimientoId: authoritativeAbbreviation.id,
  })
})

test('P1 CUENTA_PROPIA conserva evidencia; tercero confirmado o vínculo documental excluyen las dos patas', () => {
  const ownP1 = movement({ id: 'p1-propia', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: -31_000, ownRecipientExplicit: true })
  const partner = movement({ id: 'pareja-p1-propia', cuentaId: 'cuenta-propia-b', fecha: '2026-10-11', importeCentimos: 31_000 })
  const thirdParty = movement({ id: 'cargo-tercero', cuentaId: 'cuenta-propia-a', fecha: '2026-10-12', importeCentimos: -32_000, concepto: 'TRANSFERENCIA PAGO FACTURA', thirdPartyConfirmed: true })
  const thirdPartyPartner = movement({ id: 'abono-tercero', cuentaId: 'cuenta-propia-b', fecha: '2026-10-13', importeCentimos: 32_000 })
  const linked = movement({ id: 'cargo-documentado', cuentaId: 'cuenta-propia-a', fecha: '2026-10-14', importeCentimos: -33_000, documentaryLinked: true })
  const linkedPartner = movement({ id: 'abono-documentado', cuentaId: 'cuenta-propia-b', fecha: '2026-10-15', importeCentimos: 33_000 })
  const result = review(ownP1, partner, thirdParty, thirdPartyPartner, linked, linkedPartner)
  assert.equal(result.get(ownP1.id)?.kind, 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA')
  assert.equal(result.get(partner.id)?.kind, 'PAREJA_UNICA_PENDIENTE_PRUEBA_ESTRICTA')
  for (const excluded of [thirdParty, thirdPartyPartner, linked, linkedPartner]) assert.equal(result.has(excluded.id), false)
})

test('la reserva de proveedor conserva sólo cargos de tercero: las patas propias se apartan antes de asignar una factura', () => {
  const ownCharge = movement({ id: 'cargo-propio-reserva', cuentaId: 'cuenta-propia-a', fecha: '2026-10-10', importeCentimos: -42_000 })
  const ownReceipt = movement({ id: 'cobro-propio-reserva', cuentaId: 'cuenta-propia-b', fecha: '2026-10-11', importeCentimos: 42_000 })
  const providerCharge = movement({ id: 'cargo-proveedor-reserva', cuentaId: 'cuenta-propia-c', fecha: '2026-10-12', importeCentimos: -42_001, concepto: 'TRANSFERENCIA PAGO FACTURA', thirdPartyConfirmed: true })
  const transfers = review(ownCharge, ownReceipt, providerCharge)
  const providerPayments: ConciliarProviderPayment[] = [ownCharge, providerCharge]
    .filter(item => item.importeCentimos < 0 && !transfers.has(item.id))
    .map(item => ({
      movementId: item.id, fecha: item.fecha, importeBancoCentimos: item.importeCentimos, conceptoBanco: item.concepto ?? '',
      candidates: [{ invoiceId: 'factura-proveedor-sintetica', referencia: 'PRUEBA-42', fecha: '2026-10-01', vencimiento: null, importeDisponibleCentimos: -42_001, providerMatch: 'EXACT' }],
    }))
  assert.deepEqual(providerPayments.map(item => item.movementId), [providerCharge.id])
  assert.equal(assignConciliarProviderPayments(providerPayments).get(providerCharge.id)?.invoiceId, 'factura-proveedor-sintetica')
})

test('integración: reserva antes de proveedor, pareja visual verde no seleccionable y lectura histórica sin automatismos nuevos', () => {
  const db = readFileSync(resolve(__dirname, '../lib/finanzas/conciliar-db.ts'), 'utf8')
  const actions = readFileSync(resolve(__dirname, '../lib/finanzas/conciliar-actions.ts'), 'utf8')
  const providerBlock = db.slice(db.indexOf('const providerPayments: ConciliarProviderPayment[]'), db.indexOf('const providerAssignments = assignConciliarProviderPayments'))
  const reviewBlock = db.slice(db.indexOf('const transferReview = transferReviews.get(id)'), db.indexOf('if (amount > 0)'))
  const strictBlock = db.slice(db.indexOf('export async function readStrictOwnTransfers'), db.indexOf('export async function rebuildConciliarProjectionTx'))
  assert.ok(providerBlock.indexOf('transferReviews.has(id)') >= 0)
  assert.match(reviewBlock, /color: pairedExactly \? 'VERDE' : 'AMBAR'/)
  assert.match(reviewBlock, /grupo: 'TRASPASOS_PROPIOS'/)
  assert.match(reviewBlock, /seleccionable: false/)
  assert.match(reviewBlock, /kind: 'TRANSFERENCIA_PROPIA_MANUAL'/)
  assert.match(reviewBlock, /proofSource: manualOwnAccounts\.proof\.source/)
  assert.doesNotMatch(strictBlock, /classifyConciliarOwnTransferReviews/)
  assert.match(actions, /if \(row\.color !== 'ROJO'\) fail\(422, 'FILA_NO_PEDIBLE'/)
  assert.match(actions, /if \(!row\.seleccionable\) fail\(422, 'FILA_NO_CONFIRMABLE'/)
})

console.log('OK: pareja recíproca exacta, 3/4 días, céntimos, ambigüedad, literal/IBAN propios, P1 por tipo y reserva de proveedor verificados con fixtures sintéticas.')
