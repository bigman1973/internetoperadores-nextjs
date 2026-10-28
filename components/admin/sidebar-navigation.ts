export type FinanceEnvironment = 'staging' | 'production' | null

export type SidebarIconName =
  | 'academicCap'
  | 'arrowPath'
  | 'arrowTrendingUp'
  | 'arrowsRightLeft'
  | 'banknotes'
  | 'bookOpen'
  | 'briefcase'
  | 'buildingLibrary'
  | 'buildingOffice'
  | 'calendarDays'
  | 'calculator'
  | 'chartBar'
  | 'chatBubbleLeftEllipsis'
  | 'chatBubbleLeftRight'
  | 'circleStack'
  | 'clipboardDocumentList'
  | 'cloudArrowUp'
  | 'clock'
  | 'cog'
  | 'creditCard'
  | 'documentDuplicate'
  | 'documentText'
  | 'folder'
  | 'globeAlt'
  | 'home'
  | 'inboxStack'
  | 'lightBulb'
  | 'link'
  | 'megaphone'
  | 'queueList'
  | 'receiptPercent'
  | 'rocketLaunch'
  | 'shieldCheck'
  | 'signal'
  | 'sparkles'
  | 'sun'
  | 'user'
  | 'userGroup'
  | 'users'
  | 'wrenchScrewdriver'

export interface SidebarNavigationItem {
  name: string
  href: string
  icon: SidebarIconName
  section?: string
  exact?: boolean
  subitems?: SidebarNavigationItem[]
}

export interface SidebarNavigationGroup {
  name: string
  icon: SidebarIconName
  section?: string
  children: SidebarNavigationItem[]
}

export type SidebarNavigationEntry = SidebarNavigationItem | SidebarNavigationGroup

export function isSidebarNavigationGroup(entry: SidebarNavigationEntry): entry is SidebarNavigationGroup {
  return 'children' in entry
}

