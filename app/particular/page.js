import Link from 'next/link';

export default function ParticularPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header - Responsive */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        {/* Top Bar - Optimizado para móvil */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
            <div className="flex items-center justify-between h-8 sm:h-10">
              <div className="flex items-center gap-3 sm:gap-4 lg:gap-6 text-xs sm:text-sm">
                <Link href="/empresa" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                  Empresas
                </Link>
                <Link href="/particular" className="text-orange-500 font-semibold">
                  Particulares
                </Link>
              </div>
              
              <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-700">
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <a href="tel:+34655100400" className="font-medium hover:text-orange-500 transition-colors">
                  <span className="hidden sm:inline">+34 </span>655 100 400
                </a>
              </div>
              
              <div className="hidden sm:flex items-center gap-3 lg:gap-6 text-xs sm:text-sm">
                <Link href="/soporte" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                  Soporte
                </Link>
                <Link href="/login" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                  Área Cliente
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Navigation - Responsive */}
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-20">
              {/* Logo */}
              <Link href="/particular" className="flex items-center">
                <img 
                  src="/logo_transparent.png" 
                  alt="Internet Operadores" 
                  className="h-10 sm:h-12 lg:h-14"
                />
              </Link>

              {/* Desktop Menu */}
              <nav className="hidden md:flex items-center gap-4 lg:gap-8">
                <Link href="/internet" className="text-sm lg:text-base text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Internet
                </Link>
                <Link href="/movil" className="text-sm lg:text-base text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Móvil
                </Link>
                <Link href="/packs" className="text-sm lg:text-base text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Packs
                </Link>
                <Link href="/ofertas" className="text-sm lg:text-base text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Ofertas
                </Link>
              </nav>

              {/* CTA Button - Responsive */}
              <Link 
                href="#cobertura"
                className="px-3 py-2 sm:px-4 sm:py-2.5 lg:px-6 lg:py-3 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-all shadow-sm hover:shadow-md text-xs sm:text-sm lg:text-base"
              >
                <span className="hidden sm:inline">Comprobar </span>Cobertura
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero - Responsive */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-white py-10 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10 lg:gap-12 items-center">
            <div className="order-2 md:order-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
                Fibra + Móvil<br/>
                <span className="text-orange-500">Sin complicaciones</span>
              </h1>
              <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8">
                Conectividad de alta velocidad para tu hogar. Tarifas claras, sin permanencia y con la mejor atención al cliente.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <Link 
                  href="#tarifas"
                  className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors text-base sm:text-lg text-center"
                >
                  Ver Tarifas
                </Link>
                <Link 
                  href="tel:+34655100400"
                  className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors text-base sm:text-lg text-center"
                >
                  Llamar Ahora
                </Link>
              </div>
            </div>
            <div className="bg-orange-100 rounded-2xl sm:rounded-3xl p-8 sm:p-10 lg:p-12 flex items-center justify-center order-1 md:order-2">
              <svg className="w-40 h-40 sm:w-48 sm:h-48 lg:w-64 lg:h-64 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Tarifas - Responsive */}
      <section id="tarifas" className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Nuestras Tarifas
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600">
              Elige el paquete que mejor se adapte a tus necesidades
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            {/* Tarifa Básica */}
            <div className="bg-white border-2 border-gray-200 rounded-xl sm:rounded-2xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Básica</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Para uso ligero</p>
              <div className="mb-4 sm:mb-6">
                <span className="text-4xl sm:text-5xl font-bold text-gray-900">29€</span>
                <span className="text-sm sm:text-base text-gray-600">/mes</span>
              </div>
              <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                <li className="flex items-center text-sm sm:text-base text-gray-700">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Fibra 300 Mbps
                </li>
                <li className="flex items-center text-sm sm:text-base text-gray-700">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Llamadas ilimitadas
                </li>
                <li className="flex items-center text-sm sm:text-base text-gray-700">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Sin permanencia
                </li>
              </ul>
              <Link 
                href="#contratar"
                className="block w-full py-2.5 sm:py-3 text-center border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors text-sm sm:text-base"
              >
                Contratar
              </Link>
            </div>

            {/* Tarifa Estándar - Popular */}
            <div className="bg-orange-500 text-white rounded-xl sm:rounded-2xl p-6 sm:p-8 shadow-xl relative md:scale-105">
              <div className="absolute top-3 sm:top-4 right-3 sm:right-4 bg-white text-orange-500 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold">
                Popular
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-2">Estándar</h3>
              <p className="text-sm sm:text-base text-orange-100 mb-4 sm:mb-6">El más elegido</p>
              <div className="mb-4 sm:mb-6">
                <span className="text-4xl sm:text-5xl font-bold">39€</span>
                <span className="text-sm sm:text-base text-orange-100">/mes</span>
              </div>
              <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                <li className="flex items-center text-sm sm:text-base">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Fibra 600 Mbps
                </li>
                <li className="flex items-center text-sm sm:text-base">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Llamadas ilimitadas
                </li>
                <li className="flex items-center text-sm sm:text-base">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  1 línea móvil 20GB
                </li>
                <li className="flex items-center text-sm sm:text-base">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Sin permanencia
                </li>
              </ul>
              <Link 
                href="#contratar"
                className="block w-full py-2.5 sm:py-3 text-center bg-white text-orange-500 rounded-lg font-semibold hover:bg-orange-50 transition-colors text-sm sm:text-base"
              >
                Contratar
              </Link>
            </div>

            {/* Tarifa Premium */}
            <div className="bg-white border-2 border-gray-200 rounded-xl sm:rounded-2xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Premium</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Máxima velocidad</p>
              <div className="mb-4 sm:mb-6">
                <span className="text-4xl sm:text-5xl font-bold text-gray-900">49€</span>
                <span className="text-sm sm:text-base text-gray-600">/mes</span>
              </div>
              <ul className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                <li className="flex items-center text-sm sm:text-base text-gray-700">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Fibra 1 Gbps
                </li>
                <li className="flex items-center text-sm sm:text-base text-gray-700">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Llamadas ilimitadas
                </li>
                <li className="flex items-center text-sm sm:text-base text-gray-700">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  2 líneas móvil 50GB
                </li>
                <li className="flex items-center text-sm sm:text-base text-gray-700">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Sin permanencia
                </li>
              </ul>
              <Link 
                href="#contratar"
                className="block w-full py-2.5 sm:py-3 text-center border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors text-sm sm:text-base"
              >
                Contratar
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer - Responsive */}
      <footer className="bg-gray-900 text-white py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
            <div>
              <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4">Particulares</h3>
              <ul className="space-y-2 text-sm sm:text-base text-gray-400">
                <li><Link href="#tarifas" className="hover:text-white transition-colors">Tarifas</Link></li>
                <li><Link href="#cobertura" className="hover:text-white transition-colors">Cobertura</Link></li>
                <li><Link href="#ayuda" className="hover:text-white transition-colors">Ayuda</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4">Empresa</h3>
              <ul className="space-y-2 text-sm sm:text-base text-gray-400">
                <li><Link href="/selector" className="hover:text-white transition-colors">Soluciones empresariales</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4">Ayuda</h3>
              <ul className="space-y-2 text-sm sm:text-base text-gray-400">
                <li><Link href="#" className="hover:text-white transition-colors">Centro de ayuda</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4">Legal</h3>
              <ul className="space-y-2 text-sm sm:text-base text-gray-400">
                <li><Link href="/politica-privacidad" className="hover:text-white transition-colors">Privacidad</Link></li>
                <li><Link href="/politica-cookies" className="hover:text-white transition-colors">Cookies</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 sm:pt-8 text-center text-xs sm:text-sm text-gray-400">
            <p>© 2026 Internet Operadores. Más de 25 años conectando España.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
