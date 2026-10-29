/*
 * Lectura real STAGING del detalle documental. No se ejecuta sin ambos controles:
 *
 * CONCILIAR_DOCUMENT_DETAIL_STAGING_READONLY=1 \
 * CONCILIAR_DOCUMENT_DETAIL_ACTOR_ID=<actor-B4-válido> \
 * npx tsx scripts/test-conciliar-document-detail-staging-readonly.ts
 *
 * La transacción establece READ ONLY como primera sentencia y la salida no expone
 * rowId, importes, proveedores, documentos, líneas ni errores de base de datos.
 */
import { Prisma } from '@prisma/client'
import { parse } from 'dotenv'
import { lstatSync, readFileSync } from 'node:fs'
import { URL } from 'node:url'

const ROOT = '/home/ubuntu/internetoperadores-nextjs-margin'
const EXTERNAL_ENV = '/home/ubuntu/finanzas-b1-20261022/staging-private.env'
const MAX_ENV_BYTES = 32 * 1024
const FLAG = 'CONCILIAR_DOCUMENT_DETAIL_STAGING_READONLY'
const ACTOR = 'CONCILIAR_DOCUMENT_DETAIL_ACTOR_ID'

type DetailKind = 'CONFIRMING' | 'FACTURA' | 'REMESA'
type Candidate = Readonly<{ kind: DetailKind; rowId: string }>
type BranchAggregate = Readonly<{
  kind: DetailKind
  readerQueries: number
  returnedExpectedKind: boolean
  lines: 'NONE' | 'ONE_OR_MORE'
  exact: boolean
}>
type Output = Readonly<{
  ok: true
  stagingOnly: true
  transactionReadOnly: true
  financialWrites: 0
  selectedBranches: number
  readerQueries: number
  results: readonly BranchAggregate[]
}>

function fail(code: string): never { throw new Error(code) }

function safeExternalEnvironment(): Record<string, string> {
  if (process.env[FLAG] !== '1') fail('DETAIL_STAGING_FLAG_REQUIRED')
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(EXTERNAL_ENV) } catch { fail('DETAIL_STAGING_ENV_UNAVAILABLE') }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > MAX_ENV_BYTES) fail('DETAIL_STAGING_ENV_UNSAFE')
  let local: Record<string, string>, external: Record<string, string>
  try {
    local = parse(readFileSync(`${ROOT}/.env`, 'utf8'))
    external = parse(readFileSync(EXTERNAL_ENV, 'utf8'))
  } catch { fail('DETAIL_STAGING_ENV_UNREADABLE') }
  if (!local.DATABASE_URL || local.DATABASE_URL !== external.DATABASE_URL) fail('DETAIL_STAGING_ENV_TARGET_MISMATCH')
  const values = { ...local, ...external }
  let target: URL
  try { target = new URL(String(values.DATABASE_URL)) } catch { fail('DETAIL_STAGING_ENV_INVALID') }
  if (values.FINANCE_STAGING_SANDBOX !== '1' || values.VERCEL_ENV === 'production' || values.IO_PRODUCTION_READ_ONLY === '1'
    || ![undefined, '0'].includes(values.FINANCE_EASY_PRODUCTION_ENABLED) || ![undefined, '0'].includes(values.FINANCE_MODEL_PRODUCTION_ENABLED)
    || !['postgres:', 'postgresql:'].includes(target.protocol) || target.pathname !== '/io_staging_finanzas' || decodeURIComponent(target.username) !== 'io_staging_finanzas') fail('DETAIL_STAGING_ENV_INVALID')
  for (const key of ['DATABASE_URL', 'FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'IO_PRODUCTION_READ_ONLY', 'FINANCE_EASY_PRODUCTION_ENABLED', 'FINANCE_MODEL_PRODUCTION_ENABLED'] as const) {
    if (process.env[key] !== undefined && process.env[key] !== values[key]) fail('DETAIL_STAGING_ENV_MISMATCH')
  }
  return values
}

function install(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) process.env[key] = value
}

function actorId(): number {
  const value = Number(process.env[ACTOR])
  if (!Number.isSafeInteger(value) || value < 1) fail('DETAIL_STAGING_ACTOR_REQUIRED')
  return value
}

