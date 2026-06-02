'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSegment } from './SegmentProvider'

export default function TopBar() {
  const { segment, setSegment } = useSegment()
  const router = useRouter()

  const handleSwitch = (target: 'empresa' | 'particular') => {
    setSegment(target)
    if (target === 'empresa') {
      router.push('/empresa')
    } else {
      router.push('/particular')
    }
  }

  return (
    <div className="bg-white border-b border-gray-100 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between">
        {/* Toggle Empresas / Particulares */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleSwitch('empresa')}
            className={`font-medium transition-colors ${
              segment === 'empresa'
                ? 'text-orange-600 border-b-2 border-orange-600 pb-0.5'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Empresas
          </button>
          <button
            onClick={() => handleSwitch('particular')}
            className={`font-medium transition-colors ${
              segment === 'particular'
                ? 'text-orange-600 border-b-2 border-orange-600 pb-0.5'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Particulares
          </button>
        </div>

        {/* Teléfono central */}
        <a
          href="tel:900730034"
          className="hidden sm:flex items-center gap-1.5 text-gray-700 hover:text-orange-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <span className="font-medium">900 730 034</span>
        </a>

        {/* Contacto, Soporte y Área Cliente */}
        <div className="flex items-center gap-4">
          <Link href="/contacto" className="text-gray-500 hover:text-gray-700 transition-colors">
            Contacto
          </Link>
          <Link href="/soporte" className="text-gray-500 hover:text-gray-700 transition-colors">
            Soporte
          </Link>
          <Link href="/login" className="text-gray-500 hover:text-gray-700 transition-colors">
            Área Cliente
          </Link>
        </div>
      </div>
    </div>
  )
}
