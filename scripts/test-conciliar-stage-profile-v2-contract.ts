/* Derivación de perfiles Conciliar V2: puro, sin archivos privados, BD ni API. */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  C4_REMITTANCE_MODE,
  PRODUCTION_GOLDEN_AMENDMENT_IDS,
  STAGE_OVERRIDE_IDS,
  deriveAuthorizedProductionGolden,
  deriveAuthorizedStageProfile,
  productionGoldenIsAuthorizedDerivative,
  stageProfileIsExactDerivative,
} from './areas/conciliar/stage-profile-core'

const cpIds = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15']
function original() {
  return {
    schema: 'CONCILIAR_RELEASE_REGRESSION_V1', asOf: 'synthetic',
    cases: cpIds.map(caseId => ({
      caseId, owner: 'CP', mode: caseId === 'C3' || caseId === 'C7' || caseId === 'C8' || caseId === 'P7' ? 'ABSENT_CONFIRMED' : 'EXACT',
      selector: { stableSelector: caseId },
      expect: caseId === 'C4'
        ? { tab: 'COBROS', color: 'VERDE', group: 'REMESAS', remittanceComposition: { lineCount: 9, sumCents: 900, exact: true } }
        : caseId === 'C2' ? { tab: 'COBROS', color: 'VERDE', documentReference: 'synthetic-c2' }
          : caseId === 'C3' || caseId === 'C7' || caseId === 'C8' || caseId === 'P7' ? { b4Confirmed: true, absentAllTabs: true }
            : { tab: 'COBROS', color: 'VERDE', marker: caseId },
    })),
    supplementalCases: [
      { caseId: 'C30', mode: 'EXACT', selector: { stableSelector: 'C30' }, expect: { color: 'VERDE', confirmingEquation: { nominalCents: 10, deductionsCents: [], netCents: 10 } } },
      { caseId: 'P31', mode: 'EXACT', selector: { stableSelector: 'P31' }, expect: { tab: 'PAGOS', group: 'TARJETA', allowedColors: ['VERDE', 'AMBAR', 'ROJO'] } },
      ...['P32', 'P33', 'P34', 'P35'].map(caseId => ({ caseId, mode: 'EXACT', selector: { stableSelector: caseId }, expect: { group: 'TARJETA' } })),
    ],
    globalCases: ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'],
  }
}
function item(document: any, caseId: string) { return [...document.cases, ...document.supplementalCases].find((value: any) => value.caseId === caseId) }

test('new production golden changes only C1/P1/C4 and preserves selectors plus every other case', () => {
  const baseline = original()
  const derived = deriveAuthorizedProductionGolden(baseline)
  assert.ok(derived)
  assert.deepEqual(PRODUCTION_GOLDEN_AMENDMENT_IDS, ['C1', 'P1', 'C4'])
  for (const caseId of ['C1', 'P1']) assert.deepEqual({ mode: item(derived, caseId).mode, expect: item(derived, caseId).expect }, { mode: 'ABSENT_CONFIRMED', expect: { b4Confirmed: true, absentAllTabs: true } })
  assert.deepEqual(item(derived, 'C4').expect, { tab: 'COBROS', group: 'REMESAS', remittancePreflight: C4_REMITTANCE_MODE })
  for (const caseId of [...cpIds, 'C30', 'P31', 'P32', 'P33', 'P34', 'P35']) {
    assert.deepEqual(item(derived, caseId).selector, item(baseline, caseId).selector)
  }
  assert.equal(productionGoldenIsAuthorizedDerivative(baseline, derived), true)
  const unauthorized = JSON.parse(JSON.stringify(derived)); item(unauthorized, 'C5').expect.color = 'AMBAR'
  assert.equal(productionGoldenIsAuthorizedDerivative(baseline, unauthorized), false)
})

test('STAGE is exactly eight documented operational overrides from new production golden', () => {
  const production = deriveAuthorizedProductionGolden(original())!
  const stage = deriveAuthorizedStageProfile(production)!
  assert.deepEqual(STAGE_OVERRIDE_IDS, ['C1', 'P1', 'C2', 'C3', 'C7', 'C8', 'P7', 'P31'])
  for (const caseId of ['C1', 'P1', 'C3', 'C7', 'C8', 'P7']) {
    assert.deepEqual({ mode: item(stage, caseId).mode, expect: item(stage, caseId).expect }, { mode: 'PENDING_VISIBLE', expect: { b4Confirmed: false, visible: true } })
  }
  for (const caseId of ['C2', 'P31']) assert.deepEqual({ mode: item(stage, caseId).mode, expect: item(stage, caseId).expect }, { mode: 'ABSENT_CONFIRMED', expect: { b4Confirmed: true, absentAllTabs: true } })
  assert.deepEqual(item(stage, 'C4'), item(production, 'C4'))
  assert.equal(stageProfileIsExactDerivative(production, stage), true)
  const selectorChanged = JSON.parse(JSON.stringify(stage)); item(selectorChanged, 'C1').selector.stableSelector = 'changed'
  assert.equal(stageProfileIsExactDerivative(production, selectorChanged), false)
  const unrelated = JSON.parse(JSON.stringify(stage)); item(unrelated, 'P2').expect.color = 'AMBAR'
  assert.equal(stageProfileIsExactDerivative(production, unrelated), false)
})

console.log('OK: Golden PROD C1/P1/C4 y STAGE de ocho overrides exactos, sin cambios de selector ni G1–G7.')