function expected(value: unknown): DetailKind | null {
  return value === 'CONFIRMING' || value === 'FACTURA' || value === 'REMESA' ? value : null
}

async function main(): Promise<void> {
  install(safeExternalEnvironment())
  const actor = actorId()
  const [{ default: prisma }, { assertPrototypeStaging }, { readConciliarDocumentDetail }] = await Promise.all([
    import('../lib/prisma'),
    import('../lib/finanzas/prototype-staging'),
    import('../lib/finanzas/conciliar-document-detail'),
  ])
  try {
    await assertPrototypeStaging()
    const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>(Prisma.sql`SELECT current_database() AS db,current_user AS role LIMIT 1`)
    if (identity.length !== 1 || identity[0]?.db !== 'io_staging_finanzas' || identity[0]?.role !== 'io_staging_finanzas') fail('DETAIL_STAGING_IDENTITY_REQUIRED')
    const output = await prisma.$transaction(async tx => {
      // Must remain the first statement in this transaction: every following
      // projection/source query, including nested reader calls, is rejected if it writes.
      await tx.$queryRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
      const candidates = await tx.$queryRaw<Candidate[]>(Prisma.sql`
        WITH eligible AS (
          SELECT 'CONFIRMING'::text AS kind,p.id
          FROM conciliar_proyecciones p
          WHERE p.source->>'kind'='COBRO_CONFIRMING' AND p.color='VERDE'
          ORDER BY p.updated_at DESC,p.id ASC
          LIMIT 1
        ), supplier AS (
          SELECT 'FACTURA'::text AS kind,p.id
          FROM conciliar_proyecciones p
          WHERE p.source->>'kind'='PAGO_FACTURA_RECIBIDA' AND p.color='VERDE'
          ORDER BY p.updated_at DESC,p.id ASC
          LIMIT 1
        ), remittance AS (
          SELECT 'REMESA'::text AS kind,p.id
          FROM conciliar_proyecciones p
          WHERE p.source->>'kind'='COBRO_PROPUESTA'
            AND p.grupo IN ('REMESA_VENCIMIENTO','REMESA_UNION','REMESA_RESIDUO')
          ORDER BY p.updated_at DESC,p.id ASC
          LIMIT 1
        )
        SELECT kind,id AS "rowId" FROM eligible
        UNION ALL SELECT kind,id AS "rowId" FROM supplier
        UNION ALL SELECT kind,id AS "rowId" FROM remittance
        ORDER BY kind ASC
        LIMIT 3
      `)
      if (candidates.length !== 3 || new Set(candidates.map(item => item.kind)).size !== 3 || candidates.some(item => !expected(item.kind) || !/^[A-Za-z0-9_-]{1,240}$/.test(item.rowId))) fail('DETAIL_STAGING_CANDIDATES_REQUIRED')
      const results: BranchAggregate[] = []
      let readerQueries = 0
      for (const candidate of candidates) {
        let branchQueries = 0
        const readOnlyClient = {
          async $queryRaw<T>(statement: unknown): Promise<T> {
            readerQueries += 1
            branchQueries += 1
            return tx.$queryRaw(statement as never) as Promise<T>
          },
        }
        const detail = await readConciliarDocumentDetail(candidate.rowId, actor, readOnlyClient as never)
        results.push({
          kind: candidate.kind,
          readerQueries: branchQueries,
          returnedExpectedKind: detail.kind === candidate.kind,
          lines: detail.lineas.length === 0 ? 'NONE' : 'ONE_OR_MORE',
          exact: detail.cuadreExacto,
        })
      }
      if (results.some(item => !item.returnedExpectedKind || item.readerQueries !== 2)) fail('DETAIL_STAGING_ROUNDTRIPS_INVALID')
      return {
        ok: true as const,
        stagingOnly: true as const,
        transactionReadOnly: true as const,
        financialWrites: 0,
        selectedBranches: results.length,
        readerQueries,
        results,
      } satisfies Output
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 })
    console.log(JSON.stringify(output))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  const code = error instanceof Error ? error.message : ''
  console.error(/^DETAIL_STAGING_[A-Z0-9_]+$/.test(code) ? code : 'DETAIL_STAGING_READONLY_FAILED')
  process.exitCode = 1
})
