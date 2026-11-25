import { evaluateArea4Capability, grantAllowsArea4Capability, isArea4OwnerOnlyArea, area4FinanceModuleAllows } from '@/lib/area4/policy'
import { area4SectionByKey, area4CodeIsBaseline } from '@/lib/area4/section-registry'
import { area4CodeSeedAllows, type Area4SurfacePermissionSeed } from '@/lib/area4/surface-access-contract'

export type AdminSidebarPermission = Readonly<{
  codigo: string
  lectura: boolean
  escritura: boolean
  confirmar?: boolean
  exportar?: boolean
}>

export type AdminSidebarPreviewUser = Readonly<{
  id: number
  nombre: string
  email: string
  rol: string
  roles: string[]
}>

// Compatibilidad legacy sin grants: SUPER_ADMIN nunca es un rol delegable.
export const PERMISOS_POR_ROL: Record<string, readonly string[]> = {
  SUPER_ADMIN: [],
  GERENTE: [
    'dashboard', 'crm', 'tarifas', 'clientes', 'leads', 'comunicados',
    'altas-pendientes', 'contratos', 'facturacion', 'finanzas',
    'estadisticas', 'subida-precios', 'personal',
    'proyectos', 'historial', 'configuracion', 'certificaciones',
    'asistente', 'aapp', 'peticiones', 'imputaciones', 'proyectos_internos',
  ],
  MARKETING: ['dashboard', 'crm', 'leads', 'comunicados', 'estadisticas'],
  VENTAS: ['dashboard', 'crm', 'tarifas', 'clientes', 'leads', 'altas-pendientes', 'contratos'],
  CONTABILIDAD: ['dashboard', 'facturacion', 'finanzas', 'estadisticas'],
  RRHH: ['dashboard', 'personal'],
  VISOR: [],
}

export const SECCIONES_SUPER_ADMIN_ONLY = [
  'usuarios', 'permisos', 'auditoria', 'actuar-como',
  'admin.usuarios', 'admin.permisos', 'admin.auditoria', 'admin.actuar_como',
]

const SECTION_TO_AREA: Record<string, string> = {
  dashboard: 'admin',
  'clientes.todos': 'admin.clientes',
  'finanzas-tickets': 'admin.finanzas.tickets',
  personal: 'admin.empleados',
  proyectos: 'admin.proyectos',
  usuarios: 'admin.usuarios',
  permisos: 'admin.permisos',
  proyectos_internos: 'admin.proyectos_internos',
}

function sectionArea(section: string): string {
  return SECTION_TO_AREA[section]
    || area4SectionByKey(section)?.areaCode
    || (section === 'admin' || section.startsWith('admin.') || section.startsWith('empleado.')
      ? section
      : `admin.${section.replace(/-/g, '_')}`)
}

export type AdminSidebarAccessInput = Readonly<{
  section: string
  effectiveRole: string
  isSuperAdmin: boolean
  isArea4Owner: boolean
  isViewingAs: boolean
  isViewingAsUser: boolean
  viewAsRole: string | null
  userRoles: readonly string[]
  viewingUser: AdminSidebarPreviewUser | null
  permisosGranulares: readonly AdminSidebarPermission[]
  tienePermisosGranulares: boolean
  permissionsAdopted?: boolean
  surfacePermissions?: readonly Area4SurfacePermissionSeed[]
}>

