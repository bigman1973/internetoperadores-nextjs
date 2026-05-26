"use client";
import Link from 'next/link';

export default function EmpresaFooter() {
  return (
    <footer className="bg-gray-900 text-white">
      {/* CTA superior */}
      <div className="bg-orange-500">
        <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-white">¿Listo para mejorar la conectividad de tu empresa?</h3>
              <p className="text-orange-100 mt-1">Solicita un estudio gratuito y sin compromiso</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/contacto" className="bg-white text-orange-600 hover:bg-orange-50 px-6 py-3 rounded-lg font-semibold transition-all text-center">
                Solicitar presupuesto
              </Link>
              <a href="https://wa.me/34900123456?text=Hola%2C%20me%20interesa%20un%20estudio%20de%20conectividad" target="_blank" rel="noopener noreferrer" className="border-2 border-white text-white hover:bg-white hover:text-orange-600 px-6 py-3 rounded-lg font-semibold transition-all text-center">
                WhatsApp
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
            <Link href="/empresa" className="text-2xl font-bold text-white hover:text-orange-400 transition-colors">
              Internet<span className="text-orange-400">Operadores</span>
            </Link>
            <p className="text-gray-400 mt-4 text-sm leading-relaxed">
              Operador de telecomunicaciones multioperador especializado en soluciones de conectividad empresarial.
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

          {/* Columna 2: Soluciones */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Soluciones</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/soluciones/conectividad-avanzada" className="text-gray-400 hover:text-orange-400 transition-colors">Conectividad Avanzada</Link></li>
              <li><Link href="/soluciones/comunicaciones-unificadas" className="text-gray-400 hover:text-orange-400 transition-colors">Comunicaciones Unificadas</Link></li>
              <li><Link href="/soluciones/infraestructura-red" className="text-gray-400 hover:text-orange-400 transition-colors">Infraestructura de Red</Link></li>
              <li><Link href="/soluciones/mantenimiento-it" className="text-gray-400 hover:text-orange-400 transition-colors">Mantenimiento IT</Link></li>
              <li><Link href="/soluciones/moviles" className="text-gray-400 hover:text-orange-400 transition-colors">Móviles Empresa</Link></li>
              <li><Link href="/soluciones/exagrid" className="text-gray-400 hover:text-orange-400 transition-colors">ExaGrid Backup</Link></li>
            </ul>
          </div>

          {/* Columna 3: Recursos */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Recursos</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/recursos/guias" className="text-gray-400 hover:text-orange-400 transition-colors">Guías y Whitepapers</Link></li>
              <li><Link href="/recursos/blog" className="text-gray-400 hover:text-orange-400 transition-colors">Blog</Link></li>
              <li><Link href="/recursos/casos-exito" className="text-gray-400 hover:text-orange-400 transition-colors">Casos de Éxito</Link></li>
              <li><Link href="/recursos/herramientas" className="text-gray-400 hover:text-orange-400 transition-colors">Herramientas</Link></li>
              <li><Link href="/recursos/webinars" className="text-gray-400 hover:text-orange-400 transition-colors">Webinars y Demos</Link></li>
              <li><Link href="/recursos/faq" className="text-gray-400 hover:text-orange-400 transition-colors">FAQ</Link></li>
            </ul>
          </div>

          {/* Columna 4: Empresa */}
          <div>
            <h4 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">Empresa</h4>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/empresa" className="text-gray-400 hover:text-orange-400 transition-colors">Sobre nosotros</Link></li>
              <li><Link href="/partners" className="text-gray-400 hover:text-orange-400 transition-colors">Programa Partners</Link></li>
              <li><Link href="/contacto" className="text-gray-400 hover:text-orange-400 transition-colors">Contacto</Link></li>
              <li><Link href="/demo" className="text-gray-400 hover:text-orange-400 transition-colors">Solicitar Demo</Link></li>
              <li><Link href="/soporte" className="text-gray-400 hover:text-orange-400 transition-colors">Soporte Técnico</Link></li>
              <li><Link href="/login" className="text-gray-400 hover:text-orange-400 transition-colors">Área de Cliente</Link></li>
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
              <span className="hidden sm:inline">|</span>
              <Link href="/condiciones-generales" className="hover:text-orange-400 transition-colors">Condiciones Generales</Link>
              <span className="hidden sm:inline">|</span>
              <span>CEO: David Pérez</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
