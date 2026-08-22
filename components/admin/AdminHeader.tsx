'use client'

import { signOut, useSession } from 'next-auth/react'
import { ArrowRightOnRectangleIcon, Bars3Icon, EyeIcon, XMarkIcon, UserIcon } from '@heroicons/react/24/outline'
import { useSidebar } from './AdminSidebar'
import { useRole, ROLES_DISPONIBLES, RolId } from './RoleContext'
import { useState, useEffect } from 'react'

interface UsuarioListItem {
  id: number
  nombre: string
  email: string
  rol: string
  roles: string[]
}

export default function AdminHeader() {
  const { data: session } = useSession()
  const { setIsOpen } = useSidebar()
  const { isSuperAdmin, isViewingAs, isViewingAsUser, viewingUser, activeRole, setViewAsRole, setViewAsUser } = useRole()
  const [usuarios, setUsuarios] = useState<UsuarioListItem[]>([])
  const [showUserSelector, setShowUserSelector] = useState(false)

  // Cargar lista de usuarios para el selector
  useEffect(() => {
    if (isSuperAdmin) {
      fetch('/api/admin/usuarios')
        .then(res => res.json())
        .then(data => setUsuarios(data.usuarios || []))
        .catch(err => console.error('Error cargando usuarios:', err))
    }
  }, [isSuperAdmin])
  
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
          {/* Selector "Ver como" - Solo para SUPER_ADMIN */}
          {isSuperAdmin && (
            <div className="flex min-w-0 items-center gap-x-1.5 sm:gap-x-2">
              <EyeIcon className="h-4 w-4 text-gray-400 hidden sm:block" />
              
              {/* Selector de rol */}
              <select
                value={activeRole || ''}
                onChange={(e) => {
                  setViewAsUser(null)
                  setViewAsRole(e.target.value ? (e.target.value as RolId) : null)
                }}
                aria-label="Simular rol"
                className={`
                  min-h-10 max-w-24 cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium sm:max-w-40 sm:text-sm
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
                  aria-label="Simular usuario"
                  className={`
                    flex h-10 min-w-10 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 text-xs font-medium sm:min-w-0 sm:text-sm
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
                  <div className="absolute right-0 top-full z-50 mt-1 max-h-[70dvh] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                    <div className="p-2 border-b border-gray-100">
                      <p className="text-[10px] text-gray-500 uppercase font-semibold">Ver como usuario</p>
                    </div>
                    {usuarios.filter(u => u.rol !== 'SUPER_ADMIN').map(u => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setViewAsUser({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, roles: u.roles || [u.rol] })
                          setShowUserSelector(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b border-gray-50 ${
                          viewingUser?.id === u.id ? 'bg-purple-50' : ''
                        }`}
                      >
                        <span className="font-medium text-gray-900">{u.nombre}</span>
                        <span className="text-gray-500 ml-2">{u.rol}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Botón salir de simulación */}
              {isViewingAs && (
                <button
                  onClick={() => { setViewAsRole(null); setViewAsUser(null); setShowUserSelector(false) }}
                  className="inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-lg bg-amber-100 px-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200"
                  title="Volver a Super Admin"
                >
                  <XMarkIcon className="h-3 w-3" />
                  <span className="hidden sm:inline">Salir</span>
                </button>
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
          {session?.user && (
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex h-11 w-11 shrink-0 items-center justify-center gap-x-2 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-orange-600 sm:w-auto sm:px-2"
            >
              <span className="hidden sm:inline">{session.user.name || session.user.email}</span>
              <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
