export const dynamic = "force-dynamic";
import { requireAuth } from '../../../lib/middleware/auth'
import HistorialDesarrollosClient from '../../../components/admin/HistorialDesarrollosClient'

export default async function HistorialPage() {
  await requireAuth('admin')
  
  return <HistorialDesarrollosClient />
}
