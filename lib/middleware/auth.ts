import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { authOptions } from '../auth'

// React invalida esta caché al terminar cada renderizado: nunca se comparten
// identidades entre usuarios ni se conservan permisos entre peticiones.
const getSessionForRequest = cache(() => getServerSession(authOptions))

export async function requireAuth(userType?: 'admin' | 'cliente') {
  const session = await getSessionForRequest()

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
