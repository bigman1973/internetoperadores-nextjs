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
        {/* Hero con imagen tipo Nextiva */}
        <div className="text-center mb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-center mb-12">
            <div className="text-left">
              <h1 className="text-5xl font-bold text-gray-900 mb-4">
                ¿Qué te preocupa de tu empresa o tu hogar?
              </h1>
              <p className="text-xl text-gray-600 mb-6">
                Selecciona tu situación para descubrir cómo podemos ayudarte
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

            {/* Mockup visual tipo Nextiva */}
            <div className="relative">
              <div className="bg-gradient-to-br from-orange-100 to-orange-50 rounded-2xl p-8 shadow-xl">
                <div className="aspect-video bg-white rounded-lg shadow-lg flex items-center justify-center relative overflow-hidden">
                  {/* Mockup de plataforma unificada */}
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-orange-600/5"></div>
                  <div className="relative z-10 text-center p-8">
                    <svg className="w-24 h-24 mx-auto text-orange-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <div className="flex items-center justify-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                        </svg>
                      </div>
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                        </svg>
                      </div>
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                        <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">Plataforma Unificada</p>
                    <p className="text-xs text-gray-500">Telefonía + Chat + Video + Email</p>
                  </div>
                </div>
              </div>
              {/* Elementos decorativos */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-orange-200 rounded-full blur-3xl opacity-30"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-orange-100 rounded-full blur-3xl opacity-30"></div>
            </div>
          </div>
        </div>

        {/* Selector B2B/B2C */}
        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Card Empresa (B2B) - Enfocado en PROBLEMAS */}
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
                Y me preocupa que algo falle en mi negocio...
              </p>

              {/* PROBLEMAS MODERNOS que resolvemos */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Cansado de que tu operador te ignore</strong> cuando tienes un problema?</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Tu equipo pierde tiempo</strong> cambiando entre 5 herramientas diferentes para comunicarse?</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Tus clientes repiten la misma información</strong> cada vez que llaman?</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Pagas múltiples plataformas</strong> que no hablan entre sí?</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Temes un ciberataque</strong> que paralice tu empresa o robe información sensible?</span>
                </li>
              </ul>

              {/* CTA */}
              <div className="flex items-center justify-between">
                <span className="text-orange-600 font-semibold group-hover:text-orange-700">
                  Soluciones para mi empresa
                </span>
                <svg className="w-6 h-6 text-orange-600 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>

            {/* Badge */}
            <div className="absolute top-4 right-4 bg-orange-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
              Más de 25 años
            </div>
          </a>

          {/* Card Particular (B2C) - Enfocado en PROBLEMAS */}
          <a 
            href="/particular"
            className="group relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-orange-500"
          >
            <div className="p-12">
              {/* Icono */}
              <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-orange-500 transition-colors">
                <svg className="w-10 h-10 text-gray-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>

              {/* Contenido */}
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Soy Particular
              </h2>
              <p className="text-gray-600 mb-6 font-semibold">
                Y estoy cansado de problemas con mi operador...
              </p>

              {/* PROBLEMAS que resolvemos */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Tu internet va lento</strong> y no puedes trabajar desde casa o ver series sin cortes?</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Pagas demasiado</strong> por fibra y móvil sin tener claro qué estás contratando?</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Nadie te atiende</strong> cuando tienes un problema y te pierdes en centralitas automáticas?</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-red-500 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span><strong>¿Estás atado con permanencias</strong> que no te dejan cambiar aunque el servicio sea malo?</span>
                </li>
              </ul>

              {/* CTA */}
              <div className="flex items-center justify-between">
                <span className="text-orange-600 font-semibold group-hover:text-orange-700">
                  Quiero un operador que me atienda
                </span>
                <svg className="w-6 h-6 text-orange-600 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </a>
        </div>

        {/* Información adicional */}
        <div className="text-center mt-16">
          <p className="text-gray-600 mb-4">
            ¿No estás seguro? Llámanos y te asesoramos sin compromiso
          </p>
          <a 
            href="tel:+34655100400" 
            className="inline-flex items-center gap-2 text-orange-600 font-semibold hover:text-orange-700"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            +34 655 100 400
          </a>
        </div>
      </main>

      {/* Footer minimalista */}
      <footer className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-sm text-gray-600">
            <p>© 2026 Internet Operadores. Más de 25 años conectando empresas en España.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
