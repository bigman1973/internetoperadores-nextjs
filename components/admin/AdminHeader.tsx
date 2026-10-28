'use client'

import dynamic from 'next/dynamic'
import { signOut, useSession } from 'next-auth/react'
import { ArrowRightOnRectangleIcon, Bars3Icon, EyeIcon, XMarkIcon, UserIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSidebar } from './AdminSidebarContext'
import { useRole, ROLES_DISPONIBLES, RolId } from './RoleContext'
import { useState } from 'react'
import { useActuation } from '@/components/impersonation/ActuationProvider'
import { loadAdminUserPreviewSelector } from './AdminUserPreviewSelectorLoader'

// El panel no forma parte de la ruta crítica: sólo un SUPER_ADMIN que abre
// "Usuario..." descarga y monta su lista. El menú, banner y ACL siguen en su
// árbol normal desde el primer render.
const AdminUserPreviewSelector = dynamic(loadAdminUserPreviewSelector, {
  ssr: false,
  loading: () => <div role="status" className="absolute right-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs text-gray-500 shadow-xl">Abriendo selector…</div>,
})

export default function AdminHeader() {
  const { data: session } = useSession()
  const { setIsOpen } = useSidebar()
  const { isSuperAdmin, isViewingAs, isViewingAsUser, viewingUser, activeRole, setViewAsRole, setViewAsUser } = useRole()
  const { canStart, isActing } = useActuation()
  const [showUserSelector, setShowUserSelector] = useState(false)
  
  return (
    <header className="sticky top-0 z-40 flex min-h-16 shrink-0 items-center gap-x-2 border-b border-gray-200 bg-white/95 px-2 py-2 shadow-sm backdrop-blur sm:gap-x-4 sm:px-6 lg:px-8">
      {/* Mobile menu button */}
      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 active:bg-gray-100 lg:hidden"
        onClick={() => setIsOpen(true)}
      >
        <span className="sr-only">Abrir menú</span>
        <Bars3Icon className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Separator */}
      <div className="hidden h-6 w-px bg-gray-200 sm:block lg:hidden" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 gap-x-2 self-stretch sm:gap-x-4 lg:gap-x-6">
        <div className="hidden min-w-0 flex-1 items-center sm:flex">
          <h1 className="truncate text-base font-semibold text-gray-900 lg:text-lg">
            Panel de Administración
          </h1>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-x-1.5 sm:gap-x-3 lg:gap-x-4">
          {/* Selector "Ver como" - sólo previsualización local, no cambia la sesión. */}
          {isSuperAdmin && !isActing && (
            <div className="flex min-w-0 items-center gap-x-1.5 sm:gap-x-2">
              <EyeIcon className="h-4 w-4 text-gray-400 hidden sm:block" aria-hidden="true" />
              
              {/* Selector de rol */}
              <select
                value={activeRole || ''}
                onChange={(e) => {
                  setViewAsUser(null)
                  setViewAsRole(e.target.value ? (e.target.value as RolId) : null)
                }}
                aria-label="Previsualizar rol"
                className={`
                  min-h-11 max-w-24 cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium sm:max-w-40 sm:text-sm
                  focus:ring-2 focus:ring-orange-500 focus:border-orange-500
                  ${isViewingAs && !isViewingAsUser
                    ? 'border-amber-300 bg-amber-50 text-amber-800' 
                    : 'border-gray-300 bg-white text-gray-700'
                  }
                `}
                disabled={isViewingAsUser}
              >
                <option value="">Rol...</option>
                {ROLES_DISPONIBLES.filter(r => r.id !== 'SUPER_ADMIN').map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.label}
                  </option>
                ))}
              </select>

              {/* Selector de usuario */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserSelector(!showUserSelector)}
                  aria-expanded={showUserSelector}
                  aria-label="Previsualizar usuario"
                  className={`
                    flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium sm:min-w-0 sm:text-sm
                    ${isViewingAsUser
                      ? 'border-purple-300 bg-purple-50 text-purple-800' 
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }
                  `}
                >
                  <UserIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {isViewingAsUser ? viewingUser?.nombre?.split(' ')[0] : 'Usuario...'}
                  </span>
                </button>

                {showUserSelector && (
                  <AdminUserPreviewSelector
                    viewingUserId={viewingUser?.id}
                    onSelectUser={(user) => {
                      setViewAsUser(user)
                      setShowUserSelector(false)
                    }}
                  />
                )}
              </div>

              {/* Botón salir de simulación */}
              {isViewingAs && (
                <button
                  onClick={() => { setViewAsRole(null); setViewAsUser(null); setShowUserSelector(false) }}
                  className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg bg-amber-100 px-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200"
                  title="Volver a Super Admin"
                >
                  <XMarkIcon className="h-3 w-3" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              )}
            </div>
          )}

          {/* Actuación real: el servidor vuelve a confirmar autorización y destinos. */}
          {isSuperAdmin && (
            <div className="flex h-11 w-11 shrink-0 items-stretch sm:w-[5.875rem]">
              {canStart && !isActing && (
                <Link
                  href="/admin/actuar-como"
                  prefetch={false}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-orange-600 px-1 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:px-3 sm:text-sm"
                  title="Iniciar una sesión temporal con otra identidad autorizada"
                >
                  <span className="text-center leading-3 sm:whitespace-nowrap sm:leading-normal">Actuar como</span>
                </Link>
              )}
            </div>
          )}

          {/* Banner de simulación */}
          {isViewingAsUser && viewingUser && (
            <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-md bg-purple-100 text-purple-700 text-[10px] font-medium">
              Viendo como: {viewingUser.nombre}
            </div>
          )}

          {/* Separator */}
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />
          
          {/* User menu */}
          <div className="flex h-11 w-11 shrink-0 sm:w-auto">
            {session?.user && (
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex h-full w-full items-center justify-center gap-x-2 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-orange-600 sm:w-auto sm:px-2"
              >
                <span className="hidden sm:inline">{session.user.name || session.user.email}</span>
                <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
