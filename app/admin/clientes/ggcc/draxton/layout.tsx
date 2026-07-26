'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRole } from '@/components/admin/RoleContext'
import {
  BanknotesIcon,
  DocumentDuplicateIcon,
  RocketLaunchIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  ClockIcon,
  ChartBarSquareIcon,
  DocumentChartBarIcon,
  BuildingOffice2Icon,
  WrenchScrewdriverIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'

const tabs = [
  { name: 'Finanzas', href: '/admin/clientes/ggcc/draxton/finanzas', icon: BanknotesIcon, area: 'admin.clientes.ggcc.draxton.finanzas' },
  { name: 'Contratos', href: '/admin/clientes/ggcc/draxton/contratos', icon: DocumentDuplicateIcon, area: 'admin.clientes.ggcc.draxton.contratos' },
  { name: 'Proyectos Singulares', href: '/admin/clientes/ggcc/draxton/proyectos-singulares', icon: RocketLaunchIcon, area: 'admin.clientes.ggcc.draxton.proyectos_singulares' },
  { name: 'Proyectos Internos', href: '/admin/clientes/ggcc/draxton/proyectos', icon: WrenchScrewdriverIcon, area: 'admin.clientes.ggcc.draxton.proyectos' },
  { name: 'Personal', href: '/admin/clientes/ggcc/draxton/personal', icon: UserGroupIcon, area: 'admin.clientes.ggcc.draxton.personal' },
  { name: 'Contrato Guardias', href: '/admin/clientes/ggcc/draxton/contrato-guardias', icon: ShieldCheckIcon, area: 'admin.clientes.ggcc.draxton.contrato_guardias' },
  { name: 'Seguimiento', href: '/admin/clientes/ggcc/draxton/seguimiento', icon: ClockIcon, area: 'admin.clientes.ggcc.draxton.seguimiento' },
  { name: 'KPIs', href: '/admin/clientes/ggcc/draxton/kpis', icon: ChartBarSquareIcon, area: 'admin.clientes.ggcc.draxton.kpis' },
  { name: 'Informes', href: '/admin/clientes/ggcc/draxton/informes', icon: DocumentChartBarIcon, area: 'admin.clientes.ggcc.draxton.informes' },
  { name: 'Organigrama', href: '/admin/clientes/ggcc/draxton/organigrama', icon: UsersIcon, area: 'admin.clientes.ggcc.draxton.organigrama' },
]

export default function DraxtonLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()

  // Filtrar tabs según permisos granulares
  const visibleTabs = tabs.filter(tab => hasAreaAccess(tab.area, 'lectura'))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-100">
          <BuildingOffice2Icon className="w-7 h-7 text-indigo-700" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">GGCC</span>
            <span className="text-xs text-gray-300">/</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Draxton</h1>
        </div>
      </div>

      {/* Tabs de navegación */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Tabs">
          {visibleTabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`
                  flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors
                  ${isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }
                `}
              >
                <tab.icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                {tab.name}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Contenido */}
      <div>{children}</div>
    </div>
  )
}
