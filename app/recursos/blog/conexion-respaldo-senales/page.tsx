"use client";
import Link from 'next/link';
import EmpresaNav from '../../../../components/EmpresaNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

export default function ArticuloPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      {/* Hero del artículo */}
      <div className="pt-8 pb-12 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <Link href="/recursos/blog" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-6 group">
              <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver al Blog
            </Link>
            
            <div className="flex flex-wrap gap-3 mb-6">
              <span className="inline-flex items-center bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Conectividad
              </span>
              <span className="inline-flex items-center bg-gray-900 text-white px-4 py-2 rounded-full text-sm font-semibold">
                ⭐ DESTACADO
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              5 señales de que tu empresa necesita una conexión de respaldo
              <span className="text-orange-600"> (y cuánto te cuesta no tenerla)</span>
            </h1>
            
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 mb-8">
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                23 Enero 2026
              </span>
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                7 min lectura
              </span>
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Equipo Internet Operadores
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido del artículo */}
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-4xl mx-auto">
          
          {/* Imagen destacada */}
          <div className="relative w-full h-[300px] sm:h-[400px] lg:h-[450px] rounded-2xl overflow-hidden shadow-2xl mb-12">
            <img 
              src="/images/blog/conexion-respaldo.jpg" 
              alt="Diagrama de conexión de respaldo empresarial con backup de internet" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
          </div>

          {/* Introducción destacada */}
          <div className="bg-gradient-to-r from-orange-50 to-orange-100 border-l-4 border-orange-500 p-6 sm:p-8 rounded-r-2xl mb-12">
            <p className="text-lg sm:text-xl text-gray-700 leading-relaxed font-medium">
              En un mundo donde la conectividad es el oxígeno de los negocios, depender de una única línea de internet es como 
              conducir sin rueda de repuesto. Tarde o temprano, te quedarás tirado. Este artículo te ayudará a identificar 
              si tu empresa está en riesgo y a calcular el verdadero coste de una caída de conexión.
            </p>
          </div>

          {/* Contenido principal */}
          <article className="space-y-12">
            
            {/* El coste oculto */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                <span className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </span>
                El coste oculto de las caídas de internet
              </h2>
              
              <p className="text-gray-600 text-lg leading-relaxed">
                Puede que pienses que una pequeña interrupción de vez en cuando no es para tanto. Sin embargo, los números cuentan una historia diferente:
              </p>
              
              <div className="bg-gray-900 rounded-2xl p-6 sm:p-8 text-white">
                <div className="flex items-start gap-4">
                  <svg className="w-8 h-8 text-orange-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                  </svg>
                  <div>
                    <p className="text-xl sm:text-2xl font-medium leading-relaxed">
                      El coste medio de una caída de red puede oscilar entre los <span className="text-orange-400 font-bold">5.600€ y los 9.000€ por minuto</span>, 
                      lo que se traduce en más de <span className="text-orange-400 font-bold">300.000€ por hora</span>.
                    </p>
                    <p className="text-gray-400 mt-4 text-sm">Fuente: MEV Research, 2025</p>
                  </div>
                </div>
              </div>
              
              <p className="text-gray-600 text-lg leading-relaxed">
                Estas cifras tienen en cuenta no solo la pérdida de productividad de los empleados, sino también la pérdida de ventas, 
                el daño a la reputación de la marca y los costes de recuperación. Para una PYME, una sola caída prolongada puede tener 
                un impacto devastador en los resultados del trimestre.
              </p>
            </section>

            {/* Las 5 señales */}
            <section className="space-y-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
                🚨 Las 5 señales de que necesitas una conexión de respaldo
              </h2>

              {/* Señal 1 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-2xl font-bold text-orange-600">1</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                      Tu negocio depende de aplicaciones en la nube
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-4">
                      Si tu empresa utiliza herramientas como <strong>Microsoft 365, Google Workspace, Salesforce</strong>, o cualquier otro 
                      software como servicio (SaaS), una caída de internet significa que tus empleados no pueden trabajar.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">Microsoft 365</span>
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">Google Workspace</span>
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">Salesforce</span>
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">ERP Cloud</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Señal 2 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-2xl font-bold text-orange-600">2</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                      Usas telefonía VoIP o centralitas virtuales
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-4">
                      La telefonía IP ha revolucionado las comunicaciones empresariales, pero tiene una dependencia total de la conexión a internet. 
                      <strong className="text-red-600"> Sin internet, no hay teléfono.</strong>
                    </p>
                    <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                      <p className="text-red-700 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Para contact centers y equipos de ventas, esto es crítico
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Señal 3 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-2xl font-bold text-orange-600">3</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                      Procesas pagos online o tienes un TPV conectado
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-4">
                      Para cualquier negocio de <strong>retail, hostelería o e-commerce</strong>, la capacidad de procesar pagos es fundamental. 
                      Si tu TPV o tu pasarela de pago dependen de internet, una caída significa ventas perdidas.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-bold text-red-600">-100%</p>
                        <p className="text-gray-600 text-sm">Ventas durante la caída</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <p className="text-3xl font-bold text-orange-600">0 seg</p>
                        <p className="text-gray-600 text-sm">Paciencia del cliente</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Señal 4 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-2xl font-bold text-orange-600">4</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                      Tienes empleados que teletrabajan
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed">
                      El teletrabajo depende de que los empleados puedan acceder de forma segura a los recursos de la empresa a través de una VPN. 
                      Si la conexión de la oficina principal falla, <strong>todos tus empleados remotos quedan desconectados</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Señal 5 */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-2xl font-bold text-orange-600">5</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                      Tu sector no puede permitirse parar
                    </h3>
                    <p className="text-gray-600 text-lg leading-relaxed mb-4">
                      Hay sectores donde la conectividad es simplemente <strong>misión crítica</strong>:
                    </p>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="bg-blue-50 rounded-xl p-4 text-center">
                        <span className="text-2xl">🏭</span>
                        <p className="text-sm font-medium text-blue-700 mt-2">Industria</p>
                      </div>
                      <div className="bg-green-50 rounded-xl p-4 text-center">
                        <span className="text-2xl">🏥</span>
                        <p className="text-sm font-medium text-green-700 mt-2">Sanidad</p>
                      </div>
                      <div className="bg-purple-50 rounded-xl p-4 text-center">
                        <span className="text-2xl">🚚</span>
                        <p className="text-sm font-medium text-purple-700 mt-2">Logística</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* La solución */}
            <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 sm:p-10 text-white">
              <h2 className="text-2xl sm:text-3xl font-bold mb-6 flex items-center">
                <svg className="w-8 h-8 mr-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                La solución: Conectividad con backup automático
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Implementar una conexión de respaldo es más sencillo y asequible de lo que piensas. En Internet Operadores, 
                ofrecemos soluciones de conectividad empresarial que incluyen un sistema de <strong className="text-white">failover automático</strong>.
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-orange-400">24/7</p>
                  <p className="text-gray-300 text-sm">Monitorización</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-orange-400">&lt;30s</p>
                  <p className="text-gray-300 text-sm">Tiempo de conmutación</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-orange-400">99,99%</p>
                  <p className="text-gray-300 text-sm">Disponibilidad</p>
                </div>
              </div>
            </section>

            {/* CTA */}
            <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center shadow-xl">
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                ¿Quieres saber si tu empresa está protegida?
              </h3>
              <p className="text-orange-100 text-lg mb-8 max-w-2xl mx-auto">
                Solicita una auditoría gratuita de tu infraestructura de conectividad. 
                Analizaremos tus riesgos y te propondremos la solución más adecuada.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link 
                  href="/contacto?auditoria=conectividad" 
                  className="inline-flex items-center justify-center px-8 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Solicitar Auditoría Gratuita
                </Link>
                <a 
                  href="https://wa.me/34900123456?text=Hola,%20me%20interesa%20una%20auditoría%20de%20conectividad" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-8 py-4 bg-transparent border-2 border-white text-white rounded-xl font-bold text-lg hover:bg-white/10 transition-all"
                >
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Contactar por WhatsApp
                </a>
              </div>
            </section>

            {/* Referencias */}
            <section className="border-t border-gray-200 pt-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">Referencias</h4>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-semibold">MEV.</span> (2025). <a href="https://mev.com/blog/the-cost-of-it-downtime-in-2025-what-smbs-need-to-know" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">The Cost of IT Downtime in 2025: What SMBs Need to Know</a>.
                </li>
                <li>
                  <span className="font-semibold">Qapitol.</span> (s.f.). <a href="https://www.qapitol.com/blogs/the-true-cost-of-downtime-in-2025--and-how-qa-prevents-it" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">The True Cost of Downtime in 2025 — and How QA Prevents It</a>.
                </li>
              </ol>
            </section>

          </article>

          {/* Artículos relacionados */}
          <section className="mt-16 pt-12 border-t border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Artículos relacionados</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <Link href="/recursos/blog/mpls-vs-sdwan" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Conectividad</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    MPLS vs. SD-WAN: La batalla por el futuro de la red empresarial
                  </h4>
                </div>
              </Link>
              <Link href="/recursos/blog/wifi-empresarial-guia" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Infraestructura</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    Guía definitiva de WiFi empresarial: Más allá del router doméstico
                  </h4>
                </div>
              </Link>
            </div>
          </section>

        </div>
      </div>

      <EmpresaFooter />
    </div>
  );
}
