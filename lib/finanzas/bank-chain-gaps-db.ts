import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError, PrototypeStagingError, type FinanceEasyRuntimeContext } from '@/lib/finanzas/prototype-staging'
import { canManageEasyAutomation } from '@/lib/finanzas/easy-access-profile'
import { centsFromExactSqlText } from '@/lib/finanzas/easy-auto-core'
import {
  bankChainGapCountByCode,
  diagnoseBankChainGaps,
  type BankChainGap,
  type BankChainGapDiagnosis,
  type BankChainGapRow,
} from '@/lib/finanzas/bank-chain-gaps-core'

type Db = PrismaClient & Record<string, any>
type Tx = Prisma.TransactionClient & Record<string, any>
const db = () => prisma as Db
export const BANK_CHAIN_GAPS_MAX_LIMIT = 50

export class BankChainGapsServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

function fail(status: number, code: string, message: string): never {
  throw new BankChainGapsServiceError(status, code, message)
}

function asTx(tx: Prisma.TransactionClient): Tx { return tx as Tx }

/** Re-check the selected runtime on this transaction's actual connection. */
async function assertBankChainGapRuntimeTx(tx: Tx, runtime: FinanceEasyRuntimeContext): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ database_name: string; database_user: string }>>(Prisma.sql`
    SELECT current_database() AS database_name,current_user AS database_user LIMIT 1
  `)
  const expected = runtime.runtime === 'production'
    ? { databaseName: 'railway', databaseUser: 'postgres' }
    : { databaseName: 'io_staging_finanzas', databaseUser: 'io_staging_finanzas' }
  if (rows.length !== 1 || rows[0]?.database_name !== expected.databaseName || rows[0]?.database_user !== expected.databaseUser) {
    throw new FinanceEasyRuntimeError()
  }
  return runtime.stagingOnly
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function accountLabel(row: any) {
  const iban = String(row.iban ?? '')
  return {
    cuentaId: String(row.id),
    banco: String(row.banco ?? ''),
    alias: text(row.alias),
    ibanUltimos4: iban.slice(-4),
  }
}

function parseExactCents(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null
  try {
    return centsFromExactSqlText(value, field, true)
  } catch {
    // A non-exact legacy decimal remains evidence that cannot establish a chain.
    return null
  }
}

function toRow(row: any): BankChainGapRow {
  return {
    id: String(row.id),
    cuentaId: String(row.cuenta_id),
    fecha: String(row.fecha),
    importeCentimos: parseExactCents(row.importe_text, `movimiento ${String(row.id)}.importe`),
    saldoCentimos: parseExactCents(row.saldo_text, `movimiento ${String(row.id)}.saldo`),
  }
}

function accountSummary(account: any, rows: readonly BankChainGapRow[], diagnosis: BankChainGapDiagnosis) {
  const first = rows[0]?.fecha ?? null
  const counts = bankChainGapCountByCode(diagnosis.fallos)
  const primary = diagnosis.fallos[0] ?? null
  return {
    cuenta: accountLabel(account),
    primeraFecha: first,
    fechaCorteExtracto: account.corte_extracto === null || account.corte_extracto === undefined ? null : String(account.corte_extracto),
    totalMovimientos: rows.length,
    totalFallos: diagnosis.fallos.length,
    recuento: counts,
    resumen: primary === null
      ? 'No hay un tramo demostrablemente bloqueado en los apuntes leídos.'
      : primary.mensaje,
    faltaExtracto: diagnosis.faltaExtracto,
  }
}

async function readSnapshot(tx: Tx) {
  // PostgreSQL enforces the invariant at the connection level: a future accidental
  // insert/update in this function aborts before it can mutate either runtime.
  await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
  const [accounts, movements] = await Promise.all([
    tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT c.id,c.banco,c.alias,c.iban,c.fecha_corte_extracto::date::text AS corte_extracto
      FROM cuentas_bancarias c
      WHERE c.activa=true
      ORDER BY c.banco ASC,c.alias ASC,c.id ASC
    `),
    tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT m.id,m.cuenta_id,m.fecha_operacion::date::text AS fecha,m.importe::text AS importe_text,m.saldo::text AS saldo_text
      FROM movimientos_bancarios m
      JOIN cuentas_bancarias c ON c.id=m.cuenta_id AND c.activa=true
      ORDER BY m.cuenta_id ASC,m.fecha_operacion::date ASC,m.id ASC
    `),
  ])
  const rowsByAccount = new Map<string, BankChainGapRow[]>()
  for (const row of movements) {
    const item = toRow(row)
    const list = rowsByAccount.get(item.cuentaId) ?? []
    list.push(item)
    rowsByAccount.set(item.cuentaId, list)
  }
  return { accounts, rowsByAccount }
}

