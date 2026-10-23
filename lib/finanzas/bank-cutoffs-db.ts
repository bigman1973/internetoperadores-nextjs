import crypto from 'node:crypto'
import { verificarPermisoServer } from '@/lib/permisos'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety'
import {
  coverageFromCutoffs,
  effectiveCutoff,
  exactCents,
  isoDay,
  listBalanceJumps,
  type BalanceJump,
  type ConfirmedCutoff,
  type EffectiveAccountCutoff,
} from './bank-cutoffs-core'

const MAX_ACCOUNTS = 100
const MAX_SANTANDER_ROWS = 5_000
const MAX_NOTE = 2_000
const SOURCE_HASH = /^[0-9a-f]{64}$/

export class CutoffServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new CutoffServiceError(status, code, message, details)
}

function hash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function asDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10)
}

function safeCentsString(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?\d{1,16}$/.test(value)) return null
  try {
    const integer = BigInt(value)
    const max = BigInt(Number.MAX_SAFE_INTEGER)
    if (integer < -max || integer > max) return null
    return Number(integer)
  } catch {
    return null
  }
}

type AccountRow = {
  id: string
  banco: string
  alias: string | null
  activa: boolean
  fechaCorteExtracto: Date | null
  saldoActual: number | null
  fechaSaldo: Date | null
}
type ManualRow = {
  accountId: string
  cutoffDate: string | null
  balanceCents: string | null
  confirmedAt: Date | null
  actorId: number | null
  version: number | null
  id: string | null
}
type MovementRow = {
  id: string
  accountId: string
  fechaOperacion: string | null
  createdAt: string | null
  importeText: string | null
  saldoText: string | null
}

export type CutoffAccountDto = {
  id: string
  banco: string
  alias: string | null
  activa: boolean
  importedCutoffDate: string | null
  latestImportDate: string | null
  effectiveCutoffDate: string | null
  cutoffSource: 'MANUAL_CONFIRMADO' | 'EXTRACTO_IMPORTADO' | 'SIN_CORTE'
  sourceVersion: string
  latestManual: (ConfirmedCutoff & { version: number; id: string }) | null
  saldoActual: number | null
  fechaSaldo: string | null
  saltosSaldo: BalanceJump[]
  saltosSaldoTruncados: boolean
}

function manualFrom(row: ManualRow | undefined): (ConfirmedCutoff & { version: number; id: string }) | null {
  const balanceCents = row?.balanceCents === null || row?.balanceCents === undefined ? null : safeCentsString(row.balanceCents)
  const cutoffDate = isoDay(row?.cutoffDate)
  if (!row || !cutoffDate || balanceCents === null || !row.confirmedAt || !Number.isInteger(row.actorId) || !Number.isInteger(row.version) || !row.id) return null
  return { cutoffDate, balanceCents, confirmedAt: row.confirmedAt.toISOString(), actorId: row.actorId, version: row.version, id: row.id }
}

function sourceVersion(account: Pick<AccountRow, 'id' | 'fechaCorteExtracto'>, manual: ReturnType<typeof manualFrom>): string {
  return hash({
    accountId: account.id,
    importedCutoffDate: account.fechaCorteExtracto?.toISOString().slice(0, 10) ?? null,
    manual: manual && { id: manual.id, version: manual.version, cutoffDate: manual.cutoffDate, balanceCents: manual.balanceCents, confirmedAt: manual.confirmedAt },
  })
}

async function rawManuals(db: { $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> }): Promise<ManualRow[]> {
  return db.$queryRaw<ManualRow[]>(Prisma.sql`
    SELECT DISTINCT ON (cuenta_id)
      cuenta_id AS "accountId", fecha_corte::text AS "cutoffDate", saldo_centimos::text AS "balanceCents",
      confirmed_at AS "confirmedAt", actor_id AS "actorId", version, id::text AS id
    FROM cortes_cobertura_manual_b3
    ORDER BY cuenta_id, version DESC
  `)
}

