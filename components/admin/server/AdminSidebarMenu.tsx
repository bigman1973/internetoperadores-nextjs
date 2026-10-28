import { AdminSidebarChevron, AdminSidebarIcon } from '../presentation/AdminSidebarIcon'
import {
  isSidebarNavigationGroup,
  type FinanceEnvironment,
  type SidebarNavigationEntry,
  type SidebarNavigationGroup,
  type SidebarNavigationItem,
} from '../sidebar-navigation'

export interface AdminSidebarUser {
  name: string
  email: string
  role?: string
  roles?: string[]
}

interface AdminSidebarMenuProps {
  navigation: SidebarNavigationEntry[]
  user: AdminSidebarUser
  easyOnly?: boolean
  financeEnvironment?: FinanceEnvironment
}

function NavItem({ item, isChild = false, depth = 0 }: { item: SidebarNavigationItem; isChild?: boolean; depth?: number }) {
  return (
    <li>
      {/* En SSR se usa un ancla normal: no hay prefetch ni JS de navegación inicial. */}
      <a
        href={item.href}
        className={`group flex min-h-11 items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-semibold leading-6 text-gray-700 hover:bg-gray-50 hover:text-orange-600 ${depth > 0 ? 'pl-8 text-xs' : isChild ? 'pl-10' : ''}`}
      >
        <AdminSidebarIcon name={item.icon} className={`${depth > 0 ? 'h-5 w-5' : 'h-6 w-6'} shrink-0 text-gray-400 group-hover:text-orange-600`} />
        {item.name}
      </a>
      {item.subitems && item.subitems.length > 0 && (
        <ul className="ml-5 mt-1 space-y-1 border-l border-slate-200" aria-label={`Subapartados de ${item.name}`}>
          {item.subitems.map(child => <NavItem key={child.name} item={child} isChild depth={depth + 1} />)}
        </ul>
      )}
    </li>
  )
}

function NavGroup({ group }: { group: SidebarNavigationGroup }) {
  return (
    <li>
      {/* details conserva la expansión en escritorio sin cargar el controlador cliente. */}
      <details className="group" data-admin-sidebar-group={group.name}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-semibold leading-6 text-gray-700 hover:bg-gray-50 hover:text-orange-600 [&::-webkit-details-marker]:hidden">
          <AdminSidebarIcon name={group.icon} className="h-6 w-6 shrink-0 text-gray-400 group-hover:text-orange-600" />
          {group.name}
          <AdminSidebarChevron className="ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180 group-hover:text-orange-600" />
        </summary>
        <ul className="mt-1 space-y-1">
          {group.children.map(child => <NavItem key={child.name} item={child} isChild />)}
        </ul>
      </details>
    </li>
  )
}

export default function AdminSidebarMenu({
  navigation,
  user,
  easyOnly = false,
  financeEnvironment = null,
}: AdminSidebarMenuProps) {
  const easyHome = financeEnvironment === 'staging' ? '/admin/finanzas/conciliar' : '/admin/finanzas/modo-facil'

  return (
    <div data-admin-sidebar-ssr className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4">
      <div className="flex h-16 shrink-0 items-center">
        <a href={easyOnly ? easyHome : '/admin'} className="flex items-center">
          <span className="text-2xl font-bold">
            <span className="text-black">internet</span>
            <span className="text-orange-500">operadores</span>
          </span>
        </a>
      </div>

      <nav className="flex flex-1 flex-col" aria-label="Navegación administrativa">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map(entry => (
                isSidebarNavigationGroup(entry)
                  ? <NavGroup key={entry.name} group={entry} />
                  : <NavItem key={entry.name} item={entry} />
              ))}
            </ul>
          </li>

          <li className="mt-auto">
            <div className="flex items-center gap-x-4 border-t border-gray-200 px-2 py-3 text-sm font-semibold leading-6 text-gray-900">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="truncate text-xs text-gray-500">{user.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </li>
        </ul>
      </nav>
    </div>
  )
}
