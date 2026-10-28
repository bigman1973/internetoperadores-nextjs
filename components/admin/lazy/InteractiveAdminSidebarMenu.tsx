'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRole } from '../RoleContext'
import { AdminSidebarChevron, AdminSidebarIcon } from '../presentation/AdminSidebarIcon'
import {
  filterAuthorizedSidebarNavigation,
  isSidebarNavigationGroup,
  type FinanceEnvironment,
  type SidebarNavigationGroup,
  type SidebarNavigationItem,
} from '../sidebar-navigation'
import type { AdminSidebarUser } from '../server/AdminSidebarMenu'

interface InteractiveAdminSidebarMenuProps {
  user: AdminSidebarUser
  easyOnly?: boolean
  financeEnvironment?: FinanceEnvironment
  /** Presentation seed from the server; cannot authorize routes or writes. */
  conciliarEnabled?: boolean
  onNavigate?: () => void
}

export default function InteractiveAdminSidebarMenu({
  user,
  easyOnly = false,
  financeEnvironment = null,
  conciliarEnabled = false,
  onNavigate,
}: InteractiveAdminSidebarMenuProps) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const { hasAccess, effectiveRole, isViewingAs } = useRole()
  const easyHome = conciliarEnabled ? '/admin/finanzas/conciliar' : '/admin/finanzas/modo-facil'
  const visibleNavigation = useMemo(() => (
    easyOnly
      ? []
      : filterAuthorizedSidebarNavigation(financeEnvironment, hasAccess, conciliarEnabled)
  ), [easyOnly, financeEnvironment, conciliarEnabled, hasAccess])

  // Auto-abrir el grupo si la ruta actual está dentro.
  useEffect(() => {
    visibleNavigation.forEach(entry => {
      if (!isSidebarNavigationGroup(entry)) return
      const isChildActive = entry.children.some(
        child => pathname === child.href || pathname.startsWith(child.href + '/'),
      )
      if (isChildActive && !openGroups.includes(entry.name)) {
        setOpenGroups(prev => [...prev, entry.name])
      }
    })
  }, [pathname, visibleNavigation, openGroups])

  const toggleGroup = (name: string) => {
    setOpenGroups(prev => (
      prev.includes(name) ? prev.filter(group => group !== name) : [...prev, name]
    ))
  }

  const renderNavItem = (item: SidebarNavigationItem, isChild = false, depth = 0): React.ReactNode => {
    const isActive = pathname === item.href ||
      (!item.exact && item.href !== '/admin' && pathname.startsWith(item.href + '/')) ||
      (item.href === '/admin' && pathname === '/admin')

    return (
      <li key={item.name}>
        <Link
          href={item.href}
          prefetch={false}
          onClick={onNavigate}
          className={`group flex min-h-11 items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-semibold leading-6 ${depth > 0 ? 'pl-8 text-xs' : isChild ? 'pl-10' : ''} ${isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-700 hover:bg-gray-50 hover:text-orange-600'}`}
        >
          <AdminSidebarIcon name={item.icon} className={`${depth > 0 ? 'h-5 w-5' : 'h-6 w-6'} shrink-0 ${isActive ? 'text-orange-600' : 'text-gray-400 group-hover:text-orange-600'}`} />
          {item.name}
        </Link>
        {item.subitems && item.subitems.length > 0 && (
          <ul className="ml-5 mt-1 space-y-1 border-l border-slate-200" aria-label={`Subapartados de ${item.name}`}>
            {item.subitems.map(child => renderNavItem(child, true, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  const renderNavGroup = (group: SidebarNavigationGroup) => {
    const isOpen = openGroups.includes(group.name)
    const isChildActive = group.children.some(
      child => pathname === child.href || pathname.startsWith(child.href + '/'),
    )

    return (
      <li key={group.name}>
        <button
          type="button"
          onClick={() => toggleGroup(group.name)}
          aria-expanded={isOpen}
          className={`group flex min-h-11 w-full items-center gap-x-3 rounded-lg px-3 py-2 text-left text-sm font-semibold leading-6 ${isChildActive ? 'text-orange-600' : 'text-gray-700 hover:bg-gray-50 hover:text-orange-600'}`}
        >
          <AdminSidebarIcon name={group.icon} className={`h-6 w-6 shrink-0 ${isChildActive ? 'text-orange-600' : 'text-gray-400 group-hover:text-orange-600'}`} />
          {group.name}
          <AdminSidebarChevron className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${isChildActive ? 'text-orange-600' : 'text-gray-400'}`} />
        </button>
        {isOpen && (
          <ul className="mt-1 space-y-1">
            {group.children.map(child => renderNavItem(child, true))}
          </ul>
        )}
      </li>
    )
  }

  const easyNavigation: SidebarNavigationItem[] = [
    { name: conciliarEnabled ? 'Conciliar' : 'Modo fácil', href: easyHome, icon: 'clipboardDocumentList' },
    { name: 'Para pedir', href: '/admin/finanzas/para-pedir', icon: 'documentText' },
  ]

  return (
    <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4">
      <div className="flex h-16 shrink-0 items-center">
        <Link href={easyOnly ? easyHome : '/admin'} prefetch={false} className="flex items-center" onClick={onNavigate}>
          <span className="text-2xl font-bold">
            <span className="text-black">internet</span>
            <span className="text-orange-500">operadores</span>
          </span>
        </Link>
      </div>

      {isViewingAs && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          👁 Viendo como: <span className="font-bold">{effectiveRole.replace('_', ' ')}</span>
        </div>
      )}

      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {(easyOnly ? easyNavigation : visibleNavigation).map(entry => (
                isSidebarNavigationGroup(entry)
                  ? renderNavGroup(entry)
                  : renderNavItem(entry)
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
