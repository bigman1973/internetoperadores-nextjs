import { financeSyncJobsRoute } from '@/lib/finanzas/sync-jobs/assembly'

export const dynamic = 'force-dynamic'
export const { GET, POST, PATCH } = financeSyncJobsRoute()
