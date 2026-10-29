'use client'

import dynamic from 'next/dynamic'
import { startTransition, useCallback, useEffect, useState } from 'react'
import { useRole } from './RoleContext'
import {
  createAdminHeaderIdleHost,
  scheduleDeferredAdminHeaderControls,
  shouldLoadDeferredAdminHeaderControls,
} from './admin-header-deferred-controls'

const AdminHeaderPrivilegedControls = dynamic(
  () => import('./AdminHeaderPrivilegedControls'),
  { ssr: false, loading: () => null },
)

type AdminHeaderPrivilegedControlsLoaderProps = Readonly<{
  /** Semilla SSR para no solicitar la isla en roles no privilegiados. */
  isSuperAdmin: boolean
}>

/**
 * La interfaz de previsualización/actuación se importa fuera de la ruta
 * crítica. RoleContext vuelve a comprobar el rol vivo antes de pintar; no hay
 * decisión de autorización ni estado cacheado en este límite de carga.
 */
export default function AdminHeaderPrivilegedControlsLoader({
  isSuperAdmin: serverIsSuperAdmin,
}: AdminHeaderPrivilegedControlsLoaderProps) {
  const { isSuperAdmin: liveIsSuperAdmin, isViewingAs } = useRole()
  const [controlsRequested, setControlsRequested] = useState(false)
  const canRenderPrivilegedControls = serverIsSuperAdmin && liveIsSuperAdmin
  const showPrivilegedControls = shouldLoadDeferredAdminHeaderControls({
    isSuperAdmin: canRenderPrivilegedControls,
    idleReached: controlsRequested,
  })

  const requestPrivilegedControls = useCallback(() => {
    if (!canRenderPrivilegedControls) return
    // El import dinámico queda fuera de la interacción actual y no retrasa el
    // botón de menú ni el cierre de sesión.
    startTransition(() => setControlsRequested(true))
  }, [canRenderPrivilegedControls])

  useEffect(() => {
    if (!canRenderPrivilegedControls || controlsRequested) return

    // Tras una navegación preservada del App Router la previsualización no
    // puede perder su salida. En una carga nueva se programa al quedar libre.
    if (isViewingAs) {
      requestPrivilegedControls()
      return
    }

    return scheduleDeferredAdminHeaderControls(
      requestPrivilegedControls,
      createAdminHeaderIdleHost(window),
    )
  }, [canRenderPrivilegedControls, controlsRequested, isViewingAs, requestPrivilegedControls])

  return showPrivilegedControls ? <AdminHeaderPrivilegedControls /> : null
}
