'use client'

import { useSession } from 'next-auth/react'
import AdminHeaderMobileMenuButton from './AdminHeaderMobileMenuButton'
import AdminHeaderLogoutButton from './AdminHeaderLogoutButton'
import AdminHeaderPrivilegedControlsLoader from './AdminHeaderPrivilegedControlsLoader'

/**
 * Adaptador de compatibilidad para formularios administrativos cliente que ya
 * montan una cabecera propia. El shell normal usa AdminHeaderServer desde el
 * layout y no consulta la sesión en el navegador para su presentación.
 */
export default function AdminHeader() {
  const { data: session } = useSession()
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'

  return (
    <header className="sticky top-0 z-40 flex min-h-16 shrink-0 items-center gap-x-2 border-b border-gray-200 bg-white/95 px-2 py-2 shadow-sm backdrop-blur sm:gap-x-4 sm:px-6 lg:px-8">
      <AdminHeaderMobileMenuButton />

      <div className="hidden h-6 w-px bg-gray-200 sm:block lg:hidden" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 gap-x-2 self-stretch sm:gap-x-4 lg:gap-x-6">
        <div className="hidden min-w-0 flex-1 items-center sm:flex">
          <h1 className="truncate text-base font-semibold text-gray-900 lg:text-lg">
            Panel de Administración
          </h1>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-x-1.5 sm:gap-x-3 lg:gap-x-4">
          {isSuperAdmin && <AdminHeaderPrivilegedControlsLoader isSuperAdmin />}
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />
          {session?.user && (
            <AdminHeaderLogoutButton
              userName={session.user.name}
              userEmail={session.user.email}
            />
          )}
        </div>
      </div>
    </header>
  )
}
