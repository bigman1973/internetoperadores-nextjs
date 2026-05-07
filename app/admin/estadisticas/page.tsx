export const dynamic = "force-dynamic";
import { requireAuth } from '../../../lib/middleware/auth'
import EstadisticasClient from '../../../components/admin/EstadisticasClient'

export default async function EstadisticasPage() {
  await requireAuth('admin')
  
  return <EstadisticasClient />
}
