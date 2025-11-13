'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Top Header */}
      <header className="bg-gray-900 text-white py-3 text-sm">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 md:gap-0">
            <div className="flex flex-wrap gap-3 md:gap-6 text-white font-semibold items-center">
              <Link href="/" className="hover:text-orange-500">INICIO</Link>
              <a href="mailto:david.perez@internetoperadores.com" className="hover:text-orange-500 hidden md:inline">
                david.perez@internetoperadores.com
              </a>
              <span className="hidden lg:inline text-sm">Paseo De La Habana 26 1-1. 28036, Madrid. España</span>
            </div>
            <a 
              href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Internet%20Operadores" 
              className="bg-green-500 px-4 py-2 rounded hover:bg-green-600 font-semibold text-center"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b py-4 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <div>
              <Link href="/">
                <img src="/logo_transparent.png" alt="Internet Operadores" className="h-8 md:h-10 cursor-pointer" />
              </Link>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex gap-6 text-gray-900 font-semibold items-center">
              <Link href="/" className="hover:text-orange-500">INICIO</Link>
              <Link href="/empresa" className="hover:text-orange-500">EMPRESA</Link>
              <Link href="/fansaticos" className="hover:text-orange-500">FANSÁTICOS</Link>
              <Link href="/cero-riesgos" className="hover:text-orange-500">CERO RIESGOS</Link>
              <Link href="/exagrid" className="hover:text-orange-500">EXAGRID</Link>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500">SABER DIARIO</a>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">Protección</a>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden text-gray-900 focus:outline-none"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 flex flex-col gap-3">
              <Link href="/" className="text-gray-900 hover:text-orange-500 font-semibold py-2">INICIO</Link>
              <Link href="/empresa" className="text-gray-900 hover:text-orange-500 font-semibold py-2">EMPRESA</Link>
              <Link href="/fansaticos" className="text-gray-900 hover:text-orange-500 font-semibold py-2">FANSÁTICOS</Link>
              <Link href="/cero-riesgos" className="text-gray-900 hover:text-orange-500 font-semibold py-2">CERO RIESGOS</Link>
              <Link href="/exagrid" className="text-gray-900 hover:text-orange-500 font-semibold py-2">EXAGRID</Link>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-orange-500 font-semibold py-2">SABER DIARIO</a>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="bg-orange-500 text-white px-4 py-3 rounded hover:bg-orange-600 font-semibold text-center">Protección</a>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