/**
 * Internal capability is deliberately stronger than ordinary B4 reading: only a
 * live manager profile in the validated promoted runtime can inspect account-chain
 * diagnosis. MODO_FACIL_ONLY remains denied even if it retains a legacy role.
 */
export async function assertBankChainGapManager(actorId: number): Promise<FinanceEasyRuntimeContext> {
  const runtime = await assertFinanceEasyRuntime()
  if (!Number.isSafeInteger(actorId) || actorId <= 0 || !await canManageEasyAutomation(actorId, runtime)) {
    fail(403, 'TRAMOS_CADENA_NO_AUTORIZADOS', 'El perfil vivo no puede consultar el diagnóstico de tramos de saldo.')
  }
  return runtime
}

/** Summary contains exactly one masked record for each active account. No DML. */
export async function readBankChainGapSummary(actorId: number) {
  const runtime = await assertBankChainGapManager(actorId)
  try {
    return await db().$transaction(async tx => {
      const work = asTx(tx)
      const stagingOnly = await assertBankChainGapRuntimeTx(work, runtime)
      const snapshot = await readSnapshot(work)
      const accounts = snapshot.accounts.map(account => {
        const rows = snapshot.rowsByAccount.get(String(account.id)) ?? []
        return accountSummary(account, rows, diagnoseBankChainGaps(rows))
      })
      return {
        stagingOnly,
        lecturaSolo: true as const,
        cuentas: accounts,
        totalCuentas: accounts.length,
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 10_000,
      timeout: 45_000,
    })
  } catch (error) {
    if (error instanceof BankChainGapsServiceError || error instanceof PrototypeStagingError || error instanceof FinanceEasyRuntimeError) throw error
    throw error
  }
}

export type BankChainGapPageInput = Readonly<{ cuentaId: string; limit: number; offset: number }>

export function parseBankChainGapPageInput(search: URLSearchParams): BankChainGapPageInput | null {
  const supplied = search.get('cuenta')
  if (!supplied) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supplied)) {
    fail(400, 'CUENTA_INVALIDA', 'La cuenta solicitada no es válida.')
  }
  const rawLimit = search.get('limit') ?? '20'
  const rawOffset = search.get('offset') ?? '0'
  if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset)) fail(400, 'PAGINACION_INVALIDA', 'La paginación no es válida.')
  const limit = Number(rawLimit)
  const offset = Number(rawOffset)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > BANK_CHAIN_GAPS_MAX_LIMIT || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) {
    fail(400, 'PAGINACION_INVALIDA', 'La paginación no es válida.')
  }
  return { cuentaId: supplied.toLowerCase(), limit, offset }
}

/** One masked account plus one deterministic page of its demonstrated failures. No DML. */
export async function readBankChainGapPage(actorId: number, input: BankChainGapPageInput) {
  const runtime = await assertBankChainGapManager(actorId)
  return db().$transaction(async tx => {
    const work = asTx(tx)
    const stagingOnly = await assertBankChainGapRuntimeTx(work, runtime)
    const snapshot = await readSnapshot(work)
    const account = snapshot.accounts.find(item => String(item.id).toLowerCase() === input.cuentaId)
    if (!account) fail(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta no existe o no está activa.')
    const rows = snapshot.rowsByAccount.get(String(account.id)) ?? []
    const diagnosis = diagnoseBankChainGaps(rows)
    const summary = accountSummary(account, rows, diagnosis)
    const fallos: readonly BankChainGap[] = diagnosis.fallos.slice(input.offset, input.offset + input.limit)
    return {
      stagingOnly,
      lecturaSolo: true as const,
      ...summary,
      limit: input.limit,
      offset: input.offset,
      fallos,
    }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait: 10_000,
    timeout: 45_000,
  })
}

export function bankChainGapErrorResponse(error: unknown): { status: number; body: { error: string; codigo?: string } } {
  if (error instanceof BankChainGapsServiceError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof PrototypeStagingError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof FinanceEasyRuntimeError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  return { status: 500, body: { error: 'No se pudo leer el diagnóstico de tramos de saldo.' } }
}
