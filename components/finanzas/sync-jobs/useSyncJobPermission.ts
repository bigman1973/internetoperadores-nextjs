'use client'

import { usePermisoArea } from '@/hooks/usePermisoArea'
import type { SyncJobSource } from './sync-job-types'

/** Source-level area gates: server authorization remains authoritative. */
export const SYNC_JOB_AREA_BY_SOURCE: Readonly<Record<SyncJobSource, string>> = {
  ONEDRIVE: 'admin.finanzas.facturas',
  ISP: 'admin.facturacion',
}

export function useSyncJobPermission(source: SyncJobSource) {
  const area = SYNC_JOB_AREA_BY_SOURCE[source]
  const { canRead, canWrite } = usePermisoArea(area)
  return { area, canRead, canWrite }
}
