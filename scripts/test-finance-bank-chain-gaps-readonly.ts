/*
 * Diagnóstico de tramos — integración real, únicamente lectura de staging.
 *
 * Ejecución autorizada:
 * FINANCE_STAGING_SANDBOX=1 VERCEL_ENV=preview \
 * FINANCE_CHAIN_GAPS_MANAGER_ID=<gestor-vivo> \
 * FINANCE_CHAIN_GAPS_DENIED_ID=<perfil-modo-facil-only> \
 * npx tsx scripts/test-finance-bank-chain-gaps-readonly.ts
 *
 * No inserta fixtures, no usa rollback porque cada transacción se declara READ ONLY
 * y compara que estados B4/recibos automáticos no cambian antes/después.
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { assertPrototypeStaging } from '../lib/finanzas/prototype-staging'
import {
  BankChainGapsServiceError,
  readBankChainGapPage,
  readBankChainGapSummary,
} from '../lib/finanzas/bank-chain-gaps-db'

function requiredId(name: string): number {
  const value = Number(process.env[name])
  assert(Number.isSafeInteger(value) && value > 0, `${name} debe ser un identificador positivo`)
  return value
}

async function protectedCounts() {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    const rows = await tx.$queryRaw<Array<{ estados_b4: number; operaciones_b4: number; recibos_auto: number }>>(Prisma.sql`
      SELECT
        (SELECT count(*)::int FROM estado_justificacion_movimientos) AS estados_b4,
        (SELECT count(*)::int FROM operaciones_justificacion_b4) AS operaciones_b4,
        (SELECT count(*)::int FROM recibos_auto_modo_facil) AS recibos_auto
    `)
    return rows[0]!
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10_000, timeout: 30_000 })
}

async function main() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'Nunca se ejecuta contra producción')
  const managerId = requiredId('FINANCE_CHAIN_GAPS_MANAGER_ID')
  const deniedId = requiredId('FINANCE_CHAIN_GAPS_DENIED_ID')
  await assertPrototypeStaging()

  const before = await protectedCounts()
  const summary = await readBankChainGapSummary(managerId)
  assert.equal(summary.stagingOnly, true)
  assert.equal(summary.lecturaSolo, true)
  assert.equal(summary.cuentas.length, summary.totalCuentas)
  assert(summary.cuentas.length > 0, 'Debe existir al menos una cuenta activa en staging')
  assert(summary.cuentas.every(item => /^[A-Za-z0-9]{4}$/.test(item.cuenta.ibanUltimos4)), 'La respuesta sólo expone los cuatro últimos caracteres de cuenta')
  assert(summary.cuentas.every(item => item.faltaExtracto.estado === 'NO_DEMOSTRADA'), 'No se puede afirmar una falta de extracto por fecha final')
  assert(summary.cuentas.every(item => !('movimientoId' in item)), 'El resumen no expone movimientos')

  const account = summary.cuentas[0]!
  const page = await readBankChainGapPage(managerId, { cuentaId: account.cuenta.cuentaId, limit: 3, offset: 0 })
  assert.equal(page.stagingOnly, true)
  assert.equal(page.lecturaSolo, true)
  assert.equal(page.cuenta.ibanUltimos4, account.cuenta.ibanUltimos4)
  assert(page.fallos.length <= 3)
  assert(page.fallos.every(item => Number.isSafeInteger(item.importeCentimos) || item.importeCentimos === null), 'Los importes de diagnóstico son céntimos enteros o null')
  assert(page.fallos.every(item => Number.isSafeInteger(item.saldoEsperadoCentimos) || item.saldoEsperadoCentimos === null), 'Los saldos esperados son céntimos enteros o null')

  await assert.rejects(
    () => readBankChainGapSummary(deniedId),
    (error: unknown) => error instanceof BankChainGapsServiceError && error.status === 403 && error.code === 'TRAMOS_CADENA_NO_AUTORIZADOS',
    'El perfil MODO_FACIL_ONLY no puede leer los tramos aunque tenga rol previo',
  )

  const after = await protectedCounts()
  assert.deepEqual(after, before, 'La lectura de tramos no puede alterar estados B4, operaciones B4 ni recibos automáticos')
  console.log(JSON.stringify({ passed: true, stagingOnly: true, readOnly: true, managerLiveProfile: true, easyOnlyDenied: true, maskedAccounts: true, b4AndAutoReceiptsUnchanged: true, activeAccounts: summary.totalCuentas }))
}

main().catch(error => {
  console.error('BANK_CHAIN_GAPS_READONLY_FAILED', error instanceof Error ? error.message : 'desconocido')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
