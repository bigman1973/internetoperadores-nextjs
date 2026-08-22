'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSegment } from './SegmentProvider'

export default function TopBar() {
  const { segment, setSegment } = useSegment()
  const router = useRouter()

  const handleSwitch = (target: 'empresa' | 'particular') => {
    setSegment(target)
    router.push(target === 'empresa' ? '/empresa' : '/particular')
  }

  const segmentClass = (target: 'empresa' | 'particular') =>
    `min-h-9 rounded-full px-3 text-xs font-semibold transition-colors sm:text-sm ${
      segment === target
        ? 'bg-white text-orange-600 shadow-sm ring-1 ring-black/5'
        : 'text-gray-500 hover:text-gray-800'
    }`

  const utilityLinkClass =
    'inline-flex min-h-10 items-center justify-center rounded-full px-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:min-h-9 sm:text-sm'

  return (
    <div className="border-b border-gray-100 bg-white text-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-6 lg:px-8">
        <div className="flex w-full items-center justify-between sm:w-auto sm:justify-start">
          <div className="flex items-center rounded-full bg-gray-100 p-1" aria-label="Seleccionar tipo de cliente">
            <button type="button" onClick={() => handleSwitch('empresa')} className={segmentClass('empresa')}>
              Empresas
            </button>
            <button type="button" onClick={() => handleSwitch('particular')} className={segmentClass('particular')}>
              Particulares
            </button>
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-orange-50 px-3 text-xs font-semibold text-orange-700 sm:hidden"
          >
            Área cliente
          </Link>
        </div>

        <a
          href="tel:900730034"
          className="hidden min-h-9 items-center gap-1.5 text-gray-700 transition-colors hover:text-orange-600 md:flex"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="font-medium">900 730 034</span>
        </a>

        <nav className="flex w-full items-center justify-between gap-1 sm:ml-auto sm:w-auto sm:justify-end" aria-label="Navegación auxiliar">
          <Link href="/contacto" className={utilityLinkClass}>Contacto</Link>
          <Link href="/soporte" className={utilityLinkClass}>Soporte</Link>
          <a href="tel:900730034" className={`${utilityLinkClass} md:hidden`} aria-label="Llamar al 900 730 034">
            900 730 034
          </a>
          <Link href="/login" className={`${utilityLinkClass} hidden sm:inline-flex`}>
            Área Cliente
          </Link>
        </nav>
      </div>
    </div>
  )
}