const navigation: SidebarNavigationEntry[] = [
  { name: 'Dashboard', href: '/admin', icon: 'home', section: 'dashboard' },
  {
    name: 'CRM', icon: 'chartBar', section: 'crm', children: [
      { name: 'Resumen', href: '/admin/crm', icon: 'chartBar', section: 'crm' },
      { name: 'Contactos', href: '/admin/crm/contactos', icon: 'userGroup', section: 'crm.contactos' },
      { name: 'Empresas y autónomos', href: '/admin/crm/empresas', icon: 'buildingOffice', section: 'crm.empresas' },
      { name: 'Listas y segmentos', href: '/admin/crm/listas', icon: 'circleStack', section: 'crm.listas' },
      { name: 'Particulares', href: '/admin/clientes?segmento=PARTICULAR', icon: 'user', section: 'crm.particulares' },
      { name: 'Partners', href: '/admin/crm/partners', icon: 'userGroup', section: 'crm.partners' },
    ],
  },
  { name: 'Tarifas', href: '/admin/tarifas', icon: 'creditCard', section: 'tarifas' },
  {
    name: 'Clientes', icon: 'users', section: 'clientes', children: [
      { name: 'Todos los clientes', href: '/admin/clientes', icon: 'users', section: 'clientes.todos' },
      { name: 'Migración ADAMO', href: '/admin/clientes/migracion-adamo', icon: 'arrowPath', section: 'clientes.migracion_adamo' },
      { name: 'GGCC - Draxton', href: '/admin/clientes/ggcc/draxton', icon: 'buildingOffice', section: 'clientes.ggcc.draxton' },
      { name: 'GGCC - Exagrid', href: '/admin/clientes/ggcc/exagrid', icon: 'buildingOffice', section: 'clientes.ggcc.exagrid' },
      { name: 'Proyectos Cliente', href: '/admin/proyectos', icon: 'folder', section: 'proyectos' },
    ],
  },
  {
    name: 'Leads', icon: 'inboxStack', section: 'leads', children: [
      { name: 'Gestión', href: '/admin/leads-soluciones', icon: 'queueList', section: 'leads' },
      { name: 'Mantenimiento IT', href: '/admin/leads-mantenimiento', icon: 'wrenchScrewdriver', section: 'leads' },
      { name: 'Leads Web', href: '/admin/leads', icon: 'globeAlt', section: 'leads' },
    ],
  },
  {
    name: 'Asistente IA', icon: 'sparkles', section: 'asistente', children: [
      { name: 'Resumen', href: '/admin/asistente', icon: 'chartBar', section: 'asistente', exact: true },
      { name: 'Chat interno', href: '/admin/asistente/chat', icon: 'chatBubbleLeftRight', section: 'asistente.chat' },
      { name: 'Conocimiento', href: '/admin/asistente/conocimiento', icon: 'bookOpen', section: 'asistente.conocimiento' },
      { name: 'Conversaciones', href: '/admin/asistente/conversaciones', icon: 'queueList', section: 'asistente.conversaciones' },
      { name: 'Leads del asistente', href: '/admin/asistente/leads', icon: 'inboxStack', section: 'asistente.leads' },
      { name: 'Aprendizaje', href: '/admin/asistente/aprendizaje', icon: 'lightBulb', section: 'asistente.aprendizaje' },
      { name: 'Analítica', href: '/admin/asistente/analitica', icon: 'arrowTrendingUp', section: 'asistente.analitica' },
      { name: 'Informes y propuestas', href: '/admin/asistente/informes', icon: 'documentText', section: 'asistente.propuestas' },
      { name: 'Configuración', href: '/admin/asistente/configuracion', icon: 'cog', section: 'asistente.configuracion' },
    ],
  },
  { name: 'Comunicados', href: '/admin/comunicados', icon: 'megaphone', section: 'comunicados' },
  { name: 'Altas Pendientes', href: '/admin/altas-pendientes', icon: 'clipboardDocumentList', section: 'altas-pendientes' },
  { name: 'Contratos', href: '/admin/contratos', icon: 'documentDuplicate', section: 'contratos' },
  { name: 'Facturación', href: '/admin/facturacion', icon: 'banknotes', section: 'facturacion' },
  {
    name: 'Finanzas', icon: 'calculator', section: 'finanzas', children: [
      { name: 'Dashboard', href: '/admin/finanzas', icon: 'chartBar', section: 'finanzas' },
      { name: 'Movimientos', href: '/admin/finanzas/movimientos', icon: 'banknotes', section: 'finanzas' },
      { name: 'Pendientes', href: '/admin/finanzas/pendientes', icon: 'clipboardDocumentList', section: 'finanzas' },
      { name: 'Conciliar', href: '/admin/finanzas/conciliar', icon: 'arrowsRightLeft', section: 'finanzas' },
      { name: 'Conciliación', href: '/admin/finanzas/conciliacion-v2', icon: 'link', section: 'finanzas' },
      { name: 'Modo fácil', href: '/admin/finanzas/modo-facil', icon: 'clipboardDocumentList', section: 'finanzas' },
      { name: 'Para pedir', href: '/admin/finanzas/para-pedir', icon: 'documentText', section: 'finanzas' },
      { name: 'Reparto entre clientes', href: '/admin/finanzas/reparto-clientes', icon: 'chartBar', section: 'finanzas.analitica_costes' },
      { name: 'Analítica por cliente', href: '/admin/finanzas/analitica-cliente', icon: 'chartBar', section: 'finanzas' },
      { name: 'Remesas', href: '/admin/finanzas/conciliacion-remesas', icon: 'inboxStack', section: 'finanzas' },
      { name: 'Centros de coste', href: '/admin/finanzas/centros-coste', icon: 'chartBar', section: 'finanzas' },
      { name: 'Facturas Recibidas', href: '/admin/finanzas/facturas', icon: 'documentDuplicate', section: 'finanzas' },
      {
        name: 'Analítica de Costes', href: '/admin/finanzas/analitica-costes', icon: 'chartBar', section: 'finanzas.analitica_costes', subitems: [
          { name: 'Costes de operadora', href: '/admin/finanzas/analitica-costes/costes-operadora', icon: 'signal', section: 'finanzas.analitica_costes' },
        ],
      },
      { name: 'Tickets/Gastos', href: '/admin/finanzas/tickets', icon: 'receiptPercent', section: 'finanzas-tickets' },
      { name: 'Importar Extracto', href: '/admin/finanzas/importar', icon: 'arrowPath', section: 'finanzas' },
      { name: 'Exportar a A3', href: '/admin/finanzas/exportar-a3', icon: 'documentText', section: 'finanzas' },
      { name: 'Datos Fiscales', href: '/admin/finanzas/datos-fiscales', icon: 'buildingOffice', section: 'finanzas' },
      { name: 'Cobros Pendientes', href: '/admin/finanzas/cobros-pendientes', icon: 'banknotes', section: 'finanzas' },
      { name: 'GGCC Draxton', href: '/admin/finanzas/clientes/ggcc-draxton', icon: 'buildingOffice', section: 'finanzas' },
    ],
  },
  { name: 'Estadísticas', href: '/admin/estadisticas', icon: 'chartBar', section: 'estadisticas' },
  { name: 'Usuarios Admin', href: '/admin/usuarios', icon: 'userGroup', section: 'usuarios' },
  { name: 'Subida de Precios', href: '/admin/subida-precios', icon: 'arrowTrendingUp', section: 'subida-precios' },
  {
    name: 'Personal', icon: 'briefcase', section: 'personal', children: [
      { name: 'Costes de Personal', href: '/admin/empleados', icon: 'banknotes', section: 'personal' },
      { name: 'Organigrama', href: '/admin/empleados/organigrama', icon: 'userGroup', section: 'personal' },
      { name: 'Vacaciones', href: '/admin/empleados/vacaciones', icon: 'sun', section: 'personal' },
      { name: 'Calendario', href: '/admin/empleados/calendario', icon: 'calendarDays', section: 'personal' },
      { name: 'Importar Nóminas', href: '/admin/empleados/nominas', icon: 'cloudArrowUp', section: 'personal' },
      { name: 'Plan de Carrera', href: '/admin/empleados/plan-carrera', icon: 'academicCap', section: 'personal' },
      { name: 'Gastos y Extras', href: '/admin/gastos-extras', icon: 'receiptPercent', section: 'personal' },
    ],
  },
  { name: 'Imputaciones', href: '/admin/imputaciones', icon: 'clock', section: 'imputaciones' },
  { name: 'Proyectos Internos', href: '/admin/proyectos-internos', icon: 'rocketLaunch', section: 'proyectos_internos' },
  {
    name: 'AAPP', icon: 'buildingLibrary', section: 'aapp', children: [
      { name: 'CNMC', href: '/admin/aapp/cnmc', icon: 'buildingLibrary', section: 'aapp' },
      { name: 'Hacienda', href: '/admin/aapp/hacienda', icon: 'buildingLibrary', section: 'aapp' },
      { name: 'Seguridad Social', href: '/admin/aapp/seguridad-social', icon: 'buildingLibrary', section: 'aapp' },
    ],
  },
  {
    name: 'Certificaciones', icon: 'shieldCheck', section: 'certificaciones', children: [
      { name: 'Resumen', href: '/admin/certificaciones', icon: 'chartBar', section: 'certificaciones' },
      { name: 'ISO 27001', href: '/admin/certificaciones/iso-27001', icon: 'shieldCheck', section: 'certificaciones.iso_27001' },
      { name: 'TISAX', href: '/admin/certificaciones/tisax', icon: 'shieldCheck', section: 'certificaciones.tisax' },
      { name: 'Cuestionarios de seguridad', href: '/admin/certificaciones/cuestionarios', icon: 'clipboardDocumentList', section: 'certificaciones.cuestionarios' },
    ],
  },
  { name: 'Peticiones', href: '/admin/peticiones', icon: 'chatBubbleLeftEllipsis', section: 'peticiones' },
  { name: 'Portal Empleado', href: '/empleado', icon: 'user', section: 'portal-empleado' },
  { name: 'Historial', href: '/admin/historial', icon: 'documentText', section: 'historial' },
  { name: 'Configuración', href: '/admin/configuracion', icon: 'cog', section: 'configuracion' },
]

