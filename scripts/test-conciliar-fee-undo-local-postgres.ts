/*
 * Integración local real, opt-in y rollback-only para el fast undo de comisiones.
 *
 * Requiere una copia PostgreSQL LOCAL ya migrada (incluido Conciliar/B4/P1); no
 * ejecuta DDL, migraciones, red, Graph ni usa DATABASE_URL de la sesión.
 *
 *   CONCILIAR_LOCAL_DATABASE_URL='postgresql://...@127.0.0.1:5432/...' \
 *   pnpm exec tsx scripts/test-conciliar-fee-undo-local-postgres.ts
 *
 * La URL debe apuntar a localhost/loopback. Todos los fixtures y la proyección
 * se crean dentro de una transacción SERIALIZABLE que termina obligatoriamente
 * en rollback. No admite staging ni producción remotos.
 *
 * Alcance: prueba la consulta SQL real y parametrizada de restauración por lote,
 * el constructor vivo y el inserter canónico. No ejecuta runConciliarAction,
 * ACL/actuación, P1/B4 ni el marcador clean de la transacción completa de undo.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

class RollbackOnly extends Error { constructor() { super('CONCILIAR_FEE_UNDO_LOCAL_ROLLBACK_ONLY') } }
const TAG = `CONCILIAR-FEE-UNDO-LOCAL-${randomUUID()}`
const DAY = new Date(Date.UTC(2044, 1, 3, 12, 0, 0))

type Tx = any

function localUrl(): string {
  const raw = process.env.CONCILIAR_LOCAL_DATABASE_URL
  assert(raw, 'CONCILIAR_LOCAL_DATABASE_URL es obligatoria; nunca se usa DATABASE_URL implícita.')
  const url = new URL(raw)
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'La URL local debe ser PostgreSQL.')
  assert(['127.0.0.1', '::1', 'localhost'].includes(url.hostname), 'Sólo se admite PostgreSQL local por loopback.')
  assert(url.pathname.length > 1, 'La URL local debe nombrar una base de datos sintética ya migrada.')
  const database = decodeURIComponent(url.pathname.slice(1))
  assert(/^io_local_conciliar_test(?:_[a-z0-9_]+)?$/i.test(database), 'La base local debe llamarse io_local_conciliar_test o un sufijo sintético; staging/producción se rechazan.')
  return raw
}

async function run(): Promise<void> {
  const url = localUrl()
  const savedDatabaseUrl = process.env.DATABASE_URL
  const savedStagingSandbox = process.env.FINANCE_STAGING_SANDBOX
  // lib/prisma may load dotenv while conciliar-db is imported. This local-only
  // script is explicitly not a staging runtime; set this before every dynamic
  // project import so its isolated-staging connection fence cannot inherit 1.
  process.env.FINANCE_STAGING_SANDBOX = '0'
  process.env.DATABASE_URL = url
  const client = new PrismaClient({ datasources: { db: { url } } })
  let shared: { $disconnect: () => Promise<void> } | null = null
  let completed = false
  try {
    const [{ restoreLiveBankFeeProjectionBatchTx, restoreLiveBankFeeProjectionTx }, { projectionRow }, prismaModule] = await Promise.all([
      import('../lib/finanzas/conciliar-db'),
      import('../lib/finanzas/conciliar-projection-read'),
      import('../lib/prisma'),
    ])
    shared = prismaModule.default
    const identity = await client.$queryRaw<Array<{ db: string; host: string }>>`
      SELECT current_database() AS db, host(inet_server_addr()) AS host LIMIT 1
    `
    assert.equal(identity.length, 1, 'La identidad local debe responder exactamente una fila.')
    assert(['127.0.0.1', '::1', null].includes(identity[0]?.host as any), 'El servidor PostgreSQL debe ser local.')

    try {
      await client.$transaction(async (tx: Tx) => {
        const account = await tx.cuentaBancaria.create({
          data: { id: randomUUID(), banco: `${TAG} BANCO`, iban: `ES00${randomUUID().replaceAll('-', '').slice(0, 30)}`, alias: TAG, activa: true, fechaCorteExtracto: DAY },
          select: { id: true },
        })
        const movimientoIds: string[] = [randomUUID(), randomUUID()]
        for (const [index, movimientoId] of movimientoIds.entries()) {
          await tx.movimientoBancario.create({ data: {
            id: movimientoId, cuentaId: account.id, fechaOperacion: DAY, fechaValor: DAY, importe: -1.49 - index,
            concepto: `${TAG} COMISION DE MANTENIMIENTO ${index + 1}`, referencia: `${TAG}-REF-${index + 1}`, infoAdicional: TAG,
            tercero: `${TAG} BANCO`, hashUnico: `${TAG}-${randomUUID()}`,
          } })
        }

        // Runs the actual set SQL reader with Prisma fragments for both ids,
        // P1/existing-row blockers, the live constructor and one canonical insert.
        assert.equal(await restoreLiveBankFeeProjectionBatchTx(tx, movimientoIds), true, 'Las dos comisiones vivas deben reinsertarse atómicamente desde la forma SQL real.')
        const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT id,tab,movimiento_id,fecha::text,concepto,banco,cuenta,importe_centimos,
            pendiente_centimos,color,grupo,motivo,documento,propuesta,seleccionable,
            diferencia_centimos,links_movimiento,detail,source,source_fingerprint,updated_at
          FROM conciliar_proyecciones WHERE movimiento_id IN (${movimientoIds[0]}, ${movimientoIds[1]})
          ORDER BY movimiento_id ASC LIMIT 3 FOR UPDATE
        `
        assert.equal(rows.length, 2, 'La restauración batch inserta exactamente las dos filas.')
        for (const restoredSql of rows) {
          const restored = projectionRow(restoredSql)
          assert(movimientoIds.includes(restored.movimientoId), 'la fila pertenece a una fuente solicitada')
          assert.equal(restored.source.kind, 'COMISION_BANCARIA')
          assert.equal(restored.source.movimientoId, restored.movimientoId)
          assert.match(restored.sourceFingerprint, /^[a-f0-9]{64}$/)
          assert.match(restored.decisionHash, /^[a-f0-9]{64}$/)
          assert.notEqual(restored.decisionHash, 'a'.repeat(64), 'Nunca se reutiliza decisionHash histórico.')
        }
        assert.equal(await restoreLiveBankFeeProjectionBatchTx(tx, movimientoIds), false, 'Una segunda ejecución batch no duplica filas existentes.')
        assert.equal(await restoreLiveBankFeeProjectionTx(tx, randomUUID()), false, 'El adaptador single comparte la revalidación de fuente viva.')
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        completed = true
        throw new RollbackOnly()
      }, { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 60_000 })
    } catch (error) {
      if (!(error instanceof RollbackOnly)) throw error
    }
    assert(completed, 'La prueba no alcanzó su rollback obligatorio.')
    console.log(JSON.stringify({
      passed: true, localOnly: true, rollback: true, ddl: false, networkCalls: 0,
      scope: 'restoreLiveBankFeeProjectionBatchTx-query-and-classifier',
      notVerified: ['runConciliarAction', 'ACL-actuacion', 'P1-B4-undo', 'dirty-clean-marker'],
      verified: ['real-parameterized-batch-sql-shape', 'two-live-fee-classifications', 'single-canonical-insert', 'new-fingerprint-decision-hash', 'duplicate-batch-fallback', 'single-adapter-live-fallback'],
    }))
  } finally {
    await client.$disconnect()
    if (shared) await shared.$disconnect()
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = savedDatabaseUrl
    if (savedStagingSandbox === undefined) delete process.env.FINANCE_STAGING_SANDBOX
    else process.env.FINANCE_STAGING_SANDBOX = savedStagingSandbox
  }
}

run().catch(error => {
  console.error(`CONCILIAR_FEE_UNDO_LOCAL_POSTGRES_FAILED:${error instanceof Error ? error.message.slice(0, 500) : 'UNKNOWN'}`)
  process.exitCode = 1
})
