"use client";
import Link from 'next/link';
import { useState } from 'react';

const soluciones = [
  { nombre: 'Comunicaciones Unificadas', href: '/soluciones/comunicaciones-unificadas', descripcion: 'UCaaS - Wildix & Zoom' },
  { nombre: 'Conectividad Avanzada', href: '/soluciones/conectividad-avanzada', descripcion: 'Respaldo, MPLS, Internacional' },
  { nombre: 'Soluciones Móviles', href: '/soluciones/moviles', descripcion: 'Tarifas empresariales' },
  { nombre: 'Infraestructura de Red', href: '/soluciones/infraestructura-red', descripcion: 'WiFi y redes - Ruckus' },
  { nombre: 'Mantenimiento IT', href: '/soluciones/mantenimiento-it', descripcion: 'Soporte y prevención' },
  { nombre: 'ExaGrid', href: '/soluciones/exagrid', descripcion: 'Backup empresarial' },
];

const sectores = [
  { nombre: 'Hostelería y Turismo', href: '/sectores/hosteleria-turismo', descripcion: 'Hoteles, restaurantes, campings' },
  { nombre: 'Retail y Comercio', href: '/sectores/retail-comercio', descripcion: 'Cadenas de tiendas, franquicias' },
  { nombre: 'Industria y Logística', href: '/sectores/industria-logistica', descripcion: 'Fábricas, almacenes, transporte' },
  { nombre: 'Sanidad', href: '/sectores/sanidad', descripcion: 'Clínicas, hospitales, centros médicos' },
  { nombre: 'Educación', href: '/sectores/educacion', descripcion: 'Colegios, universidades, formación' },
  { nombre: 'Servicios Profesionales', href: '/sectores/servicios-profesionales', descripcion: 'Despachos, consultoras, asesorías' },
];

