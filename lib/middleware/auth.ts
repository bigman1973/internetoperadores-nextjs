import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../auth'

export async function requireAuth(userType?: 'admin' | 'cliente') {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  if (userType && session.user.userType !== userType) {
    if (session.user.userType === 'admin') {
      redirect('/admin')
    } else {
      redirect('/cliente')
    }
  }

  return session
}
