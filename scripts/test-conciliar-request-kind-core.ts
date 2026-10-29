/* Tipos documentales Conciliar: fixtures sintéticas, sin Prisma, BD, red, B4 ni build. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyConciliarRequestKind,
  isExplicitConciliarBankFee,
  normalizeConciliarRequestText,
  type ConciliarRequestKindInput,
} from '../lib/finanzas/conciliar-request-kind-core'
import { presentConciliarRequestKind } from '../lib/finanzas/conciliar-request-kind-presentation'
import { conciliarRequestKindUiCopy } from '../components/finanzas/conciliar/conciliar-request-kind-ui-helpers'

function classify(overrides: Partial<ConciliarRequestKindInput> = {}) {
  const result = classifyConciliarRequestKind({ importeCentimos: -12345, concepto: 'Cargo sintético', ...overrides })
  assert.ok(result, 'Un cargo sintético válido debe recibir una decisión cerrada.')
  return result
}

test('normaliza acentos, espacios y controles de forma idempotente sin alterar semántica', () => {
  const normalized = normalizeConciliarRequestText('  CÀRREC\u0000  amortització   préstec  ')
  assert.equal(normalized, 'CARREC AMORTITZACIO PRESTEC')
  assert.equal(normalizeConciliarRequestText(normalized), normalized)
})

test('P13: impuesto queda rojo y pide justificante del modelo, no una factura genérica', () => {
  const result = classify({ concepto: 'Autoliquidación de impuesto sintético' })
  assert.deepEqual(result, {
    kind: 'IMPUESTOS', color: 'ROJO', group: 'IMPUESTOS', reasonCode: 'IMPUESTO_SIN_JUSTIFICANTE',
    motive: 'Pedir justificante del modelo.', requestAction: 'PEDIR_JUSTIFICANTE_MODELO', isParaPedir: true,
    automaticConfirmationForbidden: true, requiresHumanConfirmation: true, suggestedDocumentReference: null,
  })
  assert.doesNotMatch(result.motive, /falta la factura/i)
})

test('P14: préstamo queda rojo y pide el cuadro de amortización aun con acentos catalanes', () => {
  const result = classify({ concepto: 'Càrrec per amortització de préstec' })
  assert.equal(result.kind, 'PRESTAMO')
  assert.equal(result.group, 'PRESTAMOS')
  assert.equal(result.color, 'ROJO')
  assert.equal(result.motive, 'Pedir cuadro de amortización.')
  assert.equal(result.requestAction, 'PEDIR_CUADRO_AMORTIZACION')
})

test('P15: una compra de tarjeta sin documento pide ticket o factura y nunca es seleccionable', () => {
  const core = classify({ concepto: 'Compra comercio sintético', cardInstrument: true })
  const presentation = presentConciliarRequestKind({ importeCentimos: -12345, concepto: 'Compra comercio sintético', cardInstrument: true })
  assert.equal(core.kind, 'TARJETA')
  assert.equal(core.color, 'ROJO')
  assert.equal(core.motive, 'Pedir ticket o factura.')
  assert.equal(core.isParaPedir, true)
  assert.deepEqual(presentation, {
    color: 'ROJO', grupo: 'TARJETA', motivo: 'Pedir ticket o factura.', seleccionable: false,
    isParaPedir: true, suggestedDocumentReference: null, requestAction: 'PEDIR_TICKET_O_FACTURA',
    automaticConfirmationForbidden: true, requiresHumanConfirmation: true,
  })
})

test('P12: nómina exacta de Personal es verde; ausente o ambigua queda ámbar y jamás va a Para pedir', () => {
  const exact = classify({ concepto: 'Transferencia nómina', payrollReview: 'EXACT_PERSONAL' })
  const missing = classify({ concepto: 'Transferencia nómina', payrollReview: 'MISSING_PERSONAL' })
  const ambiguous = classify({ concepto: 'Transferencia nómina', payrollReview: 'AMBIGUOUS_PERSONAL' })
  assert.deepEqual([exact.color, missing.color, ambiguous.color], ['VERDE', 'AMBAR', 'AMBAR'])
  for (const item of [exact, missing, ambiguous]) {
    assert.equal(item.kind, 'NOMINA_PERSONAL')
    assert.equal(item.group, 'NOMINAS')
    assert.equal(item.isParaPedir, false)
    assert.equal(item.requestAction, 'NO_PEDIR')
    assert.doesNotMatch(item.motive, /factura/i)
    assert.equal(item.automaticConfirmationForbidden, true)
  }
})

test('P5/P6: candidatas proveedor sin cierre documental son ámbar, conservan referencia existente y no se vuelven verdes por importe', () => {
  const mismatch = classify({
    concepto: 'Pago factura número distinto', providerReview: 'NUMBER_CONFLICT', providerCandidateReference: 'F-SINTETICA-8',
  })
  const withoutReference = classify({
    concepto: 'Cargo proveedor sin número', providerReview: 'CANDIDATE_WITHOUT_REFERENCE', providerCandidateReference: 'DOC-SINTETICO-3',
  })
  assert.deepEqual(mismatch, {
    kind: 'PROVEEDOR_DOCUMENTADO', color: 'AMBAR', group: 'FACTURA_RECIBIDA', reasonCode: 'PROVEEDOR_NUMERO_NO_COINCIDE',
    motive: 'El número citado no coincide con la factura candidata; revísalo antes de confirmar.', requestAction: 'NO_PEDIR', isParaPedir: false,
    automaticConfirmationForbidden: true, requiresHumanConfirmation: true, suggestedDocumentReference: 'F-SINTETICA-8',
  })
  assert.equal(withoutReference.color, 'AMBAR')
  assert.equal(withoutReference.reasonCode, 'PROVEEDOR_SIN_REFERENCIA')
  assert.equal(withoutReference.suggestedDocumentReference, 'DOC-SINTETICO-3')
})

test('una referencia documental exacta conserva verde sólo como candidata humana; una candidata ambigua no se elige', () => {
  const exact = classify({ providerReview: 'EXACT_DOCUMENT_REFERENCE', providerCandidateReference: 'DOC-SINTETICO-EXACTO' })
  const ambiguous = classify({ providerReview: 'AMBIGUOUS', providerCandidateReference: 'NO-DEBE-MOSTRARSE' })
  assert.equal(exact.color, 'VERDE')
  assert.equal(exact.requestAction, 'NO_PEDIR')
  assert.equal(exact.automaticConfirmationForbidden, true)
  assert.equal(ambiguous.color, 'AMBAR')
  assert.equal(ambiguous.suggestedDocumentReference, null)
})

test('P4: una referencia bancaria sin factura continúa roja y no hereda la excepción ámbar P5', () => {
  const result = classify({ concepto: 'Recibo con referencia documental ausente', providerReview: 'REFERENCE_MISSING' })
  assert.deepEqual(result, {
    kind: 'PROVEEDOR_DOCUMENTADO', color: 'ROJO', group: 'FACTURA_RECIBIDA', reasonCode: 'PROVEEDOR_REFERENCIA_SIN_FACTURA',
    motive: 'El banco cita una factura que no está disponible para este cargo.', requestAction: 'PEDIR_JUSTIFICANTE_GENERAL', isParaPedir: true,
    automaticConfirmationForbidden: true, requiresHumanConfirmation: true, suggestedDocumentReference: null,
  })
})

test('P7/P8: liquidación por emisión y gastos de devoluciones se preservan como gastos bancarios reales', () => {
  for (const concepto of ['Liquidación por emisión', 'Gastos devoluciones de recibos']) {
    const result = classify({ concepto })
    assert.deepEqual([result.kind, result.color, result.group, result.isParaPedir], ['GASTO_BANCO', 'VERDE', 'GASTOS_BANCO', false])
    assert.equal(result.requestAction, 'NO_PEDIR')
  }
})

test('una comisión cero o un texto de tarjeta no se falsifican como gasto bancario verde', () => {
  assert.equal(isExplicitConciliarBankFee({ amountCents: -12345, text: 'Comisión 0,00' }), false)
  assert.equal(isExplicitConciliarBankFee({ amountCents: -12345, text: 'Liquidación por emisión tarjeta' }), false)
  const zero = classify({ concepto: 'Comisión 0,00' })
  const card = classify({ concepto: 'Liquidación por emisión tarjeta' })
  assert.equal(zero.kind, 'DESCONOCIDO')
  assert.equal(zero.color, 'ROJO')
  assert.equal(card.kind, 'TARJETA')
  assert.equal(card.color, 'ROJO')
})

test('un cargo desconocido pide justificante general, no afirma un dogma de factura ausente', () => {
  const result = classify({ concepto: 'Operación externa no tipificada' })
  assert.deepEqual([result.kind, result.color, result.requestAction, result.isParaPedir], ['DESCONOCIDO', 'ROJO', 'PEDIR_JUSTIFICANTE_GENERAL', true])
  assert.equal(result.motive, 'Pedir justificante general del movimiento.')
  assert.doesNotMatch(result.motive, /factura/i)
})

test('el helper de UI propio sólo presenta la acción humana y nunca habilita una confirmación', () => {
  const copy = conciliarRequestKindUiCopy(classify({ concepto: 'Autoliquidación de impuesto sintético' }))
  assert.deepEqual(copy, {
    groupLabel: 'Impuestos', queueLabel: 'Para pedir', requestLabel: 'Pedir justificante del modelo',
    confirmationNotice: 'La conciliación requiere confirmación humana.',
  })
  assert.ok(Object.isFrozen(copy))
})

test('es determinista e idempotente: repetir la misma entrada no añade estado ni cambia la decisión', () => {
  const input: ConciliarRequestKindInput = {
    importeCentimos: -12345, concepto: 'Pago de impuesto sintético', referencia: 'Referencia sintética', infoAdicional: null,
  }
  const first = classifyConciliarRequestKind(input)
  const second = classifyConciliarRequestKind({ ...input })
  assert.deepEqual(second, first)
  assert.ok(Object.isFrozen(first))
  assert.deepEqual(presentConciliarRequestKind(input), presentConciliarRequestKind({ ...input }))
})

test('rechaza un importe no negativo o inseguro sin intentar clasificarlo como pago', () => {
  assert.equal(classifyConciliarRequestKind({ importeCentimos: 0, concepto: 'Impuesto' }), null)
  assert.equal(classifyConciliarRequestKind({ importeCentimos: 12345, concepto: 'Tarjeta' }), null)
  assert.equal(classifyConciliarRequestKind({ importeCentimos: Number.NaN, concepto: 'Préstamo' }), null)
})

console.log(JSON.stringify({
  test: 'conciliar-request-kind-core', databaseOperations: 0, networkCalls: 0,
  verified: ['normalization', 'tax-red', 'loan-red', 'card-red', 'payroll-green-amber', 'provider-amber', 'bank-fees', 'zero-fee-guard', 'unknown-general-proof', 'idempotence', 'invalid-sign'],
}))
