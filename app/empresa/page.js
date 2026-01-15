'use client';

import Link from 'next/link';

export default function EmpresaPage() {
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

            <div className="hidden lg:flex items-center gap-8">
              <Link href="/productos" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                Productos
              </Link>
              <Link href="/soluciones" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                Soluciones
              </Link>
              <Link href="/sectores" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                Sectores
              </Link>
              <Link href="/recursos" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                Recursos
              </Link>
              <Link href="/empresa" className="text-orange-500 font-semibold transition-colors">
                Empresa
              </Link>
              <Link href="/partners" className="text-gray-700 hover:text-orange-500 font-medium transition-colors">
                Partners
              </Link>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <Link href="/demo" className="px-5 py-2.5 text-orange-500 border-2 border-orange-500 rounded-lg hover:bg-orange-50 font-semibold transition-all">
                Ver Demo
              </Link>
              <Link href="/contacto" className="px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-semibold transition-all shadow-sm hover:shadow-md">
                Contactar
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-white py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
                ¿Cansado de que tu operador te ignore?
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
                Más de 500 empresas ya confían en nosotros para sus comunicaciones. No somos solo un proveedor de tecnología, <strong>somos tu operador de confianza</strong> con más de 25 años de experiencia.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link href="/contacto" className="px-8 py-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-semibold text-lg transition-all shadow-lg hover:shadow-xl text-center">
                  Solicitar Consultoría Gratuita
                </Link>
                <Link href="#casos-exito" className="px-8 py-4 text-orange-500 border-2 border-orange-500 rounded-lg hover:bg-orange-50 font-semibold text-lg transition-all text-center">
                  Ver Casos de Éxito
                </Link>
              </div>
              
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-gray-700 font-semibold">Wildix • Zoom • Microsoft Teams</span>
                </div>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600 font-medium">+25 años</span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600 font-medium">500+ empresas</span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600 font-medium">99.9% uptime</span>
              </div>
            </div>

            <div className="relative">
              <div className="bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
                <div className="aspect-video bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-24 h-24 mx-auto text-orange-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <p className="text-gray-600 font-medium">Plataforma Unificada</p>
                  </div>
                </div>
              </div>
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-orange-200 rounded-full blur-3xl opacity-30"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-orange-100 rounded-full blur-3xl opacity-30"></div>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN POINTS SECTION */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Sabemos lo que te frustra de tu operador actual
            </h2>
            <p className="text-xl text-gray-600">
              Porque lo escuchamos todos los días. Empresas que llegan frustradas, ignoradas y cansadas de promesas incumplidas.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Pain Point 1 */}
            <div className="bg-white rounded-xl p-8 shadow-lg border-2 border-red-100 hover:border-red-300 transition-all">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Operador que te ignora
              </h3>
              <p className="text-gray-600 mb-4">
                Llamas y no responden. Te pasan de departamento en departamento. Nadie se hace responsable.
              </p>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-semibold text-orange-600">✓ Nuestra solución:</p>
                <p className="text-sm text-gray-700">Soporte 24/7 con técnicos dedicados. Respuesta en menos de 15 minutos.</p>
              </div>
            </div>

            {/* Pain Point 2 */}
            <div className="bg-white rounded-xl p-8 shadow-lg border-2 border-red-100 hover:border-red-300 transition-all">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Múltiples herramientas
              </h3>
              <p className="text-gray-600 mb-4">
                Tu equipo pierde tiempo cambiando entre 5 herramientas diferentes. Pérdida de contexto y baja productividad.
              </p>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-semibold text-orange-600">✓ Nuestra solución:</p>
                <p className="text-sm text-gray-700">Plataforma unificada con Wildix/Zoom/Teams. Todo en un solo lugar.</p>
              </div>
            </div>

            {/* Pain Point 3 */}
            <div className="bg-white rounded-xl p-8 shadow-lg border-2 border-red-100 hover:border-red-300 transition-all">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Clientes repiten información
              </h3>
              <p className="text-gray-600 mb-4">
                Tus clientes repiten la misma información cada vez que llaman. Experiencia frustrante que hace que abandonen.
              </p>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-semibold text-orange-600">✓ Nuestra solución:</p>
                <p className="text-sm text-gray-700">Integración CRM + UC para visión 360° del cliente.</p>
              </div>
            </div>

            {/* Pain Point 4 */}
            <div className="bg-white rounded-xl p-8 shadow-lg border-2 border-red-100 hover:border-red-300 transition-all">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Múltiples facturas
              </h3>
              <p className="text-gray-600 mb-4">
                Pagas múltiples plataformas que no hablan entre sí. Facturas complejas, costes ocultos, nadie responsable.
              </p>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-semibold text-orange-600">✓ Nuestra solución:</p>
                <p className="text-sm text-gray-700">Todo en uno. Una sola factura, un solo responsable.</p>
              </div>
            </div>

            {/* Pain Point 5 */}
            <div className="bg-white rounded-xl p-8 shadow-lg border-2 border-red-100 hover:border-red-300 transition-all">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Ciberseguridad
              </h3>
              <p className="text-gray-600 mb-4">
                Temes un ciberataque que paralice tu empresa. Datos sin protección, sin backup verificado, sin plan de contingencia.
              </p>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-semibold text-orange-600">✓ Nuestra solución:</p>
                <p className="text-sm text-gray-700">Backup empresarial + seguridad perimetral incluida.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CÓMO LO RESOLVEMOS */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Comunicaciones Unificadas que realmente unifican
            </h2>
            <p className="text-xl text-gray-600">
              No vendemos tecnología. Resolvemos problemas de negocio con partners de primer nivel.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Solución 1 */}
            <div className="bg-white rounded-xl p-8 shadow-xl">
              <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Plataforma Unificada
              </h3>
              <p className="text-sm text-orange-600 font-semibold mb-4">Wildix • Zoom • Microsoft Teams</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Telefonía + Chat + Video + Email en una sola plataforma</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Integración con CRM (Salesforce, HubSpot, Zoho)</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Visión 360° del cliente</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Analytics en tiempo real</span>
                </li>
              </ul>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-900 mb-1">Resultados reales:</p>
                <p className="text-sm text-gray-700">InflectionCX redujo <strong>3 min por llamada</strong></p>
              </div>
            </div>

            {/* Solución 2 */}
            <div className="bg-white rounded-xl p-8 shadow-xl">
              <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Soporte 24/7 Real
              </h3>
              <p className="text-sm text-orange-600 font-semibold mb-4">Más de 25 años siendo operador</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Técnicos dedicados (no chatbots)</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Respuesta en menos de 15 minutos</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Proactividad: te avisamos antes de que falle</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Sin &ldquo;es problema interno&rdquo;</span>
                </li>
              </ul>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-900 mb-1">Resultados reales:</p>
                <p className="text-sm text-gray-700"><strong>99.9% uptime</strong> garantizado</p>
              </div>
            </div>

            {/* Solución 3 */}
            <div className="bg-white rounded-xl p-8 shadow-xl">
              <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Consolidación Total
              </h3>
              <p className="text-sm text-orange-600 font-semibold mb-4">Un solo proveedor, una sola factura</p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Comunicaciones Unificadas</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Conectividad (fibra, 5G, backup)</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Backup empresarial</span>
                </li>
                <li className="flex items-start text-gray-700">
                  <svg className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Ciberseguridad</span>
                </li>
              </ul>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-900 mb-1">Resultados reales:</p>
                <p className="text-sm text-gray-700">Sydney Film Festival ahorró <strong>81% en facturas</strong></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PARTNERS SECTION */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Trabajamos con los mejores
            </h2>
            <p className="text-xl text-gray-600">
              Partners de primer nivel para ofrecerte las mejores soluciones de comunicaciones unificadas
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Wildix */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-all">
              <div className="h-16 flex items-center justify-center mb-6">
                <div className="text-3xl font-bold text-gray-800">Wildix</div>
              </div>
              <p className="text-gray-700 mb-4 text-center">
                Comunicaciones unificadas 100% web. Sin instalaciones, sin complejidad. Integración nativa con CRM.
              </p>
              <div className="space-y-2 text-sm text-gray-600">
                <p>✓ PYMEs 10-100 empleados</p>
                <p>✓ Empresas con múltiples sedes</p>
                <p>✓ Contact centers pequeños</p>
              </div>
            </div>

            {/* Zoom */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-all">
              <div className="h-16 flex items-center justify-center mb-6">
                <div className="text-3xl font-bold text-blue-600">Zoom</div>
              </div>
              <p className="text-gray-700 mb-4 text-center">
                La plataforma de videoconferencia líder mundial, ahora con telefonía y contact center integrados.
              </p>
              <div className="space-y-2 text-sm text-gray-600">
                <p>✓ Empresas con trabajo híbrido</p>
                <p>✓ Contact centers medianos</p>
                <p>✓ Clientes internacionales</p>
              </div>
            </div>

            {/* Microsoft Teams */}
            <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-8 shadow-lg border border-gray-200 hover:shadow-xl transition-all">
              <div className="h-16 flex items-center justify-center mb-6">
                <div className="text-3xl font-bold text-purple-600">Microsoft Teams</div>
              </div>
              <p className="text-gray-700 mb-4 text-center">
                Si ya usas Microsoft 365, convierte Teams en tu centralita empresarial completa.
              </p>
              <div className="space-y-2 text-sm text-gray-600">
                <p>✓ Ecosistema Microsoft</p>
                <p>✓ Grandes empresas (+100)</p>
                <p>✓ Integración Active Directory</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CASOS DE ÉXITO */}
      <section id="casos-exito" className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Empresas que ya no sufren con su operador
            </h2>
            <p className="text-xl text-gray-600">
              Casos reales de empresas que cambiaron y nunca miraron atrás
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Caso 1 */}
            <div className="bg-white rounded-xl p-8 shadow-xl">
              <div className="mb-6">
                <div className="text-sm text-orange-600 font-semibold mb-2">Empresa Logística • 100 empleados</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  &ldquo;Teníamos 3 proveedores diferentes. Cuando algo fallaba, nadie se hacía responsable.&rdquo;
                </h3>
              </div>
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 mb-2">Solución:</p>
                <p className="text-sm text-gray-700">Consolidación total con Wildix + Fibra + Backup</p>
              </div>
              <div className="mb-6 space-y-2">
                <p className="text-sm font-semibold text-gray-900">Resultados:</p>
                <p className="text-sm text-gray-700">✓ -60% en costes de comunicaciones</p>
                <p className="text-sm text-gray-700">✓ -80% en tiempo de resolución</p>
                <p className="text-sm text-gray-700">✓ Una sola factura, un solo responsable</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm italic text-gray-700">
                  &ldquo;Por fin tenemos un operador que responde. Antes tardaban días, ahora minutos.&rdquo;
                </p>
                <p className="text-xs text-gray-600 mt-2">— Director IT</p>
              </div>
            </div>

            {/* Caso 2 */}
            <div className="bg-white rounded-xl p-8 shadow-xl">
              <div className="mb-6">
                <div className="text-sm text-orange-600 font-semibold mb-2">Contact Center • 50 agentes</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  &ldquo;Nuestros agentes no podían traer expertos. Los clientes repetían todo 3 veces.&rdquo;
                </h3>
              </div>
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 mb-2">Solución:</p>
                <p className="text-sm text-gray-700">Zoom Contact Center + Zoom Phone</p>
              </div>
              <div className="mb-6 space-y-2">
                <p className="text-sm font-semibold text-gray-900">Resultados:</p>
                <p className="text-sm text-gray-700">✓ -40% en tiempo medio de llamada</p>
                <p className="text-sm text-gray-700">✓ +25% en satisfacción (CSAT)</p>
                <p className="text-sm text-gray-700">✓ Single-call resolution: 85%</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm italic text-gray-700">
                  &ldquo;Ahora cualquier empleado puede entrar en una llamada. Resolvemos en 2 min lo que antes tardaba 20.&rdquo;
                </p>
                <p className="text-xs text-gray-600 mt-2">— Director Operaciones</p>
              </div>
            </div>

            {/* Caso 3 */}
            <div className="bg-white rounded-xl p-8 shadow-xl">
              <div className="mb-6">
                <div className="text-sm text-orange-600 font-semibold mb-2">Despacho Profesional • 25 empleados</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  &ldquo;Nuestro operador anterior nos ignoraba. Tardaban semanas en hacer cambios simples.&rdquo;
                </h3>
              </div>
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-900 mb-2">Solución:</p>
                <p className="text-sm text-gray-700">Microsoft Teams + Telefonía + Autogestión</p>
              </div>
              <div className="mb-6 space-y-2">
                <p className="text-sm font-semibold text-gray-900">Resultados:</p>
                <p className="text-sm text-gray-700">✓ Cambios en tiempo real (antes: 2 semanas)</p>
                <p className="text-sm text-gray-700">✓ Autogestión total</p>
                <p className="text-sm text-gray-700">✓ -70% en tickets de soporte</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm italic text-gray-700">
                  &ldquo;Nosotros mismos gestionamos todo. Y cuando necesitamos ayuda, responden en minutos.&rdquo;
                </p>
                <p className="text-xs text-gray-600 mt-2">— Socio Director</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESO SIN DOLOR */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Cambiar de operador sin interrupciones
            </h2>
            <p className="text-xl text-gray-600">
              Lo hemos hecho 500 veces. Sabemos exactamente cómo hacerlo sin que tu negocio se vea afectado.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {/* Paso 1 */}
            <div className="relative">
              <div className="bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl font-bold text-orange-600">1</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Consultoría</h3>
              <p className="text-sm text-gray-600 mb-4 text-center">
                Analizamos tu situación actual e identificamos oportunidades. Propuesta personalizada.
              </p>
              <div className="text-center">
                <p className="text-xs text-orange-600 font-semibold">30 minutos • Gratuito</p>
              </div>
            </div>

            {/* Paso 2 */}
            <div className="relative">
              <div className="bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl font-bold text-orange-600">2</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Diseño</h3>
              <p className="text-sm text-gray-600 mb-4 text-center">
                Arquitectura técnica y plan de migración sin interrupciones. Presupuesto transparente.
              </p>
              <div className="text-center">
                <p className="text-xs text-orange-600 font-semibold">1 semana • Gratuito</p>
              </div>
            </div>

            {/* Paso 3 */}
            <div className="relative">
              <div className="bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl font-bold text-orange-600">3</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Migración</h3>
              <p className="text-sm text-gray-600 mb-4 text-center">
                Portabilidad de números, migración fuera de horario. Backup del sistema anterior 30 días.
              </p>
              <div className="text-center">
                <p className="text-xs text-orange-600 font-semibold">1 día • Incluido</p>
              </div>
            </div>

            {/* Paso 4 */}
            <div className="relative">
              <div className="bg-orange-100 rounded-full w-16 h-16 flex items-center justify-center mb-4 mx-auto">
                <span className="text-2xl font-bold text-orange-600">4</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">Soporte</h3>
              <p className="text-sm text-gray-600 mb-4 text-center">
                Formación a tu equipo, soporte 24/7 y optimización continua.
              </p>
              <div className="text-center">
                <p className="text-xs text-orange-600 font-semibold">Siempre • Incluido</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-20 bg-gradient-to-br from-orange-500 to-orange-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            ¿Listo para dejar de sufrir con tu operador?
          </h2>
          <p className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto text-orange-100">
            Más de 500 empresas ya lo hicieron. Y ninguna ha vuelto atrás.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link href="/contacto" className="px-8 py-4 bg-white text-orange-600 rounded-lg hover:bg-gray-100 font-semibold text-lg transition-all shadow-lg hover:shadow-xl">
              Solicitar Consultoría Gratuita
            </Link>
            <a href="tel:+34655100400" className="px-8 py-4 text-white border-2 border-white rounded-lg hover:bg-orange-600 font-semibold text-lg transition-all">
              Llamar: +34 655 100 400
            </a>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-4 text-sm text-orange-100">
            <span>Wildix • Zoom • Microsoft Teams</span>
            <span>|</span>
            <span>+25 años</span>
            <span>|</span>
            <span>500+ empresas</span>
            <span>|</span>
            <span>99.9% uptime</span>
            <span>|</span>
            <span>Soporte 24/7</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <img src="/logo_transparent.png" alt="Internet Operadores" className="h-12 mb-4" />
              <p className="text-gray-400 text-sm">
                Más de 25 años conectando empresas en España
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Soluciones</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/comunicaciones-unificadas" className="hover:text-orange-500">Comunicaciones Unificadas</Link></li>
                <li><Link href="/backup" className="hover:text-orange-500">Backup Empresarial</Link></li>
                <li><Link href="/conectividad" className="hover:text-orange-500">Conectividad</Link></li>
                <li><Link href="/ciberseguridad" className="hover:text-orange-500">Ciberseguridad</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/nosotros" className="hover:text-orange-500">Sobre nosotros</Link></li>
                <li><Link href="/casos-exito" className="hover:text-orange-500">Casos de éxito</Link></li>
                <li><Link href="/partners" className="hover:text-orange-500">Partners</Link></li>
                <li><Link href="/contacto" className="hover:text-orange-500">Contacto</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contacto</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>+34 655 100 400</li>
                <li>info@internetoperadores.com</li>
                <li>Soporte 24/7</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400">
            <p>&copy; 2026 Internet Operadores. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
