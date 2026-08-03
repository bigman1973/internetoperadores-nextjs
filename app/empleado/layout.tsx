export const dynamic = "force-dynamic";
import { requireAuth } from '../../lib/middleware/auth'
import EmpleadoSidebar from '../../components/empleado/EmpleadoSidebar'
import SessionProvider from '../../components/SessionProvider'
import { ImpersonationProvider } from '../../components/empleado/ImpersonationContext'
import ImpersonationBannerWrapper from '../../components/empleado/ImpersonationBannerWrapper'

export default async function EmpleadoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth('admin') // Todos los de Azure AD son 'admin' userType
  return (
    <SessionProvider>
      <ImpersonationProvider>
        <div className="min-h-screen bg-gray-50">
          <EmpleadoSidebar user={session.user} />
          <div className="lg:pl-64">
            <main className="p-4 sm:p-6 lg:p-8">
              <ImpersonationBannerWrapper />
              {children}
            </main>
          </div>
        </div>
      </ImpersonationProvider>
    </SessionProvider>
  )
}
