'use client'
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useCart } from './CartProvider';
import TopBar from './TopBar';

const soluciones = [
  { nombre: 'Comunicaciones Unificadas', href: '/soluciones/comunicaciones-unificadas', descripcion: 'UCaaS - Wildix & Zoom' },
  { nombre: 'Conectividad Avanzada', href: '/soluciones/conectividad-avanzada', descripcion: 'Respaldo, MPLS, Internacional' },
  { nombre: 'Soluciones Móviles', href: '/soluciones/moviles', descripcion: 'Tarifas empresariales' },
  { nombre: 'Infraestructura de Red', href: '/soluciones/infraestructura-red', descripcion: 'WiFi y redes - Ruckus' },
  { nombre: 'Mantenimiento IT', href: '/soluciones/mantenimiento-it', descripcion: 'Soporte y prevención' },
  { nombre: 'Migración Web', href: '/soluciones/migracion-web', descripcion: 'De WordPress a Next.js' },
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

const recursos = [
  { nombre: 'Blog', href: '/recursos/blog', descripcion: 'Artículos y novedades' },
  { nombre: 'Casos de Éxito', href: '/recursos/casos-exito', descripcion: 'Historias de clientes' },
  { nombre: 'Guías y Whitepapers', href: '/recursos/guias', descripcion: 'Documentos descargables' },
  { nombre: 'Webinars y Demos', href: '/recursos/webinars', descripcion: 'Vídeos y seminarios' },
  { nombre: 'FAQ y Tutoriales', href: '/recursos/faq', descripcion: 'Preguntas frecuentes' },
  { nombre: 'Herramientas', href: '/recursos/herramientas', descripcion: 'Calculadoras y tests' },
];

export default function EmpresaNav({ currentPage = '' }) {
  const { itemCount } = useCart();
  const [contrataOpen, setContrataOpen] = useState(false);
  const [solucionesOpen, setSolucionesOpen] = useState(false);
  const [sectoresOpen, setSectoresOpen] = useState(false);
  const [recursosOpen, setRecursosOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [seccionesActivas, setSeccionesActivas] = useState([]);

  useEffect(() => {
    fetch('/api/secciones-activas')
      .then(res => res.json())
      .then(data => setSeccionesActivas(data.secciones || []))
      .catch(() => {});
  }, []);

  return (
    <>
      <TopBar />

      {/* Main Navigation */}
      <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center h-[60px] sm:h-[70px]">
            <Link href="/empresa" className="flex items-center">
              <img 
                src="/logo_transparent.png" 
                alt="Internet Operadores" 
                className="h-12 sm:h-14 lg:h-16"
              />
            </Link>
            
            {/* Desktop Menu */}
            <div className="hidden lg:flex gap-6 xl:gap-8 text-sm xl:text-base font-medium">
              {/* Contrata Dropdown (dinámico) */}
              <div 
                className="relative"
                onMouseEnter={() => setContrataOpen(true)}
                onMouseLeave={() => setContrataOpen(false)}
              >
                <Link 
                  href="/productos" 
                  className={`transition-colors flex items-center gap-1 ${currentPage === 'productos' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}
                >
                  Contrata
                  <svg className={`w-4 h-4 transition-transform ${contrataOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                
                <div className={`absolute top-full left-0 mt-0 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-2 transition-all duration-200 ${contrataOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'}`}>
                  <div className="px-4 py-2 border-b border-gray-100">
                    <Link href="/productos" className="text-orange-600 font-semibold text-sm hover:text-orange-700">
                      Ver todos los productos →
                    </Link>
                  </div>
                  {seccionesActivas.length > 0 ? (
                    seccionesActivas.map((seccion) => (
                      <Link 
                        key={seccion.href}
                        href={seccion.href} 
                        className="block px-4 py-3 hover:bg-orange-50 transition-colors"
                      >
                        <span className="font-semibold text-gray-900 text-sm">{seccion.nombre}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{seccion.descripcion}</span>
                      </Link>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-gray-400">Cargando...</div>
                  )}
                </div>
              </div>
              
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

              {/* Recursos Dropdown */}
              <div 
                className="relative"
                onMouseEnter={() => setRecursosOpen(true)}
                onMouseLeave={() => setRecursosOpen(false)}
              >
                <Link 
                  href="/recursos" 
                  className={`transition-colors flex items-center gap-1 ${currentPage === 'recursos' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}
                >
                  Recursos
                  <svg className={`w-4 h-4 transition-transform ${recursosOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Link>
                
                {/* Dropdown Menu */}
                <div className={`absolute top-full left-0 mt-0 w-80 bg-white rounded-xl shadow-xl border border-gray-100 py-2 transition-all duration-200 ${recursosOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-2'}`}>
                  <div className="px-4 py-2 border-b border-gray-100">
                    <Link href="/recursos" className="text-orange-600 font-semibold text-sm hover:text-orange-700">
                      Ver todos los recursos →
                    </Link>
                  </div>
                  {recursos.map((recurso) => (
                    <Link 
                      key={recurso.href}
                      href={recurso.href} 
                      className="block px-4 py-3 hover:bg-orange-50 transition-colors"
                    >
                      <span className="font-semibold text-gray-900 text-sm">{recurso.nombre}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{recurso.descripcion}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Empresa */}
              <Link 
                href="/empresa" 
                className={`transition-colors ${currentPage === 'empresa' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}
              >
                Empresa
              </Link>

              {/* Partners */}
              <Link 
                href="/partners" 
                className={`transition-colors ${currentPage === 'partners' ? 'text-orange-600 font-semibold' : 'text-gray-700 hover:text-orange-600'}`}
              >
                Partners
              </Link>

            </div>

            {/* CTA Buttons */}
            <div className="hidden lg:flex gap-3 items-center">
              <Link href="/carrito" className="relative p-2 hover:scale-110 transition-transform">
                <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Carrito */}
                  <path d="M4 4h2.5l.5 2.5M9 14h10.5l4-9H7.5M9 14l-2-7.5M9 14l-2.5 2.5c-.6.6-.2 1.7.7 1.7H18" stroke="#ea580c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* Ruedas */}
                  <circle cx="10" cy="21" r="1.5" fill="#ea580c"/>
                  <circle cx="18" cy="21" r="1.5" fill="#ea580c"/>
                  {/* Rayo */}
                  <path d="M16 6l-3 4.5h3l-1 3.5 4-5h-3l1-3z" fill="#f97316" stroke="#ea580c" strokeWidth="0.5" strokeLinejoin="round"/>
                </svg>
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow-md">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </Link>
              <Link href="/demo" className="px-4 py-2 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-sm">
                Ver Demo
              </Link>
              <Link href="/contacto" className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm">
                Contactar
              </Link>
            </div>

            {/* Mobile Cart + Menu Button */}
            <div className="flex lg:hidden items-center gap-1">
              <Link href="/carrito" className="relative p-2 hover:scale-110 transition-transform">
                <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Carrito */}
                  <path d="M4 4h2.5l.5 2.5M9 14h10.5l4-9H7.5M9 14l-2-7.5M9 14l-2.5 2.5c-.6.6-.2 1.7.7 1.7H18" stroke="#ea580c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  {/* Ruedas */}
                  <circle cx="10" cy="21" r="1.5" fill="#ea580c"/>
                  <circle cx="18" cy="21" r="1.5" fill="#ea580c"/>
                  {/* Rayo */}
                  <path d="M16 6l-3 4.5h3l-1 3.5 4-5h-3l1-3z" fill="#f97316" stroke="#ea580c" strokeWidth="0.5" strokeLinejoin="round"/>
                </svg>
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold shadow-md">
                    {itemCount > 9 ? '9+' : itemCount}
                  </span>
                )}
              </Link>
            <button 
              className="p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
            <div className="lg:hidden py-4 border-t">
              <div className="flex flex-col gap-2">
                {/* Mobile Contrata */}
                <div className="py-2">
                  <Link href="/productos" className="text-orange-600 font-semibold">Contrata</Link>
                  <div className="pl-4 mt-2 space-y-2 border-l-2 border-orange-200">
                    {seccionesActivas.map((seccion) => (
                      <Link 
                        key={seccion.href}
                        href={seccion.href} 
                        className="block py-1 text-sm text-gray-600 hover:text-orange-600"
                      >
                        {seccion.nombre}
                      </Link>
                    ))}
                  </div>
                </div>
                
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

                {/* Mobile Recursos */}
                <div className="py-2">
                  <Link href="/recursos" className="text-orange-600 font-semibold">Recursos</Link>
                  <div className="pl-4 mt-2 space-y-2 border-l-2 border-orange-200">
                    {recursos.map((recurso) => (
                      <Link 
                        key={recurso.href}
                        href={recurso.href} 
                        className="block py-1 text-sm text-gray-600 hover:text-orange-600"
                      >
                        {recurso.nombre}
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Mobile Empresa & Partners */}
                <Link href="/empresa" className="py-2 text-orange-600 font-semibold">Empresa</Link>
                <Link href="/partners" className="py-2 text-orange-600 font-semibold">Partners</Link>


                {/* Mobile CTAs */}
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Link href="/demo" className="flex-1 text-center px-4 py-2 border-2 border-orange-600 text-orange-600 rounded-lg font-semibold text-sm">
                    Ver Demo
                  </Link>
                  <Link href="/contacto" className="flex-1 text-center px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold text-sm">
                    Contactar
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
