import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { verificarPermisoServer } from '@/lib/permisos'
import { area4RegisteredSurface } from '@/lib/area4/section-registry'
import { trustedImpersonationContextResolutionFromRequest } from '@/lib/impersonation-context'
import { financeEnvironment } from './finance-environment'
import { assertFinanceRuntimeReady } from './finance-runtime-safety'
import { analizarCuadreDia } from './conciliar-cuadre-dia'
import { exactCents, isoDay } from './bank-cutoffs-core'

export const NO_MOVEMENTS_ACTION = 'comprobar_sin_movimientos' as const
export const CUTOFF_ROUTE = '/api/admin/finanzas/cortes-cobertura'
const MAX_CHAIN_ROWS = 25_000
export type CutoffReadDb = { $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> }

/** Read-only evidence remains visible when deployment writes are disabled. */
export function noMovementsStagingReadable(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== 'staging'
    || env.FINANCE_STAGING_SANDBOX !== '1') return false
  try {
    return financeEnvironment({ stagingSandbox: env.FINANCE_STAGING_SANDBOX,
      vercelEnvironment: env.VERCEL_ENV, databaseUrl: env.DATABASE_URL }) === 'staging'
  } catch { return false }
}

/** Additional, feature-local fence: the general finance runtime also admits Production. */
export function noMovementsStagingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return noMovementsStagingReadable(env) && env.FINANCE_DEPLOYMENT_READ_ONLY !== '1'
    && env.IO_PRODUCTION_READ_ONLY !== '1'
}

export async function assertNoMovementsStaging(db?: any) {
  if (!noMovementsStagingEnabled()) throw new Error('NO_MOVEMENTS_STAGING_REQUIRED')
  await assertFinanceRuntimeReady(db)
}

export async function noMovementsWriteAllowed(db: any, actorId: number): Promise<boolean> {
  const match = area4RegisteredSurface(CUTOFF_ROUTE, 'api')
  if (!match || match.surface.path !== CUTOFF_ROUTE || !match.baseline) return false
  const actor = await db.usuarioAdmin.findUnique({ where: { id: actorId }, select: { id: true, activo: true, rol: true, roles: true } })
  if (!actor?.activo) return false
  // Existing registered surface ACL AND live B3. No client role is authority.
  const registry = await verificarPermisoServer(actorId, match.section.areaCode, actor.rol, db)
  if (!registry.lectura || !registry.escritura) return false
  const b3 = await verificarPermisoServer(actorId, 'admin.finanzas.importar', actor.rol, db)
  if (b3.lectura && b3.escritura) return true
  const granular = await db.permisoUsuario.count({ where: { usuarioId: actorId, OR: [{ lectura: true }, { escritura: true }] } })
  return granular === 0 && [actor.rol, ...(actor.roles ?? [])].includes('CONTABILIDAD')
}

export async function noMovementsOrdinaryRequest(): Promise<boolean> {
  const context = await trustedImpersonationContextResolutionFromRequest()
  return context.status === 'absent' // Invalid signed envelopes also fail closed.
}

export type NoMovementsSource = {
  accountId: string
  activa: boolean
  importedCutoffDate: string | null
  balanceText: string | null
  balanceDate: string | null
  movementCount: string
  movementHash: string | null
  importCount: string
  importHash: string | null
}

/** Small result; the fingerprint covers every apunte (including marked duplicates),
 * exact amount/balance, dates and imports, not just MAX(date)/COUNT. */
