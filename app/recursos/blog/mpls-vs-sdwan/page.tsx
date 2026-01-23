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
              <span className="inline-flex items-center bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                Conectividad Avanzada
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              MPLS vs. SD-WAN: 
              <span className="text-orange-600"> La batalla por el futuro de la red empresarial</span>
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
                8 min lectura
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
              src="/images/blog/mpls-sdwan.png" 
              alt="Diagrama comparando una red MPLS tradicional con una red SD-WAN flexible" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
          </div>

          {/* Introducción destacada */}
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 p-6 sm:p-8 rounded-r-2xl mb-12">
            <p className="text-lg sm:text-xl text-gray-700 leading-relaxed font-medium">
              Para las empresas con múltiples sedes, la forma de conectar sus redes es una decisión estratégica. 
              Durante años, MPLS ha sido el estándar de oro. Sin embargo, la llegada de la nube ha impulsado una nueva 
              tecnología: SD-WAN. ¿Cuál es la mejor opción para tu negocio?
            </p>
          </div>

          {/* Contenido principal */}
          <article className="space-y-12">
            
            {/* Comparativa visual de conceptos */}
            <section className="grid sm:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">🛣️</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">MPLS</h3>
                    <p className="text-gray-400 text-sm">La autopista privada</p>
                  </div>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">
                  Un circuito cerrado y exclusivo proporcionado por un operador. El tráfico no viaja por internet público.
                </p>
              </div>
              
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                    <span className="text-2xl">🧭</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">SD-WAN</h3>
                    <p className="text-orange-200 text-sm">El GPS inteligente</p>
                  </div>
                </div>
                <p className="text-orange-100 text-sm leading-relaxed">
                  Software que gestiona múltiples conexiones a la vez, eligiendo siempre la mejor ruta en tiempo real.
                </p>
              </div>
            </section>

            {/* MPLS */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                <span className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-xl">🛣️</span>
                </span>
                ¿Qué es MPLS?
              </h2>

              <p className="text-gray-600 text-lg leading-relaxed">
                Imagina el MPLS como una <strong>autopista privada y exclusiva</strong> para tu empresa. Es un circuito 
                cerrado proporcionado por un operador de telecomunicaciones que conecta tus diferentes sedes.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-green-50 rounded-xl p-5 border border-green-200">
                  <h4 className="font-bold text-green-800 mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Ventajas
                  </h4>
                  <ul className="space-y-2 text-green-700 text-sm">
                    <li>• Calidad de servicio (QoS) garantizada</li>
                    <li>• Latencia baja y predecible</li>
                    <li>• Seguridad por aislamiento</li>
                    <li>• SLAs muy estrictos</li>
                  </ul>
                </div>
                <div className="bg-red-50 rounded-xl p-5 border border-red-200">
                  <h4 className="font-bold text-red-800 mb-3 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Desventajas
                  </h4>
                  <ul className="space-y-2 text-red-700 text-sm">
                    <li>• Coste muy elevado</li>
                    <li>• Despliegue lento (semanas/meses)</li>
                    <li>• Poco flexible</li>
                    <li>• Ineficiente para la nube (hairpinning)</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* SD-WAN */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                <span className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-xl">🧭</span>
                </span>
                ¿Qué es SD-WAN?
              </h2>

              <p className="text-gray-600 text-lg leading-relaxed">
                SD-WAN es un enfoque radicalmente diferente. En lugar de depender de un único tipo de conexión, 
                utiliza <strong>software para gestionar múltiples conexiones a la vez</strong> (fibra, 5G, WIMAX, etc.), 
                incluso de diferentes proveedores.
              </p>

              <div className="bg-gray-900 rounded-2xl p-6 sm:p-8 text-white">
                <div className="flex items-start gap-4">
                  <svg className="w-8 h-8 text-orange-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                  </svg>
                  <p className="text-lg text-gray-200">
                    La principal diferencia es que MPLS es una tecnología de red subyacente, mientras que 
                    <strong className="text-orange-400"> SD-WAN es una superposición (overlay) de software</strong> que 
                    dirige el tráfico de forma inteligente sobre cualquier tipo de conexión.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-orange-500 transition-colors">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">💰</span>
                  </div>
                  <h4 className="font-bold text-gray-900">Ahorro</h4>
                  <p className="text-sm text-gray-500 mt-1">Usa banda ancha económica</p>
                </div>
                <div className="bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-orange-500 transition-colors">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">☁️</span>
                  </div>
                  <h4 className="font-bold text-gray-900">Cloud</h4>
                  <p className="text-sm text-gray-500 mt-1">Acceso directo a la nube</p>
                </div>
                <div className="bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-orange-500 transition-colors">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">⚡</span>
                  </div>
                  <h4 className="font-bold text-gray-900">Agilidad</h4>
                  <p className="text-sm text-gray-500 mt-1">Despliegue en minutos</p>
                </div>
                <div className="bg-white border-2 border-gray-200 rounded-xl p-5 text-center hover:border-orange-500 transition-colors">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">👁️</span>
                  </div>
                  <h4 className="font-bold text-gray-900">Visibilidad</h4>
                  <p className="text-sm text-gray-500 mt-1">Control centralizado</p>
                </div>
              </div>
            </section>

            {/* Tabla comparativa */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
                ⚔️ Comparativa directa
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse rounded-xl overflow-hidden shadow-lg">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="px-4 py-4 text-left font-semibold">Característica</th>
                      <th className="px-4 py-4 text-center font-semibold bg-blue-900">MPLS</th>
                      <th className="px-4 py-4 text-center font-semibold bg-orange-600">SD-WAN</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4 text-gray-700 font-medium">Tipo de Red</td>
                      <td className="px-4 py-4 text-center text-gray-600">Privada, circuito cerrado</td>
                      <td className="px-4 py-4 text-center text-gray-600">Overlay sobre cualquier red</td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-4 py-4 text-gray-700 font-medium">Coste</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-red-600 font-bold">💰💰💰 Alto</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-green-600 font-bold">💰 Bajo</span>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4 text-gray-700 font-medium">Tiempo de despliegue</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-red-600">Semanas/Meses</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-green-600">Minutos/Horas</span>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-4 py-4 text-gray-700 font-medium">Flexibilidad</td>
                      <td className="px-4 py-4 text-center">⭐⭐</td>
                      <td className="px-4 py-4 text-center">⭐⭐⭐⭐⭐</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4 text-gray-700 font-medium">Rendimiento Cloud</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-red-600">Ineficiente (hairpinning)</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-green-600">Optimizado (salida local)</span>
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-4 text-gray-700 font-medium">Seguridad</td>
                      <td className="px-4 py-4 text-center">Aislamiento físico</td>
                      <td className="px-4 py-4 text-center">Encriptación + Zero Trust</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Futuro híbrido */}
            <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 sm:p-10 text-white">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-orange-500 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">🔀</span>
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">El futuro es híbrido</h2>
                  <p className="text-gray-400">Lo mejor de ambos mundos</p>
                </div>
              </div>
              
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Aunque SD-WAN ofrece ventajas claras, <strong className="text-white">MPLS no está muerto</strong>. 
                Para aplicaciones de misión ultra-crítica que requieren SLAs muy estrictos, un circuito MPLS sigue 
                siendo la opción más fiable.
              </p>

              <div className="bg-white/10 rounded-xl p-6">
                <h4 className="font-bold text-orange-400 mb-3">💡 La estrategia inteligente:</h4>
                <p className="text-gray-200">
                  Usar un <strong>circuito MPLS para el tráfico más crítico</strong> entre sedes y complementarlo con 
                  <strong> conexiones de banda ancha gestionadas por SD-WAN</strong> para el acceso a la nube y el 
                  tráfico menos sensible.
                </p>
              </div>

              <div className="grid sm:grid-cols-3 gap-4 mt-6">
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-blue-400">MPLS</p>
                  <p className="text-gray-400 text-sm">Tráfico crítico</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-white">+</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-orange-400">SD-WAN</p>
                  <p className="text-gray-400 text-sm">Cloud y flexibilidad</p>
                </div>
              </div>
            </section>

            {/* CTA */}
            <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center shadow-xl">
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                🚀 Moderniza tu red empresarial
              </h3>
              <p className="text-orange-100 text-lg mb-8 max-w-2xl mx-auto">
                ¿Tu red actual está preparada para los desafíos de la nube y el trabajo híbrido? 
                Es el momento de explorar cómo SD-WAN puede transformar tu conectividad.
              </p>
              <Link 
                href="/contacto?auditoria=red" 
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                Solicitar Auditoría de Red Gratuita
              </Link>
            </section>

            {/* Referencias */}
            <section className="border-t border-gray-200 pt-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">📚 Referencias</h4>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-semibold">Cisco.</span> (s.f.). <a href="https://www.cisco.com/site/us/en/learn/topics/networking/what-is-the-difference-between-sd-wan-and-mpls.html" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">What Is the Difference Between SD-WAN and MPLS?</a>
                </li>
                <li>
                  <span className="font-semibold">Palo Alto Networks.</span> (s.f.). <a href="https://www.paloaltonetworks.com/cyberpedia/sd-wan-vs-mpls" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">SD-WAN vs. MPLS: Reliability, Security, Cost, and the Future</a>.
                </li>
              </ol>
            </section>

          </article>

          {/* Artículos relacionados */}
          <section className="mt-16 pt-12 border-t border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Artículos relacionados</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <Link href="/recursos/blog/conexion-respaldo-senales" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Conectividad</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    5 señales de que tu empresa necesita una conexión de respaldo
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
