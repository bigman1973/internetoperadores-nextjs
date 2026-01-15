export default function SelectorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50">
      {/* Header minimalista */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <img 
              src="/logo_transparent.png" 
              alt="Internet Operadores" 
              className="h-12"
            />
            <div className="flex items-center gap-4 text-sm">
              <a href="tel:+34655100400" className="text-gray-600 hover:text-orange-600">
                +34 655 100 400
              </a>
              <a href="mailto:info@internetoperadores.com" className="text-gray-600 hover:text-orange-600">
                info@internetoperadores.com
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Hero con diferenciador real */}
        <div className="text-center mb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-12">
            <div className="text-left">
              <div className="inline-block bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
                🎯 El único operador con 100% de cobertura en España
              </div>
              <h1 className="text-5xl font-bold text-gray-900 mb-4">
                ¿Cansado de que te digan que no hay cobertura?
              </h1>
              <p className="text-xl text-gray-600 mb-6">
                Llegamos donde otros no llegan. Con la mejor tecnología para tu caso: Fibra, 5G, WIMAX o Satélite.
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-semibold">Wildix • Zoom • Microsoft Teams</span>
                </div>
                <span className="text-gray-400">|</span>
                <span className="font-medium">+25 años</span>
                <span className="text-gray-400">|</span>
                <span className="font-medium">500+ empresas</span>
              </div>
            </div>

            {/* Infografía multi-tecnología */}
            <div className="relative">
              <div className="bg-gradient-to-br from-orange-100 to-orange-50 rounded-2xl p-8 shadow-xl">
                <div className="aspect-square bg-white rounded-lg shadow-lg p-6 relative overflow-hidden">
                  {/* Mapa de España estilizado */}
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-orange-600/10"></div>
                  <div className="relative z-10">
                    <h3 className="text-center font-bold text-gray-900 mb-6">Todas las Tecnologías</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Fibra */}
                      <div className="bg-orange-50 rounded-lg p-4 text-center">
                        <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-2">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <p className="text-xs font-semibold text-gray-700">Fibra</p>
                        <p className="text-xs text-gray-500">Hasta 10 Gbps</p>
                      </div>
                      {/* 5G */}
                      <div className="bg-orange-50 rounded-lg p-4 text-center">
                        <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-2">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                          </svg>
                        </div>
                        <p className="text-xs font-semibold text-gray-700">5G</p>
                        <p className="text-xs text-gray-500">Hasta 1 Gbps</p>
                      </div>
                      {/* WIMAX */}
                      <div className="bg-orange-50 rounded-lg p-4 text-center">
                        <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-2">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                        </div>
                        <p className="text-xs font-semibold text-gray-700">WIMAX</p>
                        <p className="text-xs text-gray-500">Hasta 100 Mbps</p>
                      </div>
                      {/* Satélite */}
                      <div className="bg-orange-50 rounded-lg p-4 text-center">
                        <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-2">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-xs font-semibold text-gray-700">Satélite</p>
                        <p className="text-xs text-gray-500">Órbita baja</p>
                      </div>
                    </div>
                    <div className="mt-4 text-center">
                      <p className="text-xs font-bold text-orange-600">Te damos la MEJOR para tu caso</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Elementos decorativos */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-orange-200 rounded-full blur-3xl opacity-30"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-orange-100 rounded-full blur-3xl opacity-30"></div>
            </div>
          </div>
        </div>

        {/* Selector B2B/B2C con dolores emocionales reales */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Card Empresa (B2B) */}
          <a 
            href="/empresa"
            className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-orange-500"
          >
            <div className="p-12">
              {/* Icono */}
              <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-orange-500 transition-colors">
                <svg className="w-10 h-10 text-orange-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>

              {/* Contenido */}
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Tengo una Empresa
              </h2>
              <p className="text-gray-600 mb-6 font-semibold">
                Y necesito conectividad que no falle...
              </p>

              {/* DOLORES EMOCIONALES REALES */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Tu equipo teletrabaja desde zonas sin fibra?</strong> Nosotros llegamos con 5G, WIMAX o satélite.</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Tienes sedes en polígonos sin cobertura?</strong> Conectamos cualquier ubicación.</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Cansado de que tu operador te ignore?</strong> Soporte 24/7 real, no un chatbot.</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Pagas múltiples plataformas</strong> que no hablan entre sí? Unificamos todo.</span>
                </li>
              </ul>

              {/* CTA */}
              <div className="flex items-center justify-between">
                <span className="text-orange-600 font-semibold group-hover:text-orange-700">
                  Soluciones para mi empresa
                </span>
                <svg className="w-6 h-6 text-orange-600 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </a>

          {/* Card Particular (B2C) */}
          <a 
            href="/particular"
            className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-orange-500"
          >
            <div className="p-12">
              {/* Icono */}
              <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-orange-500 transition-colors">
                <svg className="w-10 h-10 text-orange-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>

              {/* Contenido */}
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Soy Particular
              </h2>
              <p className="text-gray-600 mb-6 font-semibold">
                Y estoy harto de problemas con mi internet...
              </p>

              {/* DOLORES EMOCIONALES REALES */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Te has mudado y no te llega la fibra?</strong> Nosotros llegamos donde otros no.</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Para una vez que tu hijo se concentra</strong> y el WiFi le falla? Nunca más.</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Harto de que las videollamadas se corten?</strong> Internet estable, siempre.</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Nadie te atiende cuando tienes un problema?</strong> Atención real, no robots.</span>
                </li>
              </ul>

              {/* CTA */}
              <div className="flex items-center justify-between">
                <span className="text-orange-600 font-semibold group-hover:text-orange-700">
                  Ver tarifas para mi hogar
                </span>
                <svg className="w-6 h-6 text-orange-600 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </div>
          </a>
        </div>

        {/* Sección de confianza */}
        <div className="mt-16 text-center">
          <p className="text-gray-600 mb-4">
            <strong>25+ años</strong> dando servicio donde otros no llegan
          </p>
          <div className="flex items-center justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>100% Cobertura</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Multi-tecnología</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Soporte 24/7</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer simple */}
      <footer className="bg-gray-50 border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-600">
          <p>&copy; 2026 Internet Operadores. Conectividad Total, Estés Donde Estés.</p>
        </div>
      </footer>
    </div>
  );
}
