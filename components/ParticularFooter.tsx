"use client";
import Link from 'next/link';

export default function ParticularFooter() {
  return (
    <footer className="bg-gray-900 text-white">
      {/* CTA superior */}
      <div className="bg-orange-500">
        <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-white">¿Quieres internet donde vivas?</h3>
              <p className="text-orange-100 mt-1">Comprueba tu cobertura gratis y sin compromiso</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/recursos/herramientas/cobertura-fibra" className="bg-white text-orange-600 hover:bg-orange-50 px-6 py-3 rounded-lg font-semibold transition-all text-center">
                Comprobar cobertura
              </Link>
              <a href="tel:900730034" className="border-2 border-white text-white hover:bg-white hover:text-orange-600 px-6 py-3 rounded-lg font-semibold transition-all text-center">
                Llámanos: 900 730 034
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal del footer */}
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 lg:gap-12">
          
          {/* Columna 1: Logo y datos */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <Link href="/particular" className="text-2xl font-bold text-white hover:text-orange-400 transition-colors">
              Internet<span className="text-orange-400">Operadores</span>
            </Link>
            <p className="text-gray-400 mt-4 text-sm leading-relaxed">
              Operador de telecomunicaciones registrado en la CNMC. Internet donde vivas: fibra, 4G o 5G.
            </p>
            <div className="mt-6 space-y-2 text-sm text-gray-400">
              <p className="flex items-center gap-2">
                <span>📞</span> <a href="tel:+34900730034" className="hover:text-orange-400 transition-colors">900 730 034</a>
              </p>
              <p className="flex items-center gap-2">
                <span>✉️</span> <a href="mailto:comercial@internetoperadores.com" className="hover:text-orange-400 transition-colors">comercial@internetoperadores.com</a>
              </p>
              <p className="flex items-center gap-2">
                <span>📍</span> Paseo De La Habana 26 1-1, 28036 Madrid
              </p>
            </div>
          </div>

          {/* Columna 2: Tarifas */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Tarifas</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/tarifas/particular?cat=internet" className="text-gray-400 hover:text-orange-400 transition-colors">Internet</Link></li>
              <li><Link href="/tarifas/particular?cat=movil" className="text-gray-400 hover:text-orange-400 transition-colors">Móvil</Link></li>
              <li><Link href="/tarifas/particular?cat=packs" className="text-gray-400 hover:text-orange-400 transition-colors">Packs</Link></li>
              <li><Link href="/tarifas/particular?cat=ofertas" className="text-gray-400 hover:text-orange-400 transition-colors">Ofertas</Link></li>
            </ul>
          </div>

          {/* Columna 3: Ayuda */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Ayuda</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/recursos/herramientas/cobertura-fibra" className="text-gray-400 hover:text-orange-400 transition-colors">Comprobar cobertura</Link></li>
              <li><Link href="/recursos/herramientas/test-velocidad" className="text-gray-400 hover:text-orange-400 transition-colors">Test de velocidad</Link></li>
              <li><Link href="/soporte" className="text-gray-400 hover:text-orange-400 transition-colors">Soporte</Link></li>
              <li><Link href="/recursos/faq" className="text-gray-400 hover:text-orange-400 transition-colors">Preguntas frecuentes</Link></li>
              <li><Link href="/login" className="text-gray-400 hover:text-orange-400 transition-colors">Área de Cliente</Link></li>
            </ul>
          </div>

          {/* Columna 4: Empresa */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Empresa</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/empresa" className="text-gray-400 hover:text-orange-400 transition-colors">Sobre nosotros</Link></li>
              <li><Link href="/contacto" className="text-gray-400 hover:text-orange-400 transition-colors">Contacto</Link></li>
              <li><Link href="/recursos/blog" className="text-gray-400 hover:text-orange-400 transition-colors">Blog</Link></li>
              <li><Link href="/partners" className="text-gray-400 hover:text-orange-400 transition-colors">Partners</Link></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Barra inferior */}
      <div className="border-t border-gray-800">
        <div className="container mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">&copy; 2026 Internet Operadores. Todos los derechos reservados.</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <Link href="/politica-privacidad" className="hover:text-orange-400 transition-colors">Política de Privacidad</Link>
              <span className="hidden sm:inline">|</span>
              <Link href="/politica-cookies" className="hover:text-orange-400 transition-colors">Política de Cookies</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
