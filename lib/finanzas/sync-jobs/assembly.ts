/*
 * P2 runtime assembly — copy to lib/finanzas/sync-jobs/assembly.ts.
 *
 * This module performs no provider network call when imported or when a service is
 * constructed. Network work begins only in a claimed worker job's inventory/prepare.
 * It deliberately does not configure cron, middleware, a database migration, Git, or
 * Vercel. Those changes are parent-owned integration steps.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read'
import { prisma } from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import {
  downloadFile,
  listFolderContents,
  resolveInvoiceLibrary as resolveInvoiceLibraryContext,
} from '@/lib/finanzas/microsoft-graph'
import ispApiRequest from '@/lib/ispgestion/service'

import { HttpGuardError, PRIVATE_NO_STORE, readJsonLimited, sameOrigin, validCronBearer } from './api-guards'
import { PrismaFinanceSyncRepository } from './prisma-repository'
import { FinanceSyncService, FINANCE_SYNC_PERMISSION, SyncServiceError } from './service'
import { createProviderFactory, manualSourceEnabled, runtimeMode, type FinanceSyncEnvironment } from './runtime'
import type { FinanceSyncRepository } from './repository'
import type { SyncProvider, SyncProviderFactory, SyncSource } from './types'
import { OneDriveSyncProvider } from './providers/onedrive/provider'
import { createPrismaOneDriveDomain } from './providers/onedrive/prisma-domain'
import { SyncProviderError } from './providers/onedrive/types'
import { createIspIssuedInvoiceProvider } from './providers/isp/isp-issued-invoice-provider'
import { extraerDatosFactura } from '@/lib/finanzas/ocr-facturas'
import { validarResultadoOcrNuevo } from '@/lib/finanzas/invoice-quality'

/**
 * Existing B1 helpers retain the project-owned Microsoft credential and strict
 * site/drive resolution behavior. The token helper is deliberately re-exported
 * for approved server scripts; calling it is not part of provider construction.
 */
export { getAccessToken as getGraphAccessToken } from '@/lib/finanzas/microsoft-graph'
export { resolveInvoiceLibraryContext }

export const P2_AREAS: Readonly<Record<SyncSource, string>> = FINANCE_SYNC_PERMISSION
const LEGACY_P2_ROLES: string[] = []
type Tx = Prisma.TransactionClient
type Env = FinanceSyncEnvironment

type ProviderBuilders = Partial<Record<SyncSource, () => SyncProvider>>

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE })
}

function cleanEnvValue(value: string | undefined): string | null {
  const text = value?.trim()
  return text ? text : null
}

function configuredSystemActorId(env: Env): number {
  // This is a server-only production configuration value, never a request field.
  // Decimal-only parsing prevents a permissive Number() conversion from accepting
  // signs, whitespace, exponents, fractions, or a coerced zero/null identity.
  const raw = cleanEnvValue(env.FINANCE_SYNC_SYSTEM_ACTOR_ID)
  if (!raw || !/^[1-9]\d*$/.test(raw)) throw new Error('FINANCE_SYNC_SYSTEM_ACTOR_REQUIRED')
  const actorId = Number(raw)
  if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new Error('FINANCE_SYNC_SYSTEM_ACTOR_REQUIRED')
  return actorId
}

/**
 * Required only for daily scheduling in production. It performs a live DB check
 * rather than trusting a stale deployment setting: the configured private actor
 * must be an active SUPER_ADMIN and have write authorization for *both* P2
 * sources. The returned ID is persisted by the repository on DAILY_UTC jobs so
 * a worker never reaches provider/apply with a silent `actorId: null`.
 */
