export const dynamic = "force-dynamic";
import { requireAuth } from '../../../lib/middleware/auth'
import UsuariosAdminClient from '../../../components/admin/UsuariosAdminClient'

export default async function UsuariosPage() {
  await requireAuth('admin')
  
  return <UsuariosAdminClient />
}
