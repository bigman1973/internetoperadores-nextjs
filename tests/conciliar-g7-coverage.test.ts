import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { CONCILIAR_PRECHECK_KINDS } from '../lib/finanzas/conciliar-precheck-kinds'
import { assertConciliarG7GreenDecision, concludeConciliarG7Coverage, newConciliarG7Coverage } from '../lib/finanzas/conciliar-g7-coverage'

test('G7 cubre las nueve familias en el switch puro y no aprueba una foto sin población o verde', () => {
  assert.equal(CONCILIAR_PRECHECK_KINDS.length, 9)
  const precheck = readFileSync('lib/finanzas/conciliar-precheck.ts', 'utf8')
  for (const kind of CONCILIAR_PRECHECK_KINDS.filter(kind => kind !== 'PENDIENTE_FACTURA_EMITIDA')) {
    assert.match(precheck, new RegExp(`case '${kind}':`))
  }
  assert.match(precheck, /row\.source\.kind==='PENDIENTE_FACTURA_EMITIDA'/)

  const empty = concludeConciliarG7Coverage(newConciliarG7Coverage())
  assert.equal(empty.ok, false)
  assert.equal(empty.totalPopulation, 0)

  const classes = newConciliarG7Coverage()
  classes.COMISION_BANCARIA.population = 1
  classes.COMISION_BANCARIA.green = 1
  classes.COMISION_BANCARIA.checked = 1
  const observed = concludeConciliarG7Coverage(classes)
  assert.equal(observed.ok, true)
  assert.ok(observed.classesWithoutPopulation.includes('PAGO_TICKET_B5'))
  assert.equal(observed.allClassesPopulated, false)
  assert.throws(() => assertConciliarG7GreenDecision({ schema: 'CONCILIAR_PRECHECK_V1', confirmable: false, mode: 'BLOQUEADA', code: 'FUENTE_CAMBIADA', motivo: 'bloqueada' }))
})