export async function requireProductionSystemActor(
  client: PrismaClient = prisma,
  env: Env = process.env,
): Promise<number> {
  if (runtimeMode(env) !== 'production') throw new Error('FINANCE_SYNC_SYSTEM_ACTOR_REQUIRED')
  const actorId = configuredSystemActorId(env)
  const actor = await client.usuarioAdmin.findUnique({
    where: { id: actorId },
    select: { id: true, activo: true, rol: true },
  })
  if (!actor?.activo || actor.rol !== 'SUPER_ADMIN') throw new Error('FINANCE_SYNC_SYSTEM_ACTOR_INVALID')
  const permissions = await Promise.all(
    (Object.keys(P2_AREAS) as SyncSource[]).map((source) => verificarPermisoServer(actor.id, P2_AREAS[source], actor.rol, client)),
  )
  if (permissions.some((permission) => !permission.escritura)) throw new Error('FINANCE_SYNC_SYSTEM_ACTOR_FORBIDDEN')
  return actor.id
}

/**
 * B1's already-approved acknowledgement is usable only for the configured
 * library binding. The provider also compares it to the resolved item drive ID
 * at apply time. Missing/mismatched acknowledgement remains fail-closed.
 */
export function approvedHistoricalDriveId(env: Env = process.env): string | null {
  const approved = cleanEnvValue(env.SHAREPOINT_DRIVE_CONFIRMED)
  const primary = cleanEnvValue(env.SHAREPOINT_DRIVE_ID)
  const alias = cleanEnvValue(env.DRIVE_ID)
  if (!approved || !primary || (alias && alias !== primary)) return null
  return approved === primary ? approved : null
}

/**
 * Thin read-only port over the established B1 Graph helpers. In particular, it
 * does not instantiate a second Graph credential configuration with a guessed
 * siteId/driveId. resolveInvoiceLibraryContext verifies the actual configured
 * site + drive + root before inventory; its own calls obtain Graph access tokens.
 */
export function createExistingB1GraphReadPort() {
  return {
    async resolveInvoiceLibrary() {
      const context = await resolveInvoiceLibraryContext()
      return { driveId: context.driveId, siteId: context.siteId, rootPath: context.rootPath }
    },
    async listFolderContents(driveId: string, folderPath: string, recursive: boolean) {
      return listFolderContents(driveId, folderPath, recursive)
    },
    async downloadFile(driveId: string, itemId: string, maxBytes: number) {
      const bytes = await downloadFile(driveId, itemId)
      // The established helper owns the authenticated download. P2 never persists
      // this buffer, and rejects it immediately when the provider's fixed bound is
      // exceeded. No URL, token, or provider response is retained.
      if (bytes.byteLength > maxBytes) throw new SyncProviderError('GRAPH_RESPONSE_TOO_LARGE')
      return new Uint8Array(bytes)
    },
  }
}

/** Production-only OneDrive construction. It makes no external request itself. */
export function createProductionOneDriveProvider(client: PrismaClient, env: Env = process.env): SyncProvider {
  if (
    env.VERCEL_ENV !== 'production' ||
    env.FINANCE_BACKGROUND_SYNC_ENABLED !== '1' ||
    env.FINANCE_ONEDRIVE_SYNC_ENABLED !== '1'
  ) throw new Error('FINANCE_ONEDRIVE_SYNC_DISABLED')

  return new OneDriveSyncProvider({
    read: createExistingB1GraphReadPort(),
    domain: createPrismaOneDriveDomain(client),
    ocr: { extract: extraerDatosFactura, validateNew: validarResultadoOcrNuevo },
    // This comes only from the server-approved B1 acknowledgement. It is never
    // accepted in request JSON. A current resolved drive mismatch yields REVISAR.
    historicalLibraryConfirmedDriveId: approvedHistoricalDriveId(env),
  }) as SyncProvider
}

/** Production-only ISP construction. The provider permits only GET facturacion. */
export function createProductionIspProvider(env: Env = process.env): SyncProvider {
  if (
    env.VERCEL_ENV !== 'production' ||
    env.FINANCE_BACKGROUND_SYNC_ENABLED !== '1' ||
    env.FINANCE_ISP_SYNC_ENABLED !== '1'
  ) throw new Error('FINANCE_ISP_SYNC_DISABLED')

  return createIspIssuedInvoiceProvider({
    // `createIspIssuedInvoiceProvider` fixes endpoint/method/payload/limit in its
    // typed contract; this is the project's already-demonstrated request adapter,
    // not its legacy batch/remittance synchronizer.
    request: async (endpoint, method, data, params) => ispApiRequest(endpoint, method, data, params),
    allowExistingIdentityLink: false,
    createB4WrapperForNewInvoices: true,
  })
}

