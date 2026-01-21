"use client";
export default function SelectorPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50">
      {/* Header minimalista - Optimizado para móvil */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <img 
              src="/logo_transparent.png" 
              alt="Internet Operadores" 
              className="h-12 sm:h-16 lg:h-20"
            />
            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 text-xs sm:text-sm">
              <a href="https://wa.me/34655100400" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 sm:gap-2 text-gray-600 hover:text-orange-600">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
              <a href="mailto:david.perez@internetoperadores.com" className="text-gray-600 hover:text-orange-600 hidden md:block">
                <span className="font-semibold">david.perez@internetoperadores.com</span>
                <span className="text-xs text-gray-500 block">CEO Internet Operadores - Hablemos</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Contenido principal - Optimizado para móvil */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-20">
        {/* Hero con garantía de conexión - Centrado y responsive */}
        <div className="text-center mb-8 sm:mb-12 lg:mb-16 max-w-4xl mx-auto">
          <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">
            <svg className="w-3 h-3 sm:w-4 sm:h-4 inline-block mr-1 sm:mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Garantía de Conexión 24/7
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-bold text-gray-900 mb-3 sm:mb-4 lg:mb-6 px-2">
            ¿Cansado de que tu internet se caiga?
          </h1>
          <p className="text-sm sm:text-base lg:text-xl text-gray-600 mb-2 px-2">
            No importa si tienes fibra o no. Somos el único operador que te garantiza que NUNCA* te quedarás sin internet. Si falla la conexión principal, activamos backup automático (5G, WIMAX o Satélite).
          </p>
          <p className="text-base sm:text-lg font-semibold text-orange-600 mb-4 sm:mb-6 lg:mb-8">
            Y si falla, te devolvemos el dinero.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 lg:gap-4 text-xs sm:text-sm text-gray-500 px-2">
            <span className="font-semibold">Tecnologías:</span>
            <span>Fibra</span>
            <span>5G</span>
            <span>WIMAX</span>
            <span>Satélite</span>
            <span>Sigfox</span>
            <span>LoRa</span>
          </div>
        </div>

        {/* Selector B2B/B2C con ROI emocional - Optimizado para móvil */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 max-w-5xl mx-auto">
          {/* Card Empresa (B2B) */}
          <a 
            href="/empresa"
            className="group relative bg-white rounded-xl sm:rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-orange-500"
          >
            <div className="relative h-48 sm:h-56 lg:h-64 overflow-hidden">
              <img 
                src="/hero-b2b-empresario.png" 
                alt="Empresario trabajando desde chalet - Cobertura universal"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="p-4 sm:p-6 lg:p-12">
              <div className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-orange-100 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 lg:mb-6 group-hover:bg-orange-500 transition-colors">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-orange-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">Para tu Empresa</h2>
              <ul className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>¿Cuánto te cuesta 1 hora sin internet? ¿Más de lo que pagas al mes?</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>¿Tu equipo teletrabaja desde zonas sin fibra?</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>¿Cansado de que tu operador te ignore?</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>¿Pagas múltiples plataformas que no hablan entre sí?</span>
                </li>
              </ul>
              <div className="font-semibold text-sm sm:text-base text-orange-600 group-hover:text-orange-700 transition-colors flex items-center">
                <span>Soluciones para mi empresa</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </div>
            </div>
          </a>

          {/* Card Particular (B2C) */}
          <a 
            href="/particular"
            className="group relative bg-white rounded-xl sm:rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border-2 border-transparent hover:border-orange-500"
          >
            <div className="relative h-48 sm:h-56 lg:h-64 overflow-hidden">
              <img 
                src="/hero-b2c-familia.png" 
                alt="Madre con hijo estudiando - Internet que funciona"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="p-4 sm:p-6 lg:p-12">
              <div className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-orange-100 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4 lg:mb-6 group-hover:bg-orange-500 transition-colors">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-orange-600 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">Para tu Hogar</h2>
              <ul className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>¿Qué es más importante: ahorrar 1€ o que tu hijo apruebe?</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>¿Cuánto te cuesta perder una entrevista de trabajo por culpa del WiFi?</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>¿Te has mudado y no te llega la fibra? No te preocupes, nosotros llegamos.</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 mr-2 sm:mr-3 mt-0.5 sm:mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                  <span>Atención real, no robots. Habla con personas que te entienden.</span>
                </li>
              </ul>
              <div className="font-semibold text-sm sm:text-base text-orange-600 group-hover:text-orange-700 transition-colors flex items-center">
                <span>Soluciones para mi hogar</span>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </div>
            </div>
          </a>
        </div>
      </main>

      {/* Disclaimer - Optimizado para móvil */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <p className="text-xs text-gray-500 text-center leading-relaxed">
          *Garantía sujeta al cumplimiento de las recomendaciones técnicas de instalación y mantenimiento proporcionadas por Internet Operadores.
        </p>
      </div>

      {/* Footer simple */}
      <footer className="bg-gray-50 border-t border-gray-200 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs sm:text-sm text-gray-600">
          <p>&copy; 2026 Internet Operadores. Conectividad Total, Estés Donde Estés.</p>
        </div>
      </footer>
    </div>
  );
}
