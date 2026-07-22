'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
} from '@heroicons/react/24/outline'

const tabs = [
  { name: 'Finanzas', href: '/admin/clientes/ggcc/draxton/finanzas', icon: BanknotesIcon },
  { name: 'Contratos', href: '/admin/clientes/ggcc/draxton/contratos', icon: DocumentDuplicateIcon },
  { name: 'Proyectos Singulares', href: '/admin/clientes/ggcc/draxton/proyectos-singulares', icon: RocketLaunchIcon },
  { name: 'Proyectos Internos', href: '/admin/clientes/ggcc/draxton/proyectos', icon: WrenchScrewdriverIcon },
  { name: 'Personal', href: '/admin/clientes/ggcc/draxton/personal', icon: UserGroupIcon },
  { name: 'Contrato Guardias', href: '/admin/clientes/ggcc/draxton/contrato-guardias', icon: ShieldCheckIcon },
  { name: 'Seguimiento', href: '/admin/clientes/ggcc/draxton/seguimiento', icon: ClockIcon },
  { name: 'KPIs', href: '/admin/clientes/ggcc/draxton/kpis', icon: ChartBarSquareIcon },
  { name: 'Informes', href: '/admin/clientes/ggcc/draxton/informes', icon: DocumentChartBarIcon },
]

export default function DraxtonLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

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
          {tabs.map((tab) => {
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