function productionProviders(client: PrismaClient, env: Env, trusted: ProviderBuilders): SyncProviderFactory {
  return (source) => {
    // Overrides are reachable only through a direct server-side constructor
    // argument. No route reads providers, flags, scopes, or fixtures from a request.
    const injected = trusted[source]
    if (injected) return injected()
    return source === 'ONEDRIVE'
      ? createProductionOneDriveProvider(client, env)
      : createProductionIspProvider(env)
  }
}

/**
 * Live authorization used inside repository-managed transactions. Requests are
 * authorized at the API edge and again here immediately before create/cancel/apply
 * state/domain changes. Cron jobs have no human actor; that path is allowed only
 * after the cron route's secret and production gates, and provider/domain rules
 * still decide whether actor-null work is permissible.
 */
export async function authorizeP2ActorInTx(
  input: { actorId: number | null; source: SyncSource; operation: 'create' | 'cancel' | 'apply' },
  tx: Tx,
): Promise<void> {
  if (input.actorId === null) {
    throw new Error('SYNC_ACTOR_REQUIRED')
  }
  const actor = await tx.usuarioAdmin.findUnique({
    where: { id: input.actorId },
    select: { id: true, activo: true, rol: true },
  })
  if (!actor?.activo) throw new Error('SYNC_ACTOR_INACTIVE')
  const permission = await verificarPermisoServer(actor.id, P2_AREAS[input.source], actor.rol, tx)
  if (!permission.escritura) throw new Error('SYNC_PERMISSION_REVOKED')
}

/**
 * Adds the daily-system identity invariant to the regular live permission
 * check. It is used by worker/daily route runtimes only after
 * requireProductionSystemActor() has validated the same actor outside the
 * transaction. Rechecking here closes the time-of-check/time-of-apply window.
 */
function createP2TransactionAuthorizer(systemActorId?: number) {
  return async (
    input: { actorId: number | null; source: SyncSource; operation: 'create' | 'cancel' | 'apply' },
    tx: Tx,
  ) => {
    await authorizeP2ActorInTx(input, tx)
    if (systemActorId !== undefined && input.actorId === systemActorId) {
      const actor = await tx.usuarioAdmin.findUnique({
        where: { id: systemActorId },
        select: { activo: true, rol: true },
      })
      if (!actor?.activo || actor.rol !== 'SUPER_ADMIN') throw new Error('FINANCE_SYNC_SYSTEM_ACTOR_INVALID')
      const permission = await verificarPermisoServer(systemActorId, P2_AREAS[input.source], actor.rol, tx)
      if (!permission.escritura) throw new Error('FINANCE_SYNC_SYSTEM_ACTOR_FORBIDDEN')
    }
  }
}

export type P2ServiceRuntimeOptions = {
  prisma?: PrismaClient
  env?: Env
  repository?: FinanceSyncRepository<Tx>
  /** Live-validated private system actor used only by DAILY_UTC persistence/worker. */
  systemActorId?: number
  /**
   * Supplied only after an application DB isolation check. It is never derived
   * from a browser request or an environment assertion alone.
   */
  stagingIsolationVerified?: boolean
  /**
   * Server-script/test hook only. Route factories below never pass this input.
   * Runtime source flags are still enforced before a production factory is used.
   */
  trustedProviders?: ProviderBuilders
}

/**
 * Constructs the P2 service without starting a timer, worker, network operation,
 * or external call. Production provider construction remains lazy until a worker
 * claims a job and selects its source.
 */
