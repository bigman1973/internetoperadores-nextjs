export const dynamic = 'force-dynamic'
export const revalidate = 0
import { requireAuth } from '@/lib/middleware/auth'
import { readDashboardForSession } from '@/lib/area4/dashboard-server'
import DashboardClient from '@/components/admin/DashboardClient'
export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ dashboardPersona?: string | string[] }> }) {
  const session = await requireAuth('admin')
  const params = await searchParams
  const model = await readDashboardForSession(session, new Date(), params.dashboardPersona)
  return <DashboardClient model={model} />
}
