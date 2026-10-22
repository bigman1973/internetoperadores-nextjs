export type MiddlewareEnv = Record<string, string | undefined>

const P2_PATHS = new Set([
  '/api/admin/finanzas/sync-jobs',
  '/api/cron/finance-sync-worker',
  '/api/cron/finance-sync-daily',
])

/**
 * Integrate this exact exception ahead of the existing broad external-action
 * block. It is NOT authorization: route handlers still validate session/origin
 * or CRON_SECRET. No wildcard and no legacy /api/sync-facturas exception.
 */
export function isAllowedP2ExternalException(pathname: string, env: MiddlewareEnv): boolean {
  return P2_PATHS.has(pathname)
    && env.VERCEL_ENV === 'production'
    && env.FINANCE_BACKGROUND_SYNC_ENABLED === '1'
}
