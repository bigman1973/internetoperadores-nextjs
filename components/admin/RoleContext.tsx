'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'

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

// Permisos por sección según rol (coarse-grained, compatibilidad)
export const PERMISOS_POR_ROL: Record<RolId, string[]> = {
  SUPER_ADMIN: ['*'],
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

// Interfaz de permisos granulares
interface PermisoGranular {
  areaId: string
  codigo: string
  lectura: boolean
  escritura: boolean
}

interface UsuarioSimulado {
  id: number
  nombre: string
  email: string
  rol: string
  roles: string[]
}

interface RoleContextType {
  // Rol activo (puede ser simulado)
  activeRole: RolId | null
  // Si está en modo "ver como"
  isViewingAs: boolean
  // Si está viendo como un usuario específico
  isViewingAsUser: boolean
  // Usuario simulado (si aplica)
  viewingUser: UsuarioSimulado | null
  // Rol real del usuario
  realRole: string
  // Roles reales del usuario (multi-rol)
  realRoles: string[]
  // Si el usuario es SUPER_ADMIN
  isSuperAdmin: boolean
  // Cambiar el rol simulado
  setViewAsRole: (role: RolId | null) => void
  // Cambiar a "ver como usuario"
  setViewAsUser: (user: UsuarioSimulado | null) => void
  // Verificar si tiene acceso a una sección (coarse-grained, compatibilidad)
  hasAccess: (section: string) => boolean
  // Verificar permiso granular por código de área
  hasAreaAccess: (codigoArea: string, tipo?: 'lectura' | 'escritura') => boolean
  // Obtener el rol efectivo (simulado o real)
  effectiveRole: RolId
  // Permisos granulares cargados
  permisosGranulares: PermisoGranular[]
  // ID del usuario efectivo (real o simulado)
  effectiveUserId: number | null
}

const RoleContext = createContext<RoleContextType>({
  activeRole: null,
  isViewingAs: false,
  isViewingAsUser: false,
  viewingUser: null,
  realRole: '',
  realRoles: [],
  isSuperAdmin: false,
  setViewAsRole: () => {},
  setViewAsUser: () => {},
  hasAccess: () => true,
  hasAreaAccess: () => true,
  effectiveRole: 'SUPER_ADMIN',
  permisosGranulares: [],
  effectiveUserId: null,
})

export function RoleProvider({ 
  children, 
  userRole, 
  userRoles,
  userId,
}: { 
  children: React.ReactNode
  userRole: string
  userRoles: string[]
  userId?: number
}) {
  const [viewAsRole, setViewAsRole] = useState<RolId | null>(null)
  const [viewingUser, setViewingUser] = useState<UsuarioSimulado | null>(null)
  const [permisosGranulares, setPermisosGranulares] = useState<PermisoGranular[]>([])
  
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const isViewingAsUser = isSuperAdmin && viewingUser !== null
  const isViewingAs = isSuperAdmin && (viewAsRole !== null || viewingUser !== null)
  
  const effectiveRole: RolId = isViewingAsUser 
    ? (viewingUser!.rol as RolId) 
    : (viewAsRole ? viewAsRole : (userRole as RolId))

  const effectiveUserId = isViewingAsUser ? viewingUser!.id : (userId || null)

  // Cargar permisos granulares del usuario efectivo
  useEffect(() => {
    const uid = isViewingAsUser ? viewingUser!.id : userId
    if (!uid) return

    // SUPER_ADMIN sin simulación no necesita cargar permisos
    if (isSuperAdmin && !isViewingAs) {
      setPermisosGranulares([])
      return
    }

    fetch(`/api/admin/permisos?action=usuario&usuarioId=${uid}`)
      .then(res => res.json())
      .then(data => {
        if (data.permisos) {
          setPermisosGranulares(data.permisos.map((p: any) => ({
            areaId: p.areaId,
            codigo: p.area.codigo,
            lectura: p.lectura,
            escritura: p.escritura,
          })))
        }
      })
      .catch(err => console.error('Error cargando permisos granulares:', err))
  }, [userId, viewingUser, isViewingAs, isViewingAsUser, isSuperAdmin])

  const setViewAsUser = useCallback((user: UsuarioSimulado | null) => {
    setViewingUser(user)
    if (user) {
      setViewAsRole(null) // Desactivar simulación de rol si se simula usuario
    }
  }, [])

  // Verificación coarse-grained (compatibilidad con sidebar y secciones existentes)
  const hasAccess = useCallback((section: string) => {
    // Si es SUPER_ADMIN real y no está simulando, acceso total
    if (isSuperAdmin && !isViewingAs) return true
    
    // Si está simulando un usuario, usar sus permisos granulares + rol
    if (isViewingAsUser && viewingUser) {
      const userRolesEff = viewingUser.roles?.length > 0 ? viewingUser.roles : [viewingUser.rol]
      
      // Verificar por rol del usuario simulado
      const hasRoleAccess = userRolesEff.some(rol => {
        const permisos = PERMISOS_POR_ROL[rol as RolId]
        if (!permisos) return false
        if (permisos.includes('*')) return true
        return permisos.includes(section)
      })

      if (hasRoleAccess) return true

      // Verificar por permisos granulares (mapear section a código de área)
      const codigoArea = `admin.${section.replace(/-/g, '_')}`
      return permisosGranulares.some(p => {
        if (!p.lectura) return false
        return codigoArea.startsWith(p.codigo) || p.codigo.startsWith(codigoArea)
      })
    }

    // Si el usuario no tiene roles asignados, solo Portal Empleado
    if (!isViewingAs && userRoles.length === 0) {
      return section === 'portal-empleado'
    }
    
    // Si es GERENTE (real o simulado), acceso a todo excepto tickets/gastos
    if (effectiveRole === 'GERENTE') {
      return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
    }
    
    // Secciones exclusivas de SUPER_ADMIN
    if (SECCIONES_SUPER_ADMIN_ONLY.includes(section)) {
      return false
    }
    
    // Para multi-rol: verificar si ALGUNO de los roles del usuario tiene acceso
    if (!isViewingAs && userRoles.length > 0) {
      return userRoles.some(rol => {
        const permisos = PERMISOS_POR_ROL[rol as RolId]
        if (!permisos) return false
        if (permisos.includes('*')) return true
        return permisos.includes(section)
      })
    }
    
    // Verificar permisos del rol efectivo (modo "ver como rol")
    const permisos = PERMISOS_POR_ROL[effectiveRole]
    if (!permisos) return false
    if (permisos.includes('*')) return true
    return permisos.includes(section)
  }, [effectiveRole, isSuperAdmin, isViewingAs, isViewingAsUser, userRoles, viewingUser, permisosGranulares])

  // Verificación granular por código de área (nuevo sistema)
  const hasAreaAccess = useCallback((codigoArea: string, tipo: 'lectura' | 'escritura' = 'lectura') => {
    // SUPER_ADMIN sin simulación: acceso total
    if (isSuperAdmin && !isViewingAs) return true

    // GERENTE sin simulación de usuario: acceso total
    if (effectiveRole === 'GERENTE' && !isViewingAsUser) return true

    // Construir cadena de herencia
    const partes = codigoArea.split('.')
    const codigosHerencia: string[] = []
    for (let i = 1; i <= partes.length; i++) {
      codigosHerencia.push(partes.slice(0, i).join('.'))
    }

    // Buscar en permisos granulares
    for (const p of permisosGranulares) {
      if (codigosHerencia.includes(p.codigo)) {
        if (tipo === 'lectura' && p.lectura) return true
        if (tipo === 'escritura' && p.escritura) return true
      }
    }

    return false
  }, [isSuperAdmin, isViewingAs, isViewingAsUser, effectiveRole, permisosGranulares])

  return (
    <RoleContext.Provider value={{
      activeRole: viewAsRole,
      isViewingAs,
      isViewingAsUser,
      viewingUser,
      realRole: userRole,
      realRoles: userRoles,
      isSuperAdmin,
      setViewAsRole,
      setViewAsUser,
      hasAccess,
      hasAreaAccess,
      effectiveRole,
      permisosGranulares,
      effectiveUserId,
    }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
