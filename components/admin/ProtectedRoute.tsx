'use client'

import { usePathname } from 'next/navigation'
import { useRole } from './RoleContext'
import { useEffect } from 'react'

/**
 * Mapea una ruta del panel admin a un código de área de permisos.
 * La conversión es automática: /admin/clientes/ggcc/draxton/contratos → admin.clientes.ggcc.draxton.contratos
 */
function pathToAreaCode(pathname: string): string {
  const withoutAdmin = pathname.replace(/^\/admin\/?/, '')
  
  if (!withoutAdmin) return 'admin' // Dashboard principal
  
  const code = 'admin.' + withoutAdmin
    .split('/')
    .filter(Boolean)
    .map(segment => segment.replace(/-/g, '_'))
    .join('.')
  
  return code
}

/**
 * Auto-registra el área en la base de datos si no existe.
 */
function useAutoRegisterArea(areaCode: string, pathname: string) {
  useEffect(() => {
    if (!areaCode || areaCode === 'admin') return
    
    fetch('/api/admin/permisos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'auto_registrar',
        codigo: areaCode,
        pathname: pathname,
      }),
    }).catch(() => {})
  }, [areaCode, pathname])
}

/**
 * Componente que protege las rutas del panel admin según permisos granulares.
 * 
 * Reglas:
 * - SUPER_ADMIN sin simulación: acceso total
 * - GERENTE sin simulación: acceso total
 * - Usuario con permisos granulares: solo accede a las áreas permitidas
 * - Usuario sin permisos granulares: usa sistema legacy de roles (no bloquea)
 * - Mientras se cargan permisos: muestra loading (no bloquea ni deniega)
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { 
    hasAreaAccess, 
    isSuperAdmin, 
    isViewingAs, 
    isViewingAsUser,
    tienePermisosGranulares, 
    effectiveRole, 
    permisosLoaded 
  } = useRole()
  
  const areaCode = pathToAreaCode(pathname)
  
  // Auto-registrar el área (solo para SUPER_ADMIN, en background)
  useAutoRegisterArea(isSuperAdmin && !isViewingAs ? areaCode : '', pathname)
  
  // DEBUG - remover después
  console.log('[ProtectedRoute]', {
    pathname,
    areaCode,
    isSuperAdmin,
    isViewingAs,
    isViewingAsUser,
    effectiveRole,
    permisosLoaded,
    tienePermisosGranulares,
    hasAccess: tienePermisosGranulares ? hasAreaAccess(areaCode, 'lectura') : 'N/A (no granulares)',
  })

  // SUPER_ADMIN real sin simulación: acceso total
  if (isSuperAdmin && !isViewingAs) {
    return <>{children}</>
  }
  
  // GERENTE sin simulación de usuario: acceso total
  if (effectiveRole === 'GERENTE' && !isViewingAsUser) {
    return <>{children}</>
  }
  
  // Dashboard siempre accesible
  if (areaCode === 'admin') {
    return <>{children}</>
  }

  // Si los permisos aún no se han cargado, mostrar loading
  if (!permisosLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    )
  }
  
  // Si el usuario tiene permisos granulares, verificar acceso por área
  if (tienePermisosGranulares) {
    if (!hasAreaAccess(areaCode, 'lectura')) {
      return <AccessDenied />
    }
  }
  
  // Sin permisos granulares → no bloquear (usa sistema legacy de roles del sidebar)
  return <>{children}</>
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso denegado</h2>
      <p className="text-gray-500 max-w-md">
        No tienes permisos para acceder a esta sección. 
        Contacta con un administrador si necesitas acceso.
      </p>
    </div>
  )
}
