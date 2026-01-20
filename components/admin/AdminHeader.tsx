'use client'

import { signOut, useSession } from 'next-auth/react'
import { ArrowRightOnRectangleIcon, Bars3Icon } from '@heroicons/react/24/outline'

export default function AdminHeader() {
  const { data: session } = useSession()
  
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
      {/* Mobile menu button */}
      <button
        type="button"
        className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
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

        <div className="flex items-center gap-x-4 lg:gap-x-6">
          {/* User menu */}
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200" aria-hidden="true" />
          
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
