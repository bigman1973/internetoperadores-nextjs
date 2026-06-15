import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ComunicadosClient from '@/components/admin/ComunicadosClient'

export default async function ComunicadosPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/admin/login')

  return <ComunicadosClient />
}
