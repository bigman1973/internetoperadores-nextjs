import Link from 'next/link';

export default function EmpresaPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header con ajustes: logo más grande, texto más grande */}
      <div className="bg-gray-900 text-white py-2 text-sm">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <a href="https://wa.me/34655100400" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-colors flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                WhatsApp
              </a>
              <a href="mailto:david.perez@internetoperadores.com" className="hover:text-orange-500 transition-colors hidden md:flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                david.perez@internetoperadores.com
              </a>
            </div>
            <div className="flex gap-3 items-center">
              <Link href="/soporte" className="hover:text-orange-500 transition-colors">
                Soporte
              </Link>
              <span className="text-gray-600">|</span>
              <Link href="/login" className="hover:text-orange-500 transition-colors">
                Área Cliente
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-[70px]">
            <Link href="/" className="flex items-center">
              <img 
                src="/logo_transparent.png" 
                alt="Internet Operadores" 
                className="h-16"
              />
            </Link>
            <div className="hidden md:flex gap-8 text-base font-medium">
              <Link href="/productos" className="text-gray-700 hover:text-orange-600 transition-colors">Productos</Link>
              <Link href="/soluciones" className="text-gray-700 hover:text-orange-600 transition-colors">Soluciones</Link>
              <Link href="/sectores" className="text-gray-700 hover:text-orange-600 transition-colors">Sectores</Link>
              <Link href="/recursos" className="text-gray-700 hover:text-orange-600 transition-colors">Recursos</Link>
              <Link href="/empresa" className="text-orange-600 font-semibold">Empresa</Link>
              <Link href="/partners" className="text-gray-700 hover:text-orange-600 transition-colors">Partners</Link>
            </div>
            <div className="flex gap-3">
              <Link 
                href="/demo" 
                className="px-5 py-2.5 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base"
              >
                Ver Demo
              </Link>
              <Link 
                href="/contacto" 
                className="px-5 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base"
              >
                Contactar
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold mb-6">
              <svg className="w-4 h-4 inline-block mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Garantía de Conexión 24/7
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Tu negocio no puede parar.<br/>Tu internet tampoco.
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Somos el único operador que te garantiza conexión 24/7 con backup automático. Y sobre esa base sólida, construimos la solución de comunicaciones unificadas que tu empresa necesita.
            </p>
            <div className="flex justify-center gap-4 mb-8">
              <Link href="/auditoria" className="px-8 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-lg">
                Solicitar Auditoría Gratuita
              </Link>
              <Link href="/casos-exito" className="px-8 py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-lg">
                Ver Casos de Éxito
              </Link>
            </div>
            <div className="flex justify-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Garantía 24/7
              </span>
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                LAN Certificada
              </span>
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Teams • Zoom • Wildix
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Problemas que resolvemos */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              ¿Cuánto te cuesta que tu negocio se pare?
            </h2>
            <p className="text-xl text-gray-600">
              Estos son los problemas que resolvemos todos los días para empresas como la tuya.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">¿1 hora sin internet?</h3>
              <p className="text-gray-600">¿Más de lo que pagas al mes? Garantizamos conexión 24/7 con backup automático.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">¿Equipo sin fibra?</h3>
              <p className="text-gray-600">Conectamos cualquier ubicación con 5G, WIMAX o Satélite. 100% cobertura en España.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 17a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zM14 17a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">¿Múltiples herramientas?</h3>
              <p className="text-gray-600">Plataforma unificada (Teams, Zoom o Wildix) que integra todo. Una sola herramienta.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">¿Operador que ignora?</h3>
              <p className="text-gray-600">Soporte 24/7 real. Habla con personas que entienden tu negocio, no con robots.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2 Pilares */}
      <section className="py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Nuestra solución se basa en 2 pilares sólidos
            </h2>
            <p className="text-xl text-gray-600">
              Sin estos dos pilares, cualquier solución de comunicaciones está condenada al fracaso.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            {/* Pilar 1: Garantía de Conexión */}
            <div className="bg-white rounded-2xl shadow-xl p-10 border-2 border-orange-500">
              <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Pilar 1: Conexión Ininterrumpida</h3>
              <p className="text-gray-600 mb-6">
                No importa si tienes fibra o no. Si falla la conexión principal, activamos backup automático (5G, WIMAX o Satélite). Tu negocio NUNCA se para.
              </p>
              <div className="bg-orange-50 rounded-lg p-6">
                <p className="text-sm font-semibold text-orange-900 mb-3">Backup Automático:</p>
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Fibra → Si falla → 5G</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>5G → Si falla → WIMAX</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>WIMAX → Si falla → Satélite</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pilar 2: Comunicaciones Unificadas */}
            <div className="bg-white rounded-2xl shadow-xl p-10 border-2 border-orange-500">
              <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Pilar 2: Solución a tu Medida</h3>
              <p className="text-gray-600 mb-6">
                Sobre una infraestructura LAN certificada, elegimos la mejor solución para ti: Teams, Zoom o Wildix. No te damos la única que tenemos, sino la que necesitas.
              </p>
              <div className="bg-orange-50 rounded-lg p-6">
                <p className="text-sm font-semibold text-orange-900 mb-3">Partners Certificados:</p>
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Microsoft Teams (Office 365)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Zoom (Videollamadas + Webinars)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Wildix (Contact Center + CRM)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infraestructura LAN Certificada */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-4xl font-bold text-gray-900 mb-6">
                  La base de todo: una infraestructura LAN certificada
                </h2>
                <p className="text-xl text-gray-600 mb-6">
                  Antes de instalar cualquier solución, certificamos tu red LAN para garantizar que todo funcione a la perfección. Sin cuellos de botella, sin problemas de rendimiento.
                </p>
                <p className="text-gray-600 mb-8">
                  Una comunicación unificada sin una LAN certificada es como construir una casa sobre arena. Por eso, antes de desplegar Teams, Zoom o Wildix, nos aseguramos de que tu infraestructura esté lista.
                </p>
                <Link href="/certificacion-lan" className="inline-block px-8 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">
                  Solicitar Certificación LAN
                </Link>
              </div>
              <div className="bg-gray-100 rounded-2xl p-12 text-center">
                <svg className="w-32 h-32 mx-auto text-orange-600 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <p className="text-lg font-semibold text-gray-900">Certificación LAN</p>
                <p className="text-gray-600">Garantía de rendimiento óptimo</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partners: La solución correcta para ti */}
      <section className="py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              No creemos en soluciones únicas. Elegimos la mejor para ti.
            </h2>
            <p className="text-xl text-gray-600">
              Cada empresa es diferente. Por eso trabajamos con los tres mejores partners del mercado y elegimos el que mejor se adapta a tu organización.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Microsoft Teams */}
            <div className="bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-all">
              <div className="h-20 flex items-center justify-center mb-6">
                <div className="text-4xl font-bold text-blue-600">Teams</div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Microsoft Teams</h3>
              <p className="text-sm text-orange-600 font-semibold mb-4">Ideal para empresas con Office 365</p>
              <p className="text-gray-600 mb-6">
                Si ya usas Office 365, Teams es tu solución natural. Integración nativa con Outlook, SharePoint, OneDrive y todo el ecosistema Microsoft.
              </p>
              <div className="border-t pt-6">
                <p className="text-sm font-semibold text-gray-900 mb-3">Caso de uso:</p>
                <p className="text-sm text-gray-600">Despacho de abogados que usa Teams para colaboración interna y reuniones con clientes.</p>
              </div>
            </div>

            {/* Zoom */}
            <div className="bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-all border-2 border-orange-500">
              <div className="h-20 flex items-center justify-center mb-6">
                <div className="text-4xl font-bold text-blue-500">Zoom</div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Zoom</h3>
              <p className="text-sm text-orange-600 font-semibold mb-4">Ideal para videollamadas y webinars</p>
              <p className="text-gray-600 mb-6">
                Si haces muchas videollamadas, formaciones online o webinars, Zoom es la mejor opción. Calidad de vídeo superior y plataforma robusta.
              </p>
              <div className="border-t pt-6">
                <p className="text-sm font-semibold text-gray-900 mb-3">Caso de uso:</p>
                <p className="text-sm text-gray-600">Consultora que hace formaciones online para clientes y webinars para captación.</p>
              </div>
            </div>

            {/* Wildix */}
            <div className="bg-white rounded-2xl shadow-lg p-8 hover:shadow-xl transition-all">
              <div className="h-20 flex items-center justify-center mb-6">
                <div className="text-4xl font-bold text-green-600">Wildix</div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Wildix</h3>
              <p className="text-sm text-orange-600 font-semibold mb-4">Ideal para contact center y atención telefónica</p>
              <p className="text-gray-600 mb-6">
                Si tienes un contact center o mucha atención telefónica, Wildix es tu solución. Potencia de centralita con integración CRM.
              </p>
              <div className="border-t pt-6">
                <p className="text-sm font-semibold text-gray-900 mb-3">Caso de uso:</p>
                <p className="text-sm text-gray-600">E-commerce con 20 agentes de soporte que atienden llamadas y chats integrados con CRM.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 bg-orange-600">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-6">
              ¿Listo para que tu negocio no se pare nunca más?
            </h2>
            <p className="text-xl text-orange-100 mb-8">
              Solicita una auditoría gratuita y descubre cómo podemos ayudarte a garantizar la conexión de tu empresa.
            </p>
            <Link href="/auditoria" className="inline-block px-10 py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-lg">
              Solicitar Auditoría Gratuita
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-gray-400">&copy; 2026 Internet Operadores. Conectividad Total, Estés Donde Estés.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
