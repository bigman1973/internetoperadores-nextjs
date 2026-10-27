'use client'

import { useEffect, useState } from 'react'

export type UserPreviewTarget = {
  id: number
  nombre: string
  email: string
  rol: string
  roles: string[]
}

type Props = {
  viewingUserId?: number
  onSelectUser: (user: UserPreviewTarget) => void
}

/**
 * Sólo se monta tras abrir el selector de un SUPER_ADMIN. La lista no se
 * conserva entre aperturas: cada panel pide al servidor la foto autorizada
 * actual y la decisión de permisos sigue correspondiendo a RoleContext/API.
 */
export default function AdminUserPreviewSelector({ viewingUserId, onSelectUser }: Props) {
  const [usuarios, setUsuarios] = useState<UserPreviewTarget[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setUsersLoading(true)
    setUsersError(false)

    fetch('/api/admin/usuarios', { cache: 'no-store', signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('No se pudo cargar la lista de usuarios')
        return res.json()
      })
      .then(data => {
        if (!controller.signal.aborted) {
          setUsuarios(data.usuarios || [])
          setUsersLoaded(true)
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setUsersError(true)
          console.error('Error cargando usuarios:', err)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsersLoading(false)
      })

    return () => controller.abort()
  }, [])

  return (
    <div className="absolute right-0 top-full z-50 mt-1 max-h-[70dvh] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
      <div className="border-b border-gray-100 p-2">
        <p className="text-[10px] font-semibold uppercase text-gray-500">Previsualización · Ver como usuario</p>
      </div>
      {!usersLoaded && !usersError && <p role="status" className="px-3 py-3 text-xs text-gray-500">Cargando usuarios…</p>}
      {!usersLoading && usersError && <p role="alert" className="px-3 py-3 text-xs text-red-700">No se pudieron cargar. Cierra y vuelve a abrir para reintentar.</p>}
      {usuarios.filter(user => user.rol !== 'SUPER_ADMIN').map(user => (
        <button
          key={user.id}
          type="button"
          onClick={() => onSelectUser({ ...user, roles: user.roles || [user.rol] })}
          className={`w-full border-b border-gray-50 px-3 py-2 text-left text-xs hover:bg-gray-50 ${
            viewingUserId === user.id ? 'bg-purple-50' : ''
          }`}
        >
          <span className="font-medium text-gray-900">{user.nombre}</span>
          <span className="ml-2 text-gray-500">{user.rol}</span>
        </button>
      ))}
    </div>
  )
}
