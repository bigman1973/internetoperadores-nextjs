/*
 * Ensayo STAGING de proveedor: lectura y rebuild dentro de una única transacción
 * SERIALIZABLE revertida intencionalmente. No confirma, enlaza, sincroniza ni usa
 * Graph. La salida pública contiene sólo agregados y tres booleanos de casos.
 *
 * FLAGS=1 npx tsx scripts/test-conciliar-provider-staging-rehearsal.ts
 */
import { Prisma } from '@prisma/client'
import { parse } from 'dotenv'
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { URL } from 'node:url'

const ROOT = '/home/ubuntu/internetoperadores-nextjs-margin'
const EXTERNAL_ENV = '/home/ubuntu/finanzas-b1-20261022/staging-private.env'
const OUTPUT_DIR = '/home/ubuntu/conciliar-asignacion-20261028/pruebas'
const PRIVATE_CASES = '/home/ubuntu/conciliar-asignacion-20261028/privado/proveedores-casos-browser.json'
const MAX_ENV_BYTES = 32 * 1024
// Los literales no salen del proceso: se construyen como códigos para evitar
// copiarlos al artefacto privado o a las salidas del ensayo.
const CASE_REFERENCE_NORMALIZED = Object.freeze({
  exactJun: String.fromCharCode(65, 49, 49, 53, 52, 51, 52, 48),
  otherJun: String.fromCharCode(65, 49, 49, 53, 54, 48, 51, 49),
  exactAug: String.fromCharCode(65, 49, 49, 53, 55, 54, 50, 49),
  explicitMissing: String.fromCharCode(67,67,50,54,48,48,48,48,48,48,52,49,55,54),
  knownExactSept: String.fromCharCode(67,67,50,54,48,48,48,48,48,48,52,56,49,51),
})
class Rollback extends Error {
  constructor(readonly result: RehearsalResult, readonly privateCases: readonly BrowserCase[]) { super('CONCILIAR_PROVIDER_REHEARSAL_ROLLBACK') }
}
type Aggregate = Readonly<{ color: string; count: number }>
type BrowserCase = Readonly<{ case: 'exact-jun' | 'exact-aug' | 'explicit-missing' | 'known-exact-sept'; rowId: string; expectedColor: 'AMBAR' | 'ROJO' | 'VERDE'; expectedDocRefHash?: string; noDocument?: boolean }>
type RehearsalResult = Readonly<{
  stagingOnly: true
  rolledBack: true
  financialStateUnchanged: true
  before: readonly Aggregate[]
  after: readonly Aggregate[]
  cases: Readonly<{ case1: boolean; case2: boolean; case3: boolean }>
  missingSources: Readonly<{ explicitMissing: boolean; knownExactSept: boolean }>
}>

function fail(code: string): never { throw new Error(code) }
function safeExternalEnvironment(): Record<string, string> {
  if (process.env.FLAGS !== '1') fail('CONCILIAR_PROVIDER_FLAGS_REQUIRED')
  let stat: ReturnType<typeof lstatSync>
  try { stat = lstatSync(EXTERNAL_ENV) } catch { fail('CONCILIAR_PROVIDER_ENV_UNAVAILABLE') }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size < 1 || stat.size > MAX_ENV_BYTES) fail('CONCILIAR_PROVIDER_ENV_UNSAFE')
  const local = parse(readFileSync(`${ROOT}/.env`, 'utf8'))
  const external = parse(readFileSync(EXTERNAL_ENV, 'utf8'))
  if (!local.DATABASE_URL || local.DATABASE_URL !== external.DATABASE_URL) fail('CONCILIAR_PROVIDER_ENV_TARGET_MISMATCH')
  const values = { ...local, ...external }
  let target: URL
  try { target = new URL(String(values.DATABASE_URL)) } catch { fail('CONCILIAR_PROVIDER_ENV_INVALID') }
  if (values.FINANCE_STAGING_SANDBOX !== '1' || values.VERCEL_ENV === 'production' || values.IO_PRODUCTION_READ_ONLY === '1'
    || ![undefined, '0'].includes(values.FINANCE_EASY_PRODUCTION_ENABLED) || ![undefined, '0'].includes(values.FINANCE_MODEL_PRODUCTION_ENABLED)
    || target.pathname !== '/io_staging_finanzas' || decodeURIComponent(target.username) !== 'io_staging_finanzas') fail('CONCILIAR_PROVIDER_ENV_INVALID')
  return values
}
function install(values: Record<string, string>) { for (const [key, value] of Object.entries(values)) process.env[key] = value }
function refHash(value: unknown): string | null { return typeof value === 'string' ? createHash('sha256').update(value, 'utf8').digest('hex') : null }
function normalizedReference(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES').replace(/[^A-Z0-9]/g, '')
  return normalized || null
}
function aggregates(rows: readonly { color: string; count: number }[]): Aggregate[] { return rows.map(row => ({ color: row.color, count: Number(row.count) })).sort((left, right) => left.color.localeCompare(right.color)) }
function one(rows: readonly any[]): any | null { return rows.length === 1 ? rows[0] : null }
function exactCents(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) ? value : null }

