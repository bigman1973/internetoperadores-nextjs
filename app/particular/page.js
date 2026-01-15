import Link from 'next/link';

export default function ParticularPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        {/* Top Bar */}
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-10">
              <div className="flex items-center gap-6 text-sm">
                <Link href="/empresa" className="text-gray-600 hover:text-orange-500 font-medium transition-colors">
                  Empresas
                </Link>
                <Link href="/particular" className="text-orange-500 font-semibold">
                  Particulares
                </Link>
              </div>
              
              <div className="flex items-center gap-1 text-sm text-gray-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <a href="tel:+34655100400" className="font-medium hover:text-orange-500 transition-colors">
                  +34 655 100 400
                </a>
              </div>
              
              <div className="flex items-center gap-6 text-sm">
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

        {/* Main Navigation */}
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              {/* Logo */}
              <Link href="/particular" className="flex items-center">
                <img 
                  src="/logo_transparent.png" 
                  alt="Internet Operadores" 
                  className="h-14"
                />
              </Link>

              {/* Desktop Menu */}
              <nav className="hidden md:flex items-center gap-8">
                <Link href="/internet" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Internet
                </Link>
                <Link href="/movil" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Móvil
                </Link>
                <Link href="/packs" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Packs
                </Link>
                <Link href="/ofertas" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                  Ofertas
                </Link>
              </nav>

              {/* CTA Button */}
              <Link 
                href="#cobertura"
                className="px-6 py-3 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-all shadow-sm hover:shadow-md"
              >
                Comprobar Cobertura
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl font-bold text-gray-900 mb-6">
                Fibra + Móvil<br/>
                <span className="text-orange-500">Sin complicaciones</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Conectividad de alta velocidad para tu hogar. Tarifas claras, sin permanencia y con la mejor atención al cliente.
              </p>
              <div className="flex items-center gap-4">
                <Link 
                  href="#tarifas"
                  className="px-8 py-4 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors text-lg"
                >
                  Ver Tarifas
                </Link>
                <Link 
                  href="tel:+34655100400"
                  className="px-8 py-4 border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors text-lg"
                >
                  Llamar Ahora
                </Link>
              </div>
            </div>
            <div className="bg-orange-100 rounded-3xl p-12 flex items-center justify-center">
              <svg className="w-64 h-64 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Tarifas */}
      <section id="tarifas" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Nuestras Tarifas
            </h2>
            <p className="text-xl text-gray-600">
              Elige el paquete que mejor se adapte a tus necesidades
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Tarifa Básica */}
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Básica</h3>
              <p className="text-gray-600 mb-6">Para uso ligero</p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-gray-900">29€</span>
                <span className="text-gray-600">/mes</span>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Fibra 300 Mbps
                </li>
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Llamadas ilimitadas
                </li>
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Sin permanencia
                </li>
              </ul>
              <Link 
                href="#contratar"
                className="block w-full py-3 text-center border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors"
              >
                Contratar
              </Link>
            </div>

            {/* Tarifa Estándar */}
            <div className="bg-orange-500 text-white rounded-2xl p-8 shadow-xl relative">
              <div className="absolute top-4 right-4 bg-white text-orange-500 px-4 py-1 rounded-full text-sm font-semibold">
                Popular
              </div>
              <h3 className="text-2xl font-bold mb-2">Estándar</h3>
              <p className="text-orange-100 mb-6">El más elegido</p>
              <div className="mb-6">
                <span className="text-5xl font-bold">39€</span>
                <span className="text-orange-100">/mes</span>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-white mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Fibra 600 Mbps
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-white mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Llamadas ilimitadas
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-white mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  1 línea móvil 20GB
                </li>
                <li className="flex items-center">
                  <svg className="w-5 h-5 text-white mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Sin permanencia
                </li>
              </ul>
              <Link 
                href="#contratar"
                className="block w-full py-3 text-center bg-white text-orange-500 rounded-lg font-semibold hover:bg-orange-50 transition-colors"
              >
                Contratar
              </Link>
            </div>

            {/* Tarifa Premium */}
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Premium</h3>
              <p className="text-gray-600 mb-6">Máxima velocidad</p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-gray-900">49€</span>
                <span className="text-gray-600">/mes</span>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Fibra 1 Gbps
                </li>
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Llamadas ilimitadas
                </li>
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  2 líneas móvil 50GB
                </li>
                <li className="flex items-center text-gray-700">
                  <svg className="w-5 h-5 text-orange-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Sin permanencia
                </li>
              </ul>
              <Link 
                href="#contratar"
                className="block w-full py-3 text-center border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors"
              >
                Contratar
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-lg mb-4">Particulares</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="#tarifas" className="hover:text-white">Tarifas</Link></li>
                <li><Link href="#cobertura" className="hover:text-white">Cobertura</Link></li>
                <li><Link href="#ayuda" className="hover:text-white">Ayuda</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Empresa</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/selector" className="hover:text-white">Soluciones empresariales</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Ayuda</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="#" className="hover:text-white">Centro de ayuda</Link></li>
                <li><Link href="#" className="hover:text-white">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg mb-4">Legal</h3>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/politica-privacidad" className="hover:text-white">Privacidad</Link></li>
                <li><Link href="/politica-cookies" className="hover:text-white">Cookies</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>© 2026 Internet Operadores. Más de 25 años conectando España.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