/** Representa la política viva; jamás concede autoridad por la identidad del actor inicial. */
export function hasAccess(input: AdminSidebarAccessInput): boolean {
  const codigoArea = sectionArea(input.section)
  const preview = input.isViewingAs || input.isViewingAsUser || input.viewingUser !== null || input.viewAsRole !== null
  const role = input.isViewingAsUser
    ? input.viewingUser?.rol
    : (input.viewAsRole || input.effectiveRole)
  if (!role) return false
  // Simular solo un rol no identifica a otro usuario: sus grants no pueden
  // provenir de la ACL del propietario que inició la previsualización.
  const rolePreview = preview && !input.isViewingAsUser
  const grants = rolePreview ? [] : input.permisosGranulares

  const owner = input.isArea4Owner && role === 'SUPER_ADMIN' && !preview
  const moduleRoles = input.isViewingAsUser ? input.viewingUser?.roles || [] : preview ? [] : input.userRoles
  if (!area4FinanceModuleAllows({ principal: { id: 0, activo: true, rol: role, roles: moduleRoles }, codigoArea, capability: 'lectura', isImpersonating: preview })) return false
  // Los módulos de staging conservan propietario real, sin actuación ni grants.
  if (['admin.rentabilidad', 'admin.sistemas'].some(area => codigoArea === area || codigoArea.startsWith(`${area}.`))) return owner
  if (owner) return true
  if (isArea4OwnerOnlyArea(codigoArea)) return false
  // Tanto un SUPER_ADMIN no canónico como la previsualización de ese rol fallan cerrados.
  if (role === 'SUPER_ADMIN') return false
  if (!area4CodeIsBaseline(codigoArea)) {
    if (rolePreview || !input.permissionsAdopted || !area4CodeSeedAllows(input.surfacePermissions || [], codigoArea)) return false
    return grants.some(grant => grant.codigo === codigoArea && grant.lectura)
  }

  // Subida conserva la guardia actual de staging: rol principal Gerente o
  // propietario, nunca un grant operativo ni una simulación del actor real.
  if ((codigoArea === 'admin.subida_precios' || codigoArea.startsWith('admin.subida_precios.')) && (preview || role !== 'GERENTE')) return false

  // La política compartida aplica también la revocación explícita a Gerente.
  if (role === 'GERENTE') return evaluateArea4Capability({
    principal: { id: 0, activo: true, rol: role },
    grants,
    codigoArea,
    capability: 'lectura',
    ownerId: null,
    permissionsAdopted: !rolePreview && input.tienePermisosGranulares,
  })

  // Si existen grants (también los denegados), no se recurre a roles secundarios legacy.
  if ((!rolePreview && input.tienePermisosGranulares) || grants.length > 0) {
    return checkGranularAccess(input.section, grants)
  }

  // Un portal legacy puede seguir disponible sin abrir el root administrativo.
  if (codigoArea === 'empleado.portal') return true
  if (codigoArea === 'empleado.peticiones') return true

  // Un rol simulado no hereda los roles del actor; un usuario simulado solo usa los suyos.
  const roles = input.isViewingAsUser
    ? [role, ...(input.viewingUser?.roles || [])]
    : preview ? [role] : [role, ...input.userRoles]
  return roles.some(legacyRole => {
    // SUPER_ADMIN nunca es delegable. Gerente secundario conserva únicamente
    // su lista legacy de negocio, no el bypass del rol principal en policy.ts.
    if (legacyRole === 'SUPER_ADMIN') return false
    return (PERMISOS_POR_ROL[legacyRole] || []).some(section => {
      const grantedArea = sectionArea(section)
      return codigoArea === grantedArea || (grantedArea !== 'admin' && codigoArea.startsWith(`${grantedArea}.`))
    })
  })
}

/** Un permiso hijo no autoriza el root padre: los contenedores los resuelve el menú sin enlaces. */
export function checkGranularAccess(section: string, permisos: readonly AdminSidebarPermission[]): boolean {
  const code = sectionArea(section)
  return area4CodeIsBaseline(code) && grantAllowsArea4Capability(permisos, code, 'lectura')
}

/** Firma estable, sólo para saber si la foto recibida por el cliente cambió. */
export function permissionSignature(permissions: readonly AdminSidebarPermission[]): string {
  return permissions
    .map(permission => `${permission.codigo}:${permission.lectura ? '1' : '0'}${permission.escritura ? '1' : '0'}${permission.confirmar ? '1' : '0'}${permission.exportar ? '1' : '0'}`)
    .sort()
    .join('|')
}