/** Read-only view. The Santander list is bounded and marks truncation explicitly. */
export async function readCutoffAccounts(): Promise<{ accounts: CutoffAccountDto[]; coverage: ReturnType<typeof coverageFromCutoffs> }> {
  await assertFinanceRuntimeReady()
  const accounts = await (prisma.cuentaBancaria as any).findMany({
    take: MAX_ACCOUNTS,
    select: { id: true, banco: true, alias: true, activa: true, fechaCorteExtracto: true, saldoActual: true, fechaSaldo: true },
    orderBy: [{ activa: 'desc' }, { banco: 'asc' }, { alias: 'asc' }],
  }) as AccountRow[]
  const activeAccounts = accounts.filter((account) => account.activa)
  const [manualRows, imports, movements] = await Promise.all([
    rawManuals(prisma),
    prisma.importacionExtracto.findMany({
      where: { cuentaId: { in: accounts.map((account) => account.id) } },
      select: { cuentaId: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 5_000,
    }),
    activeAccounts.some((account) => account.banco.trim().toLocaleLowerCase('es-ES') === 'santander')
      ? prisma.$queryRaw<MovementRow[]>(Prisma.sql`
          SELECT id, cuenta_id AS "accountId", fecha_operacion::date::text AS "fechaOperacion",
            created_at::text AS "createdAt", importe::text AS "importeText", saldo::text AS "saldoText"
          FROM movimientos_bancarios
          WHERE cuenta_id IN (${Prisma.join(activeAccounts.filter((account) => account.banco.trim().toLocaleLowerCase('es-ES') === 'santander').map((account) => account.id))})
          ORDER BY fecha_operacion ASC, created_at ASC, id ASC
          LIMIT ${MAX_SANTANDER_ROWS + 1}
        `)
      : Promise.resolve([] as MovementRow[]),
  ])
  const manualByAccount = new Map(manualRows.map((row) => [row.accountId, manualFrom(row)]))
  const importByAccount = new Map<string, string>()
  for (const imported of imports) {
    if (!importByAccount.has(imported.cuentaId)) importByAccount.set(imported.cuentaId, imported.createdAt.toISOString())
  }
  const rowsByAccount = new Map<string, MovementRow[]>()
  for (const row of movements.slice(0, MAX_SANTANDER_ROWS)) rowsByAccount.set(row.accountId, [...(rowsByAccount.get(row.accountId) ?? []), row])
  const santanderTruncated = movements.length > MAX_SANTANDER_ROWS
  const effectiveByAccount = new Map<string, EffectiveAccountCutoff>()
  const result = accounts.map((account) => {
    const latestManual = manualByAccount.get(account.id) ?? null
    const effective = effectiveCutoff({
      accountId: account.id,
      importedCutoffDate: account.fechaCorteExtracto?.toISOString().slice(0, 10) ?? null,
      manual: latestManual,
    })
    effectiveByAccount.set(account.id, effective)
    const isSantander = account.banco.trim().toLocaleLowerCase('es-ES') === 'santander'
    return {
      id: account.id, banco: account.banco, alias: account.alias, activa: account.activa,
      importedCutoffDate: effective.importedCutoffDate,
      latestImportDate: importByAccount.get(account.id) ?? null,
      effectiveCutoffDate: effective.effectiveCutoffDate,
      cutoffSource: effective.source,
      sourceVersion: sourceVersion(account, latestManual),
      latestManual,
      saldoActual: account.saldoActual ?? null,
      fechaSaldo: account.fechaSaldo?.toISOString() ?? null,
      saltosSaldo: isSantander ? listBalanceJumps(rowsByAccount.get(account.id) ?? []) : [],
      saltosSaldoTruncados: isSantander && santanderTruncated,
    }
  })
  return {
    accounts: result,
    coverage: coverageFromCutoffs(activeAccounts.map((account) => effectiveByAccount.get(account.id)!).filter(Boolean)),
  }
}

type ConfirmInput = {
  cuentaId?: unknown
  fechaCorte?: unknown
  saldoCentimos?: unknown
  motivo?: unknown
  nota?: unknown
  confirmacion?: unknown
  idempotencyKey?: unknown
  sourceVersion?: unknown
}

function parseConfirmInput(raw: unknown): {cuentaId:string;fechaCorte:string;saldoCentimos:string;motivo:'EXTRACTO_REVISADO_MANUALMENTE';nota:string;confirmacion:true;idempotencyKey:string;sourceVersion:string;saldo:number} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const input = raw as ConfirmInput
  if (typeof input.cuentaId !== 'string' || !input.cuentaId.trim() || input.cuentaId.length > 160) fail(400, 'VALIDATION_ERROR', 'cuentaId no es válido.')
  if (typeof input.fechaCorte !== 'string' || !isoDay(input.fechaCorte) || input.fechaCorte > currentDay()) fail(400, 'VALIDATION_ERROR', 'fechaCorte debe ser una fecha válida no futura.')
  if (typeof input.saldoCentimos !== 'string' || safeCentsString(input.saldoCentimos) === null) fail(400, 'VALIDATION_ERROR', 'saldoCentimos debe ser un entero exacto y seguro.')
  if (input.motivo !== 'EXTRACTO_REVISADO_MANUALMENTE') fail(400, 'VALIDATION_ERROR', 'motivo de corte no admitido.')
  if (typeof input.nota !== 'string' || input.nota.trim().length < 8 || input.nota.trim().length > MAX_NOTE) fail(400, 'VALIDATION_ERROR', 'nota debe contener entre 8 y 2000 caracteres.')
  if (input.confirmacion !== true) fail(400, 'CONFIRMACION_REQUERIDA', 'Debe marcar la confirmación explícita del extracto revisado.')
  if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,160}$/.test(input.idempotencyKey)) fail(400, 'VALIDATION_ERROR', 'idempotencyKey no es válida.')
  if (typeof input.sourceVersion !== 'string' || !SOURCE_HASH.test(input.sourceVersion)) fail(400, 'VALIDATION_ERROR', 'sourceVersion no es válida.')
  return { cuentaId: input.cuentaId, fechaCorte: input.fechaCorte, saldoCentimos: input.saldoCentimos, motivo: input.motivo, nota: input.nota.trim(), confirmacion: true, idempotencyKey: input.idempotencyKey, sourceVersion: input.sourceVersion, saldo: safeCentsString(input.saldoCentimos)! }
}