export async function readNoMovementsSources(db: CutoffReadDb, ids: readonly string[]): Promise<Map<string, NoMovementsSource>> {
  if (!ids.length) return new Map()
  const rows = await db.$queryRaw<NoMovementsSource[]>(Prisma.sql`
    SELECT c.id AS "accountId", c.activa, c.fecha_corte_extracto::date::text AS "importedCutoffDate",
      c.saldo_actual::text AS "balanceText", c.fecha_saldo::text AS "balanceDate",
      (SELECT COUNT(*)::text FROM movimientos_bancarios m WHERE m.cuenta_id=c.id) AS "movementCount",
      (SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(m.id,m.fecha_operacion,m.fecha_valor,m.importe::text,m.saldo::text,m.duplicado_de_id,m.created_at)::text, '|' ORDER BY m.id), 'UTF8')), 'hex')
        FROM movimientos_bancarios m WHERE m.cuenta_id=c.id) AS "movementHash",
      (SELECT COUNT(*)::text FROM importaciones_extracto i WHERE i.cuenta_id=c.id) AS "importCount",
      (SELECT encode(sha256(convert_to(string_agg(jsonb_build_array(i.id,i.mov_importados,i.mov_duplicados,i.fecha_primer_mov,i.fecha_ultimo_mov,i.created_at)::text, '|' ORDER BY i.id), 'UTF8')), 'hex')
        FROM importaciones_extracto i WHERE i.cuenta_id=c.id) AS "importHash"
    FROM cuentas_bancarias c WHERE c.id IN (${Prisma.join([...ids])})
    ORDER BY c.id LIMIT 100
  `)
  return new Map(rows.map(row => [row.accountId, row]))
}

export function noMovementsFingerprint(source: NoMovementsSource): string {
  return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex')
}

export function noMovementsEvidence(source: NoMovementsSource | undefined, manual: {
  comprobacionSinMovimientos?: boolean; sourceVersion?: string; cutoffDate: string; balanceCents: number
} | null): { fechaComprobadaSinMovimientos: string | null; comprobacionSinMovimientosObsoleta: boolean } {
  const marked = manual?.comprobacionSinMovimientos === true
  const valid = marked && source?.activa === true && isoDay(manual.cutoffDate) !== null
    && manual.sourceVersion === noMovementsFingerprint(source)
    && exactCents(source.balanceText) === manual.balanceCents
  return { fechaComprobadaSinMovimientos: valid ? manual!.cutoffDate : null,
    comprobacionSinMovimientosObsoleta: marked && !valid }
}

/** Reuses the existing chain reader's algorithm without relaxing it. The amount is
 * the exact CURRENT stored account balance, and must agree with the chain. */
export async function validateNoMovementsChain(db: CutoffReadDb, source: NoMovementsSource, cutoff: string, until: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ day: string; amount: string; balance: string | null }>>(Prisma.sql`
    SELECT fecha_operacion::date::text AS day, importe::text AS amount, saldo::text AS balance
    FROM movimientos_bancarios WHERE cuenta_id=${source.accountId} AND duplicado_de_id IS NULL
    ORDER BY fecha_operacion, created_at, id LIMIT ${MAX_CHAIN_ROWS + 1}
  `)
  if (!rows.length) throw new Error('SIN_MOVIMIENTOS_BASE')
  if (rows.length > MAX_CHAIN_ROWS) throw new Error('CADENA_LECTURA_LIMITADA')
  if (rows.some(row => !isoDay(row.day) || exactCents(row.amount) === null || (row.balance !== null && exactCents(row.balance) === null))) throw new Error('SALDO_NO_EXACTO')
  if (rows.some(row => row.day > cutoff && row.day <= until)) throw new Error('MOVIMIENTOS_EN_INTERVALO')
  const chain = analizarCuadreDia(rows.map(row => ({ dia: row.day, importe: exactCents(row.amount)! / 100,
    saldo: row.balance === null ? null : exactCents(row.balance)! / 100 })))
  if (!chain.cuadra || chain.huecos.length || chain.saldoFinalCentimos === null) throw new Error('CUENTA_NO_CUADRA')
  const balance = exactCents(source.balanceText)
  if (balance === null || balance !== chain.saldoFinalCentimos) throw new Error('SALDO_ACTUAL_NO_CUADRA')
  // A later actual apunte is not evidence of a no-activity interval's final balance.
  if (rows.some(row => row.day > until)) throw new Error('MOVIMIENTOS_POSTERIORES')
  if (!rows.some(row => row.day <= cutoff)) throw new Error('SIN_MOVIMIENTOS_BASE')
  return balance // Zero is a valid exact balance.
}