function withFinanceEnvironment(financeEnvironment: FinanceEnvironment): SidebarNavigationEntry[] {
  const financeLabel = financeEnvironment === 'staging' ? ' · staging' : ''

  return navigation.map(entry => {
    if (!isSidebarNavigationGroup(entry) || entry.name !== 'Finanzas') return entry

    return {
      ...entry,
      children: entry.children
        .filter(child => {
          if (child.href === '/admin/finanzas/conciliar') return financeEnvironment === 'staging'
          if (['/admin/finanzas/modo-facil', '/admin/finanzas/para-pedir', '/admin/finanzas/reparto-clientes'].includes(child.href)) return financeEnvironment !== null
          // Telefonía/SOFÍA continúa aparcada en producción.
          if (child.href === '/admin/finanzas/analitica-cliente') return financeEnvironment === 'staging'
          return true
        })
        .map(child => ({
          ...child,
          name: ['/admin/finanzas/modo-facil', '/admin/finanzas/para-pedir', '/admin/finanzas/reparto-clientes', '/admin/finanzas/analitica-cliente'].includes(child.href)
            ? `${child.name}${financeLabel}`
            : child.name,
        })),
    }
  })
}

export function getSidebarNavigation(financeEnvironment: FinanceEnvironment): SidebarNavigationEntry[] {
  return withFinanceEnvironment(financeEnvironment)
}