export function createP2Service(options: P2ServiceRuntimeOptions = {}): FinanceSyncService<Tx> {
  const env = options.env ?? process.env
  const client = options.prisma ?? prisma
  const repository = options.repository ?? new PrismaFinanceSyncRepository(client, {
    // The repository writes this only to new DAILY_UTC jobs. Manual jobs always
    // retain the API session actor supplied to createManualJob.
    dailyActorId: options.systemActorId,
  })
  const providerFactory = createProviderFactory({
    env,
    productionFactory: productionProviders(client, env, options.trustedProviders ?? {}),
    stagingIsolationVerified: options.stagingIsolationVerified,
    // Intentionally empty in staging. Metadata fixtures are only supplied by the
    // explicit test constructor below, never from an HTTP payload or environment.
    staging: {},
  })
  return new FinanceSyncService({ repository, providerFactory, authorizeInTx: createP2TransactionAuthorizer(options.systemActorId) })
}

/**
 * Explicit trusted test/script constructor. It bypasses runtime mode only for
 * callers that import this server module directly; no HTTP handler exposes it.
 */
export function createP2ServiceForTest(input: {
  repository: FinanceSyncRepository<Tx>
  providers: Record<SyncSource, () => SyncProvider>
  authorizeInTx?: typeof authorizeP2ActorInTx
}): FinanceSyncService<Tx> {
  return new FinanceSyncService({
    repository: input.repository,
    providerFactory: (source) => input.providers[source](),
    authorizeInTx: input.authorizeInTx ?? authorizeP2ActorInTx,
  })
}

/** Same DB/user proof as B1 staging, kept independent of client-controlled input. */
export async function verifyP2StagingIsolation(client: PrismaClient = prisma, env: Env = process.env): Promise<boolean> {
  if (env.FINANCE_STAGING_SANDBOX !== '1') return false
  try {
    const rows = await client.$queryRaw<Array<{ db: string; usuario: string }>>`
      SELECT current_database() AS db, current_user AS usuario
    `
    return rows[0]?.db === 'io_staging_finanzas' && rows[0]?.usuario === 'io_staging_finanzas'
  } catch {
    return false
  }
}

export type P2RouteRuntime = {
  service: FinanceSyncService<Tx>
  sourceEnabled(source: SyncSource): boolean
  productionBackgroundEnabled(): boolean
}

function productionBackgroundConfigured(env: Env = process.env): boolean {
  // Daily always queues both sources; treating this as an all-or-nothing pair
  // prevents a durable job from being enqueued for a source whose worker factory
  // is intentionally disabled.
  return runtimeMode(env) === 'production'
    && env.FINANCE_ONEDRIVE_SYNC_ENABLED === '1'
    && env.FINANCE_ISP_SYNC_ENABLED === '1'
}

/** Route-only runtime assembly: staging proof is checked before the inert provider is selectable. */
export async function createP2RouteRuntime(input: { systemActorId?: number } = {}): Promise<P2RouteRuntime> {
  const env = process.env
  const stagingIsolationVerified = runtimeMode(env) === 'staging'
    ? await verifyP2StagingIsolation(prisma, env)
    : false
  return {
    service: createP2Service({ prisma, env, stagingIsolationVerified, systemActorId: input.systemActorId }),
    sourceEnabled: (source) => manualSourceEnabled({ env, source, stagingIsolationVerified }),
    productionBackgroundEnabled: () => productionBackgroundConfigured(env),
  }
}

/**
 * Programmatic construction correctly throws if staging isolation is absent. API
 * routes call this first so an unverified staging request is simply disabled,
 * without constructing any provider factory.
 */
async function p2RouteAvailable(): Promise<boolean> {
  if (runtimeMode(process.env) !== 'staging') return true
  return verifyP2StagingIsolation(prisma, process.env)
}

type RouteAccess = {
  actorId: number
  canRead(source: SyncSource): Promise<boolean>
  canWrite(source: SyncSource): Promise<boolean>
}

