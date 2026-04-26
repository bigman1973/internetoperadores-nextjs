export const dynamic = "force-dynamic";
import { requireAuth } from '../../../lib/middleware/auth'
import TarifasPageClient from '../../../components/admin/TarifasPageClient'

export default async function TarifasPage() {
  await requireAuth('admin')
  return <TarifasPageClient />
}
