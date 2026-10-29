/*
 * Ensayo STAGING de traspasos propios: reconstruye únicamente dentro de una
 * transacción SERIALIZABLE abortada intencionalmente. No confirma, no enlaza,
 * no sincroniza ni usa proveedores. La salida se limita a agregados/booleanos.
 *
 * CONCILIAR_TRANSFER_STAGING_REHEARSAL=1 npx tsx scripts/test-conciliar-transfer-staging-rehearsal.ts
 */
import { Prisma } from '@prisma/client'
import { parse } from 'dotenv'
import { lstatSync, readFileSync } from 'node:fs'
import { URL } from 'node:url'

const ROOT = '/home/ubuntu/internetoperadores-nextjs-margin'
const EXTERNAL_ENV = '/home/ubuntu/finanzas-b1-20261022/staging-private.env'
const MAX_ENV_BYTES = 32 * 1024

class ExpectedRollback extends Error {
  constructor(readonly value: RehearsalInsideTransaction) { super('CONCILIAR_TRANSFER_REHEARSAL_ROLLBACK') }
}

type ProjectionAggregate = Readonly<{
  tab: 'COBROS' | 'PAGOS'
  color: 'AMBAR' | 'VERDE'
  count: number
}>
type LedgerAggregate = Readonly<{
  operations: number
  links: number
  thirdParties: number
  movementStates: number
  projections: number
  operationsHash: string
  linksHash: string
  thirdPartiesHash: string
  movementStatesHash: string
  projectionsHash: string
}>
type RehearsalInsideTransaction = Readonly<{
  rebuiltRows: number
  rebuiltEmitted: number
  before: readonly ProjectionAggregate[]
  after: readonly ProjectionAggregate[]
  privateExamplesByDateAndMagnitudeValidated: true
  greenPairsRevalidated: true
  amberRowsNonActionable: true
  identifiedReviewRows: number
  financialStateUnchangedInsideRollback: true
}>
type RehearsalOutput = Readonly<{
  stagingOnly: true
  rollbackObserved: true
  rollbackVerified: true
  financialStateUnchanged: true
  rebuiltRows: number
  rebuiltEmitted: number
  before: readonly ProjectionAggregate[]
  insideRollback: readonly ProjectionAggregate[]
  afterRollback: readonly ProjectionAggregate[]
  privateExamplesByDateAndMagnitudeValidated: true
  greenPairsRevalidated: true
  amberRowsNonActionable: true
  identifiedReviewRows: number
}>

function fail(code: string): never { throw new Error(code) }

function safeExternalEnvironment(): Record<string, string> {
  if (process.env.CONCILIAR_TRANSFER_STAGING_REHEARSAL !== '1') fail('CONCILIAR_TRANSFER_REHEARSAL_FLAG_REQUIRED')
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(EXTERNAL_ENV) } catch { fail('CONCILIAR_TRANSFER_REHEARSAL_ENV_UNAVAILABLE') }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > MAX_ENV_BYTES) {
    fail('CONCILIAR_TRANSFER_REHEARSAL_ENV_UNSAFE')
  }
  let local: Record<string, string>, external: Record<string, string>
  try {
    local = parse(readFileSync(`${ROOT}/.env`, 'utf8'))
    external = parse(readFileSync(EXTERNAL_ENV, 'utf8'))
  } catch { fail('CONCILIAR_TRANSFER_REHEARSAL_ENV_UNREADABLE') }
  if (!external.DATABASE_URL || local.DATABASE_URL !== external.DATABASE_URL) fail('CONCILIAR_TRANSFER_REHEARSAL_ENV_TARGET_MISMATCH')
  const values = { ...local, ...external }
  const databaseUrl = values.DATABASE_URL
  let target: URL
  try { target = new URL(databaseUrl) } catch { fail('CONCILIAR_TRANSFER_REHEARSAL_ENV_INVALID') }
  if (values.FINANCE_STAGING_SANDBOX !== '1' || values.VERCEL_ENV === 'production' || values.IO_PRODUCTION_READ_ONLY === '1'
    || ![undefined, '0'].includes(values.FINANCE_EASY_PRODUCTION_ENABLED) || ![undefined, '0'].includes(values.FINANCE_MODEL_PRODUCTION_ENABLED)
    || !['postgres:', 'postgresql:'].includes(target.protocol) || target.pathname !== '/io_staging_finanzas'
    || decodeURIComponent(target.username) !== 'io_staging_finanzas') {
    fail('CONCILIAR_TRANSFER_REHEARSAL_ENV_INVALID')
  }
  for (const key of ['DATABASE_URL', 'FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'IO_PRODUCTION_READ_ONLY', 'FINANCE_EASY_PRODUCTION_ENABLED', 'FINANCE_MODEL_PRODUCTION_ENABLED'] as const) {
    if (process.env[key] !== undefined && process.env[key] !== values[key]) fail('CONCILIAR_TRANSFER_REHEARSAL_ENV_MISMATCH')
  }
  return values
}

