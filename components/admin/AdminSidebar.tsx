'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  HomeIcon, 
  CreditCardIcon, 
  UsersIcon, 
  ChartBarIcon,
  UserGroupIcon,
  CogIcon,
  ArrowTrendingUpIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'

interface AdminSidebarProps {
  user: {
    name: string
    email: string
    role?: string
  }
}

const navigation = [
  { name: 'Dashboard', href: '/admin', icon: HomeIcon },
  { name: 'Tarifas', href: '/admin/tarifas', icon: CreditCardIcon },
  { name: 'Clientes', href: '/admin/clientes', icon: UsersIcon },
  { name: 'Estadísticas', href: '/admin/estadisticas', icon: ChartBarIcon },
  { name: 'Usuarios Admin', href: '/admin/usuarios', icon: UserGroupIcon, roles: ['SUPER_ADMIN', 'GERENTE'] },
  { name: 'Subida de Precios', href: '/admin/subida-precios', icon: ArrowTrendingUpIcon, roles: ['SUPER_ADMIN', 'GERENTE', 'FINANCIERO'] },
  { name: 'Historial', href: '/admin/historial', icon: DocumentTextIcon },
  { name: 'Configuración', href: '/admin/configuracion', icon: CogIcon, roles: ['SUPER_ADMIN'] },
]

export default function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname()

  const canAccess = (item: typeof navigation[0]) => {
    if (!item.roles) return true
    return item.roles.includes(user.role || '')
  }

  return (
    <>
      {/* Sidebar para desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-white border-r border-gray-200 px-6 pb-4">
          {/* Logo */}
          <div className="flex h-16 shrink-0 items-center">
            <Link href="/admin" className="flex items-center">
              <span className="text-2xl font-bold">
                <span className="text-black">internet</span>
                <span className="text-orange-500">operadores</span>
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.filter(canAccess).map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={`
                            group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6
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
      </div>

      {/* Sidebar móvil - TODO: implementar con estado */}
      {/* Por ahora solo mostramos el sidebar en desktop */}
    </>
  )
}
