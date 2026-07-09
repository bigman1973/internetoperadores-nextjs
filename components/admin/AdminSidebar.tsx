'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { 
  HomeIcon, 
  CreditCardIcon, 
  UsersIcon, 
  ChartBarIcon,
  UserGroupIcon,
  CogIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  BanknotesIcon,
  RocketLaunchIcon,
  ClipboardDocumentListIcon,
  InboxStackIcon,
  GlobeAltIcon,
  QueueListIcon,
  SignalIcon,
  ArrowPathIcon,
  MegaphoneIcon,
  WrenchScrewdriverIcon,
  CalculatorIcon,
  LinkIcon,
  ReceiptPercentIcon,
  UserIcon,
  BriefcaseIcon,
  FolderIcon,
  CalendarDaysIcon,
  CloudArrowUpIcon,
  SunIcon,
  BuildingOffice2Icon,
  StarIcon
} from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

// Context para compartir el estado del sidebar entre componentes
export const SidebarContext = createContext<{
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}>({
  isOpen: false,
  setIsOpen: () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}

interface AdminSidebarProps {
  user: {
    name: string
    email: string
    role?: string
    roles?: string[]
  }
}

interface NavItem {
  name: string
  href: string
  icon: any
  section?: string // Sección para verificar permisos
}

interface NavGroup {
  name: string
  icon: any
  section?: string // Sección del grupo
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry
}

const navigation: NavEntry[] = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon, section: 'dashboard' },
  { name: 'Tarifas', href: '/admin/tarifas', icon: CreditCardIcon, section: 'tarifas' },
  {
    name: 'Clientes',
    icon: UsersIcon,
    section: 'clientes',
    children: [
      { name: 'Todos los clientes', href: '/admin/clientes', icon: UsersIcon },
      { name: 'Migración ADAMO', href: '/admin/clientes/migracion-adamo', icon: ArrowPathIcon },
      { name: 'GGCC - Draxton', href: '/admin/clientes/ggcc/draxton', icon: BuildingOffice2Icon },
    ],
  },
  {
    name: 'Leads',
    icon: InboxStackIcon,
    section: 'leads',
    children: [
      { name: 'Gestión', href: '/admin/leads-soluciones', icon: QueueListIcon },
      { name: 'Mantenimiento IT', href: '/admin/leads-mantenimiento', icon: WrenchScrewdriverIcon },
      { name: 'Leads Web', href: '/admin/leads', icon: GlobeAltIcon },
    ],
  },
  { name: 'Comunicados', href: '/admin/comunicados', icon: MegaphoneIcon, section: 'comunicados' },
  { name: 'Altas Pendientes', href: '/admin/altas-pendientes', icon: ClipboardDocumentListIcon, section: 'altas-pendientes' },
  { name: 'Contratos', href: '/admin/contratos', icon: DocumentDuplicateIcon, section: 'contratos' },
  { name: 'Facturación', href: '/admin/facturacion', icon: BanknotesIcon, section: 'facturacion' },
  {
    name: 'Finanzas',
    icon: CalculatorIcon,
    section: 'finanzas',
    children: [
      { name: 'Dashboard', href: '/admin/finanzas', icon: ChartBarIcon, section: 'finanzas' },
      { name: 'Movimientos', href: '/admin/finanzas/movimientos', icon: BanknotesIcon, section: 'finanzas' },
      { name: 'Conciliación', href: '/admin/finanzas/conciliacion', icon: LinkIcon, section: 'finanzas' },
      { name: 'Remesas', href: '/admin/finanzas/conciliacion-remesas', icon: InboxStackIcon, section: 'finanzas' },
      { name: 'Facturas Recibidas', href: '/admin/finanzas/facturas', icon: DocumentDuplicateIcon, section: 'finanzas' },
      { name: 'Tickets/Gastos', href: '/admin/finanzas/tickets', icon: ReceiptPercentIcon, section: 'finanzas-tickets' },
      { name: 'Importar Extracto', href: '/admin/finanzas/importar', icon: ArrowPathIcon, section: 'finanzas' },
      { name: 'Exportar a A3', href: '/admin/finanzas/exportar-a3', icon: DocumentTextIcon, section: 'finanzas' },
    ],
  },
  { name: 'Estadísticas', href: '/admin/estadisticas', icon: ChartBarIcon, section: 'estadisticas' },
  { name: 'Usuarios Admin', href: '/admin/usuarios', icon: UserGroupIcon, section: 'usuarios' },
  { name: 'Subida de Precios', href: '/admin/subida-precios', icon: ArrowTrendingUpIcon, section: 'subida-precios' },
  {
    name: 'Personal',
    icon: BriefcaseIcon,
    section: 'personal',
    children: [
      { name: 'Costes de Personal', href: '/admin/empleados', icon: BanknotesIcon },
      { name: 'Vacaciones', href: '/admin/empleados/vacaciones', icon: SunIcon },
      { name: 'Calendario', href: '/admin/empleados/calendario', icon: CalendarDaysIcon },
      { name: 'Importar Nóminas', href: '/admin/empleados/nominas', icon: CloudArrowUpIcon },
    ],
  },
  { name: 'Proyectos', href: '/admin/proyectos', icon: FolderIcon, section: 'proyectos' },
  { name: 'Portal Empleado', href: '/empleado', icon: UserIcon, section: 'portal-empleado' },
  { name: 'Historial', href: '/admin/historial', icon: DocumentTextIcon, section: 'historial' },
  { name: 'Configuración', href: '/admin/configuracion', icon: CogIcon, section: 'configuracion' },
]

