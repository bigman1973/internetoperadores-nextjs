/* Pruebas puras del lector de prueba manual de traspasos: sin BD, red ni DML. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { readManualOwnAccountProofTx } from '../lib/finanzas/conciliar-own-account-proof-db'

type Query = { sql: string }

function reader(...responses: unknown[]) {
  const queries: Query[] = []
  return {
    queries,
    tx: {
      async $queryRaw<T>(query: Query): Promise<T> {
        queries.push(query)
        const next = responses.shift()
        if (next === undefined) throw new Error('RESPUESTA_DE_PRUEBA_FALTANTE')
        return next as T
      },
    },
  }
}

function assertReadOnly(queries: readonly Query[]) {
  for (const query of queries) {
    assert.equal(classifyPrisma5RawSqlStatement([query as never]), 'read_only')
    assert.doesNotMatch(query.sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i)
  }
}

test('sin la tabla revocable, la atestación humana auditada y vigente acredita sólo las cuentas solicitadas', async () => {
  const fake = reader(
    [{ found: null }],
    [{ accountId: 'synthetic-attested-a' }, { accountId: 'synthetic-attested-b' }],
  )
  const result = await readManualOwnAccountProofTx(fake.tx, ['synthetic-attested-a', 'synthetic-attested-b', 'synthetic-not-attested'])
  assert.equal(result.tableAvailable, false)
  assert.deepEqual([...result.proof.accountIds].sort(), ['synthetic-attested-a', 'synthetic-attested-b'])
  assert.equal(fake.queries.length, 2)
  assert.match(fake.queries[1]!.sql, /atestaciones_cuenta_auto_modo_facil/)
  assert.match(fake.queries[1]!.sql, /confirmacion_titularidad_io=true/)
  assert.match(fake.queries[1]!.sql, /p\.estado='ACTIVA'/)
  assertReadOnly(fake.queries)
})

test('la declaración actual es autoridad exclusiva: una revocación, duplicado o ausencia no puede reaparecer mediante atestación histórica', async () => {
  const fake = reader(
    [{ found: 'public.declaraciones_titularidad_modo_facil' }],
    [
      { accountId: 'synthetic-declared', version: 2, state: 'DECLARADA', confirmationDeclared: true, sameVersionCount: 1 },
      { accountId: 'synthetic-revoked', version: 3, state: 'REVOCADA', confirmationDeclared: true, sameVersionCount: 1 },
      { accountId: 'synthetic-duplicate', version: 4, state: 'DECLARADA', confirmationDeclared: true, sameVersionCount: 2 },
    ],
  )
  const result = await readManualOwnAccountProofTx(fake.tx, ['synthetic-declared', 'synthetic-revoked', 'synthetic-duplicate', 'synthetic-fallback'])
  assert.equal(result.tableAvailable, true)
  assert.deepEqual([...result.proof.accountIds].sort(), ['synthetic-declared'])
  assert.equal(fake.queries.length, 2)
  assertReadOnly(fake.queries)
})

console.log('OK: autoridad de declaración/revocación y fallback auditado sólo para esquema antiguo verificados sin BD.')
