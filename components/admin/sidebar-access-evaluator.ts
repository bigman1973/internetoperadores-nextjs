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

// Permisos por sección según rol (SOLO se usan si el usuario NO tiene permisos granulares)
export const PERMISOS_POR_ROL: Record<string, readonly string[]> = {
  SUPER_ADMIN: ['*'],
  GERENTE: [
    'dashboard', 'crm', 'tarifas', 'clientes', 'leads', 'comunicados',
    'altas-pendientes', 'contratos', 'facturacion', 'finanzas',
    'estadisticas', 'subida-precios', 'personal',
    'proyectos', 'historial', 'configuracion', 'certificaciones', 'certificaciones.iso_27001', 'certificaciones.tisax', 'certificaciones.cuestionarios',
    'asistente', 'asistente.chat', 'asistente.conocimiento', 'asistente.conversaciones', 'asistente.leads', 'asistente.aprendizaje', 'asistente.analitica', 'asistente.propuestas', 'asistente.configuracion',
    'aapp', 'peticiones', 'imputaciones', 'proyectos_internos',
  ],
  MARKETING: [
    'dashboard', 'crm', 'leads', 'comunicados', 'estadisticas',
  ],
  VENTAS: [
    'dashboard', 'crm', 'tarifas', 'clientes', 'leads', 'altas-pendientes', 'contratos',
  ],
  CONTABILIDAD: [
    'dashboard', 'facturacion', 'finanzas', 'subida-precios', 'estadisticas',
  ],
  RRHH: [
    'dashboard', 'personal',
  ],
  VISOR: [],
}

// Secciones que requieren acceso exclusivo del propietario canónico (Víctor).
export const SECCIONES_SUPER_ADMIN_ONLY = [
  'usuarios', 'auditoria', 'actuar-como',
  'admin.usuarios', 'admin.auditoria', 'admin.actuar_como',
]

// Mapeo de secciones del sidebar a códigos de área granular
const SECTION_TO_AREA: Record<string, string> = {
  dashboard: 'admin',
  crm: 'admin.crm',
  'crm.contactos': 'admin.crm.contactos',
  'crm.listas': 'admin.crm.listas',
  'crm.particulares': 'admin.crm.particulares',
  'crm.empresas': 'admin.crm.empresas',
  'crm.partners': 'admin.crm.partners',
  tarifas: 'admin.tarifas',
  clientes: 'admin.clientes',
  'clientes.todos': 'admin.clientes.todos',
  'clientes.migracion_adamo': 'admin.clientes.migracion_adamo',
  'clientes.ggcc.draxton': 'admin.clientes.ggcc.draxton',
  leads: 'admin.leads',
  comunicados: 'admin.comunicados',
  'altas-pendientes': 'admin.altas_pendientes',
  contratos: 'admin.contratos',
  facturacion: 'admin.facturacion',
  finanzas: 'admin.finanzas',
  'finanzas.analitica_costes': 'admin.finanzas.analitica_costes',
  'finanzas-tickets': 'admin.finanzas.tickets',
  estadisticas: 'admin.estadisticas',
  usuarios: 'admin.usuarios',
  auditoria: 'admin.auditoria',
  'subida-precios': 'admin.subida_precios',
  personal: 'admin.empleados',
  proyectos: 'admin.proyectos',
  certificaciones: 'admin.certificaciones',
  'certificaciones.iso_27001': 'admin.certificaciones.iso_27001',
  'certificaciones.tisax': 'admin.certificaciones.tisax',
  'certificaciones.cuestionarios': 'admin.certificaciones.cuestionarios',
  historial: 'admin.historial',
  configuracion: 'admin.configuracion',
  peticiones: 'admin.peticiones',
  'portal-empleado': 'admin',
  asistente: 'admin.asistente',
  'asistente.chat': 'admin.asistente.chat',
  'asistente.conocimiento': 'admin.asistente.conocimiento',
  'asistente.conversaciones': 'admin.asistente.conversaciones',
  'asistente.leads': 'admin.asistente.leads',
  'asistente.aprendizaje': 'admin.asistente.aprendizaje',
  'asistente.analitica': 'admin.asistente.analitica',
  'asistente.propuestas': 'admin.asistente.propuestas',
  'asistente.configuracion': 'admin.asistente.configuracion',
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
}>

