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

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth('admin')
  const canAccessAdmin = await canAccessAdminPanel(session.user, usuarioId =>
    prisma.permisoUsuario.count({ where: { usuarioId, lectura: true } }),
  )
  if (!canAccessAdmin) {
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
            <AdminSidebar user={session.user} />
            <div className="min-w-0 lg:pl-64">
              <AdminHeader />
              <main className="min-w-0 px-3 py-4 sm:p-6 lg:p-8">
                <ProtectedRoute>
                  {children}
                </ProtectedRoute>
              </main>
            </div>
          </div>
        </SidebarProvider>
      </RoleProvider>
    </SessionProvider>
  )
}
