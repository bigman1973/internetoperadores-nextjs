import type { FinanceSyncRepository } from './repository'
import type { SyncProviderFactory, SyncSource } from './types'
import { EmptyStagingProvider, type StagingProviderOptions } from './staging-provider'
import { FinanceSyncService, type FinanceSyncServiceDependencies } from './service'
import type { Logger } from './worker'

export type FinanceSyncEnvironment = Record<string, string | undefined>
export type RuntimeMode = 'production' | 'staging' | 'disabled'

export function runtimeMode(env: FinanceSyncEnvironment): RuntimeMode {
  if (env.FINANCE_STAGING_SANDBOX === '1') return 'staging'
  if (env.VERCEL_ENV === 'production' && env.FINANCE_BACKGROUND_SYNC_ENABLED === '1') return 'production'
  return 'disabled'
}

export function assertSourceEnabled(env: FinanceSyncEnvironment, source: SyncSource) {
  if (runtimeMode(env) !== 'production') throw new Error('FINANCE_BACKGROUND_SYNC_DISABLED')
  const flag = source === 'ONEDRIVE' ? env.FINANCE_ONEDRIVE_SYNC_ENABLED : env.FINANCE_ISP_SYNC_ENABLED
  if (flag !== '1') throw new Error('FINANCE_SYNC_DISABLED')
}

/**
 * Manual staging UI is allowed only after the same verified DB-isolation proof.
 * It runs the inert/injected fake provider, never a production adapter. Cron
 * routes still use `runtimeMode(...) === 'production'` and remain blocked.
 */
export function manualSourceEnabled(input: {
  env: FinanceSyncEnvironment
  source: SyncSource
  stagingIsolationVerified?: boolean
}): boolean {
  if (runtimeMode(input.env) === 'staging') return input.stagingIsolationVerified === true
  try { assertSourceEnabled(input.env, input.source); return true } catch { return false }
}

/**
 * Production must inject independently reviewed real adapters. Staging never
 * creates a Graph/ISP adapter. Its default provider has zero items; demo data is
 * allowed only by explicit test-only provider injection, never env auto-seeding.
 */
export function createProviderFactory(input: {
  env: FinanceSyncEnvironment
  productionFactory?: SyncProviderFactory
  staging?: StagingProviderOptions
  /** Result of the application’s DB-isolation guard, not an env assertion. */
  stagingIsolationVerified?: boolean
}): SyncProviderFactory {
  const mode = runtimeMode(input.env)
  if (mode === 'production') {
    if (!input.productionFactory) throw new Error('FINANCE_PROVIDER_FACTORY_MISSING')
    return (source) => {
      assertSourceEnabled(input.env, source)
      return input.productionFactory!(source)
    }
  }
  if (mode === 'staging') {
    if (input.stagingIsolationVerified !== true) throw new Error('STAGING_ISOLATION_REQUIRED')
    return () => new EmptyStagingProvider(input.staging)
  }
  return () => { throw new Error('FINANCE_BACKGROUND_SYNC_DISABLED') }
}

export function createFinanceSyncService<Tx>(deps: {
  repository: FinanceSyncRepository<Tx>
  providerFactory: SyncProviderFactory
  clock?: import('./repository').Clock
  authorizeInTx?: FinanceSyncServiceDependencies<Tx>['authorizeInTx']
  logger?: Logger
}) {
  // Deliberately a simple factory; no timer/background task is created here.
  return new FinanceSyncService(deps)
}
