'use client'

import { createContext, useContext, useState, useCallback } from 'react'

// Roles disponibles en el sistema
export const ROLES_DISPONIBLES = [
  { id: 'SUPER_ADMIN', label: 'Super Admin', color: 'bg-red-100 text-red-800' },
  { id: 'GERENTE', label: 'Gerente', color: 'bg-purple-100 text-purple-800' },
  { id: 'MARKETING', label: 'Marketing', color: 'bg-pink-100 text-pink-800' },
  { id: 'VENTAS', label: 'Ventas', color: 'bg-blue-100 text-blue-800' },
  { id: 'CONTABILIDAD', label: 'Contabilidad', color: 'bg-green-100 text-green-800' },
  { id: 'RRHH', label: 'RRHH', color: 'bg-yellow-100 text-yellow-800' },
] as const

export type RolId = typeof ROLES_DISPONIBLES[number]['id']

// Permisos por sección según rol
export const PERMISOS_POR_ROL: Record<RolId, string[]> = {
  SUPER_ADMIN: ['*'], // Acceso total
  GERENTE: [
    'dashboard', 'tarifas', 'clientes', 'leads', 'comunicados',
    'altas-pendientes', 'contratos', 'facturacion', 'finanzas',
    'estadisticas', 'usuarios', 'subida-precios', 'personal',
    'proyectos', 'historial', 'configuracion'
  ],
  MARKETING: [
    'dashboard', 'leads', 'comunicados', 'estadisticas'
  ],
  VENTAS: [
    'dashboard', 'tarifas', 'clientes', 'leads', 'altas-pendientes', 'contratos'
  ],
  CONTABILIDAD: [
    'dashboard', 'facturacion', 'finanzas', 'subida-precios', 'estadisticas'
  ],
  RRHH: [
    'dashboard', 'personal'
  ],
}

// Secciones que requieren acceso exclusivo SUPER_ADMIN
export const SECCIONES_SUPER_ADMIN_ONLY = ['finanzas-tickets']

interface RoleContextType {
  // Rol activo (puede ser simulado)
  activeRole: RolId | null
  // Si está en modo "ver como"
  isViewingAs: boolean
  // Rol real del usuario
  realRole: string
  // Roles reales del usuario (multi-rol)
  realRoles: string[]
  // Si el usuario es SUPER_ADMIN
  isSuperAdmin: boolean
  // Cambiar el rol simulado
  setViewAsRole: (role: RolId | null) => void
  // Verificar si tiene acceso a una sección
  hasAccess: (section: string) => boolean
  // Obtener el rol efectivo (simulado o real)
  effectiveRole: RolId
}

const RoleContext = createContext<RoleContextType>({
  activeRole: null,
  isViewingAs: false,
  realRole: '',
  realRoles: [],
  isSuperAdmin: false,
  setViewAsRole: () => {},
  hasAccess: () => true,
  effectiveRole: 'SUPER_ADMIN',
})

export function RoleProvider({ 
  children, 
  userRole, 
  userRoles 
}: { 
  children: React.ReactNode
  userRole: string
  userRoles: string[]
}) {
  const [viewAsRole, setViewAsRole] = useState<RolId | null>(null)
  
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const isViewingAs = isSuperAdmin && viewAsRole !== null
  const effectiveRole: RolId = isViewingAs ? viewAsRole! : (userRole as RolId)

  const hasAccess = useCallback((section: string) => {
    // Si es SUPER_ADMIN real y no está simulando, acceso total
    if (isSuperAdmin && !isViewingAs) return true
    
    // Si es GERENTE (real o simulado), acceso a todo excepto tickets/gastos
    if (effectiveRole === 'GERENTE') {
      return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
    }
    
    // Secciones exclusivas de SUPER_ADMIN
    if (SECCIONES_SUPER_ADMIN_ONLY.includes(section)) {
      return false
    }
    
    // Verificar permisos del rol efectivo
    const permisos = PERMISOS_POR_ROL[effectiveRole]
    if (!permisos) return false
    if (permisos.includes('*')) return true
    return permisos.includes(section)
  }, [effectiveRole, isSuperAdmin, isViewingAs])

  return (
    <RoleContext.Provider value={{
      activeRole: viewAsRole,
      isViewingAs,
      realRole: userRole,
      realRoles: userRoles,
      isSuperAdmin,
      setViewAsRole,
      hasAccess,
      effectiveRole,
    }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
