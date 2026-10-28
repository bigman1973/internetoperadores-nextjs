import type { Prisma } from '@prisma/client'
import { financeEnvironment } from '@/lib/finanzas/finance-environment'

export type ConciliarRuntime = 'staging' | 'production'
export type ConciliarRuntimeContext = Readonly<{
  runtime: ConciliarRuntime
  stagingOnly: boolean
}>

export type ConciliarRuntimeInput = Readonly<{
  stagingSandbox?: string
  vercelEnvironment?: string
  easyProductionEnabled?: string
  modelProductionEnabled?: string
  automaticLinksDisabled?: string
  conciliarProductionEnabled?: string
  publicConciliarProductionEnabled?: string
  productionReadOnly?: string
  databaseUrl?: string
}>

export type ConciliarRuntimeIdentityClient = Pick<Prisma.TransactionClient, '$queryRaw'>

export class ConciliarRuntimeError extends Error {
  readonly status = 404
  readonly code = 'FINANCE_CONCILIAR_RUNTIME_DISABLED'
  constructor() { super('Conciliar no está habilitado para este entorno financiero.') }
}

function noProductionOptIns(input: ConciliarRuntimeInput): boolean {
  return [input.easyProductionEnabled, input.modelProductionEnabled]
    .every(value => value === undefined || value === '0')
}

/**
 * Pure configuration classifier. It deliberately accepts no request data and
 * does not open a connection. Production remains unavailable unless the
 * established Modo Fácil model flags, the Conciliar server flag, the public
 * presentation flag and the exact Railway identity all agree.
 */
export function classifyConciliarRuntime(input: ConciliarRuntimeInput): ConciliarRuntime | null {
  const financeRuntime = financeEnvironment({
    stagingSandbox: input.stagingSandbox,
    vercelEnvironment: input.vercelEnvironment,
    productionEnabled: input.modelProductionEnabled,
    automaticLinksDisabled: input.automaticLinksDisabled,
    databaseUrl: input.databaseUrl,
  })
  if (financeRuntime === 'staging') {
    return input.vercelEnvironment !== 'production' && noProductionOptIns(input) ? 'staging' : null
  }
  if (financeRuntime !== 'production') return null
  return input.easyProductionEnabled === '1'
    && input.conciliarProductionEnabled === '1'
    && input.publicConciliarProductionEnabled === '1'
    && input.productionReadOnly !== '1'
    ? 'production'
    : null
}

export function conciliarRuntimeInputFromProcess(): ConciliarRuntimeInput {
  return {
    stagingSandbox: process.env.FINANCE_STAGING_SANDBOX,
    vercelEnvironment: process.env.VERCEL_ENV,
    easyProductionEnabled: process.env.FINANCE_EASY_PRODUCTION_ENABLED,
    modelProductionEnabled: process.env.FINANCE_MODEL_PRODUCTION_ENABLED,
    automaticLinksDisabled: process.env.FINANCE_AUTOMATIC_LINKS_DISABLED,
    conciliarProductionEnabled: process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED,
    publicConciliarProductionEnabled: process.env.NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED,
    productionReadOnly: process.env.IO_PRODUCTION_READ_ONLY,
    databaseUrl: process.env.DATABASE_URL,
  }
}

/** Safe for presentation policy only; route authorization always uses the live guard below. */
export function conciliarRuntimeConfigured(): ConciliarRuntime | null {
  return classifyConciliarRuntime(conciliarRuntimeInputFromProcess())
}

/**
 * A client may use this only to hide a presentation surface. It receives a
 * server-derived runtime and can never enable an API, a write, or a permission.
 */
export function conciliarClientSurfaceEnabled(input: Readonly<{
  runtime: ConciliarRuntime | null
  publicConciliarProductionEnabled?: string
}>): boolean {
  return input.runtime === 'staging'
    || (input.runtime === 'production' && input.publicConciliarProductionEnabled === '1')
}

/**
 * Reuses the reviewed Modo Fácil runtime proof: all established production
 * flags and the exact URL are checked there, then current_database/current_user
 * are read from the caller's transaction when supplied. No policy, sync, mail
 * or background job is created by this guard.
 */
export async function getConciliarRuntimeContext(identityClient?: ConciliarRuntimeIdentityClient): Promise<ConciliarRuntimeContext | null> {
  const configured = conciliarRuntimeConfigured()
  if (!configured) return null
  const { getFinanceEasyRuntimeContext } = await import('@/lib/finanzas/prototype-staging')
  const context = await getFinanceEasyRuntimeContext(identityClient)
  if (!context || context.runtime !== configured) return null
  return { runtime: configured, stagingOnly: configured === 'staging' }
}

export async function assertConciliarRuntime(identityClient?: ConciliarRuntimeIdentityClient): Promise<ConciliarRuntimeContext> {
  const context = await getConciliarRuntimeContext(identityClient)
  if (!context) throw new ConciliarRuntimeError()
  return context
}
