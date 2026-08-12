'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BanknotesIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline'

const tabs = [
  { name: 'Finanzas', href: '/admin/clientes/ggcc/exagrid/finanzas', icon: BanknotesIcon },
]

export default function ExagridLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100">
          <BuildingOffice2Icon className="w-7 h-7 text-emerald-700" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">GGCC</span>
            <span className="text-xs text-gray-300">/</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Exagrid</h1>
        </div>
      </div>

      {/* Tabs de navegacion */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || pathname?.startsWith(tab.href + '/')
            const Icon = tab.icon
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Contenido */}
      {children}
    </div>
  )
}
