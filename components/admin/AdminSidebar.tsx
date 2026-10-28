'use client'

import { type MouseEvent, type ReactNode, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { useRole } from './RoleContext'
import { useSidebar } from './AdminSidebarContext'
import { permissionSignature } from './sidebar-access-evaluator'
import type { FinanceEnvironment } from './sidebar-navigation'
import type { AdminSidebarUser } from './server/AdminSidebarMenu'
import { AdminSidebarPlaceholder } from './presentation/AdminSidebarPlaceholder'

// Se conserva esta exportación para los consumidores existentes, aunque la
// cabecera importa AdminSidebarContext directamente y no arrastra navegación.
export { SidebarProvider, SidebarContext } from './AdminSidebarContext'

const InteractiveAdminSidebarMenu = dynamic(
  () => import('./lazy/InteractiveAdminSidebarMenu'),
  {
    ssr: false,
    loading: () => <AdminSidebarPlaceholder />,
  },
)

type InitialMenuMode = 'easy' | 'privileged' | 'seed' | 'unavailable'

interface AdminSidebarProps {
  easyOnly?: boolean
  financeEnvironment?: FinanceEnvironment
  user: AdminSidebarUser
  /** Árbol ya autorizado de la respuesta SSR actual, formado por el layout. */
  initialMenu: ReactNode
  initialMenuMode: InitialMenuMode
  initialPermissionSignature?: string
}

/**
 * Puerta cliente pequeña. El catálogo, los iconos y los grupos interactivos no
 * se cargan durante la entrada: sólo se solicitan para móvil, previsualización
 * o tras invalidar/cambiar la foto ACL viva.
 */
export default function AdminSidebar({
  user,
  easyOnly = false,
  financeEnvironment = null,
  initialMenu,
  initialMenuMode,
  initialPermissionSignature = '',
}: AdminSidebarProps) {
  const { isOpen, setIsOpen } = useSidebar()
  const pathname = usePathname()
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)
  const {
    isViewingAs,
    isViewingAsUser,
    permisosGranulares,
    permisosLoaded,
    effectiveUserId,
  } = useRole()
  const livePermissionSignature = permissionSignature(permisosGranulares)
  const previewSync = useRef({
    wasViewingAs: false,
    wasViewingAsUser: false,
    userPreviewReady: true,
    previewUserId: null as number | null,
    restoringInitialActor: false,
    restoreSawUnloaded: false,
    hasInvalidatedSeed: false,
  })

  // RoleContext invalida la semilla y programa su GET en un efecto. Esta puerta
  // no muestra el árbol previo durante esa transición: espera observar el ciclo
  // loaded -> false -> true de la ACL viva, incluso si su firma final coincide.
  if (isViewingAs) {
    if (!previewSync.current.wasViewingAs) {
      previewSync.current.hasInvalidatedSeed = true
    }
    if (isViewingAsUser && (!previewSync.current.wasViewingAsUser || previewSync.current.previewUserId !== effectiveUserId)) {
      previewSync.current.userPreviewReady = false
      previewSync.current.restoreSawUnloaded = false
      previewSync.current.previewUserId = effectiveUserId
    }
    if (isViewingAsUser && !permisosLoaded) {
      previewSync.current.restoreSawUnloaded = true
    }
    if (isViewingAsUser && previewSync.current.restoreSawUnloaded && permisosLoaded) {
      previewSync.current.userPreviewReady = true
    }
    previewSync.current.wasViewingAs = true
    previewSync.current.wasViewingAsUser = isViewingAsUser
  } else if (previewSync.current.wasViewingAs) {
    previewSync.current.wasViewingAs = false
    previewSync.current.wasViewingAsUser = false
    previewSync.current.previewUserId = null
    previewSync.current.restoringInitialActor = true
    previewSync.current.restoreSawUnloaded = false
  }

  if (previewSync.current.restoringInitialActor && !permisosLoaded) {
    previewSync.current.restoreSawUnloaded = true
  }
  if (previewSync.current.restoringInitialActor && previewSync.current.restoreSawUnloaded && permisosLoaded) {
    previewSync.current.restoringInitialActor = false
  }

  const hasLiveSeedChange = initialMenuMode === 'seed' && livePermissionSignature !== initialPermissionSignature
  const needsLiveMenu = !easyOnly && (
    initialMenuMode === 'unavailable' ||
    isViewingAs ||
    hasLiveSeedChange ||
    previewSync.current.hasInvalidatedSeed
  )
  // Una previsualización de usuario y cualquier retorno al actor inicial
  // esperan la lectura actual con un placeholder sin enlaces; nunca muestran
  // un árbol anterior ni una inferencia basada en user.role.
  const waitsForLivePermissions = !easyOnly && (
    (initialMenuMode === 'unavailable' && !permisosLoaded) ||
    (isViewingAsUser && !previewSync.current.userPreviewReady) ||
    previewSync.current.restoringInitialActor ||
    (hasLiveSeedChange && !permisosLoaded)
  )

  // El HTML sigue usando anclas nativas sin JS. Tras hidratar se conserva la
  // navegación interna de Next sin descargar el catálogo ni precargar destinos.
  const navigateInitialMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>('[data-admin-sidebar-ssr] a[href]')
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return
    const destination = new URL(anchor.href, window.location.href)
    if (destination.origin !== window.location.origin || !/^\/admin(?:\/|$)/.test(destination.pathname)) return
    event.preventDefault()
    router.push(destination.pathname + destination.search + destination.hash)
  }

  useEffect(() => {
    const menu = menuRef.current?.querySelector('[data-admin-sidebar-ssr]')
    if (!menu) return
    for (const anchor of menu.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const path = new URL(anchor.href).pathname
      const active = pathname === path || (path !== '/admin' && pathname.startsWith(path + '/'))
      if (active) anchor.setAttribute('aria-current', 'page')
      else anchor.removeAttribute('aria-current')
      anchor.classList.toggle('bg-orange-50', active)
      anchor.classList.toggle('text-orange-600', active)
      anchor.classList.toggle('text-gray-700', !active)
      if (active) {
        const group = anchor.closest('details')
        if (group) group.open = true
      }
    }
  }, [pathname, initialMenu, needsLiveMenu])

  // Cerrar sidebar al cambiar de ruta
  useEffect(() => {
    setIsOpen(false)
  }, [pathname, setIsOpen])

  // Bloquear scroll del body y permitir cerrar con Escape en móvil
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    if (isOpen) {
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleKeyDown)
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, setIsOpen])

  const interactiveMenu = (onNavigate?: () => void) => {
    if (waitsForLivePermissions) return <AdminSidebarPlaceholder />
    return (
      <InteractiveAdminSidebarMenu
        user={user}
        easyOnly={easyOnly}
        financeEnvironment={financeEnvironment}
        onNavigate={onNavigate}
      />
    )
  }

  return (
    <>
      {/* El árbol SSR permanece visible y navegable sin descargar el menú pesado. */}
      <div ref={menuRef} onClick={navigateInitialMenu} className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col overflow-y-auto border-r border-gray-200">
          {needsLiveMenu ? interactiveMenu() : initialMenu}
        </div>
      </div>

      {/* El módulo pesado se solicita sólo al abrir el overlay móvil. */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navegación del panel">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="fixed inset-0 cursor-default bg-gray-950/70 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />

          <div className="fixed inset-0 flex">
            <div className="relative flex w-[min(88vw,22rem)] flex-none overflow-y-auto shadow-2xl">
              <div className="absolute left-full top-0 flex w-12 justify-center pt-3">
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-950/40 text-2xl leading-none text-white backdrop-blur active:scale-95"
                  onClick={() => setIsOpen(false)}
                >
                  <span className="sr-only">Cerrar menú</span>
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              {interactiveMenu(() => setIsOpen(false))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
