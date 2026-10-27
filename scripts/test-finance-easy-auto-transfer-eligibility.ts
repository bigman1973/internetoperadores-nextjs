import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { selectBilateralTransfers, hasTransferBankCue, calendarDistanceDays, sha256Canonical, EASY_AUTO_ORIGIN, type EasyAutoMovement } from '../lib/finanzas/easy-auto-core'

const source = readFileSync(resolve(__dirname, '../lib/finanzas/easy-auto-core.ts'), 'utf8')
const selectedSource = source.match(/export function selectBilateralTransfers\([\s\S]*?\n}\n/)?.[0]
const fingerprint = source.match(/function pairFingerprint\([\s\S]*?\n}\n/)?.[0]
assert(selectedSource && fingerprint)
const oldLoop = `const possible: Array<readonly [EasyAutoMovement, EasyAutoMovement]> = []
  for (let leftIndex = 0; leftIndex < movements.length; leftIndex += 1) {
    const left = movements[leftIndex]
    if (!left || !Number.isSafeInteger(left.importeCentimos) || left.importeCentimos === 0 || !hasTransferBankCue(left)) continue
    for (let rightIndex = leftIndex + 1; rightIndex < movements.length; rightIndex += 1) {
      const right = movements[rightIndex]
      if (!right || !Number.isSafeInteger(right.importeCentimos) || right.importeCentimos === 0 || !hasTransferBankCue(right)) continue
      if (left.cuentaId === right.cuentaId || left.importeCentimos + right.importeCentimos !== 0) continue
      if (calendarDistanceDays(left.fecha, right.fecha) > 3) continue
      possible.push([left, right])
    }
  }
  `
const historical = selectedSource.replace(/  \/\/ Eligibility[\s\S]*?(?=  const degrees)/, '  ' + oldLoop)
assert.notEqual(historical, selectedSource)
let cueCalls = 0
function compile(body: string) {
  return vm.runInNewContext(ts.transpileModule(fingerprint + '\n' + body.replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText + '\nselectBilateralTransfers;', {
    hasTransferBankCue: (movement: EasyAutoMovement) => { cueCalls++; return hasTransferBankCue(movement) },
    calendarDistanceDays, sha256Canonical, EASY_AUTO_ORIGIN,
  }) as typeof selectBilateralTransfers
}
const original = compile(historical), indexed = compile(selectedSource)
const m = (id: string, account: string, amount: number, day: string, text = 'Transferència interna'): EasyAutoMovement => ({
  id, cuentaId: account, importeCentimos: amount, fecha: day, versionB4: 1, concepto: text,
  referencia: null, infoAdicional: null, tercero: null, bancoCuenta: null,
})
const fixtures: EasyAutoMovement[][] = [
  [m('a', 'one', -100, '2026-01-01'), m('b', 'two', 100, '2026-01-04')],
  [m('a', 'one', -100, '2026-01-01'), m('b', 'two', 100, '2026-01-05')],
  [m('a', 'one', -100, '2026-01-01'), m('b', 'one', 100, '2026-01-01')],
  [m('a', 'one', -100, '2026-01-01'), m('b', 'two', 100, '2026-01-01'), m('c', 'three', 100, '2026-01-01')],
  [m('a', 'one', -100, '2026-01-01'), m('b', 'two', 100, '2026-01-01', 'Factura'), m('z', 'three', 0, '2026-01-01'), m('nan', 'four', NaN, '2026-01-01')],
]
fixtures.push(Array.from({ length: 320 }, (_, i) => m(`synthetic-${i}`, `account-${i % 5}`, (i % 2 ? 1 : -1) * (100 + i % 40), `2026-01-${String(i % 27 + 1).padStart(2, '0')}`, i % 3 ? 'TRASPASO' : 'Factura')))
for (const rows of fixtures) {
  assert.equal(JSON.stringify(indexed(rows)), JSON.stringify(original(rows)), 'all candidates, hashes, sorting and control labels match the historical selector')
  assert.equal(JSON.stringify(selectBilateralTransfers(rows)), JSON.stringify(original(rows)))
}
cueCalls = 0
original(fixtures[fixtures.length - 1])
const previousCalls = cueCalls
cueCalls = 0
indexed(fixtures[fixtures.length - 1])
assert.equal(cueCalls, 320, 'normalize once per eligible integer/nonzero source')
assert(previousCalls > cueCalls)
assert.equal(JSON.stringify(indexed([])), '[]')
console.log('OK: transfer selector identical to historical rules; 320 sources normalize 320 times, ownership/balance controls unchanged')
