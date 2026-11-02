export const dynamic = 'force-dynamic'

import { requireAuth } from '../../../lib/middleware/auth'
import ActuarComoWorkspace from '../../../components/admin/ActuarComoWorkspace'
import prisma from '@/lib/prisma'
import { requireArea4Owner } from '@/lib/area4/live-admin'
import { redirect } from 'next/navigation'

/** La autorización fina, el catálogo y el registro se resuelven en la API de actuación. */
export default async function ActuarComoPage() {
  await requireAuth('admin')
  const auth = await requireArea4Owner(prisma)
  if (!auth.ok) redirect('/admin')
  return <ActuarComoWorkspace />
}
