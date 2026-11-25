export const dynamic = 'force-dynamic'
export const revalidate = 0
import { requireAuth } from '@/lib/middleware/auth'
import { readDashboardForSession } from '@/lib/area4/dashboard-server'
import DashboardClient from '@/components/admin/DashboardClient'
export default async function AdminDashboard() {
  const session = await requireAuth('admin')
  const model = await readDashboardForSession(session)
  return <DashboardClient model={model} />
}