/**
 * Verificar acceso a una sección del sidebar.
 * REGLA PRINCIPAL: Si el usuario tiene permisos granulares asignados,
 * SOLO se usan esos. Si no tiene ninguno, se usa el sistema de roles legacy.
 *
 * Esta función es la única implementación de la política de `hasAccess`.
 */
export function hasAccess(input: AdminSidebarAccessInput): boolean {
  let section = input.section
  const {
    effectiveRole,
    isSuperAdmin,
    isArea4Owner,
    isViewingAs,
    isViewingAsUser,
    viewAsRole,
    userRoles,
    viewingUser,
    permisosGranulares,
    tienePermisosGranulares,
  } = input

  // Solo el propietario canónico tiene acceso total, y nunca mientras ve a otra persona.
  if (isArea4Owner && !isViewingAs) return true
  if (SECCIONES_SUPER_ADMIN_ONLY.includes(section)) return false

  // Una cuenta histórica SUPER_ADMIN que no sea Víctor queda cerrada por defecto.
  if (isSuperAdmin && !isViewingAs) return false

  // Portal empleado siempre accesible
  if (section === 'portal-empleado') return true

  if (section === 'finanzas.analitica_costes' && !tienePermisosGranulares) section = 'finanzas'

  // Si está simulando un usuario específico
  if (isViewingAsUser && viewingUser) {
    // Usar SOLO permisos granulares para el usuario simulado
    if (tienePermisosGranulares) {
      return checkGranularAccess(section, permisosGranulares)
    }
    // Si no tiene granulares, usar su rol
    const userRolesEff = viewingUser.roles?.length > 0 ? viewingUser.roles : [viewingUser.rol]
    return userRolesEff.some(rol => {
      if (rol === 'GERENTE') return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
      const permisos = PERMISOS_POR_ROL[rol]
      if (!permisos) return false
      if (permisos.includes('*')) return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
      return permisos.includes(section)
    })
  }

  // Si está simulando un rol (no un usuario)
  if (isViewingAs && viewAsRole) {
    if (effectiveRole === 'GERENTE') return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
    const permisos = PERMISOS_POR_ROL[effectiveRole]
    if (!permisos) return false
    if (permisos.includes('*')) return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
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
    const permisos = PERMISOS_POR_ROL[rol]
    if (!permisos) return false
    if (permisos.includes('*')) return !SECCIONES_SUPER_ADMIN_ONLY.includes(section)
    return permisos.includes(section)
  })
}

/**
 * Verifica si un usuario con permisos granulares tiene acceso a una sección del sidebar.
 * La sección se mapea a un código de área, y se verifica si alguno de los permisos
 * del usuario cubre esa área (directamente o por herencia hacia abajo).
 */
export function checkGranularAccess(
  section: string,
  permisos: readonly AdminSidebarPermission[],
): boolean {
  const codigoArea = SECTION_TO_AREA[section]
    || (section.startsWith('admin.') || section.startsWith('empleado.') ? section : `admin.${section.replace(/-/g, '_')}`)

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

/** Firma estable, sólo para saber si la foto recibida por el cliente cambió. */
export function permissionSignature(permissions: readonly AdminSidebarPermission[]): string {
  return permissions
    .map(permission => `${permission.codigo}:${permission.lectura ? '1' : '0'}${permission.escritura ? '1' : '0'}${permission.confirmar ? '1' : '0'}${permission.exportar ? '1' : '0'}`)
    .sort()
    .join('|')
}