export default function EmpresaNav({ currentPage = '' }) {
  const [solucionesOpen, setSolucionesOpen] = useState(false);
  const [sectoresOpen, setSectoresOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Top Bar */}
      <div className="bg-gray-900 text-white py-2 text-xs sm:text-sm">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-2 sm:gap-4 items-center">
              <a href="https://wa.me/34655100400" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-colors flex items-center gap-1">
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
              <a href="mailto:david.perez@internetoperadores.com" className="hover:text-orange-500 transition-colors hidden md:flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                david.perez@internetoperadores.com
              </a>
            </div>
            <div className="flex gap-2 sm:gap-3 items-center text-xs sm:text-sm">
              <Link href="/soporte" className="hover:text-orange-500 transition-colors hidden sm:inline">
                Soporte
              </Link>
              <span className="text-gray-600 hidden sm:inline">|</span>
              <Link href="/login" className="hover:text-orange-500 transition-colors">
                Área Cliente
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center h-[60px] sm:h-[70px]">
            <Link href="/" className="flex items-center">
              <img 
                src="/logo_transparent.png" 
                alt="Internet Operadores" 
                className="h-12 sm:h-14 lg:h-16"
              />
            </Link>
            
            {/* Desktop Menu */}
            <div className="hidden lg:flex gap-6 xl:gap-8 text-sm xl:text-base font-medium">
              <Link href="/productos" className={`transition-colors ${currentPage === 'productos' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}>
                Productos
              </Link>
              
              {/* Soluciones Dropdown */}
              <div 
                className="relative"
                onMouseEnter={() => setSolucionesOpen(true)}
                onMouseLeave={() => setSolucionesOpen(false)}
              >
                <Link 
                  href="/soluciones" 
                  className={`transition-colors flex items-center gap-1 ${currentPage === 'soluciones' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}
                >
                  Soluciones
                  <svg className={`w-4 h-4 transition-transform ${solucionesOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                
                {/* Dropdown Menu */}
                <div className={`absolute top-full left-0 mt-0 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-2 transition-all duration-200 ${solucionesOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'}`}>
                  <div className="px-4 py-2 border-b border-gray-100">
                    <Link href="/soluciones" className="text-orange-600 font-semibold text-sm hover:text-orange-700">
                      Ver todas las soluciones →
                    </Link>
                  </div>
                  {soluciones.map((solucion) => (
                    <Link 
                      key={solucion.href}
                      href={solucion.href} 
                      className="block px-4 py-3 hover:bg-orange-50 transition-colors"
                    >
                      <span className="font-semibold text-gray-900 text-sm">{solucion.nombre}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{solucion.descripcion}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Sectores Dropdown */}
              <div 
                className="relative"
                onMouseEnter={() => setSectoresOpen(true)}
                onMouseLeave={() => setSectoresOpen(false)}
              >
                <Link 
                  href="/sectores" 
                  className={`transition-colors flex items-center gap-1 ${currentPage === 'sectores' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}
                >
                  Sectores
                  <svg className={`w-4 h-4 transition-transform ${sectoresOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                
                {/* Dropdown Menu */}
                <div className={`absolute top-full left-0 mt-0 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-2 transition-all duration-200 ${sectoresOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'}`}>
                  <div className="px-4 py-2 border-b border-gray-100">
                    <Link href="/sectores" className="text-orange-600 font-semibold text-sm hover:text-orange-700">
                      Ver todos los sectores →
                    </Link>
                  </div>
                  {sectores.map((sector) => (
                    <Link 
                      key={sector.href}
                      href={sector.href} 
                      className="block px-4 py-3 hover:bg-orange-50 transition-colors"
                    >
                      <span className="font-semibold text-gray-900 text-sm">{sector.nombre}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{sector.descripcion}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <Link href="/recursos" className={`transition-colors ${currentPage === 'recursos' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}>
                Recursos
              </Link>
              <Link href="/empresa" className={`transition-colors ${currentPage === 'empresa' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}>
                Empresa
              </Link>
              <Link href="/partners" className={`transition-colors ${currentPage === 'partners' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}>
                Partners
              </Link>
            </div>

            {/* CTA Buttons */}
            <div className="flex gap-2 sm:gap-3">
              <Link 
                href="/demo" 
                className="px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-xs sm:text-sm lg:text-base"
              >
                <span className="hidden sm:inline">Ver </span>Demo
              </Link>
              <Link 
                href="/contacto" 
                className="px-3 py-2 sm:px-4 sm:py-2.5 lg:px-5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-xs sm:text-sm lg:text-base"
              >
                Contactar
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="lg:hidden text-gray-900 focus:outline-none ml-2"
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
            <div className="lg:hidden py-4 border-t">
              <div className="flex flex-col gap-2">
                <Link href="/productos" className="py-2 text-gray-700 hover:text-orange-600 font-medium">Productos</Link>
                
                {/* Mobile Soluciones */}
                <div className="py-2">
                  <Link href="/soluciones" className="text-orange-600 font-semibold">Soluciones</Link>
                  <div className="pl-4 mt-2 space-y-2 border-l-2 border-orange-200">
                    {soluciones.map((solucion) => (
                      <Link 
                        key={solucion.href}
                        href={solucion.href} 
                        className="block py-1 text-sm text-gray-600 hover:text-orange-600"
                      >
                        {solucion.nombre}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Mobile Sectores */}
                <div className="py-2">
                  <Link href="/sectores" className="text-orange-600 font-semibold">Sectores</Link>
                  <div className="pl-4 mt-2 space-y-2 border-l-2 border-orange-200">
                    {sectores.map((sector) => (
                      <Link 
                        key={sector.href}
                        href={sector.href} 
                        className="block py-1 text-sm text-gray-600 hover:text-orange-600"
                      >
                        {sector.nombre}
                      </Link>
                    ))}
                  </div>
                </div>

                <Link href="/recursos" className="py-2 text-gray-700 hover:text-orange-600 font-medium">Recursos</Link>
                <Link href="/empresa" className="py-2 text-gray-700 hover:text-orange-600 font-medium">Empresa</Link>
                <Link href="/partners" className="py-2 text-gray-700 hover:text-orange-600 font-medium">Partners</Link>
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
