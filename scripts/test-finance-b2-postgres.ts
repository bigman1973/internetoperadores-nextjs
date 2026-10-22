/**
 * Prueba B2 PostgreSQL con escritura exclusivamente transaccional y rollback forzoso.
 * Ejecutar sólo DESPUÉS de que el responsable aplique la migración B2 en la BD aislada:
 * FINANCE_STAGING_SANDBOX=1 FINANCE_B2_ROLLBACK_TEST=1 \
 * node node_modules/tsx/dist/cli.mjs scripts/test-finance-b2-postgres.ts
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { claveCanonicaFactura } from '../lib/finanzas/invoice-quality'
import { backfillIdentidadExactaEnTx } from '../lib/finanzas/invoice-quality-db'

const prisma = new PrismaClient()
const ROLLBACK = new Error('B2_TEST_ROLLBACK_REQUIRED')

function mustBeExplicitSandbox() {
  if (process.env.FINANCE_STAGING_SANDBOX !== '1' || process.env.FINANCE_B2_ROLLBACK_TEST !== '1') {
    throw new Error('B2_ROLLBACK_TEST_REQUIRES_FINANCE_STAGING_SANDBOX_AND_FINANCE_B2_ROLLBACK_TEST')
  }
}
function id() { return crypto.randomUUID() }

async function main() {
  mustBeExplicitSandbox()
  const environment = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `
  assert.equal(environment[0]?.db, 'io_staging_finanzas', 'Sólo se permite io_staging_finanzas')
  assert.equal(environment[0]?.usuario, 'io_staging_finanzas', 'Sólo se permite el rol io_staging_finanzas')
  const migration = await prisma.$queryRaw<Array<{ facturas: string | null; revisiones: string | null; auditoria: string | null }>>`
    SELECT to_regclass('public.facturas_recibidas')::text AS facturas,
           to_regclass('public.revisiones_lectura_facturas_recibidas')::text AS revisiones,
           to_regclass('public.auditoria_calidad_facturas')::text AS auditoria
  `
  if (!migration[0]?.facturas || !migration[0]?.revisiones || !migration[0]?.auditoria) throw new Error('B2_MIGRATION_NOT_APPLIED')

  // Línea base global: se compara otra vez después del throw de rollback.
  const baseline = {
    recibidas: await prisma.facturaRecibida.count(),
    revisiones: await prisma.revisionLecturaFacturaRecibida.count(),
    auditorias: await prisma.auditoriaCalidadFactura.count(),
    emitidas: await prisma.facturaEmitida.count(),
    movimientos: await prisma.movimientoBancario.count(),
  }
  let exercised = false
  try {
    await prisma.$transaction(async tx => {
      // Reutiliza sólo un administrador activo existente; no crea usuarios ni datos personales.
      const actor = await tx.usuarioAdmin.findFirst({ where: { activo: true }, select: { id: true } })
      assert(actor, 'Se requiere un usuario administrador activo existente, sin crear uno de prueba')
      const key = claveCanonicaFactura('B-76543210', 'B2 / ROLLBACK-01')
      assert(key)
      const stamp = new Date('2026-10-22T10:20:00.000Z')
      const first = await tx.facturaRecibida.create({ data: {
        id: id(), proveedor: 'Proveedor fixture B2 (rollback)', cif: 'B-76543210', numFactura: 'B2 / ROLLBACK-01',
        fecha: new Date('2026-02-28T12:00:00.000Z'), base: 100, tipoIva: 21, importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121,
        concepto: 'Fixture B2 transaccional; no persistir', estado: 'PENDIENTE_REVISION', calidad: 'VALIDA', fechaProvenancia: 'DOCUMENTO',
        ocrCompletado: false, deducibleIva: true, createdAt: stamp,
      } })
      const second = await tx.facturaRecibida.create({ data: {
        id: id(), proveedor: 'Proveedor fixture B2 (rollback)', cif: 'B76543210', numFactura: 'B2/ROLLBACK-01',
        fecha: new Date('2026-02-28T12:00:00.000Z'), base: 100, tipoIva: 21, importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121,
        concepto: 'Segunda copia fixture B2; no persistir', estado: 'PENDIENTE_REVISION', calidad: 'VALIDA', fechaProvenancia: 'DOCUMENTO',
        ocrCompletado: false, deducibleIva: true, createdAt: new Date(stamp.getTime() + 1),
      } })

      // Caso de regresión del índice único parcial: ambas filas comienzan VALIDAS sin
      // canon_key. El helper debe guardar primero la copia y sólo después la canónica.
      const applied = await backfillIdentidadExactaEnTx(tx, key, [first.id, second.id], actor.id)
      assert.equal(applied.canonicaId, first.id, 'la selección de canónica es estable por fecha/ID')
      assert.equal(applied.cambios, 2, 'el grupo se clasifica completo sin choque del índice parcial')
      const group = await tx.facturaRecibida.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { createdAt: 'asc' } })
      assert.equal(group.length, 2)
      assert.equal(group.filter(row => row.calidad === 'VALIDA' && row.copiaDeId === null && row.canonKey === key).length, 1, 'índice único: exactamente una canónica')
      assert.equal(group.filter(row => row.calidad === 'COPIA' && row.copiaDeId === first.id && row.canonKey === key).length, 1, 'copia enlazada conserva la clave canónica')
      assert.equal(await tx.auditoriaCalidadFactura.count(), baseline.auditorias + 2, 'cada cambio de backfill queda auditado')

      const retry = await backfillIdentidadExactaEnTx(tx, key, [first.id, second.id], actor.id)
      assert.equal(retry.cambios, 0, 'doble ejecución del init/backfill no cambia versión ni datos')
      assert.equal(await tx.auditoriaCalidadFactura.count(), baseline.auditorias + 2, 'reintento no duplica auditoría')
      const afterRetry = await tx.facturaRecibida.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { createdAt: 'asc' } })
      assert.deepEqual(afterRetry.map(row => ({ id: row.id, calidad: row.calidad, copiaDeId: row.copiaDeId, canonKey: row.canonKey, version: row.versionCalidad })), group.map(row => ({ id: row.id, calidad: row.calidad, copiaDeId: row.copiaDeId, canonKey: row.canonKey, version: row.versionCalidad })))
      assert.equal(await tx.facturaEmitida.count(), baseline.emitidas, 'B2 no escribe facturas emitidas')
      assert.equal(await tx.movimientoBancario.count(), baseline.movimientos, 'B2 no escribe movimientos bancarios')
      exercised = true
      throw ROLLBACK
    }, { maxWait: 10_000, timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  assert(exercised, 'La transacción de fixture debe alcanzar el throw de rollback')
  assert.deepEqual({
    recibidas: await prisma.facturaRecibida.count(), revisiones: await prisma.revisionLecturaFacturaRecibida.count(),
    auditorias: await prisma.auditoriaCalidadFactura.count(), emitidas: await prisma.facturaEmitida.count(), movimientos: await prisma.movimientoBancario.count(),
  }, baseline, 'Rollback obligatorio: ninguna fila B2 o financiera de prueba permanece')
  console.log('OK PostgreSQL B2 staging: guardia exacta BD/rol, fixture real, canónica/copia con índice parcial, auditoría e idempotencia; rollback obligatorio y línea base intacta.')
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'B2_POSTGRES_TEST_FAILED'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
