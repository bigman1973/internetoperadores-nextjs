'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'

const PublicRuntimeProviders = dynamic(() => import('./PublicRuntimeProviders'))

/** Presentation only. Authentication and effective ACL remain in the admin layout/APIs. */
export default function RootRuntimeSurface({ children, assistantEnabled }: { children: ReactNode; assistantEnabled: boolean }) {
  const pathname = usePathname()
  const admin = pathname === '/admin' || pathname.startsWith('/admin/')
  const initialAdmin = useRef(admin)
  const crossingSurface = initialAdmin.current !== admin

  useEffect(() => {
    if (crossingSurface) window.location.replace(window.location.href)
  }, [crossingSurface])

  // A full document navigation across surfaces guarantees public consent scripts
  // run before public integrations, and never renders a page without its contexts.
  if (crossingSurface) return <div role="status" className="p-6 text-slate-700">Abriendo página…</div>
  if (admin) return <>{children}</>
  return <PublicRuntimeProviders assistantEnabled={assistantEnabled}>{children}</PublicRuntimeProviders>
}