function SidebarContent({ user, onNavigate }: AdminSidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const { hasAccess, effectiveRole, isViewingAs } = useRole()

  // Auto-abrir el grupo si la ruta actual está dentro
  useEffect(() => {
    navigation.forEach((entry) => {
      if (isGroup(entry)) {
        const isChildActive = entry.children.some(
          (child) => pathname === child.href || pathname.startsWith(child.href + '/')
        )
        if (isChildActive && !openGroups.includes(entry.name)) {
          setOpenGroups((prev) => [...prev, entry.name])
        }
      }
    })
  }, [pathname])

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) =>
      prev.includes(name) ? prev.filter((g) => g !== name) : [...prev, name]
    )
  }

  const canAccess = (item: NavItem | NavGroup) => {
    const section = item.section || 'dashboard'
    return hasAccess(section)
  }

  const renderNavItem = (item: NavItem, isChild = false) => {
    // Verificar permisos del item hijo
    if (item.section && !hasAccess(item.section)) return null

    const isActive = pathname === item.href || 
      (item.href !== '/admin' && pathname.startsWith(item.href + '/')) ||
      (item.href === '/admin' && pathname === '/admin')
    
    return (
      <li key={item.name}>
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`
            group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6
            ${isChild ? 'pl-10' : ''}
            ${isActive
              ? 'bg-orange-50 text-orange-600'
              : 'text-gray-700 hover:text-orange-600 hover:bg-gray-50'
            }
          `}
        >
          <item.icon
            className={`h-6 w-6 shrink-0 ${isActive ? 'text-orange-600' : 'text-gray-400 group-hover:text-orange-600'}`}
            aria-hidden="true"
          />
          {item.name}
        </Link>
      </li>
    )
  }

  const renderNavGroup = (group: NavGroup) => {
    const isOpen = openGroups.includes(group.name)
    const isChildActive = group.children.some(
      (child) => pathname === child.href || pathname.startsWith(child.href + '/')
    )

    return (
      <li key={group.name}>
        <button
          onClick={() => toggleGroup(group.name)}
          className={`
            w-full group flex items-center gap-x-3 rounded-md p-2 text-sm font-semibold leading-6
            ${isChildActive
              ? 'text-orange-600'
              : 'text-gray-700 hover:text-orange-600 hover:bg-gray-50'
            }
          `}
        >
          <group.icon
            className={`h-6 w-6 shrink-0 ${isChildActive ? 'text-orange-600' : 'text-gray-400 group-hover:text-orange-600'}`}
            aria-hidden="true"
          />
          {group.name}
          <ChevronDownIcon
            className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isChildActive ? 'text-orange-600' : 'text-gray-400'}`}
            aria-hidden="true"
          />
        </button>
        {isOpen && (
          <ul className="mt-1 space-y-1">
            {group.children.map((child) => renderNavItem(child, true))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center">
        <Link href="/admin" className="flex items-center" onClick={onNavigate}>
          <span className="text-2xl font-bold">
            <span className="text-black">internet</span>
            <span className="text-orange-500">operadores</span>
          </span>
        </Link>
      </div>

      {/* Indicador de modo "Ver como" */}
      {isViewingAs && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 font-medium">
          👁 Viendo como: <span className="font-bold">{effectiveRole.replace('_', ' ')}</span>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((entry) => {
                if (isGroup(entry)) {
                  if (!canAccess(entry)) return null
                  return renderNavGroup(entry)
                }
                if (!canAccess(entry)) return null
                return renderNavItem(entry)
              })}
            </ul>
          </li>

          {/* User info */}
          <li className="mt-auto">
            <div className="flex items-center gap-x-4 px-2 py-3 text-sm font-semibold leading-6 text-gray-900 border-t border-gray-200">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </li>
        </ul>
      </nav>
    </div>
  )
}

export default function AdminSidebar({ user }: AdminSidebarProps) {
  const { isOpen, setIsOpen } = useSidebar()
  const pathname = usePathname()

  // Cerrar sidebar al cambiar de ruta
  useEffect(() => {
    setIsOpen(false)
  }, [pathname, setIsOpen])

  // Bloquear scroll del body cuando el sidebar está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <>
      {/* Sidebar para desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col border-r border-gray-200">
          <SidebarContent user={user} />
        </div>
      </div>

      {/* Sidebar móvil - overlay */}
      {isOpen && (
        <div className="relative z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-gray-900/80 transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar panel */}
          <div className="fixed inset-0 flex">
            <div className="relative mr-16 flex w-full max-w-xs flex-1">
              {/* Close button */}
              <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                <button
                  type="button"
                  className="-m-2.5 p-2.5"
                  onClick={() => setIsOpen(false)}
                >
                  <span className="sr-only">Cerrar menú</span>
                  <XMarkIcon className="h-6 w-6 text-white" aria-hidden="true" />
                </button>
              </div>

              {/* Sidebar content */}
              <SidebarContent user={user} onNavigate={() => setIsOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
