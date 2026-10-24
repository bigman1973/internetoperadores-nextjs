export const dynamic = 'force-dynamic'

import { requireAuth } from '../../../lib/middleware/auth'
import ActuarComoWorkspace from '../../../components/admin/ActuarComoWorkspace'

/** La autorización fina, el catálogo y el registro se resuelven en la API de actuación. */
export default async function ActuarComoPage() {
  await requireAuth('admin')
  return <ActuarComoWorkspace />
}
