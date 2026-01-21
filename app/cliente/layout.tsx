import SessionProvider from '@/components/SessionProvider'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  // Si no hay sesión o el usuario no es de tipo cliente, redirigir al login
  if (!session || session.user.userType !== 'cliente') {
    redirect('/login')
  }

  return (
    <SessionProvider>
      {children}
    </SessionProvider>
  )
}