/**
 * Adds one immutable coverage attestation. It intentionally issues no update against
 * CuentaBancaria/MovimientoBancario and does not calculate or certify a balance chain.
 */
export async function confirmManualCutoff(actorId: number, raw: unknown) {
  const input = parseConfirmInput(raw)
  await assertFinanceRuntimeReady()
  const payloadHash = hash({
    cuentaId: input.cuentaId, fechaCorte: input.fechaCorte, saldoCentimos: input.saldoCentimos,
    motivo: input.motivo, nota: input.nota, confirmacion: true, sourceVersion: input.sourceVersion,
  })
  try {
    return await (prisma as any).$transaction(async (tx: any) => {
      const actors = await tx.$queryRaw(Prisma.sql`SELECT id,rol,activo FROM usuarios_admin WHERE id=${actorId} LIMIT 1 FOR SHARE`)
      const actor = actors[0]
      if (!actor?.activo) fail(403,'ACTOR_INACTIVO','Usuario no autorizado.')
      const permission = await verificarPermisoServer(actorId,'admin.finanzas.importar',actor.rol,tx)
      if (!permission.escritura && actor.rol !== 'CONTABILIDAD') fail(403,'PERMISO_REVOCADO','Sin permiso de escritura de extractos.')
      const previous = await tx.corteCoberturaManualB3.findUnique({ where: { actorId_idempotencyKey: { actorId, idempotencyKey: input.idempotencyKey } } })
      if (previous) {
        if (previous.payloadHash !== payloadHash) fail(409, 'IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya se usó con una solicitud distinta.')
        return { ok: true, idempotent: true, cutoff: { id: previous.id, cuentaId: previous.cuentaId, fechaCorte: previous.fechaCorte.toISOString().slice(0, 10), saldoCentimos: previous.saldoCentimos.toString(), version: previous.version, confirmedAt: previous.confirmedAt.toISOString() } }
      }
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${input.cuentaId} AS text), 2301023))`)
      const account = await tx.cuentaBancaria.findUnique({ where: { id: input.cuentaId }, select: { id: true, activa: true, fechaCorteExtracto: true } }) as AccountRow | null
      if (!account) fail(404, 'CUENTA_NO_ENCONTRADA', 'La cuenta bancaria no existe.')
      if (!account.activa) fail(409,'CUENTA_INACTIVA','La cuenta está inactiva.')
      const latest = await tx.corteCoberturaManualB3.findFirst({ where: { cuentaId: input.cuentaId }, orderBy: { version: 'desc' } })
      const currentManual = latest ? {
        id: latest.id, version: latest.version, cutoffDate: latest.fechaCorte.toISOString().slice(0, 10), balanceCents: Number(latest.saldoCentimos), confirmedAt: latest.confirmedAt.toISOString(), actorId: latest.actorId,
      } : null
      const currentSourceVersion = sourceVersion(account, currentManual)
      if (input.sourceVersion !== currentSourceVersion) fail(409, 'SOURCE_VERSION_CONFLICT', 'La cobertura de la cuenta cambió; vuelva a leer antes de confirmar.')
      const created = await tx.corteCoberturaManualB3.create({ data: {
        cuentaId: input.cuentaId, fechaCorte: asDate(input.fechaCorte), saldoCentimos: BigInt(input.saldo), motivo: input.motivo,
        nota: input.nota, actorId, idempotencyKey: input.idempotencyKey, payloadHash, sourceVersion: input.sourceVersion,
        version: (latest?.version ?? 0) + 1,
      } })
      return { ok: true, idempotent: false, cutoff: { id: created.id, cuentaId: created.cuentaId, fechaCorte: created.fechaCorte.toISOString().slice(0, 10), saldoCentimos: created.saldoCentimos.toString(), version: created.version, confirmedAt: created.confirmedAt.toISOString() } }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })
  } catch (error: any) {
    if (error instanceof CutoffServiceError) throw error
    if (error?.code === 'P2002' || error?.code === 'P2034') fail(409, 'CONCURRENT_CONFLICT', 'Conflicto concurrente al confirmar el corte; vuelva a leer la cuenta.')
    throw error
  }
}
