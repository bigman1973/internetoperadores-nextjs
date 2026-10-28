'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import {
  decideAdminPermissionSeedLoad,
  type AdminPermissionSsrSeed,
} from '@/lib/admin-permissions-ssr-contract'
import {
  hasAccess as evaluateSidebarAccess,
  type AdminSidebarPermission,
  type AdminSidebarPreviewUser,
} from './sidebar-access-evaluator'

// Roles disponibles en el sistema
export const ROLES_DISPONIBLES = [
  { id: 'SUPER_ADMIN', label: 'Super Admin', color: 'bg-red-100 text-red-800' },
  { id: 'GERENTE', label: 'Gerente', color: 'bg-purple-100 text-purple-800' },
  { id: 'MARKETING', label: 'Marketing', color: 'bg-pink-100 text-pink-800' },
  { id: 'VENTAS', label: 'Ventas', color: 'bg-blue-100 text-blue-800' },
  { id: 'CONTABILIDAD', label: 'Contabilidad', color: 'bg-green-100 text-green-800' },
  { id: 'RRHH', label: 'RRHH', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'VISOR', label: 'Visor', color: 'bg-gray-100 text-gray-800' },
] as const

export type RolId = typeof ROLES_DISPONIBLES[number]['id']

// Se mantienen estas exportaciones de política para los consumidores existentes.
export { PERMISOS_POR_ROL, SECCIONES_SUPER_ADMIN_ONLY } from './sidebar-access-evaluator'

// Interfaz de permisos granulares
interface PermisoGranular extends AdminSidebarPermission {
  areaId?: string
}

interface UsuarioSimulado extends AdminSidebarPreviewUser {}

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
  permisosLoaded: boolean
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
  permisosLoaded: false,
})

export function RoleProvider({
  children,
  userRole,
  userRoles,
  userId,
  initialPermissions,
  initialPermissionsLoaded,
  skipPermissionLoad,
}: {
  children: React.ReactNode
  userRole: string
  userRoles: string[]
  userId?: number
  /** Foto serializada sólo para el actor efectivo de la respuesta SSR actual. */
  initialPermissions?: readonly AdminPermissionSsrSeed[]
  initialPermissionsLoaded?: boolean
  /** MODO_FACIL_ONLY no monta ProtectedRoute y no debe competir con un GET inútil. */
  skipPermissionLoad?: boolean
}) {
  const [viewAsRole, setViewAsRoleState] = useState<RolId | null>(null)
  const [viewingUser, setViewingUser] = useState<UsuarioSimulado | null>(null)
  const [permisosGranulares, setPermisosGranulares] = useState<PermisoGranular[]>(() =>
    (initialPermissions || []).map(permission => ({ ...permission })),
  )
  const [permisosLoaded, setPermisosLoaded] = useState(initialPermissionsLoaded === true)
  // Una previsualización es local y no cambia la sesión. Tras usarla no se puede
  // restaurar una ACL serializada al hidratar: incluso al volver al actor inicial
  // se consulta de nuevo la API, que vuelve a validar la sesión.
  const [initialSeedInvalidated, setInitialSeedInvalidated] = useState(false)

  const isSuperAdmin = userRole === 'SUPER_ADMIN'
  const isViewingAsUser = isSuperAdmin && viewingUser !== null
  const isViewingAs = isSuperAdmin && (viewAsRole !== null || viewingUser !== null)

  const effectiveRole: RolId = isViewingAsUser
    ? (viewingUser!.rol as RolId)
    : (viewAsRole ? viewAsRole : (userRole as RolId))

  const effectiveUserId = isViewingAsUser ? viewingUser!.id : (userId || null)
  const isPrivilegedRealRole = !isViewingAs && (userRole === 'SUPER_ADMIN' || userRole === 'GERENTE')

  // ¿Tiene permisos granulares asignados? (con al menos 1 lectura=true)
  const tienePermisosGranulares = permisosGranulares.some(p => p.lectura || p.escritura)

  // Cargar permisos granulares del usuario efectivo. La foto SSR sólo evita el
  // GET inicial del mismo actor, no concede permisos a una API ni sobrevive a
  // una previsualización local.
  useEffect(() => {
    const mode = decideAdminPermissionSeedLoad({
      // userId ya existía en el contrato del provider; identifica al actor
      // inicial de esta respuesta sin exponer un identificador adicional.
      actorId: userId,
      effectiveUserId,
      initialPermissionsLoaded,
      skipPermissionLoad,
      isPrivilegedRealRole,
      isViewingAs,
      initialSeedInvalidated,
    })

    if (mode === 'idle') return

    if (mode === 'seed' || mode === 'skip' || mode === 'privileged') {
      setPermisosGranulares(mode === 'seed' ? (initialPermissions || []).map(permission => ({ ...permission })) : [])
      setPermisosLoaded(true)
      return
    }

    const uid = effectiveUserId
    if (!uid) return
    const controller = new AbortController()
    let current = true
    setPermisosGranulares([])
    setPermisosLoaded(false)
    fetch(`/api/admin/permisos?action=usuario&usuarioId=${uid}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (!current) return
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
        if (!current || controller.signal.aborted) return
        console.error('Error cargando permisos granulares:', err)
        setPermisosLoaded(true)
      })
    return () => {
      current = false
      controller.abort()
    }
  }, [effectiveUserId, initialPermissions, initialPermissionsLoaded, initialSeedInvalidated, isPrivilegedRealRole, isViewingAs, skipPermissionLoad, userId])

  const setViewAsRole = useCallback((role: RolId | null) => {
    if (role !== null) setInitialSeedInvalidated(true)
    setViewAsRoleState(role)
  }, [])

  const setViewAsUser = useCallback((user: UsuarioSimulado | null) => {
    if (user) setInitialSeedInvalidated(true)
    setViewingUser(user)
    if (user) {
      setViewAsRoleState(null)
    }
  }, [])

  const hasAccess = useCallback((section: string) => evaluateSidebarAccess({
    section,
    effectiveRole,
    isSuperAdmin,
    isViewingAs,
    isViewingAsUser,
    viewAsRole,
    userRoles,
    viewingUser,
    permisosGranulares,
    tienePermisosGranulares,
  }), [effectiveRole, isSuperAdmin, isViewingAs, isViewingAsUser, viewAsRole, userRoles, viewingUser, permisosGranulares, tienePermisosGranulares])

  // Verificación granular por código de área
  const hasAreaAccess = useCallback((codigoArea: string, tipo: 'lectura' | 'escritura' = 'lectura') => {
    if (isSuperAdmin && !isViewingAs) return true
    if (effectiveRole === 'GERENTE' && !isViewingAsUser) return true

    // Construir cadena de herencia hacia arriba (padres del área solicitada)
    const partes = codigoArea.split('.')
    const codigosHerencia: string[] = []
    for (let i = 1; i <= partes.length; i++) {
      codigosHerencia.push(partes.slice(0, i).join('.'))
    }

    for (const p of permisosGranulares) {
      // El permiso cubre el área exacta o es un padre (herencia hacia abajo)
      if (codigosHerencia.includes(p.codigo)) {
        if (tipo === 'lectura' && p.lectura) return true
        if (tipo === 'escritura' && p.escritura) return true
      }
      // El permiso es un hijo del área solicitada (acceso al contenedor padre)
      // Ej: tiene admin.clientes.ggcc.draxton.proyectos → puede acceder a admin.clientes.ggcc.draxton
      if (p.codigo.startsWith(codigoArea + '.')) {
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
      permisosLoaded,
    }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}
