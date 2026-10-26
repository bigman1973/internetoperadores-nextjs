import { cache } from 'react'
import prisma from '@/lib/prisma'

const STAGING_DATABASE = 'io_staging_finanzas'
const STAGING_USER = 'io_staging_finanzas'
const PRODUCTION_DATABASE = 'railway'
const PRODUCTION_USER = 'postgres'
const PRODUCTION_HOST = 'yamanote.proxy.rlwy.net'
const PRODUCTION_PORT = '34880'

export type FinanceEasyRuntime = 'staging' | 'production'
export type FinanceEasyProfileRuntime = FinanceEasyRuntime

export type FinanceEasyRuntimeInput = Readonly<{
  stagingSandbox?: string
  vercelEnvironment?: string
  easyProductionEnabled?: string
  modelProductionEnabled?: string
  automaticLinksDisabled?: string
  productionReadOnly?: string
  databaseUrl?: string
}>

export type FinanceEasyRuntimeContext = Readonly<{
  runtime: FinanceEasyRuntime
  stagingOnly: boolean
}>

export class PrototypeStagingError extends Error {
  readonly status = 404
  readonly code = 'STAGING_PROTOTYPE_ONLY'
  constructor() { super('Este prototipo sólo está disponible en staging aislado.') }
}

export class FinanceEasyRuntimeError extends Error {
  readonly status = 404
  readonly code = 'FINANCE_EASY_RUNTIME_DISABLED'
  constructor() { super('Modo fácil y reparto no están habilitados para este entorno financiero.') }
}

function databaseUrl(input: FinanceEasyRuntimeInput): URL | null {
  try {
    const url = new URL(input.databaseUrl ?? '')
    return ['postgres:', 'postgresql:'].includes(url.protocol) ? url : null
  } catch {
    return null
  }
}

function configuredStaging(input: FinanceEasyRuntimeInput, url: URL): boolean {
  // Production opt-ins are invalid in the isolated sandbox. A copied/mislabeled
  // production configuration must not silently become a staging deployment.
  const noProductionOptIns = [input.easyProductionEnabled, input.modelProductionEnabled]
    .every(value => value === undefined || value === '0')
  return input.stagingSandbox === '1'
    && input.vercelEnvironment !== 'production'
    && input.productionReadOnly !== '1'
    && noProductionOptIns
    && url.pathname === `/${STAGING_DATABASE}`
    && decodeURIComponent(url.username) === STAGING_USER
}

function configuredProduction(input: FinanceEasyRuntimeInput, url: URL): boolean {
  // This is deliberately a three-flag opt-in. FINANCE_STAGING_SANDBOX is never
  // a production fallback and the private read-only executor cannot mount UI.
  const noStagingLabel = input.stagingSandbox === undefined || input.stagingSandbox === '0'
  return noStagingLabel
    && input.vercelEnvironment === 'production'
    && input.easyProductionEnabled === '1'
    && input.modelProductionEnabled === '1'
    && input.automaticLinksDisabled === '1'
    && input.productionReadOnly !== '1'
    && url.hostname === PRODUCTION_HOST
    && url.port === PRODUCTION_PORT
    && url.pathname === `/${PRODUCTION_DATABASE}`
    && decodeURIComponent(url.username) === PRODUCTION_USER
}

/**
 * Read-only fence for the append-only minimal-access profile. It intentionally
 * does not require FINANCE_EASY_PRODUCTION_ENABLED and accepts the private
 * read-only executor: disabling the promoted UI must never restore a broader
 * legacy role for a user with MODO_FACIL_ONLY.
 */
function configuredProfileProduction(input: FinanceEasyRuntimeInput, url: URL): boolean {
  const noStagingLabel = input.stagingSandbox === undefined || input.stagingSandbox === '0'
  return noStagingLabel
    && input.vercelEnvironment === 'production'
    && input.modelProductionEnabled === '1'
    && input.automaticLinksDisabled === '1'
    && url.hostname === PRODUCTION_HOST
    && url.port === PRODUCTION_PORT
    && url.pathname === `/${PRODUCTION_DATABASE}`
    && decodeURIComponent(url.username) === PRODUCTION_USER
}

/**
 * Pure server-configuration classifier. It deliberately has no request, host
 * header, window location or database side effect. A null result is fail-closed.
 */
export function classifyFinanceEasyRuntime(input: FinanceEasyRuntimeInput): FinanceEasyRuntime | null {
  const url = databaseUrl(input)
  if (!url) return null
  if (configuredStaging(input, url)) return 'staging'
  if (configuredProduction(input, url)) return 'production'
  return null
}

