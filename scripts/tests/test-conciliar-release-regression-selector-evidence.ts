import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalLinkedRemittanceSearchText,
  isCanonicalRemittanceSelectorLink,
  selectorSearchableText,
  type CanonicalRemittanceSelectorLink,
} from './conciliar-release-regression-selector-evidence'

const canonicalLink = (remittanceName: string | null | undefined): CanonicalRemittanceSelectorLink => ({
  lineActive: true,
  lineKind: 'DOCUMENTO',
  documentActive: true,
  documentType: 'REMESA',
  operationState: 'APLICADA',
  operationReverted: false,
  movementState: 'JUSTIFICADO',
  remittanceName,
})

test('uses only the exact remittance name from an active, applied and justified B4 link', () => {
  const qualified = canonicalLink('canonical-remittance-name')
  assert.equal(isCanonicalRemittanceSelectorLink(qualified), true)
  assert.equal(canonicalLinkedRemittanceSearchText([qualified, canonicalLink('canonical-remittance-name')]), 'canonical-remittance-name')
})

test('rejects inactive, non-documentary, non-remittance, unapplied, reverted and unconfirmed links', () => {
  const variants: CanonicalRemittanceSelectorLink[] = [
    { ...canonicalLink('rejected-inactive-line'), lineActive: false },
    { ...canonicalLink('rejected-line-kind'), lineKind: 'DIFERENCIA' },
    { ...canonicalLink('rejected-inactive-document'), documentActive: false },
    { ...canonicalLink('rejected-document-type'), documentType: 'FACTURA_EMITIDA' },
    { ...canonicalLink('rejected-operation'), operationState: 'APROBADA' },
    { ...canonicalLink('rejected-reverted'), operationReverted: true },
    { ...canonicalLink('rejected-state'), movementState: 'SIN_DOCUMENTO' },
  ]
  assert.deepEqual(variants.map(isCanonicalRemittanceSelectorLink), [false, false, false, false, false, false, false])
  assert.equal(canonicalLinkedRemittanceSearchText(variants), '')
})

test('keeps bank description separate from additional metadata and the counterparty selector', () => {
  const searchable = selectorSearchableText({
    bankDescription: ['bank-concept', 'bank-reference'],
    linkedRemittances: [canonicalLink('canonical-remittance-name')],
  })
  assert.equal(searchable, 'bank-concept bank-reference canonical-remittance-name')
  assert.equal(searchable.includes('additional-metadata'), false)
  assert.equal(searchable.includes('counterparty-value'), false)
})

console.log('OK: selector evidence accepts only an active canonical B4 remittance name and keeps bank fields scoped.')
