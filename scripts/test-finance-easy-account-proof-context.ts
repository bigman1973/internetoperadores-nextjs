import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync('lib/finanzas/easy-counterparty-db.ts', 'utf8')

test('las dos lecturas de titularidad siguen la identidad de la base validada', () => {
  const guard = "p.entorno=CASE WHEN current_database()='io_staging_finanzas' THEN 'STAGING' ELSE 'PRODUCTION' END"
  assert.equal(source.split(guard).length - 1, 2)
  assert.equal(source.includes("p.entorno='STAGING'"), false)
  assert.match(source, /await assertFinanceEasyRuntime\(/)
})