function install(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) process.env[key] = value
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameFinancialLedger(left: LedgerAggregate, right: LedgerAggregate): boolean {
  return left.operations === right.operations && left.links === right.links
    && left.thirdParties === right.thirdParties && left.movementStates === right.movementStates
    && left.operationsHash === right.operationsHash && left.linksHash === right.linksHash
    && left.thirdPartiesHash === right.thirdPartiesHash && left.movementStatesHash === right.movementStatesHash
}

function aggregates(rows: readonly { tab: string; color: string; count: number | bigint }[]): ProjectionAggregate[] {
  return rows.flatMap(row => (row.tab === 'COBROS' || row.tab === 'PAGOS') && (row.color === 'AMBAR' || row.color === 'VERDE')
    ? [{ tab: row.tab, color: row.color, count: Number(row.count) }] as ProjectionAggregate[]
    : []).sort((left, right) => `${left.tab}:${left.color}`.localeCompare(`${right.tab}:${right.color}`))
}

async function projectionAggregates(tx: any): Promise<ProjectionAggregate[]> {
  const rows = await (tx as Prisma.TransactionClient).$queryRaw<Array<{ tab: string; color: string; count: number | bigint }>>(Prisma.sql`
    SELECT tab,color,COUNT(*)::int AS count
    FROM conciliar_proyecciones
    WHERE grupo='TRASPASOS_PROPIOS' AND tab IN ('COBROS','PAGOS') AND color IN ('AMBAR','VERDE')
    GROUP BY tab,color
    ORDER BY tab,color
    LIMIT 4
  `)
  return aggregates(rows)
}

async function ledgerAggregate(tx: any): Promise<LedgerAggregate> {
  const rows = await (tx as Prisma.TransactionClient).$queryRaw<Array<LedgerAggregate>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*)::int FROM operaciones_justificacion_b4) AS operations,
      (SELECT COUNT(*)::int FROM vinculos_movimiento_documento) AS links,
      (SELECT COUNT(*)::int FROM decisiones_tercero_modo_facil) AS "thirdParties",
      (SELECT COUNT(*)::int FROM estado_justificacion_movimientos) AS "movementStates",
      (SELECT COUNT(*)::int FROM conciliar_proyecciones) AS projections,
      (SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM operaciones_justificacion_b4 t) AS "operationsHash",
      (SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM vinculos_movimiento_documento t) AS "linksHash",
      (SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM decisiones_tercero_modo_facil t) AS "thirdPartiesHash",
      (SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id),'')) FROM estado_justificacion_movimientos t) AS "movementStatesHash",
      (SELECT md5(COALESCE(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id),'')) FROM conciliar_proyecciones t) AS "projectionsHash"
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) fail('CONCILIAR_TRANSFER_REHEARSAL_LEDGER_MISSING')
  const hashes = [row.operationsHash, row.linksHash, row.thirdPartiesHash, row.movementStatesHash, row.projectionsHash]
  if (hashes.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{32}$/.test(hash))) fail('CONCILIAR_TRANSFER_REHEARSAL_HASH_INVALID')
  return {
    operations: Number(row.operations), links: Number(row.links), thirdParties: Number(row.thirdParties),
    movementStates: Number(row.movementStates), projections: Number(row.projections),
    operationsHash: row.operationsHash, linksHash: row.linksHash, thirdPartiesHash: row.thirdPartiesHash,
    movementStatesHash: row.movementStatesHash, projectionsHash: row.projectionsHash,
  }
}

