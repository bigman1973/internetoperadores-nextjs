export const dynamic = "force-dynamic";
import { requireAuth } from '../../lib/middleware/auth'
import { redirect } from 'next/navigation'
import AdminSidebar from '../../components/admin/AdminSidebar'
import { SidebarProvider } from '../../components/admin/AdminSidebar'
import AdminHeader from '../../components/admin/AdminHeader'
import SessionProvider from '../../components/SessionProvider'
import { RoleProvider } from '../../components/admin/RoleContext'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireAuth('admin')
  
  // Usuarios sin roles asignados (empleados rasos) → redirigir al portal empleado
  const userRoles = session.user.roles || []
  if (userRoles.length === 0 && session.user.role !== 'SUPER_ADMIN') {
    redirect('/empleado')
  }
  
  return (
    <SessionProvider>
      <RoleProvider 
        userRole={session.user.role || 'VENTAS'} 
        userRoles={session.user.roles || []}
        userId={session.user.id ? parseInt(session.user.id as string) : undefined}
      >
        <SidebarProvider>
          <div className="min-h-screen bg-gray-50">
            <AdminSidebar user={session.user} />
            <div className="lg:pl-64">
              <AdminHeader />
              <main className="p-4 sm:p-6 lg:p-8">
                {children}
              </main>
            </div>
          </div>
        </SidebarProvider>
      </RoleProvider>
    </SessionProvider>
  )
}
