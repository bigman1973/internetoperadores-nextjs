export const dynamic = "force-dynamic";

import { requireAuth } from '../../../lib/middleware/auth'
import ContratosView from '../../../components/admin/ContratosView'

export default async function ContratosPage() {
  await requireAuth('admin')

  return <ContratosView />
}
