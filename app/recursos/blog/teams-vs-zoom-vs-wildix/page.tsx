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
              <span className="inline-flex items-center bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                </svg>
                Comunicaciones Unificadas
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Teams vs. Zoom vs. Wildix: 
              <span className="text-orange-600"> ¿Qué solución UCaaS es mejor para tu empresa?</span>
            </h1>
            
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 mb-8">
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                25 Diciembre 2025
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
              src="/images/blog/comunicaciones-unificadas.jpg" 
              alt="Equipo de trabajo colaborando en una videoconferencia" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
          </div>

          {/* Introducción destacada */}
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 border-l-4 border-purple-500 p-6 sm:p-8 rounded-r-2xl mb-12">
            <p className="text-lg sm:text-xl text-gray-700 leading-relaxed font-medium">
              Elegir la plataforma de comunicaciones unificadas adecuada puede marcar la diferencia entre un equipo productivo 
              y uno frustrado. En este análisis comparamos las tres soluciones más relevantes del mercado para ayudarte a tomar 
              la mejor decisión para tu empresa.
            </p>
          </div>

          {/* Contenido principal */}
          <article className="space-y-12">
            
            {/* Logos de las plataformas */}
            <section className="grid grid-cols-3 gap-4 sm:gap-8">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6 text-center hover:border-blue-500 transition-colors">
                <div className="w-16 h-16 mx-auto mb-3 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">🟦</span>
                </div>
                <h3 className="font-bold text-gray-900">Microsoft Teams</h3>
                <p className="text-sm text-gray-500 mt-1">El gigante corporativo</p>
              </div>
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6 text-center hover:border-blue-400 transition-colors">
                <div className="w-16 h-16 mx-auto mb-3 bg-blue-50 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">📹</span>
                </div>
                <h3 className="font-bold text-gray-900">Zoom</h3>
                <p className="text-sm text-gray-500 mt-1">El rey del vídeo</p>
              </div>
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4 sm:p-6 text-center hover:border-orange-500 transition-colors">
                <div className="w-16 h-16 mx-auto mb-3 bg-orange-100 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">🌐</span>
                </div>
                <h3 className="font-bold text-gray-900">Wildix</h3>
                <p className="text-sm text-gray-500 mt-1">El especialista B2B</p>
              </div>
            </section>

            {/* Microsoft Teams */}
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                  <span className="text-2xl text-white">T</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Microsoft Teams</h2>
              </div>
              
              <p className="text-gray-600 text-lg leading-relaxed">
                Microsoft Teams es la apuesta de Microsoft por las comunicaciones unificadas, integrado de forma nativa con 
                el ecosistema Microsoft 365. Es la opción natural para empresas que ya utilizan Word, Excel, Outlook y SharePoint.
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
                    <li>• Integración total con Microsoft 365</li>
                    <li>• Colaboración en documentos en tiempo real</li>
                    <li>• Incluido en muchas licencias empresariales</li>
                    <li>• Seguridad y compliance de nivel enterprise</li>
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
                    <li>• Curva de aprendizaje pronunciada</li>
                    <li>• Telefonía requiere licencias adicionales</li>
                    <li>• Puede ser excesivo para pequeñas empresas</li>
                    <li>• Dependencia del ecosistema Microsoft</li>
                  </ul>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <p className="text-blue-800 font-medium">
                  <strong>💡 Ideal para:</strong> Grandes empresas y corporaciones que ya utilizan Microsoft 365 y necesitan 
                  una solución integrada de colaboración y comunicación.
                </p>
              </div>
            </section>

            {/* Zoom */}
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-400 rounded-xl flex items-center justify-center">
                  <span className="text-2xl text-white">Z</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Zoom</h2>
              </div>
              
              <p className="text-gray-600 text-lg leading-relaxed">
                Zoom se convirtió en sinónimo de videoconferencia durante la pandemia. Su facilidad de uso y la calidad 
                de su vídeo lo han convertido en un estándar de facto para reuniones virtuales.
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
                    <li>• Calidad de vídeo excepcional</li>
                    <li>• Extremadamente fácil de usar</li>
                    <li>• Funciona en cualquier dispositivo</li>
                    <li>• Zoom Phone para telefonía cloud</li>
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
                    <li>• Menos integración con otras herramientas</li>
                    <li>• Preocupaciones de seguridad pasadas</li>
                    <li>• Zoom Phone tiene cobertura limitada</li>
                    <li>• Costes pueden escalar rápidamente</li>
                  </ul>
                </div>
              </div>

              <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                <p className="text-blue-800 font-medium">
                  <strong>💡 Ideal para:</strong> Empresas que priorizan la facilidad de uso y la calidad de vídeo, 
                  especialmente para reuniones con clientes externos.
                </p>
              </div>
            </section>

            {/* Wildix */}
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center">
                  <span className="text-2xl text-white">W</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Wildix</h2>
              </div>
              
              <p className="text-gray-600 text-lg leading-relaxed">
                Wildix es una plataforma UCaaS europea diseñada específicamente para el mercado B2B. Su enfoque en la 
                seguridad ("Secure by Design") y su arquitectura WebRTC la hacen única en el mercado.
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
                    <li>• Seguridad "Secure by Design"</li>
                    <li>• WebRTC nativo (sin plugins)</li>
                    <li>• Telefonía integrada de serie</li>
                    <li>• Integraciones CRM avanzadas</li>
                    <li>• Soporte local y en español</li>
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
                    <li>• Menos conocido que Teams o Zoom</li>
                    <li>• Requiere partner certificado</li>
                    <li>• Curva de aprendizaje inicial</li>
                  </ul>
                </div>
              </div>

              <div className="bg-orange-50 rounded-xl p-5 border border-orange-200">
                <p className="text-orange-800 font-medium">
                  <strong>💡 Ideal para:</strong> PYMEs y empresas medianas que buscan una solución completa con telefonía 
                  integrada, seguridad avanzada y soporte local.
                </p>
              </div>
            </section>

            {/* Tabla comparativa */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
                📊 Comparativa rápida
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse rounded-xl overflow-hidden shadow-lg">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="px-4 py-4 text-left font-semibold">Característica</th>
                      <th className="px-4 py-4 text-center font-semibold">Teams</th>
                      <th className="px-4 py-4 text-center font-semibold">Zoom</th>
                      <th className="px-4 py-4 text-center font-semibold">Wildix</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 text-gray-700 font-medium">Videoconferencia</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐</td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 font-medium">Telefonía integrada</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐⭐</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 text-gray-700 font-medium">Facilidad de uso</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐</td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 font-medium">Seguridad</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐⭐</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 text-gray-700 font-medium">Integraciones CRM</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐</td>
                      <td className="px-4 py-3 text-center">⭐⭐⭐⭐⭐</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 font-medium">Coste para PYMEs</td>
                      <td className="px-4 py-3 text-center">💰💰💰</td>
                      <td className="px-4 py-3 text-center">💰💰</td>
                      <td className="px-4 py-3 text-center">💰💰</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Conclusión */}
            <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 sm:p-10 text-white">
              <h2 className="text-2xl sm:text-3xl font-bold mb-6 flex items-center">
                <svg className="w-8 h-8 mr-3 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ¿Cuál elegir?
              </h2>
              <div className="space-y-4 text-gray-300 text-lg">
                <p>
                  <strong className="text-white">👉 Elige Teams</strong> si ya estás en el ecosistema Microsoft y necesitas 
                  colaboración avanzada en documentos.
                </p>
                <p>
                  <strong className="text-white">👉 Elige Zoom</strong> si la calidad de vídeo es tu prioridad y necesitas 
                  reuniones con participantes externos de forma sencilla.
                </p>
                <p>
                  <strong className="text-white">👉 Elige Wildix</strong> si buscas una solución completa con telefonía 
                  integrada, seguridad avanzada y soporte local en español.
                </p>
              </div>
            </section>

            {/* CTA */}
            <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center shadow-xl">
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                ¿No sabes cuál es la mejor opción para tu empresa?
              </h3>
              <p className="text-orange-100 text-lg mb-8 max-w-2xl mx-auto">
                Como partners certificados de Wildix y Zoom, podemos ayudarte a elegir e implementar 
                la solución que mejor se adapte a tus necesidades.
              </p>
              <Link 
                href="/contacto?auditoria=comunicaciones" 
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Solicitar Auditoría de Comunicaciones Gratuita
              </Link>
            </section>

            {/* Referencias */}
            <section className="border-t border-gray-200 pt-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">📚 Referencias</h4>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-semibold">Gartner.</span> (s.f.). <a href="https://www.gartner.com/reviews/market/unified-communications-as-a-service/compare/microsoft-vs-wildix" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Microsoft vs Wildix Comparison</a>. Gartner Peer Insights.
                </li>
                <li>
                  <span className="font-semibold">Nutec.</span> (s.f.). <a href="https://nutec.ca/wildix-vs-zoom-a-security-showdown/" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Wildix vs. Zoom: A Security Showdown</a>.
                </li>
                <li>
                  <span className="font-semibold">UC Today.</span> (2021). <a href="https://www.uctoday.com/unified-communications/wildix-ucc-review/" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Wildix Review - Comprehensive UC&C with Added Security</a>.
                </li>
              </ol>
            </section>

          </article>

          {/* Artículos relacionados */}
          <section className="mt-16 pt-12 border-t border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Artículos relacionados</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <Link href="/recursos/blog/tendencias-comunicaciones-2026" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Tendencias</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    5 tendencias en Comunicaciones Unificadas que marcarán 2026
                  </h4>
                </div>
              </Link>
              <Link href="/recursos/blog/conexion-respaldo-senales" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Conectividad</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    5 señales de que tu empresa necesita una conexión de respaldo
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
