import SessionProvider from '../../components/SessionProvider'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../lib/auth'
import ClienteLayoutClient from './ClienteLayoutClient'

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  // Si no hay sesión o no es cliente, redirigir al login
  if (!session) {
    redirect('/login')
  }

  return (
    <SessionProvider>
      <ClienteLayoutClient>{children}</ClienteLayoutClient>
    </SessionProvider>
  )
}
