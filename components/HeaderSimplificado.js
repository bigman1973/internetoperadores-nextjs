'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

export default function HeaderSimplificado() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solucionesOpen, setSolucionesOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setSolucionesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="bg-white border-b shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <img 
              src="/logo_transparent.png" 
              alt="Internet Operadores" 
              className="h-12 md:h-14 w-auto"
            />
          </Link>
          
          {/* Desktop Menu */}
          <div className="hidden lg:flex gap-8 text-gray-900 font-semibold items-center text-base">
            <Link href="/" className="hover:text-orange-500 transition-colors">
              INICIO
            </Link>
            
            {/* Dropdown SOLUCIONES */}
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setSolucionesOpen(!solucionesOpen)}
                className="hover:text-orange-500 transition-colors flex items-center gap-1 text-orange-500"
              >
                SOLUCIONES
                <svg 
                  className={`w-4 h-4 transition-transform ${solucionesOpen ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {solucionesOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white border shadow-lg rounded-lg py-2 z-50">
                  <Link 
                    href="/cero-riesgos" 
                    className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => setSolucionesOpen(false)}
                  >
                    <div className="font-semibold text-gray-900 hover:text-orange-500">Informe Cero Riesgos</div>
                    <div className="text-xs text-gray-500 mt-1">Auditoría completa de seguridad</div>
                  </Link>
                  
                  <Link 
                    href="/exagrid" 
                    className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                    onClick={() => setSolucionesOpen(false)}
                  >
                    <div className="font-semibold text-gray-900 hover:text-orange-500">Exagrid</div>
                    <div className="text-xs text-gray-500 mt-1">Backup empresarial avanzado</div>
                  </Link>
                  
                  <div className="border-t my-2"></div>
                  
                  <div className="px-4 py-2">
                    <div className="text-sm font-semibold text-gray-700 mb-2">Otros Servicios:</div>
                    <div className="space-y-1.5 text-sm text-gray-600">
                      <div className="hover:text-orange-500 cursor-pointer">• Conectividad</div>
                      <div className="hover:text-orange-500 cursor-pointer">• Backup Gestionado 360</div>
                      <div className="hover:text-orange-500 cursor-pointer">• Infraestructura Física</div>
                      <div className="hover:text-orange-500 cursor-pointer">• WiFi360</div>
                      <div className="hover:text-orange-500 cursor-pointer">• CobroCripto</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <Link href="/empresa" className="hover:text-orange-500 transition-colors">
              EMPRESA
            </Link>
          </div>

          {/* Contact Info & CTA */}
          <div className="hidden lg:flex items-center gap-4">
            <a 
              href="tel:+34655100400" 
              className="text-gray-700 hover:text-orange-500 flex items-center gap-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="font-semibold">655 100 400</span>
            </a>
            
            <a 
              href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Internet%20Operadores" 
              className="bg-green-500 px-5 py-2.5 rounded-lg hover:bg-green-600 font-semibold text-white transition-all flex items-center gap-2 shadow-sm hover:shadow-md"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
            
            <a 
              href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U"
              className="bg-orange-500 text-white px-6 py-2.5 rounded-lg hover:bg-orange-600 font-semibold transition-all shadow-sm hover:shadow-md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Solicitar Informe
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="lg:hidden text-gray-900 focus:outline-none p-2"
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
          <div className="lg:hidden pb-4 border-t mt-2">
            <div className="flex flex-col gap-2 mt-4">
              <Link 
                href="/" 
                className="text-gray-900 hover:text-orange-500 hover:bg-gray-50 font-semibold py-3 px-4 rounded transition-colors" 
                onClick={() => setMobileMenuOpen(false)}
              >
                INICIO
              </Link>
              
              <div className="px-4 py-2">
                <div className="font-semibold text-orange-500 mb-2">SOLUCIONES</div>
                <div className="flex flex-col gap-2 ml-4">
                  <Link 
                    href="/cero-riesgos" 
                    className="text-gray-900 hover:text-orange-500 hover:bg-gray-50 py-2 px-3 rounded transition-colors" 
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Informe Cero Riesgos
                  </Link>
                  <Link 
                    href="/exagrid" 
                    className="text-gray-900 hover:text-orange-500 hover:bg-gray-50 py-2 px-3 rounded transition-colors" 
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Exagrid
                  </Link>
                </div>
              </div>
              
              <Link 
                href="/empresa" 
                className="text-gray-900 hover:text-orange-500 hover:bg-gray-50 font-semibold py-3 px-4 rounded transition-colors" 
                onClick={() => setMobileMenuOpen(false)}
              >
                EMPRESA
              </Link>
              
              <div className="border-t my-2"></div>
              
              <a 
                href="tel:+34655100400" 
                className="text-gray-700 hover:text-orange-500 font-semibold py-3 px-4 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                655 100 400
              </a>
              
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Internet%20Operadores" 
                className="bg-green-500 text-white px-4 py-3 rounded-lg hover:bg-green-600 font-semibold text-center transition-colors mx-4 flex items-center justify-center gap-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
              
              <a 
                href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U"
                className="bg-orange-500 text-white px-4 py-3 rounded-lg hover:bg-orange-600 font-semibold text-center transition-colors mx-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                Solicitar Informe
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