/** Pure classifier for the live minimal-access profile lookup. */
export function classifyFinanceEasyProfileRuntime(input: FinanceEasyRuntimeInput): FinanceEasyProfileRuntime | null {
  const url = databaseUrl(input)
  if (!url) return null
  if (configuredStaging(input, url)) return 'staging'
  if (configuredProfileProduction(input, url)) return 'production'
  return null
}

function runtimeInputFromProcess(): FinanceEasyRuntimeInput {
  return {
    stagingSandbox: process.env.FINANCE_STAGING_SANDBOX,
    vercelEnvironment: process.env.VERCEL_ENV,
    easyProductionEnabled: process.env.FINANCE_EASY_PRODUCTION_ENABLED,
    modelProductionEnabled: process.env.FINANCE_MODEL_PRODUCTION_ENABLED,
    automaticLinksDisabled: process.env.FINANCE_AUTOMATIC_LINKS_DISABLED,
    productionReadOnly: process.env.IO_PRODUCTION_READ_ONLY,
    databaseUrl: process.env.DATABASE_URL,
  }
}

const liveIdentity = cache(async function liveIdentity(): Promise<{ databaseName: string; databaseUser: string } | null> {
  const rows = await prisma.$queryRaw<Array<{ database_name: string; database_user: string }>>`
    SELECT current_database() AS database_name, current_user AS database_user LIMIT 1
  `
  return rows.length === 1 ? { databaseName: rows[0].database_name, databaseUser: rows[0].database_user } : null
})

function expectedIdentity(runtime: FinanceEasyRuntime) {
  return runtime === 'staging'
    ? { databaseName: STAGING_DATABASE, databaseUser: STAGING_USER }
    : { databaseName: PRODUCTION_DATABASE, databaseUser: PRODUCTION_USER }
}

/**
 * Returns a server-derived context only after configuration and current_database
 * / current_user agree. It performs one SELECT and never creates policy, links,
 * confirmations, jobs, syncs, mail, or other external side effects.
 */
export async function getFinanceEasyRuntimeContext(): Promise<FinanceEasyRuntimeContext | null> {
  const runtime = classifyFinanceEasyRuntime(runtimeInputFromProcess())
  if (!runtime) return null
  const identity = await liveIdentity()
  const expected = expectedIdentity(runtime)
  if (!identity || identity.databaseName !== expected.databaseName || identity.databaseUser !== expected.databaseUser) return null
  return { runtime, stagingOnly: runtime === 'staging' }
}

/**
 * Server-only read fence used before enforcing MODO_FACIL_ONLY. It is separate
 * from the feature opt-in so a production rollback hides Modo fácil without
 * widening legacy access. A failed identity check returns null for callers to
 * turn into a fail-closed response.
 */
export async function getFinanceEasyProfileRuntime(): Promise<FinanceEasyProfileRuntime | null> {
  const runtime = classifyFinanceEasyProfileRuntime(runtimeInputFromProcess())
  if (!runtime) return null
  const identity = await liveIdentity()
  const expected = expectedIdentity(runtime)
  if (!identity || identity.databaseName !== expected.databaseName || identity.databaseUser !== expected.databaseUser) return null
  return runtime
}

/**
 * Strict fence retained for Telefonía/SOFÍA, automation, diagnostics and every
 * *-stage/*-staging/import/test PostgreSQL script. Do not replace this function
 * with the promoted guard: only selected Modo fácil, Para pedir and Reparto
 * services may call assertFinanceEasyRuntime.
 */
export async function assertPrototypeStaging(): Promise<void> {
  const runtime = classifyFinanceEasyRuntime(runtimeInputFromProcess())
  if (runtime !== 'staging') throw new PrototypeStagingError()
  const identity = await liveIdentity()
  if (!identity || identity.databaseName !== STAGING_DATABASE || identity.databaseUser !== STAGING_USER) {
    throw new PrototypeStagingError()
  }
}

/**
 * Guard for the explicitly promoted scope only. Production requires all three
 * opt-ins, the exact Railway URL identity and an independent live identity
 * query. It never accepts client parameters or a deployment hostname.
 */
export async function assertFinanceEasyRuntime(): Promise<FinanceEasyRuntimeContext> {
  const context = await getFinanceEasyRuntimeContext()
  if (!context) throw new FinanceEasyRuntimeError()
  return context
}

/** Throws closed when the minimal-profile lookup cannot establish its DB target. */
export async function assertFinanceEasyProfileRuntime(): Promise<FinanceEasyProfileRuntime> {
  const runtime = await getFinanceEasyProfileRuntime()
  if (!runtime) throw new FinanceEasyRuntimeError()
  return runtime
}

/** Production-only helper for the manually invoked profile configuration tool. */
export async function assertFinanceEasyProduction(): Promise<FinanceEasyRuntimeContext> {
  const context = await assertFinanceEasyRuntime()
  if (context.runtime !== 'production') throw new FinanceEasyRuntimeError()
  return context
}
