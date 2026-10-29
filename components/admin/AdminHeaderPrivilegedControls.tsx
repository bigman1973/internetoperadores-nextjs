'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { EyeIcon, UserIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { useRole, ROLES_DISPONIBLES, type RolId } from './RoleContext'
import { useActuation } from '@/components/impersonation/ActuationProvider'
import { loadAdminUserPreviewSelector } from './AdminUserPreviewSelectorLoader'

// Sólo se solicita al abrir el selector. La ACL viva sigue en RoleContext y la
// lista procede de su endpoint autorizado actual, sin usar la semilla SSR.
const AdminUserPreviewSelector = dynamic(loadAdminUserPreviewSelector, {
  ssr: false,
  loading: () => <div role="status" className="absolute right-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs text-gray-500 shadow-xl">Abriendo selector…</div>,
})

/**
 * Herramientas sólo para SUPER_ADMIN. Se carga desde la cabecera tras tiempo
 * ocioso o intención explícita; no contiene ni sustituye comprobaciones de
 * autorización. El servidor y RoleContext conservan sus validaciones vivas.
 */
export default function AdminHeaderPrivilegedControls() {
  const {
    isSuperAdmin,
    isViewingAs,
    isViewingAsUser,
    viewingUser,
    activeRole,
    setViewAsRole,
    setViewAsUser,
  } = useRole()
  const { canStart, isActing } = useActuation()
  const [showUserSelector, setShowUserSelector] = useState(false)

  // Defensa en profundidad para una navegación o sesión que haya cambiado
  // antes de descargar este módulo. No hay ningún control privilegiado local.
  if (!isSuperAdmin) return null

  return (
    <div className="flex min-w-0 items-center gap-x-1.5 sm:gap-x-3 lg:gap-x-4">
      {!isActing && (
        <div className="flex min-w-0 items-center gap-x-1.5 sm:gap-x-2">
          <EyeIcon className="hidden h-4 w-4 text-gray-400 sm:block" aria-hidden="true" />

          <select
            value={activeRole || ''}
            onChange={(event) => {
              setViewAsUser(null)
              setViewAsRole(event.target.value ? (event.target.value as RolId) : null)
            }}
            aria-label="Previsualizar rol"
            className={`
              min-h-11 max-w-24 cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium sm:max-w-40 sm:text-sm
              focus:border-orange-500 focus:ring-2 focus:ring-orange-500
              ${isViewingAs && !isViewingAsUser
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-gray-300 bg-white text-gray-700'
              }
            `}
            disabled={isViewingAsUser}
          >
            <option value="">Rol...</option>
            {ROLES_DISPONIBLES.filter(role => role.id !== 'SUPER_ADMIN').map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserSelector(current => !current)}
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

          {isViewingAs && (
            <button
              type="button"
              onClick={() => {
                setViewAsRole(null)
                setViewAsUser(null)
                setShowUserSelector(false)
              }}
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg bg-amber-100 px-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200"
              title="Volver a Super Admin"
            >
              <XMarkIcon className="h-3 w-3" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          )}
        </div>
      )}

      {canStart && !isActing && (
        <Link
          href="/admin/actuar-como"
          prefetch={false}
          className="inline-flex min-h-11 w-[2.75rem] shrink-0 items-center justify-center rounded-lg bg-orange-600 px-1 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:w-[5.875rem] sm:px-3 sm:text-sm"
          title="Iniciar una sesión temporal con otra identidad autorizada"
        >
          <span className="text-center leading-3 sm:whitespace-nowrap sm:leading-normal">Actuar como</span>
        </Link>
      )}

      {isViewingAsUser && viewingUser && (
        <div className="hidden items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-[10px] font-medium text-purple-700 md:flex">
          Viendo como: {viewingUser.nombre}
        </div>
      )}
    </div>
  )
}