async function validatePrivateTransferExamples(tx: any): Promise<Readonly<{
  greenPairsRevalidated: true
  amberRowsNonActionable: true
  identifiedReviewRows: number
}>> {
  const rows = await (tx as Prisma.TransactionClient).$queryRaw<Array<{
    reviewRows: number | bigint
    greenPairsRevalidated: boolean
    amberRowsNonActionable: boolean
  }>>(Prisma.sql`
    WITH review AS (
      SELECT p.movimiento_id AS movimiento_id,p.color,p.seleccionable,
        m.cuenta_id AS cuenta_id,m.fecha_operacion::date AS fecha,p.importe_centimos AS importe_centimos
      FROM conciliar_proyecciones p
      JOIN movimientos_bancarios m ON m.id=p.movimiento_id
      WHERE p.grupo='TRASPASOS_PROPIOS' AND p.source->>'kind'='PENDIENTE_FACTURA_EMITIDA'
        AND p.color IN ('AMBAR','VERDE')
    ), green AS (
      SELECT r.movimiento_id,COUNT(o.movimiento_id)::int AS counterparts
      FROM review r
      LEFT JOIN review o ON o.movimiento_id<>r.movimiento_id AND o.color='VERDE'
        AND o.cuenta_id<>r.cuenta_id AND o.importe_centimos=-r.importe_centimos
        AND abs(o.fecha-r.fecha)<=3
      WHERE r.color='VERDE'
      GROUP BY r.movimiento_id
    )
    SELECT
      (SELECT COUNT(*)::int FROM review) AS "reviewRows",
      COALESCE((SELECT bool_and(counterparts=1) FROM green),true) AS "greenPairsRevalidated",
      COALESCE((SELECT bool_and(seleccionable=false) FROM review WHERE color='AMBAR'),true) AS "amberRowsNonActionable"
    LIMIT 1
  `)
  const row = rows[0]
  if (!row || !Number.isSafeInteger(Number(row.reviewRows)) || Number(row.reviewRows) < 1) fail('CONCILIAR_TRANSFER_REHEARSAL_PRIVATE_CASES_INVALID')
  if (row.greenPairsRevalidated !== true) fail('CONCILIAR_TRANSFER_REHEARSAL_GREEN_PAIR_INVALID')
  if (row.amberRowsNonActionable !== true) fail('CONCILIAR_TRANSFER_REHEARSAL_AMBER_ACTIONABLE')
  return { greenPairsRevalidated: true, amberRowsNonActionable: true, identifiedReviewRows: Number(row.reviewRows) }
}

async function main(): Promise<void> {
  install(safeExternalEnvironment())
  const [{ default: prisma }, { assertPrototypeStaging }, { rebuildConciliarProjectionTx }] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/finanzas/prototype-staging'),
    import('../lib/finanzas/conciliar-db'),
  ])
  try {
    await assertPrototypeStaging()
    const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>(Prisma.sql`SELECT current_database() AS db,current_user AS role LIMIT 1`)
    if (identity.length !== 1 || identity[0]?.db !== 'io_staging_finanzas' || identity[0]?.role !== 'io_staging_finanzas') fail('CONCILIAR_TRANSFER_REHEARSAL_IDENTITY_REQUIRED')

    const before = await projectionAggregates(prisma)
    const ledgerBefore = await ledgerAggregate(prisma)
    let rehearsal: ExpectedRollback | null = null
    try {
      await prisma.$transaction(async tx => {
        const insideBefore = await projectionAggregates(tx)
        const ledgerInsideBefore = await ledgerAggregate(tx)
        const rebuilt = await rebuildConciliarProjectionTx(tx, null)
        const insideAfter = await projectionAggregates(tx)
        const ledgerInsideAfter = await ledgerAggregate(tx)
        if (!sameFinancialLedger(ledgerInsideBefore, ledgerInsideAfter)) fail('CONCILIAR_TRANSFER_REHEARSAL_FINANCIAL_STATE_CHANGED')
        const examples = await validatePrivateTransferExamples(tx)
        throw new ExpectedRollback({
          rebuiltRows: rebuilt.rows,
          rebuiltEmitted: rebuilt.emitted,
          before: insideBefore,
          after: insideAfter,
          privateExamplesByDateAndMagnitudeValidated: true,
          ...examples,
          financialStateUnchangedInsideRollback: true,
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 })
    } catch (error) {
      if (error instanceof ExpectedRollback) rehearsal = error
      else throw error
    }
    if (!rehearsal) fail('CONCILIAR_TRANSFER_REHEARSAL_ROLLBACK_MISSING')

    const afterRollback = await projectionAggregates(prisma)
    const ledgerAfterRollback = await ledgerAggregate(prisma)
    if (!same(before, afterRollback) || !same(ledgerBefore, ledgerAfterRollback)) fail('CONCILIAR_TRANSFER_REHEARSAL_ROLLBACK_UNVERIFIED')
    const output: RehearsalOutput = {
      stagingOnly: true,
      rollbackObserved: true,
      rollbackVerified: true,
      financialStateUnchanged: true,
      rebuiltRows: rehearsal.value.rebuiltRows,
      rebuiltEmitted: rehearsal.value.rebuiltEmitted,
      before,
      insideRollback: rehearsal.value.after,
      afterRollback,
      privateExamplesByDateAndMagnitudeValidated: rehearsal.value.privateExamplesByDateAndMagnitudeValidated,
      greenPairsRevalidated: rehearsal.value.greenPairsRevalidated,
      amberRowsNonActionable: rehearsal.value.amberRowsNonActionable,
      identifiedReviewRows: rehearsal.value.identifiedReviewRows,
    }
    console.log(JSON.stringify(output))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  const code = error instanceof Error ? error.message : ''
  console.error(/^CONCILIAR_TRANSFER_REHEARSAL_[A-Z0-9_]+$/.test(code) ? code : 'CONCILIAR_TRANSFER_REHEARSAL_FAILED')
  process.exitCode = 1
})
