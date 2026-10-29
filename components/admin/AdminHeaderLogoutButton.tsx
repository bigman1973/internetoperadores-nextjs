'use client'

import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import { signOut } from 'next-auth/react'

type AdminHeaderLogoutButtonProps = Readonly<{
  userName: string | null | undefined
  userEmail: string | null | undefined
}>

/** Acción de usuario mínima; el nombre y correo se serializan desde SSR. */
export default function AdminHeaderLogoutButton({
  userName,
  userEmail,
}: AdminHeaderLogoutButtonProps) {
  return (
    <div className="flex h-11 w-11 shrink-0 sm:w-auto">
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex h-full w-full items-center justify-center gap-x-2 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-orange-600 sm:w-auto sm:px-2"
      >
        <span className="hidden sm:inline">{userName || userEmail}</span>
        <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  )
}
