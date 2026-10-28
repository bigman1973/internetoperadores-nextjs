import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

async function main() {
  const source = readFileSync(resolve(__dirname, '../lib/finanzas/conciliar-confirming.ts'), 'utf8')
  const functionSource = source.match(/export async function readConciliarConfirmingCandidates\([\s\S]*?\n}\n/)?.[0]
  assert(functionSource)
  let legacyReads = 0
  let movements = [{ id: 'synthetic-covered' }]
  const c11 = { candidates: [{ movimientoId: 'synthetic-covered', id: 'synthetic-liquidation' }], warningCodes: [] }
  const adapted = vm.runInNewContext(ts.transpileModule(functionSource.replace(/^export /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText + '\nreadConciliarConfirmingCandidates;', {
    readConfirmingLiquidationCandidates: async () => c11,
    withReadTransaction: async (db: unknown, fn: (tx: unknown) => unknown) => fn(db),
    readMovements: async () => ({ movements }),
    readStoredDocumentalData: async () => { legacyReads += 1; return { documents: [], lines: [], invoices: [], b4: [] } },
    buildConciliarConfirmingCandidates: (input: { movimientos: { id: string }[] }) => {
      assert.equal(input.movimientos.length, 1)
      assert.equal(input.movimientos[0].id, 'synthetic-uncovered')
      return { candidates: [], warningCodes: [] }
    },
  }) as (db: unknown, options: unknown) => Promise<{ candidates: unknown[] }>
  const onlyCovered = await adapted({}, { movimientoIds: ['synthetic-covered'] })
  assert.equal(legacyReads, 0, 'C11 live validations already describe the movement; legacy is not an authority')
  assert.equal(onlyCovered.candidates.length, 1)
  movements = [{ id: 'synthetic-covered' }, { id: 'synthetic-uncovered' }]
  const mixed = await adapted({}, { allRebuild: true })
  assert.equal(legacyReads, 1, 'uncovered movements retain the conservative legacy diagnostic')
  assert.equal(mixed.candidates.length, 1)
  console.log('OK: C11 precedence before legacy matching, no omitted uncovered movements, no cache or financial mutation')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