/** Session + active-account + project admin-area wrappers; no JWT-only authorization. */
async function sessionAccess(): Promise<RouteAccess | null> {
  const session = await getServerSession(authOptions)
  const actorId = Number(session?.user?.id)
  if (session?.user?.userType !== 'admin' || !Number.isSafeInteger(actorId) || actorId <= 0) return null
  const actor = await prisma.usuarioAdmin.findUnique({ where: { id: actorId }, select: { activo: true } })
  if (!actor?.activo) return null
  return {
    actorId,
    canRead: async (source) => !(await checkAdminAreaRead(P2_AREAS[source], LEGACY_P2_ROLES, session)),
    canWrite: async (source) => !(await checkAdminAreaWrite(P2_AREAS[source], LEGACY_P2_ROLES, session)),
  }
}

function source(value: unknown): SyncSource | null {
  return value === 'ONEDRIVE' || value === 'ISP' ? value : null
}
function isPlainEmptyObject(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0
}
function hasOnlyKeys(body: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(body).every((key) => keys.includes(key))
}
function apiError(cause: unknown) {
  if (cause instanceof HttpGuardError) return privateJson({ error: cause.code }, cause.status)
  if (cause instanceof SyncServiceError) {
    if (cause.code === 'ACTIVE_JOB') return privateJson({ error: cause.code, activeJob: cause.job }, 409)
    return privateJson({ error: cause.code }, cause.code === 'NOT_FOUND' ? 404 : 409)
  }
  // No source rows, SQL, URLs, identity or exception message enter logs.
  const code = cause && typeof cause === 'object' && 'code' in cause
    && typeof cause.code === 'string' && /^[A-Z0-9_]{2,64}$/.test(cause.code)
    ? cause.code : 'SYNC_REQUEST_FAILED'
  console.warn('[finance-sync]', code)
  if (code === 'P2034') return privateJson({ error: 'SYNC_BUSY_RETRY' }, 409)
  return privateJson({ error: 'SYNC_REQUEST_FAILED' }, 500)
}

/**
 * Exact closed UI contract for /api/admin/finanzas/sync-jobs. PATCH authenticates
 * before getJob so unauthenticated input can never probe job existence.
 */
