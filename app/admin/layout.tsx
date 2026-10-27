export const dynamic = "force-dynamic";
import { requireAuth } from '../../lib/middleware/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '../../components/admin/AdminSidebar'
import { SidebarProvider } from '../../components/admin/AdminSidebar'
import AdminHeader from '../../components/admin/AdminHeader'
import SessionProvider from '../../components/SessionProvider'
import { RoleProvider } from '../../components/admin/RoleContext'
import ProtectedRoute from '../../components/admin/ProtectedRoute'
import prisma from '../../lib/prisma'
import { canAccessAdminPanel } from '../../lib/admin-panel-access'
import PendingTicketsNotice from '../../components/finanzas/PendingTicketsNotice'
import { isEasyOnlyFinanceUser } from '@/lib/finanzas/easy-access-profile'
import { getFinanceEasyProfileRuntime, getFinanceEasyRuntimeContext } from '@/lib/finanzas/prototype-staging'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const start = performance.now()
  const trace = (phase: string) => {
    if (process.env.FINANCE_STAGING_SANDBOX === '1') console.info('conciliar-layout-timing', { phase, elapsedMs: Math.round(performance.now() - start) })
  }
  const session = await requireAuth('admin')
  trace('session')
  // Las tres lecturas posteriores a la autenticación son independientes y no mutan
  // estado. Mantenemos requireAuth como barrera y la decisión de acceso debajo.
  const [profileEnvironment, financeContext, canAccessAdmin] = await Promise.all([
    getFinanceEasyProfileRuntime(),
    getFinanceEasyRuntimeContext(),
    canAccessAdminPanel(session.user, usuarioId =>
      prisma.permisoUsuario.count({ where: { usuarioId, lectura: true } }),
    ),
  ])
  trace('environment-and-access')
  const easyOnly = profileEnvironment !== null && await isEasyOnlyFinanceUser(Number(session.user.id))
  trace('profile')
  if (!canAccessAdmin && !easyOnly) {
    redirect('/empleado')
  }
  
  return (
    <SessionProvider session={session}>
      <RoleProvider 
        userRole={session.user.role || 'VENTAS'} 
        userRoles={session.user.roles || []}
        userId={session.user.id ? parseInt(session.user.id as string) : undefined}
      >
        <SidebarProvider>
          <div data-admin-shell className="min-h-screen overflow-x-hidden bg-gray-50 text-gray-900">
            <AdminSidebar user={session.user} easyOnly={easyOnly} financeEnvironment={financeContext?.runtime ?? null} />
            <div className="min-w-0 lg:pl-64">
              <AdminHeader />
              <main className="min-w-0 px-3 py-4 sm:p-6 lg:p-8">
                {easyOnly ? children : <ProtectedRoute>
                  {process.env.FINANCE_STAGING_SANDBOX === '1' && <PendingTicketsNotice />}
                  {children}
                </ProtectedRoute>}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </RoleProvider>
    </SessionProvider>
  )
}
