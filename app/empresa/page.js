'use client';

import Link from 'next/link';

export default function HomeNew() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header con ajustes: logo más grande, texto más grande */}
      <div className="bg-gray-900 text-white py-2 text-sm">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <a href="tel:+34655100400" className="hover:text-orange-500 transition-colors flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                +34 655 100 400
              </a>
              <a href="mailto:info@internetoperadores.com" className="hover:text-orange-500 transition-colors hidden md:flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                info@internetoperadores.com
              </a>
            </div>
            <div className="flex gap-3 items-center">
              <Link href="/soporte" className="hover:text-orange-500 transition-colors">
                Soporte
              </Link>
              <span className="text-gray-600">|</span>
              <Link href="/login" className="hover:text-orange-500 transition-colors">
                Login
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation - Logo más grande, texto más grande */}
      <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-[70px]">
            {/* Logo MÁS GRANDE */}
            <Link href="/" className="flex items-center">
              <img 
                src="/logo_transparent.png" 
                alt="Internet Operadores" 
                className="h-16"
              />
            </Link>

            {/* Desktop Menu - Texto MÁS GRANDE */}
            <div className="hidden lg:flex items-center gap-8">
              <Link 
                href="/productos" 
                className="text-gray-700 hover:text-orange-500 font-medium transition-colors text-base"
              >
                Productos
              </Link>
              <Link 
                href="/soluciones" 
                className="text-gray-700 hover:text-orange-500 font-medium transition-colors text-base"
              >
                Soluciones
              </Link>
              <Link 
                href="/sectores" 
                className="text-gray-700 hover:text-orange-500 font-medium transition-colors text-base"
              >
                Sectores
              </Link>
              <Link 
                href="/recursos" 
                className="text-gray-700 hover:text-orange-500 font-medium transition-colors text-base"
              >
                Recursos
              </Link>
              <Link 
                href="/empresa" 
                className="text-gray-700 hover:text-orange-500 font-medium transition-colors text-base"
              >
                Empresa
              </Link>
              <Link 
                href="/partners" 
                className="text-gray-700 hover:text-orange-500 font-medium transition-colors text-base"
              >
                Partners
              </Link>
            </div>

            {/* CTAs - Color NARANJA corporativo */}
            <div className="hidden lg:flex items-center gap-3">
              <Link 
                href="/demo" 
                className="px-5 py-2.5 text-base text-orange-500 border-2 border-orange-500 rounded-lg hover:bg-orange-50 font-semibold transition-all"
              >
                Ver Demo
              </Link>
              <Link 
                href="/contacto" 
                className="px-5 py-2.5 text-base bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-semibold transition-all shadow-sm hover:shadow-md"
              >
                Contactar
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="lg:hidden text-gray-700 focus:outline-none"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section - Fondo blanco con acento naranja */}
      <section className="relative overflow-hidden bg-white py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
                Comunicaciones que unifican tu negocio
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
                Plataforma completa de comunicaciones unificadas, backup empresarial y servicios IT. 
                Más de 25 años conectando empresas en España.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link 
                  href="/demo" 
                  className="px-8 py-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-semibold text-lg transition-all shadow-lg hover:shadow-xl text-center"
                >
                  Solicitar Demo Gratuita
                </Link>
                <Link 
                  href="/precios" 
                  className="px-8 py-4 text-orange-500 border-2 border-orange-500 rounded-lg hover:bg-orange-50 font-semibold text-lg transition-all text-center"
                >
                  Ver Precios
                </Link>
              </div>
              
              {/* Trust Badge */}
              <div className="mt-8 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-gray-700 font-semibold">Partners: Wildix • Zoom • Microsoft</span>
                </div>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600">+25 años de experiencia</span>
              </div>
            </div>

            {/* Right: Mockup/Illustration */}
            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                <div className="aspect-video bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-24 h-24 mx-auto text-orange-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <p className="text-gray-600 font-medium">Mockup de producto Wildix</p>
                  </div>
                </div>
              </div>
              {/* Decorative elements - naranja */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-orange-200 rounded-full blur-3xl opacity-30"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-orange-100 rounded-full blur-3xl opacity-30"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos de Clientes */}
      <section className="py-12 bg-gray-50 border-y">
        <div className="container mx-auto px-4">
          <p className="text-center text-gray-500 text-sm mb-8 uppercase tracking-wide">
            Confían en nosotros
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center opacity-60">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-center">
                <div className="w-32 h-16 bg-gray-200 rounded flex items-center justify-center">
                  <span className="text-gray-400 font-semibold">Logo {i}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Números Grandes - Fondo naranja */}
      <section className="py-20 bg-gradient-to-br from-orange-500 to-orange-600 text-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div>
              <div className="text-5xl md:text-6xl font-bold mb-2">500+</div>
              <div className="text-xl text-orange-100">Empresas confían en nosotros</div>
            </div>
            <div>
              <div className="text-5xl md:text-6xl font-bold mb-2">99.9%</div>
              <div className="text-xl text-orange-100">Uptime garantizado</div>
            </div>
            <div>
              <div className="text-5xl md:text-6xl font-bold mb-2">25+</div>
              <div className="text-xl text-orange-100">Años de experiencia</div>
            </div>
          </div>
        </div>
      </section>

      {/* Productos - Grid de 4 con iconos naranja */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Soluciones empresariales completas
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Todo lo que tu empresa necesita para comunicarse, protegerse y crecer
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Producto 1: Comunicaciones Unificadas */}
            <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-2xl transition-all group border border-gray-100">
              <div className="w-16 h-16 bg-orange-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Comunicaciones Unificadas
              </h3>
              <p className="text-gray-600 mb-4">
                Plataforma completa de comunicaciones: Wildix, Zoom o Microsoft Teams. Elegimos la mejor solución para tu empresa.
              </p>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs text-gray-500 font-semibold">Partners:</span>
                <span className="text-sm text-orange-600 font-semibold">Wildix</span>
                <span className="text-gray-300">•</span>
                <span className="text-sm text-orange-600 font-semibold">Zoom</span>
                <span className="text-gray-300">•</span>
                <span className="text-sm text-orange-600 font-semibold">Microsoft</span>
              </div>
              <p className="text-orange-500 font-semibold mb-6">Desde 19.94€/usuario</p>
              <Link 
                href="/wildix" 
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-2 group-hover:gap-3 transition-all"
              >
                Más información
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Producto 2: Mantenimiento Informático */}
            <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-2xl transition-all group border border-gray-100">
              <div className="w-16 h-16 bg-orange-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Mantenimiento Informático
              </h3>
              <p className="text-gray-600 mb-4">
                Externaliza tu departamento IT. Packs mensuales con soporte completo.
              </p>
              <p className="text-orange-500 font-semibold mb-6">Desde 99€/mes</p>
              <Link 
                href="/mantenimiento" 
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-2 group-hover:gap-3 transition-all"
              >
                Más información
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Producto 3: Fibra y Móviles */}
            <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-2xl transition-all group border border-gray-100">
              <div className="w-16 h-16 bg-orange-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Fibra y Móviles Empresas
              </h3>
              <p className="text-gray-600 mb-4">
                Integrador oficial Movistar. Todo el portfolio empresas a tu alcance.
              </p>
              <p className="text-orange-500 font-semibold mb-6">A medida</p>
              <Link 
                href="/conectividad" 
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-2 group-hover:gap-3 transition-all"
              >
                Más información
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>

            {/* Producto 4: Informe Cero Riesgos */}
            <div className="bg-white rounded-xl p-8 shadow-lg hover:shadow-2xl transition-all group border border-gray-100">
              <div className="w-16 h-16 bg-orange-100 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Informe Cero Riesgos
              </h3>
              <p className="text-gray-600 mb-4">
                Auditoría completa de ciberseguridad, backups y telecomunicaciones en 48h.
              </p>
              <p className="text-orange-500 font-semibold mb-6">790€/año</p>
              <Link 
                href="/cero-riesgos" 
                className="text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-2 group-hover:gap-3 transition-all"
              >
                Más información
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final - Fondo naranja */}
      <section className="py-20 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            ¿Listo para transformar tu empresa?
          </h2>
          <p className="text-xl mb-8 text-orange-100 max-w-2xl mx-auto">
            Solicita una demo gratuita y descubre cómo podemos ayudarte
          </p>
          <Link 
            href="/demo" 
            className="inline-block px-8 py-4 bg-white text-orange-500 rounded-lg hover:bg-gray-100 font-semibold text-lg transition-all shadow-lg hover:shadow-xl"
          >
            Solicitar Demo Gratuita
          </Link>
        </div>
      </section>

      {/* Footer Simple */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h4 className="font-bold mb-4">Productos</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/wildix" className="hover:text-orange-500">Comunicaciones Unificadas</Link></li>
                <li><Link href="/mantenimiento" className="hover:text-orange-500">Mantenimiento IT</Link></li>
                <li><Link href="/conectividad" className="hover:text-orange-500">Fibra y Móviles</Link></li>
                <li><Link href="/cero-riesgos" className="hover:text-orange-500">Informe Cero Riesgos</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Empresa</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/empresa" className="hover:text-orange-500">Sobre nosotros</Link></li>
                <li><Link href="/contacto" className="hover:text-orange-500">Contacto</Link></li>
                <li><Link href="/blog" className="hover:text-orange-500">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Soporte</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/soporte" className="hover:text-orange-500">Centro de ayuda</Link></li>
                <li><Link href="/faq" className="hover:text-orange-500">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/politica-privacidad" className="hover:text-orange-500">Privacidad</Link></li>
                <li><Link href="/politica-cookies" className="hover:text-orange-500">Cookies</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
            © 2026 Internet Operadores. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
