export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import prisma from '@/lib/prisma'
import UsuariosAdminClient from '@/components/admin/UsuariosAdminClient'
import { requireArea4Owner } from '@/lib/area4/live-admin'
import { loadUsersSnapshot } from '@/lib/area4/users-proposals'

export default async function UsuariosPage() {
  const auth = await requireArea4Owner(prisma)
  if (auth.ok === false) redirect('/admin')
  const session = auth.session as { impersonation?: unknown } | null
  if (session?.impersonation) redirect('/admin')

  const snapshot = await loadUsersSnapshot(prisma, auth.principal.id)
  return <UsuariosAdminClient initialSnapshot={snapshot} />
}
