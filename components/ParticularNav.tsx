'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useCart } from './CartProvider'
import TopBar from './TopBar'

interface ParticularNavProps {
  currentPage?: string
}

export default function ParticularNav({ currentPage = '' }: ParticularNavProps) {
  const { itemCount } = useCart()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const menuItems = [
    { nombre: 'Internet', href: '/tarifas/particular?cat=internet', key: 'internet' },
    { nombre: 'Móvil', href: '/tarifas/particular?cat=movil', key: 'movil' },
    { nombre: 'Packs', href: '/tarifas/particular?cat=packs', key: 'packs' },
    { nombre: 'Ofertas', href: '/tarifas/particular?cat=ofertas', key: 'ofertas' },
  ]

  return (
    <>
    <TopBar />
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/tarifas/particular" className="flex-shrink-0">
            <img
              src="/logo_transparent.png"
              alt="Internet Operadores"
              className="h-10 lg:h-14"
            />
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8 text-base font-medium">
            {menuItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`transition-colors ${
                  currentPage === item.key
                    ? 'text-orange-600 font-semibold'
                    : 'text-gray-700 hover:text-orange-600'
                }`}
              >
                {item.nombre}
              </Link>
            ))}
          </div>

          {/* Right side: Cart + CTA */}
          <div className="hidden md:flex items-center gap-4">
            {/* Cart icon */}
            <Link href="/carrito" className="relative p-2 text-gray-600 hover:text-orange-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>

            {/* Comprobar Cobertura */}
            <Link
              href="/recursos/herramientas/cobertura-fibra"
              className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors text-sm"
            >
              Comprobar Cobertura
            </Link>
          </div>

          {/* Mobile: Cart + Hamburger */}
          <div className="flex md:hidden items-center gap-3">
            <Link href="/carrito" className="relative p-2 text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-gray-700 focus:outline-none"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-gray-100 pt-4 space-y-3">
            {menuItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="block text-gray-700 hover:text-orange-600 font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.nombre}
              </Link>
            ))}
            <Link
              href="/recursos/herramientas/cobertura-fibra"
              className="block bg-orange-600 text-white text-center px-5 py-3 rounded-lg font-semibold mt-3"
              onClick={() => setMobileMenuOpen(false)}
            >
              Comprobar Cobertura
            </Link>
          </div>
        )}
      </div>
    </nav>
    </>
  )
}
