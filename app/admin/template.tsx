import { Suspense, type ReactNode } from 'react'
import { headers } from 'next/headers'
import AdminLoading from '@/components/admin/AdminLoading'
import { ADMIN_RENDER_SURFACE_HEADER, CONCILIAR_READY_SURFACE } from '@/lib/admin-render-surface'

/** The page and layout still perform their own live authorization. This server
 * template selects presentation only, from a hint overwritten by middleware.
 * A global loading.tsx put the ready projection in hidden streaming segments;
 * revealing those segments required JavaScript before a single number appeared.
 */
export default async function AdminTemplate({ children }: { children: ReactNode }) {
  const requestHeaders = await headers()
  const readyProjection = process.env.FINANCE_STAGING_SANDBOX === '1'
    && requestHeaders.get(ADMIN_RENDER_SURFACE_HEADER) === CONCILIAR_READY_SURFACE
  if (readyProjection) return <>{children}</>
  return <Suspense fallback={<AdminLoading />}>{children}</Suspense>
}