export function getEasyOnlySidebarNavigation(financeEnvironment: FinanceEnvironment): SidebarNavigationItem[] {
  const easyHome = financeEnvironment === 'staging' ? '/admin/finanzas/conciliar' : '/admin/finanzas/modo-facil'
  return [
    {
      name: financeEnvironment === 'staging' ? 'Conciliar' : 'Modo fácil',
      href: easyHome,
      icon: 'clipboardDocumentList',
    },
    { name: 'Para pedir', href: '/admin/finanzas/para-pedir', icon: 'documentText' },
  ]
}

function filterItem(item: SidebarNavigationItem, hasAccess: (section: string) => boolean): SidebarNavigationItem | null {
  if (item.section && !hasAccess(item.section)) return null

  return {
    ...item,
    subitems: item.subitems
      ?.map(subitem => filterItem(subitem, hasAccess))
      .filter((subitem): subitem is SidebarNavigationItem => subitem !== null),
  }
}

/**
 * Produce el árbol de presentación ya autorizado. No concede nada por sí mismo:
 * su autoridad es exclusivamente el evaluador que recibe de la respuesta actual.
 */
export function filterAuthorizedSidebarNavigation(
  financeEnvironment: FinanceEnvironment,
  hasAccess: (section: string) => boolean,
): SidebarNavigationEntry[] {
  return getSidebarNavigation(financeEnvironment)
    .map(entry => {
      if (!isSidebarNavigationGroup(entry)) return filterItem(entry, hasAccess)

      const children = entry.children
        .map(child => filterItem(child, hasAccess))
        .filter((child): child is SidebarNavigationItem => child !== null)
      const groupAccess = hasAccess(entry.section || 'dashboard')

      // Se conserva el contrato del sidebar anterior: un grupo con permiso propio
      // permanece visible aunque todos sus hijos estén restringidos.
      if (!groupAccess && children.length === 0) return null
      return { ...entry, children }
    })
    .filter((entry): entry is SidebarNavigationEntry => entry !== null)
}