export function financeSyncJobsRoute() {
  return {
    async GET(req: NextRequest) {
      try {
        const requested = source(req.nextUrl.searchParams.get('source'))
        if (!requested) return privateJson({ error: 'INVALID_SOURCE' }, 400)
        const access = await sessionAccess()
        if (!access) return privateJson({ error: 'UNAUTHORIZED' }, 401)
        if (!await access.canRead(requested)) return privateJson({ error: 'FORBIDDEN' }, 403)
        if (!await p2RouteAvailable()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
        const runtime = await createP2RouteRuntime()
        return privateJson(await runtime.service.dashboard(requested, {
          enabled: runtime.sourceEnabled(requested),
          canWrite: await access.canWrite(requested),
        }))
      } catch (cause) { return apiError(cause) }
    },

    async POST(req: NextRequest) {
      try {
        if (!sameOrigin(req)) return privateJson({ error: 'INVALID_ORIGIN' }, 403)
        const parsed = await readJsonLimited(req)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return privateJson({ error: 'INVALID_REQUEST' }, 400)
        const body = parsed as Record<string, unknown>
        const requested = source(body.source)
        // Scope is deliberately closed: callers may send only an empty object for
        // backwards-compatible UI shape, but server-verified configuration is the
        // sole scope used in the idempotency hash and persisted job.
        if (
          !hasOnlyKeys(body, ['source', 'idempotencyKey', 'scope']) ||
          !requested || typeof body.idempotencyKey !== 'string' ||
          (Object.prototype.hasOwnProperty.call(body, 'scope') && !isPlainEmptyObject(body.scope))
        ) return privateJson({ error: 'INVALID_REQUEST' }, 400)
        const access = await sessionAccess()
        if (!access) return privateJson({ error: 'UNAUTHORIZED' }, 401)
        if (!await access.canWrite(requested)) return privateJson({ error: 'FORBIDDEN', area: P2_AREAS[requested] }, 403)
        if (!await p2RouteAvailable()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
        const runtime = await createP2RouteRuntime()
        if (!runtime.sourceEnabled(requested)) return privateJson({ error: 'SYNC_DISABLED' }, 503)
        const created = await runtime.service.createManualJob({
          actorId: access.actorId,
          source: requested,
          idempotencyKey: body.idempotencyKey,
          scope: {},
        })
        return privateJson({ job: created.job, replay: created.replay }, 202)
      } catch (cause) { return apiError(cause) }
    },

    async PATCH(req: NextRequest) {
      try {
        if (!sameOrigin(req)) return privateJson({ error: 'INVALID_ORIGIN' }, 403)
        const parsed = await readJsonLimited(req)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return privateJson({ error: 'INVALID_REQUEST' }, 400)
        const body = parsed as Record<string, unknown>
        if (!hasOnlyKeys(body, ['id', 'action']) || typeof body.id !== 'string' || body.action !== 'CANCEL') {
          return privateJson({ error: 'INVALID_REQUEST' }, 400)
        }
        // Authentication deliberately precedes the lookup. The job lookup remains
        // necessary only to discover the source whose permission must be evaluated.
        const access = await sessionAccess()
        if (!access) return privateJson({ error: 'UNAUTHORIZED' }, 401)
        if (!await p2RouteAvailable()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
        const runtime = await createP2RouteRuntime()
        const job = await runtime.service.getJob(body.id)
        if (!job) return privateJson({ error: 'NOT_FOUND' }, 404)
        if (!await access.canWrite(job.source)) return privateJson({ error: 'FORBIDDEN' }, 403)
        return privateJson({ job: await runtime.service.cancel({ id: body.id, actorId: access.actorId }) })
      } catch (cause) { return apiError(cause) }
    },
  }
}

/** GET /api/cron/finance-sync-worker — no self-fetch, timer, or error detail. */
export function financeSyncWorkerCronRoute() {
  return async function GET(req: NextRequest) {
    if (!validCronBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
      return privateJson({ error: 'UNAUTHORIZED' }, 401)
    }
    try {
      if (!await p2RouteAvailable()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
      if (!productionBackgroundConfigured()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
      // Fail closed before claiming any job. The same live actor check is also
      // performed by the transaction callback immediately before every apply.
      const systemActorId = await requireProductionSystemActor()
      const runtime = await createP2RouteRuntime({ systemActorId })
      if (!runtime.productionBackgroundEnabled()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
      return privateJson(await runtime.service.runBudgetedWorker({ budgetMs: 220_000, itemLimit: 80, inventoryPageLimit: 16 }))
    } catch {
      return privateJson({ error: 'SYNC_WORKER_FAILED' }, 503)
    }
  }
}

/** GET /api/cron/finance-sync-daily — production-only durable daily enqueue. */
export function financeSyncDailyCronRoute() {
  return async function GET(req: NextRequest) {
    if (!validCronBearer(req.headers.get('authorization'), process.env.CRON_SECRET)) {
      return privateJson({ error: 'UNAUTHORIZED' }, 401)
    }
    try {
      if (!await p2RouteAvailable()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
      if (!productionBackgroundConfigured()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
      // No daily receipt/job is written unless this private configured identity
      // exists live, remains active SUPER_ADMIN, and retains both source writes.
      const systemActorId = await requireProductionSystemActor()
      const runtime = await createP2RouteRuntime({ systemActorId })
      if (!runtime.productionBackgroundEnabled()) return privateJson({ error: 'SYNC_DISABLED' }, 503)
      const dateUtc = new Date().toISOString().slice(0, 10)
      return privateJson({ jobs: await runtime.service.enqueueDaily(dateUtc) }, 202)
    } catch {
      return privateJson({ error: 'SYNC_DAILY_FAILED' }, 503)
    }
  }
}
