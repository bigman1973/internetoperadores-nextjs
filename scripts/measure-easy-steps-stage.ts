import 'dotenv/config'
import assert from 'node:assert/strict'
import prisma from '../lib/prisma'
import { readCountersTx, readP2CountersTx } from '../lib/finanzas/easy-counterparty-db'
import { parseCounterpartyReadInput } from '../lib/finanzas/easy-counterparty-core'

/**
 * Staging-only aggregate measurement. It is deliberately read-only SQL and does
 * not initialize P1, create receipts, change B4, access documents or call APIs.
 * Run only after the parent migrations through the private staging runner.
 */
const input = parseCounterpartyReadInput({ desde: '2026-01-01', hasta: '2026-10-08', limit: '25', offset: '0', sentido: 'TODOS' })
async function main() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 obligatorio')
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'No ejecutar esta medición en producción')
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }, 'Sólo staging aislado')
  const ready = await prisma.$queryRaw<Array<{ p1: boolean }>>`SELECT to_regclass('decisiones_tercero_modo_facil') IS NOT NULL AS p1`
  assert.equal(ready[0]?.p1, true, 'Aplicar DDL P1 antes de medir staging')
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    const [paso1, paso2, meta] = await Promise.all([
      readCountersTx(tx, input, { withDecisions: true, withAccountProof: false }),
      readP2CountersTx(tx, input),
      tx.$queryRaw<Array<{ snapshot: string; txro: string }>>`SELECT transaction_timestamp()::text AS snapshot,current_setting('transaction_read_only') AS txro LIMIT 1`,
    ])
    assert.equal(meta[0]?.txro, 'on', 'La medición stage debe ser sólo lectura')
    return { schema: 'EASY_STEPS_STAGE_AGGREGATE_V1', observedAt: meta[0]?.snapshot, window: { desde: input.desde, hasta: input.hasta }, paso1, paso2, safety: { readOnly: true, noDml: true, noRows: true } }
  }, { isolationLevel: 'RepeatableRead', timeout: 60_000 })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }).finally(() => prisma.$disconnect())
