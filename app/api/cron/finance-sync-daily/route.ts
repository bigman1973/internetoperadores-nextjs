import { financeSyncDailyCronRoute } from '@/lib/finanzas/sync-jobs/assembly'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const GET = financeSyncDailyCronRoute()
