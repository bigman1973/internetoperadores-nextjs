'use client'

import { Bars3Icon } from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useSidebar } from './AdminSidebarContext'

/** Isla mínima: conserva el desbloqueo tras hidratación del menú móvil. */
export default function AdminHeaderMobileMenuButton() {
  const { setIsOpen } = useSidebar()
  const [menuReady, setMenuReady] = useState(false)

  useEffect(() => {
    setMenuReady(true)
  }, [])

  return (
    <button
      type="button"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-700 active:bg-gray-100 disabled:opacity-50 lg:hidden"
      disabled={!menuReady}
      aria-busy={!menuReady}
      onClick={() => setIsOpen(true)}
    >
      <span className="sr-only">Abrir menú</span>
      <Bars3Icon className="h-6 w-6" aria-hidden="true" />
    </button>
  )
}
