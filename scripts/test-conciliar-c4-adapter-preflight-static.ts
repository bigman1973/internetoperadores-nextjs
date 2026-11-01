/* C4 adaptador: contrato estático, sin PostgreSQL, red ni datos reales. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const adapter = readFileSync('scripts/areas/conciliar/adapter.ts', 'utf8')
const core = readFileSync('scripts/areas/conciliar/case-core.ts', 'utf8')

test('el adaptador usa el lector actual de preflight FI→ISP→remesa y no fabrica N', () => {
  assert.match(adapter, /import \{ readCurrentArea3RemittanceMapPreflightsTx \} from '\.\.\/\.\.\/\.\.\/lib\/finanzas\/area3-remittance-map-db'/)
  assert.match(adapter, /const currentRemittanceMap = await readCurrentArea3RemittanceMapPreflightsTx/)
  assert.match(adapter, /currentRemittanceMap\.preflights\.get\(row\.source\.propuestaId\)/)
  assert.match(adapter, /remittanceMapPreflight: remittanceMapPreflight \?\? null/)
  assert.doesNotMatch(adapter, /Falta enlazar \d+ recibos/)
  assert.doesNotMatch(adapter, /lineCount:\s*167/)
  assert.doesNotMatch(adapter, /missingReceiptCount:\s*179/)
})

test('el núcleo C4 compara el motivo con missingReceiptCount y no permite allowedColors general', () => {
  assert.match(core, /const expectedReason = `Falta enlazar \$\{evidence\.missingReceiptCount\} recibos\.`/)
  assert.match(core, /input\.caseId !== 'C4'/)
  assert.match(core, /expectation\.allowedColors !== undefined/)
})

console.log('OK: C4 recibe el preflight actual de servidor y compone ÁMBAR sólo con N real.')
