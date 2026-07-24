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

// Permisos por sección según rol (SOLO se usan si el usuario NO tiene permisos granulares)
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

// Mapeo de secciones del sidebar a códigos de área granular
const SECTION_TO_AREA: Record<string, string> = {
  'dashboard': 'admin',
  'tarifas': 'admin.tarifas',
  'clientes': 'admin.clientes',
  'clientes.todos': 'admin.clientes.todos',
  'clientes.migracion_adamo': 'admin.clientes.migracion_adamo',
  'clientes.ggcc.draxton': 'admin.clientes.ggcc.draxton',
  'leads': 'admin.leads',
  'comunicados': 'admin.comunicados',
  'altas-pendientes': 'admin.altas_pendientes',
  'contratos': 'admin.contratos',
  'facturacion': 'admin.facturacion',
  'finanzas': 'admin.finanzas',
  'finanzas-tickets': 'admin.finanzas.tickets',
  'estadisticas': 'admin.estadisticas',
  'usuarios': 'admin.usuarios',
  'subida-precios': 'admin.subida_precios',
  'personal': 'admin.empleados',
  'proyectos': 'admin.proyectos',
  'historial': 'admin.historial',
  'configuracion': 'admin.configuracion',
  'portal-empleado': 'admin',
}

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
  activeRole: RolId | null
  isViewingAs: boolean
  isViewingAsUser: boolean
  viewingUser: UsuarioSimulado | null
  realRole: string
  realRoles: string[]
  isSuperAdmin: boolean
  setViewAsRole: (role: RolId | null) => void
  setViewAsUser: (user: UsuarioSimulado | null) => void
  hasAccess: (section: string) => boolean
  hasAreaAccess: (codigoArea: string, tipo?: 'lectura' | 'escritura') => boolean
  effectiveRole: RolId
  permisosGranulares: PermisoGranular[]
  effectiveUserId: number | null
  tienePermisosGranulares: boolean
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
  tienePermisosGranulares: false,
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
  const [permisosLoaded, setPermisosLoaded] = useState(false)
  
  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const isViewingAsUser = isSuperAdmin && viewingUser !== null
  const isViewingAs = isSuperAdmin && (viewAsRole !== null || viewingUser !== null)
  
  const effectiveRole: RolId = isViewingAsUser 
    ? (viewingUser!.rol as RolId) 
    : (viewAsRole ? viewAsRole : (userRole as RolId))

  const effectiveUserId = isViewingAsUser ? viewingUser!.id : (userId || null)

  // ¿Tiene permisos granulares asignados? (con al menos 1 lectura=true)
  const tienePermisosGranulares = permisosGranulares.some(p => p.lectura || p.escritura)

  // Cargar permisos granulares del usuario efectivo
  useEffect(() => {
    const uid = isViewingAsUser ? viewingUser!.id : userId
    if (!uid) return

    // SUPER_ADMIN sin simulación no necesita cargar permisos
    if (isSuperAdmin && !isViewingAs) {
      setPermisosGranulares([])
      setPermisosLoaded(true)
      return
    }

    setPermisosLoaded(false)
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
        setPermisosLoaded(true)
      })
      .catch(err => {
        console.error('Error cargando permisos granulares:', err)
        setPermisosLoaded(true)
      })
  }, [userId, viewingUser, isViewingAs, isViewingAsUser, isSuperAdmin])

  const setViewAsUser = useCallback((user: UsuarioSimulado | null) => {
    setViewingUser(user)
    if (user) {
      setViewAsRole(null)
    }
  }, [])

  /**
   * Verificar acceso a una sección del sidebar.
   * REGLA PRINCIPAL: Si el usuario tiene permisos granulares asignados,
   * SOLO se usan esos. Si no tiene ninguno, se usa el sistema de roles legacy.
   */
  const hasAccess = useCallback((section: string) => {
    // SUPER_ADMIN real sin simulación: acceso total
    if (isSuperAdmin && !isViewingAs) return true
    
    // Portal empleado siempre accesible
    if (section === 'portal-empleado') return true

    // Si está simulando un usuario específico
    if (isViewingAsUser && viewingUser) {
      // Usar SOLO permisos granulares para el usuario simulado
      if (tienePermisosGranulares) {
        return checkGranularAccess(section, permisosGranulares)
      }
      // Si no tiene granulares, usar su rol
      const userRolesEff = viewingUser.roles?.length > 0 ? viewingUser.roles : [viewingUser.rol]
      return userRolesEff.some(rol => {
        const permisos = PERMISOS_POR_ROL[rol as RolId]
        if (!permisos) return false
        if (permisos.includes('*')) return true
        return permisos.includes(section)
      })
    }

    // Si está simulando un rol (no un usuario)
    if (isViewingAs && viewAsRole) {
      if (effectiveRole === 'GERENTE') return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
      const permisos = PERMISOS_POR_ROL[effectiveRole]
      if (!permisos) return false
      if (permisos.includes('*')) return true
      return permisos.includes(section)
    }

    // Usuario real (no simulación)
    // Si tiene permisos granulares, SOLO usar esos
    if (tienePermisosGranulares) {
      return checkGranularAccess(section, permisosGranulares)
    }

    // Sin permisos granulares → sistema legacy de roles
    if (userRoles.length === 0) return false
    
    if (effectiveRole === 'GERENTE') return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
    if (SECCIONES_SUPER_ADMIN_ONLY.includes(section)) return false
    
    return userRoles.some(rol => {
      const permisos = PERMISOS_POR_ROL[rol as RolId]
      if (!permisos) return false
      if (permisos.includes('*')) return true
      return permisos.includes(section)
    })
  }, [effectiveRole, isSuperAdmin, isViewingAs, isViewingAsUser, viewAsRole, userRoles, viewingUser, permisosGranulares, tienePermisosGranulares])

  // Verificación granular por código de área
  const hasAreaAccess = useCallback((codigoArea: string, tipo: 'lectura' | 'escritura' = 'lectura') => {
    if (isSuperAdmin && !isViewingAs) return true
    if (effectiveRole === 'GERENTE' && !isViewingAsUser) return true

    // Construir cadena de herencia
    const partes = codigoArea.split('.')
    const codigosHerencia: string[] = []
    for (let i = 1; i <= partes.length; i++) {
      codigosHerencia.push(partes.slice(0, i).join('.'))
    }

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
      tienePermisosGranulares,
    }}>
      {children}
    </RoleContext.Provider>
  )
}

/**
 * Verifica si un usuario con permisos granulares tiene acceso a una sección del sidebar.
 * La sección se mapea a un código de área, y se verifica si alguno de los permisos
 * del usuario cubre esa área (directamente o por herencia hacia abajo).
 */
function checkGranularAccess(section: string, permisos: PermisoGranular[]): boolean {
  const codigoArea = SECTION_TO_AREA[section] || `admin.${section.replace(/-/g, '_')}`
  
  return permisos.some(p => {
    if (!p.lectura) return false
    // El permiso cubre el área exacta
    if (p.codigo === codigoArea) return true
    // El permiso es un padre del área (herencia hacia abajo)
    if (codigoArea.startsWith(p.codigo + '.')) return true
    // El permiso es un hijo del área (si tiene acceso a un sub-apartado, debe ver el menú padre)
    if (p.codigo.startsWith(codigoArea + '.')) return true
    return false
  })
}

export function useRole() {
  return useContext(RoleContext)
}
