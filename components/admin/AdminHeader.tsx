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
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      {/* Mobile menu button */}
      <button
        type="button"
        className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
        onClick={() => setIsOpen(true)}
      >
        <span className="sr-only">Abrir menú</span>
        <Bars3Icon className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Separator */}
      <div className="h-6 w-px bg-gray-200 lg:hidden" aria-hidden="true" />

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="flex flex-1 items-center">
          <h1 className="text-lg font-semibold text-gray-900">
            Panel de Administración
          </h1>
        </div>

        <div className="flex items-center gap-x-3 lg:gap-x-4">
          {/* Selector "Ver como" - Solo para SUPER_ADMIN */}
          {isSuperAdmin && (
            <div className="flex items-center gap-x-2">
              <EyeIcon className="h-4 w-4 text-gray-400 hidden sm:block" />
              
              {/* Selector de rol */}
              <select
                value={activeRole || ''}
                onChange={(e) => {
                  setViewAsUser(null)
                  setViewAsRole(e.target.value ? (e.target.value as RolId) : null)
                }}
                className={`
                  text-xs sm:text-sm rounded-lg border px-2 py-1.5 font-medium cursor-pointer
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
                  onClick={() => setShowUserSelector(!showUserSelector)}
                  className={`
                    text-xs sm:text-sm rounded-lg border px-2 py-1.5 font-medium cursor-pointer flex items-center gap-1
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
                  <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
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
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-medium hover:bg-amber-200 transition-colors"
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
              className="flex items-center gap-x-2 text-sm font-semibold text-gray-700 hover:text-orange-600"
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