async function main(): Promise<void> {
  install(safeExternalEnvironment())
  const [{ default: prisma }, { assertPrototypeStaging }, { rebuildConciliarProjectionTx }] = await Promise.all([
    import('../lib/prisma'), import('../lib/finanzas/prototype-staging'), import('../lib/finanzas/conciliar-db'),
  ])
  try {
    await assertPrototypeStaging()
    const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>(Prisma.sql`SELECT current_database() AS db,current_user AS role LIMIT 1`)
    if (identity.length !== 1 || identity[0]?.db !== 'io_staging_finanzas' || identity[0]?.role !== 'io_staging_finanzas') fail('CONCILIAR_PROVIDER_IDENTITY_REQUIRED')
    let rehearsal: Rollback | null = null
    try {
      await prisma.$transaction(async tx => {
        const before = aggregates(await tx.$queryRaw<Array<{ color: string; count: number }>>(Prisma.sql`
          SELECT color,COUNT(*)::int AS count FROM conciliar_proyecciones
          WHERE tab='PAGOS' AND grupo='FACTURA_RECIBIDA' GROUP BY color ORDER BY color LIMIT 3
        `))
        const ledgerBefore = await tx.$queryRaw<Array<{ operations: number; links: number; thirdParties: number }>>(Prisma.sql`
          SELECT (SELECT COUNT(*)::int FROM operaciones_justificacion_b4) AS operations,
            (SELECT COUNT(*)::int FROM vinculos_movimiento_documento) AS links,
            (SELECT COUNT(*)::int FROM decisiones_tercero_modo_facil) AS "thirdParties" LIMIT 1
        `)
        await rebuildConciliarProjectionTx(tx, null)
        const after = aggregates(await tx.$queryRaw<Array<{ color: string; count: number }>>(Prisma.sql`
          SELECT color,COUNT(*)::int AS count FROM conciliar_proyecciones
          WHERE tab='PAGOS' AND grupo='FACTURA_RECIBIDA' GROUP BY color ORDER BY color LIMIT 3
        `))
        const ledgerAfter = await tx.$queryRaw<Array<{ operations: number; links: number; thirdParties: number }>>(Prisma.sql`
          SELECT (SELECT COUNT(*)::int FROM operaciones_justificacion_b4) AS operations,
            (SELECT COUNT(*)::int FROM vinculos_movimiento_documento) AS links,
            (SELECT COUNT(*)::int FROM decisiones_tercero_modo_facil) AS "thirdParties" LIMIT 1
        `)
        if (JSON.stringify(ledgerBefore) !== JSON.stringify(ledgerAfter)) fail('CONCILIAR_PROVIDER_FINANCIAL_STATE_CHANGED')
        const providerRows = await tx.$queryRaw<Array<{ id: string; movimientoId: string | null; fecha: string; importeCentimos: number; color: 'AMBAR' | 'ROJO' | 'VERDE'; referencia: string | null; documento: unknown; concepto: string; bancoReferencia: string | null; bancoInfo: string | null }>>(Prisma.sql`
          SELECT p.id,p.movimiento_id AS "movimientoId",p.fecha::date::text AS fecha,p.importe_centimos AS "importeCentimos",p.color,p.documento->>'referencia' AS referencia,p.documento,p.concepto,
            m.referencia AS "bancoReferencia",m.info_adicional AS "bancoInfo"
          FROM conciliar_proyecciones p
          LEFT JOIN movimientos_bancarios m ON m.id=p.movimiento_id
          WHERE p.tab='PAGOS' LIMIT 25000
        `)
        const sourceMovements = await tx.$queryRaw<Array<{ id: string; fecha: string; importeCentimos: number; concepto: string | null; bancoReferencia: string | null; bancoInfo: string | null }>>(Prisma.sql`
          SELECT m.id,m.fecha_operacion::date::text AS fecha,b4_importe_bancario_centimos(m.importe) AS "importeCentimos",m.concepto,m.referencia AS "bancoReferencia",m.info_adicional AS "bancoInfo"
          FROM movimientos_bancarios m
          WHERE m.fecha_operacion::date IN ('2026-05-29'::date,'2026-06-30'::date,'2026-08-10'::date,'2026-08-31'::date,'2026-09-10'::date)
          LIMIT 25000
        `)
        const withDateAndCents = (fecha: string, importeCentimos: number) => providerRows.filter(row => row.fecha === fecha && exactCents(row.importeCentimos) === importeCentimos)
        const exactJun = one(withDateAndCents('2026-06-30', -48_811))
        const mayUnreserved = one(withDateAndCents('2026-05-29', -37_244))
        const exactAug = one(withDateAndCents('2026-08-31', -47_093))
        // The bank reference is only compared in memory. It is never emitted,
        // and a row with a document would demonstrate an impermissible fallback.
        const bankDocumentaryReference = (row: { concepto: string | null; bancoReferencia: string | null; bancoInfo: string | null }) =>
          normalizedReference([row.concepto, row.bancoReferencia, row.bancoInfo].filter((value): value is string => typeof value === 'string').join(' '))
        const sourceExplicitMissing = one(sourceMovements.filter(row => row.fecha === '2026-08-10' && exactCents(row.importeCentimos) === -295_506 && bankDocumentaryReference(row)?.includes(CASE_REFERENCE_NORMALIZED.explicitMissing) === true))
        const sourceKnownExactSept = one(sourceMovements.filter(row => row.fecha === '2026-09-10' && exactCents(row.importeCentimos) === -321_582 && bankDocumentaryReference(row)?.includes(CASE_REFERENCE_NORMALIZED.knownExactSept) === true))
        const explicitMissing = sourceExplicitMissing ? one(providerRows.filter(row => row.movimientoId === sourceExplicitMissing.id)) : null
        const knownExactSept = sourceKnownExactSept ? one(providerRows.filter(row => row.movimientoId === sourceKnownExactSept.id)) : null
        const case1 = exactJun?.color === 'AMBAR'
          && normalizedReference(exactJun.referencia) === CASE_REFERENCE_NORMALIZED.exactJun
          && normalizedReference(exactJun.referencia) !== CASE_REFERENCE_NORMALIZED.otherJun
          && mayUnreserved !== null && normalizedReference(mayUnreserved.referencia) !== CASE_REFERENCE_NORMALIZED.exactJun
        const case2 = exactAug?.color === 'AMBAR' && normalizedReference(exactAug.referencia) === CASE_REFERENCE_NORMALIZED.exactAug
        const case3 = explicitMissing?.color === 'ROJO' && explicitMissing?.documento === null
          && knownExactSept?.color === 'VERDE' && normalizedReference(knownExactSept.referencia) === CASE_REFERENCE_NORMALIZED.knownExactSept
        const privateCases: BrowserCase[] = []
        if (case1 && exactJun && typeof exactJun.referencia === 'string') privateCases.push({ case: 'exact-jun', rowId: exactJun.id, expectedColor: 'AMBAR', expectedDocRefHash: refHash(exactJun.referencia)! })
        if (case2 && exactAug && typeof exactAug.referencia === 'string') privateCases.push({ case: 'exact-aug', rowId: exactAug.id, expectedColor: 'AMBAR', expectedDocRefHash: refHash(exactAug.referencia)! })
        if (explicitMissing?.color === 'ROJO' && explicitMissing.documento === null) privateCases.push({ case: 'explicit-missing', rowId: explicitMissing.id, expectedColor: 'ROJO', noDocument: true })
        if (knownExactSept?.color === 'VERDE' && normalizedReference(knownExactSept.referencia) === CASE_REFERENCE_NORMALIZED.knownExactSept && typeof knownExactSept.referencia === 'string') privateCases.push({ case: 'known-exact-sept', rowId: knownExactSept.id, expectedColor: 'VERDE', expectedDocRefHash: refHash(knownExactSept.referencia)! })
        throw new Rollback({ stagingOnly: true, rolledBack: true, financialStateUnchanged: true, before, after, cases: { case1, case2, case3 }, missingSources: { explicitMissing: sourceExplicitMissing === null, knownExactSept: sourceKnownExactSept === null } }, privateCases)
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 })
    } catch (error) {
      if (error instanceof Rollback) rehearsal = error
      else throw error
    }
    if (!rehearsal) fail('CONCILIAR_PROVIDER_REHEARSAL_MISSING')
    mkdirSync(OUTPUT_DIR, { recursive: true, mode: 0o700 })
    writeFileSync(`${OUTPUT_DIR}/proveedores-rollback-rebuild.json`, `${JSON.stringify(rehearsal.result, null, 2)}\n`, { mode: 0o600 })
    writeFileSync(PRIVATE_CASES, `${JSON.stringify({ stagingOnly: true, rolledBack: true, cases: rehearsal.privateCases }, null, 2)}\n`, { mode: 0o600 })
    console.log(JSON.stringify(rehearsal.result))
  } finally {
    await prisma.$disconnect()
  }
}
main().catch(error => {
  const code = error instanceof Error ? error.message : ''
  console.error(/^CONCILIAR_PROVIDER_[A-Z0-9_]+$/.test(code) ? code : 'CONCILIAR_PROVIDER_REHEARSAL_FAILED')
  process.exitCode = 1
})
