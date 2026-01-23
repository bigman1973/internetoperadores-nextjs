"use client";
import Link from 'next/link';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

export default function EmpresaPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="empresa" />

      {/* Hero - Responsive */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 inline-block mr-1 sm:mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Garantía de Conexión 24/7
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">
              Tu negocio no puede parar.<br className="hidden sm:block"/>Tu internet tampoco.
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">
              Somos el único operador que te garantiza conexión 24/7 con backup automático. Y sobre esa base sólida, construimos la solución de comunicaciones unificadas que tu empresa necesita.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mb-6 sm:mb-8 px-4">
              <Link href="/auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">
                Solicitar Auditoría Gratuita
              </Link>
              <Link href="/casos-exito" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">
                Ver Casos de Éxito
              </Link>
            </div>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4 lg:gap-6 text-xs sm:text-sm text-gray-500">
              <span className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Garantía 24/7
              </span>
              <span className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                LAN Certificada
              </span>
              <span className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Teams • Zoom • Wildix
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Problemas que resolvemos - Responsive */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
              ¿Cuánto te cuesta que tu negocio se pare?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Estos son los problemas que resolvemos todos los días para empresas como la tuya.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 max-w-6xl mx-auto">
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">¿1 hora sin internet?</h3>
              <p className="text-sm sm:text-base text-gray-600">¿Más de lo que pagas al mes? Garantizamos conexión 24/7 con backup automático.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">¿Equipo sin fibra?</h3>
              <p className="text-sm sm:text-base text-gray-600">Conectamos cualquier ubicación con 5G, WIMAX o Satélite. 100% cobertura en España.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 17a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2zM14 17a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2z" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">¿Múltiples herramientas?</h3>
              <p className="text-sm sm:text-base text-gray-600">Plataforma unificada (Teams, Zoom o Wildix) que integra todo. Una sola herramienta.</p>
            </div>
            <div className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">¿Operador que ignora?</h3>
              <p className="text-sm sm:text-base text-gray-600">Soporte 24/7 real. Habla con personas que entienden tu negocio, no con robots.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2 Pilares - Responsive */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
              Nuestra solución se basa en 2 pilares sólidos
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Sin estos dos pilares, cualquier solución de comunicaciones está condenada al fracaso.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 max-w-5xl mx-auto">
            {/* Pilar 1: Garantía de Conexión */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 lg:p-10 border-2 border-orange-500">
              <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-orange-100 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6">
                <svg className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Pilar 1: Conexión Ininterrumpida</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                No importa si tienes fibra o no. Si falla la conexión principal, activamos backup automático (5G, WIMAX o Satélite). Tu negocio NUNCA se para.
              </p>
              <div className="bg-orange-50 rounded-lg p-4 sm:p-6">
                <p className="text-xs sm:text-sm font-semibold text-orange-900 mb-2 sm:mb-3">Backup Automático:</p>
                <div className="space-y-2 text-xs sm:text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Fibra → Si falla → 5G</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>5G → Si falla → WIMAX</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>WIMAX → Si falla → Satélite</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pilar 2: Comunicaciones Unificadas */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 lg:p-10 border-2 border-orange-500">
              <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-orange-100 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6">
                <svg className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                </svg>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">Pilar 2: Solución a tu Medida</h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                Sobre una infraestructura LAN certificada, elegimos la mejor solución para ti: Teams, Zoom o Wildix. No te damos la única que tenemos, sino la que necesitas.
              </p>
              <div className="bg-orange-50 rounded-lg p-4 sm:p-6">
                <p className="text-xs sm:text-sm font-semibold text-orange-900 mb-2 sm:mb-3">Partners Certificados:</p>
                <div className="space-y-2 text-xs sm:text-sm text-gray-700">
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Microsoft Teams (Office 365)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Zoom (Videollamadas + Webinars)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span>Wildix (Contact Center + CRM)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Infraestructura LAN Certificada - Responsive */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-10 lg:gap-12 items-center">
              <div className="order-2 md:order-1">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
                  La base de todo: una infraestructura LAN certificada
                </h2>
                <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-4 sm:mb-6">
                  Antes de instalar cualquier solución de comunicaciones, certificamos tu red. Sin una LAN bien diseñada, todo lo demás falla.
                </p>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 text-sm sm:text-base">Auditoría de red gratuita</h4>
                      <p className="text-xs sm:text-sm text-gray-600">Analizamos tu infraestructura actual y detectamos puntos de mejora.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 text-sm sm:text-base">Certificación de cableado</h4>
                      <p className="text-xs sm:text-sm text-gray-600">Garantizamos que tu cableado soporta las velocidades que necesitas.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 text-sm sm:text-base">WiFi empresarial</h4>
                      <p className="text-xs sm:text-sm text-gray-600">Puntos de acceso profesionales para cobertura total sin interferencias.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <div className="bg-gradient-to-br from-orange-100 to-orange-200 rounded-xl sm:rounded-2xl p-6 sm:p-8 lg:p-10">
                  <div className="text-center">
                    <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-orange-600 mb-2">99.9%</div>
                    <p className="text-sm sm:text-base text-gray-700 font-medium">Uptime garantizado</p>
                  </div>
                  <div className="mt-6 sm:mt-8 grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="bg-white rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-xl sm:text-2xl font-bold text-gray-900">+6.340</div>
                      <p className="text-xs sm:text-sm text-gray-600">Clientes</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 sm:p-4 text-center">
                      <div className="text-xl sm:text-2xl font-bold text-gray-900">+25</div>
                      <p className="text-xs sm:text-sm text-gray-600">Años experiencia</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Soluciones de Comunicaciones - Responsive */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
              La solución que mejor se adapta a ti
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              No vendemos una única solución. Elegimos la mejor para tu caso: Teams, Zoom o Wildix.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {/* Teams */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-6 sm:p-8 hover:shadow-xl transition-all">
              <div className="h-16 sm:h-20 flex items-center justify-center mb-4 sm:mb-6">
                <div className="text-3xl sm:text-4xl font-bold text-purple-600">Teams</div>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Microsoft Teams</h3>
              <p className="text-xs sm:text-sm text-orange-600 font-semibold mb-3 sm:mb-4">Ideal para empresas con Office 365</p>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                Si ya usas Office 365, Teams es la opción natural. Integración perfecta con Word, Excel, Outlook y SharePoint.
              </p>
              <div className="border-t pt-4 sm:pt-6">
                <p className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Caso de uso:</p>
                <p className="text-xs sm:text-sm text-gray-600">Despacho de abogados que usa Teams para colaboración interna y reuniones con clientes.</p>
              </div>
            </div>

            {/* Zoom */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-6 sm:p-8 hover:shadow-xl transition-all border-2 border-orange-500">
              <div className="h-16 sm:h-20 flex items-center justify-center mb-4 sm:mb-6">
                <div className="text-3xl sm:text-4xl font-bold text-blue-500">Zoom</div>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Zoom</h3>
              <p className="text-xs sm:text-sm text-orange-600 font-semibold mb-3 sm:mb-4">Ideal para videollamadas y webinars</p>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                Si haces muchas videollamadas, formaciones online o webinars, Zoom es la mejor opción. Calidad de vídeo superior y plataforma robusta.
              </p>
              <div className="border-t pt-4 sm:pt-6">
                <p className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Caso de uso:</p>
                <p className="text-xs sm:text-sm text-gray-600">Consultora que hace formaciones online para clientes y webinars para captación.</p>
              </div>
            </div>

            {/* Wildix */}
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-6 sm:p-8 hover:shadow-xl transition-all sm:col-span-2 lg:col-span-1">
              <div className="h-16 sm:h-20 flex items-center justify-center mb-4 sm:mb-6">
                <div className="text-3xl sm:text-4xl font-bold text-green-600">Wildix</div>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 sm:mb-3">Wildix</h3>
              <p className="text-xs sm:text-sm text-orange-600 font-semibold mb-3 sm:mb-4">Ideal para contact center y atención telefónica</p>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                Si tienes un contact center o mucha atención telefónica, Wildix es tu solución. Potencia de centralita con integración CRM.
              </p>
              <div className="border-t pt-4 sm:pt-6">
                <p className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Caso de uso:</p>
                <p className="text-xs sm:text-sm text-gray-600">E-commerce con 20 agentes de soporte que atienden llamadas y chats integrados con CRM.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final - Responsive */}
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">
              ¿Listo para que tu negocio no se pare nunca más?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">
              Solicita una auditoría gratuita y descubre cómo podemos ayudarte a garantizar la conexión de tu empresa.
            </p>
            <Link href="/auditoria" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">
              Solicitar Auditoría Gratuita
            </Link>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
